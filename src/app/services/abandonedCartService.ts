'use client';

import { db } from '../utils/firebase';
import { collection, setDoc, getDoc, deleteDoc, doc, getDocs, query, where, Timestamp, updateDoc } from 'firebase/firestore';
import { CartItem } from './cartService';

// ============================================================================
// INTERFACES PARA ABANDONED CARTS
// ============================================================================

export interface AbandonedCart {
  userId: string;
  userEmail?: string;
  userName?: string;
  items: CartItem[];
  cartTotal: number;
  cartSize: number;
  abandonedAt: string; // ISO date string
  lastCheckedOut?: string; // última vez que vimos si aún tiene items
  dismissed: boolean; // si el usuario clickeó "Ok" para no ver más el mensaje
  dismissedAt?: string;
}

export interface AbandonedCartStats {
  totalAbandoned: number;
  totalValue: number;
  averageCartValue: number;
  recoveryRate: number; // % de carritos que se convirtieron en compras
}

// ============================================================================
// SERVICIO DE ABANDONED CARTS
// ============================================================================

class AbandonedCartService {
  private readonly COLLECTION_NAME = 'abandonedCarts';
  private readonly ABANDONED_THRESHOLD_HOURS = 24; // considerar como "abandonado" después de 24 horas sin compra

  /**
   * Registra un carrito como abandonado cuando tiene items pero el usuario se va
   */
  async trackAbandonedCart(
    userId: string,
    items: CartItem[],
    cartTotal: number,
    userEmail?: string,
    userName?: string
  ): Promise<void> {
    try {
      if (items.length === 0) return; // No registrar carritos vacíos

      const now = new Date();
      const docRef = doc(db, this.COLLECTION_NAME, userId);

      const abandonedCart: AbandonedCart = {
        userId,
        userEmail,
        userName,
        items,
        cartTotal,
        cartSize: items.reduce((total, item) => total + item.quantity, 0),
        abandonedAt: now.toISOString(),
        dismissed: false,
      };

      await setDoc(docRef, abandonedCart);
      console.log(`✅ Carrito abandonado registrado para usuario ${userId}`);
    } catch (error) {
      console.error('Error tracking abandoned cart:', error);
    }
  }

  /**
   * Obtiene un carrito abandonado específico
   */
  async getAbandonedCart(userId: string): Promise<AbandonedCart | null> {
    try {
      const docRef = doc(db, this.COLLECTION_NAME, userId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return docSnap.data() as AbandonedCart;
      }
      return null;
    } catch (error) {
      console.error('Error fetching abandoned cart:', error);
      return null;
    }
  }

  /**
   * Obtiene todos los carritos abandonados para el dashboard
   */
  async getAllAbandonedCarts(): Promise<AbandonedCart[]> {
    try {
      const collRef = collection(db, this.COLLECTION_NAME);
      const snapshot = await getDocs(collRef);

      const carts: AbandonedCart[] = [];
      snapshot.docs.forEach((doc) => {
        const data = doc.data() as AbandonedCart;
        carts.push(data);
      });

      return carts.sort((a, b) => {
        const dateA = new Date(a.abandonedAt).getTime();
        const dateB = new Date(b.abandonedAt).getTime();
        return dateB - dateA; // Más recientes primero
      });
    } catch (error) {
      console.error('Error fetching all abandoned carts:', error);
      return [];
    }
  }

  /**
   * Marca que el usuario vio la alerta de abandono y clickeó "Ok"
   */
  async dismissAbandonedCartAlert(userId: string): Promise<void> {
    try {
      const docRef = doc(db, this.COLLECTION_NAME, userId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        await updateDoc(docRef, {
          dismissed: true,
          dismissedAt: new Date().toISOString(),
        });
        console.log(`✅ Alerta de abandono marcada como visto para ${userId}`);
      }
    } catch (error) {
      console.error('Error dismissing abandoned cart alert:', error);
    }
  }

  /**
   * Elimina un carrito abandonado (cuando el usuario compra o después de cierto tiempo)
   */
  async deleteAbandonedCart(userId: string): Promise<void> {
    try {
      const docRef = doc(db, this.COLLECTION_NAME, userId);
      await deleteDoc(docRef);
      console.log(`✅ Carrito abandonado eliminado para ${userId}`);
    } catch (error) {
      console.error('Error deleting abandoned cart:', error);
    }
  }

  /**
   * Obtiene estadísticas de carritos abandonados
   */
  async getAbandonedCartStats(): Promise<AbandonedCartStats> {
    try {
      const allCarts = await this.getAllAbandonedCarts();
      const totalAbandoned = allCarts.length;
      const totalValue = allCarts.reduce((sum, cart) => sum + cart.cartTotal, 0);
      const averageCartValue = totalAbandoned > 0 ? totalValue / totalAbandoned : 0;

      // Nota: Para recovery rate, necesitaríamos comparar con compras realizadas
      // Por ahora retornamos 0 - esto se puede mejorar más adelante
      return {
        totalAbandoned,
        totalValue: Math.round(totalValue * 100) / 100,
        averageCartValue: Math.round(averageCartValue * 100) / 100,
        recoveryRate: 0,
      };
    } catch (error) {
      console.error('Error fetching abandoned cart stats:', error);
      return {
        totalAbandoned: 0,
        totalValue: 0,
        averageCartValue: 0,
        recoveryRate: 0,
      };
    }
  }

  /**
   * Obtiene carritos abandonados RECIENTEMENTE (últimas 24 horas)
   */
  async getRecentAbandonedCarts(): Promise<AbandonedCart[]> {
    try {
      const allCarts = await this.getAllAbandonedCarts();
      const now = new Date();
      const oneDay = 24 * 60 * 60 * 1000;

      return allCarts.filter((cart) => {
        const abandonedTime = new Date(cart.abandonedAt).getTime();
        const diff = now.getTime() - abandonedTime;
        return diff <= oneDay && !cart.dismissed;
      });
    } catch (error) {
      console.error('Error fetching recent abandoned carts:', error);
      return [];
    }
  }

  /**
   * Verifica si un usuario tiene carrito abandonado sin verlo
   */
  async hasUnseenAbandonedCart(userId: string): Promise<AbandonedCart | null> {
    try {
      const cart = await this.getAbandonedCart(userId);
      if (cart && !cart.dismissed) {
        return cart;
      }
      return null;
    } catch (error) {
      console.error('Error checking unseen abandoned cart:', error);
      return null;
    }
  }
}

export const abandonedCartService = new AbandonedCartService();
