import { inventoryService } from './inventoryService';

// ==================== INTERFACES ====================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  message: string;
  products: any[];
  conversationHistory: ChatMessage[];
  type: 'search' | 'info' | 'greeting' | 'help';
  confidence: number; // 0-100, qué tan seguro está el bot
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
    'manchester united', 'manchester city', 'liverpool', 'arsenal', 'chelsea', 'tottenham',
    'real madrid', 'barcelona', 'atletico madrid', 'sevilla', 'valencia',
    'milan', 'inter', 'juventus', 'roma', 'napoli',
    'psg', 'lyon', 'marseille', 'monaco',
    'bayern', 'borussia', 'schalke', 'hamburg',
    'ajax', 'psv', 'feyenoord',
    'benfica', 'porto', 'sporting',
    'argentina', 'brasil', 'españa', 'alemania', 'italia', 'francia', 'colombia',
    'mexico', 'eeuu', 'uruguay', 'paraguay', 'peru', 'chile', 'venezuela'
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
   * Detecta clubs/selecciones conocidas por fuzzy matching
   */
  detectClub(text: string): string | null {
    const lowerText = text.toLowerCase();

    for (const club of this.KNOWN_CLUBS) {
      const similarity = this.levenshteinSimilarity(lowerText, club);
      if (similarity >= 70) return club; // 70% de similitud
    }

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

    // 1. Match exacto de club
    if (detectedClub && productText.includes(detectedClub)) {
      score += 50;
    }

    // 2. Match de tokens
    searchTokens.forEach(token => {
      if (productText.includes(token)) {
        score += 20;
      }
    });

    // 3. Match de colores
    attributes.colors.forEach(color => {
      if (productText.includes(color)) score += 15;
    });

    // 4. Match de características
    if (attributes.materials.length > 0) {
      attributes.materials.forEach(material => {
        if (productText.includes(material)) score += 10;
      });
    }

    // 5. Bonus si está featured/destacado
    if (product.featured) score += 10;

    // 6. Bonus si tiene stock
    if (product.stock && product.stock > 0) score += 5;

    return score;
  }
}

// ==================== CHATBOT SERVICE ====================

class LocalChatbotService {
  private conversationHistory: ChatMessage[] = [];
  private nlp = new NLPEngine();

  private readonly RESPONSES = {
    greeting: [
      '¡Hola! 👋 Bienvenido a SpideySports. ¿Qué tipo de camiseta buscas hoy?',
      '¡Hola! 👕 ¿En qué puedo ayudarte?',
      '¡Hola! Soy el asistente de SpideySports. Cuéntame qué buscas.',
      '¿Qué hay! 🕷️ ¿Buscas alguna camiseta en especial?',
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
      envios: 'Entregamos a Santa Elena, Guayaquil y otras ciudades. Verás opciones de envío en checkout. 🚚',
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

      let responseType: 'search' | 'info' | 'greeting' | 'help' = 'search';
      let assistantMessage = '';
      let products: any[] = [];
      let confidence = 0;

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
      // 4. Búsqueda de productos (default)
      else {
        responseType = 'search';
        const { items, conf } = await this.searchProductsAdvanced(userMessage);
        products = items;
        confidence = conf;

        if (products.length > 0) {
          assistantMessage = `✅ Encontré ${products.length} camiseta${products.length !== 1 ? 's' : ''} que coinciden 👕`;
        } else {
          assistantMessage = this.getRandomResponse(this.RESPONSES.notFound);
          confidence = 40; // Baja confianza cuando no encuentra nada
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
      };
    } catch (error) {
      console.error('Error en chatbot:', error);
      throw new Error('No se pudo procesar tu mensaje. Intenta de nuevo.');
    }
  }

  /**
   * Búsqueda avanzada con NLP
   */
  private async searchProductsAdvanced(query: string): Promise<{ items: any[]; conf: number }> {
    try {
      const allProducts = await inventoryService.getAllProducts();

      // 1. Tokenizar y expandir con sinónimos
      const tokens = this.nlp.tokenize(query);
      const expandedTokens = this.nlp.expandWithSynonyms(tokens);

      // 2. Detectar club
      const detectedClub = this.nlp.detectClub(query);

      // 3. Extraer atributos
      const attributes = this.nlp.extractAttributes(expandedTokens);

      // 4. Calcular score para cada producto
      const scored = allProducts
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
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 5);

      // 5. Calcular confianza global basada en mejor match
      let confidence = 50;
      if (scored.length > 0) {
        const bestScore = scored[0].score;
        confidence = Math.min(100, 50 + bestScore / 2);
      }

      return {
        items: scored.map((item: any) => item.product),
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
   * Detecta si es una pregunta de información
   */
  private isInfoQuestion(message: string): boolean {
    const infoKeywords = ['talla', 'size', 'precio', 'costo', 'envio', 'envío', 'devolucion', 'devolución', 'material', 'calidad', 'oficial', 'personaliz'];
    return infoKeywords.some(k => message.includes(k));
  }

  /**
   * Maneja preguntas de información
   */
  private handleInfoQuestion(message: string): { message: string; conf: number } {
    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes('talla') || lowerMsg.includes('size')) {
      return { message: this.RESPONSES.info.tallas, conf: 95 };
    }
    if (lowerMsg.includes('precio') || lowerMsg.includes('costo') || lowerMsg.includes('how much') || lowerMsg.includes('cuánto')) {
      return { message: this.RESPONSES.info.precio, conf: 95 };
    }
    if (lowerMsg.includes('envio') || lowerMsg.includes('envío') || lowerMsg.includes('shipping')) {
      return { message: this.RESPONSES.info.envios, conf: 95 };
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
