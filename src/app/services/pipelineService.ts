'use client';

import { db } from '../utils/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { DailyOrdersDocument, DailyOrder } from './purchaseService';
import { AbandonedCart } from './abandonedCartService';

// ============================================================================
// INTERFACES PARA SALES PIPELINE
// ============================================================================

export interface PipelineStage {
  name: 'prospect' | 'lead' | 'customer';
  count: number;
  value: number; // valor total de compras para customers
  avgTimeInStage?: number; // en horas
  conversionRate?: number; // % que avanzó a la siguiente etapa
}

export interface SalesPipeline {
  prospects: PipelineStage;
  leads: PipelineStage;
  customers: PipelineStage;
  totalFunnel: number;
  conversionRate: number; // % de prospects que se convirtieron en customers
}

// ============================================================================
// SERVICIO DE PIPELINE
// ============================================================================

class PipelineService {
  /**
   * Calcula el pipeline de ventas completo
   * - Prospects: usuarios que visitaron pero no compraron (tienen carrito abandonado)
   * - Leads: usuarios que agregaron items al carrito
   * - Customers: usuarios que ya compraron
   */
  async getSalesPipeline(): Promise<SalesPipeline> {
    try {
      const customersData = await this.getCustomers();
      const leadsData = await this.getLeads();
      const prospectsData = await this.getProspects();

      const totalFunnel = prospectsData.count + leadsData.count + customersData.count;
      const conversionRate =
        prospectsData.count > 0
          ? Math.round((customersData.count / prospectsData.count) * 100)
          : 0;

      return {
        prospects: {
          name: 'prospect',
          count: prospectsData.count,
          value: prospectsData.value,
          conversionRate: prospectsData.count > 0 
            ? Math.round((leadsData.count / prospectsData.count) * 100) 
            : 0,
        },
        leads: {
          name: 'lead',
          count: leadsData.count,
          value: leadsData.value,
          conversionRate: leadsData.count > 0
            ? Math.round((customersData.count / leadsData.count) * 100)
            : 0,
        },
        customers: {
          name: 'customer',
          count: customersData.count,
          value: Math.round(customersData.value * 100) / 100,
        },
        totalFunnel,
        conversionRate,
      };
    } catch (error) {
      console.error('Error calculating sales pipeline:', error);
      return {
        prospects: { name: 'prospect', count: 0, value: 0 },
        leads: { name: 'lead', count: 0, value: 0 },
        customers: { name: 'customer', count: 0, value: 0 },
        totalFunnel: 0,
        conversionRate: 0,
      };
    }
  }

  /**
   * Obtiene clientes confirmados (que han comprado)
   */
  private async getCustomers(): Promise<{ count: number; value: number }> {
    try {
      const dailyOrdersRef = collection(db, 'dailyOrders');
      const snapshot = await getDocs(dailyOrdersRef);

      const customerSet = new Set<string>();
      let totalValue = 0;

      snapshot.docs.forEach((doc) => {
        const data = doc.data() as DailyOrdersDocument;
        data.orders?.forEach((order: DailyOrder) => {
          customerSet.add(order.userId);
          totalValue += order.total;
        });
      });

      return {
        count: customerSet.size,
        value: totalValue,
      };
    } catch (error) {
      console.error('Error getting customers:', error);
      return { count: 0, value: 0 };
    }
  }

  /**
   * Obtiene leads (personas que han abandonado carrito con items)
   * Estos son potenciales que llegaron lejos en el funnel
   */
  private async getLeads(): Promise<{ count: number; value: number }> {
    try {
      const abandonedCartsRef = collection(db, 'abandonedCarts');
      const snapshot = await getDocs(abandonedCartsRef);

      let totalValue = 0;
      const count = snapshot.size;

      snapshot.docs.forEach((doc) => {
        const data = doc.data() as AbandonedCart;
        totalValue += data.cartTotal;
      });

      return {
        count,
        value: totalValue,
      };
    } catch (error) {
      console.error('Error getting leads:', error);
      return { count: 0, value: 0 };
    }
  }

  /**
   * Obtiene prospects (visitantes general que vieron el sitio)
   * Para simplificar, consideramos prospects = leads + customers
   * (en un sistema más avanzado, rastrearías pageviews/sesiones)
   */
  private async getProspects(): Promise<{ count: number; value: number }> {
    try {
      const customers = await this.getCustomers();
      const leads = await this.getLeads();

      // Estimación: prospects son al menos 2-3x más que customers
      // En un sistema real, rastrearías sesiones/pageviews
      const estimatedProspects = Math.max(
        customers.count + leads.count,
        (customers.count + leads.count) * 3
      );

      return {
        count: estimatedProspects,
        value: 0, // Prospects no tienen valor monetario
      };
    } catch (error) {
      console.error('Error getting prospects:', error);
      return { count: 0, value: 0 };
    }
  }

  /**
   * Obtiene un breakdown detallado del pipeline
   */
  async getPipelineBreakdown() {
    const pipeline = await this.getSalesPipeline();
    
    return {
      stages: [
        {
          name: 'Prospects',
          count: pipeline.prospects.count,
          percentage: pipeline.totalFunnel > 0 
            ? Math.round((pipeline.prospects.count / pipeline.totalFunnel) * 100) 
            : 0,
          description: 'Visitantes del sitio',
          color: '#6c757d', // gray
        },
        {
          name: 'Leads',
          count: pipeline.leads.count,
          percentage: pipeline.totalFunnel > 0
            ? Math.round((pipeline.leads.count / pipeline.totalFunnel) * 100)
            : 0,
          description: 'Carritos abandonados con items',
          value: pipeline.leads.value,
          color: '#ffc107', // warning (yellow)
        },
        {
          name: 'Clientes',
          count: pipeline.customers.count,
          percentage: pipeline.totalFunnel > 0
            ? Math.round((pipeline.customers.count / pipeline.totalFunnel) * 100)
            : 0,
          description: 'Compras realizadas',
          value: pipeline.customers.value,
          color: '#28a745', // success (green)
        },
      ],
      conversionRate: pipeline.conversionRate,
      summary: {
        totalFunnel: pipeline.totalFunnel,
        prospectToLeadRate: pipeline.prospects.conversionRate || 0,
        leadToCustomerRate: pipeline.leads.conversionRate || 0,
      },
    };
  }
}

export const pipelineService = new PipelineService();
