'use client';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';

export type QuizDiscountReason =
  | 'champions'
  | 'world_cup'
  | 'conmebol'
  | 'legends'
  | 'futbol_femenil';

export interface QuizQuestion {
  question: string;
  answers: string[];
}

export interface QuizQuestionSet {
  key: QuizDiscountReason;
  label: string;
  description: string;
  questions: QuizQuestion[];
}

export interface QuizDiscountConfig {
  isActive: boolean;
  reason: QuizDiscountReason;
  reasonLabel: string;
  startDate: string;
  endDate?: string;
  discountPercent: number;
  penaltyFee: number;
  createdAt: string;
  updatedAt: string;
}

const COLLECTION = 'publicConfig';
const DOC_ID = 'quizDiscount';

export const QUIZ_QUESTION_SETS: QuizQuestionSet[] = [
  {
    key: 'champions',
    label: 'Noches de Champions',
    description: 'Preguntas sobre finales y records de la UEFA Champions League.',
    questions: [
      {
        question: 'Que club gano el triplete en la temporada 2008-09 con Pep Guardiola?',
        answers: ['barcelona', 'fc barcelona'],
      },
      {
        question: 'Que delantero marco el gol de la victoria del Bayern Munich en la final 2013?',
        answers: ['arjen robben', 'robben'],
      },
      {
        question: 'Que delantero marco doblete para el Real Madrid en la final de 2017?',
        answers: ['cristiano ronaldo', 'ronaldo'],
      },
      {
        question: 'Que entrenador gano la Champions 2004 con el Porto?',
        answers: ['jose mourinho', 'mourinho'],
      },
      {
        question: 'Que club ingles gano la Champions 2019 en Madrid?',
        answers: ['liverpool'],
      },
      {
        question: 'Que jugador marco el penal definitivo para el Chelsea en la final 2012?',
        answers: ['drogba', 'didier drogba'],
      },
    ],
  },
  {
    key: 'world_cup',
    label: 'Camino al Mundial',
    description: 'Momentos iconicos de la Copa del Mundo.',
    questions: [
      {
        question: 'Que pais gano la Copa del Mundo 2010 con gol de Andres Iniesta?',
        answers: ['espana', 'spain'],
      },
      {
        question: 'Que jugador gano el Balon de Oro del Mundial 2014?',
        answers: ['lionel messi', 'messi'],
      },
      {
        question: 'Que seleccion levanto la Copa del Mundo en 1998 como anfitriona?',
        answers: ['francia', 'france'],
      },
      {
        question: 'Que defensor levanto la Copa del Mundo como capitan de Italia en 2006?',
        answers: ['fabio cannavaro', 'cannavaro'],
      },
      {
        question: 'Quien anoto el penal decisivo de Argentina en la final de 2022?',
        answers: ['gonzalo montiel', 'montiel'],
      },
      {
        question: 'Que seleccion sudamericana gano su primer mundial en 1930?',
        answers: ['uruguay'],
      },
    ],
  },
  {
    key: 'conmebol',
    label: 'Ritmo Conmebol',
    description: 'Historias de Libertadores, Sudamericana y eliminatorias.',
    questions: [
      {
        question: 'Que club gano la Libertadores 2018 en el Bernabeu?',
        answers: ['river plate', 'river'],
      },
      {
        question: 'Que seleccion gano la Copa America 2021 en el Maracana?',
        answers: ['argentina'],
      },
      {
        question: 'Que club brasileno levanto la Libertadores 2022?',
        answers: ['flamengo'],
      },
      {
        question: 'Que jugador peruano marco el gol clave para clasificar al Mundial 2018 en repechaje?',
        answers: ['jefferson farfan', 'farfan'],
      },
      {
        question: 'Que seleccion levanto la Copa America 2015 en Santiago?',
        answers: ['chile'],
      },
      {
        question: 'Que club paraguayo gano la Libertadores 2002?',
        answers: ['olimpia'],
      },
    ],
  },
  {
    key: 'legends',
    label: 'Leyendas del Futbol',
    description: 'Preguntas sobre figuras historicas del futbol mundial.',
    questions: [
      {
        question: 'Que dorsal usaba Diego Maradona como simbolo?',
        answers: ['10'],
      },
      {
        question: 'Con que club europeo debuto Lionel Messi en Champions?',
        answers: ['barcelona', 'fc barcelona'],
      },
      {
        question: 'Que delantero ingles es conocido como Captain Fantastic del Liverpool?',
        answers: ['steven gerrard', 'gerrard'],
      },
      {
        question: 'Quien fue el maximo goleador del Mundial 2002?',
        answers: ['ronaldo', 'ronaldo nazario'],
      },
      {
        question: 'Con que club gano Thierry Henry la Champions 2009?',
        answers: ['barcelona', 'fc barcelona'],
      },
      {
        question: 'Que leyenda mexicana es llamada El Matador?',
        answers: ['luis hernandez', 'hernandez'],
      },
    ],
  },
  {
    key: 'futbol_femenil',
    label: 'Futbol Femenil',
    description: 'Protagonistas y hitos del futbol femenil internacional.',
    questions: [
      {
        question: 'Que seleccion gano el Mundial Femenil 2019?',
        answers: ['estados unidos', 'usa', 'united states'],
      },
      {
        question: 'Que delantera mexicana es conocida como Licha?',
        answers: ['alicia cervantes', 'cervantes', 'licha cervantes'],
      },
      {
        question: 'Que club gano la Champions Femenil 2021 con Alexia Putellas?',
        answers: ['barcelona', 'fc barcelona'],
      },
      {
        question: 'Que jugadora espanola gano el Balon de Oro 2021?',
        answers: ['alexia putellas', 'putellas'],
      },
      {
        question: 'Que seleccion sudamericana gano la Copa America Femenina 2022?',
        answers: ['brasil', 'brazil'],
      },
      {
        question: 'Que delantera canadiense es la maxima goleadora internacional de la historia?',
        answers: ['christine sinclair', 'sinclair'],
      },
    ],
  },
];

export const QUIZ_DISCOUNT_REASONS = QUIZ_QUESTION_SETS.map((set) => ({
  value: set.key,
  label: set.label,
  description: set.description,
}));

export const getQuizQuestionSet = (reason: QuizDiscountReason): QuizQuestionSet => {
  const fallback = QUIZ_QUESTION_SETS[0];
  return QUIZ_QUESTION_SETS.find((set) => set.key === reason) || fallback;
};

export const getQuizDiscountConfig = async (): Promise<QuizDiscountConfig | null> => {
  try {
    const ref = doc(db, COLLECTION, DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as QuizDiscountConfig;
  } catch (error) {
    console.error('Error obteniendo configuracion del quiz de descuento:', error);
    return null;
  }
};

export const saveQuizDiscountConfig = async (
  config: Omit<QuizDiscountConfig, 'createdAt' | 'updatedAt'> & {
    createdAt?: string;
    updatedAt?: string;
  }
): Promise<void> => {
  const nowIso = new Date().toISOString();
  const payload: QuizDiscountConfig = {
    ...config,
    discountPercent: Math.min(90, Math.max(1, config.discountPercent)),
    penaltyFee: Math.max(0, config.penaltyFee),
    createdAt: config.createdAt || nowIso,
    updatedAt: nowIso,
  };

  const ref = doc(db, COLLECTION, DOC_ID);
  await setDoc(ref, payload, { merge: true });
};

export const isQuizConfigActiveNow = (
  config: QuizDiscountConfig | null,
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