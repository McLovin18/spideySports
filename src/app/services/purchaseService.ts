'use client';

import { db } from '../utils/firebase';
import { collection, addDoc, getDoc, getDocs, query, orderBy, deleteDoc, doc, setDoc, updateDoc, arrayUnion, increment, runTransaction } from 'firebase/firestore';
import { auth } from '../utils/firebase';
import { SecureLogger } from '../utils/security';
import { inventoryService } from './inventoryService';
import { couponService } from './couponService';
import { userNotificationService } from './userNotificationService';
import { createDeliveryOrder } from './deliveryService';
import { type JerseySizeCode } from '../constants/jersey';

// 🔧 Eliminar valores undefined antes de enviar datos a Firestore
export const sanitizeForFirestore = (value: any): any => {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeForFirestore(item))
      .filter((item) => item !== undefined);
  }

  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, any> = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (entry === undefined) {
        return;
      }
      const sanitizedValue = sanitizeForFirestore(entry);
      if (sanitizedValue !== undefined) {
        sanitized[key] = sanitizedValue;
      }
    });
    return sanitized;
  }

  return value === undefined ? undefined : value;
};

const findUndefinedPath = (value: any, currentPath: string[] = []): string | null => {
  if (value === undefined) {
    return currentPath.join('.') || '(root)';
  }

  if (value === null || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const result = findUndefinedPath(value[index], [...currentPath, String(index)]);
      if (result) {
        return result;
      }
    }
    return null;
  }

  for (const [key, entry] of Object.entries(value)) {
    const result = findUndefinedPath(entry, [...currentPath, key]);
    if (result) {
      return result;
    }
  }

  return null;
};

// Definición de tipos
export interface PurchaseItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  sizeCode?: JerseySizeCode;
  sizeLabel?: string;
  versionId?: string;
  versionLabel?: string;
}

export interface PricingAdjustments {
  coupon?: number;
  quizDiscount?: number;
  quizPenalty?: number;
}

export interface TriviaResultSummary {
  question: string;
  result: 'correct' | 'incorrect';
  discountApplied?: boolean;
  discountAmount?: number;
  penaltyAmount?: number;
}

export interface Purchase {
  id?: string;
  purchaseId?: string;
  userId: string;
  date: string;
  items: PurchaseItem[];
  total: number;
  customerCode?: string; // ID de cliente de 7 dígitos
  orderNumber?: string;  // ID de pedido por cliente (5 dígitos)
  fullOrderId?: string;  // ID global: customerCode + orderNumber
  couponCode?: string;   // Código del cupón aplicado (para validación)
  pricingAdjustments?: PricingAdjustments;
  triviaResult?: TriviaResultSummary;
}

export interface DailyOrder {
  id: string;
  userId: string;
  userName?: string; // Opcional para compatibilidad con pedidos existentes
  userEmail?: string; // Opcional: email del usuario
  date: string;
  guestCheckout?: boolean; // ✅ agregado
  items: PurchaseItem[];
  total: number;
  orderTime: string;
  customerCode?: string;
  orderNumber?: string;
  fullOrderId?: string;
  pricingAdjustments?: PricingAdjustments;
  triviaResult?: TriviaResultSummary;
}

export interface DailyOrdersDocument {
  date: string; // YYYY-MM-DD
  dateFormatted: string;
  orders: DailyOrder[];
  totalOrdersCount: number;
  totalDayAmount: number;
  createdAt: string;
  lastUpdated: string;
}

// Colección de compras en Firestore (ahora como subcolección por usuario)
// const PURCHASES_COLLECTION = 'purchases';

// Formatea un número con ceros a la izquierda
const formatWithLeadingZeros = (num: number, length: number) => {
  return num.toString().padStart(length, '0');
};

interface CustomerOrderIds {
  customerCode: string;
  orderNumber: string;
  fullOrderId: string;
}

// Obtiene (o crea) el ID de cliente y el siguiente número de pedido para ese cliente
const getOrCreateCustomerOrderIds = async (userEmail: string): Promise<CustomerOrderIds> => {
  const normalizedEmail = userEmail.toLowerCase();
  const countersRef = doc(db, 'system', 'counters');
  const userRef = doc(db, 'users', normalizedEmail);

  return runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    let customerCode: string;
    let lastOrderSeq = 0;

    if (userSnap.exists()) {
      const data = userSnap.data() as any;

      if (data.customerCode) {
        customerCode = data.customerCode as string;
      } else {
        const countersSnap = await tx.get(countersRef);
        const countersData = (countersSnap.exists() ? countersSnap.data() : {}) as any;
        const lastCustomer = typeof countersData.lastCustomerCode === 'number' ? countersData.lastCustomerCode : 0;
        const nextCustomer = lastCustomer + 1;
        customerCode = formatWithLeadingZeros(nextCustomer, 7);
        tx.set(countersRef, { lastCustomerCode: nextCustomer }, { merge: true });
      }

      if (typeof data.lastOrderSeq === 'number') {
        lastOrderSeq = data.lastOrderSeq;
      }
    } else {
      const countersSnap = await tx.get(countersRef);
      const countersData = (countersSnap.exists() ? countersSnap.data() : {}) as any;
      const lastCustomer = typeof countersData.lastCustomerCode === 'number' ? countersData.lastCustomerCode : 0;
      const nextCustomer = lastCustomer + 1;
      customerCode = formatWithLeadingZeros(nextCustomer, 7);
      tx.set(countersRef, { lastCustomerCode: nextCustomer }, { merge: true });
    }

    const nextOrderSeq = (lastOrderSeq || 0) + 1;
    if (nextOrderSeq > 1000) {
      throw new Error('Este cliente ha alcanzado el máximo de 1000 pedidos permitidos.');
    }

    const orderNumber = formatWithLeadingZeros(nextOrderSeq, 5);
    const fullOrderId = `${customerCode}${orderNumber}`;

    tx.set(
      userRef,
      {
        customerCode,
        lastOrderSeq: nextOrderSeq,
      },
      { merge: true }
    );

    return { customerCode, orderNumber, fullOrderId };
  });
};

/**
 * Valida los datos de una compra antes de guardarla
 */
function validatePurchase(purchase: Omit<Purchase, 'id'>) {
  if (!purchase.userId || typeof purchase.userId !== 'string') {
    throw new Error('El userId es requerido y debe ser un string.');
  }
  if (!Array.isArray(purchase.items) || purchase.items.length === 0) {
    throw new Error('La compra debe tener al menos un producto.');
  }
  purchase.items.forEach((item, idx) => {
    if (!item.id || !item.name || typeof item.price !== 'number' || typeof item.quantity !== 'number' || !item.image) {
      throw new Error(`El producto en la posición ${idx} no es válido.`);
    }
  });
  if (typeof purchase.total !== 'number' || purchase.total < 0) {
    throw new Error('El total debe ser un número mayor o igual a 0.');
  }
}

/**
 * Guarda una nueva compra en Firestore en la subcolección del usuario
 * Y también intenta guardarla en la colección diaria de pedidos para fácil visualización (opcional)
 */


export const savePurchase = async (
  purchase: Omit<Purchase, 'id'>,
  userName?: string,
  userEmail?: string
): Promise<string> => {
  try {
    validatePurchase(purchase);

    // 🔐 VALIDACIÓN DE SEGURIDAD: Recalcular total desde la BD
    console.log('🔒 [savePurchase] Ejecutando validación final de precio...');
    const { validateOrderPrice } = await import('./priceValidationService');
    
    // Convertir items al formato necesario
    const purchaseItems = purchase.items.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price, // Será ignorado, se obtiene de la BD
      quantity: item.quantity,
      image: item.image,
    }));

    // Ejecutar validación
    const priceValidation = await validateOrderPrice(
      purchaseItems,
      purchase.total,
      purchase.couponCode,
      purchase.userId,
      (purchase.pricingAdjustments as any)?.quizDiscount,
      (purchase.pricingAdjustments as any)?.quizPenalty
    );

    // Rechazar si hay discrepancia
    if (!priceValidation.valid) {
      const errorMsg = `🚨 ALERTA DE SEGURIDAD: Intento de manipular precio detectado. ` +
        `Total esperado: $${priceValidation.expectedTotal}, ` +
        `Total recibido: $${priceValidation.receivedTotal}. ` +
        `Errores: ${priceValidation.errors.join('; ')}`;
      
      console.error(errorMsg);
      console.error('Usuario potencialmente fraudulento:', {
        userId: purchase.userId,
        email: userEmail,
        timestamp: new Date().toISOString(),
        details: priceValidation,
      });

      throw new Error(
        `Validación de precio fallida. Por favor contacta al soporte: ${priceValidation.errors[0] || 'Error desconocido'}`
      );
    }

    console.log('✅ [savePurchase] Validación de precio completada exitosamente');

    const currentDate = new Date();
    const dateString = purchase.date || currentDate.toISOString();
    const dayKey = currentDate.toISOString().split('T')[0];

    const currentUser = auth.currentUser;
    const isGuest = !currentUser;
    const finalUserId = isGuest ? 'guest' : purchase.userId;

    // 🔍 DIAGNÓSTICO: Log del estado de autenticación
    console.log('🔍 [savePurchase] Estado de autenticación:');
    console.log('   - currentUser:', currentUser ? 'existe' : 'null');
    console.log('   - isGuest:', isGuest);
    console.log('   - finalUserId:', finalUserId);
    console.log('   - purchase.userId:', purchase.userId);
    console.log('   - userEmail:', userEmail);

    // Generar IDs legibles de cliente/pedido (solo para usuarios autenticados con email)
    let customerCode: string | undefined;
    let orderNumber: string | undefined;
    let fullOrderId: string | undefined;

    if (!isGuest && userEmail) {
      try {
        const ids = await getOrCreateCustomerOrderIds(userEmail);
        customerCode = ids.customerCode;
        orderNumber = ids.orderNumber;
        fullOrderId = ids.fullOrderId;
      } catch (e) {
        console.warn('No se pudo generar ID amigable de pedido (contador central):', e);

        // 🔄 Fallback determinístico basado en el UID/email para no depender de reglas extra
        try {
          const baseId = purchase.userId || userEmail;
          if (baseId) {
            let hash = 0;
            for (let i = 0; i < baseId.length; i++) {
              hash = (hash * 31 + baseId.charCodeAt(i)) >>> 0;
            }

            const numericCode = (hash % 9_999_999) + 1; // rango 1..9_999_999
            customerCode = formatWithLeadingZeros(numericCode, 7);

            const seq = (Date.now() % 100_000) || 1; // 00001..99999
            orderNumber = formatWithLeadingZeros(seq, 5);
            fullOrderId = `${customerCode}${orderNumber}`;
          }
        } catch (fallbackError) {
          console.warn('Fallback de ID amigable también falló:', fallbackError);
        }
      }
    }

    // Reducir inventario
    await inventoryService.processOrder(
      purchase.items.map(item => ({
        productId: parseInt(item.id),
        quantity: item.quantity,
        sizeCode: item.sizeCode,
        versionId: item.versionId
      }))
    );

    // Guardar compra principal
    const purchaseRef = isGuest
      ? collection(db, 'guestPurchases')
      : collection(db, `users/${purchase.userId}/purchases`);

    const tempDocRef = doc(purchaseRef);
    const purchaseId = tempDocRef.id;

    const purchaseDocData: any = {
      ...purchase,
      userId: finalUserId,
      guestCheckout: isGuest,
      date: dateString,
      purchaseId,
    };

    // Solo agregar estos campos si existen para evitar valores undefined en Firestore
    if (customerCode) purchaseDocData.customerCode = customerCode;
    if (orderNumber) purchaseDocData.orderNumber = orderNumber;
    if (fullOrderId) purchaseDocData.fullOrderId = fullOrderId;

    const sanitizedPurchaseDocData = sanitizeForFirestore(purchaseDocData);

    if (process.env.NODE_ENV !== 'production') {
      const undefinedPath = findUndefinedPath(sanitizedPurchaseDocData);
      if (undefinedPath) {
        console.warn('[savePurchase] Datos contienen undefined tras sanitizar en', undefinedPath);
      }
    }

    await setDoc(tempDocRef, sanitizedPurchaseDocData);

    // Guardar en dailyOrders solo si hay usuario autenticado
    if (!isGuest) {
      try {
        const dailyOrderRef = doc(db, `dailyOrders/${dayKey}`);

        const orderData: DailyOrder = {
          id: purchaseId,
          userId: finalUserId,
          guestCheckout: isGuest,
          userName: userName || (userEmail ? userEmail.split('@')[0] : undefined),
          userEmail: userEmail || undefined,
          date: dateString,
          items: purchase.items,
          total: purchase.total,
          orderTime: currentDate.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          ...(customerCode ? { customerCode } : {}),
          ...(orderNumber ? { orderNumber } : {}),
          ...(fullOrderId ? { fullOrderId } : {}),
          ...(purchase.pricingAdjustments ? { pricingAdjustments: purchase.pricingAdjustments } : {}),
          ...(purchase.triviaResult ? { triviaResult: purchase.triviaResult } : {}),
        };

        const sanitizedOrderData = sanitizeForFirestore(orderData);

        if (process.env.NODE_ENV !== 'production') {
          const undefinedPath = findUndefinedPath(sanitizedOrderData);
          if (undefinedPath) {
            console.warn('[savePurchase] dailyOrder contiene undefined tras sanitizar en', undefinedPath);
          }
        }

        await setDoc(
          dailyOrderRef,
          {
            date: dayKey, // CRÍTICO: Campo requerido para orderBy('date')
            dateFormatted: currentDate.toLocaleDateString('es-ES'),
            orders: arrayUnion(sanitizedOrderData),
            totalOrdersCount: increment(1),
            totalDayAmount: increment(purchase.total),
            createdAt: currentDate.toISOString(),
            lastUpdated: currentDate.toISOString()
          },
          { merge: true }
        );
      } catch (dailyError) {
        console.error('❌ [savePurchase] Error guardando en dailyOrders:', dailyError);
      }
    }

    // 🎁 Generar cupones automáticos para clientes frecuentes (si está activo)
    if (!isGuest) {
      try {
        const autoConfig = await couponService.getAutoConfig();
        if (autoConfig && autoConfig.isActive && autoConfig.orderMultiple > 0) {
          const userPurchases = await getUserPurchases(finalUserId);
          const totalOrdersForUser = userPurchases.length;
          const multiple = autoConfig.orderMultiple;

          if (totalOrdersForUser >= multiple) {
            const earnedCoupons = Math.floor(totalOrdersForUser / multiple);

            const existingCoupons = await couponService.listUserCoupons(finalUserId);
            const existingAutoForMultiple = existingCoupons.filter((c) => c.source === 'auto' && c.autoMultiple === multiple).length;

            const missingCoupons = earnedCoupons - existingAutoForMultiple;

            if (missingCoupons > 0) {
              for (let i = 0; i < missingCoupons; i++) {
                const coupon = await couponService.createCouponForUser({
                  userId: finalUserId,
                  discountPercent: autoConfig.discountPercent,
                  source: 'auto',
                  autoMultiple: multiple,
                });

                await userNotificationService.createCouponNotification({
                  userId: finalUserId,
                  userEmail,
                  couponCode: coupon.code,
                  discountPercent: coupon.discountPercent,
                  source: 'auto',
                });
              }
            }
          }
        }
      } catch (couponError) {
        console.warn('No se pudo generar cupón automático para el usuario:', couponError);
      }
    }

    // 🚚 CREAR ORDEN DE DELIVERY AUTOMÁTICAMENTE
    try {
      console.log('🚚 Creando orden de delivery automáticamente...');
      
      const deliveryOrderData = {
        userId: finalUserId,
        items: purchase.items,
        total: purchase.total,
        date: dateString,
        shipping: purchase.shipping,
        paypalDetails: purchase.paypalDetails || {},
        fullOrderId: fullOrderId,
        customerCode: customerCode,
        orderNumber: orderNumber
      };
      
      const finalUserName = userName || 'Cliente';
      const finalUserEmail = userEmail || (isGuest ? 'guest@localhost' : purchase.userEmail || 'unknown@localhost');
      
      const deliveryOrderId = await createDeliveryOrder(
        deliveryOrderData, 
        finalUserName, 
        finalUserEmail, 
        purchaseId
      );
      
      console.log(`✅ Orden de delivery creada automáticamente: ${deliveryOrderId}`);
      
    } catch (deliveryError) {
      console.error('❌ Error creando orden de delivery (compra guardada exitosamente):', deliveryError);
      // No lanzar error ya que la compra se guardó correctamente
    }

    return purchaseId;
  } catch (error: any) {
    console.error('Error en savePurchase:', error);
    // Lanzar un mensaje más específico para el front
    throw new Error(error.message || 'Error desconocido al guardar la compra');
  }
};





/**
 * Obtiene todas las compras de un usuario desde la subcolección
 */
export const getUserPurchases = async (userId: string): Promise<Purchase[]> => {
  try {
    const q = query(
      collection(db, `users/${userId}/purchases`),
      orderBy('date', 'desc')
    );
    const querySnapshot = await getDocs(q);
    const purchases: Purchase[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as Omit<Purchase, 'id'>;
      purchases.push({
        id: doc.id, // Usar el ID del documento como ID principal
        purchaseId: data.purchaseId || doc.id, // Mantener purchaseId si existe
        ...data,
      });
    });
    return purchases;
  } catch (error) {
    console.error('Error al obtener las compras del usuario:', error);
    throw error;
  }
};

/**
 * Elimina todas las compras de un usuario
 */
export const clearUserPurchases = async (userId: string): Promise<void> => {
  try {
    const q = query(
      collection(db, `users/${userId}/purchases`)
    );
    
    const querySnapshot = await getDocs(q);
    
    const deletePromises = querySnapshot.docs.map((doc) => {
      return deleteDoc(doc.ref);
    });
    
    await Promise.all(deletePromises);
  } catch (error) {
    console.error('Error al eliminar las compras del usuario:', error);
    throw error;
  }
};

/**
 * Función de compatibilidad para migrar compras de localStorage a Firestore
 */
// (Eliminada: ahora solo se usa Firestore para compras)

// --- FAVORITOS FIRESTORE ---

/**
 * Agrega un producto a favoritos del usuario en Firestore
 */
export const addFavourite = async (userId: string, product: {
  id: string | number;
  name: string;
  price: number;
  image: string;
  description?: string;
}) => {
  if (!userId) return;
  if (!product.image) {
    product.image = "/images/product1.svg"; // imagen fallback
  }
  const favRef = doc(db, `users/${userId}/favourites/${product.id}`);
  await setDoc(favRef, product);
};


export const removeFavourite = async (userId: string, productId: string | number) => {
  if (!userId || !productId) return;
  const favRef = doc(db, `users/${userId}/favourites/${productId}`);
  await deleteDoc(favRef);
};

export const getUserFavourites = async (userId: string) => {
  if (!userId) return [];
  const favsCol = collection(db, `users/${userId}/favourites`);
  const snapshot = await getDocs(favsCol); // 🔥 siempre lee del servidor
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

// --- COMENTARIOS DE PRODUCTO EN FIRESTORE ---

/**
 * Agrega un comentario a un producto en Firestore
 */
export const addProductComment = async (
  productId: string | number,
  comment: { 
    name: string; 
    text: string; 
    date: string; 
    rating: number; 
    replies: any[],
    photoURL?: string
  }
) => {
  if (!productId || !comment?.text) throw new Error("productId y comentario requeridos");
  
  // ✅ VERIFICAR AUTENTICACIÓN Y AGREGAR userId
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Usuario no autenticado');
  }
  
  // ✅ Agregar userId al comentario
  const commentWithUserId = {
    ...comment,
    userId: currentUser.uid
  };
  
  const commentsCol = collection(db, `products/${productId}/comments`);
  await addDoc(commentsCol, commentWithUserId);
};




/**
 * Obtiene todos los comentarios de un producto desde Firestore, ordenados por fecha descendente
 */
export const getProductComments = async (productId: string | number) => {
  if (!productId) return [];
  const commentsCol = collection(db, `products/${productId}/comments`);
  const q = query(commentsCol, orderBy('date', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); // ✅ AÑADIR doc.id
};

export const updateProductRating = async (productId: string | number, averageRating: number) => {
  try {
    const productRef = doc(db, "products", String(productId));
    
    // Intentar actualizar el documento
    await updateDoc(productRef, { averageRating });
  } catch (error: any) {
    // Si el documento no existe, crearlo con el rating
    if (error.code === 'not-found') {
      const productRef = doc(db, "products", String(productId));
      await setDoc(productRef, { 
        id: String(productId),
        averageRating 
      }, { merge: true });
    } else {
      console.error('❌ Error al actualizar rating del producto:', error);
    }
  }
};


export const addReplyToComment = async (
  productId: string | number,
  commentId: string,
  reply: { name: string; text: string; date: string }
): Promise<boolean> => {
  try {
    if (!productId || !commentId) {
      console.error("❌ Falta productId o commentId en addReplyToComment");
      return false;
    }

    console.log('📝 Intentando agregar respuesta:', {
      productId,
      commentId,
      replyText: reply.text.substring(0, 50) + '...'
    });

    // Verificar que Firebase esté inicializado
    if (!db) {
      return false;
    }

    const commentRef = doc(db, `products/${productId}/comments`, commentId);
    
    const snapshot = await getDoc(commentRef);
    if (!snapshot.exists()) {
      return false;
    }

    const data = snapshot.data();
    const updatedReplies = [...(data.replies || []), reply];
    await updateDoc(commentRef, { replies: updatedReplies });
    
    return true;
    
  } catch (error) {
    // Mostrar información específica del error
    if (error instanceof Error) {
      console.error("Mensaje del error:", error.message);
      console.error("Código del error:", (error as any).code);
    }
    
    return false;
  }
};

// --- FUNCIONES PARA GESTIÓN DIARIA DE PEDIDOS ---

/**
 * Obtiene todos los pedidos de un día específico
 */
export const getDailyOrders = async (date: string): Promise<DailyOrdersDocument | null> => {
  try {
    const dailyOrderRef = doc(db, `dailyOrders/${date}`);
    const snapshot = await getDoc(dailyOrderRef);
    
    if (snapshot.exists()) {
      return snapshot.data() as DailyOrdersDocument;
    }
    return null;
  } catch (error) {
    console.error('Error al obtener pedidos del día:', error);
    throw error;
  }
};

/**
 * Obtiene todos los días que tienen pedidos, ordenados por fecha descendente
 */
export const getAllOrderDays = async (): Promise<DailyOrdersDocument[]> => {
  try {
    const q = query(
      collection(db, 'dailyOrders'),
      orderBy('date', 'desc')
    );
    const querySnapshot = await getDocs(q);
    const days: DailyOrdersDocument[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data() as DailyOrdersDocument;
      days.push(data);
    });
    
    return days;
  } catch (error) {
    console.error('❌ Error al obtener días con pedidos:', error);
    throw error;
  }
};

/**
 * Obtiene estadísticas de pedidos por rango de fechas
 */
export const getOrdersStatistics = async (startDate: string, endDate: string) => {
  try {
    const q = query(
      collection(db, 'dailyOrders'),
      orderBy('date', 'asc')
    );
    const querySnapshot = await getDocs(q);
    
    const filteredDays: DailyOrdersDocument[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as DailyOrdersDocument;
      if (data.date >= startDate && data.date <= endDate) {
        filteredDays.push(data);
      }
    });
    
    const totalOrders = filteredDays.reduce((sum, day) => sum + day.totalOrdersCount, 0);
    const totalAmount = filteredDays.reduce((sum, day) => sum + day.totalDayAmount, 0);
    const averageOrderValue = totalOrders > 0 ? totalAmount / totalOrders : 0;
    
    return {
      totalDays: filteredDays.length,
      totalOrders,
      totalAmount,
      averageOrderValue,
      averageOrdersPerDay: filteredDays.length > 0 ? totalOrders / filteredDays.length : 0,
      days: filteredDays
    };
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    throw error;
  }
};

/**
 * Obtiene los pedidos de hoy
 */
export const getTodayOrders = async (): Promise<DailyOrdersDocument | null> => {
  const today = new Date().toISOString().split('T')[0];
  return getDailyOrders(today);
};



export const getUserDisplayInfo = (user: any) => {
  if (!user) return { userName: undefined, userEmail: undefined };
  
  // Prioridad: displayName > email (parte antes del @) > undefined
  let userName: string | undefined = undefined;
  if (user.displayName) {
    userName = user.displayName;
  } else if (user.email) {
    userName = user.email.split('@')[0];
  }
  
  return {
    userName,
    userEmail: user.email || undefined
  };
};

