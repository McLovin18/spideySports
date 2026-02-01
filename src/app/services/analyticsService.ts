'use client';

import { db } from '../utils/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { Purchase, DailyOrdersDocument, DailyOrder } from './purchaseService';

// ============================================================================
// INTERFACES PARA ANALYTICS
// ============================================================================

export interface WeeklyRevenue {
  week: string;
  startDate: string;
  endDate: string;
  revenue: number;
  orderCount: number;
}

export interface TopProduct {
  id: number;
  name: string;
  totalSold: number;
  totalRevenue: number;
  averagePrice: number;
}

export interface CustomerAnalytics {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  newCustomerPercentage: number;
  returningCustomerPercentage: number;
}

export interface InventoryAlert {
  productId: number;
  name: string;
  currentStock: number;
  threshold: number;
  status: 'low' | 'critical';
}

export interface ProductVelocity {
  productId: number;
  name: string;
  soldLast30Days: number;
  soldLast90Days: number;
  velocity: 'fast' | 'medium' | 'slow';
}

// ============================================================================
// SERVICIO DE ANALYTICS
// ============================================================================

export class AnalyticsService {
  /**
   * Obtiene ingresos por semana (últimas 12 semanas)
   */
  async getWeeklyRevenue(weeks: number = 12): Promise<WeeklyRevenue[]> {
    try {
      const today = new Date();
      const weeklyData: WeeklyRevenue[] = [];

      for (let i = weeks - 1; i >= 0; i--) {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() - i * 7);
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const startDateStr = weekStart.toISOString().split('T')[0];
        const endDateStr = weekEnd.toISOString().split('T')[0];

        // Traer todos los órdenes del día en esa semana
        const dailyOrdersRef = collection(db, 'dailyOrders');
        const q = query(
          dailyOrdersRef,
          where('date', '>=', startDateStr),
          where('date', '<=', endDateStr),
          orderBy('date', 'asc')
        );

        const snapshot = await getDocs(q);
        let weeklyRevenue = 0;
        let weeklyOrders = 0;

        snapshot.docs.forEach((doc) => {
          const data = doc.data() as DailyOrdersDocument;
          weeklyRevenue += data.totalDayAmount || 0;
          weeklyOrders += data.totalOrdersCount || 0;
        });

        weeklyData.push({
          week: `${startDateStr} - ${endDateStr}`,
          startDate: startDateStr,
          endDate: endDateStr,
          revenue: Math.round(weeklyRevenue * 100) / 100,
          orderCount: weeklyOrders,
        });
      }

      return weeklyData;
    } catch (error) {
      console.error('Error fetching weekly revenue:', error);
      return [];
    }
  }

  /**
   * Obtiene los top 10 productos más vendidos
   */
  async getTopProducts(limit: number = 10): Promise<TopProduct[]> {
    try {
      const dailyOrdersRef = collection(db, 'dailyOrders');
      const snapshot = await getDocs(dailyOrdersRef);

      const productMap = new Map<
        string,
        { name: string; totalSold: number; totalRevenue: number }
      >();

      snapshot.docs.forEach((doc) => {
        const data = doc.data() as DailyOrdersDocument;
        data.orders?.forEach((order: DailyOrder) => {
          order.items?.forEach((item) => {
            const productId = item.id;
            if (!productMap.has(productId)) {
              productMap.set(productId, {
                name: item.name,
                totalSold: 0,
                totalRevenue: 0,
              });
            }
            const current = productMap.get(productId)!;
            current.totalSold += item.quantity;
            current.totalRevenue += item.price * item.quantity;
          });
        });
      });

      // Convertir a array y ordenar
      const products = Array.from(productMap.entries())
        .map(([idStr, data]) => ({
          id: +idStr || 0,
          name: data.name,
          totalSold: data.totalSold,
          totalRevenue: Math.round(data.totalRevenue * 100) / 100,
          averagePrice: Math.round((data.totalRevenue / data.totalSold) * 100) / 100,
        }))
        .sort((a, b) => b.totalSold - a.totalSold)
        .slice(0, limit);

      return products;
    } catch (error) {
      console.error('Error fetching top products:', error);
      return [];
    }
  }

  /**
   * Análisis de clientes: nuevos vs recurrentes
   */
  async getCustomerAnalytics(): Promise<CustomerAnalytics> {
    try {
      const dailyOrdersRef = collection(db, 'dailyOrders');
      const snapshot = await getDocs(dailyOrdersRef);

      const customerMap = new Map<string, number>(); // userId -> purchase count

      snapshot.docs.forEach((doc) => {
        const data = doc.data() as DailyOrdersDocument;
        data.orders?.forEach((order: DailyOrder) => {
          const userId = order.userId;
          customerMap.set(userId, (customerMap.get(userId) || 0) + 1);
        });
      });

      const totalCustomers = customerMap.size;
      const newCustomers = Array.from(customerMap.values()).filter(
        (count) => count === 1
      ).length;
      const returningCustomers = totalCustomers - newCustomers;

      return {
        totalCustomers,
        newCustomers,
        returningCustomers,
        newCustomerPercentage:
          totalCustomers > 0 ? Math.round((newCustomers / totalCustomers) * 100) : 0,
        returningCustomerPercentage:
          totalCustomers > 0
            ? Math.round((returningCustomers / totalCustomers) * 100)
            : 0,
      };
    } catch (error) {
      console.error('Error fetching customer analytics:', error);
      return {
        totalCustomers: 0,
        newCustomers: 0,
        returningCustomers: 0,
        newCustomerPercentage: 0,
        returningCustomerPercentage: 0,
      };
    }
  }

  /**
   * Productos lentos vs rápidos (últimos 30 y 90 días)
   */
  async getProductVelocity(): Promise<ProductVelocity[]> {
    try {
      const today = new Date();
      
      // Rango 30 días
      const date30DaysAgo = new Date(today);
      date30DaysAgo.setDate(today.getDate() - 30);
      const date30Str = date30DaysAgo.toISOString().split('T')[0];

      // Rango 90 días
      const date90DaysAgo = new Date(today);
      date90DaysAgo.setDate(today.getDate() - 90);
      const date90Str = date90DaysAgo.toISOString().split('T')[0];

      const todayStr = today.toISOString().split('T')[0];

      // Obtener órdenes últimos 90 días
      const dailyOrdersRef = collection(db, 'dailyOrders');
      const q = query(
        dailyOrdersRef,
        where('date', '>=', date90Str),
        where('date', '<=', todayStr)
      );

      const snapshot = await getDocs(q);

      const productMap = new Map<
        string,
        { name: string; sold30: number; sold90: number }
      >();

      snapshot.docs.forEach((doc) => {
        const data = doc.data() as DailyOrdersDocument;
        const isWithin30Days = data.date >= date30Str;

        data.orders?.forEach((order: DailyOrder) => {
          order.items?.forEach((item) => {
            const productId = item.id;
            if (!productMap.has(productId)) {
              productMap.set(productId, {
                name: item.name,
                sold30: 0,
                sold90: 0,
              });
            }
            const current = productMap.get(productId)!;
            current.sold90 += item.quantity;
            if (isWithin30Days) {
              current.sold30 += item.quantity;
            }
          });
        });
      });

      // Convertir a array con velocidad
      const velocityProducts = Array.from(productMap.entries())
        .map(([idStr, data]) => {
          let velocity: 'fast' | 'medium' | 'slow' = 'slow';
          if (data.sold30 >= 10) {
            velocity = 'fast';
          } else if (data.sold30 >= 3) {
            velocity = 'medium';
          }

          return {
            productId: +idStr || 0,
            name: data.name,
            soldLast30Days: data.sold30,
            soldLast90Days: data.sold90,
            velocity,
          };
        })
        .sort((a, b) => b.soldLast30Days - a.soldLast30Days);

      return velocityProducts;
    } catch (error) {
      console.error('Error fetching product velocity:', error);
      return [];
    }
  }
}

export const analyticsService = new AnalyticsService();
