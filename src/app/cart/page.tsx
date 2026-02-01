'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Alert, Button, Card, Col, Container, Form, Row } from 'react-bootstrap';
import ConfettiCelebration from '../components/ConfettiCelebration';
import DeliveryLocationSelector from '../components/DeliveryLocationSelector';
import Footer from '../components/Footer';
import PayPalButton from '../components/paypalButton';
import PayPalProvider from '../components/paypalProvider';
import Sidebar from '../components/Sidebar';
import TopbarMobile from '../components/TopbarMobile';
import WhatsAppButton from '../components/WhatsAppButton';
import { useAuth } from '../context/AuthContext';
import { cartService, type CartItem } from '../services/cartService';
import { couponService, type Coupon } from '../services/couponService';
import { createDeliveryOrder } from '../services/deliveryService';
import { guestPurchaseService } from '../services/guestPurchaseService';
import { inventoryService } from '../services/inventoryService';
import { getSeasonalDiscountConfig, type SeasonalDiscountConfig, getProductSeasonalDiscountPercent } from '../services/seasonalDiscountService';
import {
  getQuizDiscountConfig,
  getQuizQuestionSet,
  isQuizConfigActiveNow,
  type QuizDiscountConfig,
  type QuizQuestion,
} from '../services/quizDiscountService';
import { getUserDisplayInfo, savePurchase, type PricingAdjustments } from '../services/purchaseService';
import AbandonedCartAlert from '../components/AbandonedCartAlert';
import { abandonedCartService } from '../services/abandonedCartService';
import { useAbandonedCartTracking } from '../hooks/useAbandonedCartTracking';

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const CartPage = () => {
  const { user, loading } = useAuth();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [seasonalConfig, setSeasonalConfig] = useState<SeasonalDiscountConfig | null>(null);
  const [loadingSeasonal, setLoadingSeasonal] = useState(false);
  const [quizConfig, setQuizConfig] = useState<QuizDiscountConfig | null>(null);
  const [quizQuestion, setQuizQuestion] = useState<QuizQuestion | null>(null);
  const [quizAnswer, setQuizAnswer] = useState('');
  const [quizError, setQuizError] = useState('');
  const [quizResult, setQuizResult] = useState<'correct' | 'incorrect' | null>(null);

  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [deliveryLocation, setDeliveryLocation] = useState<{city: string; zone: string; address?: string; phone?: string} | null>(null);
  const [guestEmail, setGuestEmail] = useState('');

  // Estado para código de descuento (cupones por usuario)
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  const subtotal = useMemo(
    () => cartItems.reduce((total, item) => total + item.price * item.quantity, 0),
    [cartItems]
  );

  const couponDiscountAmount = useMemo(() => {
    if (!appliedCoupon) return 0;
    return roundCurrency(subtotal * (appliedCoupon.discountPercent / 100));
  }, [appliedCoupon, subtotal]);

  const baseAfterCoupon = useMemo(() => {
    const base = subtotal - couponDiscountAmount;
    return roundCurrency(base > 0 ? base : 0);
  }, [subtotal, couponDiscountAmount]);

  const quizCampaignActive = useMemo(() => isQuizConfigActiveNow(quizConfig), [quizConfig]);

  const quizQuestionSet = useMemo(
    () => (quizConfig ? getQuizQuestionSet(quizConfig.reason) : null),
    [quizConfig]
  );

  const quizDiscountAmount = useMemo(() => {
    if (!quizCampaignActive || quizResult !== 'correct' || !quizConfig) return 0;
    return roundCurrency(baseAfterCoupon * (quizConfig.discountPercent / 100));
  }, [quizCampaignActive, quizResult, quizConfig, baseAfterCoupon]);

  const quizPenaltyAmount = useMemo(() => {
    if (!quizCampaignActive || quizResult !== 'incorrect' || !quizConfig) return 0;
    return roundCurrency(quizConfig.penaltyFee);
  }, [quizCampaignActive, quizResult, quizConfig]);

  const finalTotal = useMemo(() => {
    const total = baseAfterCoupon - quizDiscountAmount + quizPenaltyAmount;
    return roundCurrency(total > 0 ? total : 0);
  }, [baseAfterCoupon, quizDiscountAmount, quizPenaltyAmount]);

  useEffect(() => setIsClient(true), []);

  // Cargar configuración pública de descuentos de temporada (solo para mostrar info en el carrito)
  useEffect(() => {
    const loadSeasonal = async () => {
      try {
        setLoadingSeasonal(true);
        const config = await getSeasonalDiscountConfig();
        setSeasonalConfig(config);
      } catch (err) {
        console.error('Error cargando configuración de descuentos de temporada en carrito:', err);
      } finally {
        setLoadingSeasonal(false);
      }
    };

    loadSeasonal();
  }, []);

  useEffect(() => {
    const loadQuizConfig = async () => {
      try {
        const config = await getQuizDiscountConfig();
        setQuizConfig(config);
      } catch (err) {
        console.error('Error cargando configuración del quiz de descuento en carrito:', err);
      }
    };

    loadQuizConfig();
  }, []);

  // Suscripción al carrito
  useEffect(() => {
    if (!isClient || loading) return;

    if (!user?.uid) {
      const unsub = cartService.subscribe(setCartItems);
      return unsub;
    }

    cartService.migrateFromLocalStorage(user.uid);
    const unsub = cartService.subscribe(setCartItems, user?.uid);
    return unsub;
  }, [user?.uid, loading, isClient]);

  // Rastrear carritos abandonados
  useAbandonedCartTracking(user?.uid, cartItems, user?.email || undefined, user?.displayName || undefined);

  useEffect(() => {
    if (!quizCampaignActive || !quizQuestionSet) {
      setQuizQuestion(null);
      setQuizAnswer('');
      setQuizError('');
      setQuizResult(null);
      return;
    }

    if (quizQuestionSet.questions.length === 0) {
      setQuizQuestion(null);
      return;
    }

    const randomIndex = Math.floor(Math.random() * quizQuestionSet.questions.length);
    setQuizQuestion(quizQuestionSet.questions[randomIndex]);
    setQuizAnswer('');
    setQuizError('');
    setQuizResult(null);
  }, [quizCampaignActive, quizQuestionSet]);

  // Actualizar cantidad de producto en carrito
  const updateQuantity = async (cartItem: CartItem, newQuantity: number) => {
    try {
      if (newQuantity < 1) {
        await removeItem(cartItem);
        return;
      }

      await cartService.updateCartItemQuantity(
        user?.uid || '',
        cartItem.id,
        newQuantity,
        cartItem.sizeCode,
        cartItem.versionId
      );
    } catch (error) {
      console.error("Error al actualizar cantidad", error);
    }
  };

  const removeItem = async (cartItem: CartItem) => {
    try {
      await cartService.removeFromCart(
        user?.uid || '',
        cartItem.id,
        cartItem.sizeCode,
        cartItem.versionId
      );
    } catch (error) {
      console.error("Error al remover item", error);
    }
  };

  const handleQuizSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!quizQuestion) return;

    const answer = quizAnswer.trim();
    if (!answer) {
      setQuizError('Ingresa tu respuesta para participar.');
      return;
    }

    const normalized = answer.toLowerCase();
    const isCorrect = quizQuestion.answers.some((expected) => normalized === expected.toLowerCase());
    setQuizResult(isCorrect ? 'correct' : 'incorrect');
    setQuizError('');
  };

  // Aplicar código de descuento
  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.uid) {
      setCouponError('Debes iniciar sesión para usar un cupón de descuento.');
      return;
    }

    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setCouponError('Ingresa un código de descuento.');
      return;
    }

    setValidatingCoupon(true);
    setCouponError('');

    try {
      const coupon = await couponService.getCouponByCode(code);

      if (!coupon) {
        setAppliedCoupon(null);
        setCouponError('No encontramos este cupón. Revisa el código.');
        return;
      }

      if (coupon.userId !== user.uid) {
        setAppliedCoupon(null);
        setCouponError('Este cupón no pertenece a tu cuenta.');
        return;
      }

      if (!coupon.isActive || coupon.used) {
        setAppliedCoupon(null);
        setCouponError('Este cupón ya fue usado o está inactivo.');
        return;
      }

      setAppliedCoupon(coupon);
      setCouponError('');
    } catch (err) {
      console.error('Error al validar el cupón:', err);
      setAppliedCoupon(null);
      setCouponError('No se pudo validar el cupón. Inténtalo nuevamente.');
    } finally {
      setValidatingCoupon(false);
    }
  };

  // Pago exitoso
  const handlePaymentSuccess = async (details: any) => {
    setProcessing(true);
    setSaveError('');

    try {
      if (!deliveryLocation) {
        setSaveError("Por favor selecciona una ubicación de entrega.");
        setProcessing(false);
        return;
      }

      const pricingAdjustmentsMap: PricingAdjustments = {};
      if (couponDiscountAmount > 0) pricingAdjustmentsMap.coupon = couponDiscountAmount;
      if (quizDiscountAmount > 0) pricingAdjustmentsMap.quizDiscount = quizDiscountAmount;
      if (quizPenaltyAmount > 0) pricingAdjustmentsMap.quizPenalty = quizPenaltyAmount;

      const pricingAdjustmentsKeys = Object.keys(pricingAdjustmentsMap);
      const pricingAdjustmentsPayload = pricingAdjustmentsKeys.length > 0 ? pricingAdjustmentsMap : undefined;

      const triviaResultSummary = quizCampaignActive && quizQuestion && quizResult
        ? {
            question: quizQuestion.question,
            result: quizResult,
            ...(quizResult === 'correct'
              ? {
                  discountApplied: true,
                  discountAmount: quizDiscountAmount,
                }
              : {
                  discountApplied: false,
                  penaltyAmount: quizPenaltyAmount,
                }),
          }
        : undefined;

      if (!user?.uid) {
        // Pago invitado
        const purchaseData = {
          guestId: `guest_${Date.now()}`,
          paymentId: details.id,
          payer: details.payer,
          contact: { name: deliveryLocation?.zone || "Invitado", phone: deliveryLocation?.phone || "", email: guestEmail },
          deliveryLocation,
          items: cartItems.map(item => ({
            id: item.id.toString(),
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
            sizeCode: item.sizeCode,
            sizeLabel: item.sizeLabel,
            versionId: item.versionId,
            versionLabel: item.versionLabel,
          })),
          total: finalTotal,
          ...(pricingAdjustmentsPayload ? { pricingAdjustments: pricingAdjustmentsPayload } : {}),
          ...(triviaResultSummary ? { triviaResult: triviaResultSummary } : {}),
          date: new Date().toISOString(),
          status: "paid"
        };
        const itemsToProcess = cartItems.map(item => ({
          productId: item.id,
          quantity: item.quantity,
          sizeCode: item.sizeCode,
          versionId: item.versionId
        }));

        let guestPurchaseId: string | null = null;

        try {
          guestPurchaseId = await guestPurchaseService.saveGuestPurchase(purchaseData);
          await inventoryService.processOrder(itemsToProcess);
        } catch (stockError: any) {
          if (guestPurchaseId) {
            const rollbackSucceeded = await guestPurchaseService.deleteGuestPurchase(guestPurchaseId);
            if (!rollbackSucceeded) {
              console.error('No se pudo revertir la compra de invitado tras fallo de stock.');
            }
          }

          setSaveError(stockError?.message || 'Algunos productos no tienen stock suficiente.');
          setProcessing(false);
          return;
        }

          // --- Enviar correo al invitado ---
          try {
            const response = await fetch("https://us-central1-academiaonline-f38c4.cloudfunctions.net/sendOrderEmail", {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: guestEmail,
                orderId: purchaseData.guestId,
                items: purchaseData.items,
                total: purchaseData.total,
                deliveryLocation: purchaseData.deliveryLocation
              })
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Error desconocido al enviar correo');
            }

            console.log('Correo enviado al invitado correctamente');
          } catch (emailError: any) {
            console.error('Error enviando correo al invitado:', emailError.message);
          }
        // --- Fin envío correo ---

        await cartService.clearCart();
        
        // Limpiar carrito abandonado si existe (para usuarios no autenticados)
        if (!user?.uid) {
          // Usuario anonimo - no hay registro de abandono
        }
        
        setPaymentSuccess(true);
        window.dispatchEvent(new Event("cart-updated"));
        setProcessing(false);
        return;
      }

      // Pago usuario autenticado
      const userInfo = getUserDisplayInfo(user);

      // Si hay cupón aplicado, intentamos marcarlo como usado en Firestore
      let usedCoupon: Coupon | null = null;
      if (appliedCoupon) {
        try {
          usedCoupon = await couponService.redeemCouponOnce(appliedCoupon.code, user.uid);
        } catch (couponErr) {
          console.error('Error al marcar cupón como usado:', couponErr);
        }
      }

      const purchaseData = {
        userId: user.uid,
        date: new Date().toISOString(),
        items: cartItems.map(item => ({
          id: item.id.toString(),
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          image: item.image,
          sizeCode: item.sizeCode,
          sizeLabel: item.sizeLabel,
          versionId: item.versionId,
          versionLabel: item.versionLabel,
        })),
        total: finalTotal,
        paypalDetails: {
          transactionId: details.id,
          status: details.status,
          payerEmail: details.payer?.email_address,
          payerName: details.payer?.name?.given_name + ' ' + details.payer?.name?.surname,
          amount: details.purchase_units?.[0]?.amount?.value,
          currency: details.purchase_units?.[0]?.amount?.currency_code
        },
        shipping: {
          status: 'processing',
          method: 'standard_shipping',
          estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          trackingNumber: 'TRACK-' + Date.now(),
          city: deliveryLocation?.city || 'No especificada',
          zone: deliveryLocation?.zone || 'No especificada',
          address: deliveryLocation?.address || 'Dirección por especificar',
          phone: deliveryLocation?.phone || 'Teléfono no especificado'
        },
        ...(pricingAdjustmentsPayload ? { pricingAdjustments: pricingAdjustmentsPayload } : {}),
        ...(triviaResultSummary ? { triviaResult: triviaResultSummary } : {})
      };

      const purchaseId = await savePurchase(purchaseData, userInfo.userName, userInfo.userEmail);

      await cartService.clearCart(user.uid);
      
      // Limpiar carrito abandonado si existe
      if (user?.uid) {
        await abandonedCartService.deleteAbandonedCart(user.uid);
      }
      
      setPaymentSuccess(true);

    } catch (error) {
      console.error(error);
      setSaveError('Hubo un problema al guardar tu compra. Por favor, contacta al soporte.');
    } finally {
      setProcessing(false);
    }
  };


  const handlePayPalError = (error: any) => {
    if (error.userMessage) setSaveError(error.userMessage);
    else if (error?.message?.includes('INVALID_CLIENT_ID')) setSaveError('Error de configuración de PayPal.');
    else if (error?.message?.includes('sandbox')) setSaveError('Error: PayPal está en modo sandbox.');
    else setSaveError('Hubo un problema con el pago.');
    setProcessing(false);
  };

  if (paymentSuccess) {
    const isGuest = !user;
    return (
      <div className="d-flex flex-column min-vh-100 position-relative">
        <ConfettiCelebration />
        <Container className="py-5 flex-grow-1 text-center">
          <i className="bi bi-check-circle-fill text-success" style={{ fontSize: '4rem' }}></i>
          <h2 className="mt-3">¡Golazo! Pedido confirmado</h2>
          <p className="text-muted">Tu camiseta ya está lista para saltar a la cancha. En breve recibirás un correo con los detalles de envío.</p>
          <p className="fw-semibold text-cosmetic-tertiary">Gracias por unirte a la hinchada de SpideySports, ¡nos vemos en la grada!</p>

          {saveError && <Alert variant="warning" className="mt-3">{saveError}</Alert>}

          {isGuest && (
            <Alert variant="info" className="mt-4">
              <strong>¿Quieres recibir beneficios exclusivos?</strong><br />
              Crea una cuenta para:
              <ul className="mt-2 text-start mx-auto" style={{ maxWidth: "400px" }}>
                <li>Ver tus compras anteriores</li>
                <li>Acceder a promociones</li>
                <li>Guardar tu historial de pedidos</li>
                <li>Recibir soporte más rápido</li>
              </ul>
            </Alert>
          )}

          <div className="d-flex justify-content-center gap-3 mt-4">
            <Button href="/products" className="btn-cosmetic-primary px-4 py-2">Seguir comprando</Button>
            {user && <Button href="/profile?tab=orders" variant="outline-dark" className="px-4 py-2"><i className="bi bi-clock-history me-2"></i>Ver mis compras</Button>}
            {isGuest && <Button href="/auth/register" variant="outline-dark" className="px-4 py-2"><i className="bi bi-person-plus me-2"></i>Crear cuenta / Iniciar sesión</Button>}
          </div>
        </Container>
      </div>
    );
  }

  return (
    <PayPalProvider>
      <div className="d-flex flex-column min-vh-100">
        {user && <TopbarMobile />}
        <div className="d-flex flex-grow-1 w-100">
          {user && <Sidebar />}
          <main className="flex-grow-1">
            <Container className="py-5">
              <h1 className="fw-bold text-center mb-5 text-cosmetic-tertiary">Tu Carrito</h1>
              
              {/* Alert de carrito abandonado */}
              <AbandonedCartAlert userId={user?.uid || null} cartItems={cartItems} />
              {cartItems.length === 0 ? (
                <div className="text-center py-5">
                  <i className="bi bi-bag" style={{ fontSize: '4rem' }}></i>
                  <h2 className="fw-bold mb-3 text-cosmetic-tertiary">Tu carrito está vacío</h2>
                  <Button href="/products" className="btn-cosmetic-primary rounded-1 px-4 py-2 mt-3">Ver Productos</Button>
                </div>
              ) : (
                <Row className="g-4">
                  <Col xs={12} md={8}>
                    {cartItems.map((item) => (
                      <Card key={item.id} className="mb-4 border-0 shadow-sm">
                        <Row className="g-0 align-items-center">
                          <Col xs={4} md={3} className="p-3">
                            <Image src={item.image} alt={item.name} width={100} height={120} style={{ objectFit: 'cover', borderRadius: '0.5rem' }} className="inventory-image" />
                          </Col>
                          <Col xs={8} md={9} className="p-3">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <h5 className="fw-bold mb-0 text-cosmetic-tertiary">{item.name}</h5>
                              <Button variant="link" className="btn-cosmetic-primary text-danger p-0" onClick={() => removeItem(item)}><i className="bi bi-x-lg"></i></Button>
                            </div>
                            <div className="text-muted mb-2">
                              {item.versionLabel && (
                                <div className="small">Versión: {item.versionLabel}</div>
                              )}
                              {item.sizeLabel && (
                                <div className="small">Talla: {item.sizeLabel}</div>
                              )}
                            </div>
                            <div className="d-flex align-items-center mb-2">
                              <span className="me-2 ">Cantidad:</span>
                              <Button size="sm" className="btn-cosmetic-primary px-2 py-0" onClick={() => updateQuantity(item, item.quantity - 1)}>-</Button>
                              <span className="mx-2">{item.quantity}</span>
                              <Button size="sm" className="btn-cosmetic-primary px-2 py-0" onClick={() => updateQuantity(item, item.quantity + 1)}>+</Button>
                            </div>
                            <div className="d-flex flex-column align-items-start">
                              {/* Monto actual (el que realmente se cobra) */}
                              <div className="fw-bold text-primary" style={{ fontSize: '1.25rem' }}>
                                ${(item.price * item.quantity).toFixed(2)}
                              </div>

                              {/* Info de descuento si aplica y podemos inferir precio original */}
                              {!loadingSeasonal && seasonalConfig && (
                                (() => {
                                  const percent = getProductSeasonalDiscountPercent(seasonalConfig, item.id);
                                  if (!percent || percent <= 0) return null;

                                  // Si el item ya viene con precio rebajado, estimamos precio original
                                  const originalUnitPrice = item.price / (1 - percent / 100);

                                  // Evitar mostrar datos raros si algo no cuadra
                                  if (!isFinite(originalUnitPrice) || originalUnitPrice <= 0) return null;

                                  return (
                                    <div className="mt-1 text-muted" style={{ fontSize: '0.9rem' }}>
                                      <span
                                        className="badge bg-danger text-white me-2"
                                        style={{
                                          borderRadius: '999px',
                                          fontSize: '0.8rem',
                                          fontWeight: 700,
                                          padding: '0.25rem 0.8rem'
                                        }}
                                      >
                                        -{percent}%
                                      </span>
                                      <span>
                                        Antes:{' '}
                                        <span style={{ textDecoration: 'line-through' }}>
                                          ${(originalUnitPrice * item.quantity).toFixed(2)}
                                        </span>
                                      </span>
                                    </div>
                                  );
                                })()
                              )}
                            </div>
                          </Col>
                        </Row>
                      </Card>
                    ))}
                  </Col>

                  <Col xs={12} md={4}>
                    <Card className="p-4 border-0 shadow-sm position-sticky" style={{ top: '20px' }}>
                      <h4 className="fw-bold mb-4">Resumen</h4>
                      <div className="d-flex justify-content-between mb-2">
                        <span>Subtotal</span>
                        <span>${subtotal.toFixed(2)}</span>
                      </div>
                      <div className="d-flex justify-content-between mb-2">
                        <span>Envío</span>
                        {quizPenaltyAmount > 0 ? (
                          <span className="text-danger">+ ${quizPenaltyAmount.toFixed(2)}</span>
                        ) : (
                          <span className="text-success">Gratis</span>
                        )}
                      </div>
                      {quizPenaltyAmount > 0 && quizResult === 'incorrect' && (
                        <div className="text-danger small mb-3">
                          Se aplica un cargo extra por fallar el quiz.
                        </div>
                      )}

                      {user?.uid && (
                        <Form onSubmit={handleApplyCoupon} className="my-3">
                          <Form.Label className="small fw-semibold">Código de descuento</Form.Label>
                          <div className="d-flex gap-2">
                            <Form.Control
                              type="text"
                              placeholder="Ingresa tu código"
                              value={couponCode}
                              onChange={(e) => setCouponCode(e.target.value)}
                              disabled={processing || validatingCoupon}
                            />
                            <Button
                              type="submit"
                              className="btn-cosmetic-primary"
                              disabled={processing || validatingCoupon || !couponCode.trim()}
                            >
                              {validatingCoupon ? 'Validando...' : 'Aplicar'}
                            </Button>
                          </div>
                          {couponError && (
                            <div className="text-danger small mt-1">{couponError}</div>
                          )}
                          {appliedCoupon && !couponError && (
                            <div className="text-success small mt-1">
                              Cupón aplicado: <strong>{appliedCoupon.code}</strong> (-{appliedCoupon.discountPercent}%)
                              <Button
                                variant="link"
                                size="sm"
                                className="p-0 ms-2 text-danger"
                                onClick={() => setAppliedCoupon(null)}
                              >
                                Quitar
                              </Button>
                            </div>
                          )}
                        </Form>
                      )}

                      {quizCampaignActive && quizQuestion && cartItems.length > 0 && (
                        <div className="rounded-3 bg-light p-3 mb-3">
                          <h6 className="fw-semibold mb-2">
                            Quiz por descuento ({quizConfig?.discountPercent ?? 0}% OFF)
                          </h6>
                          <p className="small text-muted mb-3">
                            Responde correctamente la trivia de {quizConfig?.reasonLabel || 'fútbol'} para activar el descuento.{' '}
                            {quizConfig?.penaltyFee && quizConfig.penaltyFee > 0
                              ? `Si fallas se suma $${quizConfig.penaltyFee.toFixed(2)} al envío.`
                              : 'Si fallas solo pierdes la bonificación.'}
                          </p>
                          <div className="fw-semibold mb-2" style={{ lineHeight: 1.4 }}>
                            {quizQuestion.question}
                          </div>
                          <Form onSubmit={handleQuizSubmit}>
                            <Form.Label className="small text-muted">Tu respuesta</Form.Label>
                            <Form.Control
                              type="text"
                              placeholder="Escribe aquí tu respuesta"
                              value={quizAnswer}
                              onChange={(event) => {
                                setQuizAnswer(event.target.value);
                                if (quizError) setQuizError('');
                              }}
                              disabled={quizResult !== null || processing}
                            />
                            <Button
                              type="submit"
                              className="btn-cosmetic-primary w-100 mt-2"
                              disabled={quizResult !== null || processing}
                            >
                              {quizResult !== null ? 'Quiz completado' : 'Responder y participar'}
                            </Button>
                          </Form>
                          {quizError && (
                            <div className="text-danger small mt-2">{quizError}</div>
                          )}
                          {quizResult === 'correct' && (
                            <Alert variant="success" className="mt-3 mb-0">
                              ¡Descuento activado! Aplicamos {quizConfig?.discountPercent ?? 0}% a tu compra.
                            </Alert>
                          )}
                          {quizResult === 'incorrect' && (
                            <Alert variant="warning" className="mt-3 mb-0">
                              Buen intento. {quizConfig?.penaltyFee && quizConfig.penaltyFee > 0 ? 'Esta vez se sumó el cargo configurado.' : 'No se aplicó la bonificación en esta compra.'}
                            </Alert>
                          )}
                        </div>
                      )}

                      {appliedCoupon && (
                        <div className="d-flex justify-content-between mb-2 text-success">
                          <span>Descuento ({appliedCoupon.discountPercent}%)</span>
                          <span>- ${couponDiscountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      {quizDiscountAmount > 0 && (
                        <div className="d-flex justify-content-between mb-2 text-success">
                          <span>Quiz aplicado (-{quizConfig?.discountPercent ?? 0}%)</span>
                          <span>- ${quizDiscountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <hr />
                      <div className="d-flex justify-content-between mb-4">
                        <strong>Total</strong>
                        <strong>${finalTotal.toFixed(2)}</strong>
                      </div>

                      {saveError && <Alert variant="danger" className="mb-3">{saveError}</Alert>}
                      {processing && <Alert variant="info" className="mb-3"><i className="bi bi-hourglass-split me-2"></i>Procesando compra...</Alert>}

                      <DeliveryLocationSelector onLocationChange={setDeliveryLocation} disabled={cartItems.length === 0 || processing} />

                      <WhatsAppButton cartItems={cartItems} total={finalTotal} deliveryLocation={deliveryLocation} disabled={cartItems.length === 0 || processing || !deliveryLocation} />

                      <div className="text-center my-3">
                        <div className="d-flex align-items-center">
                          <hr className="flex-grow-1" />
                          <span className="px-3 text-muted small">o paga con tarjeta</span>
                          <hr className="flex-grow-1" />
                        </div>
                      </div>

                      {!user?.uid && (
                        <Form.Group className="my-3" controlId="guestEmail">
                          <Form.Label>Tu correo electrónico</Form.Label>
                          <Form.Control type="email" placeholder="Para enviarte los detalles del pedido" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} required />
                        </Form.Group>
                      )}

                      <PayPalButton
                        amount={finalTotal}
                        onSuccess={handlePaymentSuccess}
                        onError={handlePayPalError}
                        disabled={cartItems.length === 0 || processing || !deliveryLocation || (!user?.uid && !guestEmail)}
                        guestEmail={!user?.uid ? guestEmail : undefined}
                      />

                      <div className="text-center mt-3">
                        <small className="text-muted"><i className="bi bi-shield-check me-1"></i>Pago seguro con PayPal</small>
                      </div>
                    </Card>
                  </Col>
                </Row>
              )}
            </Container>
          </main>
        </div>
        <Footer />
      </div>
    </PayPalProvider>
  );
};

export default CartPage;
