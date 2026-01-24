'use client';

import { db } from '../utils/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export type SeasonalDiscountReason =
  | 'semifinales_champions'
  | 'mundial_2026'
  | 'evento_retro_spidey'
  | 'otros';

export interface SeasonalDiscountProduct {
  productId: number;
  discountPercent: number; // 0-100
}

export interface SeasonalDiscountConfig {
  isActive: boolean;
  reason: SeasonalDiscountReason;
  reasonLabel: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD (opcional)
  createdAt: string;
  updatedAt: string;
  products: SeasonalDiscountProduct[];
}

const COLLECTION = 'publicConfig';
const DOC_ID = 'seasonalDiscounts';

export const getSeasonalDiscountConfig = async (): Promise<SeasonalDiscountConfig | null> => {
  try {
    const ref = doc(db, COLLECTION, DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as SeasonalDiscountConfig;
    return data;
  } catch (error) {
    console.error('Error obteniendo configuración de descuentos de temporada:', error);
    return null;
  }
};

export const saveSeasonalDiscountConfig = async (
  config: Omit<SeasonalDiscountConfig, 'createdAt' | 'updatedAt'> & {
    createdAt?: string;
    updatedAt?: string;
  }
): Promise<void> => {
  const nowIso = new Date().toISOString();
  const payload: SeasonalDiscountConfig = {
    ...config,
    createdAt: config.createdAt || nowIso,
    updatedAt: nowIso,
  };

  const ref = doc(db, COLLECTION, DOC_ID);
  await setDoc(ref, payload, { merge: true });
};

export const SEASONAL_DISCOUNT_REASONS: { value: SeasonalDiscountReason; label: string }[] = [
  { value: 'semifinales_champions', label: 'Semifinales de la Champions' },
  { value: 'mundial_2026', label: 'Camino al Mundial 2026' },
  { value: 'evento_retro_spidey', label: 'Kick-off Retro Spidey' },
  { value: 'otros', label: 'Campaña personalizada / otros' },
];

// Utilidad: verifica si una configuración de descuentos está activa en la fecha indicada (o hoy)
export const isSeasonalConfigActiveNow = (
  config: SeasonalDiscountConfig | null,
  todayStr?: string
): boolean => {
  if (!config) return false;

  const today = todayStr || new Date().toISOString().split('T')[0];

  return (
    config.isActive &&
    (!config.startDate || config.startDate <= today) &&
    (!config.endDate || config.endDate >= today)
  );
};

// Utilidad: obtiene el porcentaje de descuento para un producto si la campaña está activa
export const getProductSeasonalDiscountPercent = (
  config: SeasonalDiscountConfig | null,
  productId: number,
  todayStr?: string
): number | null => {
  if (!isSeasonalConfigActiveNow(config, todayStr)) return null;
  if (!config?.products || config.products.length === 0) return null;

  const match = config.products.find((p) => p.productId === productId && p.discountPercent > 0);
  return match ? match.discountPercent : null;
};
