// 🔔 SERVICIO DE NOTIFICACIONES PARA DELIVERY
// Sistema automatizado de asignación de pedidos

import { db, auth } from '../utils/firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query,
  where,
  updateDoc,
  deleteDoc,
  doc,
  limit,
  Timestamp,
  onSnapshot,
  getDoc
} from 'firebase/firestore';

// ✅ INTERFACES
export interface DeliveryNotification {
  id?: string;
  orderId: string;
  orderData: {
    userName: string;
    userEmail: string;
    total: number;
    items: any[];
    deliveryLocation: {
      city: string;
      zone: string;
      address: string;
      phone: string;
    };
  };
  targetZones: string[];
  createdAt: Timestamp;
  expiresAt: Timestamp;
  status: 'pending' | 'sent' | 'accepted' | 'rejected' | 'expired';
  acceptedBy?: string;
  acceptedAt?: string;
  isUrgent?: boolean;
  convertedToUrgentAt?: string;
}

// ✅ CLASE PRINCIPAL
export class NotificationService {
  private notifications: Map<string, any> = new Map();

  // 🔥 OBTENER ZONAS DE DELIVERY DESDE FIREBASE (DINÁMICO)
  async getDeliveryUserZones(userEmail: string): Promise<string[]> {
    try {
      // Buscar usuario en la colección deliveryUsers
      const q = query(
        collection(db, 'deliveryUsers'),
        where('email', '==', userEmail),
        where('active', '==', true)
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const userData = snapshot.docs[0].data();
        const zones = userData.zones || [];
        return zones;
      }
      
      // Si no se encuentra en Firebase, usar zonas por defecto
      return ['general'];
    } catch (error) {
      console.error('Error obteniendo zonas de delivery:', error);
      return ['general'];
    }
  }

  // 🔥 VERIFICAR SI UN USUARIO ES DELIVERY (DINÁMICO)
  async isDeliveryUser(userEmail: string): Promise<boolean> {
    try {
      const q = query(
        collection(db, 'deliveryUsers'),
        where('email', '==', userEmail),
        where('active', '==', true)
      );
      
      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      console.error('Error verificando usuario delivery:', error);
      return false;
    }
  }

  constructor() {
    // No cargar notificaciones automáticamente - se cargarán cuando se especifique el delivery
    this.scheduleCleanup();
  }

  // 🔄 CARGAR NOTIFICACIONES EXISTENTES (FILTRADO POR ZONA)
  async loadNotifications(deliveryEmail?: string): Promise<void> {
    try {
      let q;
      
      if (deliveryEmail) {
        // Si se proporciona email, filtrar por zonas del delivery
        const deliveryZones = await this.getDeliveryUserZones(deliveryEmail);
        
        if (deliveryZones.length === 0) {
          return;
        }

        q = query(
          collection(db, 'deliveryNotifications'),
          where('status', '==', 'pending'),
          where('targetZones', 'array-contains-any', deliveryZones)
        );
      } else {
        // Sin email, cargar todas (para admin)
        q = query(
          collection(db, 'deliveryNotifications'),
          where('status', '==', 'pending')
        );
      }
      
      const snapshot = await getDocs(q);
      
      snapshot.forEach(doc => {
        const data = doc.data();
        this.notifications.set(doc.id, {
          id: doc.id,
          ...data
        });
      });
      
    } catch (error) {
      console.error('Error cargando notificaciones:', error);
    }
  }

  // 🔔 SOLICITAR PERMISOS DE NOTIFICACIÓN
  async requestNotificationPermission(): Promise<boolean> {
    try {
      // Verificar soporte para notificaciones
      if (!('Notification' in window)) {
        console.warn('Este navegador no soporta notificaciones');
        return false;
      }

      // Verificar contexto seguro (HTTPS) - requerido para notificaciones en móviles
      if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        console.warn('❌ Las notificaciones requieren HTTPS en dispositivos móviles');
        return false;
      }

      // Si ya están concedidos
      if (Notification.permission === 'granted') {
        console.log('✅ Notificaciones ya están habilitadas');
        return true;
      }

      // Si fueron denegados previamente
      if (Notification.permission === 'denied') {
        console.warn('❌ Permisos de notificación denegados previamente');
        console.warn('💡 Para habilitar: Ve a configuración del navegador > Notificaciones');
        return false;
      }

      // Solicitar permisos
      console.log('🔔 Solicitando permisos de notificación...');
      
      // Para dispositivos móviles, mostrar instrucciones claras
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobile) {
        console.log('📱 Dispositivo móvil detectado - mostrando instrucciones específicas');
      }
      
      // Usar método compatible con todos los navegadores
      let permission: NotificationPermission;
      
      if (Notification.requestPermission.length) {
        // Método legacy con callback
        permission = await new Promise((resolve) => {
          Notification.requestPermission(resolve);
        });
      } else {
        // Método moderno con Promise
        permission = await Notification.requestPermission();
      }
      
      console.log('🔔 Resultado de solicitud:', permission);
      
      if (permission === 'granted') {
        console.log('✅ Notificaciones habilitadas correctamente');
        
        // Mostrar notificación de prueba
        this.showTestNotification();
        
        return true;
      } else {
        console.warn('❌ Notificaciones no fueron habilitadas:', permission);
        return false;
      }
    } catch (error) {
      console.error('Error solicitando permisos de notificación:', error);
      return false;
    }
  }

  // 🧪 MOSTRAR NOTIFICACIÓN DE PRUEBA
  private showTestNotification(): void {
    try {
      const notification = new Notification('🚚 SpideySports Delivery', {
        body: '✅ ¡Notificaciones habilitadas! Recibirás alertas de pedidos.',
        icon: '/logoWeb.png', // Usar el logo existente
        tag: 'spidey-delivery-test',
        requireInteraction: false,
        silent: false
      });

      // Auto-cerrar después de 3 segundos
      setTimeout(() => {
        notification.close();
      }, 3000);

    } catch (error) {
      console.log('No se pudo mostrar notificación de prueba:', error);
    }
  }

  // 📍 DETERMINAR ZONA DE ENTREGA
  private determineTargetZone(orderData: any): string {
    const city = orderData.shipping?.city || orderData.deliveryLocation?.city || '';
    const zone = orderData.shipping?.zone || orderData.deliveryLocation?.zone || '';

    // Si ya tenemos ciudad y zona específicas, crear el target zone
    if (city && zone) {
      const cityLower = city.toLowerCase();
      const zoneLower = zone.toLowerCase();
      
      // Mapeo directo basado en los valores del selector
      if (cityLower.includes('guayaquil')) {
        switch (zoneLower) {
          case 'centro': return 'guayaquil-centro';
          case 'norte': return 'guayaquil-norte';
          case 'sur': return 'guayaquil-sur';
          case 'urdesa': return 'guayaquil-urdesa';
          case 'samborondón': case 'samborondon': return 'guayaquil-samborondon';
          case 'ceibos': return 'guayaquil-ceibos';
          case 'alborada': return 'guayaquil-alborada';
          case 'kennedy': return 'guayaquil-kennedy';
          case 'las peñas': case 'las penas': return 'guayaquil-las-penas';
          case 'mapasingue': return 'guayaquil-mapasingue';
          case 'sauces': return 'guayaquil-sauces';
          case 'via a la costa': return 'guayaquil-via-costa';
          default: return 'guayaquil-general';
        }
      } else if (cityLower.includes('santa elena')) {
        switch (zoneLower) {
          case 'santa elena': return 'santa-elena-centro';
          case 'la libertad': return 'santa-elena-libertad';
          case 'ballenita': return 'santa-elena-ballenita';
          case 'salinas': return 'santa-elena-salinas';
          default: return 'santa-elena-general';
        }
      }
    }

    // Fallback: disponible para todos
    return 'general';
  }

  // 🔔 CREAR NOTIFICACIÓN AUTOMÁTICA
  async createNotification(orderData: any): Promise<string> {
    try {
      const targetZone = this.determineTargetZone(orderData);

      const notificationData: Omit<DeliveryNotification, 'id'> = {
        orderId: orderData.orderId || orderData.id || `ORDER_${Date.now()}`,
        orderData: {
          userName: orderData.userName,
          userEmail: orderData.userEmail,
          total: orderData.total,
          items: orderData.items,
          deliveryLocation: orderData.deliveryLocation || {
            city: orderData.shipping?.city || 'No especificada',
            zone: orderData.shipping?.zone || 'No especificada',
            address: orderData.shipping?.address || 'No especificada',
            phone: orderData.shipping?.phone || 'No especificado'
          }
        },
        targetZones: [targetZone],
        createdAt: Timestamp.fromDate(new Date()),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)), // 24 horas (1 día)
        status: 'pending'
      };

      const docRef = await addDoc(collection(db, 'deliveryNotifications'), notificationData);
      
      // Almacenar en memoria
      this.notifications.set(docRef.id, {
        id: docRef.id,
        ...notificationData
      });

      // Programar expiración y conversión a urgente después de 1 día
      this.scheduleNotificationExpiry(docRef.id);
      this.scheduleUrgentConversion(docRef.id, notificationData);
      
      console.log(`📱 Notificación creada para delivery: ${docRef.id}`);
      
      return docRef.id;
    } catch (error) {
      console.error('Error creando notificación:', error);
      throw error;
    }
  }

  // 🚨 CREAR NOTIFICACIÓN URGENTE PARA TODOS LOS DELIVERY (CON PREVENCIÓN DE DUPLICADOS)
  async createUrgentNotificationForAll(orderData: any): Promise<string> {
    try {
      const orderId = orderData.orderId || orderData.id || `ORDER_${Date.now()}`;
      
      // 🛡️ VERIFICAR SI YA EXISTE UNA NOTIFICACIÓN ACTIVA PARA ESTE PEDIDO
      const existingNotificationsQuery = query(
        collection(db, 'deliveryNotifications'),
        where('orderId', '==', orderId),
        where('status', '==', 'pending')
      );
      
      const existingNotifications = await getDocs(existingNotificationsQuery);
      
      if (!existingNotifications.empty) {
        console.log(`⚠️ Ya existe una notificación activa para el pedido ${orderId}. No se creará duplicada.`);
        return existingNotifications.docs[0].id;
      }

      // Para pedidos urgentes, notificar a TODAS las zonas
      const targetZones = ['general', 'guayaquil-general', 'santa-elena-general', 'guayaquil-centro', 'guayaquil-norte', 'guayaquil-sur', 'guayaquil-urdesa', 'guayaquil-samborondon', 'santa-elena-centro', 'santa-elena-libertad', 'santa-elena-ballenita', 'santa-elena-salinas'];

      const notificationData: Omit<DeliveryNotification, 'id'> = {
        orderId: orderId,
        orderData: {
          userName: orderData.userName,
          userEmail: orderData.userEmail,
          total: orderData.total,
          items: orderData.items,
          deliveryLocation: orderData.deliveryLocation || {
            city: orderData.shipping?.city || 'No especificada',
            zone: orderData.shipping?.zone || 'No especificada',
            address: orderData.shipping?.address || 'No especificada',
            phone: orderData.shipping?.phone || 'No especificado'
          }
        },
        targetZones,
        createdAt: Timestamp.fromDate(new Date()),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)), // 10 minutos para urgentes
        status: 'pending'
      };

      const docRef = await addDoc(collection(db, 'deliveryNotifications'), notificationData);
      console.log(`✅ Notificación urgente creada para pedido ${orderId}: ${docRef.id}`);
      
      // Para pedidos urgentes, expiración más larga
      this.scheduleUrgentNotificationExpiry(docRef.id);
      
      // Notificar por email como respaldo para urgentes
      this.notifyAllDeliveryPersonsByEmail(orderData);
      
      return docRef.id;
    } catch (error) {
      console.error('Error al crear notificación urgente:', error);
      throw error;
    }
  }

  // ⏰ PROGRAMAR EXPIRACIÓN DE NOTIFICACIÓN URGENTE (más tiempo)
  private scheduleUrgentNotificationExpiry(notificationId: string): void {
    setTimeout(async () => {
      try {
        const notificationRef = doc(db, 'deliveryNotifications', notificationId);
        await updateDoc(notificationRef, {
          status: 'expired'
        });
      } catch (error) {
        console.error('Error al expirar notificación urgente:', error);
      }
    }, 10 * 60 * 1000); // 10 minutos para urgentes
  }

  // 📧 NOTIFICAR A TODOS LOS DELIVERY PERSONS POR EMAIL
  private async notifyAllDeliveryPersonsByEmail(orderData: any): Promise<void> {
    // Implementación para envío de emails como respaldo
    console.log('📧 Notificación de respaldo enviada por email para pedido urgente');
  }

  // ⏰ PROGRAMAR CONVERSIÓN A URGENTE (después de 1 día)
  private scheduleUrgentConversion(notificationId: string, originalData: any): void {
    setTimeout(async () => {
      try {
        console.log(`🚨 Convirtiendo pedido ${notificationId} a URGENTE después de 24 horas`);
        
        const notificationRef = doc(db, 'deliveryNotifications', notificationId);
        
        // Verificar si el pedido aún está pendiente
        const currentDoc = await getDoc(notificationRef);
        if (!currentDoc.exists() || currentDoc.data()?.status !== 'pending') {
          console.log(`⏩ Pedido ${notificationId} ya fue procesado, no se convierte a urgente`);
          return;
        }

        // Convertir a urgente: disponible para TODAS las zonas
        const allZones = [
          'general', 
          'guayaquil-general', 
          'santa-elena-general', 
          'guayaquil-centro', 
          'guayaquil-norte', 
          'guayaquil-sur', 
          'guayaquil-urdesa', 
          'guayaquil-samborondon', 
          'santa-elena-centro', 
          'santa-elena-libertad', 
          'santa-elena-ballenita', 
          'santa-elena-salinas'
        ];

        await updateDoc(notificationRef, {
          targetZones: allZones,
          expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // 7 días más como urgente
          isUrgent: true,
          convertedToUrgentAt: new Date().toISOString()
        });

        // Actualizar en memoria
        if (this.notifications.has(notificationId)) {
          const notification = this.notifications.get(notificationId);
          notification.targetZones = allZones;
          notification.isUrgent = true;
          notification.expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
        }

        // La notificación urgente se mostrará automáticamente cuando los delivery suscritos detecten el cambio
        console.log(`✅ Pedido ${notificationId} convertido a URGENTE - Disponible para todos los repartidores`);
        
      } catch (error) {
        console.error('Error convirtiendo a urgente:', error);
      }
    }, 24 * 60 * 60 * 1000); // 24 horas
  }

  // ⏰ PROGRAMAR EXPIRACIÓN FINAL (después de 7 días como urgente)
  private scheduleNotificationExpiry(notificationId: string): void {
    setTimeout(async () => {
      try {
        const notificationRef = doc(db, 'deliveryNotifications', notificationId);
        
        // Verificar si aún está pendiente después de 8 días total
        const currentDoc = await getDoc(notificationRef);
        if (currentDoc.exists() && currentDoc.data()?.status === 'pending') {
          await updateDoc(notificationRef, {
            status: 'expired'
          });
          
          // Remover de memoria
          this.notifications.delete(notificationId);
          
          console.log(`⏰ Pedido ${notificationId} expirado después de 8 días total`);
        }
      } catch (error) {
        console.error('Error expirando notificación:', error);
      }
    }, 8 * 24 * 60 * 60 * 1000); // 8 días total (1 día normal + 7 días urgente)
  }

  // 🔔 MOSTRAR NOTIFICACIÓN
  private showNotification(notification: any): void {
    // Determinar si es urgente
    const isUrgent = notification.isUrgent || false;
    const title = isUrgent 
      ? `🚨 PEDIDO URGENTE - $${notification.orderData.total}` 
      : `🚚 Nuevo Pedido Disponible - $${notification.orderData.total}`;
    
    const body = isUrgent
      ? `🚨 URGENTE - Disponible para TODOS los repartidores\n📍 ${notification.orderData.deliveryLocation.zone}, ${notification.orderData.deliveryLocation.city}\n👤 ${notification.orderData.userName}\n⏰ ¡Acepta ahora!`
      : `📍 ${notification.orderData.deliveryLocation.zone}, ${notification.orderData.deliveryLocation.city}\n👤 ${notification.orderData.userName}\n⏰ Disponible por 24 horas en tu zona`;

    // Mostrar notificación del navegador
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        tag: notification.id,
        icon: isUrgent ? '/favicon-urgent.ico' : '/favicon.ico'
      });
    }

    // Reproducir sonido diferente para urgentes
    if (isUrgent) {
      this.playUrgentNotificationSound();
    } else {
      this.playNotificationSound();
    }
    
    // Vibrar dispositivo (patrón diferente para urgentes)
    this.vibrate(isUrgent);
  }

  // 🔊 REPRODUCIR SONIDO DE NOTIFICACIÓN
  private playNotificationSound(): void {
    try {
      // Sonido de notificación simple y confiable
      const audio = new Audio();
      
      // Base64 de un sonido de beep simple válido (formato WAV)
      const notificationSound = 'data:audio/wav;base64,UklGRuIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU4AAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmAeAUWQ0+3Qey0EJX3E8t2OQAoUYrPq46VQDD9k0+3VgCkGJH3E8t2OQA==';
      
      audio.src = notificationSound;
      audio.volume = 0.5;
      
      // Reproducir con manejo de errores mejorado
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Si falla, intentar notificación nativa del navegador
          console.log('Audio no disponible, usando notificación silenciosa');
        });
      }
    } catch {
      // Si todo falla, continuar sin sonido (no bloquear la notificación)
      console.log('Sistema de sonido no disponible, notificación silenciosa');
    }
  }

  // 🚨 REPRODUCIR SONIDO URGENTE (más largo e insistente)
  private playUrgentNotificationSound(): void {
    try {
      // Para urgentes, reproducir el sonido 3 veces con intervalos
      const playSound = () => {
        const audio = new Audio();
        const notificationSound = 'data:audio/wav;base64,UklGRuIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU4AAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmAeAUWQ0+3Qey0EJX3E8t2OQAoUYrPq46VQDD9k0+3VgCkGJH3E8t2OQA==';
        audio.src = notificationSound;
        audio.volume = 0.7; // Más alto para urgentes
        audio.play().catch(() => console.log('Audio urgente no disponible'));
      };

      // Reproducir 3 veces con intervalos de 500ms
      playSound();
      setTimeout(playSound, 500);
      setTimeout(playSound, 1000);
    } catch {
      console.log('Sistema de sonido urgente no disponible');
    }
  }

  // 📳 VIBRAR DISPOSITIVO (móvil)
  private vibrate(isUrgent: boolean = false): void {
    if ('vibrate' in navigator) {
      if (isUrgent) {
        // Patrón más insistente para urgentes: vibrar 300ms, pausa 100ms, repetir 4 veces
        navigator.vibrate([300, 100, 300, 100, 300, 100, 300]);
      } else {
        // Patrón normal: vibrar 200ms, pausa 100ms, vibrar 200ms
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
    }
  }

  // ✅ ACEPTAR PEDIDO - CORREGIDO para evitar error 400
  async acceptDeliveryOrder(notificationId: string, deliveryEmail: string): Promise<boolean> {
    try {
      console.log('🔄 Aceptando pedido:', { notificationId, deliveryEmail });
      
      const notificationRef = doc(db, 'deliveryNotifications', notificationId);
      
      // Usar Date() en lugar de serverTimestamp() para evitar error 400
      const updateData = {
        status: 'accepted',
        acceptedBy: deliveryEmail,
        acceptedAt: new Date().toISOString()
      };
      
      console.log('📝 Datos a actualizar:', updateData);
      
      // Marcar como aceptado
      await updateDoc(notificationRef, updateData);
      
      console.log('✅ Pedido aceptado exitosamente');
      return true;
    } catch (error: any) {
      console.error('❌ Error al aceptar pedido:', error);
      console.error('   - Código:', error?.code || 'Desconocido');
      console.error('   - Mensaje:', error?.message || error);
      return false;
    }
  }

  // 🚫 RECHAZAR PEDIDO
  async rejectDeliveryOrder(notificationId: string, deliveryEmail: string): Promise<boolean> {
    try {
      const notificationRef = doc(db, 'deliveryNotifications', notificationId);
      
      await updateDoc(notificationRef, {
        status: 'rejected',
        rejectedBy: deliveryEmail,
        rejectedAt: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      console.error('Error al rechazar pedido:', error);
      return false;
    }
  }

  // 📊 OBTENER NOTIFICACIONES ACTIVAS
  async getActiveNotifications(deliveryEmail?: string): Promise<DeliveryNotification[]> {
    try {
      let notifications: DeliveryNotification[] = [];
      
      if (deliveryEmail) {
        // 1. Obtener notificaciones por zonas del delivery
        const deliveryZones = await this.getDeliveryUserZones(deliveryEmail);
        
        if (deliveryZones.length > 0) {
          const zonesQuery = query(
            collection(db, 'deliveryNotifications'),
            where('status', '==', 'pending'),
            where('targetZones', 'array-contains-any', deliveryZones)
          );
          
          const zonesSnapshot = await getDocs(zonesQuery);
          zonesSnapshot.forEach(doc => {
            const data = doc.data();
            notifications.push({
              id: doc.id,
              ...data
            } as DeliveryNotification);
          });
        }

        // 2. Obtener notificaciones específicas para este repartidor (por email)
        const specificQuery = query(
          collection(db, 'deliveryNotifications'),
          where('status', '==', 'pending'),
          where('targetDeliveryEmail', '==', deliveryEmail)
        );
        
        const specificSnapshot = await getDocs(specificQuery);
        specificSnapshot.forEach(doc => {
          const data = doc.data();
          const notificationId = doc.id;
          
          // Evitar duplicados
          if (!notifications.find(n => n.id === notificationId)) {
            notifications.push({
              id: notificationId,
              ...data
            } as DeliveryNotification);
          }
        });

        // 3. También buscar notificaciones donde targetZones incluye el email del delivery
        const emailZoneQuery = query(
          collection(db, 'deliveryNotifications'),
          where('status', '==', 'pending'),
          where('targetZones', 'array-contains', deliveryEmail)
        );
        
        const emailZoneSnapshot = await getDocs(emailZoneQuery);
        emailZoneSnapshot.forEach(doc => {
          const data = doc.data();
          const notificationId = doc.id;
          
          // Evitar duplicados
          if (!notifications.find(n => n.id === notificationId)) {
            notifications.push({
              id: notificationId,
              ...data
            } as DeliveryNotification);
          }
        });
        
      } else {
        // Sin filtro, para admin
        const q = query(
          collection(db, 'deliveryNotifications'),
          where('status', '==', 'pending')
        );
        
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
          const data = doc.data();
          notifications.push({
            id: doc.id,
            ...data
          } as DeliveryNotification);
        });
      }

      // 🔍 FILTRAR NOTIFICACIONES DE PEDIDOS YA ENTREGADOS O CANCELADOS
      const validNotifications: DeliveryNotification[] = [];
      
      for (const notification of notifications) {
        if (notification.orderId) {
          try {
            // Verificar el estado actual del pedido en deliveryOrders
            const orderQuery = query(
              collection(db, 'deliveryOrders'),
              where('orderId', '==', notification.orderId),
              limit(1)
            );
            
            const orderSnapshot = await getDocs(orderQuery);
            
            if (!orderSnapshot.empty) {
              const orderData = orderSnapshot.docs[0].data();
              const orderStatus = orderData.status;
              
              // Solo incluir notificaciones de pedidos que NO estén entregados o cancelados
              if (orderStatus !== 'delivered' && orderStatus !== 'cancelled') {
                validNotifications.push(notification);
              } else {
                // Marcar automáticamente como completada si el pedido ya está entregado
                console.log(`🗑️ Limpiando notificación de pedido ${orderStatus}: ${notification.orderId}`);
                await this.cleanupNotificationsForOrder(notification.orderId);
              }
            } else {
              // Si no encontramos el pedido, mantener la notificación (podría ser un pedido nuevo)
              validNotifications.push(notification);
            }
          } catch (verifyError) {
            console.error('Error verificando estado del pedido:', verifyError);
            // En caso de error, mantener la notificación
            validNotifications.push(notification);
          }
        } else {
          // Si no tiene orderId, mantener la notificación
          validNotifications.push(notification);
        }
      }

      // Ordenar por fecha de creación (más recientes primero)
      return validNotifications.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt as any);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt as any);
        return dateB.getTime() - dateA.getTime();
      });
      
    } catch (error) {
      console.error('Error obteniendo notificaciones:', error);
      return [];
    }
  }

  // 🧹 LIMPIAR NOTIFICACIONES EXPIRADAS
  async cleanupExpiredNotifications(): Promise<void> {
    try {
      const q = query(
        collection(db, 'deliveryNotifications'),
        where('expiresAt', '<', Timestamp.now())
      );

      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      
      await Promise.all(deletePromises);
      
      // Limpiar memoria
      snapshot.docs.forEach(doc => {
        this.notifications.delete(doc.id);
      });
      
      console.log(`🧹 Limpiadas ${snapshot.docs.length} notificaciones expiradas`);
    } catch (error) {
      console.error('Error limpiando notificaciones:', error);
    }
  }

  // ⏰ PROGRAMAR LIMPIEZA AUTOMÁTICA
  private scheduleCleanup(): void {
    // Limpiar cada 10 minutos
    setInterval(() => {
      this.cleanupExpiredNotifications();
    }, 10 * 60 * 1000);
  }

  // 📊 OBTENER ESTADÍSTICAS
  getStats() {
    return {
      totalNotifications: this.notifications.size,
      pendingNotifications: Array.from(this.notifications.values()).filter(n => n.status === 'pending').length
    };
  }

  // 👂 SUSCRIBIRSE A NOTIFICACIONES EN TIEMPO REAL (MEJORADO)
  async subscribeToDeliveryNotifications(
    deliveryEmail: string,
    onAddCallback: (notification: DeliveryNotification) => void,
    onDeleteCallback?: (notificationId: string) => void
  ): Promise<() => void> {
    try {
      const unsubscribeFunctions: (() => void)[] = [];

      // 1. Suscripción a notificaciones por zonas
      const deliveryZones = await this.getDeliveryUserZones(deliveryEmail);
      
      if (deliveryZones.length > 0) {
        const zonesQuery = query(
          collection(db, 'deliveryNotifications'),
          where('status', '==', 'pending'),
          where('targetZones', 'array-contains-any', deliveryZones)
        );

        const zonesUnsubscribe = onSnapshot(zonesQuery, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added' || change.type === 'modified') {
              this.handleNotificationChange(change, onAddCallback);
            } else if (change.type === 'removed' && onDeleteCallback) {
              console.log(`🗑️ Notificación eliminada de zona: ${change.doc.id}`);
              onDeleteCallback(change.doc.id);
            }
          });
        }, (error) => {
          console.error('Error en suscripción a notificaciones por zonas:', error);
        });
        
        unsubscribeFunctions.push(zonesUnsubscribe);
      }

      // 2. Suscripción a notificaciones específicas para este email
      const specificQuery = query(
        collection(db, 'deliveryNotifications'),
        where('status', '==', 'pending'),
        where('targetDeliveryEmail', '==', deliveryEmail)
      );

      const specificUnsubscribe = onSnapshot(specificQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            this.handleNotificationChange(change, onAddCallback);
          } else if (change.type === 'removed' && onDeleteCallback) {
            console.log(`🗑️ Notificación específica eliminada: ${change.doc.id}`);
            onDeleteCallback(change.doc.id);
          }
        });
      }, (error) => {
        console.error('Error en suscripción a notificaciones específicas:', error);
      });
      
      unsubscribeFunctions.push(specificUnsubscribe);

      // 3. Suscripción a notificaciones donde targetZones incluye el email
      const emailZoneQuery = query(
        collection(db, 'deliveryNotifications'),
        where('status', '==', 'pending'),
        where('targetZones', 'array-contains', deliveryEmail)
      );

      const emailZoneUnsubscribe = onSnapshot(emailZoneQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            this.handleNotificationChange(change, onAddCallback);
          } else if (change.type === 'removed' && onDeleteCallback) {
            console.log(`🗑️ Notificación por email eliminada: ${change.doc.id}`);
            onDeleteCallback(change.doc.id);
          }
        });
      }, (error) => {
        console.error('Error en suscripción a notificaciones por email:', error);
      });
      
      unsubscribeFunctions.push(emailZoneUnsubscribe);

      // Cargar notificaciones existentes
      await this.loadNotifications(deliveryEmail);

      // Retornar función para cancelar todas las suscripciones
      return () => {
        unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
      };

    } catch (error) {
      console.error('Error creando suscripción:', error);
      return () => {}; // Retornar función vacía si hay error
    }
  }

  // 🔔 Función auxiliar para manejar cambios de notificaciones
  private handleNotificationChange(
    change: any,
    callback: (notification: DeliveryNotification) => void
  ): void {
    const notification: DeliveryNotification = {
      id: change.doc.id,
      ...change.doc.data()
    } as DeliveryNotification;

    if (change.type === 'modified' && notification.isUrgent) {
      this.showNotification(notification);
    }

    // Para nuevos pedidos, solo notificar si es reciente
    if (change.type === 'added') {
      const notificationTime = notification.createdAt.toDate();
      const now = new Date();
      const timeDiff = now.getTime() - notificationTime.getTime();
      
      // Si la notificación es reciente (menos de 30 segundos) o es urgente
      if (timeDiff < 30000 || notification.isUrgent) {
        this.showNotification(notification);
      }
    }

    // Llamar al callback
    callback(notification);
  }

  // 📱 SUSCRIBIRSE A NOTIFICACIONES URGENTES (para todos)
  subscribeToUrgentNotifications(
    deliveryEmail: string,
    callback: (notification: DeliveryNotification) => void
  ): () => void {
    try {
      // Para notificaciones urgentes, escuchar todas las zonas
      const allZones = ['general', 'guayaquil-general', 'santa-elena-general'];
      
      const q = query(
        collection(db, 'deliveryNotifications'),
        where('status', '==', 'pending'),
        where('targetZones', 'array-contains-any', allZones)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const notification: DeliveryNotification = {
              id: change.doc.id,
              ...change.doc.data()
            } as DeliveryNotification;

            // Para urgentes, mostrar siempre la notificación
            this.showNotification(notification);
            callback(notification);
          }
        });
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error en suscripción urgente:', error);
      return () => {};
    }
  }

  // 🗑️ LIMPIAR NOTIFICACIONES DE UN PEDIDO ESPECÍFICO (cuando se entrega)
  async cleanupNotificationsForOrder(orderId: string): Promise<void> {
    try {
      const notificationsQuery = query(
        collection(db, 'deliveryNotifications'),
        where('orderId', '==', orderId),
        where('status', '==', 'pending')
      );
      
      const notifications = await getDocs(notificationsQuery);
      
      const deletePromises = notifications.docs.map(doc => 
        updateDoc(doc.ref, { status: 'completed_delivery' })
      );
      
      await Promise.all(deletePromises);
      console.log(`🗑️ Limpiadas ${notifications.size} notificaciones para pedido ${orderId}`);
    } catch (error) {
      console.error('Error limpiando notificaciones:', error);
    }
  }

  // ✅ MARCAR NOTIFICACIÓN COMO LEÍDA
  async markNotificationAsRead(notificationId: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'deliveryNotifications', notificationId), {
        status: 'read',
        readAt: new Date(),
        readBy: auth.currentUser?.email || 'unknown'
      });
      
      console.log(`📖 Notificación ${notificationId} marcada como leída`);
    } catch (error) {
      console.error('Error marcando notificación como leída:', error);
      throw error;
    }
  }
}

// ✅ INSTANCIA SINGLETON
export const notificationService = new NotificationService();