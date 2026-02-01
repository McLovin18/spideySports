import React, { useState, useEffect } from 'react';
import { Alert, Button } from 'react-bootstrap';
import { abandonedCartService, type AbandonedCart } from '../services/abandonedCartService';

interface Props {
  userId: string | null;
  cartItems?: any[];
}

export default function AbandonedCartAlert({ userId, cartItems }: Props) {
  const [abandonedCart, setAbandonedCart] = useState<AbandonedCart | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId || cartItems?.length === 0) return;

    checkAbandonedCart();
  }, [userId, cartItems?.length]);

  const checkAbandonedCart = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const cart = await abandonedCartService.hasUnseenAbandonedCart(userId);
      if (cart) {
        setAbandonedCart(cart);
      }
    } catch (error) {
      console.error('Error checking abandoned cart:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    if (!userId) return;

    try {
      await abandonedCartService.dismissAbandonedCartAlert(userId);
      setDismissed(true);
      setTimeout(() => setAbandonedCart(null), 300);
    } catch (error) {
      console.error('Error dismissing alert:', error);
    }
  };

  if (dismissed || !abandonedCart || loading) {
    return null;
  }

  const itemCount = abandonedCart.cartSize;
  const totalValue = abandonedCart.cartTotal;
  const hoursAgo = Math.floor(
    (new Date().getTime() - new Date(abandonedCart.abandonedAt).getTime()) / (1000 * 60 * 60)
  );

  return (
    <div className="mb-3" style={{ position: 'relative', zIndex: 10 }}>
      <Alert 
        variant="warning" 
        className="d-flex justify-content-between align-items-start"
        style={{
          borderLeft: '4px solid #ffc107',
          backgroundColor: '#fff8f0',
          borderColor: '#ffc107',
        }}
      >
        <div className="flex-grow-1">
          <h6 className="alert-heading mb-2">
            🛒 ¡Completá tu compra!
          </h6>
          <p className="mb-2">
            Detectamos que dejaste un carrito con <strong>{itemCount} artículos</strong> hace {hoursAgo} hora{hoursAgo > 1 ? 's' : ''}.
          </p>
          <small className="text-muted">
            Valor del carrito abandonado: <strong>${totalValue.toLocaleString('es-ES')}</strong>
          </small>
        </div>
        <Button
          variant="outline-warning"
          size="sm"
          onClick={handleDismiss}
          className="ms-3"
          style={{ whiteSpace: 'nowrap' }}
        >
          OK
        </Button>
      </Alert>
    </div>
  );
}
