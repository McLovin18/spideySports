import { useEffect } from 'react';
import { abandonedCartService } from '../services/abandonedCartService';
import type { CartItem } from '../services/cartService';

/**
 * Hook que rastrea carritos abandonados
 * Registra un carrito como abandonado cuando:
 * - El usuario está autenticado
 * - Tiene items en el carrito
 * - Permanece en el carrito sin comprar durante un tiempo
 */
export const useAbandonedCartTracking = (
  userId: string | null | undefined,
  cartItems: CartItem[],
  userEmail?: string,
  userName?: string
) => {
  useEffect(() => {
    // No registrar si no hay usuario o carrito vacío
    if (!userId || cartItems.length === 0) return;

    // Registrar el carrito como abandonado después de 5 minutos de inactividad
    const timeoutId = setTimeout(async () => {
      try {
        const cartTotal = cartItems.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );

        await abandonedCartService.trackAbandonedCart(
          userId,
          cartItems,
          Math.round(cartTotal * 100) / 100,
          userEmail,
          userName
        );
      } catch (error) {
        console.error('Error tracking abandoned cart:', error);
      }
    }, 5 * 60 * 1000); // 5 minutos

    // Limpiar timeout si el usuario compra o cambia el carrito
    return () => clearTimeout(timeoutId);
  }, [userId, cartItems, userEmail, userName]);
};
