'use client';

import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Badge, Spinner, Alert, Nav, Tab } from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/adminContext';
import NavbarComponent from '../../components/Navbar';
import Sidebar from '../../components/Sidebar';
import TopbarMobile from '../../components/TopbarMobile';
import Footer from '../../components/Footer';
import { useRouter } from 'next/navigation';

// Servicios
import { analyticsService, type WeeklyRevenue, type TopProduct, type CustomerAnalytics, type ProductVelocity } from '../../services/analyticsService';
import { abandonedCartService, type AbandonedCartStats } from '../../services/abandonedCartService';
import { pipelineService, type SalesPipeline } from '../../services/pipelineService';

// Componentes de gráficos
import RevenueChart from '../../components/dashboard/RevenueChart';
import TopProductsChart from '../../components/dashboard/TopProductsChart';
import CustomerAnalyticsChart from '../../components/dashboard/CustomerAnalyticsChart';
import InventoryAnalysisChart from '../../components/dashboard/InventoryAnalysisChart';
import AbandonedCartsWidget from '../../components/dashboard/AbandonedCartsWidget';
import PipelineChart from '../../components/dashboard/PipelineChart';

export default function SalesDashboardPage() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useRole();
  const router = useRouter();

  // Estados para datos
  const [weeklyRevenue, setWeeklyRevenue] = useState<WeeklyRevenue[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [customerAnalytics, setCustomerAnalytics] = useState<CustomerAnalytics | null>(null);
  const [productVelocity, setProductVelocity] = useState<ProductVelocity[]>([]);
  const [abandonedStats, setAbandonedStats] = useState<AbandonedCartStats | null>(null);
  const [pipeline, setPipeline] = useState<SalesPipeline | null>(null);

  // Estados de UI
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  // Protección de ruta
  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      router.push('/');
    }
  }, [adminLoading, isAdmin, router]);

  // Cargar datos
  useEffect(() => {
    if (user && isAdmin) {
      loadAllData();
      // Recargar cada 5 minutos
      const interval = setInterval(loadAllData, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [user, isAdmin]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [revenue, products, customers, velocity, abandoned, pipe] = await Promise.all([
        analyticsService.getWeeklyRevenue(12),
        analyticsService.getTopProducts(10),
        analyticsService.getCustomerAnalytics(),
        analyticsService.getProductVelocity(),
        abandonedCartService.getAbandonedCartStats(),
        pipelineService.getSalesPipeline(),
      ]);

      setWeeklyRevenue(revenue);
      setTopProducts(products);
      setCustomerAnalytics(customers);
      setProductVelocity(velocity);
      setAbandonedStats(abandoned);
      setPipeline(pipe);
      setLastUpdate(new Date().toLocaleTimeString('es-ES'));
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError('Error cargando datos del dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (adminLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <Spinner animation="border" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="d-flex flex-column" style={{ minHeight: '100vh' }}>
      <TopbarMobile />
      
      <div className="d-flex flex-grow-1">
        <Sidebar />
        
        <main className="flex-grow-1 p-4" style={{ backgroundColor: '#0f1419', minHeight: '100vh' }}>
          <Container fluid>
            {/* Header */}
            <Row className="mb-4">
              <Col>
                <h1 className="mb-2 text-white">📊 Dashboard de Ventas</h1>
                <small className="text-light">
                  Última actualización: {lastUpdate || 'Cargando...'}
                  {' '}
                  <button 
                    className="btn btn-sm btn-outline-light ms-2"
                    onClick={loadAllData}
                    disabled={loading}
                  >
                    🔄 Actualizar
                  </button>
                </small>
              </Col>
            </Row>

            {/* Error Alert */}
            {error && <Alert variant="danger">{error}</Alert>}

            {/* Loading State */}
            {loading ? (
              <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
                <Spinner animation="border" />
              </div>
            ) : (
              <>
                {/* Tabs para diferentes vistas */}
                <Tab.Container activeKey={activeTab} onSelect={(k) => setActiveTab(k || 'dashboard')}>
                  <Nav variant="pills" className="mb-4" style={{ backgroundColor: '#1a1f26', padding: '10px', borderRadius: '8px' }}>
                    <Nav.Item>
                      <Nav.Link eventKey="dashboard" className="text-light">Dashboard Principal</Nav.Link>
                    </Nav.Item>
                    <Nav.Item>
                      <Nav.Link eventKey="inventory" className="text-light">Análisis de Inventario</Nav.Link>
                    </Nav.Item>
                    <Nav.Item>
                      <Nav.Link eventKey="abandoned" className="text-light">Carritos Abandonados</Nav.Link>
                    </Nav.Item>
                    <Nav.Item>
                      <Nav.Link eventKey="pipeline" className="text-light">Pipeline de Ventas</Nav.Link>
                    </Nav.Item>
                  </Nav>

                  <Tab.Content>
                    {/* TAB 1: Dashboard Principal */}
                    <Tab.Pane eventKey="dashboard">
                      {/* KPIs Principales */}
                      <Row className="mb-4">
                        <Col lg={3} md={6} className="mb-3">
                          <Card className="border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                            <Card.Body className="text-white">
                              <Card.Title className="mb-2 opacity-75">Ingresos (Semana)</Card.Title>
                              <h3 className="mb-0">
                                ${weeklyRevenue.length > 0 
                                  ? weeklyRevenue[weeklyRevenue.length - 1].revenue.toLocaleString('es-ES')
                                  : '0'}
                              </h3>
                            </Card.Body>
                          </Card>
                        </Col>

                        <Col lg={3} md={6} className="mb-3">
                          <Card className="border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
                            <Card.Body className="text-white">
                              <Card.Title className="mb-2 opacity-75">Órdenes (Semana)</Card.Title>
                              <h3 className="mb-0">
                                {weeklyRevenue.length > 0 
                                  ? weeklyRevenue[weeklyRevenue.length - 1].orderCount
                                  : '0'}
                              </h3>
                            </Card.Body>
                          </Card>
                        </Col>

                        <Col lg={3} md={6} className="mb-3">
                          <Card className="border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
                            <Card.Body className="text-white">
                              <Card.Title className="mb-2 opacity-75">Clientes Totales</Card.Title>
                              <h3 className="mb-0">{customerAnalytics?.totalCustomers || '0'}</h3>
                            </Card.Body>
                          </Card>
                        </Col>

                        <Col lg={3} md={6} className="mb-3">
                          <Card className="border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
                            <Card.Body className="text-white">
                              <Card.Title className="mb-2 opacity-75">Recurrentes</Card.Title>
                              <h3 className="mb-0">{customerAnalytics?.returningCustomers || '0'}</h3>
                            </Card.Body>
                          </Card>
                        </Col>
                      </Row>

                      {/* Gráficos Principales */}
                      <Row className="mb-4">
                        <Col lg={8} className="mb-3">
                          <Card className="border-0 shadow-sm">
                            <Card.Header className="bg-light border-bottom">
                              <Card.Title className="mb-0">📈 Ingresos por Semana</Card.Title>
                            </Card.Header>
                            <Card.Body>
                              <RevenueChart data={weeklyRevenue} />
                            </Card.Body>
                          </Card>
                        </Col>

                        <Col lg={4} className="mb-3">
                          <Card className="border-0 shadow-sm">
                            <Card.Header className="bg-light border-bottom">
                              <Card.Title className="mb-0">👥 Clientes</Card.Title>
                            </Card.Header>
                            <Card.Body>
                              <CustomerAnalyticsChart data={customerAnalytics} />
                            </Card.Body>
                          </Card>
                        </Col>
                      </Row>

                      {/* Top Productos */}
                      <Row>
                        <Col className="mb-3">
                          <Card className="border-0 shadow-sm">
                            <Card.Header className="bg-light border-bottom">
                              <Card.Title className="mb-0">🏆 Top 10 Productos Más Vendidos</Card.Title>
                            </Card.Header>
                            <Card.Body>
                              <TopProductsChart data={topProducts} />
                            </Card.Body>
                          </Card>
                        </Col>
                      </Row>
                    </Tab.Pane>

                    {/* TAB 2: Análisis de Inventario */}
                    <Tab.Pane eventKey="inventory">
                      <Card className="border-0 shadow-sm">
                        <Card.Header className="bg-light border-bottom">
                          <Card.Title className="mb-0">📦 Análisis de Inventario</Card.Title>
                        </Card.Header>
                        <Card.Body>
                          <InventoryAnalysisChart data={productVelocity} />
                        </Card.Body>
                      </Card>
                    </Tab.Pane>

                    {/* TAB 3: Carritos Abandonados */}
                    <Tab.Pane eventKey="abandoned">
                      <AbandonedCartsWidget stats={abandonedStats} />
                    </Tab.Pane>

                    {/* TAB 4: Pipeline */}
                    <Tab.Pane eventKey="pipeline">
                      <PipelineChart pipeline={pipeline} />
                    </Tab.Pane>
                  </Tab.Content>
                </Tab.Container>
              </>
            )}
          </Container>
        </main>
      </div>

      <Footer />
    </div>
  );
}
