/* eslint-disable @typescript-eslint/no-unused-vars */
import { db } from '../utils/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { couponService } from './couponService';
import { inventoryService } from './inventoryService';
import type { PurchaseItem } from './purchaseService';

/**
 * 🔐 SERVICIO DE VALIDACIÓN DE PRECIOS
 * 
 * Este servicio RECALCULA el precio total desde la base de datos
 * para prevenir manipulación de precios desde el navegador.
 * 
 * NO CONFÍA en los precios que envía el cliente.
 */

interface PriceValidationResult {
  valid: boolean;
  expectedTotal: number;
  receivedTotal: number;
  difference: number;
  errors: string[];
  details: {
    subtotal: number;
    couponDiscount: number;
    quizDiscount: number;
    quizPenalty: number;
  };
}

/**
 * Obtiene el precio de un producto desde la base de datos
 */
export const getProductPrice = async (productId: number): Promise<number | null> => {
  try {
    const docRef = doc(db, 'inventory', productId.toString());
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.error(`❌ Producto ${productId} no encontrado en la BD`);
      return null;
    }

    const data = docSnap.data();
    const price = data?.price;

    if (typeof price !== 'number' || price < 0) {
      console.error(`❌ Precio inválido para producto ${productId}:`, price);
      return null;
    }

    return price;
  } catch (error) {
    console.error(`❌ Error obteniendo precio del producto ${productId}:`, error);
    return null;
  }
};

/**
 * Calcula el subtotal basado en los precios de la base de datos
 */
const calculateSubtotal = async (items: PurchaseItem[]): Promise<{ subtotal: number; errors: string[] }> => {
  let subtotal = 0;
  const errors: string[] = [];

  for (const item of items) {
    const price = await getProductPrice(parseInt(item.id));

    if (price === null) {
      errors.push(`No se pudo verificar el precio del producto ${item.id}`);
      continue;
    }

    // Usar el precio de la BD, NO el del cliente
    const itemTotal = price * item.quantity;
    subtotal += itemTotal;

    console.log(`✅ Producto ${item.id}: $${price} x ${item.quantity} = $${itemTotal}`);
  }

  return { subtotal, errors };
};

/**
 * Obtiene y valida un cupón si fue aplicado
 */
const validateCouponDiscount = async (
  couponCode?: string,
  userId?: string,
  subtotal?: number
): Promise<{ discount: number; errors: string[]; isValid: boolean }> => {
  const errors: string[] = [];

  if (!couponCode) {
    return { discount: 0, errors: [], isValid: true };
  }

  if (!userId) {
    errors.push('No se puede validar cupón sin usuario autenticado');
    return { discount: 0, errors, isValid: false };
  }

  try {
    // Obtener el cupón desde BD
    const coupon = await couponService.getCouponByCode(couponCode);

    if (!coupon) {
      errors.push(`Cupón no encontrado: ${couponCode}`);
      return { discount: 0, errors, isValid: false };
    }

    // Validar que pertenece al usuario
    if (coupon.userId !== userId) {
      errors.push('El cupón no pertenece a este usuario');
      return { discount: 0, errors, isValid: false };
    }

    // Validar que está activo y no fue usado
    if (!coupon.isActive || coupon.used) {
      errors.push('El cupón está inactivo o ya fue usado');
      return { discount: 0, errors, isValid: false };
    }

    // Validar fecha de expiración si existe
    if (coupon.expiryDate) {
      const expiryTime = new Date(coupon.expiryDate).getTime();
      if (Date.now() > expiryTime) {
        errors.push('El cupón ha expirado');
        return { discount: 0, errors, isValid: false };
      }
    }

    // Calcular descuento
    const discountPercent = coupon.discountPercent || 0;
    const discount = subtotal ? Math.round((subtotal * discountPercent) / 100 * 100) / 100 : 0;

    console.log(`✅ Cupón validado: ${couponCode}, Descuento: ${discountPercent}% = $${discount}`);

    return { discount, errors: [], isValid: true };
  } catch (error) {
    errors.push(`Error validando cupón: ${error instanceof Error ? error.message : 'error desconocido'}`);
    return { discount: 0, errors, isValid: false };
  }
};

/**
 * VALIDACIÓN PRINCIPAL
 * 
 * Compara el total pagado por el cliente contra el total correcto calculado desde la BD
 */
export const validateOrderPrice = async (
  items: PurchaseItem[],
  paidTotal: number,
  couponCode?: string,
  userId?: string,
  quizDiscount?: number,
  quizPenalty?: number
): Promise<PriceValidationResult> => {
  const errors: string[] = [];
  const details = {
    subtotal: 0,
    couponDiscount: 0,
    quizDiscount: quizDiscount || 0,
    quizPenalty: quizPenalty || 0,
  };

  // 0. VALIDACIONES BÁSICAS DE SEGURIDAD
  console.log('🔍 Ejecutando validaciones de seguridad...');
  
  // Validar que no hay cantidades negativas o sospechosas
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      errors.push(`❌ Cantidad inválida para producto ${item.id}: ${item.quantity}`);
    }
    if (item.quantity > 999) {
      errors.push(`⚠️ Cantidad sospechosamente alta para producto ${item.id}: ${item.quantity}`);
    }
  }

  // Validar que el total pagado no es negativo
  if (paidTotal < 0) {
    errors.push('❌ El total pagado no puede ser negativo');
  }

  // Validar rango razonable de quiz discount/penalty
  const quiz_discount = quizDiscount || 0;
  const quiz_penalty = quizPenalty || 0;
  
  if (quiz_discount < 0 || quiz_discount > 100) {
    errors.push(`❌ Quiz discount inválido: ${quiz_discount}% (debe estar entre 0-100%)`);
  }
  
  if (quiz_penalty < 0 || quiz_penalty > 1000) { // Penalidad máxima $1000
    errors.push(`❌ Quiz penalty inválido: $${quiz_penalty} (debe estar entre $0-$1000)`);
  }

  // Si hay errores de validación básica, rechazar inmediatamente
  if (errors.length > 0) {
    console.error('🚨 [SEGURIDAD] Validaciones básicas fallaron:', errors);
    return {
      valid: false,
      expectedTotal: 0,
      receivedTotal: paidTotal,
      difference: 0,
      errors,
      details,
    };
  }

  // 1. CALCULAR SUBTOTAL DESDE LA BD
  console.log('🔍 Validando precios...');
  const { subtotal, errors: subtotalErrors } = await calculateSubtotal(items);
  details.subtotal = subtotal;
  errors.push(...subtotalErrors);

  if (errors.length > 0) {
    return {
      valid: false,
      expectedTotal: 0,
      receivedTotal: paidTotal,
      difference: 0,
      errors,
      details,
    };
  }

  // 2. VALIDAR CUPÓN SI EXISTE
  const { discount: couponDiscount, errors: couponErrors, isValid: couponValid } = await validateCouponDiscount(
    couponCode,
    userId,
    subtotal
  );
  details.couponDiscount = couponDiscount;

  if (!couponValid) {
    errors.push(...couponErrors);
    return {
      valid: false,
      expectedTotal: 0,
      receivedTotal: paidTotal,
      difference: 0,
      errors,
      details,
    };
  }

  // 3. CALCULAR TOTAL ESPERADO
  // Total = subtotal - cupón - quiz_descuento + quiz_penalidad
  const baseAfterCoupon = subtotal - couponDiscount;
  const expectedTotal = Math.round((baseAfterCoupon - (quizDiscount || 0) + (quizPenalty || 0)) * 100) / 100;

  // 4. COMPARAR CON LO PAGADO
  const tolerance = 0.01; // Tolerancia de $0.01 para diferencias de redondeo
  const difference = Math.abs(expectedTotal - paidTotal);
  const valid = difference <= tolerance;

  console.log(`\n💰 VALIDACIÓN DE PRECIO:`);
  console.log(`   Subtotal:           $${subtotal}`);
  console.log(`   Descuento cupón:    -$${couponDiscount}`);
  console.log(`   Descuento quiz:     -$${quizDiscount || 0}`);
  console.log(`   Penalidad quiz:     +$${quizPenalty || 0}`);
  console.log(`   Total esperado:     $${expectedTotal}`);
  console.log(`   Total pagado:       $${paidTotal}`);
  console.log(`   Diferencia:         $${difference}`);
  console.log(`   ✅ Válido:           ${valid}`);

  if (!valid) {
    errors.push(
      `Discrepancia de precio: Se esperaba $${expectedTotal} pero se pagó $${paidTotal}. ` +
      `Diferencia: $${difference}`
    );
  }

  return {
    valid,
    expectedTotal,
    receivedTotal: paidTotal,
    difference,
    errors,
    details,
  };
};

/**
 * Versión simplificada para validación rápida sin cupones/quiz
 */
export const quickValidatePrice = async (
  items: PurchaseItem[],
  paidTotal: number
): Promise<{ valid: boolean; expectedTotal: number; error?: string }> => {
  const result = await validateOrderPrice(items, paidTotal);

  return {
    valid: result.valid,
    expectedTotal: result.expectedTotal,
    error: result.errors.length > 0 ? result.errors.join('; ') : undefined,
  };
};
