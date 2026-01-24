import { db } from '../utils/firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  updateDoc, 
  doc,
  limit,
  getDoc,
  orderBy
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
  status: 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled';
  assignedTo?: string; // Email del delivery
  assignedAt?: string;
  deliveryNotes?: string;
  paypalDetails: any;
  shipping: any;
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

    await updateDoc(orderRef, {
      status: 'assigned',
      assignedTo: sanitizedDeliveryEmail,
      assignedAt: new Date().toISOString()
    });

  } catch (error) {
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

// ✅ Obtener órdenes de un delivery específico
export const getDeliveryOrders = async (deliveryEmail: string) => {
  try {
    const ordersQuery = query(
      collection(db, 'deliveryOrders'),
      where('assignedTo', '==', deliveryEmail)
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

// ✅ Obtener lista de repartidores disponibles dinámicamente desde Firebase
export const getAvailableDeliveryUsers = async () => {
  try {
    const deliveryUsersSnapshot = await getDocs(collection(db, 'deliveryUsers'));
    const deliveryUsers = deliveryUsersSnapshot.docs.map(doc => ({
      email: doc.id,
      ...doc.data()
    }));
    
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
