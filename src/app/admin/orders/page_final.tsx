'use client';

import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Badge, Table, Form, Alert, Spinner, Modal } from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/adminContext';
import jsPDF from 'jspdf';

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
  getAllDeliveryOrders,
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
  
  // Estados para delivery management
  const [pendingDeliveries, setPendingDeliveries] = useState<DeliveryOrder[]>([]);
  const [allDeliveries, setAllDeliveries] = useState<DeliveryOrder[]>([]);
  const [availableDeliveryUsers, setAvailableDeliveryUsers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'orders' | 'deliveries' | 'delivery-settings'>('orders');
  
  // Estados para monitoreo avanzado
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<DeliveryOrder | null>(null);
  const [showOrderDetailsModal, setShowOrderDetailsModal] = useState(false);
  
  // Estados para filtro de fechas y exportación
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [filteredDeliveries, setFilteredDeliveries] = useState<DeliveryOrder[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // NUEVOS ESTADOS PARA FILTROS AVANZADOS
  const [allOrders, setAllOrders] = useState<DeliveryOrder[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<DeliveryOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<'today' | 'week' | 'month' | 'custom'>('week');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'delivered' | 'pending' | 'emergency'>('all');
  const [deliveryPersonFilter, setDeliveryPersonFilter] = useState<string>('all');

  useEffect(() => {
    if (user && isAdmin) {
      loadOrderData();
    }
  }, [user, isAdmin]);

  // FUNCIÓN PARA CALCULAR RANGO DE FECHAS
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
        start.setDate(today.getDate() - today.getDay());
        end = new Date(today);
        end.setDate(start.getDate() + 6);
        break;
      case 'month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      default:
        return null;
    }
    
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  };

  // EFECTO PARA FILTRAR ÓRDENES
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
    
    // Filtro por búsqueda
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
    
    // Ordenar por fecha y emergencia
    filtered.sort((a, b) => {
      if (a.isEmergency && !b.isEmergency) return -1;
      if (!a.isEmergency && b.isEmergency) return 1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    
    setFilteredOrders(filtered);
  }, [allOrders, dateRangeFilter, startDate, endDate, statusFilter, deliveryPersonFilter, searchTerm]);

  // FUNCIÓN PARA CAMBIAR RANGO DE FECHAS
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

  const loadOrderData = async () => {
    try {
      setLoading(true);
      setError(null);

      const days = await getAllOrderDays();
      setOrderDays(days);

      const today = await getTodayOrders();
      setTodayOrders(today);

      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const stats = await getOrdersStatistics(startDate, endDate);
      setStatistics(stats);

      const pending = await getPendingOrders();
      setPendingDeliveries(pending);
      
      const allOrders = await getAllDeliveryOrders();
      setAllDeliveries(allOrders);
      setAllOrders(allOrders);
      
      const deliveryUsers = await getAvailableDeliveryUsers();
      setAvailableDeliveryUsers(deliveryUsers);

      // Establecer fechas por defecto para filtros
      const todayDate = new Date();
      const weekStart = new Date(todayDate);
      weekStart.setDate(todayDate.getDate() - todayDate.getDay());
      setStartDate(weekStart.toISOString().split('T')[0]);
      setEndDate(todayDate.toISOString().split('T')[0]);

      try {
        await notificationService.cleanupExpiredNotifications();
      } catch (cleanupError) {
        console.error('Error en limpieza automática:', cleanupError);
      }

    } catch (error: any) {
      console.error('Error al cargar datos de pedidos:', error);
      
      if (error?.code === 'permission-denied' || error?.message?.includes('permissions')) {
        setError(
          'Error de permisos: Las reglas de Firestore necesitan ser actualizadas para permitir acceso a la colección dailyOrders. ' +
          'Contacta al desarrollador para configurar los permisos correctos.'
        );
      } else {
        setError('Error al cargar los datos de pedidos: ' + (error?.message || 'Error desconocido'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = async (date: string) => {
    try {
      setSelectedDate(date);
      const dayOrders = await getDailyOrders(date);
      setSelectedDayOrders(dayOrders);
    } catch (error) {
      console.error('Error al cargar pedidos del día:', error);
      setError('Error al cargar pedidos del día seleccionado');
    }
  };

  const handleAssignDelivery = async (orderId: string, deliveryEmail: string) => {
    try {
      await assignOrderToDelivery(orderId, deliveryEmail);
      
      setPendingDeliveries(prev => prev.filter(order => order.id !== orderId));
      
      const allOrders = await getAllDeliveryOrders();
      setAllDeliveries(allOrders);
      setAllOrders(allOrders);
      
      alert('✅ Orden asignada correctamente al repartidor');
      
    } catch (error) {
      console.error('Error asignando orden:', error);
      alert('❌ Error al asignar la orden');
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

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

  if (!user) {
    return (
      <Container className="py-5 text-center">
        <Alert variant="warning">Debes iniciar sesión para acceder a esta página.</Alert>
      </Container>
    );
  }

  if (!isAdmin) {
    return (
      <Container className="py-5 text-center">
        <Alert variant="danger">
          <h4>🚫 Acceso Denegado</h4>
          <p>No tienes permisos para acceder al panel de administración.</p>
        </Alert>
      </Container>
    );
  }

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="d-flex flex-column flex-lg-row" style={{ minHeight: '100vh', overflowX: 'hidden' }}>
        <Sidebar />

        <div className="flex-grow-1 d-flex flex-column">
          <TopbarMobile />

          <main className="flex-grow-1 py-4 px-3 px-md-4" style={{ backgroundColor: 'var(--cosmetic-bg, #f8f9fa)' }}>
            <Container fluid>
              <Row className="mb-4">
                <Col>
                  <h2 className="mb-1">Gestión de Pedidos</h2>
                  <p className="text-muted mb-0">Panel de control para administrar pedidos y entregas</p>
                </Col>
              </Row>

              <Row className="mb-4">
                <Col>
                  <div className="d-flex flex-wrap gap-2">
                    <Button
                      className={activeTab === 'orders' ? 'btn-cosmetic-primary' : 'btn-outline-cosmetic-primary'}
                      size="sm"
                      onClick={() => setActiveTab('orders')}
                    >
                      <i className="bi bi-receipt me-1"></i>
                      Pedidos por Día
                    </Button>
                    <Button
                      className={activeTab === 'deliveries' ? 'btn-cosmetic-primary' : 'btn-outline-cosmetic-primary'}
                      size="sm"
                      onClick={() => setActiveTab('deliveries')}
                    >
                      <i className="bi bi-funnel-fill me-1"></i>
                      Gestión Avanzada
                    </Button>
                    <Button
                      className={activeTab === 'delivery-settings' ? 'btn-cosmetic-accent' : 'btn-outline-cosmetic-accent'}
                      size="sm"
                      onClick={() => setActiveTab('delivery-settings')}
                    >
                      <i className="bi bi-gear me-1"></i>
                      Configuración
                    </Button>
                  </div>
                </Col>
              </Row>

              {error && (
                <Alert variant="danger" className="mb-4">{error}</Alert>
              )}

              {/* Tab de Pedidos por Día */}
              {activeTab === 'orders' && (
                <Row>
                  <Col lg={4}>
                    <Card className="border-0 shadow-sm">
                      <Card.Header>
                        <h5 className="mb-0">📋 Días con Pedidos</h5>
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
                                key={day.date}
                                variant={selectedDate === day.date ? "primary" : "outline-primary"}
                                onClick={() => handleDateSelect(day.date)}
                                className="text-start"
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

                  <Col lg={8}>
                    {selectedDayOrders ? (
                      <Card className="border-0 shadow-sm">
                        <Card.Header>
                          <h5 className="mb-0">📝 Detalles - {selectedDayOrders.dateFormatted}</h5>
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
                                <th>Email</th>
                                <th>Total</th>
                                <th>Productos</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedDayOrders.orders?.map((order, index) => (
                                <tr key={index}>
                                  <td>{order.orderTime || 'N/A'}</td>
                                  <td>{order.userName || 'Cliente desconocido'}</td>
                                  <td>{order.userEmail || 'N/A'}</td>
                                  <td>{formatCurrency(order.total)}</td>
                                  <td>{order.items?.length || 0} productos</td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </Card.Body>
                      </Card>
                    ) : (
                      <Card className="border-0 shadow-sm">
                        <Card.Body className="text-center py-5">
                          <i className="bi bi-calendar-event" style={{ fontSize: '3rem', color: '#6c757d' }}></i>
                          <h5 className="mt-3 text-muted">Selecciona un día</h5>
                          <p className="text-muted">Elige un día de la lista para ver los detalles de los pedidos.</p>
                        </Card.Body>
                      </Card>
                    )}
                  </Col>
                </Row>
              )}

              {/* Tab de Gestión Avanzada de Pedidos */}
              {activeTab === 'deliveries' && (
                <>
                  <Row className="mb-4">
                    <Col>
                      <h3 className="fw-bold mb-3">
                        <i className="bi bi-funnel me-2"></i>
                        Gestión Avanzada de Pedidos
                        <Badge bg="success" className="ms-2 fs-6">Vista Unificada</Badge>
                      </h3>
                      
                      {/* FILTROS AVANZADOS */}
                      <Card className="mb-4 shadow-sm">
                        <Card.Body>
                          <Row className="align-items-end">
                            <Col md={3} className="mb-3">
                              <Form.Group>
                                <Form.Label className="small text-muted mb-1">🔍 Buscar pedido</Form.Label>
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
                                <Form.Label className="small text-muted mb-1">📅 Período</Form.Label>
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
                                <Form.Label className="small text-muted mb-1">📊 Estado</Form.Label>
                                <Form.Select
                                  value={statusFilter}
                                  onChange={(e) => setStatusFilter(e.target.value as any)}
                                  size="sm"
                                >
                                  <option value="all">Todos los estados</option>
                                  <option value="pending">🟡 No entregados</option>
                                  <option value="delivered">✅ Entregados</option>
                                  <option value="emergency">🚨 Emergencia</option>
                                </Form.Select>
                              </Form.Group>
                            </Col>
                            <Col md={2} className="mb-3">
                              <Form.Group>
                                <Form.Label className="small text-muted mb-1">🚛 Repartidor</Form.Label>
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

                      {/* Resumen de Estados */}
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

                      {/* Alertas de Emergencia */}
                      {filteredOrders.filter(o => o.isEmergency || o.priority === 'high').length > 0 && (
                        <Alert variant="danger" className="mb-4">
                          <Alert.Heading>
                            <i className="bi bi-exclamation-triangle-fill me-2"></i>
                            🚨 Pedidos en Emergencia
                          </Alert.Heading>
                          <p className="mb-0">
                            Hay <strong>{filteredOrders.filter(o => o.isEmergency || o.priority === 'high').length}</strong> pedidos marcados como emergencia que requieren atención inmediata.
                          </p>
                        </Alert>
                      )}

                      {/* Tabla de Pedidos con Filtros */}
                      <Card className="mb-4">
                        <Card.Header>
                          <Row className="align-items-center">
                            <Col>
                              <h5 className="mb-0">
                                📋 Lista de Pedidos ({filteredOrders.length})
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
                                    <th>🔥 Estado</th>
                                    <th>📅 Fecha</th>
                                    <th>👤 Cliente</th>
                                    <th>🆔 ID Pedido</th>
                                    <th>💰 Total</th>
                                    <th>🚛 Repartidor</th>
                                    <th className="text-center">⚡ Acciones</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredOrders.map((order) => (
                                    <tr key={order.id} className={order.isEmergency ? 'table-danger' : ''}>
                                      <td>
                                        <div className="d-flex align-items-center gap-2">
                                          {order.isEmergency && (
                                            <Badge bg="danger" className="me-1">
                                              🚨 EMERGENCIA
                                            </Badge>
                                          )}
                                          <Badge bg={
                                            order.status === 'delivered' ? 'success' :
                                            order.status === 'pending' ? 'warning' :
                                            order.status === 'assigned' ? 'info' : 'secondary'
                                          }>
                                            {order.status === 'delivered' ? '✅ Entregado' :
                                             order.status === 'pending' ? '🟡 Pendiente' :
                                             order.status === 'assigned' ? '📋 Asignado' : 
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
                                            👁️
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

              {/* Tab de Configuraciones de Delivery */}
              {activeTab === 'delivery-settings' && (
                <DeliverySettings />
              )}

            </Container>
          </main>

          <Footer />
        </div>
      </div>

      {/* Modal de Detalles de Pedido */}
      <Modal size="lg" show={showOrderDetailsModal} onHide={() => setShowOrderDetailsModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>
            📦 Detalles del Pedido {selectedOrderDetails?.fullOrderId || selectedOrderDetails?.id}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedOrderDetails && (
            <div>
              <Row className="mb-3">
                <Col md={6}>
                  <strong>👤 Cliente:</strong> {selectedOrderDetails.userName}<br/>
                  <strong>📧 Email:</strong> {selectedOrderDetails.userEmail}<br/>
                  <strong>📱 Teléfono:</strong> {selectedOrderDetails.shipping?.phone || 'No disponible'}
                </Col>
                <Col md={6}>
                  <strong>📍 Ubicación:</strong> {selectedOrderDetails.shipping?.city}, {selectedOrderDetails.shipping?.zone}<br/>
                  <strong>🏠 Dirección:</strong> {selectedOrderDetails.shipping?.address || 'No disponible'}<br/>
                  <strong>💰 Total:</strong> ${selectedOrderDetails.total.toFixed(2)}
                </Col>
              </Row>
              <Row className="mb-3">
                <Col>
                  <strong>📋 Estado:</strong> <Badge bg={
                    selectedOrderDetails.status === 'delivered' ? 'success' :
                    selectedOrderDetails.status === 'pending' ? 'warning' : 'info'
                  }>
                    {selectedOrderDetails.status}
                  </Badge>
                  {selectedOrderDetails.assignedTo && (
                    <div className="mt-2">
                      <strong>🚛 Repartidor:</strong> {selectedOrderDetails.assignedTo}
                    </div>
                  )}
                </Col>
              </Row>
              <Row>
                <Col>
                  <strong>🛒 Productos:</strong>
                  <ul className="mt-2">
                    {selectedOrderDetails.items?.map((item, index) => (
                      <li key={index}>
                        {item.name} - Cantidad: {item.quantity} - ${item.price}
                      </li>
                    )) || <li>No hay información de productos disponible</li>}
                  </ul>
                </Col>
              </Row>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowOrderDetailsModal(false)}>
            Cerrar
          </Button>
          {selectedOrderDetails && selectedOrderDetails.status !== 'delivered' && (
            <Button variant="warning" onClick={() => {
              console.log('Marcar como urgente:', selectedOrderDetails.id);
            }}>
              <i className="bi bi-exclamation-triangle me-2"></i>
              Marcar como Urgente
            </Button>
          )}
        </Modal.Footer>
      </Modal>
      
    </ProtectedRoute>
  );
}