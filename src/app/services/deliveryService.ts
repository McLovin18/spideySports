import { db } from '../utils/firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  getDoc,
  query, 
  where, 
  updateDoc, 
  doc,
  limit,
  orderBy,
  runTransaction
} from 'firebase/firestore';
import { InputValidator, DataSanitizer } from '../utils/security';
import { VALIDATION_RULES } from '../utils/securityConfig';
import { notificationService } from './notificationService';
import { userNotificationService } from './userNotificationService';
import { sanitizeForFirestore } from './purchaseService';

function findUndefinedPath(value: any, currentPath: string[] = []): string | null {
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
}

export interface DeliveryOrder {
  id?: string;
  orderId?: string; // ID de la compra original para hacer la conexión
  userId: string;
  userName: string;
  userEmail: string;
  date: string;
  items: any[];
  total: number;
  status: 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled' | 'competing';
  assignedTo?: string; // Email del delivery
  assignedAt?: string;
  deliveryNotes?: string;
  paypalDetails: any;
  shipping: any;
  // ✅ PROPIEDADES DE EMERGENCIA
  isEmergency?: boolean;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  emergencyReason?: string;
  emergencyMarkedAt?: string;
  emergencyMarkedBy?: string;
  // ✅ PROPIEDADES DE ASIGNACIÓN AUTOMÁTICA
  autoAssigned?: boolean; // Indica si fue asignado automáticamente
  assignedReason?: string; // Razón de la asignación
  // ✅ PROPIEDADES ADICIONALES DE LA COMPRA
  fullOrderId?: string; // ID completo legible del pedido
  customerCode?: string; // Código del cliente
  orderNumber?: string; // Número de orden
  // ✅ PROPIEDADES DE COMPETENCIA ENTRE REPARTIDORES
  assignmentType?: 'direct' | 'competition' | 'manual';
  availableFor?: string[]; // Emails de repartidores que pueden aceptar la orden
  competitionStarted?: string;
  competitionEnded?: string;
  // ✅ NUEVO: Información de ubicación
  deliveryLocation?: {
    address: string;
    city: string;
    neighborhood?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
    deliveryZone?: string; // Norte, Sur, Centro, etc.
    estimatedDistance?: number; // en km desde el centro
  };
}

// ✅ Información básica de repartidores disponibles
export interface DeliveryUserInfo {
  email: string;
  name?: string;
  status?: string;
  isBlocked?: boolean;
  zones?: string[];
  [key: string]: any;
}

// ✅ NUEVO: Interfaz para calificaciones de delivery
export interface DeliveryRating {
  id?: string;
  orderId: string;
  deliveryPersonEmail: string;
  deliveryPersonName: string;
  userId: string;
  userName: string;
  rating: number; // 1-5 estrellas
  comment?: string;
  createdAt: string;
}

// ✅ NUEVO: Interfaz para estadísticas de repartidor
export interface DeliveryPersonStats {
  email: string;
  name: string;
  totalRatings: number;
  averageRating: number;
  totalDeliveries: number;
  ratingsBreakdown: {
    '1': number;
    '2': number;
    '3': number;
    '4': number;
    '5': number;
  };
  recentComments: string[];
}

// ✅ Crear orden de delivery desde una compra
export const createDeliveryOrder = async (purchaseData: any, userName: string, userEmail: string, purchaseId?: string) => {
  try {
    // ✅ Validaciones de seguridad
    if (!InputValidator.isValidEmail(userEmail)) {
      throw new Error('Email de usuario inválido');
    }

    if (!InputValidator.isValidName(userName)) {
      throw new Error('Nombre de usuario inválido');
    }

    if (!purchaseData.items || !Array.isArray(purchaseData.items) || purchaseData.items.length === 0) {
      throw new Error('Items de compra inválidos');
    }

    if (!purchaseData.total || purchaseData.total <= 0) {
      throw new Error('Total de compra inválido');
    }

    // ✅ Sanitizar datos
    const sanitizedUserName = DataSanitizer.sanitizeText(userName);
    const sanitizedUserEmail = DataSanitizer.sanitizeText(userEmail);

    // ✅ Procesar ubicación de entrega
    const deliveryLocation = processDeliveryLocation(purchaseData.shipping);

    const deliveryOrder: DeliveryOrder = {
      orderId: purchaseId || `${purchaseData.userId}_${purchaseData.date}`,
      userId: purchaseData.userId,
      userName: sanitizedUserName,
      userEmail: sanitizedUserEmail,
      date: purchaseData.date,
      items: purchaseData.items,
      total: purchaseData.total,
      status: 'pending',
      paypalDetails: purchaseData.paypalDetails,
      shipping: purchaseData.shipping,
      // ✅ Agregar propiedades adicionales de la compra si existen
      ...(purchaseData.fullOrderId && { fullOrderId: purchaseData.fullOrderId }),
      ...(purchaseData.customerCode && { customerCode: purchaseData.customerCode }),
      ...(purchaseData.orderNumber && { orderNumber: purchaseData.orderNumber }),
      ...(deliveryLocation && { deliveryLocation })
    };

    const sanitizedDeliveryOrder = sanitizeForFirestore(deliveryOrder);

    if (process.env.NODE_ENV !== 'production') {
      const undefinedPath = findUndefinedPath(sanitizedDeliveryOrder);
      if (undefinedPath) {
        console.warn('[createDeliveryOrder] Datos contienen undefined tras sanitizar en', undefinedPath);
      }
    }

    const docRef = await addDoc(collection(db, 'deliveryOrders'), sanitizedDeliveryOrder);
    
    // ✅ Actualizar el orderId con el ID del documento si no se proporcionó purchaseId
    if (!purchaseId) {
      await updateDoc(docRef, {
        orderId: docRef.id
      });
    }
    
    // 🚀 ASIGNACIÓN AUTOMÁTICA POR ZONA
    try {
      const city = deliveryLocation?.city || purchaseData.shipping?.city || 'guayaquil';
      const zone = deliveryLocation?.deliveryZone || purchaseData.shipping?.zone || 'general';
      
      console.log(`🎯 Procesando asignación para zona: ${zone}, ciudad: ${city}`);
      
      const availableDeliveries = await findAllDeliveriesInZone(zone, city);
      
      if (availableDeliveries.length === 0) {
        console.log(`❌ No hay repartidores disponibles para zona ${zone} en ${city}. La orden quedará pendiente para asignación manual.`);
        
      } else if (availableDeliveries.length === 1) {
        // 🎯 CASO 1: Solo hay UN repartidor → Asignación automática directa
        const singleDelivery = availableDeliveries[0];
        
        await updateDoc(docRef, {
          status: 'assigned',
          assignedTo: singleDelivery.email,
          assignedAt: new Date().toISOString(),
          autoAssigned: true,
          assignedReason: `Auto-asignado directamente (único repartidor en zona ${zone})`
        });
        
        console.log(`✅ Orden auto-asignada DIRECTAMENTE a ${singleDelivery.name || singleDelivery.email} (único en zona)`);
        
        // Notificación de asignación directa (no urgente)
        try {
          await notificationService.createNotification({
            orderId: purchaseId || docRef.id,
            userName: sanitizedUserName,
            userEmail: sanitizedUserEmail,
            total: purchaseData.total,
            items: purchaseData.items,
            shipping: {
              city,
              zone,
              address: deliveryLocation?.address || purchaseData.shipping?.address || 'No especificada',
              phone: purchaseData.shipping?.phone || 'No especificado'
            },
            deliveryLocation: deliveryLocation || {
              city,
              zone,
              address: purchaseData.shipping?.address || 'No especificada',
              phone: purchaseData.shipping?.phone || 'No especificado'
            },
            targetDeliveryEmail: singleDelivery.email
          });
        } catch (notificationError) {
          console.error('Error enviando notificación de asignación directa:', notificationError);
        }
        
      } else {
        // 🏁 CASO 2: Hay MÚLTIPLES repartidores → Sistema de competencia por aceptación
        console.log(`🏁 Múltiples repartidores (${availableDeliveries.length}) en zona ${zone}. Creando sistema de competencia...`);
        
        // Marcar como disponible para competencia
        await updateDoc(docRef, {
          status: 'competing',  // Nuevo estado para órdenes en competencia
          availableFor: availableDeliveries.map(d => d.email), // Lista de repartidores elegibles
          competitionStarted: new Date().toISOString(),
          assignmentType: 'competition',
          assignmentReason: `Disponible para ${availableDeliveries.length} repartidores en zona ${zone}`
        });
        
        // Enviar notificación a TODOS los repartidores elegibles
        const notificationPromises = availableDeliveries.map(async (delivery) => {
          try {
            await notificationService.createUrgentNotification(
              delivery.email,
              `🏁 Nueva Orden Disponible`,
              `Nueva orden de ${sanitizedUserName} en tu zona ${zone}. Total: $${purchaseData.total}. ¡El primero en aceptar se la lleva!`,
              {
                orderId: purchaseId || docRef.id,
                type: 'order_competition',
                priority: 'high',
                zone: zone,
                city: city,
                action: 'accept_order'  // Acción que pueden tomar
              }
            );
          } catch (notifError) {
            console.error(`Error notificando a ${delivery.email}:`, notifError);
          }
        });
        
        await Promise.allSettled(notificationPromises);
        console.log(`✅ Notificaciones de competencia enviadas a ${availableDeliveries.length} repartidores`);
      }
      
    } catch (autoAssignError) {
      console.error('Error en asignación automática (orden creada correctamente):', autoAssignError);
      // La orden ya se creó exitosamente, solo falló la asignación automática
    }
    
    return docRef.id;
  } catch (error) {
    throw error;
  }
};


// ✅ Asignar orden a un repartidor (solo admin)
export const assignOrderToDelivery = async (orderId: string, deliveryEmail: string) => {
  try {
    // ✅ Validaciones de seguridad
    if (!orderId || orderId.trim().length === 0) {
      throw new Error('ID de orden inválido');
    }

    if (!InputValidator.isValidEmail(deliveryEmail)) {
      throw new Error('Email de delivery inválido');
    }

    // ✅ Sanitizar datos
    const sanitizedDeliveryEmail = DataSanitizer.sanitizeText(deliveryEmail);

  // 🔍 BUSCAR EL DOCUMENTO POR orderId PRIMERO
  const ordersQuery = query(
    collection(db, 'deliveryOrders'),
    where('orderId', '==', orderId)
  );
  
  const querySnapshot = await getDocs(ordersQuery);
  let orderDoc;
  let orderRef;
  
  if (querySnapshot.empty) {
    // 🔍 Si no se encuentra por orderId, intentar buscar por ID del documento
    console.log(`🔍 No se encontró por orderId: ${orderId}, intentando por ID del documento`);
    try {
      orderRef = doc(db, 'deliveryOrders', orderId);
      const docSnap = await getDoc(orderRef);
      
      if (!docSnap.exists()) {
        throw new Error(`No se encontró la orden con ID: ${orderId}`);
      }
      
      orderDoc = docSnap;
    } catch (docError) {
      throw new Error(`No se encontró la orden con ID: ${orderId}`);
    }
  } else {
    // Tomar el primer documento encontrado
    orderDoc = querySnapshot.docs[0];
    orderRef = doc(db, 'deliveryOrders', orderDoc.id);
  }    await updateDoc(orderRef, {
      status: 'assigned',
      assignedTo: sanitizedDeliveryEmail,
      assignedAt: new Date().toISOString()
    });

  } catch (error) {
    throw error;
  }
};

// ✅ Marcar orden como urgente
export const markOrderAsEmergency = async (orderId: string, reason: string = 'Marcado como urgente por administrador', markedBy: string = 'admin') => {
  try {
    if (!orderId) {
      throw new Error('ID de orden requerido');
    }

    // 🔍 BUSCAR EL DOCUMENTO POR orderId PRIMERO
    const ordersQuery = query(
      collection(db, 'deliveryOrders'),
      where('orderId', '==', orderId)
    );
    
    const querySnapshot = await getDocs(ordersQuery);
    let orderDoc;
    let orderRef;
    
    if (querySnapshot.empty) {
      // 🔍 Si no se encuentra por orderId, intentar buscar por ID del documento
      console.log(`🔍 No se encontró por orderId: ${orderId}, intentando por ID del documento`);
      try {
        orderRef = doc(db, 'deliveryOrders', orderId);
        const docSnap = await getDoc(orderRef);
        
        if (!docSnap.exists()) {
          throw new Error(`No se encontró la orden con ID: ${orderId}`);
        }
        
        orderDoc = docSnap;
      } catch (docError) {
        throw new Error(`No se encontró la orden con ID: ${orderId}`);
      }
    } else {
      // Tomar el primer documento encontrado
      orderDoc = querySnapshot.docs[0];
      orderRef = doc(db, 'deliveryOrders', orderDoc.id);
    }

    const updateData = {
      isEmergency: true,
      priority: 'urgent' as const,
      emergencyReason: DataSanitizer.sanitizeText(reason),
      emergencyMarkedAt: new Date().toISOString(),
      emergencyMarkedBy: DataSanitizer.sanitizeText(markedBy)
    };

    await updateDoc(orderRef, updateData);

    // 🚨 Enviar notificación de emergencia si está asignado
    const orderData = orderDoc.data() as DeliveryOrder;
    if (orderData.assignedTo) {
      try {
        await notificationService.createUrgentNotification(
          orderData.assignedTo,
          `🚨 PEDIDO URGENTE`,
          `El pedido ${orderData.orderId || orderDoc.id} ha sido marcado como EMERGENCIA. Motivo: ${reason}`,
          {
            orderId: orderData.orderId || orderDoc.id,
            type: 'emergency_order',
            priority: 'urgent'
          }
        );
      } catch (notifError) {
        console.error('Error enviando notificación de emergencia:', notifError);
      }
    }

    console.log(`🚨 Orden ${orderId} marcada como emergencia`);
    
  } catch (error) {
    console.error('Error marcando orden como emergencia:', error);
    throw error;
  }
};

// ✅ Auto-asignarse a una orden urgente (para deliveries)
export const selfAssignUrgentOrder = async (orderId: string, deliveryEmail: string) => {
  try {
    if (!orderId || !deliveryEmail) {
      throw new Error('ID de orden y email de delivery requeridos');
    }

    if (!InputValidator.isValidEmail(deliveryEmail)) {
      throw new Error('Email de delivery inválido');
    }

    // ✅ Sanitizar datos
    const sanitizedDeliveryEmail = DataSanitizer.sanitizeText(deliveryEmail);

    // 🔍 BUSCAR EL DOCUMENTO POR orderId PRIMERO
    const ordersQuery = query(
      collection(db, 'deliveryOrders'),
      where('orderId', '==', orderId)
    );
    
    const querySnapshot = await getDocs(ordersQuery);
    let orderDoc;
    let orderRef;
    
    if (querySnapshot.empty) {
      // 🔍 Si no se encuentra por orderId, intentar buscar por ID del documento
      console.log(`🔍 No se encontró por orderId: ${orderId}, intentando por ID del documento`);
      try {
        orderRef = doc(db, 'deliveryOrders', orderId);
        const docSnap = await getDoc(orderRef);
        
        if (!docSnap.exists()) {
          throw new Error(`No se encontró la orden con ID: ${orderId}`);
        }
        
        orderDoc = docSnap;
      } catch (docError) {
        throw new Error(`No se encontró la orden con ID: ${orderId}`);
      }
    } else {
      // Tomar el primer documento encontrado
      orderDoc = querySnapshot.docs[0];
      orderRef = doc(db, 'deliveryOrders', orderDoc.id);
    }

    const orderData = orderDoc.data() as DeliveryOrder;
    
    // Verificar que la orden sea urgente y esté disponible
    if (!orderData.isEmergency) {
      throw new Error('Solo se pueden auto-asignar órdenes marcadas como emergencia');
    }

    if (orderData.assignedTo && orderData.assignedTo !== sanitizedDeliveryEmail) {
      throw new Error('Esta orden urgente ya fue tomada por otro repartidor');
    }

    await updateDoc(orderRef, {
      status: 'assigned',
      assignedTo: sanitizedDeliveryEmail,
      assignedAt: new Date().toISOString(),
      selfAssigned: true // Marcar que se auto-asignó
    });

    console.log(`🚨 Orden urgente ${orderId} auto-asignada a ${sanitizedDeliveryEmail}`);
    
    return {
      success: true,
      message: 'Orden urgente asignada exitosamente'
    };
    
  } catch (error) {
    console.error('Error en auto-asignación de orden urgente:', error);
    throw error;
  }
};

// ✅ Aceptar una orden en modo competencia (el primero que acepta gana)
export const acceptCompetingOrder = async (orderId: string, deliveryEmail: string) => {
  try {
    if (!orderId || !deliveryEmail) {
      throw new Error('ID de orden y email de delivery requeridos');
    }

    if (!InputValidator.isValidEmail(deliveryEmail)) {
      throw new Error('Email de delivery inválido');
    }

    const sanitizedDeliveryEmail = DataSanitizer.sanitizeText(deliveryEmail);

    // 🔍 Primero localizar el documento (por orderId o por ID de documento)
    const ordersQuery = query(
      collection(db, 'deliveryOrders'),
      where('orderId', '==', orderId)
    );

    const querySnapshot = await getDocs(ordersQuery);
    let orderRef;

    if (querySnapshot.empty) {
      // Intentar por ID de documento
      console.log(`🔍 [acceptCompetingOrder] No se encontró por orderId: ${orderId}, intentando por ID del documento`);
      orderRef = doc(db, 'deliveryOrders', orderId);
      const docSnap = await getDoc(orderRef);
      if (!docSnap.exists()) {
        throw new Error(`No se encontró la orden con ID: ${orderId}`);
      }
    } else {
      const orderDoc = querySnapshot.docs[0];
      orderRef = doc(db, 'deliveryOrders', orderDoc.id);
    }

    // ⚖️ Usar transacción para evitar condiciones de carrera
    let winnerOrderData: DeliveryOrder | null = null;

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(orderRef);
      if (!snap.exists()) {
        throw new Error('La orden ya no existe');
      }

      const data = snap.data() as DeliveryOrder;

      // Guardar copia para usar fuera de la transacción
      winnerOrderData = { id: snap.id, ...data } as DeliveryOrder;

      // Debe seguir en modo competencia
      if (data.status !== 'competing') {
        if (data.assignedTo && data.assignedTo === sanitizedDeliveryEmail) {
          throw new Error('Ya tienes asignada esta orden');
        }
        throw new Error('La orden ya no está disponible para competencia');
      }

      // Validar que este repartidor esté autorizado
      const availableFor = data.availableFor || [];
      if (!availableFor.includes(sanitizedDeliveryEmail)) {
        throw new Error('No estás autorizado para aceptar esta orden');
      }

      // Verificar que aún no esté asignada a otro
      if (data.assignedTo && data.assignedTo !== sanitizedDeliveryEmail) {
        throw new Error('La orden ya fue tomada por otro repartidor');
      }

      const now = new Date().toISOString();

      transaction.update(orderRef, {
        status: 'assigned',
        assignedTo: sanitizedDeliveryEmail,
        assignedAt: now,
        competitionEnded: now,
        assignmentType: 'competition',
        assignedReason: `Orden asignada por competencia al repartidor ${sanitizedDeliveryEmail}`
      });
    });

    // Si por alguna razón no se obtuvo data, algo salió mal
    if (!winnerOrderData) {
      throw new Error('No se pudo completar la aceptación de la orden');
    }

    const finalOrderData: DeliveryOrder = winnerOrderData as DeliveryOrder;

    const availableFor = finalOrderData.availableFor || [];
    const otherDeliveries = availableFor.filter((email: string) => email !== deliveryEmail);

    // 🔔 Notificar al ganador
    try {
      await notificationService.createUrgentNotification(
        sanitizedDeliveryEmail,
        '🏆 Orden Asignada por Competencia',
        `Has ganado la orden ${finalOrderData.orderId || finalOrderData.id} en la zona ${finalOrderData.deliveryLocation?.deliveryZone || ''}.`,
        {
          orderId: finalOrderData.orderId || finalOrderData.id,
          type: 'competition_won',
          priority: 'high'
        }
      );
    } catch (notifyWinnerError) {
      console.error('Error notificando al repartidor ganador:', notifyWinnerError);
    }

    // 🔔 Notificar a los que no ganaron (si se desea)
    if (otherDeliveries.length > 0) {
      const loserPromises = otherDeliveries.map(async (email: string) => {
        try {
          await notificationService.createUrgentNotification(
            email,
            '⏱ Orden ya fue tomada',
            `La orden ${finalOrderData.orderId || finalOrderData.id} ya fue aceptada por otro repartidor.`,
            {
              orderId: finalOrderData.orderId || finalOrderData.id,
              type: 'competition_lost',
              priority: 'normal'
            }
          );
        } catch (notifyLoserError) {
          console.error(`Error notificando a repartidor sin orden (${email}):`, notifyLoserError);
        }
      });

      await Promise.allSettled(loserPromises);
    }

    console.log(`🏆 Orden ${orderId} aceptada exitosamente por ${deliveryEmail}`);

    return {
      success: true,
      message: 'Orden aceptada exitosamente',
      assignedTo: deliveryEmail
    };
  } catch (error) {
    console.error('Error al aceptar orden en competencia:', error);
    throw error;
  }
};

// ✅ Obtener órdenes pendientes (para admin)
export const getPendingOrders = async () => {
  try {
    const ordersQuery = query(
      collection(db, 'deliveryOrders'),
      where('status', '==', 'pending')
    );
    
    const querySnapshot = await getDocs(ordersQuery);
    const orders: DeliveryOrder[] = [];
    
    querySnapshot.forEach((doc) => {
      orders.push({
        id: doc.id,
        ...doc.data()
      } as DeliveryOrder);
    });
    
    return orders;
  } catch (error) {
    throw error;
  }
};

// ✅ Obtener órdenes de un delivery específico + órdenes urgentes disponibles
export const getDeliveryOrders = async (deliveryEmail: string) => {
  try {
    // 🔍 Obtener órdenes asignadas a este delivery
    const assignedOrdersQuery = query(
      collection(db, 'deliveryOrders'),
      where('assignedTo', '==', deliveryEmail)
    );
    
    // 🚨 Obtener órdenes urgentes no asignadas y no entregadas (disponibles para todos)
    const urgentOrdersQuery = query(
      collection(db, 'deliveryOrders'),
      where('isEmergency', '==', true),
      where('status', 'in', ['pending', 'assigned']) // Solo pendientes o recien asignadas, NO entregadas
    );
    
    const [assignedSnapshot, urgentSnapshot] = await Promise.all([
      getDocs(assignedOrdersQuery),
      getDocs(urgentOrdersQuery)
    ]);
    
    const orders: DeliveryOrder[] = [];
    const orderIds = new Set<string>(); // Para evitar duplicados
    
    // Agregar órdenes asignadas
    assignedSnapshot.forEach((doc) => {
      const order = {
        id: doc.id,
        ...doc.data()
      } as DeliveryOrder;
      
      orders.push(order);
      orderIds.add(doc.id);
    });
    
    // Agregar órdenes urgentes que no estén ya incluidas
    urgentSnapshot.forEach((doc) => {
      if (!orderIds.has(doc.id)) {
        const order = {
          id: doc.id,
          ...doc.data(),
          availableForAll: true // Marcar como disponible para todos
        } as DeliveryOrder & { availableForAll?: boolean };
        
        orders.push(order);
      }
    });
    
    // Ordenar: urgentes activas primero, luego por fecha descendente
    orders.sort((a, b) => {
      // Solo urgentes no entregadas van primero
      const aIsActiveEmergency = a.isEmergency && a.status !== 'delivered';
      const bIsActiveEmergency = b.isEmergency && b.status !== 'delivered';
      
      if (aIsActiveEmergency && !bIsActiveEmergency) return -1;
      if (!aIsActiveEmergency && bIsActiveEmergency) return 1;
      
      // Después por fecha
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    
    return orders;
  } catch (error) {
    console.error('Error obteniendo órdenes de delivery:', error);
    throw error;
  }
};

// ✅ Obtener TODAS las órdenes de delivery (para diagnóstico)
export const getAllDeliveryOrders = async () => {
  try {
    const ordersQuery = query(
      collection(db, 'deliveryOrders'),
      orderBy('date', 'desc')
    );
    
    const querySnapshot = await getDocs(ordersQuery);
    const orders: DeliveryOrder[] = [];
    
    querySnapshot.forEach((doc) => {
      orders.push({
        id: doc.id,
        ...doc.data()
      } as DeliveryOrder);
    });
    
    return orders;
  } catch (error) {
    throw error;
  }
};

// ✅ Actualizar estado de orden (delivery o admin)
export const updateOrderStatus = async (
  orderId: string, 
  status: 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled',
  notes?: string
) => {
  try {
    console.log('🚚 [DEBUG] Actualizando estado de orden:', {
      orderId,
      status,
      notes
    });

    // 🔍 BUSCAR EL DOCUMENTO POR orderId EN LUGAR DEL ID DEL DOCUMENTO
    const ordersQuery = query(
      collection(db, 'deliveryOrders'),
      where('orderId', '==', orderId)
    );
    
    const querySnapshot = await getDocs(ordersQuery);
    
    if (querySnapshot.empty) {
      throw new Error(`No se encontró la orden con ID: ${orderId}`);
    }

    // Tomar el primer documento encontrado
    const orderDoc = querySnapshot.docs[0];
    const orderRef = doc(db, 'deliveryOrders', orderDoc.id);
    const currentData = orderDoc.data();
    console.log('📋 [DEBUG] Datos actuales de la orden:', {
      currentStatus: currentData.status,
      assignedTo: currentData.assignedTo,
      userId: currentData.userId
    });

    const updateData: any = {
      status,
      lastUpdated: new Date().toISOString(),
      [`statusHistory.${status}`]: new Date().toISOString()
    };
    
    if (notes) {
      updateData.deliveryNotes = notes;
    }
    
    console.log('📤 [DEBUG] Datos a actualizar:', updateData);
    
    await updateDoc(orderRef, updateData);
    
    // 🔄 TAMBIÉN ACTUALIZAR EL PEDIDO ORIGINAL EN LA SUBCOLECCIÓN DEL USUARIO
    try {
      // Usar el orderId del delivery order para buscar la compra original
      const deliveryOrderData = currentData;
      const originalOrderId = deliveryOrderData.orderId;
      const userId = deliveryOrderData.userId;
      const userEmail = deliveryOrderData.userEmail;
      
      console.log(`🔍 [DEBUG] Buscando compra original: userId=${userId}, purchaseId=${originalOrderId}`);
      
      // La compra está en users/{userId}/purchases/{purchaseId}
      const originalPurchaseRef = doc(db, 'users', userId, 'purchases', originalOrderId);
      const originalPurchaseDoc = await getDoc(originalPurchaseRef);
      
      if (originalPurchaseDoc.exists()) {
        const originalUpdateData: any = {
          status: status === 'delivered' ? 'delivered' : 'processing',
          lastUpdated: new Date().toISOString()
        };
        
        if (status === 'delivered') {
          originalUpdateData.deliveredAt = new Date().toISOString();
          originalUpdateData.deliveryNotes = notes || '';
        }
        
        await updateDoc(originalPurchaseRef, originalUpdateData);
        console.log(`✅ Compra original actualizada: ${originalOrderId} -> ${originalUpdateData.status}`);

        // 📢 Crear notificación para el cliente sobre el estado del pedido
        if (status === 'in_transit' || status === 'delivered') {
          try {
            await userNotificationService.createOrderStatusNotification({
              userId,
              userEmail,
              orderId,
              status,
            });
            console.log(`🔔 Notificación de estado creada para pedido ${orderId}: ${status}`);
          } catch (notifyError) {
            console.error('❌ Error creando notificación de estado para el cliente:', notifyError);
          }
        }
      } else {
        console.log(`⚠️ Compra original no encontrada: users/${userId}/purchases/${originalOrderId}`);
      }
    } catch (originalOrderError) {
      console.error('❌ Error actualizando compra original:', originalOrderError);
      // No fallar la actualización principal por esto
    }
    
    // 🧹 LIMPIAR NOTIFICACIONES AUTOMÁTICAMENTE CUANDO SE ENTREGA
    if (status === 'delivered') {
      try {
        await notificationService.cleanupNotificationsForOrder(orderId);
        console.log(`🗑️ Notificaciones limpiadas para pedido entregado: ${orderId}`);
      } catch (cleanupError) {
        console.error('Error limpiando notificaciones:', cleanupError);
        // No fallar la actualización principal por esto
      }
    }
    
    console.log('✅ [DEBUG] Estado actualizado exitosamente');
  } catch (error) {
    console.error('❌ [DEBUG] Error actualizando estado:', error);
    throw error;
  }
};

// ✅ Encontrar TODOS los repartidores disponibles en una zona
export const findAllDeliveriesInZone = async (deliveryZone: string, city: string = 'guayaquil') => {
  try {
    console.log(`🔍 Buscando TODOS los repartidores disponibles para zona: ${deliveryZone}, ciudad: ${city}`);
    
    const deliveryUsers = await getAvailableDeliveryUsers();
    
    if (deliveryUsers.length === 0) {
      console.log('❌ No hay repartidores registrados');
      return [];
    }

    // Buscar repartidores que cubran esta zona específica
    const availableForZone = deliveryUsers.filter(user => {
      // Verificar si el repartidor está activo/disponible
      if (user.status === 'inactive' || user.isBlocked) {
        return false;
      }
      
      // Verificar zonas del repartidor
      const userZones = user.zones || [];
      const cityKey = city.toLowerCase();
      
      // Buscar coincidencia exacta de zona
      const hasExactZone = userZones.some((zone: string) => 
        zone.toLowerCase() === deliveryZone.toLowerCase() ||
        zone.toLowerCase().includes(deliveryZone.toLowerCase()) ||
        deliveryZone.toLowerCase().includes(zone.toLowerCase())
      );
      
      // Si no hay coincidencia exacta, buscar por patrones de ciudad
      const hasGeneralCity = !hasExactZone && userZones.some((zone: string) => 
        zone.toLowerCase().includes(cityKey) ||
        zone.toLowerCase().includes('general') ||
        zone.toLowerCase().includes('todo')
      );
      
      return hasExactZone || hasGeneralCity;
    });

    console.log(`✅ Encontrados ${availableForZone.length} repartidores disponibles para zona ${deliveryZone}`);
    
    return availableForZone;
    
  } catch (error) {
    console.error('Error buscando repartidores por zona:', error);
    return [];
  }
};

// ✅ Encontrar repartidor disponible por zona automáticamente (LEGACY - mantener por compatibilidad)
export const findAvailableDeliveryByZone = async (deliveryZone: string, city: string = 'guayaquil') => {
  const allAvailable = await findAllDeliveriesInZone(deliveryZone, city);
  if (allAvailable.length === 0) return null;
  
  // Seleccionar el mejor de los disponibles
  return await selectBestDeliveryUser(allAvailable);
};

// ✅ Seleccionar el mejor repartidor basado en carga de trabajo
const selectBestDeliveryUser = async (availableUsers: any[]) => {
  try {
    // Por ahora, seleccionar aleatoriamente - puedes mejorar esta lógica
    // En el futuro puedes agregar lógica para:
    // - Contar órdenes activas por repartidor
    // - Verificar última asignación 
    // - Considerar calificaciones
    const randomIndex = Math.floor(Math.random() * availableUsers.length);
    return availableUsers[randomIndex];
  } catch (error) {
    console.error('Error seleccionando mejor repartidor:', error);
    return availableUsers[0]; // Fallback al primero
  }
};

// ✅ Obtener lista de repartidores disponibles dinámicamente desde Firebase
export const getAvailableDeliveryUsers = async (): Promise<DeliveryUserInfo[]> => {
  try {
    const deliveryUsersSnapshot = await getDocs(collection(db, 'deliveryUsers'));
    const deliveryUsers: DeliveryUserInfo[] = deliveryUsersSnapshot.docs.map(doc => ({
      email: doc.id,
      ...doc.data()
    } as DeliveryUserInfo));
    
    console.log(`📋 ${deliveryUsers.length} repartidores activos encontrados`);
    return deliveryUsers;
  } catch (error) {
    console.error('Error obteniendo repartidores:', error);
    return [];
  }
};

// ✅ Función para determinar zona de entrega basada en dirección
export const determineDeliveryZone = (address: string): string => {
  const addressLower = address.toLowerCase();
  
  // Mapeo básico de zonas de Guayaquil (puedes expandir esto)
  if (addressLower.includes('urdesa') || addressLower.includes('zona rosa')) {
    return 'Urdesa';
  } else if (addressLower.includes('centro') || addressLower.includes('malecón')) {
    return 'Centro';
  } else if (addressLower.includes('norte') || addressLower.includes('garzota') || addressLower.includes('alborada')) {
    return 'Norte';
  } else if (addressLower.includes('sur') || addressLower.includes('guasmo') || addressLower.includes('ximena')) {
    return 'Sur';
  } else if (addressLower.includes('vía samborondón') || addressLower.includes('samborondón')) {
    return 'Samborondón';
  } else {
    return 'Otra Zona';
  }
};

// ✅ Calcular distancia estimada (función básica)
export const estimateDeliveryDistance = (zone: string): number => {
  const distanceMap: { [key: string]: number } = {
    'Centro': 5,
    'Urdesa': 8,
    'Norte': 12,
    'Sur': 15,
    'Samborondón': 20,
    'Otra Zona': 10
  };
  
  return distanceMap[zone] || 10;
};

// ✅ Procesar información de ubicación para delivery
export const processDeliveryLocation = (shippingInfo: any) => {
  if (!shippingInfo) {
    return null;
  }

  // ✅ Usar los nuevos campos de ciudad y zona si están disponibles
  const city = shippingInfo.city || 'Guayaquil';
  const zone = shippingInfo.zone || determineDeliveryZone(shippingInfo.address || '');
  const estimatedDistance = estimateDeliveryDistanceByCity(city, zone);

  return {
    address: shippingInfo.address || `${zone}, ${city}`,
    city: city,
    neighborhood: zone, // La zona funciona como neighborhood
    deliveryZone: zone,
    estimatedDistance
  };
};

// ✅ Calcular distancia estimada por ciudad y zona
export const estimateDeliveryDistanceByCity = (city: string, zone: string): number => {
  // Distancias para Guayaquil
  const guayaquilDistances: { [key: string]: number } = {
    'Centro': 5,
    'Urdesa': 8,
    'Norte': 12,
    'Sur': 15,
    'Samborondón': 20,
    'Ceibos': 18,
    'Alborada': 10,
    'Kennedy': 12,
    'Las Peñas': 6,
    'Mapasingue': 14,
    'Sauces': 16,
    'Via a la Costa': 22
  };

  // Distancias para Santa Elena
  const santaElenaDistances: { [key: string]: number } = {
    'Santa Elena': 8,
    'La Libertad': 5,
    'Ballenita': 12,
    'Salinas': 15
  };

  if (city === 'Guayaquil') {
    return guayaquilDistances[zone] || 10;
  } else if (city === 'Santa Elena') {
    return santaElenaDistances[zone] || 10;
  }
  
  return 15; // Distancia por defecto para otras ciudades
};

// ✅ Obtener estado de delivery por orderId
export const getDeliveryStatusByOrderId = async (orderId: string) => {
  try {
    // ✅ Validar parámetros
    if (!orderId || orderId.trim().length === 0) {
      return null;
    }

    const q = query(
      collection(db, 'deliveryOrders'),
      where('orderId', '==', orderId),
      limit(1)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const deliveryDoc = querySnapshot.docs[0];
    const deliveryData = deliveryDoc.data();
    
    return {
      status: deliveryData.status || 'pending',
      assignedTo: deliveryData.assignedTo,
      deliveryNotes: deliveryData.deliveryNotes,
      lastUpdated: deliveryData.lastUpdated
    };
  } catch (error) {
    return null;
  }
};

// ✅ Helper para obtener texto y color del estado de delivery
export const getDeliveryStatusInfo = (status: string | null) => {
  if (!status) {
    return {
      text: 'En preparación',
      color: 'secondary',
      icon: 'box-seam'
    };
  }

  switch (status) {
    case 'pending':
      return {
        text: 'En preparación',
        color: 'secondary',
        icon: 'box-seam'
      };
    case 'assigned':
      return {
        text: 'Asignado para envío',
        color: 'warning',
        icon: 'truck'
      };
    case 'picked_up':
      return {
        text: 'Recogido',
        color: 'info',
        icon: 'box-arrow-up'
      };
    case 'in_transit':
      return {
        text: 'En tránsito',
        color: 'primary',
        icon: 'geo-alt'
      };
    case 'delivered':
      return {
        text: 'Entregado',
        color: 'success',
        icon: 'check-circle'
      };
    case 'cancelled':
      return {
        text: 'Cancelado',
        color: 'danger',
        icon: 'x-circle'
      };
    default:
      return {
        text: 'Estado desconocido',
        color: 'secondary',
        icon: 'question-circle'
      };
  }
};

// ✅ NUEVO: Guardar calificación de delivery
export const saveDeliveryRating = async (ratingData: {
  orderId: string;
  deliveryPersonEmail: string;
  deliveryPersonName: string;
  userId: string;
  userName: string;
  rating: number;
  comment?: string;
}) => {
  try {
    // ✅ Validaciones de seguridad
    if (!InputValidator.isValidEmail(ratingData.deliveryPersonEmail)) {
      throw new Error('Email de repartidor inválido');
    }

    if (!ratingData.userId || ratingData.userId.trim().length === 0) {
      throw new Error('ID de usuario inválido');
    }

    if (ratingData.rating < 1 || ratingData.rating > 5) {
      throw new Error('La calificación debe estar entre 1 y 5 estrellas');
    }

    // ✅ Verificar que no exista ya una calificación para esta orden
    const existingRatingQuery = query(
      collection(db, 'deliveryRatings'),
      where('orderId', '==', ratingData.orderId),
      where('userId', '==', ratingData.userId),
      limit(1)
    );
    
    const existingRatingSnapshot = await getDocs(existingRatingQuery);
    if (!existingRatingSnapshot.empty) {
      throw new Error('Ya has calificado esta entrega');
    }

    // ✅ Sanitizar datos
    const deliveryRating: DeliveryRating = {
      orderId: DataSanitizer.sanitizeText(ratingData.orderId),
      deliveryPersonEmail: DataSanitizer.sanitizeText(ratingData.deliveryPersonEmail),
      deliveryPersonName: DataSanitizer.sanitizeText(ratingData.deliveryPersonName),
      userId: DataSanitizer.sanitizeText(ratingData.userId),
      userName: DataSanitizer.sanitizeText(ratingData.userName),
      rating: ratingData.rating,
      comment: ratingData.comment ? DataSanitizer.sanitizeText(ratingData.comment) : undefined,
      createdAt: new Date().toISOString()
    };

    // ✅ Guardar la calificación
    const docRef = await addDoc(collection(db, 'deliveryRatings'), deliveryRating);
    
    return docRef.id;
  } catch (error: any) {
    throw error;
  }
};

// ✅ NUEVO: Obtener calificaciones de un repartidor
export const getDeliveryPersonRatings = async (deliveryPersonEmail: string): Promise<DeliveryPersonStats> => {
  try {
    // ✅ Obtener todas las calificaciones del repartidor
    const ratingsQuery = query(
      collection(db, 'deliveryRatings'),
      where('deliveryPersonEmail', '==', deliveryPersonEmail)
    );
    
    const ratingsSnapshot = await getDocs(ratingsQuery);
    
    if (ratingsSnapshot.empty) {
      // ✅ Obtener información básica del repartidor dinámicamente
      const deliveryUsers = await getAvailableDeliveryUsers();
      const deliveryUser = deliveryUsers.find((user: any) => user.email === deliveryPersonEmail);
      
      return {
        email: deliveryPersonEmail,
        name: (deliveryUser as any)?.name || 'Repartidor Desconocido',
        totalRatings: 0,
        averageRating: 0,
        totalDeliveries: 0,
        ratingsBreakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        recentComments: []
      };
    }

    const ratings: DeliveryRating[] = [];
    ratingsSnapshot.forEach(doc => {
      ratings.push({ id: doc.id, ...doc.data() } as DeliveryRating);
    });

    // ✅ Calcular estadísticas
    const totalRatings = ratings.length;
    const totalScore = ratings.reduce((sum, rating) => sum + rating.rating, 0);
    const averageRating = totalScore / totalRatings;

    // ✅ Desglose de calificaciones
    const ratingsBreakdown = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    ratings.forEach(rating => {
      ratingsBreakdown[rating.rating.toString() as keyof typeof ratingsBreakdown]++;
    });

    // ✅ Comentarios recientes (últimos 5)
    const recentComments = ratings
      .filter(rating => rating.comment && rating.comment.trim().length > 0)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map(rating => rating.comment!);

    // ✅ Obtener total de entregas (órdenes asignadas)
    let totalDeliveries = 0;
    try {
      const deliveriesQuery = query(
        collection(db, 'deliveryOrders'),
        where('assignedTo', '==', deliveryPersonEmail)
      );
      
      const deliveriesSnapshot = await getDocs(deliveriesQuery);
      totalDeliveries = deliveriesSnapshot.size;
    } catch (deliveryError) {
      // ✅ Si falla la consulta de entregas, usar 0
      totalDeliveries = 0;
    }

    // ✅ Obtener nombre del repartidor dinámicamente
    const deliveryUsers = await getAvailableDeliveryUsers();
    const deliveryUser = deliveryUsers.find((user: any) => user.email === deliveryPersonEmail);

    return {
      email: deliveryPersonEmail,
      name: (deliveryUser as any)?.name || 'Repartidor Desconocido',
      totalRatings,
      averageRating: Math.round(averageRating * 100) / 100,
      totalDeliveries,
      ratingsBreakdown,
      recentComments
    };
  } catch (error) {
    throw error;
  }
};

// ✅ NUEVO: Verificar si una orden ya fue calificada
export const hasOrderBeenRated = async (orderId: string, userId: string): Promise<boolean> => {
  try {
    const ratingQuery = query(
      collection(db, 'deliveryRatings'),
      where('orderId', '==', orderId),
      where('userId', '==', userId),
      limit(1)
    );
    
    const ratingSnapshot = await getDocs(ratingQuery);
    return !ratingSnapshot.empty;
  } catch (error) {
    return false;
  }
};

// ✅ NUEVO: Obtener todas las estadísticas de repartidores (para admin)
export const getAllDeliveryPersonsStats = async (): Promise<DeliveryPersonStats[]> => {
  try {
    const deliveryUsers = await getAvailableDeliveryUsers();
    
    // ✅ Manejar cada repartidor individualmente para evitar que un error rompa todo
    const stats: DeliveryPersonStats[] = [];
    
    for (const user of deliveryUsers) {
      try {
        const userStats = await getDeliveryPersonRatings(user.email);
        stats.push(userStats);
      } catch (error) {
        // ✅ Si falla un repartidor específico, crear stats vacías
        stats.push({
          email: user.email,
          name: (user as any).name || 'Repartidor Desconocido',
          totalRatings: 0,
          averageRating: 0,
          totalDeliveries: 0,
          ratingsBreakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
          recentComments: []
        });
      }
    }
    
    // ✅ Ordenar por calificación promedio (de mayor a menor)
    return stats.sort((a, b) => b.averageRating - a.averageRating);
  } catch (error) {
    // ✅ Si falla todo, devolver array vacío en lugar de error
    return [];
  }
};
