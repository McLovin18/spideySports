import { NextRequest, NextResponse } from 'next/server';
import { validateOrderPrice, getProductPrice } from '@/app/services/priceValidationService';
import { isValidEmail, isValidTotal, isValidPrice } from '@/app/utils/validation';
import { logAudit, AuditHelpers, checkFraudIndicators } from '@/app/utils/auditLogger';
import type { PurchaseItem } from '@/app/services/purchaseService';

/**
 * 🔐 API ROUTE: VALIDACIÓN DE PRECIOS
 * 
 * Este endpoint valida que los precios de una orden coincidan
 * con los precios en la base de datos.
 * 
 * Se ejecuta ANTES de que PayPal capture el pago.
 */

interface ValidateOrderRequest {
  items: {
    id: string;
    quantity: number;
    price?: number; // Ignorado, se obtiene de la BD
  }[];
  total: number;
  couponCode?: string;
  userId?: string;
  quizDiscount?: number;
  quizPenalty?: number;
}

interface ValidateOrderResponse {
  valid: boolean;
  expectedTotal: number;
  receivedTotal: number;
  message?: string;
  details?: any;
  errors?: string[];
}

async function handlePost(request: NextRequest) {
  try {
    const body: ValidateOrderRequest = await request.json();
    const { items, total, couponCode, userId, quizDiscount, quizPenalty } = body;

    // ✅ VALIDAR ESTRUCTURA BÁSICA
    if (!Array.isArray(items) || items.length === 0) {
      console.log('[PAYMENT-VALIDATE] Items inválido');
      await logAudit('PAYMENT_VALIDATE_ORDER', { userId, reason: 'Invalid items array' }, request, {
        status: 'failed',
        severity: 'medium',
      });
      return NextResponse.json(
        {
          valid: false,
          expectedTotal: 0,
          receivedTotal: total,
          message: 'Items debe ser un array no vacío',
          errors: ['Items validation failed'],
        } as ValidateOrderResponse,
        { status: 400 }
      );
    }

    // ✅ VALIDAR TOTAL
    if (!isValidPrice(total)) {
      console.log('[PAYMENT-VALIDATE] Total inválido:', total);
      await AuditHelpers.logPriceValidationFailed(userId ? { userId, total } : { total }, request);
      return NextResponse.json(
        {
          valid: false,
          expectedTotal: 0,
          receivedTotal: total,
          message: 'Total debe ser un número válido positivo',
          errors: ['Total validation failed'],
        } as ValidateOrderResponse,
        { status: 400 }
      );
    }

    // ✅ VALIDAR CADA ITEM
    for (const item of items) {
      if (!item.id || typeof item.id !== 'string') {
        console.log('[PAYMENT-VALIDATE] ID de item inválido', item);
        await logAudit('PAYMENT_VALIDATE_ORDER', { userId, reason: 'Invalid item ID' }, request, {
          status: 'failed',
          severity: 'medium',
        });
        return NextResponse.json(
          {
            valid: false,
            expectedTotal: 0,
            receivedTotal: total,
            message: 'Todos los items deben tener un ID válido',
            errors: ['Item ID validation failed'],
          } as ValidateOrderResponse,
          { status: 400 }
        );
      }

      if (typeof item.quantity !== 'number' || item.quantity < 1 || item.quantity > 1000) {
        console.log('[PAYMENT-VALIDATE] Cantidad inválida', item.quantity);
        await logAudit('PAYMENT_VALIDATE_ORDER', { userId, reason: 'Invalid quantity' }, request, {
          status: 'failed',
          severity: 'medium',
        });
        return NextResponse.json(
          {
            valid: false,
            expectedTotal: 0,
            receivedTotal: total,
            message: 'La cantidad debe estar entre 1 y 1000',
            errors: ['Quantity validation failed'],
          } as ValidateOrderResponse,
          { status: 400 }
        );
      }
    }

    // ✅ VALIDAR EMAIL SI ES PROPORCIONADO
    if (body.email) {
      const emailValidation = isValidEmail(body.email);
      if (!emailValidation.valid) {
        console.log('[PAYMENT-VALIDATE] Email inválido:', emailValidation.reason);
        await logAudit('PAYMENT_VALIDATE_ORDER', { email: body.email, reason: emailValidation.reason }, request, {
          status: 'failed',
          severity: 'low',
        });
        return NextResponse.json(
          {
            valid: false,
            expectedTotal: 0,
            receivedTotal: total,
            message: emailValidation.reason || 'Email inválido',
            errors: ['Email validation failed'],
          } as ValidateOrderResponse,
          { status: 400 }
        );
      }

      // ✅ DETECTAR FRAUDE
      const fraudCheck = await checkFraudIndicators(body.email, '', 'PAYMENT_ATTEMPT');
      if (fraudCheck.suspicious) {
        console.warn('[PAYMENT-VALIDATE] Fraude detectado:', { email: body.email, score: fraudCheck.score });
        await logAudit('PAYMENT_VALIDATE_FRAUD', 
          { email: body.email, fraudScore: fraudCheck.score }, 
          request, 
          {
            status: 'blocked',
            severity: 'critical',
          }
        );
        return NextResponse.json(
          {
            valid: false,
            expectedTotal: 0,
            receivedTotal: total,
            message: 'La transacción no pudo ser procesada. Contacta con soporte.',
            errors: ['Fraud detected'],
          } as ValidateOrderResponse,
          { status: 403 }
        );
      }
    }

    // 2. Convertir items al formato esperado
    const purchaseItems: PurchaseItem[] = items.map((item) => ({
      id: item.id,
      name: '', // No lo necesitamos para validación de precio
      price: 0, // Será obtenido de la BD
      quantity: item.quantity,
      image: '',
    }));

    // 3. EJECUTAR VALIDACIÓN
    const validation = await validateOrderPrice(
      purchaseItems,
      total,
      couponCode,
      userId,
      quizDiscount,
      quizPenalty
    );

    // 4. RETORNAR RESULTADO
    const response: ValidateOrderResponse = {
      valid: validation.valid,
      expectedTotal: validation.expectedTotal,
      receivedTotal: validation.receivedTotal,
      details: {
        subtotal: validation.details.subtotal,
        couponDiscount: validation.details.couponDiscount,
        quizDiscount: validation.details.quizDiscount,
        quizPenalty: validation.details.quizPenalty,
        difference: validation.difference,
      },
    };

    if (!validation.valid) {
      response.message = `Discrepancia de precio detectada. Total esperado: $${validation.expectedTotal}, Total pagado: $${total}`;
      response.errors = validation.errors;

      console.error('❌ ALERTA DE SEGURIDAD: Intento de manipulación de precio detectado', {
        expectedTotal: validation.expectedTotal,
        receivedTotal: total,
        userId,
        timestamp: new Date().toISOString(),
      });

      await logAudit('PAYMENT_VALIDATE_PRICE_MISMATCH', 
        { 
          userId, 
          expectedTotal: validation.expectedTotal, 
          receivedTotal: total,
          difference: validation.difference 
        }, 
        request, 
        {
          status: 'failed',
          severity: 'critical',
        }
      );

      return NextResponse.json(response, { status: 400 });
    }

    console.log(`✅ Orden validada correctamente para usuario: ${userId || 'guest'}`);
    
    await logAudit('PAYMENT_VALIDATE_SUCCESS', 
      { userId, total, itemCount: items.length }, 
      request, 
      {
        status: 'success',
        severity: 'low',
      }
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('❌ Error en validación de precio:', error);

    await logAudit('PAYMENT_VALIDATE_ERROR', 
      { error: String(error) }, 
      request, 
      {
        status: 'failed',
        severity: 'high',
      }
    );

    return NextResponse.json(
      {
        valid: false,
        expectedTotal: 0,
        receivedTotal: 0,
        message: 'Error al validar el precio de la orden',
        errors: [error instanceof Error ? error.message : 'Error desconocido'],
      } as ValidateOrderResponse,
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return handlePost(request);
}
