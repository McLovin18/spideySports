'use client';

import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Badge, Table, Form, Alert, Spinner, Modal } from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/adminContext';
import jsPDF from 'jspdf';
// import { ProtectedRoute } from '../../utils/securityMiddleware';

// Componente temporal ProtectedRoute
const ProtectedRoute = ({ children, requiredRole }: { children: React.ReactNode, requiredRole?: string }) => {
  return <>{children}</>;
};
import { 
  getAllOrderDays, 
  getDailyOrders, 
  getTodayOrders, 
  getOrdersStatistics,
  DailyOrdersDocument,
  DailyOrder 
} from '../../services/purchaseService';
import { 
  getPendingOrders, 
  getAllDeliveryOrders, // ðŸ†• Importar funciÃ³n para TODAS las Ã³rdenes
  assignOrderToDelivery, 
  getAvailableDeliveryUsers,
  DeliveryOrder 
} from '../../services/deliveryService';
import { db } from '../../utils/firebase';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { notificationService } from '../../services/notificationService';
import { EmailService } from '../../services/emailService';
import NavbarComponent from '../../components/Navbar';
import Sidebar from '../../components/Sidebar';
import DeliverySettings from '../../components/DeliverySettings';
import TopbarMobile from '../../components/TopbarMobile';
import Footer from '../../components/Footer';
import StockAlert from '../../components/StockAlert';

export default function AdminOrdersPage() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useRole();
  const [orderDays, setOrderDays] = useState<DailyOrdersDocument[]>([]);
  const [selectedDayOrders, setSelectedDayOrders] = useState<DailyOrdersDocument | null>(null);
  const [todayOrders, setTodayOrders] = useState<DailyOrdersDocument | null>(null);
  const [statistics, setStatistics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // âœ… Estados para delivery management
  const [pendingDeliveries, setPendingDeliveries] = useState<DeliveryOrder[]>([]);
  const [allDeliveries, setAllDeliveries] = useState<DeliveryOrder[]>([]); // ðŸ†• TODAS las Ã³rdenes
  const [availableDeliveryUsers, setAvailableDeliveryUsers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'orders' | 'deliveries' | 'delivery-settings'>('orders');
  
  // ðŸ†• Estados para monitoreo avanzado
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<DeliveryOrder | null>(null);
  const [showOrderDetailsModal, setShowOrderDetailsModal] = useState(false);
  
  // ðŸ†• Estados para filtro de fechas y exportaciÃ³n
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [filteredDeliveries, setFilteredDeliveries] = useState<DeliveryOrder[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // ðŸš€ NUEVOS ESTADOS PARA FILTROS AVANZADOS
  const [allOrders, setAllOrders] = useState<DeliveryOrder[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<DeliveryOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<'today' | 'week' | 'month' | 'custom'>('week');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'delivered' | 'pending' | 'emergency'>('all');
  const [deliveryPersonFilter, setDeliveryPersonFilter] = useState<string>('all');

  // ðŸ”¥ ESCUCHA EN TIEMPO REAL PARA Ã“RDENES DE DELIVERY
  useEffect(() => {
    if (!user || !isAdmin) return;

    console.log('ðŸŽ¯ Admin: Configurando escucha en tiempo real para Ã³rdenes de delivery');
    
    let unsubscribe: (() => void) | null = null;

    const setupRealtimeListener = async () => {
      try {
        const { onSnapshot, collection, query, orderBy } = await import('firebase/firestore');
        
        // Escuchar cambios en deliveryOrders
        const deliveryOrdersQuery = query(
          collection(db, 'deliveryOrders'),
          orderBy('date', 'desc')
        );
        
        unsubscribe = onSnapshot(deliveryOrdersQuery, (snapshot) => {
          console.log(`ðŸ”„ Admin: Cambio detectado en deliveryOrders (${snapshot.docs.length} Ã³rdenes)`);
          
          const orders: DeliveryOrder[] = [];
          const pending: DeliveryOrder[] = [];
          
          snapshot.forEach((doc) => {
            const orderData = { id: doc.id, ...doc.data() } as DeliveryOrder;
            orders.push(orderData);
            
            if (orderData.status === 'pending') {
              pending.push(orderData);
            }
          });
          
          // Actualizar estados automÃ¡ticamente
          setAllDeliveries(orders);
          setPendingDeliveries(pending);
          
          // Filtrar por fecha seleccionada
          const filtered = orders.filter(order => {
            if (!selectedDeliveryDate) return true;
            const orderDate = new Date(order.date).toISOString().split('T')[0];
            return orderDate === selectedDeliveryDate;
          });
          setFilteredDeliveries(filtered);
          
          console.log(`ðŸ“Š Admin: Actualizado - ${orders.length} total, ${pending.length} pendientes, ${filtered.length} filtradas`);
        }, (error) => {
          console.error('âŒ Error en escucha en tiempo real:', error);
        });
        
      } catch (error) {
        console.error('âŒ Error configurando escucha en tiempo real:', error);
      }
    };

    setupRealtimeListener();

    return () => {
      if (unsubscribe) {
        console.log('ðŸ”‡ Admin: Desconectando escucha en tiempo real');
        unsubscribe();
      }
    };
  }, [user, isAdmin, selectedDeliveryDate]);

  useEffect(() => {
    if (user && isAdmin) {
      loadOrderData();
    }
  }, [user, isAdmin]);

  // ðŸ†• Filtrar entregas por fecha seleccionada
  useEffect(() => {
    if (allDeliveries.length > 0) {
      const filtered = allDeliveries.filter(delivery => {
        const deliveryDate = new Date(delivery.date).toISOString().split('T')[0];
        return deliveryDate === selectedDeliveryDate;
      });
      setFilteredDeliveries(filtered);
    }
  }, [allDeliveries, selectedDeliveryDate]);

  const loadOrderData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargar dÃ­as con pedidos
      const days = await getAllOrderDays();
      setOrderDays(days);

      // Cargar pedidos de hoy
      const today = await getTodayOrders();
      setTodayOrders(today);

      // Cargar estadÃ­sticas de los Ãºltimos 30 dÃ­as
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const stats = await getOrdersStatistics(startDate, endDate);
      setStatistics(stats);

      // âœ… Cargar datos de delivery
      const pending = await getPendingOrders();
      setPendingDeliveries(pending);
      
      // ðŸ†• Cargar TODAS las Ã³rdenes de delivery para estadÃ­sticas correctas
      const allOrders = await getAllDeliveryOrders();
      setAllDeliveries(allOrders);
      setAllOrders(allOrders); // ðŸš€ Nuevo estado para filtros
      
      const deliveryUsers = await getAvailableDeliveryUsers();
      setAvailableDeliveryUsers(deliveryUsers);

      // Establecer fechas por defecto para filtros
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Inicio de semana (domingo)
      setStartDate(weekStart.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);

      // ðŸ§¹ LIMPIEZA AUTOMÃTICA DE NOTIFICACIONES AL CARGAR LA PÃGINA
      try {
        await notificationService.cleanupExpiredNotifications();
        console.log('ðŸ§¹ Limpieza automÃ¡tica de notificaciones completada');
      } catch (cleanupError) {
        console.error('Error en limpieza automÃ¡tica:', cleanupError);
        // No fallar la carga principal por esto
      }

    } catch (error: any) {
      console.error('Error al cargar datos de pedidos:', error);
      
      if (error?.code === 'permission-denied' || error?.message?.includes('permissions')) {
        setError(
          'Error de permisos: Las reglas de Firestore necesitan ser actualizadas para permitir acceso a la colecciÃ³n dailyOrders. ' +
          'Contacta al desarrollador para configurar los permisos correctos.'
        );
      } else {
        setError('Error al cargar los datos de pedidos: ' + (error?.message || 'Error desconocido'));
      }
    } finally {
      setLoading(false);
    }
  };

  // ðŸš€ FUNCIÃ“N PARA CALCULAR RANGO DE FECHAS
  const getDateRange = (filter: string) => {
    const today = new Date();
    let start: Date, end: Date;
    
    switch (filter) {
      case 'today':
        start = new Date(today);
        end = new Date(today);
        break;
      case 'week':
        start = new Date(today);
        start.setDate(today.getDate() - today.getDay()); // Inicio de semana
        end = new Date(today);
        end.setDate(start.getDate() + 6); // Final de semana
        break;
      case 'month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      default: // custom
        return null;
    }
    
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  };

  // ðŸš€ EFECTO PARA FILTRAR Ã“RDENES
  useEffect(() => {
    let filtered = [...allOrders];
    
    // Filtro por fecha
    if (dateRangeFilter !== 'custom') {
      const range = getDateRange(dateRangeFilter);
      if (range) {
        filtered = filtered.filter(order => {
          const orderDate = new Date(order.date).toISOString().split('T')[0];
          return orderDate >= range.start && orderDate <= range.end;
        });
      }
    } else if (startDate && endDate) {
      filtered = filtered.filter(order => {
        const orderDate = new Date(order.date).toISOString().split('T')[0];
        return orderDate >= startDate && orderDate <= endDate;
      });
    }
    
    // Filtro por estado
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => {
        switch (statusFilter) {
          case 'delivered':
            return order.status === 'delivered';
          case 'pending':
            return order.status === 'pending';
          case 'emergency':
            return order.isEmergency || order.priority === 'high';
          default:
            return true;
        }
      });
    }
    
    // Filtro por repartidor
    if (deliveryPersonFilter !== 'all') {
      filtered = filtered.filter(order => 
        order.assignedTo === deliveryPersonFilter || 
        (!order.assignedTo && deliveryPersonFilter === 'unassigned')
      );
    }
    
    // Filtro por bÃºsqueda
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(order => 
        order.userName?.toLowerCase().includes(term) ||
        order.userEmail?.toLowerCase().includes(term) ||
        order.id.toLowerCase().includes(term) ||
        order.fullOrderId?.toLowerCase().includes(term) ||
        order.assignedTo?.toLowerCase().includes(term)
      );
    }
    
    // Ordenar por fecha (mÃ¡s recientes primero) y luego por emergencia
    filtered.sort((a, b) => {
      // Primero emergencias
      if (a.isEmergency && !b.isEmergency) return -1;
      if (!a.isEmergency && b.isEmergency) return 1;
      
      // Luego por fecha
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    
    setFilteredOrders(filtered);
  }, [allOrders, dateRangeFilter, startDate, endDate, statusFilter, deliveryPersonFilter, searchTerm]);

  // ðŸš€ FUNCIÃ“N PARA CAMBIAR RANGO DE FECHAS
  const handleDateRangeChange = (filter: string) => {
    setDateRangeFilter(filter as any);
    
    if (filter !== 'custom') {
      const range = getDateRange(filter);
      if (range) {
        setStartDate(range.start);
        setEndDate(range.end);
      }
    }
  };

  const handleDateSelect = async (date: string) => {
    try {
      setSelectedDate(date);
      const dayOrders = await getDailyOrders(date);
      setSelectedDayOrders(dayOrders);
    } catch (error) {
      console.error('Error al cargar pedidos del dÃ­a:', error);
      setError('Error al cargar pedidos del dÃ­a seleccionado');
    }
  };

  // âœ… FunciÃ³n para asignar orden a repartidor
  const handleAssignDelivery = async (orderId: string, deliveryEmail: string) => {
    try {
      await assignOrderToDelivery(orderId, deliveryEmail);
      
      // Actualizar la lista local
      setPendingDeliveries(prev => prev.filter(order => order.id !== orderId));
      
      // ðŸ†• Recargar todas las Ã³rdenes para estadÃ­sticas actualizadas
      const allOrders = await getAllDeliveryOrders();
      setAllDeliveries(allOrders);
      
      // Mostrar Ã©xito
      alert('âœ… Orden asignada correctamente al repartidor');
      
    } catch (error) {
      console.error('Error asignando orden:', error);
      alert('âŒ Error al asignar la orden');
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getReadableOrderId = (order: DailyOrder) => {
    const anyOrder: any = order as any;
    if (anyOrder.fullOrderId) return anyOrder.fullOrderId as string;
    const customerCode = anyOrder.customerCode as string | undefined;
    const orderNumber = anyOrder.orderNumber as string | undefined;
    if (customerCode && orderNumber) return `${customerCode}${orderNumber}`;
    if (orderNumber) return orderNumber;
    return order.id;
  };

  // Mostrar spinner mientras se verifica el rol de admin
  if (adminLoading) {
    return (
      <Container className="py-5 text-center">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Cargando...</span>
        </Spinner>
        <p className="mt-3 text-muted">Verificando permisos...</p>
      </Container>
    );
  }

  // Verificar si el usuario estÃ¡ autenticado
  if (!user) {
    return (
      <Container className="py-5 text-center">
        <Alert className="alert-cosmetic-warning">
          Debes iniciar sesiÃ³n para acceder a esta pÃ¡gina.
        </Alert>
      </Container>
    );
  }

  // Verificar si el usuario es administrador
  if (!isAdmin) {
    return (
      <Container className="py-5 text-center">
        <Alert className="alert-cosmetic-danger">
          <h4>ðŸš« Acceso Denegado</h4>
          <p>No tienes permisos para acceder al panel de administraciÃ³n.</p>
          <p className="small text-muted">
            Si crees que esto es un error, contacta al administrador del sistema.
          </p>
        </Alert>
      </Container>
    );
  }

  // âœ… FunciÃ³n para formatear fechas
  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // âœ… FunciÃ³n para obtener color del estado
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'pending': return 'warning';
      case 'assigned': return 'info';
      case 'picked_up': return 'primary';
      case 'in_transit': return 'primary';
      case 'delivered': return 'success';
      case 'cancelled': return 'danger';
      default: return 'secondary';
    }
  };

  // âœ… FunciÃ³n para obtener texto del estado
  const getStatusText = (status: string) => {
    switch(status) {
      case 'pending': return 'Pendiente';
      case 'assigned': return 'Asignado';
      case 'picked_up': return 'Recogido en AlmacÃ©n';
      case 'in_transit': return 'En trÃ¡nsito';
      case 'delivered': return 'Entregado';
      case 'cancelled': return 'Cancelado';
      default: return 'Desconocido';
    }
  };

  // âœ… FunciÃ³n para manejar Ã³rdenes urgentes
  const handleUrgentOrder = async (orderId: string) => {
    try {
      // Encontrar la orden completa
      const orderToMark = pendingDeliveries.find(order => order.id === orderId);
      if (!orderToMark) {
        alert('No se encontrÃ³ la orden');
        return;
      }

      // Marcar como urgente en Firestore
      await updateDoc(doc(db, 'deliveryOrders', orderId), {
        isUrgent: true,
        urgentMarkedAt: new Date(),
        priority: 'high'
      });

      // ðŸš¨ CREAR NOTIFICACIÃ“N URGENTE PARA TODOS LOS DELIVERY
      try {
        await notificationService.createUrgentNotificationForAll({
          id: orderToMark.id,
          orderId: orderToMark.id,
          userName: orderToMark.userName,
          userEmail: orderToMark.userEmail,
          total: orderToMark.total,
          items: orderToMark.items,
          deliveryLocation: orderToMark.deliveryLocation,
          shipping: orderToMark.shipping
        });
        
        console.log('ðŸš¨ NotificaciÃ³n urgente enviada a todos los repartidores');
      } catch (notificationError) {
        console.error('Error al enviar notificaciÃ³n urgente:', notificationError);
        // No detener el proceso si falla la notificaciÃ³n
      }

      alert('âœ… Orden marcada como urgente y notificada a todos los repartidores');
      
      // Recargar datos
      const orders = await getPendingOrders();
      setPendingDeliveries(orders);
      
      // ðŸ†• TambiÃ©n recargar todas las Ã³rdenes para estadÃ­sticas
      const allOrders = await getAllDeliveryOrders();
      setAllDeliveries(allOrders);
    } catch (error) {
      console.error('Error marking order as urgent:', error);
      alert('âŒ Error al marcar como urgente');
    }
  };

  // ðŸ†• FunciÃ³n para exportar PDF del dÃ­a seleccionado
  const handleExportPDF = async () => {
    try {
      setIsExporting(true);
      
      const doc = new jsPDF();
      const selectedDateFormatted = new Date(selectedDeliveryDate).toLocaleDateString('es-ES');
      
      // Configurar fuente para mejor compatibilidad
      doc.setFont('helvetica');
      
      // Header con logo y tÃ­tulo
      doc.setFontSize(24);
      doc.setTextColor(44, 62, 80); // Color azul oscuro
      doc.text('REPORTE DE ENTREGAS', 105, 25, { align: 'center' });
      
      // LÃ­nea decorativa
      doc.setDrawColor(52, 152, 219); // Color azul
      doc.setLineWidth(2);
      doc.line(20, 30, 190, 30);
      
      // Fecha
      doc.setFontSize(16);
      doc.setTextColor(52, 73, 94);
      doc.text(`Fecha: ${selectedDateFormatted}`, 20, 45);
      
      // EstadÃ­sticas del dÃ­a en cajas
      const dayStats = {
        total: filteredDeliveries.length,
        entregadas: filteredDeliveries.filter(d => d.status === 'delivered').length,
        pendientes: filteredDeliveries.filter(d => 
          d.status === 'pending' || d.status === 'assigned' || d.status === 'picked_up' || d.status === 'in_transit'
        ).length,
        canceladas: filteredDeliveries.filter(d => d.status === 'cancelled').length
      };

      // SecciÃ³n de resumen
      doc.setFontSize(14);
      doc.setTextColor(44, 62, 80);
      doc.text('RESUMEN DEL DIA', 20, 65);
      
      // Cajas de estadÃ­sticas
      let boxY = 75;
      const boxWidth = 40;
      const boxHeight = 25;
      const boxSpacing = 45;
      
      // Caja Total
      doc.setFillColor(52, 152, 219); // Azul
      doc.rect(20, boxY, boxWidth, boxHeight, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.text(dayStats.total.toString(), 40, boxY + 12, { align: 'center' });
      doc.setFontSize(10);
      doc.text('TOTAL', 40, boxY + 20, { align: 'center' });
      
      // Caja Entregadas
      doc.setFillColor(46, 204, 113); // Verde
      doc.rect(20 + boxSpacing, boxY, boxWidth, boxHeight, 'F');
      doc.setFontSize(20);
      doc.text(dayStats.entregadas.toString(), 40 + boxSpacing, boxY + 12, { align: 'center' });
      doc.setFontSize(10);
      doc.text('ENTREGADAS', 40 + boxSpacing, boxY + 20, { align: 'center' });
      
      // Caja Pendientes
      doc.setFillColor(241, 196, 15); // Amarillo
      doc.rect(20 + boxSpacing * 2, boxY, boxWidth, boxHeight, 'F');
      doc.setFontSize(20);
      doc.text(dayStats.pendientes.toString(), 40 + boxSpacing * 2, boxY + 12, { align: 'center' });
      doc.setFontSize(10);
      doc.text('PENDIENTES', 40 + boxSpacing * 2, boxY + 20, { align: 'center' });
      
      // Caja Canceladas
      doc.setFillColor(231, 76, 60); // Rojo
      doc.rect(20 + boxSpacing * 3, boxY, boxWidth, boxHeight, 'F');
      doc.setFontSize(20);
      doc.text(dayStats.canceladas.toString(), 40 + boxSpacing * 3, boxY + 12, { align: 'center' });
      doc.setFontSize(10);
      doc.text('CANCELADAS', 40 + boxSpacing * 3, boxY + 20, { align: 'center' });

      // Tabla de Ã³rdenes
      let yPosition = 120;
      
      if (filteredDeliveries.length > 0) {
        // TÃ­tulo de la tabla
        doc.setTextColor(44, 62, 80);
        doc.setFontSize(14);
        doc.text('DETALLE DE ORDENES', 20, yPosition);
        yPosition += 15;

        // Header de la tabla con fondo
        doc.setFillColor(236, 240, 241); // Gris claro
        doc.rect(20, yPosition - 5, 170, 12, 'F');
        
        doc.setTextColor(44, 62, 80);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('HORA', 25, yPosition + 3);
        doc.text('CLIENTE', 55, yPosition + 3);
        doc.text('TOTAL', 105, yPosition + 3);
        doc.text('REPARTIDOR', 125, yPosition + 3);
        doc.text('ESTADO', 165, yPosition + 3);
        yPosition += 15;

        // LÃ­nea separadora
        doc.setDrawColor(189, 195, 199);
        doc.setLineWidth(0.5);
        doc.line(20, yPosition - 5, 190, yPosition - 5);

        // Datos de las Ã³rdenes
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        
        filteredDeliveries
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .forEach((order, index) => {
            if (yPosition > 260) {
              doc.addPage();
              yPosition = 30;
              
              // Repetir header en nueva pÃ¡gina
              doc.setFillColor(236, 240, 241);
              doc.rect(20, yPosition - 5, 170, 12, 'F');
              doc.setTextColor(44, 62, 80);
              doc.setFontSize(10);
              doc.setFont('helvetica', 'bold');
              doc.text('HORA', 25, yPosition + 3);
              doc.text('CLIENTE', 55, yPosition + 3);
              doc.text('TOTAL', 105, yPosition + 3);
              doc.text('REPARTIDOR', 125, yPosition + 3);
              doc.text('ESTADO', 165, yPosition + 3);
              yPosition += 15;
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(9);
            }

            // Alternar color de fondo para filas
            if (index % 2 === 0) {
              doc.setFillColor(249, 249, 249);
              doc.rect(20, yPosition - 3, 170, 10, 'F');
            }

            const orderTime = new Date(order.date).toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit'
            });

            doc.setTextColor(52, 73, 94);
            doc.text(orderTime, 25, yPosition + 2);
            
            // Nombre del cliente (mÃ¡ximo 20 caracteres)
            const clientName = (order.userName || 'Sin nombre').substring(0, 20);
            doc.text(clientName, 55, yPosition + 2);
            
            // Total con formato de moneda
            doc.text(`$${order.total.toFixed(2)}`, 105, yPosition + 2);
            
            // Repartidor (solo nombre, sin @domain)
            const deliveryPerson = order.assignedTo 
              ? order.assignedTo.split('@')[0].substring(0, 15)
              : 'Sin asignar';
            doc.text(deliveryPerson, 125, yPosition + 2);
            
            // Estado con color
            const statusText = getStatusText(order.status);
            switch(order.status) {
              case 'delivered':
                doc.setTextColor(46, 204, 113); // Verde
                break;
              case 'pending':
                doc.setTextColor(241, 196, 15); // Amarillo
                break;
              case 'cancelled':
                doc.setTextColor(231, 76, 60); // Rojo
                break;
              default:
                doc.setTextColor(52, 152, 219); // Azul
            }
            doc.text(statusText.substring(0, 12), 165, yPosition + 2);
            
            yPosition += 12;
            
            // LÃ­nea sutil entre filas
            doc.setDrawColor(236, 240, 241);
            doc.setLineWidth(0.2);
            doc.line(20, yPosition - 6, 190, yPosition - 6);
          });
      } else {
        doc.setTextColor(149, 165, 166);
        doc.setFontSize(12);
        doc.text('No hay ordenes para mostrar en esta fecha.', 105, yPosition, { align: 'center' });
      }

      // Footer con informaciÃ³n del sistema
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        
        // LÃ­nea decorativa en footer
        doc.setDrawColor(52, 152, 219);
        doc.setLineWidth(1);
        doc.line(20, 280, 190, 280);
        
        // InformaciÃ³n del footer
        doc.setTextColor(127, 140, 141);
        doc.setFontSize(8);
        doc.text(`Generado el ${new Date().toLocaleString('es-ES')}`, 20, 290);
        doc.text('Sistema de Gestion de Entregas - Tienda Online', 105, 290, { align: 'center' });
        doc.text(`Pagina ${i} de ${pageCount}`, 190, 290, { align: 'right' });
      }

      // Descargar el PDF
      const fileName = `entregas-${selectedDateFormatted.replace(/\//g, '-')}.pdf`;
      doc.save(fileName);
      
    } catch (error) {
      console.error('Error generando PDF:', error);
      alert('Error al generar el PDF');
    } finally {
      setIsExporting(false);
    }
  };

  // âœ… FunciÃ³n para obtener nombre del cliente
  const getClientName = (order: DeliveryOrder) => {
    return order.userName || order.userEmail || 'Cliente desconocido';
  };

  // âœ… FunciÃ³n para obtener nombre del repartidor
  const getDeliveryPersonName = (deliveryPersonId?: string) => {
    if (!deliveryPersonId) return 'Sin asignar';
    const delivery = availableDeliveryUsers.find(d => d.uid === deliveryPersonId || d.email === deliveryPersonId);
    return delivery?.name || 'Repartidor desconocido';
  };

  // âœ… FunciÃ³n para marcar como urgente
  const markAsUrgent = async (orderId: string) => {
    try {
      // Encontrar la orden completa
      const orderToMark = pendingDeliveries.find(order => order.id === orderId);
      if (!orderToMark) {
        alert('No se encontrÃ³ la orden');
        return;
      }

      // Marcar como urgente en Firestore
      await updateDoc(doc(db, 'deliveryOrders', orderId), {
        isUrgent: true,
        urgentMarkedAt: new Date(),
        priority: 'high'
      });

      // ðŸš¨ CREAR NOTIFICACIÃ“N URGENTE PARA TODOS LOS DELIVERY
      try {
        await notificationService.createUrgentNotificationForAll({
          id: orderToMark.id,
          orderId: orderToMark.id,
          userName: orderToMark.userName,
          userEmail: orderToMark.userEmail,
          total: orderToMark.total,
          items: orderToMark.items,
          deliveryLocation: orderToMark.deliveryLocation,
          shipping: orderToMark.shipping
        });
        
        console.log('ðŸš¨ NotificaciÃ³n urgente enviada a todos los repartidores');
      } catch (notificationError) {
        console.error('Error al enviar notificaciÃ³n urgente:', notificationError);
        // No detener el proceso si falla la notificaciÃ³n
      }

      alert('âœ… Pedido marcado como urgente y notificado a todos los repartidores');
      setShowOrderDetailsModal(false);
      
      // Recargar datos
      const orders = await getPendingOrders();
      setPendingDeliveries(orders);
      
      // ðŸ†• TambiÃ©n recargar todas las Ã³rdenes para estadÃ­sticas
      const allOrders = await getAllDeliveryOrders();
      setAllDeliveries(allOrders);
    } catch (error) {
      console.error('Error marking order as urgent:', error);
      alert('âŒ Error al marcar como urgente');
    }
  };

  // âœ… FunciÃ³n para contactar repartidor con notificaciÃ³n y email
  const contactDeliveryPerson = async (order: DeliveryOrder) => {
    if (!order.assignedTo) {
      alert('Esta orden no tiene repartidor asignado');
      return;
    }

    try {
      const repartidor = availableDeliveryUsers.find(d => d.email === order.assignedTo);
      const repartidorName = repartidor?.name || order.assignedTo?.split('@')[0] || 'Repartidor';

      const confirmed = confirm(
        `Â¿Contactar a ${repartidorName} sobre la entrega urgente?\n\n` +
        `Se enviarÃ¡:\n` +
        `â€¢ NotificaciÃ³n push en la app\n` +
        `â€¢ Email al repartidor\n` +
        `â€¢ MarcarÃ¡ la orden como prioritaria`
      );

      if (!confirmed) return;

      // 1. Marcar orden como urgente en Firestore
      await updateDoc(doc(db, 'deliveryOrders', order.id || ''), {
        isUrgent: true,
        urgentMarkedAt: new Date(),
        priority: 'high',
        adminContactedAt: new Date(),
        adminContactReason: 'Seguimiento urgente solicitado por administrador'
      });

      // 2. Crear notificaciÃ³n especÃ­fica para el repartidor asignado
      try {
        await addDoc(collection(db, 'deliveryNotifications'), {
          type: 'urgent_delivery', // Cambiar tipo para indicar que es para entrega urgente
          orderId: order.id,
          targetDeliveryEmail: order.assignedTo,
          targetDeliveryName: repartidorName,
          targetZones: [order.assignedTo], // Usar email como zona especÃ­fica
          title: 'ðŸš¨ ENTREGA URGENTE REQUERIDA',
          message: `El administrador solicita que entregues URGENTEMENTE el pedido #${order.id?.substring(0, 8)} asignado a ti. Cliente: ${order.userName}. Total: $${order.total}. Procede con la entrega inmediatamente.`,
          orderData: {
            userName: order.userName,
            userEmail: order.userEmail,
            total: order.total,
            items: order.items,
            deliveryLocation: order.deliveryLocation || {
              city: order.shipping?.city || 'No especificada',
              zone: order.shipping?.zone || 'No especificada', 
              address: order.shipping?.address || 'No especificada',
              phone: order.shipping?.phone || 'No especificado'
            },
            currentStatus: order.status // Incluir estado actual
          },
          adminMessage: `Este pedido YA ESTÃ ASIGNADO a ti. Solo necesitas acelerar la entrega. No requiere nueva aceptaciÃ³n.`,
          actionRequired: 'URGENT_DELIVERY', // AcciÃ³n especÃ­fica: entregar urgente
          currentOrderStatus: order.status,
          isAssignedOrder: true, // Marcar que ya estÃ¡ asignado
          status: 'pending',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 horas para entrega urgente
          priority: 'critical',
          isUrgent: true,
          assignedDeliveryPerson: order.assignedTo
        });

        console.log('ðŸ“± NotificaciÃ³n especÃ­fica de entrega urgente enviada a:', order.assignedTo);
      } catch (notificationError) {
        console.error('Error enviando notificaciÃ³n especÃ­fica:', notificationError);
      }

      // 3. NO enviar notificaciÃ³n general a todos si ya estÃ¡ asignado
      // Solo notificamos al repartidor especÃ­fico para entrega urgente
      console.log('ðŸ“± NotificaciÃ³n especÃ­fica enviada. No se envÃ­a a todos los repartidores porque ya estÃ¡ asignado.');

      // 3. Enviar email profesional usando el servicio de email
      EmailService.sendUrgentContactEmail({
        deliveryPersonEmail: order.assignedTo,
        deliveryPersonName: repartidorName,
        order: {
          id: order.id || '',
          userName: order.userName,
          userEmail: order.userEmail,
          total: order.total,
          shipping: order.shipping
        },
        adminMessage: 'Este pedido YA ESTÃ ASIGNADO a ti. Solo necesitas acelerar la entrega - no requiere nueva aceptaciÃ³n. Entregar lo antes posible.'
      });

      // 4. Mostrar confirmaciÃ³n al admin
      alert(`âœ… NotificaciÃ³n de entrega urgente enviada a ${repartidorName}\n\n` +
            `â€¢ NotificaciÃ³n push enviada (entrega urgente)\n` +
            `â€¢ Email enviado al repartidor\n` +
            `â€¢ Orden marcada como urgente\n\n` +
            `El repartidor recibirÃ¡ instrucciones para acelerar la entrega del pedido ya asignado.`);

      // 5. Recargar datos para mostrar el estado actualizado
      const orders = await getPendingOrders();
      setPendingDeliveries(orders);
      
      const allOrders = await getAllDeliveryOrders();
      setAllDeliveries(allOrders);

    } catch (error) {
      console.error('Error contactando repartidor:', error);
      alert('âŒ Error al contactar repartidor. IntÃ©ntalo de nuevo.');
    }
  };

  // ðŸ“§ FunciÃ³n para enviar email simple de seguimiento (sin marcar como urgente)
  const sendFollowUpEmail = (order: DeliveryOrder) => {
    if (!order.assignedTo) {
      alert('Esta orden no tiene repartidor asignado');
      return;
    }

    const repartidor = availableDeliveryUsers.find(d => d.email === order.assignedTo);
    const repartidorName = repartidor?.name || order.assignedTo?.split('@')[0] || 'Repartidor';

    const template = EmailService.createFollowUpTemplate(order.assignedTo, {
      id: order.id,
      userName: order.userName,
      total: order.total
    });

    // Abrir email cliente con template simple
    const subject = encodeURIComponent(template.subject);
    const body = encodeURIComponent(template.text);
    window.open(`mailto:${order.assignedTo}?subject=${subject}&body=${body}`);
  };

  // ðŸ§¹ FunciÃ³n para limpiar notificaciones manualmente
  const handleCleanupNotifications = async () => {
    const confirmed = confirm(
      'Â¿Limpiar todas las notificaciones expiradas y completadas?\n\n' +
      'Esta acciÃ³n:\n' +
      'â€¢ MarcarÃ¡ como expiradas las notificaciones vencidas\n' +
      'â€¢ EliminarÃ¡ notificaciones muy antiguas (>24h)\n' +
      'â€¢ LimpiarÃ¡ notificaciones de pedidos ya entregados\n\n' +
      'Â¿Continuar?'
    );

    if (!confirmed) return;

    try {
      await notificationService.cleanupExpiredNotifications();
      
      // TambiÃ©n limpiar notificaciones de todos los pedidos entregados
      const deliveredOrders = allDeliveries.filter(order => order.status === 'delivered');
      const cleanupPromises = deliveredOrders.map(order => 
        notificationService.cleanupNotificationsForOrder(order.id || order.orderId || '')
      );
      
      await Promise.all(cleanupPromises);
      
      alert(`âœ… Limpieza completada exitosamente!\n\n` +
            `â€¢ Notificaciones expiradas procesadas\n` +
            `â€¢ ${deliveredOrders.length} pedidos entregados limpiados\n` +
            `â€¢ Notificaciones antiguas eliminadas`);
      
    } catch (error) {
      console.error('Error en limpieza:', error);
      alert('âŒ Error durante la limpieza. Ver consola para detalles.');
    }
  };

  // âœ… FunciÃ³n para ver detalles del pedido
  const viewOrderDetails = (order: DeliveryOrder) => {
    setSelectedOrderDetails(order);
    setShowOrderDetailsModal(true);
  };

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="d-flex flex-column min-vh-100">
        <TopbarMobile />
        
        <div className="d-flex flex-grow-1">
          <Sidebar />
          
          <main className="flex-grow-1 w-100" style={{ paddingTop: '1rem' }}>
          <Container fluid className="px-2 px-md-4">
            {/* Alertas de inventario */}
            <StockAlert className="mb-4" />
            
            {/* Header - Responsive */}
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-3 mb-md-4">
              <div className="mb-2 mb-md-0">
                <h1 className="fw-bold text-cosmetic-tertiary mb-1 fs-3 fs-md-1">
                  <span className="d-none d-sm-inline">Panel de AdministraciÃ³n</span>
                  <span className="d-sm-none">Admin Panel</span>
                </h1>
                <p className="text-muted mb-0 small">
                  <span className="d-none d-md-inline">Gestiona pedidos y asigna entregas</span>
                  <span className="d-md-none">Gestiona pedidos</span>
                </p>
              </div>
            </div>

            {/* Tabs de navegaciÃ³n - Responsive */}
            <div className="mb-3 mb-md-4">
              <div className="d-flex gap-2">
                <Button
                autoFocus
                  size="sm"
                  className="flex-fill flex-md-grow-0 btn-admin"
                  onClick={() => setActiveTab('orders')}
                >
                  <i className="bi bi-clipboard-data me-1 me-md-2"></i>
                  <span className="d-none d-sm-inline">Pedidos</span>
                  <span className="d-sm-none">Orders</span>
                </Button>
                <Button
                  className={activeTab === 'deliveries' ? 'btn-cosmetic-primary' : 'btn-outline-cosmetic-primary'}
                  size="sm"
                  className="flex-fill flex-md-grow-0 btn-admin"
                  onClick={() => setActiveTab('deliveries')}
                  
                >
                  <i className="bi bi-funnel-fill me-1 me-md-2"></i>
                  <span className="d-none d-sm-inline">GestiÃ³n Avanzada</span>
                  <span className="d-sm-none">Avanzada</span>
                  {pendingDeliveries.length > 0 && (
                    <Badge bg="danger" className="ms-1 ms-md-2">
                      {pendingDeliveries.length}
                    </Badge>
                  )}
                </Button>
                <Button
                  className={activeTab === 'delivery-settings' ? 'btn-cosmetic-accent' : 'btn-outline-cosmetic-accent'}
                  size="sm"
                  className="flex-fill flex-md-grow-0 btn-admin"
                  onClick={() => setActiveTab('delivery-settings')}
                >
                  <i className="bi bi-person-gear me-1 me-md-2"></i>
                  <span className="d-none d-sm-inline">Delivery Settings</span>
                  <span className="d-sm-none">Settings</span>
                </Button>
              </div>
            </div>

            {error && (
              <Alert className="alert-cosmetic-danger" dismissible onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {/* âœ… Contenido segÃºn tab activo */}
            {activeTab === 'orders' && (
              
              <>
                {/* EstadÃ­sticas generales */}
                {statistics && (
                  <Row className="mb-4">
                <Col md={3}>
                  <Card className="text-center border-0 shadow-sm">
                    <Card.Body>
                      <h3 className="fw-bold" style={{ color: "var(--cosmetic-primary)" }}>{statistics.totalOrders}</h3>
                      <p className="text-muted mb-0 small">Pedidos (30 dÃ­as)</p>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={3}>
                  <Card className="text-center border-0 shadow-sm">
                    <Card.Body>
                      <h3 className="fw-bold text-success">{formatCurrency(statistics.totalAmount)}</h3>
                      <p className="text-muted mb-0 small">Ventas (30 dÃ­as)</p>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={3}>
                  <Card className="text-center border-0 shadow-sm">
                    <Card.Body>
                      <h3 className="fw-bold text-info">{formatCurrency(statistics.averageOrderValue)}</h3>
                      <p className="text-muted mb-0 small">Valor promedio</p>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={3}>
                  <Card className="text-center border-0 shadow-sm">
                    <Card.Body>
                      <h3 className="fw-bold text-warning">{statistics.averageOrdersPerDay.toFixed(1)}</h3>
                      <p className="text-muted mb-0 small">Pedidos/dÃ­a promedio</p>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            )}

            {/* Pedidos de hoy */}
            {todayOrders && (
              <Card className="mb-4 border-0 shadow-sm">
                <Card.Header style={{ backgroundColor: "var(--cosmetic-primary)" }} className="text-white">
                  <h5 className="mb-0">ðŸ“… Pedidos de Hoy - {todayOrders.dateFormatted}</h5>
                  <small>Total: {todayOrders.totalOrdersCount} pedidos | {formatCurrency(todayOrders.totalDayAmount)}</small>
                </Card.Header>
                <Card.Body>
                  <Table responsive striped>
                    <thead>
                      <tr>
                        <th>Hora</th>
                        <th>Cliente</th>
                        <th>Productos</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayOrders.orders.map((order) => (
                        <tr key={order.id}>
                          <td>{order.orderTime}</td>
                          <td>
                            <div>
                              {/* Mostrar el nombre del usuario o email */}
                              <strong className="text-cosmetic-primary">
                                {order.userName || 
                                 (order.userEmail ? order.userEmail.split('@')[0] : 'Usuario')}
                              </strong>
                              {/* Siempre mostrar el email si estÃ¡ disponible */}
                              {order.userEmail ? (
                                <div className="small text-muted">{order.userEmail}</div>
                              ) : (
                                <div className="small text-muted">ID: {order.userId.substring(0, 12)}...</div>
                              )}
                              <div className="small text-muted">
                                ID pedido: {getReadableOrderId(order)}
                              </div>
                              {/* TODO: Agregar campo de telÃ©fono a DailyOrder si es necesario */}
                              {/* {order.shipping?.phone && (
                                <div className="small text-success fw-bold">
                                  <i className="bi bi-telephone me-1"></i>
                                  {order.shipping.phone}
                                </div>
                              )} */}
                            </div>
                          </td>
                          <td>
                            {order.items.length} producto{order.items.length !== 1 ? 's' : ''}
                          </td>
                          <td className="fw-bold text-success">{formatCurrency(order.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card.Body>
              </Card>
            )}

            <Row>
              {/* Lista de dÃ­as con pedidos */}
              <Col lg={4}>
                <Card className="border-0 shadow-sm">
                  <Card.Header>
                    <h5 className="mb-0">ðŸ“‹ DÃ­as con Pedidos</h5>
                  </Card.Header>
                  <Card.Body style={{ maxHeight: '600px', overflowY: 'auto' }}>
                    {loading ? (
                      <p className="text-center text-muted">Cargando...</p>
                    ) : orderDays.length === 0 ? (
                      <p className="text-center text-muted">No hay pedidos registrados</p>
                    ) : (
                      <div className="d-grid gap-2">
                        {orderDays.map((day) => (
                          <Button 
                          onMouseDown={(e) => e.preventDefault()}
                          
                            key={day.date}
                            variant={selectedDate === day.date ? "primary" : "outline-primary"}
                            onClick={() => handleDateSelect(day.date)}
                            className="text-start btn-adminOrders"

                          >
                            <div>
                              <strong>{day.dateFormatted}</strong>
                              <br />
                              <small>
                                {day.totalOrdersCount} pedidos - {formatCurrency(day.totalDayAmount)}
                              </small>
                            </div>
                          </Button>
                        ))}
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>

              {/* Detalles del dÃ­a seleccionado */}
              <Col lg={8}>
                {selectedDayOrders ? (
                  <Card className="border-0 shadow-sm">
                    <Card.Header>
                      <h5 className="mb-0">ðŸ“ Detalles - {selectedDayOrders.dateFormatted}</h5>
                      <small className="text-muted">
                        {selectedDayOrders.totalOrdersCount} pedidos | Total: {formatCurrency(selectedDayOrders.totalDayAmount)}
                      </small>
                    </Card.Header>
                    <Card.Body>
                      <Table responsive striped>
                        <thead>
                          <tr>
                            <th>Hora</th>
                            <th>Cliente</th>
                            <th>Productos</th>
                            <th>Cantidad</th>
                            <th>Total</th>
                            <th>Detalles</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedDayOrders.orders.map((order) => (
                            <tr key={order.id}>
                              <td>{order.orderTime}</td>
                              <td>
                                <div>
                                  {/* Mostrar el nombre del usuario o email */}
                                  <strong className="text-primary">
                                    {order.userName || 
                                     (order.userEmail ? order.userEmail.split('@')[0] : 'Usuario')}
                                  </strong>
                                  {/* Siempre mostrar el email si estÃ¡ disponible */}
                                  {order.userEmail ? (
                                    <div className="small text-muted">{order.userEmail}</div>
                                  ) : (
                                    <div className="small text-muted">ID: {order.userId.substring(0, 12)}...</div>
                                  )}
                                  <div className="small text-muted">
                                    ID pedido: {getReadableOrderId(order)}
                                  </div>
                                  {/* TODO: Agregar campo de telÃ©fono a DailyOrder si es necesario */}
                                  {/* {order.shipping?.phone && (
                                    <div className="small text-success fw-bold">
                                      <i className="bi bi-telephone me-1"></i>
                                      {order.shipping.phone}
                                    </div>
                                  )} */}
                                </div>
                              </td>
                              <td>{order.items.length}</td>
                              <td>
                                {order.items.reduce((sum, item) => sum + item.quantity, 0)} unidades
                              </td>
                              <td className="fw-bold text-success">{formatCurrency(order.total)}</td>
                              <td>
                                <details>
                                  <summary className="btn btn-sm btn-outline-info">Ver items</summary>
                                  <div className="mt-2">
                                    {order.items.map((item, idx) => (
                                      <div key={idx} className="small text-muted">
                                        â€¢ {item.name} - Qty: {item.quantity} - {formatCurrency(item.price * item.quantity)}
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </Card.Body>
                  </Card>
                ) : (
                  <Card className="border-0 shadow-sm">
                    <Card.Body className="text-center py-5">
                      <h5 className="text-muted">Selecciona un dÃ­a para ver los pedidos</h5>
                      <p className="text-muted">Haz clic en cualquier dÃ­a de la lista para ver sus detalles</p>
                    </Card.Body>
                  </Card>
                )}
              </Col>
            </Row>
            </>
            )}

            {/* ðŸš€ Tab de GestiÃ³n Avanzada de Pedidos */}
            {activeTab === 'deliveries' && (
              <>
                <Row className="mb-4">
                  <Col>
                    <h3 className="fw-bold mb-3">
                      <i className="bi bi-funnel me-2"></i>
                      GestiÃ³n Avanzada de Pedidos
                      <Badge bg="success" className="ms-2 fs-6">Vista Unificada</Badge>
                    </h3>
                    
                    {/* ðŸŽ›ï¸ FILTROS AVANZADOS */}
                    <Card className="mb-4 shadow-sm">
                      <Card.Body>
                        <Row className="align-items-end">
                          <Col md={3} className="mb-3">
                            <Form.Group>
                              <Form.Label className="small text-muted mb-1">ðŸ” Buscar pedido</Form.Label>
                              <Form.Control
                                type="text"
                                placeholder="Cliente, ID, repartidor..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                size="sm"
                              />
                            </Form.Group>
                          </Col>
                          <Col md={2} className="mb-3">
                            <Form.Group>
                              <Form.Label className="small text-muted mb-1">ðŸ“… PerÃ­odo</Form.Label>
                              <Form.Select
                                value={dateRangeFilter}
                                onChange={(e) => handleDateRangeChange(e.target.value)}
                                size="sm"
                              >
                                <option value="today">Hoy</option>
                                <option value="week">Esta semana</option>
                                <option value="month">Este mes</option>
                                <option value="custom">Rango personalizado</option>
                              </Form.Select>
                            </Form.Group>
                          </Col>
                          {dateRangeFilter === 'custom' && (
                            <>
                              <Col md={2} className="mb-3">
                                <Form.Group>
                                  <Form.Label className="small text-muted mb-1">Desde</Form.Label>
                                  <Form.Control
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    size="sm"
                                  />
                                </Form.Group>
                              </Col>
                              <Col md={2} className="mb-3">
                                <Form.Group>
                                  <Form.Label className="small text-muted mb-1">Hasta</Form.Label>
                                  <Form.Control
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    size="sm"
                                  />
                                </Form.Group>
                              </Col>
                            </>
                          )}
                          <Col md={2} className="mb-3">
                            <Form.Group>
                              <Form.Label className="small text-muted mb-1">ðŸ“Š Estado</Form.Label>
                              <Form.Select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                size="sm"
                              >
                                <option value="all">Todos los estados</option>
                                <option value="pending">ðŸŸ¡ No entregados</option>
                                <option value="delivered">âœ… Entregados</option>
                                <option value="emergency">ðŸš¨ Emergencia</option>
                              </Form.Select>
                            </Form.Group>
                          </Col>
                          <Col md={2} className="mb-3">
                            <Form.Group>
                              <Form.Label className="small text-muted mb-1">ðŸš› Repartidor</Form.Label>
                              <Form.Select
                                value={deliveryPersonFilter}
                                onChange={(e) => setDeliveryPersonFilter(e.target.value)}
                                size="sm"
                              >
                                <option value="all">Todos</option>
                                <option value="unassigned">Sin asignar</option>
                                {availableDeliveryUsers.map(user => (
                                  <option key={user.email} value={user.email}>
                                    {user.name || user.email.split('@')[0]}
                                  </option>
                                ))}
                              </Form.Select>
                            </Form.Group>
                          </Col>
                          <Col md={1} className="mb-3 text-center">
                            <div className="small text-muted">
                              <div><strong>{filteredOrders.length}</strong></div>
                              <div>pedidos</div>
                            </div>
                          </Col>
                        </Row>
                      </Card.Body>
                    </Card>

                    {/* ðŸ“Š Resumen de Estados */}
                    <Row className="mb-4">
                      <Col md={3} sm={6} className="mb-3">
                        <Card className="border-warning h-100">
                          <Card.Body className="text-center">
                            <i className="bi bi-clock-fill text-warning" style={{ fontSize: '2rem' }}></i>
                            <h4 className="mt-2 mb-1 text-warning">
                              {filteredOrders.filter(o => 
                                o.status === 'pending' || 
                                o.status === 'assigned' || 
                                o.status === 'picked_up' || 
                                o.status === 'in_transit'
                              ).length}
                            </h4>
                            <small className="text-muted">Pendientes</small>
                          </Card.Body>
                        </Card>
                      </Col>
                      <Col md={3} sm={6} className="mb-3">
                        <Card className="border-success h-100">
                          <Card.Body className="text-center">
                            <i className="bi bi-check-circle text-success" style={{ fontSize: '2rem' }}></i>
                            <h4 className="mt-2 mb-1 text-success">
                              {filteredOrders.filter(o => o.status === 'delivered').length}
                            </h4>
                            <small className="text-muted">Entregados</small>
                          </Card.Body>
                        </Card>
                      </Col>
                      <Col md={3} sm={6} className="mb-3">
                        <Card className="border-danger h-100">
                          <Card.Body className="text-center">
                            <i className="bi bi-exclamation-triangle text-danger" style={{ fontSize: '2rem' }}></i>
                            <h4 className="mt-2 mb-1 text-danger">
                              {filteredOrders.filter(o => o.isEmergency || o.priority === 'high').length}
                            </h4>
                            <small className="text-muted">Emergencias</small>
                          </Card.Body>
                        </Card>
                      </Col>
                      <Col md={3} sm={6} className="mb-3">
                        <Card className="border-info h-100">
                          <Card.Body className="text-center">
                            <i className="bi bi-currency-dollar text-info" style={{ fontSize: '2rem' }}></i>
                            <h4 className="mt-2 mb-1 text-info">
                              ${filteredOrders.reduce((sum, o) => sum + o.total, 0).toFixed(2)}
                            </h4>
                            <small className="text-muted">Total filtrado</small>
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>

                    {/* ðŸš¨ Alertas de Emergencia */}
                    {filteredOrders.filter(o => o.isEmergency || o.priority === 'high').length > 0 && (
                      <Alert variant="danger" className="mb-4">
                        <Alert.Heading>
                          <i className="bi bi-exclamation-triangle-fill me-2"></i>
                          ðŸš¨ Pedidos en Emergencia
                        </Alert.Heading>
                        <p className="mb-0">
                          Hay <strong>{filteredOrders.filter(o => o.isEmergency || o.priority === 'high').length}</strong> pedidos marcados como emergencia que requieren atenciÃ³n inmediata.
                        </p>
                      </Alert>
                    )}

                    {/* ðŸ“‹ Tabla de Pedidos con Filtros */}
                    <Card className="mb-4">
                      <Card.Header>
                        <Row className="align-items-center">
                          <Col>
                            <h5 className="mb-0">
                              ðŸ“‹ Lista de Pedidos ({filteredOrders.length})
                            </h5>
                            <small className="text-muted">
                              {dateRangeFilter === 'custom' 
                                ? `${startDate} a ${endDate}` 
                                : dateRangeFilter === 'today' ? 'Hoy' 
                                : dateRangeFilter === 'week' ? 'Esta semana' 
                                : 'Este mes'}
                            </small>
                          </Col>
                        </Row>
                      </Card.Header>
                      <Card.Body className="p-0">
                        {loading ? (
                          <div className="text-center py-4">
                            <Spinner animation="border" size="sm" />
                            <p className="mt-2 mb-0 text-muted">Cargando pedidos...</p>
                          </div>
                        ) : filteredOrders.length === 0 ? (
                          <div className="text-center py-5">
                            <i className="bi bi-inbox" style={{ fontSize: '3rem', color: '#6c757d' }}></i>
                            <h5 className="mt-3 text-muted">No hay pedidos</h5>
                            <p className="text-muted">No se encontraron pedidos con los filtros aplicados.</p>
                          </div>
                        ) : (
                          <div className="table-responsive">
                            <Table hover className="mb-0">
                              <thead className="table-light">
                                <tr>
                                  <th>ðŸ”¥ Estado</th>
                                  <th>ðŸ“… Fecha</th>
                                  <th>ðŸ‘¤ Cliente</th>
                                  <th>ðŸ†” ID Pedido</th>
                                  <th>ðŸ’° Total</th>
                                  <th>ðŸš› Repartidor</th>
                                  <th className="text-center">âš¡ Acciones</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredOrders.map((order) => (
                                  <tr key={order.id} className={order.isEmergency ? 'table-danger' : ''}>
                                    <td>
                                      <div className="d-flex align-items-center gap-2">
                                        {order.isEmergency && (
                                          <Badge bg="danger" className="me-1">
                                            ðŸš¨ EMERGENCIA
                                          </Badge>
                                        )}
                                        <Badge bg={
                                          order.status === 'delivered' ? 'success' :
                                          order.status === 'pending' ? 'warning' :
                                          order.status === 'assigned' ? 'info' : 'secondary'
                                        }>
                                          {order.status === 'delivered' ? 'âœ… Entregado' :
                                           order.status === 'pending' ? 'ðŸŸ¡ Pendiente' :
                                           order.status === 'assigned' ? 'ðŸ“‹ Asignado' : 
                                           order.status}
                                        </Badge>
                                      </div>
                                    </td>
                                    <td>
                                      <div>
                                        {new Date(order.date).toLocaleDateString('es-ES')}
                                        <div className="small text-muted">
                                          {new Date(order.date).toLocaleTimeString('es-ES', {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                          })}
                                        </div>
                                      </div>
                                    </td>
                                    <td>
                                      <div>
                                        <div className="fw-semibold">
                                          {order.userName || 'Cliente desconocido'}
                                        </div>
                                        {order.userEmail && (
                                          <div className="small text-muted">{order.userEmail}</div>
                                        )}
                                      </div>
                                    </td>
                                    <td>
                                      <code className="text-primary">
                                        {order.fullOrderId || order.id}
                                      </code>
                                    </td>
                                    <td>
                                      <span className="fw-semibold">
                                        ${order.total.toFixed(2)}
                                      </span>
                                    </td>
                                    <td>
                                      {order.assignedTo ? (
                                        <div>
                                          <Badge bg="info" className="mb-1">
                                            {availableDeliveryUsers.find(u => u.email === order.assignedTo)?.name || 
                                             order.assignedTo.split('@')[0]}
                                          </Badge>
                                          {order.status === 'delivered' && order.deliveredAt && (
                                            <div className="small text-success">
                                              Entregado: {new Date(order.deliveredAt).toLocaleString('es-ES')}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <Badge bg="secondary">Sin asignar</Badge>
                                      )}
                                    </td>
                                    <td className="text-center">
                                      <div className="d-flex gap-1 justify-content-center">
                                        <Button
                                          size="sm"
                                          variant="outline-primary"
                                          onClick={() => {
                                            setSelectedOrderDetails(order);
                                            setShowOrderDetailsModal(true);
                                          }}
                                          title="Ver detalles"
                                        >
                                          ðŸ‘ï¸
                                        </Button>
                                        {order.status !== 'delivered' && !order.assignedTo && (
                                          <Form.Select 
                                            size="sm" 
                                            style={{ width: 'auto', minWidth: '120px' }}
                                            onChange={(e) => {
                                              if (e.target.value) {
                                                handleAssignDelivery(order.id, e.target.value);
                                              }
                                            }}
                                            defaultValue=""
                                          >
                                            <option value="">Asignar...</option>
                                            {availableDeliveryUsers.map(user => (
                                              <option key={user.email} value={user.email}>
                                                {user.name || user.email.split('@')[0]}
                                              </option>
                                            ))}
                                          </Form.Select>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </div>
                        )}
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              </>
            )}

            {/* âœ… Tab de Configuraciones de Delivery */}
            {activeTab === 'delivery-settings' && (
              <DeliverySettings />
            )}

          </Container>
        </main>

        <Footer />
      </div>

      {/* ðŸ” Modal de Detalles de Pedido */}
      <Modal size="lg" show={showOrderDetailsModal} onHide={() => setShowOrderDetailsModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>
            ðŸ“¦ Detalles del Pedido {selectedOrderDetails?.fullOrderId || selectedOrderDetails?.id}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedOrderDetails && (
            <div>
              <Row className="mb-3">
                <Col md={6}>
                  <strong>ðŸ‘¤ Cliente:</strong> {selectedOrderDetails.userName}<br/>
                  <strong>ðŸ“§ Email:</strong> {selectedOrderDetails.userEmail}<br/>
                  <strong>ðŸ“± TelÃ©fono:</strong> {selectedOrderDetails.shipping?.phone || 'No disponible'}
                </Col>
                <Col md={6}>
                  <strong>ðŸ“ UbicaciÃ³n:</strong> {selectedOrderDetails.shipping?.city}, {selectedOrderDetails.shipping?.zone}<br/>
                  <strong>ðŸ  DirecciÃ³n:</strong> {selectedOrderDetails.shipping?.address || 'No disponible'}<br/>
                  <strong>ðŸ’° Total:</strong> ${selectedOrderDetails.total.toFixed(2)}
                </Col>
              </Row>
              <Row className="mb-3">
                <Col>
                  <strong>ðŸ“‹ Estado:</strong> <Badge bg={
                    selectedOrderDetails.status === 'delivered' ? 'success' :
                    selectedOrderDetails.status === 'pending' ? 'warning' : 'info'
                  }>
                    {selectedOrderDetails.status}
                  </Badge>
                  {selectedOrderDetails.assignedTo && (
                    <div className="mt-2">
                      <strong>ðŸš› Repartidor:</strong> {selectedOrderDetails.assignedTo}
                    </div>
                  )}
                </Col>
              </Row>
              <Row>
                <Col>
                  <strong>ðŸ›’ Productos:</strong>
                  <ul className="mt-2">
                    {selectedOrderDetails.items?.map((item, index) => (
                      <li key={index}>
                        {item.name} - Cantidad: {item.quantity} - ${item.price}
                      </li>
                    )) || <li>No hay informaciÃ³n de productos disponible</li>}
                  </ul>
                </Col>
              </Row>
