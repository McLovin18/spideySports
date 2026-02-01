import { NextRequest, NextResponse } from 'next/server';
import { localChatbotService } from '@/app/services/chatbotService';

/**
 * POST /api/chat
 * Recibe un mensaje del usuario y retorna respuesta del chatbot con productos
 * No requiere API Key - es completamente local
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationHistory } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message es requerido y debe ser string' },
        { status: 400 }
      );
    }

    // Si hay historial previo, restaurarlo
    if (conversationHistory && Array.isArray(conversationHistory)) {
      localChatbotService.setHistory(conversationHistory);
    }

    // Procesar mensaje
    const response = await localChatbotService.processMessage(message);

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error en API /chat:', error);
    return NextResponse.json(
      { error: 'No se pudo procesar el mensaje. Intenta de nuevo.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/chat
 * Health check del servicio
 */
export async function GET() {
  return NextResponse.json(
    { status: 'Chatbot local service is running', timestamp: new Date().toISOString() },
    { status: 200 }
  );
}
