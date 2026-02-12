/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { db } from '../utils/firebase';
import { collection, addDoc, Timestamp, query, where, orderBy, onSnapshot, updateDoc, doc } from 'firebase/firestore';

export type UserNotificationType = 'coupon' | 'orderStatus';

export interface UserNotification {
  id?: string;
  userId: string;
  userEmail?: string;
  type: UserNotificationType;
  title: string;
  message: string;
  data?: any;
  status: 'unread' | 'read';
  createdAt: string;
  createdAtTs: Timestamp;
}

export const userNotificationService = {
  async createCouponNotification(params: {
    userId: string;
    userEmail?: string;
    couponCode: string;
    discountPercent: number;
    source: 'manual' | 'auto';
  }): Promise<string> {
    const now = new Date();
    const colRef = collection(db, 'userNotifications');

    const docRef = await addDoc(colRef, {
      userId: params.userId,
      userEmail: params.userEmail || null,
      type: 'coupon',
      title: 'Tienes un cupón de descuento',
      message: `Recibiste un cupón de ${params.discountPercent}% de descuento. Código: ${params.couponCode}`,
      data: {
        couponCode: params.couponCode,
        discountPercent: params.discountPercent,
        source: params.source,
      },
      status: 'unread',
      createdAt: now.toISOString(),
      createdAtTs: Timestamp.fromDate(now),
    } as Omit<UserNotification, 'id'>);

    return docRef.id;
  },

  async createOrderStatusNotification(params: {
    userId: string;
    userEmail?: string;
    orderId: string;
    status: 'in_transit' | 'delivered';
  }): Promise<string> {
    const now = new Date();
    const colRef = collection(db, 'userNotifications');

    const isDelivered = params.status === 'delivered';
    const title = isDelivered
      ? 'Tu pedido ha sido entregado'
      : 'Tu pedido está en tránsito';
    const message = isDelivered
      ? `Tu pedido ${params.orderId} ya fue entregado. ¡Gracias por tu compra!`
      : `Tu pedido ${params.orderId} ya está en tránsito hacia tu dirección.`;

    const docRef = await addDoc(colRef, {
      userId: params.userId,
      userEmail: params.userEmail || null,
      type: 'orderStatus',
      title,
      message,
      data: {
        orderId: params.orderId,
        status: params.status,
      },
      status: 'unread',
      createdAt: now.toISOString(),
      createdAtTs: Timestamp.fromDate(now),
    } as Omit<UserNotification, 'id'>);

    return docRef.id;
  },

  subscribeToUserNotifications(
    userId: string,
    callback: (notifications: UserNotification[]) => void
  ): () => void {
    const colRef = collection(db, 'userNotifications');
    const q = query(
      colRef,
      where('userId', '==', userId),
      orderBy('createdAtTs', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: UserNotification[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...(docSnap.data() as Omit<UserNotification, 'id'>) });
      });
      callback(list);
    });

    return unsub;
  },

  async markAsRead(id: string): Promise<void> {
    const ref = doc(db, 'userNotifications', id);
    await updateDoc(ref, { status: 'read' });
  },
};
