'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Table, Alert, Spinner, Badge, ButtonGroup } from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/adminContext';
import Sidebar from '../../components/Sidebar';
import TopbarMobile from '../../components/TopbarMobile';
import Footer from '../../components/Footer';
import { inventoryService, type ProductInventory } from '../../services/inventoryService';
import {
  getSeasonalDiscountConfig,
  saveSeasonalDiscountConfig,
  SEASONAL_DISCOUNT_REASONS,
  type SeasonalDiscountConfig,
} from '../../services/seasonalDiscountService';
import {
  getQuizDiscountConfig,
  saveQuizDiscountConfig,
  QUIZ_DISCOUNT_REASONS,
  getQuizQuestionSet,
  type QuizDiscountReason,
} from '../../services/quizDiscountService';
import { couponService, type AutoCouponConfig, type Coupon } from '../../services/couponService';
import { userNotificationService } from '../../services/userNotificationService';
import { DailyOrder, DailyOrdersDocument, getAllOrderDays } from '../../services/purchaseService';

interface ProductWithDiscount extends ProductInventory {
  discountPercent?: number;
}

const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

const BeneficiosPage: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'seasonal' | 'coupons' | 'quiz'>('seasonal');

  const [isActive, setIsActive] = useState(false);
  const [reason, setReason] = useState(SEASONAL_DISCOUNT_REASONS[0].value);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [products, setProducts] = useState<ProductWithDiscount[]>([]);
  const [productDiscounts, setProductDiscounts] = useState<Record<number, number>>({});
  const [searchTerm, setSearchTerm] = useState('');

  // Estado para quiz de descuento
  const [quizIsActive, setQuizIsActive] = useState(false);
  const [quizReason, setQuizReason] = useState<QuizDiscountReason>('champions');
  const [quizStartDate, setQuizStartDate] = useState('');
  const [quizEndDate, setQuizEndDate] = useState('');
  const [quizDiscountPercent, setQuizDiscountPercent] = useState(10);
  const [quizPenaltyFee, setQuizPenaltyFee] = useState(2);
  const [savingQuiz, setSavingQuiz] = useState(false);

  // Estado para cupones
  const [autoCouponConfig, setAutoCouponConfig] = useState<AutoCouponConfig | null>(null);
  const [loadingAutoConfig, setLoadingAutoConfig] = useState(false);
  const [savingAutoConfig, setSavingAutoConfig] = useState(false);
  const [customers, setCustomers] = useState<{
    userId: string;
    userName?: string;
    userEmail?: string;
    totalOrders: number;
    totalAmount: number;
  }[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [manualCouponPercent, setManualCouponPercent] = useState(25);
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);

  const seasonalReasonLabel = useMemo(() => {
    const match = SEASONAL_DISCOUNT_REASONS.find((item) => item.value === reason);
    return match ? match.label : SEASONAL_DISCOUNT_REASONS[0].label;
  }, [reason]);

  const quizReasonLabel = useMemo(() => {
    const match = QUIZ_DISCOUNT_REASONS.find((item) => item.value === quizReason);
    return match ? match.label : QUIZ_DISCOUNT_REASONS[0].label;
  }, [quizReason]);

  const selectedQuizSet = useMemo(() => getQuizQuestionSet(quizReason), [quizReason]);

  const seasonalIsRunning = useMemo(() => {
    if (!isActive) return false;
    return (!startDate || startDate <= todayIso) && (!endDate || endDate >= todayIso);
  }, [isActive, startDate, endDate, todayIso]);

  const quizIsRunning = useMemo(() => {
    if (!quizIsActive) return false;
    return (!quizStartDate || quizStartDate <= todayIso) && (!quizEndDate || quizEndDate >= todayIso);
  }, [quizIsActive, quizStartDate, quizEndDate, todayIso]);

  const heroReasonLabel = activeTab === 'quiz' ? quizReasonLabel : seasonalReasonLabel;
  const heroStatusVariant = activeTab === 'quiz'
    ? quizIsRunning ? 'success' : 'secondary'
    : seasonalIsRunning ? 'success' : 'secondary';
  const heroStatusBadgeClass = activeTab === 'quiz'
    ? `hero-metric__value benefits-hero__status benefits-status-badge ${quizIsRunning ? 'is-on' : 'is-off'}`
    : `hero-metric__value benefits-hero__status benefits-status-badge ${seasonalIsRunning ? 'is-on' : 'is-off'}`;
  const heroStatusLabel = activeTab === 'quiz'
    ? quizIsRunning ? 'Quiz activado (si fecha válida)' : 'Quiz desactivado'
    : seasonalIsRunning ? 'Campaña activa (si fecha válida)' : 'Campaña desactivada';
  const heroHint = activeTab === 'quiz'
    ? 'Activa trivias tematicas para premiar a la hinchada.'
    : 'Semifinales Champions · Mundial 2026 · Retro Drop Spidey';

  useEffect(() => {
    if (user && isAdmin) {
      loadInitialData();
      loadCouponsData();
    }
  }, [user, isAdmin]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [allProducts, seasonalConfig, quizConfig] = await Promise.all([
        inventoryService.getAllProducts(),
        getSeasonalDiscountConfig(),
        getQuizDiscountConfig(),
      ]);

      const mappedProducts: ProductWithDiscount[] = allProducts.map((p) => ({ ...p }));
      const discounts: Record<number, number> = {};

      if (seasonalConfig) {
        const isExpired = !!seasonalConfig.endDate && seasonalConfig.endDate < todayIso;

        // Si la campaña ya terminó por fecha fin, el switch se muestra desactivado
        setIsActive(isExpired ? false : seasonalConfig.isActive);
        setReason(seasonalConfig.reason);
        setStartDate(seasonalConfig.startDate || '');
        setEndDate(seasonalConfig.endDate || '');

        seasonalConfig.products.forEach((item) => {
          discounts[item.productId] = item.discountPercent;
          const idx = mappedProducts.findIndex((p) => p.productId === item.productId);
          if (idx !== -1) {
            mappedProducts[idx].discountPercent = item.discountPercent;
          }
        });
      } else {
        setStartDate(todayIso);
      }

      if (quizConfig) {
        const quizExpired = !!quizConfig.endDate && quizConfig.endDate < todayIso;
        setQuizIsActive(quizExpired ? false : quizConfig.isActive);
        setQuizReason(quizConfig.reason);
        setQuizStartDate(quizConfig.startDate || '');
        setQuizEndDate(quizConfig.endDate || '');
        setQuizDiscountPercent(Math.min(90, Math.max(1, Math.round(quizConfig.discountPercent || 10))));
        setQuizPenaltyFee(Math.round(Math.max(0, quizConfig.penaltyFee) * 100) / 100);
      } else {
        setQuizIsActive(false);
        setQuizReason('champions');
        setQuizStartDate(todayIso);
        setQuizEndDate('');
        setQuizDiscountPercent(10);
        setQuizPenaltyFee(2);
      }

      setProducts(mappedProducts);
      setProductDiscounts(discounts);
    } catch (err: any) {
      console.error('Error cargando configuración de beneficios:', err);
      setError('Error al cargar la configuración de descuentos.');
    } finally {
      setLoading(false);
    }
  };

  const loadCouponsData = async () => {
    try {
      setLoadingAutoConfig(true);
      setLoadingCustomers(true);
      setError(null);

      const [config, days] = await Promise.all([
        couponService.getAutoConfig(),
        getAllOrderDays(),
      ]);

      setAutoCouponConfig(config);

      const customerMap = new Map<string, {
        userId: string;
        userName?: string;
        userEmail?: string;
        totalOrders: number;
        totalAmount: number;
      }>();

      (days || []).forEach((day: DailyOrdersDocument) => {
        (day.orders || []).forEach((order: DailyOrder) => {
          if (!order.userId) return;

          const key = order.userId;
          const existing = customerMap.get(key) || {
            userId: key,
            userName: order.userName,
            userEmail: order.userEmail,
            totalOrders: 0,
            totalAmount: 0,
          };

          existing.totalOrders += 1;
          existing.totalAmount += order.total;
          if (!existing.userName && order.userName) existing.userName = order.userName;
          if (!existing.userEmail && order.userEmail) existing.userEmail = order.userEmail;

          customerMap.set(key, existing);
        });
      });

      const list = Array.from(customerMap.values())
        .filter(customer => customer.totalOrders >= 3) // 🎯 Solo clientes con 3+ pedidos
        .sort((a, b) => b.totalOrders - a.totalOrders);
      setCustomers(list);
    } catch (err: any) {
      console.error('Error cargando datos de cupones:', err);
      setError((prev) => prev || 'Error al cargar datos de cupones y clientes.');
    } finally {
      setLoadingAutoConfig(false);
      setLoadingCustomers(false);
    }
  };

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase();
    return products.filter((p) =>
      p.name.toLowerCase().includes(term) ||
      p.productId.toString().includes(term) ||
      (p.category || '').toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  const handleDiscountChange = (productId: number, value: string) => {
    const numeric = parseFloat(value);
    setProductDiscounts((prev) => {
      const updated = { ...prev };
      if (isNaN(numeric) || numeric <= 0) {
        delete updated[productId];
      } else {
        updated[productId] = Math.min(90, Math.max(1, numeric));
      }
      return updated;
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      if (!startDate) {
        setError('Debes elegir una fecha de inicio para la campaña.');
        return;
      }

      if (endDate && endDate < startDate) {
        setError('La fecha fin no puede ser anterior a la fecha de inicio.');
        return;
      }

      const selectedProducts = Object.entries(productDiscounts)
        .filter(([, discount]) => discount > 0)
        .map(([productId, discount]) => ({
          productId: Number(productId),
          discountPercent: Math.min(90, Math.max(1, discount)),
        }));

      const reasonData = SEASONAL_DISCOUNT_REASONS.find((r) => r.value === reason) || SEASONAL_DISCOUNT_REASONS[0];

      const payload: SeasonalDiscountConfig = {
        isActive,
        reason,
        reasonLabel: reasonData.label,
        startDate,
        endDate: endDate || undefined,
        products: selectedProducts,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveSeasonalDiscountConfig(payload);
      setSuccess('Configuración de descuentos guardada correctamente.');
    } catch (err: any) {
      console.error('Error guardando configuración de descuentos:', err);
      setError('Error al guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuizSave = async () => {
    try {
      setSavingQuiz(true);
      setError(null);
      setSuccess(null);

      if (!quizStartDate) {
        setError('Debes elegir una fecha de inicio para el quiz.');
        return;
      }

      if (quizEndDate && quizEndDate < quizStartDate) {
        setError('La fecha fin del quiz no puede ser anterior a la fecha de inicio.');
        return;
      }

      const reasonData = QUIZ_DISCOUNT_REASONS.find((r) => r.value === quizReason) || QUIZ_DISCOUNT_REASONS[0];

      await saveQuizDiscountConfig({
        isActive: quizIsActive,
        reason: quizReason,
        reasonLabel: reasonData.label,
        startDate: quizStartDate,
        endDate: quizEndDate || undefined,
        discountPercent: quizDiscountPercent,
        penaltyFee: quizPenaltyFee,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setSuccess('Configuración del quiz guardada correctamente.');
    } catch (err: any) {
      console.error('Error guardando configuración del quiz:', err);
      setError('Error al guardar la configuración del quiz.');
    } finally {
      setSavingQuiz(false);
    }
  };

  const isConfigLocked = !isActive;
  const isQuizConfigLocked = !quizIsActive;

  if (roleLoading) {
    return (
      <Container className="py-5 text-center">
        <Spinner animation="border" role="status" />
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
          <p>No tienes permisos para acceder a Beneficios.</p>
        </Alert>
      </Container>
    );
  }

  return (
    <div className="d-flex flex-column flex-lg-row" style={{ minHeight: '100vh', overflowX: 'hidden' }}>
      <Sidebar />

      <div className="flex-grow-1 d-flex flex-column">
        <TopbarMobile />

        <main className="benefits-dashboard flex-grow-1 py-4 px-3 px-md-4">
          <Container fluid>
            <Row className="mb-4">
              <Col>
                <div className="benefits-hero">
                  <div className="benefits-hero__header">
                    <h2 className="benefits-hero__title">Centro de Beneficios Matchday</h2>
                    <p className="benefits-hero__subtitle">
                      Ajusta campañas y cupones para acompañar los momentos decisivos del calendario futbolístico.
                    </p>
                  </div>
                  <div className="benefits-hero__metrics">
                    <div className="hero-metric">
                      <span className="hero-metric__label">Campaña seleccionada</span>
                      <span className="hero-metric__value">{heroReasonLabel}</span>
                    </div>
                    <div className="hero-metric">
                      <span className="hero-metric__label">Estado</span>
                      <Badge bg={heroStatusVariant} className={heroStatusBadgeClass}>
                        {heroStatusLabel}
                      </Badge>
                    </div>
                  </div>
                  <div className="benefits-hero__actions">
                    <span className="benefits-hero__hint">
                      {heroHint}
                    </span>
                    <ButtonGroup size="sm" className="benefits-hero__tabs">
                      <Button
                        variant={activeTab === 'seasonal' ? 'primary' : 'outline-light'}
                        onClick={() => setActiveTab('seasonal')}
                      >
                        Descuentos de temporada
                      </Button>
                      <Button
                        variant={activeTab === 'quiz' ? 'primary' : 'outline-light'}
                        onClick={() => setActiveTab('quiz')}
                      >
                        Quiz por descuento
                      </Button>
                      <Button
                        variant={activeTab === 'coupons' ? 'primary' : 'outline-light'}
                        onClick={() => setActiveTab('coupons')}
                      >
                        Cupones
                      </Button>
                    </ButtonGroup>
                  </div>
                </div>
              </Col>
            </Row>

            {error && (
              <Row className="mb-3">
                <Col>
                  <Alert variant="danger">{error}</Alert>
                </Col>
              </Row>
            )}

            {success && (
              <Row className="mb-3">
                <Col>
                  <Alert variant="success">{success}</Alert>
                </Col>
              </Row>
            )}

            {activeTab === 'seasonal' && (
              <Row className="mb-4">
              <Col lg={6} className="mb-3">
                <Card className="shadow-sm benefits-card">
                  <Card.Header className="benefits-card__header">
                    <strong>Configuración de campaña</strong>
                  </Card.Header>
                  <Card.Body className="benefits-card__body">
                    <Form.Group className="mb-3" controlId="toggleActive">
                      <Form.Check
                        type="switch"
                        label="Activar descuentos de temporada"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                      />
                      <Form.Text className="text-muted">
                        Cuando está activado y la fecha es válida, la sección de descuentos se mostrará en la página principal.
                      </Form.Text>
                    </Form.Group>

                    <Row className="mb-3">
                      <Col md={6} className="mb-3 mb-md-0">
                        <Form.Label>Razón del descuento</Form.Label>
                        <Form.Select
                          value={reason}
                          onChange={(e) => setReason(e.target.value as any)}
                          disabled={isConfigLocked}
                        >
                          {SEASONAL_DISCOUNT_REASONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </Form.Select>
                      </Col>
                      <Col md={3}>
                        <Form.Label>Fecha inicio</Form.Label>
                        <Form.Control
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          disabled={isConfigLocked}
                        />
                      </Col>
                      <Col md={3}>
                        <Form.Label>Fecha fin</Form.Label>
                        <Form.Control
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          disabled={isConfigLocked}
                        />
                      </Col>
                    </Row>

                    <div className="mt-2 small text-muted">
                      <p className="mb-1">
                        La sección pública mostrará un mensaje como:
                      </p>
                      <p className="mb-0 fst-italic">
                        "Activa tu colección especial por &lt;razón seleccionada&gt; y equipa a la afición".
                      </p>
                    </div>
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={6} className="mb-3">
                <Card className="shadow-sm benefits-card h-100">
                  <Card.Header className="benefits-card__header">
                    <strong>Resumen rápido</strong>
                  </Card.Header>
                  <Card.Body className="benefits-card__body">
                    <p className="mb-2">
                      Estado:{' '}
                      <Badge
                        bg={seasonalIsRunning ? 'success' : 'secondary'}
                        className={`benefits-status-badge ${seasonalIsRunning ? 'is-on' : 'is-off'}`}
                      >
                        {seasonalIsRunning ? 'Campaña activa (si fecha válida)' : 'Campaña desactivada'}
                      </Badge>
                    </p>
                    <p className="mb-1">
                      Productos con descuento:{' '}
                      <strong>{Object.keys(productDiscounts).length}</strong>
                    </p>
                    <p className="mb-1 small text-muted">
                      Solo se guardan productos con porcentaje &gt; 0.
                    </p>
                    <Button
                      variant="primary"
                      disabled={saving}
                      onClick={handleSave}
                      className="mt-2"
                    >
                      {saving ? 'Guardando...' : 'Guardar configuración'}
                    </Button>
                  </Card.Body>
                </Card>
              </Col>
              </Row>
            )}

            {activeTab === 'quiz' && (
              <Row className="mb-4">
                <Col lg={6} className="mb-3">
                  <Card className="shadow-sm benefits-card h-100">
                    <Card.Header className="benefits-card__header">
                      <strong>Quiz futbolero</strong>
                    </Card.Header>
                    <Card.Body className="benefits-card__body">
                      <Form.Group className="mb-3" controlId="quizActive">
                        <Form.Check
                          type="switch"
                          label="Activar quiz por descuento"
                          checked={quizIsActive}
                          onChange={(e) => setQuizIsActive(e.target.checked)}
                        />
                        <Form.Text className="text-muted">
                          Habilita una trivia temática para otorgar un descuento dinámico al momento de pagar.
                        </Form.Text>
                      </Form.Group>

                      <Row className="mb-3">
                        <Col md={6} className="mb-3 mb-md-0">
                          <Form.Label>Temática del quiz</Form.Label>
                          <Form.Select
                            value={quizReason}
                            onChange={(event) => setQuizReason(event.target.value as QuizDiscountReason)}
                            disabled={isQuizConfigLocked}
                          >
                            {QUIZ_DISCOUNT_REASONS.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </Form.Select>
                        </Col>
                        <Col md={3}>
                          <Form.Label>Fecha inicio</Form.Label>
                          <Form.Control
                            type="date"
                            value={quizStartDate}
                            onChange={(event) => setQuizStartDate(event.target.value)}
                            disabled={isQuizConfigLocked}
                          />
                        </Col>
                        <Col md={3}>
                          <Form.Label>Fecha fin</Form.Label>
                          <Form.Control
                            type="date"
                            value={quizEndDate}
                            onChange={(event) => setQuizEndDate(event.target.value)}
                            disabled={isQuizConfigLocked}
                          />
                        </Col>
                      </Row>

                      <Row className="mb-3">
                        <Col md={6} className="mb-3 mb-md-0">
                          <Form.Label>% de descuento</Form.Label>
                          <Form.Control
                            type="number"
                            min={1}
                            max={90}
                            value={quizDiscountPercent}
                            onChange={(event) => {
                              const raw = Math.round(Number(event.target.value) || 1);
                              setQuizDiscountPercent(Math.min(90, Math.max(1, raw)));
                            }}
                            disabled={isQuizConfigLocked}
                          />
                          <Form.Text className="text-muted">
                            Se aplica al total restante después de cupones.
                          </Form.Text>
                        </Col>
                        <Col md={6}>
                          <Form.Label>Cargo por error ($)</Form.Label>
                          <Form.Control
                            type="number"
                            min={0}
                            step={0.5}
                            value={quizPenaltyFee}
                            onChange={(event) => {
                              const raw = Math.max(0, Number(event.target.value) || 0);
                              setQuizPenaltyFee(Math.round(raw * 100) / 100);
                            }}
                            disabled={isQuizConfigLocked}
                          />
                          <Form.Text className="text-muted">
                            Importe fijo que se suma si la respuesta es incorrecta.
                          </Form.Text>
                        </Col>
                      </Row>

                      <Button
                        variant="primary"
                        disabled={savingQuiz}
                        onClick={handleQuizSave}
                      >
                        {savingQuiz ? 'Guardando...' : 'Guardar configuración'}
                      </Button>
                    </Card.Body>
                  </Card>
                </Col>

                <Col lg={6} className="mb-3">
                  <Card className="shadow-sm benefits-card h-100">
                    <Card.Header className="benefits-card__header d-flex justify-content-between align-items-center">
                      <span>Vista previa del quiz</span>
                      <Badge bg="info" text="dark">{quizDiscountPercent}% OFF</Badge>
                    </Card.Header>
                    <Card.Body className="benefits-card__body">
                      <p className="mb-2">
                        <strong>Temática:</strong> {selectedQuizSet.label}
                      </p>
                      <p className="small text-muted mb-3">{selectedQuizSet.description}</p>
                      <div className="mb-3">
                        <Badge bg="secondary" className="me-2">Descuento</Badge>
                        <span className="small text-muted">{quizDiscountPercent}% sobre el total neto</span>
                      </div>
                      <div className="mb-3">
                        <Badge bg={quizPenaltyFee > 0 ? 'danger' : 'success'} className="me-2">
                          {quizPenaltyFee > 0 ? `+ $${quizPenaltyFee.toFixed(2)}` : 'Sin cargo'}
                        </Badge>
                        <span className="small text-muted">Cargo aplicado si el quiz falla</span>
                      </div>
                      <div className="quiz-questions-preview">
                        <p className="fw-semibold mb-2">Preguntas disponibles</p>
                        <ol className="ps-3 mb-0 small">
                          {selectedQuizSet.questions.map((item, index) => (
                            <li key={`${selectedQuizSet.key}-${index}`} className="mb-1">
                              {item.question}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            )}

            {activeTab === 'coupons' && (
              <Row className="mb-4">
                <Col lg={5} className="mb-3">
                  <Card className="shadow-sm benefits-card h-100">
                    <Card.Header className="benefits-card__header">
                      <strong>Configuración de cupones automáticos</strong>
                    </Card.Header>
                    <Card.Body className="benefits-card__body">
                      {loadingAutoConfig ? (
                        <div className="text-center py-3">
                          <Spinner animation="border" size="sm" />
                          <p className="mt-2 mb-0 text-muted">Cargando configuración...</p>
                        </div>
                      ) : (
                        <>
                          <Form.Group className="mb-3" controlId="autoCouponsActive">
                            <Form.Check
                              type="switch"
                              label="Activar cupones automáticos por número de pedidos"
                              checked={!!autoCouponConfig?.isActive}
                              onChange={async (e) => {
                                if (!autoCouponConfig) {
                                  setAutoCouponConfig({
                                    isActive: e.target.checked,
                                    orderMultiple: 10,
                                    discountPercent: 10,
                                    updatedAt: new Date().toISOString(),
                                  });
                                  return;
                                }
                                setAutoCouponConfig({ ...autoCouponConfig, isActive: e.target.checked });
                              }}
                            />
                            <Form.Text muted>
                              Configura aquí cada cuántos pedidos se generará un cupón automático. Si está desactivado, no se generarán cupones automáticos.
                            </Form.Text>
                          </Form.Group>

                          <Row className="mb-3">
                            <Col md={6} className="mb-3 mb-md-0">
                              <Form.Label>Múltiplo de pedidos</Form.Label>
                              <Form.Control
                                type="number"
                                min={1}
                                value={autoCouponConfig?.orderMultiple ?? 10}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value, 10) || 1;
                                  setAutoCouponConfig((prev) => prev ? {
                                    ...prev,
                                    orderMultiple: value,
                                  } : {
                                    isActive: true,
                                    orderMultiple: value,
                                    discountPercent: 25,
                                    updatedAt: new Date().toISOString(),
                                  });
                                }}
                              />
                              <Form.Text muted>
                                Ejemplo: 10 para clientes muy frecuentes.
                              </Form.Text>
                            </Col>
                            <Col md={6}>
                              <Form.Label>% descuento automático</Form.Label>
                              <Form.Control
                                type="number"
                                min={1}
                                max={90}
                                value={autoCouponConfig?.discountPercent ?? 25}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value) || 1;
                                  setAutoCouponConfig((prev) => prev ? {
                                    ...prev,
                                    discountPercent: Math.min(90, Math.max(1, value)),
                                  } : {
                                    isActive: true,
                                    orderMultiple: 10,
                                    discountPercent: Math.min(90, Math.max(1, value)),
                                    updatedAt: new Date().toISOString(),
                                  });
                                }}
                              />
                            </Col>
                          </Row>

                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!autoCouponConfig || savingAutoConfig}
                            onClick={async () => {
                              if (!autoCouponConfig) return;
                              try {
                                setSavingAutoConfig(true);
                                await couponService.saveAutoConfig(autoCouponConfig);
                                setSuccess('Configuración de cupones automáticos guardada correctamente.');
                              } catch (err) {
                                console.error('Error guardando configuración de cupones:', err);
                                setError('Error al guardar la configuración de cupones automáticos.');
                              } finally {
                                setSavingAutoConfig(false);
                              }
                            }}
                          >
                            {savingAutoConfig ? 'Guardando...' : 'Guardar configuración'}
                          </Button>
                        </>
                      )}
                    </Card.Body>
                  </Card>
                </Col>

                <Col lg={7} className="mb-3">
                  <Card className="shadow-sm benefits-card h-100">
                    <Card.Header className="benefits-card__header d-flex justify-content-between align-items-center">
                      <div>
                        <span>🎯 Clientes más valiosos ({customers.length})</span>
                        <div className="small text-muted mt-1">Solo clientes con 3+ pedidos para cupones específicos</div>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <Form.Label className="mb-0 small">% cupón manual:</Form.Label>
                        <Form.Control
                          type="number"
                          size="sm"
                          style={{ width: '80px' }}
                          min={1}
                          max={90}
                          value={manualCouponPercent}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value) || 1;
                            setManualCouponPercent(Math.min(90, Math.max(1, value)));
                          }}
                        />
                      </div>
                    </Card.Header>
                    <Card.Body className="benefits-card__body p-0">
                      {loadingCustomers ? (
                        <div className="text-center py-3">
                          <Spinner animation="border" size="sm" />
                          <p className="mt-2 mb-0 text-muted">Cargando clientes...</p>
                        </div>
                      ) : customers.length === 0 ? (
                        <div className="text-center py-4">
                          <div className="text-muted mb-2">
                            <i className="fs-1">🎯</i>
                          </div>
                          <h6 className="text-muted">No hay clientes con 3+ pedidos</h6>
                          <p className="small text-muted mb-0">
                            Los cupones específicos se enfocan en clientes frecuentes.<br/>
                            Cuando tengas clientes con 3 o más pedidos aparecerán aquí.
                          </p>
                        </div>
                      ) : (
                        <div className="table-responsive">
                          <Table hover size="sm" className="mb-0 benefits-table">
                            <thead>
                              <tr>
                                <th>👤 Cliente</th>
                                <th>📧 Email</th>
                                <th className="text-center">🛒 Pedidos</th>
                                <th className="text-end">💰 Total gastado</th>
                                <th className="text-center">🎁 Cupón</th>
                              </tr>
                            </thead>
                            <tbody>
                              {customers.map((c) => (
                                <tr key={c.userId}>
                                  <td>{c.userName || c.userId}</td>
                                  <td>{c.userEmail || '-'}</td>
                                  <td className="text-center">
                                    <Badge bg="danger" className="benefits-count-badge">{c.totalOrders}</Badge>
                                  </td>
                                  <td className="text-end">{formatCurrency(c.totalAmount)}</td>
                                  <td className="text-center">
                                    <Button
                                      variant="outline-light"
                                      size="sm"
                                      onClick={async () => {
                                        try {
                                          setSaving(true);
                                          const coupon = await couponService.createCouponForUser({
                                            userId: c.userId,
                                            discountPercent: manualCouponPercent,
                                            source: 'manual',
                                          });
                                          setSuccess(`Cupón ${coupon.code} creado para ${c.userName || c.userEmail || c.userId}.`);
                                          await userNotificationService.createCouponNotification({
                                            userId: c.userId,
                                            userEmail: c.userEmail,
                                            couponCode: coupon.code,
                                            discountPercent: coupon.discountPercent,
                                            source: 'manual',
                                          });
                                        } catch (err) {
                                          console.error('Error creando cupón manual:', err);
                                          setError('Error al crear el cupón para este cliente.');
                                        } finally {
                                          setSaving(false);
                                        }
                                      }}
                                    >
                                      Enviar código
                                    </Button>
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
            )}

            {activeTab === 'seasonal' && (
              <Row>
                <Col>
                  <Card className="shadow-sm benefits-card">
                    <Card.Header className="benefits-card__header d-flex justify-content-between align-items-center">
                      <span>Productos disponibles</span>
                      <Form.Control
                        type="text"
                        placeholder="Buscar por nombre, ID o categoría"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        disabled={isConfigLocked}
                        style={{ maxWidth: '280px' }}
                        size="sm"
                      />
                    </Card.Header>
                    <Card.Body className="benefits-card__body p-0">
                      {loading ? (
                        <div className="text-center py-4">
                          <Spinner animation="border" role="status" size="sm" />
                          <p className="mt-2 mb-0 text-muted">Cargando productos...</p>
                        </div>
                      ) : filteredProducts.length === 0 ? (
                        <div className="text-center py-4">
                          <p className="mb-0 text-muted">No se encontraron productos.</p>
                        </div>
                      ) : (
                        <div className="table-responsive" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                          <Table hover size="sm" className="mb-0 benefits-table">
                            <thead>
                              <tr>
                                <th>ID</th>
                                <th>Producto</th>
                                <th className="text-end">Precio</th>
                                <th className="text-center">Descuento %</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredProducts.map((product) => {
                                const discount = productDiscounts[product.productId] || '';
                                return (
                                  <tr key={product.productId}>
                                    <td>{product.productId}</td>
                                    <td>
                                      <div className="fw-semibold">{product.name}</div>
                                      <div className="small text-muted">{product.category || 'Sin categoría'}</div>
                                    </td>
                                    <td className="text-end">{formatCurrency(product.price)}</td>
                                    <td className="text-center" style={{ maxWidth: '120px' }}>
                                      <Form.Control
                                        type="number"
                                        min={0}
                                        max={90}
                                        step={1}
                                        size="sm"
                                        value={discount}
                                        onChange={(e) => handleDiscountChange(product.productId, e.target.value)}
                                        disabled={isConfigLocked}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </Table>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            )}
          </Container>
        </main>

        <Footer />
      </div>
    </div>
  );
};

export default BeneficiosPage;
