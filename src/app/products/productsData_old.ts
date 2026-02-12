// src/app/products/productsData.ts

const allProducts = [
  {
    id: 1,
    name: 'Base de Maquillaje Líquida HD',
    price: 24.99,
    images: ['https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=400&fit=crop&q=80', 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=400&h=400&fit=crop&q=80'],
    category: 'Base de Maquillaje',
    categoryLink: '/maquillaje',
    description: 'Base de maquillaje líquida de alta definición con cobertura completa y acabado natural.',
    inStock: true,
    details: [
      'Cobertura completa de larga duración',
      'Fórmula libre de aceites',
      'SPF 30 incluido',
      'Disponible en 12 tonos',
      'Resistente al agua'
    ],
    featured: true
  },
  {
    id: 2,
    name: 'Paleta de Sombras Profesional',
    price: 32.00,
    images: ['https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=400&h=400&fit=crop&q=80', 'https://images.unsplash.com/photo-1567721913486-6585f069b332?w=400&h=400&fit=crop&q=80'],
    category: 'Sombras de Ojos',
    categoryLink: '/maquillaje',
    description: 'Paleta profesional con 24 sombras de ojos en tonos nude y smokey.',
    inStock: true,
    details: [
      '24 tonos altamente pigmentados',
      'Fórmula cremosa y sedosa',
      'Incluye espejo y aplicadores',
      'Larga duración sin difuminarse',
      'Apta para uso profesional'
    ],
    featured: true
  },
  {
    id: 3,
    name: 'Labial Mate de Larga Duración',
    price: 18.99,
    images: ['https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400&h=400&fit=crop&q=80', 'https://images.unsplash.com/photo-1596755389378-c31d5c6d44cb?w=400&h=400&fit=crop&q=80'],
    category: 'Labiales',
    categoryLink: '/maquillaje',
    description: 'Labial mate con fórmula de larga duración que no se transfiere.',
    inStock: true,
    details: [
      'Acabado mate intenso',
      'Hasta 12 horas de duración',
      'No se transfiere ni se corre',
      'Fórmula hidratante con vitamina E',
      'Disponible en 15 tonos'
    ],
    featured: true
  },
  {
    id: 4,
    name: 'Sérum Anti-Edad Vitamina C',
    price: 45.00,
    images: ['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&h=400&fit=crop&q=80'],
    category: 'Cuidado Facial',
    categoryLink: '/cuidado-piel',
    description: 'Sérum facial con vitamina C pura para iluminar y rejuvenecer la piel.',
    inStock: true,
    details: [
      '20% de vitamina C estabilizada',
      'Reduce arrugas y líneas de expresión',
      'Unifica el tono de la piel',
      'Antioxidante natural',
      'Apto para todo tipo de piel',
      'Resultados visibles en 4 semanas'
    ],
    featured: true
  },
  {
    id: 5,
    name: 'Crema Hidratante Facial Premium',
    price: 38.00,
    images: ['https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&h=400&fit=crop&q=80', 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop&q=80'],
    category: 'Hidratantes',
    categoryLink: '/cuidado-piel',
    description: 'Crema hidratante facial con ácido hialurónico y colágeno para piel radiante.',
    inStock: true,
    details: [
      'Ácido hialurónico de triple peso molecular',
      'Péptidos de colágeno',
      'Hidratación profunda 24 horas',
      'Textura ligera de rápida absorción',
      'Sin parabenos ni sulfatos'
    ],
    featured: true
  },
  {
    id: 6,
    name: 'Perfume Floral Elegance',
    price: 65.99,
    images: ['https://images.unsplash.com/photo-1541643600914-78b084683601?w=400&h=400&fit=crop&q=80'],
    category: 'Fragancias',
    categoryLink: '/fragancias',
    description: 'Perfume femenino con notas florales de jazmín, rosa y peonía.',
    inStock: true,
    details: [
      'Notas de salida: Bergamota y limón',
      'Notas de corazón: Jazmín, rosa y peonía',
      'Notas de fondo: Almizcle y madera de cedro',
      'Duración: 8-10 horas',
      'Frasco de 50ml'
    ]
  },
  {
    id: 7,
    name: 'Máscara de Pestañas Volumen Extremo',
    price: 22.99,
    images: ['https://images.unsplash.com/photo-1522338140262-f46f5913618a?w=400&h=400&fit=crop&q=80'],
    category: 'Máscaras de Pestañas',
    categoryLink: '/maquillaje',
    description: 'Máscara de pestañas que proporciona volumen extremo y alargamiento.',
    inStock: true,
    details: [
      'Fórmula resistente al agua',
      'Cepillo de fibras especiales',
      'No se corre ni se desmorona',
      'Volumen y longitud instantáneos',
      'Fácil de remover'
    ]
  },
  {
    id: 8,
    name: 'Exfoliante Facial Enzimático',
    price: 28.99,
    images: ['https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=400&h=400&fit=crop&q=80'],
    category: 'Limpieza Facial',
    categoryLink: '/cuidado-piel',
    description: 'Exfoliante facial suave con enzimas naturales para renovar la piel.',
    inStock: true,
    details: [
      'Enzimas de papaya y piña',
      'Microesferas biodegradables',
      'Renovación celular suave',
      'Elimina células muertas',
      'Apto para piel sensible'
    ]
  },
  {
    id: 9,
    name: 'Paleta de Contorno y Rubor',
    price: 35.99,
    images: ['https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&h=400&fit=crop&q=80'],
    category: 'Contorno',
    categoryLink: '/maquillaje',
    description: 'Paleta completa con tonos de contorno, iluminador y rubor.',
    inStock: true,
    details: [
      '6 tonos de contorno',
      '3 tonos de iluminador',
      '3 tonos de rubor',
      'Fórmula cremosa y difuminable',
      'Incluye brochas profesionales'
    ]
  },
  {
    id: 10,
    name: 'Aceite Corporal Nutritivo',
    price: 31.99,
    images: ['https://images.unsplash.com/photo-1612817288484-6f916006741a?w=400&h=400&fit=crop&q=80'],
    category: 'Cuidado Corporal',
    categoryLink: '/cuidado-piel',
    description: 'Aceite corporal con mezcla de aceites naturales para nutrición profunda.',
    inStock: true,
    details: [
      'Aceite de argán y jojoba',
      'Vitamina E y omega 3',
      'Absorción rápida sin grasa',
      'Aroma relajante de lavanda',
      'Botella de 100ml'
    ]
  },
  {
    id: 11,
    name: 'Brochas de Maquillaje Premium',
    price: 45.99,
    images: ['https://images.unsplash.com/photo-1583241800698-9cb5be6c7cfc?w=400&h=400&fit=crop&q=80'],
    category: 'Brochas',
    categoryLink: '/accesorios',
    description: 'Set de brochas profesionales para maquillaje con fibras sintéticas suaves.',
    inStock: true,
    details: [
      '12 brochas profesionales',
      'Fibras sintéticas de alta calidad',
      'Mango ergonómico de madera',
      'Incluye estuche de viaje',
      'Libres de crueldad animal'
    ]
  },
  {
    id: 12,
    name: 'Crema Hidratante Nocturna',
    price: 39.99,
    images: ['https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=400&h=400&fit=crop&q=80'],
    category: 'Cremas Hidratantes',
    categoryLink: '/cuidado-piel',
    description: 'Crema nutritiva nocturna con retinol y ácido hialurónico.',
    inStock: true,
    details: [
      'Retinol encapsulado',
      'Ácido hialurónico de bajo peso',
      'Regeneración nocturna',
      'Reduce líneas de expresión',
      'Textura rica y sedosa'
    ]
  },
  {
    id: 13,
    name: 'Lápiz Delineador Waterproof',
    price: 16.99,
    images: ['https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400&h=400&fit=crop&q=80'],
    category: 'Delineadores',
    categoryLink: '/maquillaje',
    description: 'Lápiz delineador de ojos resistente al agua con aplicación suave.',
    inStock: true,
    details: [
      'Fórmula waterproof',
      'Trazo intenso y preciso',
      'Duración de 12 horas',
      'No se corre ni mancha',
      'Fácil aplicación'
    ]
  },
  {
    id: 14,
    name: 'Perfume Masculino Woody',
    price: 72.99,
    images: ['https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=400&h=400&fit=crop&q=80'],
    category: 'Fragancias',
    categoryLink: '/fragancias',
    description: 'Perfume masculino con notas amaderadas y especiadas.',
    inStock: true,
    details: [
      'Notas de salida: Pimienta negra y bergamota',
      'Notas de corazón: Sándalo y vetiver',
      'Notas de fondo: Ámbar y vainilla',
      'Duración: 10-12 horas',
      'Frasco de 100ml'
    ]
  },
  {
    id: 15,
    name: 'Tónico Facial Purificante',
    price: 24.99,
    images: ['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&h=400&fit=crop&q=80'],
    category: 'Tónicos',
    categoryLink: '/cuidado-piel',
    description: 'Tónico facial con ácido salicílico para pieles mixtas y grasas.',
    inStock: true,
    details: [
      'Ácido salicílico 2%',
      'Extracto de hamamelis',
      'Minimiza poros',
      'Controla el exceso de grasa',
      'Botella de 200ml'
    ]
  },
  {
    id: 16,
    name: 'Protector Solar Facial SPF 50',
    price: 25.99,
    images: ['https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=400&h=400&fit=crop&q=80'],
    category: 'Protección Solar',
    categoryLink: '/cuidado-piel',
    description: 'Protector solar facial de amplio espectro con textura ligera.',
    inStock: true,
    details: [
      'SPF 50+ protección UVA/UVB',
      'Textura ligera no grasa',
      'Base perfecta para maquillaje',
      'Resistente al agua',
      'Antioxidantes naturales'
    ]
  },
  {
    id: 17,
    name: 'Esmalte de Uñas Gel',
    price: 14.99,
    images: ['https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=400&fit=crop&q=80'],
    category: 'Cuidado de Uñas',
    categoryLink: '/accesorios',
    description: 'Esmalte de uñas con efecto gel de larga duración.',
    inStock: true,
    details: [
      'Efecto gel sin lámpara UV',
      'Duración hasta 10 días',
      'Brillo intenso',
      'Secado rápido',
      'Disponible en 20 colores'
    ]
  },
  {
    id: 18,
    name: 'Mascarilla Facial Hidratante',
    price: 23.99,
    images: ['https://images.unsplash.com/photo-1570554886111-e80fcac6c37b?w=400&h=400&fit=crop&q=80'],
    category: 'Mascarillas Faciales',
    categoryLink: '/cuidado-piel',
    description: 'Mascarilla hidratante con ácido hialurónico y aloe vera.',
    inStock: true,
    details: [
      'Ácido hialurónico concentrado',
      'Aloe vera calmante',
      'Hidratación profunda',
      'Para todo tipo de piel',
      'Uso 2-3 veces por semana'
    ]
  },
  {
    id: 19,
    name: 'Agua Micelar Desmaquillante',
    price: 18.99,
    images: ['https://images.unsplash.com/photo-1556228994-f6d5ac421b72?w=400&h=400&fit=crop&q=80'],
    category: 'Limpieza Facial',
    categoryLink: '/cuidado-piel',
    description: 'Agua micelar suave que remueve el maquillaje sin frotar.',
    inStock: true,
    details: [
      'Tecnología micelar avanzada',
      'Remueve maquillaje waterproof',
      'No requiere enjuague',
      'Para ojos y rostro',
      'Botella de 400ml'
    ]
  },
  {
    id: 20,
    name: 'Perfume Femenino Frutal',
    price: 58.99,
    images: ['https://images.unsplash.com/photo-1594035910387-fea47794261f?w=400&h=400&fit=crop&q=80'],
    category: 'Fragancias',
    categoryLink: '/fragancias',
    description: 'Perfume femenino con notas frutales frescas y juveniles.',
    inStock: true,
    details: [
      'Notas de salida: Manzana verde y cítricos',
      'Notas de corazón: Pera y flor de cerezo',
      'Notas de fondo: Almizcle blanco',
      'Duración: 6-8 horas',
      'Frasco de 75ml'
    ]
  },
  {
    id: 18,
    name: 'Mascarilla de Arcilla Purificante',
    price: 22.99,
    images: ['https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=400&h=400&fit=crop&q=80'],
    category: 'Cuidado de Piel',
    categoryLink: '/skin-care',
    description: 'Mascarilla de arcilla de aluvión que purifica profundamente.',
    inStock: true,
    details: [
      'Arcilla bentonita y carbón activado',
      'Elimina impurezas y toxinas',
      'Minimiza poros',
      'Para piel grasa y mixta',
      'Uso 2-3 veces por semana'
    ]
  },
  {
    id: 18,
    name: 'Iluminador Líquido Multiuso',
    price: 27.99,
    images: ['/cosmeticos/iluminador-liquido.jpg'],
    category: 'Iluminadores',
    categoryLink: '/maquillaje',
    description: 'Iluminador líquido para rostro y cuerpo con acabado natural.',
    inStock: true,
    details: [
      'Finish natural radiante',
      'Uso en rostro y cuerpo',
      'Mezcla fácil con base',
      'Disponible en 3 tonos',
      'Fórmula buildable'
    ]
  },
  {
    id: 19,
    name: 'Agua Micelar Desmaquillante',
    price: 21.99,
    images: ['/cosmeticos/agua-micelar.jpg'],
    category: 'Desmaquillantes',
    categoryLink: '/cuidado-piel',
    description: 'Agua micelar suave que elimina maquillaje y purifica la piel.',
    inStock: true,
    details: [
      'Micelas purificantes',
      'Sin enjuague necesario',
      'Apta para ojos sensibles',
      'No deja residuos grasos',
      'Botella de 400ml'
    ]
  },
  {
    id: 20,
    name: 'Cologne Masculino Fresh',
    price: 55.99,
    images: ['/cosmeticos/cologne-masculino.jpg'],
    category: 'Fragancias Masculinas',
    categoryLink: '/fragancias',
    description: 'Cologne masculino con notas frescas y amaderadas.',
    inStock: true,
    details: [
      'Notas de salida: Limón y menta',
      'Notas de corazón: Lavanda y geranio',
      'Notas de fondo: Cedro y vetiver',
      'Duración: 6-8 horas',
      'Frasco de 100ml'
    ]
  },
  {
    id: 21,
    name: 'Primer Facial Perfeccionador',
    price: 29.99,
    images: ['/cosmeticos/primer-facial.jpg'],
    category: 'Primers',
    categoryLink: '/maquillaje',
    description: 'Primer facial que minimiza poros y prepara la piel para el maquillaje.',
    inStock: true,
    details: [
      'Minimiza poros y imperfecciones',
      'Base perfecta para maquillaje',
      'Control de grasa 12 horas',
      'Textura sedosa',
      'Apto para todo tipo de piel'
    ]
  },
  {
    id: 22,
    name: 'Corrector Líquido Alta Cobertura',
    price: 18.99,
    images: ['/cosmeticos/corrector-liquido.jpg'],
    category: 'Correctores',
    categoryLink: '/maquillaje',
    description: 'Corrector líquido de alta cobertura para ojeras e imperfecciones.',
    inStock: true,
    details: [
      'Cobertura completa',
      'Fórmula cremosa',
      'No se cuartea ni reseca',
      'Disponible en 8 tonos',
      'Aplicador de precisión'
    ]
  },
  {
    id: 23,
    name: 'Sérum Facial Retinol Nocturno',
    price: 52.99,
    images: ['/cosmeticos/serum-retinol.jpg'],
    category: 'Tratamientos Anti-Edad',
    categoryLink: '/cuidado-piel',
    description: 'Sérum nocturno con retinol encapsulado para renovación celular.',
    inStock: true,
    details: [
      'Retinol encapsulado 0.5%',
      'Renovación celular nocturna',
      'Reduce arrugas profundas',
      'Mejora textura de la piel',
      'Solo uso nocturno'
    ]
  },
  {
    id: 24,
    name: 'Bálsamo Labial Nutritivo',
    price: 12.99,
    images: ['/cosmeticos/balsamo-labial.jpg'],
    category: 'Cuidado Labial',
    categoryLink: '/cuidado-piel',
    description: 'Bálsamo labial con manteca de karité y vitamina E.',
    inStock: true,
    details: [
      'Manteca de karité pura',
      'Vitamina E antioxidante',
      'Hidratación profunda',
      'Protección contra el frío',
      'Sin parabenos'
    ]
  },
  {
    id: 25,
    name: 'Polvo Compacto Matificante',
    price: 24.99,
    images: ['/cosmeticos/polvo-compacto.jpg'],
    category: 'Polvos',
    categoryLink: '/maquillaje',
    description: 'Polvo compacto matificante para sellar el maquillaje.',
    inStock: true,
    details: [
      'Control de brillo 8 horas',
      'Cobertura natural',
      'Incluye espejo y esponja',
      'Fórmula libre de talco',
      'Disponible en 6 tonos'
    ]
  },
  {
    id: 26,
    name: 'Set de Pestañas Postizas',
    price: 15.99,
    images: ['/cosmeticos/pestanas-postizas.jpg'],
    category: 'Pestañas',
    categoryLink: '/accesorios',
    description: 'Set de pestañas postizas reutilizables con pegamento incluido.',
    inStock: true,
    details: [
      '5 pares de pestañas diferentes',
      'Fibras sintéticas suaves',
      'Pegamento hipoalergénico',
      'Reutilizables hasta 10 veces',
      'Fácil aplicación'
    ]
  },
  {
    id: 27,
    name: 'Tónico Facial Equilibrante',
    price: 26.99,
    images: ['/cosmeticos/tonico-facial.jpg'],
    category: 'Tónicos y Brumas',
    categoryLink: '/cuidado-piel',
    description: 'Tónico facial con niacinamida para equilibrar el pH de la piel.',
    inStock: true,
    details: [
      'Niacinamida al 5%',
      'Equilibra el pH natural',
      'Minimiza poros',
      'Sin alcohol ni parabenos',
      'Apto para piel sensible'
    ]
  },
  {
    id: 28,
    name: 'Crema de Manos Reparadora',
    price: 13.99,
    images: ['/cosmeticos/crema-manos.jpg'],
    category: 'Cuidado de Manos',
    categoryLink: '/cuidado-piel',
    description: 'Crema de manos intensiva con keratina y urea.',
    inStock: true,
    details: [
      'Keratina reparadora',
      'Urea hidratante 10%',
      'Absorción rápida',
      'Protección 24 horas',
      'Tubo de 75ml'
    ]
  },
  {
    id: 29,
    name: 'Gel Limpiador Facial Suave',
    price: 22.99,
    images: ['/cosmeticos/gel-limpiador.jpg'],
    category: 'Limpieza Facial',
    categoryLink: '/cuidado-piel',
    description: 'Gel limpiador facial suave para uso diario.',
    inStock: true,
    details: [
      'pH balanceado',
      'Sin sulfatos agresivos',
      'Extracto de aloe vera',
      'Para todo tipo de piel',
      'Botella de 200ml'
    ]
  },
  {
    id: 30,
    name: 'Perfume Unisex Citrus',
    price: 48.99,
    images: ['/cosmeticos/perfume-unisex.jpg'],
    category: 'Fragancias Unisex',
    categoryLink: '/fragancias',
    description: 'Fragancia unisex con notas cítricas frescas.',
    inStock: true,
    details: [
      'Notas de bergamota y pomelo',
      'Corazón de jengibre',
      'Base de cedro blanco',
      'Duración: 6-8 horas',
      'Frasco de 75ml'
    ]
  }
];

export default allProducts; 