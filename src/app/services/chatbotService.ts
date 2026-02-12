import { inventoryService } from './inventoryService';

// ==================== INTERFACES ====================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  message: string;
  products: any[]; // Productos encontrados
  conversationHistory: ChatMessage[];
  type: 'search' | 'info' | 'greeting' | 'help' | 'number' | 'confirmation';
  confidence: number; // 0-100, qué tan seguro está el bot
  metadata?: {
    resultCount?: number; // Número de resultados encontrados
    isNumericAnswer?: boolean; // Si es una respuesta numérica
    numericValue?: number; // El valor numérico si aplica
    infoType?: string; // Tipo de información (precio, stock, etc.)
  };
}

// ==================== NLP ENGINE ====================

class NLPEngine {
  /**
   * Diccionario de sinónimos para mejorar búsqueda
   */
  private readonly SYNONYMS = {
    // Tipos de prendas
    camiseta: ['jersey', 'polo', 'playera', 'shirt', 'camisetas', 'jerseys', 'remera', 'musculosa'],
    deportiva: ['deporte', 'training', 'entrenar', 'gym', 'fitness', 'ejercicio'],
    futbol: ['football', 'soccer', 'fútbol', 'futbolero', 'futbolista'],
    
    // Tallas
    pequeno: ['xs', 'xsmall', 'chiquita', 'extra small', 's', 'small', 'pequeña'],
    mediano: ['m', 'medium', 'mediada', 'regular'],
    grande: ['l', 'large', 'xl', 'xxl', 'xxxl', 'enorme', 'talla grande'],
    
    // Colores
    rojo: ['roja', 'rojizo', 'bermeja', 'colorado', 'escarlata', 'carmesí', 'red'],
    azul: ['azules', 'celeste', 'marino', 'turquesa', 'cyan', 'blue'],
    blanco: ['blanca', 'nieve', 'ivory', 'white', 'crema'],
    negro: ['negra', 'oscuro', 'black', 'ebano'],
    verde: ['verdes', 'esmeralda', 'pasto', 'jade', 'green', 'lima'],
    amarillo: ['amarilla', 'oro', 'dorado', 'golden', 'yellow'],
    naranja: ['anaranjado', 'orange'],
    
    // Características
    oficial: ['autentica', 'original', 'ligitima', 'licencia', 'licensed', 'authenticity'],
    retro: ['clasico', 'vintage', 'leyenda', 'historico', 'clásica'],
    especial: ['edicion', 'especiales', 'limitada', 'exclusiva', 'limited', 'exclusive'],
    
    // Materiales
    poliester: ['polyester', 'poly', 'tecnico', 'technical'],
    algodon: ['cotton', 'algodón'],
    spandex: ['lycra', 'elastico', 'stretch', 'elastano'],
    transpirable: ['transpiración', 'secado rapido', 'moisture-wicking', 'breathable', 'dry-fit'],
    
    // Acciones/Intenciones
    buscar: ['encontrar', 'search', 'seeking', 'show me', 'enseña', 'muestra', 'quiero'],
    consultar: ['consulta', 'pregunta', 'info', 'information'],
    comprar: ['compra', 'purchase', 'buy', 'quiero comprar'],
    precio: ['costo', 'valor', 'cuánto', 'how much', 'cost'],
  };

  /**
   * Palabras comunes sin importancia (stopwords)
   */
  private readonly STOPWORDS = new Set([
    'el', 'la', 'de', 'que', 'y', 'a', 'en', 'o', 'es', 'los', 'las', 'un', 'una',
    'por', 'con', 'son', 'del', 'al', 'se', 'ha', 'he', 'han', 'soy', 'somos',
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are'
  ]);

  /**
   * Lista de clubes conocidos para reconocimiento rápido
   */
  private readonly KNOWN_CLUBS = [
    // Premier League
    'manchester united', 'man united', 'man u', 'manchester', 'manchester city', 'man city',
    'liverpool', 'arsenal', 'chelsea', 'tottenham', 'everton', 'aston villa',
    'newcastle', 'brighton', 'fulham', 'crystal palace',
    
    // La Liga
    'real madrid', 'real', 'madrid', 'barcelona', 'barça', 'atletico madrid', 'atleti',
    'sevilla', 'valencia', 'villarreal', 'betis', 'real sociedad', 'girona',
    
    // Serie A
    'milan', 'ac milan', 'inter', 'inter milan', 'juventus', 'juve', 'roma', 'napoli',
    'lazio', 'torino', 'fiorentina', 'atalanta', 'sampdoria', 'genoa',
    
    // Ligue 1
    'psg', 'paris', 'lyon', 'marseille', 'monaco', 'lille', 'rennes',
    
    // Bundesliga
    'bayern', 'bayern munich', 'borussia', 'borussia dortmund', 'dortmund', 'bvb',
    'schalke', 'hamburg', 'werder bremen', 'cologne', 'leipzig',
    
    // Países Bajos
    'ajax', 'psv', 'feyenoord', 'rotterdam', 'vitesse', 'utrechtrecht',
    
    // Portugal
    'benfica', 'porto', 'sporting', 'sporting cp', 'braga',
    
    // Selecciones Nacionales
    'argentina', 'brasil', 'españa', 'alemania', 'italia', 'francia',
    'colombia', 'mexico', 'eeuu', 'uruguay', 'paraguay', 'peru', 'chile',
    'venezuela', 'ecuador', 'bolivia', 'england', 'inglaterra', 'portugal',
    'holanda', 'netherlands', 'belgica', 'belgium', 'suecia', 'dinamarca',
    'noruega', 'suiza', 'austria', 'republica checa', 'polonia', 'hungria',
    'grecia', 'turquia', 'japon', 'corea', 'australia', 'nueva zelanda',
    'maroc', 'marruecos', 'senegal', 'niger', 'nigeria', 'camerun',
    'costa de marfil', 'ghana', 'egypto',
  ];

  /**
   * Calcula similitud entre dos strings (Levenshtein distance normalizada)
   */
  private levenshteinSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1 === s2) return 100;
    
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix: number[][] = Array(len2 + 1)
      .fill(null)
      .map(() => Array(len1 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let i = 0; i <= len2; i++) matrix[i][0] = i;

    for (let i = 1; i <= len2; i++) {
      for (let j = 1; j <= len1; j++) {
        const cost = s1[j - 1] === s2[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[len2][len1];
    const maxLen = Math.max(len1, len2);
    return Math.round(((maxLen - distance) / maxLen) * 100);
  }

  /**
   * Tokeniza y normaliza texto
   */
  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(token => token.length > 0 && !this.STOPWORDS.has(token));
  }

  /**
   * Expande tokens usando sinónimos
   */
  expandWithSynonyms(tokens: string[]): string[] {
    const expanded = new Set<string>();

    tokens.forEach(token => {
      expanded.add(token);

      for (const [main, synonyms] of Object.entries(this.SYNONYMS)) {
        if (synonyms.includes(token)) {
          expanded.add(main);
          synonyms.forEach(syn => expanded.add(syn));
        } else if (main === token) {
          synonyms.forEach(syn => expanded.add(syn));
        }
      }
    });

    return Array.from(expanded);
  }

  /**
   * Detecta clubs/selecciones desde diccionario Y desde productos reales
   * NUEVA VERSIÓN: Mejorada con logging y búsqueda DIRECTA en inventario
   */
  async detectClub(text: string): Promise<string | null> {
    const lowerText = text.toLowerCase().trim();
    console.log('[detectClub] 🔍 Buscando:', text);

    // ==================== FASE 1: Diccionario PRIMERO ====================
    
    // Ordena clubes por longitud (más específicos primero)
    const sortedClubs = [...this.KNOWN_CLUBS].sort((a, b) => b.length - a.length);
    
    // ESTRATEGIA 1: Match EXACTO en diccionario (MÁS IMPORTANTE)
    for (const club of sortedClubs) {
      if (lowerText === club || lowerText.includes(club)) {
        console.log('[detectClub] ✅ Diccionario - Match exacto:', club);
        return club;
      }
    }

    const words = lowerText.split(/\s+/);
    const significantWords = words.filter(w => w.length > 2);
    
    // ESTRATEGIA 2: Buscar combinaciones de palabras
    for (const club of sortedClubs) {
      const clubWords = club.split(' ');
      
      if (clubWords.length > 1) {
        const allWordsFound = clubWords.every(clubWord => 
          significantWords.some(word => word.includes(clubWord) || clubWord.includes(word))
        );
        if (allWordsFound) {
          console.log('[detectClub] ✅ Diccionario - Match por palabras:', club);
          return club;
        }
      }
    }

    // ESTRATEGIA 3: Fuzzy matching en diccionario
    for (const club of sortedClubs) {
      const similarity = this.levenshteinSimilarity(lowerText, club);
      if (similarity >= 65) {
        console.log('[detectClub] ✅ Diccionario - Fuzzy match (', similarity, '%):', club);
        return club;
      }
    }

    // ==================== FASE 2: BÚSQUEDA EN INVENTARIO ====================
    // CRÍTICO: Busca DIRECTAMENTE en los productos
    try {
      console.log('[detectClub] 📦 Consultando inventario...');
      const allProducts = await inventoryService.getAllProducts();
      
      if (!allProducts || allProducts.length === 0) {
        console.log('[detectClub] ⚠️ Inventario vacío');
        return null;
      }
      
      console.log('[detectClub] Productos en inventario:', allProducts.length);

      // 2.1 - BÚSQUEDA POR SUBSTRING (MÁS IMPORTANTE)
      for (const product of allProducts) {
        const productName = product.name.toLowerCase();
        
        // Si el nombre del producto CONTIENE lo que buscamos
        if (productName.includes(lowerText)) {
          console.log('[detectClub] ✅ Inventario - Substring match:', product.name);
          const parts = productName.split(/\s+/);
          return parts.slice(0, 2).join(' ');
        }
        
        // Si lo que buscamos CONTIENE el nombre del producto
        if (lowerText.includes(productName) && productName.length > 4) {
          console.log('[detectClub] ✅ Inventario - Reverse match:', product.name);
          const parts = productName.split(/\s+/);
          return parts.slice(0, 2).join(' ');
        }
      }

      // 2.2 - BÚSQUEDA POR PALABRAS INDIVIDUALES
      for (const word of significantWords) {
        if (word.length > 2) {
          for (const product of allProducts) {
            const productName = product.name.toLowerCase();
            if (productName.includes(word)) {
              console.log('[detectClub] ✅ Inventario - Word match:', product.name, 'para:', word);
              const parts = productName.split(/\s+/);
              return parts.slice(0, 2).join(' ');
            }
          }
        }
      }

      // 2.3 - FUZZY MATCHING en productos
      for (const product of allProducts) {
        const productName = product.name.toLowerCase();
        const sim = this.levenshteinSimilarity(lowerText, productName);
        if (sim >= 60) {
          console.log('[detectClub] ✅ Inventario - Fuzzy match (', sim, '%):', product.name);
          const parts = productName.split(/\s+/);
          return parts.slice(0, 2).join(' ');
        }
      }
      
    } catch (error) {
      console.error('[detectClub] ❌ Error al consultar inventario:', error);
    }

    console.log('[detectClub] ❌ No se encontró club para:', text);
    return null;
  }

  /**
   * Extrae características mencionadas (colores, tallas, materiales)
   */
  extractAttributes(tokens: string[]): {
    colors: string[];
    sizes: string[];
    materials: string[];
    type: string[];
  } {
    const result = {
      colors: [] as string[],
      sizes: [] as string[],
      materials: [] as string[],
      type: [] as string[],
    };

    for (const [category, synonyms] of Object.entries(this.SYNONYMS)) {
      tokens.forEach(token => {
        if (synonyms.includes(token)) {
          if (['rojo', 'azul', 'blanco', 'negro', 'verde', 'amarillo', 'naranja'].includes(category)) {
            result.colors.push(category);
          } else if (['pequeno', 'mediano', 'grande'].includes(category)) {
            result.sizes.push(category);
          } else if (['poliester', 'algodon', 'spandex', 'transpirable'].includes(category)) {
            result.materials.push(category);
          } else if (['futbol', 'deportiva', 'entrenar'].includes(category)) {
            result.type.push(category);
          }
        }
      });
    }

    return result;
  }

  /**
   * Calcula puntuación de relevancia del producto vs búsqueda
   */
  calculateRelevanceScore(
    product: any,
    searchTokens: string[],
    detectedClub: string | null,
    attributes: ReturnType<NLPEngine['extractAttributes']>
  ): number {
    let score = 0;
    const productText = `${product.name} ${product.description || ''} ${product.category || ''}`.toLowerCase();
    const productTokens = productText.split(/\s+/);
    const productName = product.name.toLowerCase();

    // 1. SCORING CRÍTICO: Match de club detectado (MÁS AGRESIVO)
    if (detectedClub) {
      const clubTokens = detectedClub.split(/\s+/); // Split por espacios
      let clubMatchCount = 0;
      
      // Contar cuántos tokens del club aparecen en el producto
      for (const clubToken of clubTokens) {
        if (productTokens.some(pToken => 
          pToken.includes(clubToken) || clubToken.includes(pToken)
        )) {
          clubMatchCount++;
        }
      }
      
      // PUNTUACIÓN: Todos los tokens del club presentes = ALTA
      if (clubMatchCount === clubTokens.length && clubTokens.length > 0) {
        score += 200; // AUMENTADO: Match perfecto multi-palabra
      } 
      // Si al menos hay match parcial
      else if (clubMatchCount > 0) {
        score += clubMatchCount * 75; // AUMENTADO: Match parcial más valioso
      }
      
      // BONUS: Si el club aparece en el nombre del producto
      if (productName.includes(detectedClub) || productName.includes(clubTokens[0])) {
        score += 50; // Bonus extra por estar en el nombre
      }
    }

    // 1.5 BÚSQUEDA DE PALABRAS CLAVE EN EL NOMBRE (ANTES QUE DESCRIPCIÓN)
    // MEJORADO: Busca palabras en el nombre con puntuación más alta
    const nameWords = product.name.toLowerCase().split(/\s+/);
    const foundInName = new Set<string>(); // Para evitar duplicados
    
    searchTokens.forEach((token: string) => {
      if (token.length > 2 && !foundInName.has(token)) {
        nameWords.forEach((nameWord: string) => {
          if (nameWord.includes(token) || token.includes(nameWord)) {
            score += 50; // AUMENTADO - está en el nombre es MUY importante
            foundInName.add(token);
          }
        });
      }
    });

    // 2. Match de tokens principales (búsqueda del usuario)
    searchTokens.forEach(token => {
      if (token.length > 2 && !foundInName.has(token) && 
          productTokens.some(pToken => pToken.includes(token))) {
        score += 30; // AUMENTADO
      }
    });

    // 3. Match de colores solicitados
    if (attributes.colors.length > 0) {
      attributes.colors.forEach(color => {
        if (productTokens.some(pToken => pToken.includes(color))) {
          score += 25; // AUMENTADO
        }
      });
    }

    // 4. Match de materiales
    if (attributes.materials.length > 0) {
      attributes.materials.forEach(material => {
        if (productTokens.some(pToken => pToken.includes(material))) {
          score += 20; // AUMENTADO
        }
      });
    }

    // 5. Match de tipo de camiseta (oficial, retro, etc)
    if (attributes.type.length > 0) {
      attributes.type.forEach(type => {
        if (productText.includes(type)) {
          score += 25; // AUMENTADO
        }
      });
    }

    // 6. Bonus por featured/destacado
    if (product.featured) score += 20; // AUMENTADO

    // 7. Bonus por stock disponible
    if (product.stock && product.stock > 0) score += 10; // AUMENTADO

    return Math.max(0, score);
  }
}

// ==================== CHATBOT SERVICE ====================

class LocalChatbotService {
  private conversationHistory: ChatMessage[] = [];
  private nlp = new NLPEngine();

  private readonly RESPONSES = {
    greeting: [
      '¡Hola! 👋 ¿Qué camiseta buscas?',
      '¡Hola! 👕 ¿En qué puedo ayudarte?',
      '¿Qué hay! 🕷️ ¿Qué buscas?',
    ],
    helpText:
      'Puedo ayudarte a encontrar camisetas 👕\n\n📋 Puedes preguntarme por:\n• Clubs (Ej: "Manchester United", "Real Madrid", "bayern")\n• Selecciones (Ej: "Argentina", "Brasil", "España")\n• Características (Ej: "camiseta roja", "para entrenar", "poliéster")\n• Detalles (Ej: "talla L", "azul marino", "edición especial")\n• Información (Ej: "¿Qué tallas?", "¿Cuánto cuesta?")\n\n¿Qué te interesa?',
    notFound: [
      'No encontré camisetas con eso 😅. ¿Prueba con otro club, color o característica?',
      'Hmm, no tenemos eso disponible. ¿Quizás buscar por otro término?',
      'No hay coincidencias exactas. ¿Intenta ser más específico o prueba otro nombre?',
    ],
    info: {
      tallas: 'Tenemos tallas desde XS hasta XXL. En cada producto verás exactamente cuál stock hay. 📏',
      precio: 'Los precios varían según el modelo y tipo. Haz click en cualquier producto para ver el precio exacto. 💵',
      envios: {
        general: '📦 Entregamos en Guayaquil y Santa Elena\n\n⏰ Entregas:\n• Guayaquil: Jueves, viernes y sábado\n• Santa Elena: Sábado\n\n💰 Costo de envío:\n• Mapasingue, Ceibos, Urdesa: ¡GRATIS! 🎉\n• Otras zonas de Guayaquil: $2\n• Santa Elena: $2',
        zonas: 'Tenemos envío gratis en Mapasingue, Ceibos y Urdesa. Otras zonas de Guayaquil y Santa Elena tienen envío a $2. 🚚',
        dias: 'En Guayaquil entregamos jueves, viernes y sábado. En Santa Elena solo entregamos los sábados. 📅',
        gratis: 'Sí, ¡el envío es completamente gratis! si vives en Mapasingue, Ceibos o Urdesa. 🎉'
      },
      material: 'Nuestras camisetas son principalmente poliéster con spandex para máxima transpiración y durabilidad. ✨',
      devolucion:
        'Tenemos política de devolución. Contacta con nuestro equipo si necesitas más detalles. ↩️',
      calidad: 'Todas nuestras camisetas son de alta calidad con costura reforzada y diseños auténticos. 👌',
      personalizacion: 'Sí, realizamos personalizaciones. Contacta a ventas para más info. ✏️',
      oficial: 'Sí, contamos con camisetas oficiales licenciadas de clubes y selecciones. ⭐',
    },
  };

  /**
   * Procesa un mensaje del usuario con NLP avanzado
   */
  async processMessage(userMessage: string): Promise<ChatResponse> {
    try {
      this.conversationHistory.push({
        role: 'user',
        content: userMessage,
      });

      const lowerMessage = userMessage.toLowerCase().trim();

      let responseType: 'search' | 'info' | 'greeting' | 'help' | 'number' | 'confirmation' = 'search';
      let assistantMessage = '';
      let products: any[] = [];
      let confidence = 0;
      const metadata: any = {};

      // 1. Detectar saludos
      if (this.isGreeting(lowerMessage)) {
        responseType = 'greeting';
        assistantMessage = this.getRandomResponse(this.RESPONSES.greeting);
        confidence = 100;
      }
      // 2. Detectar pedir ayuda
      else if (this.isHelpRequest(lowerMessage)) {
        responseType = 'help';
        assistantMessage = this.RESPONSES.helpText;
        confidence = 100;
      }
      // 3. Detectar preguntas de información
      else if (this.isInfoQuestion(lowerMessage)) {
        responseType = 'info';
        const { message, conf } = this.handleInfoQuestion(lowerMessage);
        assistantMessage = message;
        confidence = conf;
      }
      // 3.5. Detectar si es una pregunta que no está relacionada con productos (sin intentar buscar)
      else if (this.isUnrelatedQuestion(lowerMessage)) {
        responseType = 'info';
        assistantMessage = 'No tengo información sobre eso. 🤔 ¿Puedo ayudarte con información sobre camisetas, precios, envíos o tallas?';
        confidence = 20;
        products = [];
      }
      // 4. Búsqueda de productos (puede ser búsqueda, pregunta numérica o confirmación)
      else {
        const { items, conf } = await this.searchProductsAdvanced(userMessage);
        products = items;
        confidence = conf;
        metadata.resultCount = items.length;

        // Determinar subtipo de búsqueda
        // IMPORTANTE: Detectar pregunta numérica PRIMERO antes que confirmación
        if (this.isNumericQuestion(lowerMessage)) {
          responseType = 'number';
          
          // IMPORTANTE: Si es pregunta de precio/stock SIN mencionar un producto específico, pedir aclaración
          const hasProductReference = lowerMessage.match(/camiseta|jersey|polo|playera|real madrid|barcelona|manchester|arsenal|liverpool|chelsea|juventus|milan|psg|bayern|ajax|benfica|porto|club|equipo|selección|nacional|argentina|brasil|españa|alemania|italia|francia/i);
          
          if (!hasProductReference && (lowerMessage.includes('stock') || lowerMessage.includes('cantidad') || lowerMessage.includes('disponible') || 
              lowerMessage.includes('precio') || lowerMessage.includes('costo') || lowerMessage.includes('cuánto cuesta') || lowerMessage.includes('cuanto cuesta'))) {
            // Es una pregunta numérica genérica sin producto específico
            assistantMessage = '¿De cuál camiseta o club quieres saber el precio o stock? 🤔';
            confidence = 30;
            products = [];
          } else if (items.length > 0) {
            // Extraer información numérica del primer producto si aplica
            if (lowerMessage.includes('precio') || lowerMessage.includes('costo') || lowerMessage.includes('cuánto cuesta') || lowerMessage.includes('cuanto cuesta')) {
              metadata.infoType = 'price';
              metadata.numericValue = items[0].price;
              metadata.isNumericAnswer = true;
              
              // Verificar si todos los productos tienen el mismo precio
              const uniquePrices = [...new Set(items.map(p => p.price))];
              if (uniquePrices.length === 1) {
                assistantMessage = `💰 Todas las camisetas cuestan $${items[0].price}`;
              } else {
                assistantMessage = `💰 Los precios varían entre $${Math.min(...items.map(p => p.price))} y $${Math.max(...items.map(p => p.price))}`;
              }
              
              // NO mostrar productos para pregunta de precio - solo texto
              products = [];
            } else if (lowerMessage.includes('stock') || lowerMessage.includes('cantidad') || lowerMessage.includes('disponible') || lowerMessage.includes('hay')) {
              metadata.infoType = 'stock';
              metadata.numericValue = items[0].stock;
              metadata.isNumericAnswer = true;
              
              const productName = items[0]?.name || 'camiseta';
              assistantMessage = `📦 Stock de ${productName}: ${items[0].stock} unidad${items[0].stock !== 1 ? 'es' : ''}`;
              
              // NO mostrar productos para pregunta de stock - solo texto
              products = [];
            } else {
              // MEJORADO: Si no hay palabras clave explícitas pero fue detectado como numeric (por club), asumir que es sobre stock
              metadata.infoType = 'stock';
              metadata.numericValue = items[0].stock;
              metadata.isNumericAnswer = true;
              
              const productName = items[0]?.name || 'camiseta';
              assistantMessage = `📦 Stock de ${productName}: ${items[0].stock} unidad${items[0].stock !== 1 ? 'es' : ''}`;
              
              // NO mostrar productos - solo texto
              products = [];
            }
          } else {
            assistantMessage = `❌ No encontré lo que buscas. ¿Podrías ser más específico?`;
            confidence = 40;
          }
        } else if (this.isConfirmationQuestion(lowerMessage)) {
          responseType = 'confirmation';
          
          if (items.length > 0) {
            // Para confirmación, mostrar solo 1-2 productos más relevantes
            products = items.slice(0, 2);
            const productName = items[0]?.name || 'camiseta';
            assistantMessage = `Claro, aquí está la camiseta "${productName}"`;
          } else {
            assistantMessage = `Lamentablemente no tenemos disponible lo que buscas en este momento. ¿Te gustaría buscar otra cosa?`;
          }
          confidence = Math.min(100, conf + 15);
        } else {
          // Búsqueda normal de productos
          responseType = 'search';
          
          if (items.length > 0) {
            const productName = items[0]?.name || 'camiseta';
            assistantMessage = `Claro, aquí está la camiseta "${productName}"`;
            // Mostrar máximo 5 productos en búsqueda normal
            products = items.slice(0, 5);
          } else {
            assistantMessage = this.getRandomResponse(this.RESPONSES.notFound);
            confidence = 40;
          }
        }
      }

      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage,
      });

      return {
        message: assistantMessage,
        products,
        conversationHistory: this.conversationHistory,
        type: responseType,
        confidence: Math.round(confidence),
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
    } catch (error) {
      console.error('Error en chatbot:', error);
      throw new Error('No se pudo procesar tu mensaje. Intenta de nuevo.');
    }
  }

  /**
   * Búsqueda avanzada con NLP - MEJORADA con búsqueda secundaria
   */
  private async searchProductsAdvanced(query: string): Promise<{ items: any[]; conf: number }> {
    try {
      console.log('[searchProducts] 🔍 Query:', query);
      const allProducts = await inventoryService.getAllProducts();
      console.log('[searchProducts] Total productos:', allProducts.length);

      // 1. Tokenizar y expandir con sinónimos
      const tokens = this.nlp.tokenize(query);
      const expandedTokens = this.nlp.expandWithSynonyms(tokens);

      // 2. Detectar club (busca en diccionario + inventario)
      const detectedClub = await this.nlp.detectClub(query);
      console.log('[searchProducts] Club detectado:', detectedClub || 'NINGUNO');

      // 3. Extraer atributos
      const attributes = this.nlp.extractAttributes(expandedTokens);

      // 4. Calcular score para cada producto
      let scored = allProducts
        .map((product: any) => {
          const score = this.nlp.calculateRelevanceScore(
            product,
            expandedTokens,
            detectedClub,
            attributes
          );
          return { product, score };
        })
        .filter((item: any) => item.score > 0)
        .sort((a: any, b: any) => b.score - a.score);

      console.log('[searchProducts] Resultados con score > 0:', scored.length);

      // 4.5 - FILTRADO ESPECIAL: Si detectamos un club ESPECÍFICO, filtra solo ese club
      if (detectedClub && scored.length > 0) {
        const clubFiltered = scored.filter((item: any) => {
          const productName = item.product.name.toLowerCase();
          const clubName = detectedClub.toLowerCase();
          // Solo productos que contengan el nombre del club
          return productName.includes(clubName);
        });
        
        if (clubFiltered.length > 0) {
          console.log('[searchProducts] Filtrado por club específico:', clubFiltered.length);
          scored = clubFiltered;
        }
      }
      
      // Si no encontró nada, haz búsqueda SECUNDARIA más flexible
      if (scored.length === 0) {
        console.log('[searchProducts] ⚠️ Sin resultados - Activando búsqueda secundaria...');
        
        const fallbackScored = allProducts
          .map((product: any) => {
            let score = 0;
            const productLower = product.name.toLowerCase();
            const queryLower = query.toLowerCase();
            
            // Búsqueda simple por substring
            if (productLower.includes(queryLower)) {
              score = 100;
            } else {
              // Busca palabras individuales
              const queryWords = queryLower.split(/\s+/);
              for (const word of queryWords) {
                if (word.length > 2 && productLower.includes(word)) {
                  score += 50;
                }
              }
            }
            
            return { product, score };
          })
          .filter((item: any) => item.score > 0)
          .sort((a: any, b: any) => b.score - a.score);
        
        console.log('[searchProducts] Fallback encontró:', fallbackScored.length);
        
        return {
          items: fallbackScored.slice(0, 5).map((item: any) => item.product),
          conf: fallbackScored.length > 0 ? 65 : 0,
        };
      }

      // 5. Calcular confianza global basada en mejor match
      let confidence = 50;
      if (scored.length > 0) {
        const bestScore = scored[0].score;
        confidence = Math.min(100, 50 + bestScore / 2);
      }

      return {
        items: scored.slice(0, 5).map((item: any) => item.product),
        conf: confidence,
      };
    } catch (error) {
      console.error('Error en búsqueda avanzada:', error);
      return { items: [], conf: 0 };
    }
  }

  /**
   * Detecta si es un saludo
   */
  private isGreeting(message: string): boolean {
    const greetings = [
      'hola', 'hi', 'hey', 'buenos', 'buenas', 'que tal', 'qué tal', 'ey', 'ola',
      'saludos', 'buenos días', 'buenas tardes', 'buenas noches', 'hello'
    ];
    return greetings.some(g => message.includes(g));
  }

  /**
   * Detecta si pide ayuda
   */
  private isHelpRequest(message: string): boolean {
    const helpKeywords = ['help', 'ayuda', 'que puedes', 'qué puedes', 'como funciona', 'cómo funciona', 'comandos', 'soporte'];
    return helpKeywords.some(k => message.includes(k));
  }

  /**
   * Detecta si es una pregunta no relacionada con la tienda
   * (sobre temas que no tienen que ver con camisetas, precios, envíos, etc.)
   */
  private isUnrelatedQuestion(message: string): boolean {
    const unrelatedKeywords = [
      'como estás', 'cómo estás', 'como estas', 'cómo estas', 'como vai', 'que tal',
      'qué tal', 'quién eres', 'quien eres', 'de donde eres', 'de dónde eres',
      'cuál es tu nombre', 'cual es tu nombre', 'te llamas', 'tu edad',
      'eres humano', 'eres bot', 'eres inteligencia', 'politica', 'política', 'religión', 
      'religion', 'deporte', 'películas', 'peliculas', 'música', 'musica', 'comida',
      'viajes', 'gastronomia', 'gastronomía', 'humor', 'broma', 'chiste',
      'trabajo', 'empleo', 'dinero', 'dinero', 'prestamo', 'préstamo', 'interes',
      'interés', 'bitcoin', 'criptomoneda', 'bolsa', 'acciones'
    ];

    // Si el mensaje es muy corto y genérico, no es pregunta no relacionada (podría ser búsqueda)
    if (message.trim().split(/\s+/).length <= 2) {
      return false;
    }

    // Solo considerar no relacionada si tiene palabras clave explícitas
    return unrelatedKeywords.some(k => message.includes(k));
  }

  /**
   * Detecta si es una pregunta de información
   * MEJORADO: Reconoce más variaciones informales y preguntas sobre entregas
   */
  private isInfoQuestion(message: string): boolean {
    const infoKeywords = [
      'talla', 'size', 'precio', 'costo', 'valor', 'envio', 'envío', 'entrega', 'cuando llega', 'cuándo llega',
      'dias entrega', 'días entrega', 'devolucion', 'devolución', 'material', 'tela', 'calidad', 'oficial', 'personaliz',
      'cuanto cuesta envio', 'cuánto cuesta envío', 'gratis', 'envio gratis', 'envío gratis',
      'mapasingue', 'ceibos', 'urdesa', 'santa elena', 'zona de cobertura', 'donde entregan',
      'costo envio', 'costo entrega', 'tarifa', 'cuanto vale', 'cuánto vale',
      'lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado', 'domingo',
      'puede ser', 'se puede', 'es posible', 'otro día'
    ];
    return infoKeywords.some(k => message.includes(k));
  }

  /**
   * Maneja preguntas de información
   * MEJORADO: Detecta preguntas informales sobre envíos
   */
  private handleInfoQuestion(message: string): { message: string; conf: number } {
    const lowerMsg = message.toLowerCase();

    // PREGUNTAS SOBRE ENVÍOS - PRIORITARIO
    if (lowerMsg.includes('envio') || lowerMsg.includes('envío') || lowerMsg.includes('entrega') || 
        lowerMsg.includes('shipping') || lowerMsg.includes('cuando llega') || lowerMsg.includes('cuándo llega') ||
        lowerMsg.includes('dias entrega') || lowerMsg.includes('días entrega') || lowerMsg.includes('costo envio') ||
        lowerMsg.includes('costo entrega') || lowerMsg.includes('cuanto cuesta envio') || lowerMsg.includes('cuánto cuesta envío') ||
        lowerMsg.includes('donde entregan') || lowerMsg.includes('dónde entregan') || lowerMsg.includes('zona cobertura') ||
        lowerMsg.includes('viernes') || lowerMsg.includes('sabado') || lowerMsg.includes('sábado') || lowerMsg.includes('lunes') || 
        lowerMsg.includes('martes') || lowerMsg.includes('miercoles') || lowerMsg.includes('miércoles') || lowerMsg.includes('jueves') ||
        lowerMsg.includes('domingo') || lowerMsg.includes('otro dia') || lowerMsg.includes('otro día')) {
      
      // Respuestas específicas según la pregunta
      if (lowerMsg.includes('gratis') || lowerMsg.includes('free')) {
        return { message: this.RESPONSES.info.envios.gratis, conf: 98 };
      }
      if (lowerMsg.includes('mapasingue') || lowerMsg.includes('ceibos') || lowerMsg.includes('urdesa')) {
        return { message: '¡Excelente! Tu zona tiene envío GRATIS 🎉. Entregamos jueves, viernes y sábado. 📦', conf: 100 };
      }
      if (lowerMsg.includes('santa elena')) {
        return { message: 'En Santa Elena el envío es $2 y solo entregamos los sábados. 📦', conf: 100 };
      }
      if (lowerMsg.includes('viernes')) {
        return { message: 'No, lamentablemente solo entregamos los días designados. En Guayaquil: jueves, viernes y sábado. En Santa Elena: solo sábado. 📦', conf: 95 };
      }
      if (lowerMsg.includes('lunes') || lowerMsg.includes('martes') || lowerMsg.includes('miercoles') || lowerMsg.includes('miércoles') || lowerMsg.includes('domingo')) {
        return { message: 'No, no entregamos en esos días. En Guayaquil entregamos jueves, viernes y sábado. En Santa Elena solo sábado. 📦', conf: 95 };
      }
      if (lowerMsg.includes('cuando') || lowerMsg.includes('cuándo') || lowerMsg.includes('dia') || lowerMsg.includes('día')) {
        return { message: this.RESPONSES.info.envios.dias, conf: 95 };
      }
      if (lowerMsg.includes('cuanto') || lowerMsg.includes('cuánto') || lowerMsg.includes('precio') || lowerMsg.includes('costo') || lowerMsg.includes('tarifa')) {
        return { message: this.RESPONSES.info.envios.zonas, conf: 95 };
      }
      
      // Respuesta general sobre envíos
      return { message: this.RESPONSES.info.envios.general, conf: 90 };
    }

    if (lowerMsg.includes('talla') || lowerMsg.includes('size')) {
      return { message: this.RESPONSES.info.tallas, conf: 95 };
    }
    if (lowerMsg.includes('precio') || lowerMsg.includes('costo') || lowerMsg.includes('how much') || lowerMsg.includes('cuánto')) {
      return { message: this.RESPONSES.info.precio, conf: 95 };
    }
    if (lowerMsg.includes('material') || lowerMsg.includes('tela')) {
      return { message: this.RESPONSES.info.material, conf: 90 };
    }
    if (lowerMsg.includes('devolucion') || lowerMsg.includes('devolución') || lowerMsg.includes('return')) {
      return { message: this.RESPONSES.info.devolucion, conf: 90 };
    }
    if (lowerMsg.includes('calidad') || lowerMsg.includes('quality')) {
      return { message: this.RESPONSES.info.calidad, conf: 85 };
    }
    if (lowerMsg.includes('personaliz')) {
      return { message: this.RESPONSES.info.personalizacion, conf: 85 };
    }
    if (lowerMsg.includes('oficial') || lowerMsg.includes('autentica') || lowerMsg.includes('auténtica')) {
      return { message: this.RESPONSES.info.oficial, conf: 90 };
    }

    return { message: 'No estoy seguro de tu pregunta. ¿Puedes ser más específico?', conf: 30 };
  }

  /**
   * Detecta si es una pregunta numérica (¿cuántos?, ¿cuál es el precio?, etc.)
   * MEJORADO: También detecta cuando es solo el nombre del producto/club como continuación
   */
  private isNumericQuestion(message: string): boolean {
    const numericKeywords = [
      'cuántos', 'cuantos', 'cuántas', 'cuantas', 'how many', 'cuál', 'cual', 
      'precio', 'costo', 'valor', 'stock', 'cantidad', 'disponible',
      'cuánto cuesta', 'cuanto cuesta', 'cuánto vale', 'cuanto vale',
      'cuesta', 'vale', 'how much'
    ];
    
    // Si tiene palabras numéricas obvias
    if (numericKeywords.some(k => message.includes(k))) {
      return true;
    }
    
    // MEJORADO: Si es solo un nombre de club/producto (2-3 palabras), probablemente es respuesta a pregunta de stock/precio
    const words = message.trim().split(/\s+/).length;
    const isClubOrProduct = message.match(/real madrid|barcelona|manchester|arsenal|liverpool|chelsea|juventus|milan|psg|bayern|ajax|benfica|porto|newcastle|roma|napoli|atletico|atletico madrid|atletico de madrid|brighton|fulham|crystal palace|aston villa|everton|tottenham|spurs|leicester|west ham|nottingham|luton|bournemouth|burnley|sheffield|coventry|brentford|hulltowns|bristol|watford|sunderland|plymouth|ipswich|leeds|cardiff|plymouth argyle|swansea|coventry|reading|norwich|millwall|hull|qpr|derby|stoke|west brom|brighton|fulham|arsenal|tottenham|newcastle|man city|man united|liverpool|chelsea|everton|aston villa|wolves|crystal palace|leicester|east midlands|forest|luton|brentford|leicester city|bournemouth|aston villa|fulham|brighton|chelsea|tottenham|manchester united|manchester city|liverpool|arsenal|newcastle|everton|west ham|nottingham forest|brighton|fulham|brentford|aston villa|luton|bournemouth|nottingham|crystal palace|leicester|leeds|cardiff|swansea|coventry|reading|norwich|watford|bristol|sunderland|hull|sheffield united|sheffield wednesday|stoke|derby|burton|millwall|qpr|west brom|blackburn|bolton|wigan|charlton|old team|club|team|selección|argentina|brasil|españa|alemania|italia|francia|portugal|holanda|belgica|uruguay|mexico|colomba|venezuela|peru|chile/i);
    
    if (words <= 3 && isClubOrProduct) {
      return true;
    }
    
    return false;
  }

  /**
   * Detecta si es una pregunta de confirmación/sí-no
   * MEJORADO: Solo si hay contexto claro (pregunta anterior)
   */
  private isConfirmationQuestion(message: string): boolean {
    // Si contiene palabras numéricas, NO es confirmación
    const numericKeywords = ['precio', 'costo', 'valor', 'stock', 'cantidad', 'cuánto', 'cuanto', 'cuesta', 'vale'];
    if (numericKeywords.some(k => message.includes(k))) {
      return false;
    }
    
    // Solo palabras que claramente piden confirmación de algo
    const confirmKeywords = [
      'tienes', 'tenes', 'hay', 'existe', 'disponible', '¿hay', '¿tienes', 'do you have', 'is there',
      'puedo', 'pueda', 'se puede', 'se vende', 'se encuentra'
    ];
    
    // IMPORTANTE: Ignorar palabras muy genéricas como solo "si" o "no"
    if (message === 'si' || message === 'no' || message === 'sí' || message === 'nó') {
      return false;
    }
    
    return confirmKeywords.some(k => message.includes(k));
  }

  /**
   * Retorna respuesta aleatoria de un array
   */
  private getRandomResponse(responses: string[]): string {
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Métodos públicos para manejo de historial
  clearHistory(): void {
    this.conversationHistory = [];
  }

  getHistory(): ChatMessage[] {
    return this.conversationHistory;
  }

  setHistory(history: ChatMessage[]): void {
    this.conversationHistory = history;
  }
}

export const chatbotService = new LocalChatbotService();
