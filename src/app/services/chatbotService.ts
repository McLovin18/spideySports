'use client';

import { inventoryService } from './inventoryService';

// Interfaz para mensajes del chat
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Interfaz para respuesta del chatbot
export interface ChatResponse {
  message: string;
  products: any[];
  conversationHistory: ChatMessage[];
  type: 'search' | 'info' | 'greeting' | 'help';
}

/**
 * Chatbot local entrenado manualmente
 * Busca productos en tu inventario y proporciona respuestas personalizadas
 */
class LocalChatbotService {
  private conversationHistory: ChatMessage[] = [];

  // Respuestas predefinidas para consultas comunes
  private readonly RESPONSES = {
    greeting: [
      '¡Hola! 👋 Bienvenido a SpideySports. ¿Qué tipo de camiseta buscas hoy?',
      '¡Hola! 👕 ¿En qué puedo ayudarte?',
      '¡Hola! Soy el asistente de SpideySports. Cuéntame qué buscas.',
    ],
    helpText:
      'Puedo ayudarte a encontrar camisetas 👕\n\n📋 Puedes preguntarme por:\n• Clubs (Ej: "Manchester United", "Real Madrid")\n• Selecciones (Ej: "Argentina", "Brasil")\n• Detalles (Ej: "camisetas para entrenar", "ediciones especiales")\n• Características (Ej: "roja", "azul", "poliéster")\n\n¿Qué buscas?',
    notFound: [
      'No encontré camisetas que coincidan con eso 😅. Intenta con otro término o pregunta por un club/selección específico.',
      'Hmm, no tenemos resultados para eso. ¿Prueba con otro nombre o características?',
    ],
    info: {
      tallas: 'Tenemos tallas desde XS hasta XXL. En cada producto verás la disponibilidad. 📏',
      precio: 'Los precios varían según el modelo y tipo. Haz click en un producto para ver detalles.',
      envios: 'Entregamos a Santa Elena, Guayaquil y otras ciudades. Verás opciones de envío en checkout. 🚚',
      material: 'Nuestras camisetas son de poliéster y spandex para máxima transpiración y durabilidad. ✨',
      devolucion:
        'Tenemos política de devolución. Contacta con nuestro equipo si necesitas más detalles.',
    },
  };

  /**
   * Procesa un mensaje del usuario
   */
  async processMessage(userMessage: string): Promise<ChatResponse> {
    try {
      // Agregar mensaje del usuario al historial
      this.conversationHistory.push({
        role: 'user',
        content: userMessage,
      });

      const lowerMessage = userMessage.toLowerCase().trim();

      // Detectar tipo de consulta
      let responseType: 'search' | 'info' | 'greeting' | 'help' = 'search';
      let assistantMessage = '';
      let products: any[] = [];

      // 1. Saludos
      if (this.isGreeting(lowerMessage)) {
        responseType = 'greeting';
        assistantMessage = this.getRandomResponse(this.RESPONSES.greeting);
      }
      // 2. Pedir ayuda
      else if (this.isHelpRequest(lowerMessage)) {
        responseType = 'help';
        assistantMessage = this.RESPONSES.helpText;
      }
      // 3. Preguntas de información
      else if (this.isInfoQuestion(lowerMessage)) {
        responseType = 'info';
        assistantMessage = this.handleInfoQuestion(lowerMessage);
      }
      // 4. Búsqueda de productos (default)
      else {
        responseType = 'search';
        products = await this.searchProducts(lowerMessage);

        if (products.length > 0) {
          assistantMessage = `Encontré ${products.length} camiseta${products.length !== 1 ? 's' : ''} que coinciden 👕`;
        } else {
          assistantMessage = this.getRandomResponse(this.RESPONSES.notFound);
        }
      }

      // Agregar respuesta al historial
      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage,
      });

      return {
        message: assistantMessage,
        products,
        conversationHistory: this.conversationHistory,
        type: responseType,
      };
    } catch (error) {
      console.error('Error en chatbot local:', error);
      throw new Error('No se pudo procesar tu mensaje. Intenta de nuevo.');
    }
  }

  /**
   * Busca productos en el inventario
   */
  private async searchProducts(query: string): Promise<any[]> {
    try {
      const allProducts = await inventoryService.getAllProducts();

      // Palabras clave de la búsqueda
      const keywords = query.split(' ').filter((w) => w.length > 2);

      if (keywords.length === 0) return [];

      // Scoring de productos
      const scored = allProducts
        .map((product: any) => {
          let score = 0;
          const searchText = `${product.name} ${product.description || ''} ${product.category || ''}`.toLowerCase();

          // Puntos por cada keyword que coincida
          keywords.forEach((keyword) => {
            if (searchText.includes(keyword)) {
              score += 10;
            }
          });

          // Bonus si es featured
          if (product.featured) score += 5;

          // Bonus si es disponible
          if (product.stock && product.stock > 0) score += 2;

          return { product, score };
        })
        .filter((item: any) => item.score > 0)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 6) // Máximo 6 productos
        .map((item: any) => item.product);

      return scored;
    } catch (error) {
      console.error('Error buscando productos:', error);
      return [];
    }
  }

  /**
   * Detecta si es un saludo
   */
  private isGreeting(message: string): boolean {
    const greetings = ['hola', 'hi', 'hey', 'buenas', 'buenos días', 'buenas noches'];
    return greetings.some((g) => message.includes(g));
  }

  /**
   * Detecta si pide ayuda
   */
  private isHelpRequest(message: string): boolean {
    const helpKeywords = ['ayuda', 'help', 'cómo funciona', 'que puedo', 'qué puedo', 'comandos'];
    return helpKeywords.some((h) => message.includes(h));
  }

  /**
   * Detecta si es una pregunta de información
   */
  private isInfoQuestion(message: string): boolean {
    return Object.keys(this.RESPONSES.info).some((key) =>
      message.includes(key)
    );
  }

  /**
   * Maneja preguntas de información
   */
  private handleInfoQuestion(message: string): string {
    for (const [key, response] of Object.entries(this.RESPONSES.info)) {
      if (message.includes(key)) {
        return response;
      }
    }
    return 'No tengo información sobre eso. ¿Puedo ayudarte a buscar una camiseta?';
  }

  /**
   * Obtiene una respuesta aleatoria de un array
   */
  private getRandomResponse(responses: string[]): string {
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Limpia el historial
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Obtiene el historial
   */
  getHistory(): ChatMessage[] {
    return this.conversationHistory;
  }

  /**
   * Establece el historial
   */
  setHistory(history: ChatMessage[]): void {
    this.conversationHistory = history;
  }
}

export const localChatbotService = new LocalChatbotService();
