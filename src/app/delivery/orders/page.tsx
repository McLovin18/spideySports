'use client';

import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Badge, Alert, Modal, Form } from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/adminContext';
import { ProtectedRoute } from '../../utils/securityMiddleware';
import LoginRequired from '../../components/LoginRequired';
import DeliveryNotificationPanel from '../../components/DeliveryNotificationPanel';
import { 
  getDeliveryOrders, 
  selfAssignUrgentOrder,
  DeliveryOrder 
} from '../../services/deliveryService';
import { db } from '../../utils/firebase';
import { collection, query, where, getDocs, updateDoc, doc, getDoc } from 'firebase/firestore';

// Usar la interfaz del servicio que ya incluye las propiedades de emergencia

const DeliveryOrdersPage = () => {
  const { user } = useAuth();
  const { isDelivery } = useRole();
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  useEffect(() => {
    if (user?.email && isDelivery) {
      loadMyDeliveries();
    }
  }, [user?.email, isDelivery]);

  const loadMyDeliveries = async () => {
    if (!user?.email) return;
    
    setLoading(true);
    try {
      // Usar el servicio que incluye órdenes asignadas + urgentes disponibles
      const deliveryOrders = await getDeliveryOrders(user.email);
      setOrders(deliveryOrders);
    } catch (error) {
      console.error('Error cargando pedidos:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatOrderDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };



  const getStatusColor = (status: string) => {
    switch (status) {
      case 'assigned': return 'warning';
      case 'picked_up': return 'info';
      case 'in_transit': return 'primary';
      case 'delivered': return 'success';
      default: return 'secondary';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'assigned': return 'Asignado';
      case 'picked_up': return 'Recogido';
      case 'in_transit': return 'En tránsito';
      case 'delivered': return 'Entregado';
      default: return status;
    }
  };

  const handleUpdateStatus = (order: DeliveryOrder) => {
    setSelectedOrder(order);
    setNewStatus(order.status);
    setDeliveryNotes(order.deliveryNotes || '');
    setShowModal(true);
  };

  const saveStatusUpdate = async () => {
    if (!selectedOrder) return;

    try {
      const orderRef = doc(db, 'deliveryOrders', selectedOrder.id);
      const updateData = {
        status: newStatus,
        deliveryNotes,
        lastUpdated: new Date().toISOString(),
        [`statusHistory.${newStatus}`]: new Date().toISOString()
      };
      
      await updateDoc(orderRef, updateData);

      // ✅ Verificar que la actualización fue exitosa
      const updatedDoc = await getDoc(orderRef);
      if (updatedDoc.exists()) {
        const updatedData = updatedDoc.data();
      }

      // Actualizar el estado local
      const updatedOrder = { ...selectedOrder, status: newStatus as any, deliveryNotes };
      
      setOrders(orders.map(order => 
        order.id === selectedOrder.id 
          ? updatedOrder
          : order
      ));

      setShowModal(false);
      setSelectedOrder(null);
    } catch (error) {
      console.error('❌ Error updating status:', error);
    }
  };

  // 🚨 Función para auto-asignarse a órdenes urgentes
  const handleSelfAssignUrgentOrder = async (order: DeliveryOrder) => {
    if (!user?.email) return;

    try {
      const orderIdToUse = order.orderId || order.id;
      
      await selfAssignUrgentOrder(orderIdToUse, user.email);
      
      // Recargar pedidos para reflejar el cambio
      await loadMyDeliveries();
      
      alert('🚨 ¡Te has asignado exitosamente esta orden urgente!');
      
    } catch (error: any) {
      console.error('Error auto-asignando orden urgente:', error);
      const errorMessage = error?.message || 'Error desconocido';
      alert(`❌ Error: ${errorMessage}`);
    }
  };

  // 🎯 FUNCIÓN PARA OBTENER ZONAS DE DELIVERY
  const getDeliveryZones = (email: string): string[] => {
    // Mapear emails a sus zonas preferidas
    const zoneMapping: { [key: string]: string[] } = {
      'hwcobena@espol.edu.ec': ['guayaquil-general', 'guayaquil-centro', 'guayaquil-norte'],
      'nexel2024@outlook.com': ['santa-elena-general', 'santa-elena-centro', 'guayaquil-sur']
    };
    
    return zoneMapping[email] || ['general'];
  };

  // Verificar acceso después de todos los hooks
  if (!user) {
    return <LoginRequired />;
  }

  if (!isDelivery) {
    return (
      <Container className="py-5 text-center">
        <h2>🚫 Acceso Denegado</h2>
        <p>Solo los repartidores pueden acceder a esta página.</p>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container className="py-5 text-center">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </Container>
    );
  }

  return (
    <ProtectedRoute requiredRole="delivery">
      <div className="d-flex flex-column min-vh-100">
        <div className="d-lg-none">
          {/* Para móvil solo mostramos contenido sin navbar adicional */}
        </div>
        
        <main className="flex-grow-1" style={{ paddingTop: '1rem' }}>
          <Container fluid className="px-2 px-md-4">
            {/* Header - Responsive */}
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-3 mb-md-4">
              <div className="mb-2 mb-md-0">
                <h1 className="fw-bold fs-3 fs-md-1">
                  <i className="bi bi-truck me-2 me-md-3"></i>
                  <span className="d-none d-sm-inline">Mis Entregas</span>
                  <span className="d-sm-none">Entregas</span>
                </h1>
              </div>
              <Badge bg="info" className="fs-6 align-self-end align-self-md-center">
                {orders.length} 
                <span className="d-none d-sm-inline"> pedidos asignados</span>
                <span className="d-sm-none"> pedidos</span>
              </Badge>
            </div>

            {/* 🚚 NUEVO: Panel de Notificaciones */}
            <Row className="mb-4">
              <Col>
                <DeliveryNotificationPanel 
                  deliveryZones={getDeliveryZones(user?.email || '')}
                />
              </Col>
            </Row>

            {/* 🚨 Panel de Órdenes Urgentes Disponibles */}
            {orders.filter(order => order.isEmergency && order.status !== 'delivered' && !order.assignedTo).length > 0 && (
              <Row className="mb-4">
                <Col>
                  <Alert variant="danger" className="shadow-sm">
                    <Alert.Heading className="h6">
                      🚨 PEDIDOS URGENTES DISPONIBLES
                    </Alert.Heading>
                    <p className="mb-2">
                      Hay <strong>{orders.filter(order => order.isEmergency && order.status !== 'delivered' && !order.assignedTo).length}</strong> pedidos 
                      marcados como urgentes que cualquier repartidor puede tomar.
                    </p>
                    <div className="d-flex flex-wrap gap-2">
                      {orders.filter(order => order.isEmergency && order.status !== 'delivered' && !order.assignedTo).map(order => (
                        <Button 
                          key={order.id}
                          variant="outline-danger" 
                          size="sm"
                          onClick={() => handleSelfAssignUrgentOrder(order)}
                        >
                          {order.userName} - ${order.total.toFixed(2)} 🚨
                        </Button>
                      ))}
                    </div>
                  </Alert>
                </Col>
              </Row>
            )}

            {orders.length === 0 ? (
              <div className="text-center py-5">
                <div className="bg-light rounded-circle d-inline-flex align-items-center justify-content-center mb-3" 
                     style={{ width: '80px', height: '80px' }}>
                  <i className="bi bi-truck text-muted" style={{ fontSize: '2rem' }}></i>
                </div>
                <h5 className="text-muted mb-2">No hay entregas pendientes</h5>
                <p className="text-muted small mb-0">
                  <span className="d-none d-md-inline">Los pedidos asignados aparecerán aquí cuando el administrador te asigne nuevas entregas.</span>
                  <span className="d-md-none">Los pedidos asignados aparecerán aquí.</span>
                </p>
                <div className="mt-3">
                  <Badge bg="info" className="px-3 py-2">
                    <i className="bi bi-clock me-1"></i>
                    En espera de asignaciones
                  </Badge>
                </div>
              </div>
            ) : (
              <>
                {/* Vista de cards para móvil - Mejorado */}
                <div className="d-md-none">
                  {orders.map((order) => (
                    <Card 
                      key={order.id} 
                      className={`mb-3 shadow-sm border-0 ${order.isEmergency && order.status !== 'delivered' ? 'border-danger' : ''}`} 
                      style={{ 
                        borderRadius: '1rem',
                        backgroundColor: order.isEmergency && order.status !== 'delivered' ? '#fff5f5' : 'white',
                        border: order.isEmergency && order.status !== 'delivered' ? '2px solid #dc3545' : 'none'
                      }}
                    >
                      <Card.Header 
                        className={`py-3 ${order.isEmergency && order.status !== 'delivered' ? 'bg-danger text-white' : 'bg-light'}`} 
                        style={{ borderRadius: '1rem 1rem 0 0' }}
                      >
                        <div className="d-flex justify-content-between align-items-center">
                          <div className="d-flex align-items-center">
                            {order.isEmergency && order.status !== 'delivered' && (
                              <div className="bg-white text-danger rounded-circle d-flex align-items-center justify-content-center me-2" 
                                   style={{ width: '32px', height: '32px', fontSize: '1rem' }}>
                                🚨
                              </div>
                            )}
                            <div className="bg-primary rounded-circle d-flex align-items-center justify-content-center me-2" 
                                 style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}>
                              <i className="bi bi-box text-white"></i>
                            </div>
                            <div>
                              <div className="fw-bold small">{order.userName}</div>
                              <small className={order.isEmergency && order.status !== 'delivered' ? 'text-light' : 'text-muted'}>
                                {formatOrderDate(order.date)}
                              </small>
                              {order.isEmergency && order.status !== 'delivered' && (
                                <div className="small text-warning fw-bold">🚨 PEDIDO URGENTE</div>
                              )}
                            </div>
                          </div>
                          <Badge 
                            bg={getStatusColor(order.status)} 
                            className="px-2 py-1 small"
                            style={{ borderRadius: '0.5rem' }}
                          >
                            {order.status === 'assigned' && '📋'}
                            {order.status === 'picked_up' && '📦'}
                            {order.status === 'in_transit' && '🚚'}
                            {order.status === 'delivered' && '✅'}
                            <span className="ms-1">{getStatusText(order.status)}</span>
                          </Badge>
                        </div>
                      </Card.Header>
                      
                      <Card.Body className="py-3">
                        {/* Información del pedido */}
                        <div className="row g-2 mb-3">
                          <div className="col-6">
                            <div className="bg-light p-2 rounded text-center">
                              <div className="fw-bold text-success fs-5">${order.total.toFixed(2)}</div>
                              <small className="text-muted">Total</small>
                            </div>
                          </div>
                          <div className="col-6">
                            <div className="bg-light p-2 rounded text-center">
                              <div className="fw-bold text-info fs-5">{order.items.length}</div>
                              <small className="text-muted">Productos</small>
                            </div>
                          </div>
                        </div>

                        {/* Producto principal si es solo uno */}
                        {order.items.length === 1 && (
                          <div className="mb-3">
                            <div className="bg-primary bg-opacity-10 p-2 rounded border-start border-primary border-3">
                              <div className="fw-bold small text-primary">
                                {order.items[0].title || order.items[0].name || 'Producto'}
                              </div>
                              <div className="small text-muted">
                                Cantidad: {order.items[0].quantity} • Precio: ${order.items[0].price}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Lista de productos compacta */}
                        <div className="mb-3">
                          <div className="small fw-bold mb-1 text-muted">Productos:</div>
                          <div className="bg-light p-2 rounded" style={{ maxHeight: '80px', overflowY: 'auto' }}>
                            {order.items.slice(0, 3).map((item, index) => (
                              <div key={index} className="d-flex justify-content-between small mb-1">
                                <span className="text-truncate me-2" title={item.title || item.name}>
                                  {item.title || item.name || 'Producto'}
                                </span>
                                <span className="text-nowrap text-muted">x{item.quantity}</span>
                              </div>
                            ))}
                            {order.items.length > 3 && (
                              <div className="small text-muted text-center mt-1">
                                +{order.items.length - 3} productos más...
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Información del cliente */}
                        <div className="mb-3">
                          <div className="small fw-bold mb-1 text-muted">Cliente:</div>
                          <div className="small text-muted bg-light p-2 rounded">
                            <div className="mb-1">
                              <i className="bi bi-envelope me-1"></i>
                              {order.userEmail.length > 25 ? order.userEmail.substring(0, 25) + '...' : order.userEmail}
                            </div>
                            {/* Mostrar teléfono si está disponible */}
                            {order.shipping?.phone && (
                              <div>
                                <i className="bi bi-telephone me-1 text-success"></i>
                                <span className="text-success fw-bold">{order.shipping.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Notas de entrega */}
                        {order.deliveryNotes && (
                          <div className="mb-3">
                            <div className="small fw-bold mb-1 text-muted">Notas:</div>
                            <div className="small bg-warning bg-opacity-10 p-2 rounded border-start border-warning border-3">
                              <i className="bi bi-sticky me-1"></i>
                              {order.deliveryNotes}
                            </div>
                          </div>
                        )}
                        
                        {/* Botón de acción */}
                        <div className="d-grid mt-3">
                          {order.status === 'delivered' ? (
                            <Button
                              variant="success"
                              size="sm"
                              disabled
                              className="py-2"
                              style={{ borderRadius: '0.75rem' }}
                            >
                              <i className="bi bi-check-circle-fill me-2"></i>
                              Pedido Entregado
                            </Button>
                          ) : order.isEmergency && order.status !== 'delivered' && !order.assignedTo ? (
                            <div className="d-grid gap-2">
                              <Button
                                variant="danger"
                                size="sm"
                                className="py-2"
                                onClick={() => handleSelfAssignUrgentOrder(order)}
                                style={{ borderRadius: '0.75rem' }}
                              >
                                <i className="bi bi-exclamation-triangle-fill me-2"></i>
                                🚨 ¡Tomar Pedido Urgente!
                              </Button>
                              <small className="text-center text-muted">
                                Este pedido está disponible para todos los repartidores
                              </small>
                            </div>
                          ) : order.isEmergency && order.status !== 'delivered' && order.assignedTo === user?.email ? (
                            <div className="d-grid gap-2">
                              <Button
                                variant="warning"
                                size="sm"
                                className="py-2"
                                onClick={() => handleUpdateStatus(order)}
                                style={{ borderRadius: '0.75rem' }}
                              >
                                <i className="bi bi-pencil-square me-2"></i>
                                🚨 Actualizar Estado (URGENTE)
                              </Button>
                              <small className="text-center text-danger fw-bold">
                                PEDIDO URGENTE ASIGNADO A TI
                              </small>
                            </div>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              className="py-2"
                              onClick={() => handleUpdateStatus(order)}
                              style={{ borderRadius: '0.75rem' }}
                            >
                              <i className="bi bi-pencil-square me-2"></i>
                              Actualizar Estado
                            </Button>
                          )}
                        </div>
                      </Card.Body>
                    </Card>
                  ))}
                </div>

                {/* Vista de grid para desktop */}
                <div className="d-none d-md-block">
                  <Row>
                    {orders.map((order) => (
                      <Col xs={12} md={6} lg={4} key={order.id} className="mb-4">
                        <Card 
                          className={`h-100 shadow-sm ${order.isEmergency && order.status !== 'delivered' ? 'border-danger' : ''}`}
                          style={{ 
                            backgroundColor: order.isEmergency && order.status !== 'delivered' ? '#fff5f5' : 'white',
                            border: order.isEmergency && order.status !== 'delivered' ? '2px solid #dc3545' : ''
                          }}
                        >
                          <Card.Header 
                            className={`d-flex justify-content-between align-items-center ${order.isEmergency && order.status !== 'delivered' ? 'bg-danger text-white' : ''}`}
                          >
                            <small className={order.isEmergency && order.status !== 'delivered' ? 'text-light' : 'text-muted'}>
                              {new Date(order.date).toLocaleDateString()}
                            </small>
                            <div className="d-flex gap-2 align-items-center">
                              {order.isEmergency && order.status !== 'delivered' && (
                                <Badge bg="warning" text="dark">🚨 URGENTE</Badge>
                              )}
                              <Badge bg={getStatusColor(order.status)}>
                                {getStatusText(order.status)}
                              </Badge>
                            </div>
                          </Card.Header>
                          
                          <Card.Body>
                            <h6 className="fw-bold mb-2">Cliente: {order.userName}</h6>
                            <p className="text-muted small mb-2">{order.userEmail}</p>
                            
                            {/* Mostrar teléfono si está disponible */}
                            {order.shipping?.phone && (
                              <div className="mb-2">
                                <small className="text-success fw-bold">
                                  <i className="bi bi-telephone me-1"></i>
                                  {order.shipping.phone}
                                </small>
                              </div>
                            )}
                            
                            <div className="mb-3">
                              <strong>Productos:</strong>
                              <ul className="list-unstyled mt-1">
                                {order.items.map((item, index) => (
                                  <li key={index} className="small">
                                    {item.quantity}x {item.title || item.name || 'Producto'} - ${item.price}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            
                            <div className="d-flex justify-content-between align-items-center mb-3">
                              <strong>Total: ${order.total.toFixed(2)}</strong>
                            </div>

                            {order.deliveryNotes && (
                              <div className="mb-3">
                                <small className="text-muted">
                                  <strong>Notas:</strong> {order.deliveryNotes}
                                </small>
                              </div>
                            )}
                          </Card.Body>
                          
                          <Card.Footer>
                            {order.status === 'delivered' ? (
                              <Button 
                                variant="success" 
                                size="sm" 
                                className="w-100"
                                disabled
                              >
                                <i className="bi bi-check-circle-fill me-2"></i>
                                Entregado
                              </Button>
                            ) : order.isEmergency && order.status !== 'delivered' && !order.assignedTo ? (
                              <div className="d-grid gap-2">
                                <Button 
                                  variant="danger" 
                                  size="sm" 
                                  className="w-100"
                                  onClick={() => handleSelfAssignUrgentOrder(order)}
                                >
                                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                                  🚨 ¡Tomar Urgente!
                                </Button>
                                <small className="text-center text-muted">
                                  Disponible para todos
                                </small>
                              </div>
                            ) : order.isEmergency && order.status !== 'delivered' && order.assignedTo === user?.email ? (
                              <div className="d-grid gap-2">
                                <Button 
                                  variant="warning" 
                                  size="sm" 
                                  className="w-100"
                                  onClick={() => handleUpdateStatus(order)}
                                >
                                  <i className="bi bi-pencil-square me-2"></i>
                                  🚨 Actualizar (URGENTE)
                                </Button>
                                <small className="text-center text-danger fw-bold">
                                  ASIGNADO A TI
                                </small>
                              </div>
                            ) : (
                              <Button 
                                variant="primary" 
                                size="sm" 
                                className="w-100"
                                onClick={() => handleUpdateStatus(order)}
                              >
                                <i className="bi bi-pencil-square me-2"></i>
                                Actualizar Estado
                              </Button>
                            )}
                          </Card.Footer>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                </div>
              </>
            )}

            {/* Modal para actualizar estado - Mejorado y Responsive */}
            <Modal 
              show={showModal} 
              onHide={() => setShowModal(false)}
              fullscreen="sm-down"
              centered
            >
              <Modal.Header closeButton className="pb-2 border-0">
                <Modal.Title className="fs-6 fs-md-5 d-flex align-items-center">
                  <div className="bg-primary rounded-circle d-flex align-items-center justify-content-center me-2" 
                       style={{ width: '32px', height: '32px' }}>
                    <i className="bi bi-pencil-square text-white small"></i>
                  </div>
                  <span className="d-none d-sm-inline">Actualizar Estado de Entrega</span>
                  <span className="d-sm-none">Actualizar Estado</span>
                </Modal.Title>
              </Modal.Header>
              <Modal.Body className="px-3 px-md-4">
                {selectedOrder && (
                  <>
                    {/* Información del pedido */}
                    <div className="bg-light p-3 rounded mb-4">
                      <div className="row g-2">
                        <div className="col-12 col-md-6">
                          <div className="d-flex align-items-center mb-2">
                            <i className="bi bi-person-circle text-primary me-2"></i>
                            <div>
                              <div className="fw-bold small">{selectedOrder.userName}</div>
                              <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                {selectedOrder.userEmail}
                              </div>
                              {/* Mostrar teléfono si está disponible */}
                              {selectedOrder.shipping?.phone && (
                                <div className="text-success fw-bold" style={{ fontSize: '0.75rem' }}>
                                  <i className="bi bi-telephone me-1"></i>
                                  {selectedOrder.shipping.phone}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="col-12 col-md-6">
                          <div className="d-flex align-items-center">
                            <i className="bi bi-credit-card text-success me-2"></i>
                            <div>
                              <div className="fw-bold text-success">${selectedOrder.total.toFixed(2)}</div>
                              <div className="text-muted small">{selectedOrder.items.length} productos</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Estado actual */}
                    <div className="mb-3">
                      <div className="d-flex align-items-center justify-content-between">
                        <label className="fw-bold small text-muted">ESTADO ACTUAL</label>
                        <Badge bg={getStatusColor(selectedOrder.status)} className="px-2 py-1">
                          {getStatusText(selectedOrder.status)}
                        </Badge>
                      </div>
                    </div>
                    
                    {/* Selector de nuevo estado */}
                    <Form.Group className="mb-4">
                      <Form.Label className="fw-bold small text-muted">NUEVO ESTADO</Form.Label>
                      <Form.Select 
                        value={newStatus} 
                        onChange={(e) => setNewStatus(e.target.value)}
                        size="sm"
                        className="py-2"
                        style={{ borderRadius: '0.75rem' }}
                        disabled={selectedOrder.status === 'delivered'}
                      >
                        <option value="assigned">📋 Asignado</option>
                        <option value="picked_up">📦 Recogido del almacén</option>
                        <option value="in_transit">🚚 En camino al cliente</option>
                        <option value="delivered">✅ Entregado al cliente</option>
                      </Form.Select>
                      {selectedOrder.status === 'delivered' && (
                        <div className="small text-success mt-1">
                          <i className="bi bi-check-circle-fill me-1"></i>
                          Este pedido ya fue entregado y no se puede modificar
                        </div>
                      )}
                    </Form.Group>
                    
                    {/* Notas de entrega */}
                    <Form.Group className="mb-4">
                      <Form.Label className="fw-bold small text-muted">NOTAS DE ENTREGA</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={3}
                        value={deliveryNotes}
                        onChange={(e) => setDeliveryNotes(e.target.value)}
                        placeholder="Agregar comentarios sobre la entrega..."
                        size="sm"
                        style={{ borderRadius: '0.75rem' }}
                        disabled={selectedOrder.status === 'delivered'}
                      />
                      <div className="small text-muted mt-1">
                        <i className="bi bi-info-circle me-1"></i>
                        Ejemplo: "Cliente no estaba, dejado con vecino", "Entrega exitosa"
                      </div>
                    </Form.Group>

                    {/* Progreso visual de estados */}
                    <div className="mb-3">
                      <div className="small fw-bold text-muted mb-2">PROGRESO DE ENTREGA</div>
                      <div className="d-flex justify-content-between position-relative">
                        <div className="position-absolute w-100 h-1 bg-light top-50 translate-middle-y" style={{ zIndex: 0 }}></div>
                        {['assigned', 'picked_up', 'in_transit', 'delivered'].map((status, index) => {
                          const isCompleted = ['assigned', 'picked_up', 'in_transit', 'delivered'].indexOf(selectedOrder.status) >= index;
                          const isCurrent = selectedOrder.status === status;
                          return (
                            <div key={status} className="text-center position-relative" style={{ zIndex: 1 }}>
                              <div 
                                className={`rounded-circle d-flex align-items-center justify-content-center ${
                                  isCompleted ? 'bg-success text-white' : 'bg-light text-muted'
                                } ${isCurrent ? 'ring ring-success' : ''}`}
                                style={{ width: '24px', height: '24px', fontSize: '0.7rem' }}
                              >
                                {status === 'assigned' && '📋'}
                                {status === 'picked_up' && '📦'}
                                {status === 'in_transit' && '🚚'}
                                {status === 'delivered' && '✅'}
                              </div>
                              <div className="small text-muted mt-1" style={{ fontSize: '0.6rem' }}>
                                {status === 'assigned' && 'Asignado'}
                                {status === 'picked_up' && 'Recogido'}
                                {status === 'in_transit' && 'En tránsito'}
                                {status === 'delivered' && 'Entregado'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </Modal.Body>
              <Modal.Footer className="pt-2 border-0">
                <div className="d-flex gap-2 w-100">
                  <Button 
                    variant="outline-secondary" 
                    onClick={() => setShowModal(false)} 
                    size="sm"
                    className="flex-fill py-2"
                    style={{ borderRadius: '0.75rem' }}
                  >
                    <i className="bi bi-x-circle me-1"></i>
                    Cancelar
                  </Button>
                  <Button 
                    variant="primary" 
                    onClick={saveStatusUpdate} 
                    size="sm"
                    className="flex-fill py-2"
                    style={{ borderRadius: '0.75rem' }}
                    disabled={selectedOrder?.status === 'delivered'}
                  >
                    <i className="bi bi-check-circle me-1"></i>
                    {selectedOrder?.status === 'delivered' ? 'Completado' : 'Guardar'}
                  </Button>
                </div>
              </Modal.Footer>
            </Modal>
          </Container>
        </main>
      </div>
    </ProtectedRoute>
  );
};

export default DeliveryOrdersPage;
