export type JerseySizeCode =
  | '2XS'
  | 'XS'
  | 'S'
  | 'M'
  | 'L'
  | 'XL'
  | '2XL'
  | '3XL'
  | '4XL';

export interface JerseySizeOption {
  code: JerseySizeCode;
  label: string;
  description: string;
}

export const JERSEY_SIZE_OPTIONS: JerseySizeOption[] = [
  {
    code: '2XS',
    label: '2XS (Infantil 4-6 años)',
    description: 'Ideal para los hinchas más pequeños: edad aproximada 4-6 años con ajuste cómodo.'
  },
  {
    code: 'XS',
    label: 'XS (Infantil 7-8 años)',
    description: 'Versión juvenil de corte atlético para acompañar entrenamientos y partidos escolares.'
  },
  {
    code: 'S',
    label: 'S (Adulto Pequeña)',
    description: 'Corte slim pensado para aficionados que prefieren un ajuste más ceñido.'
  },
  {
    code: 'M',
    label: 'M (Adulto Mediana)',
    description: 'Ajuste estándar de jugador con balance entre libertad de movimiento y fit deportivo.'
  },
  {
    code: 'L',
    label: 'L (Adulto Grande)',
    description: 'Ideal para cuerpo atlético o quienes buscan un fit más relajado sin perder estilo.'
  },
  {
    code: 'XL',
    label: 'XL (Adulto Extra Grande)',
    description: 'Versión ampliada que mantiene el corte profesional con mayor amplitud en pecho y hombros.'
  },
  {
    code: '2XL',
    label: '2XL (Adulto Doble Extra Grande)',
    description: 'Diseñada para aficionadas y aficionados que requieren un rango adicional de comodidad.'
  },
  {
    code: '3XL',
    label: '3XL (Adulto Triple Extra Grande)',
    description: 'Talla extendida manteniendo los detalles oficiales del club o selección.'
  },
  {
    code: '4XL',
    label: '4XL (Adulto Cuádruple Extra Grande)',
    description: 'Máxima amplitud disponible en catálogo con acabados premium y respirables.'
  }
];

export const DEFAULT_JERSEY_SIZE_STOCK: Record<JerseySizeCode, number> = JERSEY_SIZE_OPTIONS.reduce(
  (acc, size) => ({ ...acc, [size.code]: 0 }),
  {} as Record<JerseySizeCode, number>
);

export const jerseySizeLabel = (code: JerseySizeCode) => JERSEY_SIZE_OPTIONS.find((size) => size.code === code)?.label ?? code;

export const isValidJerseySizeCode = (code?: string | null): code is JerseySizeCode => {
  if (!code) return false;
  const normalized = code.trim().toUpperCase();
  return JERSEY_SIZE_OPTIONS.some((size) => size.code === normalized);
};
