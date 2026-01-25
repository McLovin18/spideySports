"use client";
import React, { useEffect, useState } from "react";
import { Container, Row, Col, Card, ListGroup, Badge, Spinner, Button, Alert } from "react-bootstrap";
import { useAuth } from "../context/AuthContext";
import { getUserPurchases } from "../services/purchaseService";
import { 
  getDeliveryStatusByOrderId, 
  getDeliveryStatusInfo, 
  saveDeliveryRating,
  hasOrderBeenRated 
} from "../services/deliveryService";
import DeliveryRatingModal from "../components/DeliveryRatingModal";
import Image from "next/image";
import Link from "next/link";
import Footer from "../components/Footer";


const MyOrdersPage = () => {
  const { user } = useAuth();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [deliveryStatuses, setDeliveryStatuses] = useState<{[key: string]: any}>({});
  const [loading, setLoading] = useState(false);
  
  // ✅ Estados para el sistema de calificación
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [ratedOrders, setRatedOrders] = useState<{[key: string]: boolean}>({});
  const [ratingSuccess, setRatingSuccess] = useState<string>('');

  const getReadableOrderId = (purchase: any, index: number) => {
    if (purchase.customerCode && purchase.orderNumber) {
      return `${purchase.customerCode}${purchase.orderNumber}`;
    }
    if (purchase.orderNumber) {
      return purchase.orderNumber;
    }
    if (purchase.fullOrderId) {
      return purchase.fullOrderId;
    }
    // Fallback: índice local formateado a 5 dígitos
    return String(index + 1).padStart(5, '0');
  };

  // Función para formatear fecha de manera legible
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      return `Hoy a las ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 2) {
      return `Ayer a las ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays <= 7) {
      return `Hace ${diffDays - 1} días`;
    } else {
      return date.toLocaleDateString('es-ES', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  useEffect(() => {
    const fetchPurchases = async () => {
      if (!user?.uid) return;
      setLoading(true);
      try {
        const data = await getUserPurchases(user.uid);
        
        // Ordenar por fecha (más reciente primero)
        const sortedPurchases = data.sort((a, b) => {
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          return dateB.getTime() - dateA.getTime();
        });
        
        setPurchases(sortedPurchases);

        // Cargar estados de delivery para cada orden
        const deliveryStatusPromises = sortedPurchases.map(async (purchase, index) => {
          // Usar el ID del documento de la compra
          const orderId = purchase.id!;
          const deliveryStatus = await getDeliveryStatusByOrderId(orderId);
          return { orderId, status: deliveryStatus };
        });

        const deliveryResults = await Promise.all(deliveryStatusPromises);
        const statusMap: {[key: string]: any} = {};
        
        deliveryResults.forEach(result => {
          statusMap[result.orderId] = result.status;
        });
        
        setDeliveryStatuses(statusMap);

        // ✅ Verificar qué órdenes ya han sido calificadas
        const ratingCheckPromises = sortedPurchases.map(async (purchase) => {
          const orderId = purchase.id!; // Usar el ID del documento
          const hasRating = await hasOrderBeenRated(orderId, user.uid);
          return { orderId, hasRating };
        });

        const ratingResults = await Promise.all(ratingCheckPromises);
        const ratingMap: {[key: string]: boolean} = {};
        
        ratingResults.forEach(result => {
          ratingMap[result.orderId] = result.hasRating;
        });
        
        setRatedOrders(ratingMap);
      } finally {
        setLoading(false);
      }
    };
    fetchPurchases();
  }, [user?.uid]);

  // ✅ Función para manejar el clic en "Calificar"
  const handleRateClick = (purchase: any, deliveryStatus: any) => {
    if (!user?.uid) return;
    
    const orderId = purchase.id!; // Usar el ID del documento
    const deliveryPersonEmail = deliveryStatus?.assignedTo || '';
    
    // ✅ Obtener el nombre real del repartidor basado en el email
    const getDeliveryPersonName = (email: string) => {
      const deliveryUsers = [
        { email: 'hwcobena@espol.edu.ec', name: 'Héctor Delivery' },
        { email: 'nexel2024@outlook.com', name: 'Nexel Delivery' },
        { email: 'delivery.centro@tienda.com', name: 'María González' },
        { email: 'delivery.norte@tienda.com', name: 'Luis Martínez' },
        { email: 'delivery.sur@tienda.com', name: 'Ana López' },
        { email: 'delivery.santaelena@tienda.com', name: 'Pedro Salinas' },
        { email: 'delivery.peninsula@tienda.com', name: 'Sofia Vera' }
      ];
      
      const deliveryUser = deliveryUsers.find(user => user.email === email);
      return deliveryUser?.name || 'Repartidor';
    };
    
    setSelectedOrder({
      orderId,
      deliveryPersonName: getDeliveryPersonName(deliveryPersonEmail),
      deliveryPersonEmail: deliveryPersonEmail,
      purchase
    });
    setShowRatingModal(true);
  };

  // ✅ Función para enviar la calificación
  const handleRatingSubmit = async (rating: number, comment: string) => {
    if (!selectedOrder || !user) return;

    try {
      await saveDeliveryRating({
        orderId: selectedOrder.orderId,
        deliveryPersonEmail: selectedOrder.deliveryPersonEmail,
        deliveryPersonName: selectedOrder.deliveryPersonName,
        userId: user.uid,
        userName: user.displayName || user.email?.split('@')[0] || 'Usuario',
        rating,
        comment
      });

      // ✅ Actualizar el estado local
      setRatedOrders(prev => ({
        ...prev,
        [selectedOrder.orderId]: true
      }));

      setRatingSuccess(`¡Gracias por calificar a ${selectedOrder.deliveryPersonName}!`);
      
      // ✅ Limpiar mensaje después de 5 segundos
      setTimeout(() => setRatingSuccess(''), 5000);

    } catch (error: any) {
      // Relanzar el error con un mensaje más específico
      throw new Error(error.message || 'Error al guardar la calificación');
    }
  };

  if (!user) {
    return (
      <Container className="py-5 text-center" style={{backgroundColor: "var(--cosmetic-secondary)"}}>
        <h2>Debes iniciar sesión para ver tus compras</h2>
        <Link href="/auth/login">
          <Button variant="dark" className="mt-3">Iniciar sesión</Button>
        </Link>
      </Container>
    );
  }

  return (
    <Container className="py-5" style={{backgroundColor: "var(--cosmetic-secondary)"}}>
      <h1 className="fw-bold text-center mb-5">Mis Compras</h1>
      {loading ? (
        <div className="text-center py-5">
          <Spinner animation="border" role="status" className="mb-3" />
          <p className="text-muted">Cargando tus compras...</p>
        </div>
      ) : purchases.length === 0 ? (
        <div className="text-center py-5">
          <i className="bi bi-box2 fs-1"></i>
          <h5 className="fw-bold mb-2">No tienes compras recientes</h5>
          <Button href="/products" className="rounded-1 px-4 mt-3" style={{backgroundColor: "var(--cosmetic-primary)"}}>Ver Productos</Button>
        </div>
      ) : (
        <>
          <Row className="g-4 justify-content-center">
            {purchases.map((purchase, idx) => (
              <Col xs={12} md={10} lg={8} key={idx}>
                <Card className="mb-4 border-0 shadow-sm">
                  <Card.Body>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <div>
                        <h6 className="fw-bold mb-1 text-primary">
                          <i className="bi bi-box me-2"></i>
                          Pedido #{getReadableOrderId(purchase, idx)}
                        </h6>
                        <div className="small text-muted">
                          <i className="bi bi-clock me-1"></i>
                          {formatDate(purchase.date)}
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="fw-bold fs-5 mb-2 text-success">${purchase.total.toFixed(2)}</div>
                        <div className="d-flex flex-column gap-1">
                          <Badge bg="success">
                            <i className="bi bi-check-circle me-1"></i>
                            Pagado
                          </Badge>
                          {(() => {
                            const orderId = purchase.id || `${user?.uid}_${purchase.date}`;
                            const deliveryStatus = deliveryStatuses[orderId];
                            const statusInfo = getDeliveryStatusInfo(deliveryStatus?.status);
                            
                            return (
                              <Badge bg={statusInfo.color}>
                                <i className={`bi bi-${statusInfo.icon} me-1`}></i>
                                {statusInfo.text}
                              </Badge>
                            );
                          })()}
                          
                          {/* ✅ Botón de calificación para órdenes entregadas */}
                          {(() => {
                            const orderId = purchase.id || `${user?.uid}_${purchase.date}`;
                            const deliveryStatus = deliveryStatuses[orderId];
                            const hasBeenRated = ratedOrders[orderId];
                            
                            // Solo mostrar si está entregado
                            if (deliveryStatus?.status === 'delivered') {
                              if (hasBeenRated) {
                                return (
                                  <Badge bg="info" className="mt-1">
                                    <i className="bi bi-star-fill me-1"></i>
                                    Ya calificado
                                  </Badge>
                                );
                              } else {
                                return (
                                  <Button
                                    size="sm"
                                    variant="warning"
                                    className="mt-1"
                                    onClick={() => handleRateClick(purchase, deliveryStatus)}
                                  >
                                    <i className="bi bi-star me-1"></i>
                                    Calificar
                                  </Button>
                                );
                              }
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="mb-3">
                      <h6 className="fw-bold mb-2 text-dark">
                        <i className="bi bi-bag me-2"></i>
                        Productos ({purchase.items.length})
                      </h6>
                      <Row className="g-2">
                        {purchase.items.map((item: any, i: number) => (
                          <Col xs={12} sm={6} md={4} key={i}>
                            <div className="d-flex align-items-center p-2 bg-light rounded">
                              <Image src={item.image} alt={item.name} width={40} height={40} className="me-3 rounded inventory-image" />
                              <div className="flex-grow-1">
                                <div className="fw-bold small">{item.name}</div>
                                <div className="text-muted small">Cantidad: {item.quantity}</div>
                              </div>
                            </div>
                          </Col>
                        ))}
                      </Row>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        </>
      )}
      
      {/* ✅ Alert de éxito para calificación */}
      {ratingSuccess && (
        <Row className="mt-3">
          <Col>
            <Alert variant="success" dismissible onClose={() => setRatingSuccess('')}>
              <i className="bi bi-check-circle-fill me-2"></i>
              {ratingSuccess}
            </Alert>
          </Col>
        </Row>
      )}
      
      {/* ✅ Modal de calificación */}
      {selectedOrder && (
        <DeliveryRatingModal
          show={showRatingModal}
          onHide={() => setShowRatingModal(false)}
          orderId={selectedOrder.orderId}
          deliveryPersonName={selectedOrder.deliveryPersonName}
          onRatingSubmit={handleRatingSubmit}
        />
      )}
      
      <Footer />
    </Container>
  );
};

export default MyOrdersPage; 