import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/app/utils/firebase';
import { checkRateLimit, getClientIP } from '@/app/utils/rateLimiter';
import { logAudit } from '@/app/utils/auditLogger';

interface CartItem {
  id: string;
  quantity: number;
}

interface ValidateRequest {
  items: CartItem[];
  total: number;
  userId?: string;
}

/**
 * CRITICAL: Valida que los precios enviados desde el cliente sean correctos
 * - Obtiene precios reales de la base de datos
 * - Recalcula el total en el servidor
 * - Rechaza si hay diferencia
 */
export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const rateLimitKey = `cart-validate-${clientIP}`;
    
    const limitCheck = await checkRateLimit(rateLimitKey, {
      maxRequests: 50,
      windowMs: 60000,
    });
    
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { 
          valid: false, 
          message: 'Too many validation requests. Try again later.' 
        },
        { status: 429 }
      );
    }

    const body: ValidateRequest = await request.json();
    const { items, total, userId } = body;

    // ✅ Validación básica
    if (!items || !Array.isArray(items) || items.length === 0) {
      await logAudit('CART_VALIDATE_INVALID_ITEMS', { userId }, request, {
        status: 'failed',
        severity: 'low',
      });
      return NextResponse.json(
        { valid: false, message: 'Invalid items list' },
        { status: 400 }
      );
    }

    if (typeof total !== 'number' || total < 0) {
      await logAudit('CART_VALIDATE_INVALID_TOTAL', { userId, attemptedTotal: total }, request, {
        status: 'failed',
        severity: 'high',
      });
      return NextResponse.json(
        { valid: false, message: 'Invalid total amount' },
        { status: 400 }
      );
    }

    // 🔍 OBTENER PRECIOS REALES DE LA BASE DE DATOS
    let serverTotal = 0;
    const priceDetails: { [key: string]: { dbPrice: number; quantity: number; subtotal: number } } = {};

    try {
      // Obtener todos los productos
      const productsRef = collection(db, 'products');
      const productsSnapshot = await getDocs(productsRef);
      
      const productsMap = new Map();
      productsSnapshot.docs.forEach(doc => {
        productsMap.set(doc.id, doc.data());
      });

      // Validar cada item
      for (const item of items) {
        const product = productsMap.get(item.id);

        if (!product) {
          console.error(`❌ Producto no encontrado: ${item.id}`);
          await logAudit('CART_VALIDATE_PRODUCT_NOT_FOUND', 
            { userId, productId: item.id }, 
            request, 
            { status: 'failed', severity: 'high' }
          );
          return NextResponse.json(
            { valid: false, message: `Product ${item.id} not found in database` },
            { status: 400 }
          );
        }

        const dbPrice = product.price || 0;
        const itemQuantity = Math.max(1, Math.floor(item.quantity || 1));
        const itemSubtotal = dbPrice * itemQuantity;

        priceDetails[item.id] = {
          dbPrice,
          quantity: itemQuantity,
          subtotal: itemSubtotal
        };

        serverTotal += itemSubtotal;
      }

      // Redondear a 2 decimales
      serverTotal = Math.round(serverTotal * 100) / 100;

      // 🔐 SEGURIDAD: Comparar totales
      const difference = Math.abs(serverTotal - total);
      const maxAllowedDifference = 0.01; // 1 centavo de tolerancia para errores de redondeo

      if (difference > maxAllowedDifference) {
        console.error(`❌ PRICE MANIPULATION DETECTED:`, {
          clientTotal: total,
          serverTotal,
          difference,
          items,
          priceDetails
        });

        await logAudit('CART_VALIDATE_PRICE_MANIPULATION', 
          { 
            userId, 
            clientTotal: total, 
            serverTotal,
            difference,
            items: items.map(i => ({ id: i.id, quantity: i.quantity }))
          }, 
          request, 
          { status: 'blocked', severity: 'critical' }
        );

        return NextResponse.json(
          { 
            valid: false, 
            message: `Price mismatch detected. Client: $${total.toFixed(2)}, Server: $${serverTotal.toFixed(2)}`,
            expectedTotal: serverTotal,
            clientTotal: total
          },
          { status: 400 }
        );
      }

      // ✅ VALIDACIÓN EXITOSA
      console.log(`✅ Cart validation passed:`, {
        totalItems: items.length,
        validatedTotal: serverTotal,
        difference
      });

      await logAudit('CART_VALIDATE_SUCCESS', 
        { userId, total: serverTotal, itemCount: items.length }, 
        request, 
        { status: 'success', severity: 'low' }
      );

      return NextResponse.json({
        valid: true,
        message: 'Cart total validated successfully',
        serverTotal,
        clientTotal: total,
        difference,
        priceDetails
      });

    } catch (error) {
      console.error('Error fetching products for validation:', error);
      
      await logAudit('CART_VALIDATE_DB_ERROR', 
        { userId, error: String(error) }, 
        request, 
        { status: 'failed', severity: 'high' }
      );

      return NextResponse.json(
        { valid: false, message: 'Failed to validate cart prices' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Unexpected error in cart validation:', error);
    
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    await logAudit('CART_VALIDATE_UNEXPECTED_ERROR', 
      { error: errorMsg }, 
      request, 
      { status: 'failed', severity: 'high' }
    );

    return NextResponse.json(
      { valid: false, message: 'Unexpected validation error' },
      { status: 500 }
    );
  }
}
