'use client';

import { db } from '../utils/firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import { inventoryService } from './inventoryService';
import { jerseySizeLabel, isValidJerseySizeCode, type JerseySizeCode } from '../constants/jersey';

// Reactivo interno del CartService
type Listener = (items: CartItem[]) => void;

export interface CartItem {
  id: number;
  name: string;
  price: number;
  image: string;
  quantity: number;
  sizeCode?: JerseySizeCode;
  sizeLabel?: string;
  versionId?: string;
  versionLabel?: string;
  userId?: string;
  dateAdded?: string;
}

export interface CartData {
  userId: string;
  items: CartItem[];
  lastUpdated: string;
  totalItems: number;
  totalPrice: number;
}

class CartService {
  private readonly COLLECTION_NAME = 'carts';
  private readonly CART_GUEST_KEY = 'cartItems_guest';

  // Estado reactivo interno
  private listeners: Listener[] = [];

  private sanitizeSizeCode(sizeCode?: string | JerseySizeCode): JerseySizeCode | undefined {
    if (!sizeCode) return undefined;
    const candidate = typeof sizeCode === 'string' ? sizeCode.trim().toUpperCase() : sizeCode;
    return isValidJerseySizeCode(candidate) ? (candidate as JerseySizeCode) : undefined;
  }

  private enrichCartItem(item: CartItem): CartItem {
    const sizeCode = this.sanitizeSizeCode(item.sizeCode);
    return {
      ...item,
      sizeCode,
      sizeLabel: sizeCode ? jerseySizeLabel(sizeCode) : item.sizeLabel,
    };
  }

  private normalizeItems(items: CartItem[]): CartItem[] {
    return items.map((item) => this.enrichCartItem(item));
  }

  private findItemIndex(items: CartItem[], id: number, sizeCode?: JerseySizeCode, versionId?: string): number {
    return items.findIndex((item) =>
      item.id === id &&
      (item.sizeCode || undefined) === (sizeCode || undefined) &&
      (item.versionId || undefined) === (versionId || undefined)
    );
  }

  /* ================================================================
      🔹 LISTENER SYSTEM REACTIVO
  =================================================================*/
  subscribe(callback: Listener, userId?: string) {
    this.listeners.push(callback);

    // Estado inicial correcto según usuario
    if (userId) {
      this.getUserCart(userId).then(items => callback(items));
    } else {
      callback(this.getGuestCart());
    }

    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }


  


  // 🔄 Compatibilidad con versiones previas
  subscribeToCartChanges(callback: Listener) {
    return this.subscribe(callback);
  }

  getGuestTotalItems(): number {
    const cart = this.getGuestCart();
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }


  private emit(items?: CartItem[]) {
    if (items) {
      const normalized = this.normalizeItems(items);
      this.listeners.forEach(cb => cb(normalized));
      return;
    }

    // Si no se proporciona lista → modo invitado
    const guest = this.getGuestCart();
    this.listeners.forEach(cb => cb(guest));
  }

  /* ================================================================
      🔹 CARRITO INVITADO
  =================================================================*/
  private getGuestCart(): CartItem[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = JSON.parse(localStorage.getItem(this.CART_GUEST_KEY) || '[]');
      return Array.isArray(raw) ? this.normalizeItems(raw as CartItem[]) : [];
    } catch (error) {
      console.warn('No se pudo leer el carrito de invitados, se reiniciará.', error);
      return [];
    }
  }

  private saveGuestCart(items: CartItem[]) {
    if (typeof window === 'undefined') return;

    const normalized = this.normalizeItems(items);
    localStorage.setItem(this.CART_GUEST_KEY, JSON.stringify(normalized));

    // Emitir cambios al sistema reactivo
    this.emit(normalized);

    // Evento global (para actualizar el ícono)
    window.dispatchEvent(new Event("cart-updated"));
  }

  /* ================================================================
      🔹 GET USER CART
  =================================================================*/
  async getUserCart(userId: string): Promise<CartItem[]> {
    if (!userId) {
      return this.getGuestCart();
    }

    try {
      const cartRef = doc(db, this.COLLECTION_NAME, userId);
      const cartDoc = await getDoc(cartRef);
      if (cartDoc.exists()) {
        const storedItems = (cartDoc.data() as CartData).items || [];
        return this.normalizeItems(storedItems);
      }
      return [];

    } catch (error) {
      console.error("Error al obtener carrito:", error);
      return [];
    }
  }



  /* ================================================================
      🔹 ADD TO CART
  =================================================================*/

  async addToCart(
    userId: string,
    item: Omit<CartItem, 'userId' | 'dateAdded'>
  ): Promise<boolean> {

    /* ======================================
          🟣 MODO INVITADO (sin login)
    ====================================== */
    if (!userId) {
      const guestItems = this.getGuestCart();
      const sizeCode = this.sanitizeSizeCode(item.sizeCode);
      const versionId = item.versionId || undefined;

      const isAvailable = await inventoryService.isProductAvailable(item.id, item.quantity, sizeCode, versionId);
      if (!isAvailable) {
        const stock = await inventoryService.getProductStock(item.id, sizeCode, versionId);
        throw new Error(`No hay suficiente stock para la talla seleccionada. Stock disponible: ${stock}`);
      }

      const index = this.findItemIndex(guestItems, item.id, sizeCode, versionId);

      if (index !== -1) {
        const newQuantity = guestItems[index].quantity + item.quantity;
        const available = await inventoryService.isProductAvailable(item.id, newQuantity, sizeCode, versionId);
        if (!available) {
          const stock = await inventoryService.getProductStock(item.id, sizeCode, versionId);
          throw new Error(`Cantidad supera stock disponible para la talla seleccionada. Stock actual: ${stock}`);
        }

        guestItems[index].quantity = newQuantity;
      } else {
        guestItems.push({
          ...item,
          sizeCode,
          sizeLabel: sizeCode ? jerseySizeLabel(sizeCode) : item.sizeLabel,
          versionId,
          dateAdded: new Date().toISOString()
        });
      }

      this.saveGuestCart(guestItems);

      return true;
    }


    

    /* ======================================
          🟢 MODO LOGUEADO (Firebase)
    ====================================== */
    try {
      const sizeCode = this.sanitizeSizeCode(item.sizeCode);
      const versionId = item.versionId || undefined;

      // 🛑 Validar stock del inventario
      const isAvailable = await inventoryService.isProductAvailable(
        item.id,
        item.quantity,
        sizeCode,
        versionId
      );

      if (!isAvailable) {
        const stock = await inventoryService.getProductStock(item.id, sizeCode, versionId);
        throw new Error(`No hay suficiente stock disponible para la talla seleccionada. Stock disponible: ${stock}`);
      }

      const cartRef = doc(db, this.COLLECTION_NAME, userId);
      const cartDoc = await getDoc(cartRef);

      let items: CartItem[] = [];
      if (cartDoc.exists()) {
        items = this.normalizeItems((cartDoc.data() as CartData).items || []);
      }

      const index = this.findItemIndex(items, item.id, sizeCode, versionId);

      if (index !== -1) {
        // sumar cantidad
        const newQuantity = items[index].quantity + item.quantity;

        const available = await inventoryService.isProductAvailable(item.id, newQuantity, sizeCode, versionId);
        if (!available) {
          const stock = await inventoryService.getProductStock(item.id, sizeCode, versionId);
          throw new Error(`Cantidad supera stock disponible para la talla seleccionada. Stock actual: ${stock}`);
        }

        items[index].quantity += item.quantity;

      } else {
        items.push({
          ...item,
          sizeCode,
          sizeLabel: sizeCode ? jerseySizeLabel(sizeCode) : item.sizeLabel,
          versionId,
          userId,
          dateAdded: new Date().toISOString()
        });
      }

      const totalItems = items.reduce((a, b) => a + b.quantity, 0);
      const totalPrice = items.reduce((a, b) => a + b.quantity * b.price, 0);

      const newCart: CartData = {
        userId,
        items: this.normalizeItems(items),
        totalItems,
        totalPrice,
        lastUpdated: new Date().toISOString()
      };

      await setDoc(cartRef, newCart);

      // 🔥 emitir actualización a los listeners del cartService
      this.emit(newCart.items);

      // 🔥 notificación global (carrito actualizado en otras páginas)
      window.dispatchEvent(new Event("cart-updated"));

      return true;

    } catch (error) {
      console.error("Error al agregar al carrito:", error);
      throw error;
    }
  }


  /* ================================================================
    🔹 CLEAR CART
================================================================*/
  async clearCart(userId?: string): Promise<boolean> {
    // Invitado
    if (!userId) {
      localStorage.removeItem(this.CART_GUEST_KEY);
      this.emit([]);
      window.dispatchEvent(new Event("cart-updated"));
      return true;
    }

    // Logueado
    try {
      const cartRef = doc(db, this.COLLECTION_NAME, userId);
      await setDoc(cartRef, {
        userId,
        items: [],
        totalItems: 0,
        totalPrice: 0,
        lastUpdated: new Date().toISOString()
      });
      this.emit([]);
      window.dispatchEvent(new Event("cart-updated"));
      return true;
    } catch (error) {
      console.error("Error al limpiar el carrito:", error);
      return false;
    }
  }



  

  /* ================================================================
      🔹 UPDATE QUANTITY
  =================================================================*/
  async updateCartItemQuantity(
    userId: string,
    itemId: number,
    qty: number,
    sizeCodeInput?: JerseySizeCode,
    versionId?: string
  ): Promise<boolean> {
    const sizeCode = this.sanitizeSizeCode(sizeCodeInput);

    /* Invitado */
    if (!userId) {
      const items = this.getGuestCart();
      const index = this.findItemIndex(items, itemId, sizeCode, versionId);

      if (index === -1) return false;

      if (qty <= 0) items.splice(index, 1);
      else items[index].quantity = qty;

      this.saveGuestCart(items);
      return true;
    }

    /* Logueado */
    try {
      const available = await inventoryService.isProductAvailable(itemId, qty, sizeCode, versionId);
      if (!available) {
        const stock = await inventoryService.getProductStock(itemId, sizeCode, versionId);
        throw new Error(`Stock insuficiente para la talla seleccionada. Disponible: ${stock}`);
      }

      const cartRef = doc(db, this.COLLECTION_NAME, userId);
      const cartDoc = await getDoc(cartRef);
      if (!cartDoc.exists()) return false;

      const cartData = cartDoc.data() as CartData;
      const items = this.normalizeItems(cartData.items);

      const index = this.findItemIndex(items, itemId, sizeCode, versionId);
      if (index === -1) return false;

      if (qty <= 0) items.splice(index, 1);
      else items[index].quantity = qty;

      const totalItems = items.reduce((a, b) => a + b.quantity, 0);
      const totalPrice = items.reduce((a, b) => a + b.quantity * b.price, 0);

      await setDoc(cartRef, {
        ...cartData,
        items: this.normalizeItems(items),
        totalItems,
        totalPrice,
        lastUpdated: new Date().toISOString()
      });

      this.emit(items);
      return true;

    } catch (error) {
      console.error("Error actualizando cantidad:", error);
      throw error;
    }
  }


  /* ================================================================
      🔹 REMOVE ITEM
  =================================================================*/
  async removeFromCart(
    userId: string,
    itemId: number,
    sizeCodeInput?: JerseySizeCode,
    versionId?: string
  ): Promise<boolean> {
    const sizeCode = this.sanitizeSizeCode(sizeCodeInput);

    /* Invitado */
    if (!userId) {
      const items = this.getGuestCart().filter(
        (i) => !(
          i.id === itemId &&
          (i.sizeCode || undefined) === (sizeCode || undefined) &&
          (i.versionId || undefined) === (versionId || undefined)
        )
      );
      this.saveGuestCart(items);
      return true;
    }

    /* Logueado */
    try {
      const cartRef = doc(db, this.COLLECTION_NAME, userId);
      const cartDoc = await getDoc(cartRef);
      if (!cartDoc.exists()) return false;

      const cartData = cartDoc.data() as CartData;
      const items = this.normalizeItems(cartData.items).filter(
        (i) => !(
          i.id === itemId &&
          (i.sizeCode || undefined) === (sizeCode || undefined) &&
          (i.versionId || undefined) === (versionId || undefined)
        )
      );

      const totalItems = items.reduce((a, b) => a + b.quantity, 0);
      const totalPrice = items.reduce((a, b) => a + b.quantity * b.price, 0);

      await setDoc(cartRef, {
        ...cartData,
        items: this.normalizeItems(items),
        totalItems,
        totalPrice,
        lastUpdated: new Date().toISOString()
      });

      this.emit(items);
      return true;

    } catch (error) {
      console.error("Error al remover item:", error);
      return false;
    }
  }

  /* ================================================================
      🔹 MIGRATE LOCAL → FIREBASE
  =================================================================*/
  async migrateFromLocalStorage(userId: string): Promise<boolean> {
    try {
      if (!userId) return false;

      const existing = await this.getUserCart(userId);
      if (existing.length > 0) return false;

      const guest = this.getGuestCart();
      if (guest.length === 0) return false;

      const merged = this.normalizeItems(
        guest.map(i => ({
          ...i,
          userId,
          dateAdded: new Date().toISOString()
        }))
      );

      const totalItems = merged.reduce((a, b) => a + b.quantity, 0);
      const totalPrice = merged.reduce((a, b) => a + b.quantity * b.price, 0);

      await setDoc(doc(db, this.COLLECTION_NAME, userId), {
        userId,
        items: merged,
        totalItems,
        totalPrice,
        lastUpdated: new Date().toISOString()
      });

      localStorage.removeItem(this.CART_GUEST_KEY);
      this.emit(merged);
      return true;

    } catch (error) {
      console.error("Error migrando carrito:", error);
      return false;
    }
  }
}

export const cartService = new CartService();
