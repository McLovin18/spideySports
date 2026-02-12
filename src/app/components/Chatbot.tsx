'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Form, Button, Card, Spinner, Badge } from 'react-bootstrap';
import { Send, X, RefreshCw } from 'lucide-react';
import styles from './Chatbot.module.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  recommendedProducts?: any[];
  timestamp: Date;
  type?: 'search' | 'info' | 'greeting' | 'help' | 'number' | 'confirmation';
  metadata?: {
    resultCount?: number;
    isNumericAnswer?: boolean;
    numericValue?: number;
    infoType?: string;
  };
}

interface ChatbotProps {
  isOpen?: boolean;
}

export default function Chatbot({ isOpen: initialIsOpen = false }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(initialIsOpen);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasStorageError, setHasStorageError] = useState(false);
  const storageErrorShownRef = useRef(false);

  // Cargar mensajes del localStorage al iniciar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedMessages = localStorage.getItem('chatbot-messages');
        if (savedMessages) {
          try {
            const parsedMessages = JSON.parse(savedMessages);
            setMessages(parsedMessages);
          } catch (parseError) {
            console.error('Error parseando mensajes guardados:', parseError);
            // Si hay error al parsear, limpiar y mostrar mensaje inicial
            localStorage.removeItem('chatbot-messages');
            setMessages([
              {
                id: '1',
                role: 'assistant',
                content: '¡Hola! 👋 Soy el asistente de SpideySports. ¿Qué tipo de camiseta deportiva estás buscando hoy?',
                timestamp: new Date(),
              },
            ]);
          }
        } else {
          setMessages([
            {
              id: '1',
              role: 'assistant',
              content: '¡Hola! 👋 Soy el asistente de SpideySports. ¿Qué tipo de camiseta deportiva estás buscando hoy?',
              timestamp: new Date(),
            },
          ]);
        }
      } catch (error) {
        console.error('Error accediendo al localStorage:', error);
        setMessages([
          {
            id: '1',
            role: 'assistant',
            content: '¡Hola! 👋 Soy el asistente de SpideySports. ¿Qué tipo de camiseta deportiva estás buscando hoy?',
            timestamp: new Date(),
          },
        ]);
      }
      setIsInitialized(true);
    }
  }, []);

  // Guardar mensajes en localStorage cuando cambien
  useEffect(() => {
    if (isInitialized && typeof window !== 'undefined' && !hasStorageError) {
      try {
        localStorage.setItem('chatbot-messages', JSON.stringify(messages));
      } catch (error: any) {
        // Si el localStorage está lleno o hay error, mostrar mensaje SOLO UNA VEZ
        if ((error.name === 'QuotaExceededError' || error.message.includes('QuotaExceededError')) && !storageErrorShownRef.current) {
          storageErrorShownRef.current = true;
          setHasStorageError(true);
          
          // Agregar mensaje de error directamente sin usar setMessages (para evitar bucle)
          const errorMessage: Message = {
            id: `${Date.now()}_storage_error`,
            role: 'assistant',
            content: '⚠️ El chat ha alcanzado su límite de capacidad. Por favor, haz clic en el botón de limpiar (🔄) para borrar el historial y continuar.',
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, errorMessage]);
        }
        console.error('Error guardando mensajes en localStorage:', error);
      }
    }
  }, [messages, isInitialized, hasStorageError]);

  // Auto-scroll al final cuando hay nuevos mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus en input cuando se abre
  useEffect(() => {
    if (isOpen && isInitialized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isInitialized]);

  // Limpiar chat
  const handleClearChat = () => {
    const initialMessage: Message = {
      id: '1',
      role: 'assistant',
      content: '¡Hola! 👋 Soy el asistente de SpideySports. ¿Qué tipo de camiseta deportiva estás buscando hoy?',
      timestamp: new Date(),
    };
    setMessages([initialMessage]);
    setConversationHistory([]);
    setHasStorageError(false);
    storageErrorShownRef.current = false;
    localStorage.setItem('chatbot-messages', JSON.stringify([initialMessage]));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    // Guardar el mensaje antes de limpiar el input
    const messageText = inputValue;

    // Agregar mensaje del usuario
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      // Enviar al API con timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos timeout

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
          conversationHistory,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 413) {
          throw new Error('El historial de chat es muy largo. Por favor, limpia el chat para continuar.');
        }
        throw new Error(`Error del servidor: ${response.status}`);
      }

      const data = await response.json();

      // Agregar respuesta del asistente
      const assistantMessage: Message = {
        id: `${Date.now()}_ai`,
        role: 'assistant',
        content: data.message,
        recommendedProducts: data.products || [],
        timestamp: new Date(),
        type: data.type,
        metadata: data.metadata,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setConversationHistory(data.conversationHistory || []);
      setLoading(false);
    } catch (error: any) {
      console.error('Error enviando mensaje:', error);

      let errorContent = 'Disculpa, tuve un problema. Intenta de nuevo.';
      
      // Detectar tipos específicos de errores
      if (error.name === 'AbortError') {
        errorContent = '⏱️ La solicitud tardó demasiado. Intenta de nuevo o limpia el chat si sigue ocurriendo.';
      } else if (error.message.includes('muy largo')) {
        errorContent = '⚠️ El historial de chat es muy largo. Por favor, haz clic en el botón de limpiar (🔄) para borrar el historial y continuar.';
      } else if (error.message.includes('network') || error.message.includes('NetworkError')) {
        errorContent = '🌐 Error de conexión. Verifica tu conexión a internet e intenta de nuevo.';
      } else if (error.message.includes('JSON')) {
        errorContent = '⚠️ Error al procesar la respuesta. Limpia el chat e intenta de nuevo.';
      }

      const errorMessage: Message = {
        id: `${Date.now()}_error`,
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
      setLoading(false);
    }
  };

  return (
    <div className={styles.chatbotContainer}>
      {/* Botón flotante con imagen y tooltip */}
      {!isOpen && (
        <div className={styles.floatingButtonWrapper}>
          <div className={styles.tooltip}>
            💬 Consulta nuestras camisetas aquí
          </div>
          <button
            className={styles.floatingButton}
            onClick={() => setIsOpen(true)}
            title="Abrir chat"
          >
            <Image
              src="/chatMain.png"
              alt="Chat Robot"
              width={50}
              height={50}
              className={styles.chatImage}
              priority
              unoptimized
            />
          </button>
        </div>
      )}

      {/* Ventana de chat */}
      {isOpen && (
        <div className={styles.chatWindow}>
          {/* Header */}
          <div className={styles.chatHeader}>
            <div className={styles.headerTitle}>
              <span>💬 SpideySports Assistant</span>
            </div>
            <div className={styles.headerActions}>
              <button
                className={styles.iconButton}
                onClick={handleClearChat}
                title="Limpiar chat"
              >
                <RefreshCw size={18} />
              </button>
              <button
                className={styles.iconButton}
                onClick={() => setIsOpen(false)}
                title="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className={styles.messagesContainer}>
            {messages.map((msg) => (
              <div key={msg.id} className={`${styles.message} ${styles[msg.role]}`}>
                <div className={styles.messageContent}>
                  <p>{msg.content}</p>

                  {/* Productos recomendados - Solo si es búsqueda o confirmación */}
                  {msg.recommendedProducts && msg.recommendedProducts.length > 0 && 
                   (msg.type === 'search' || msg.type === 'confirmation') && (
                    <div className={styles.recommendedProducts}>
                      {msg.recommendedProducts.map((product) => (
                        <Card key={product.productId} className={styles.productCard}>
                          {product.images && product.images.length > 0 && (
                            <Card.Img
                              variant="top"
                              src={product.images[0]}
                              alt={product.name}
                              className={styles.productImage}
                            />
                          )}
                          <Card.Body>
                            <Card.Title className={styles.productName}>{product.name}</Card.Title>
                            <div className={styles.productInfo}>
                              <Badge bg="success">${product.price}</Badge>
                              {product.stock > 0 ? (
                                <Badge bg="info">Stock: {product.stock}</Badge>
                              ) : (
                                <Badge bg="danger">Agotado</Badge>
                              )}
                            </div>
                            <a href={`/products/${product.productId}`} className={styles.productLink}>
                              Ver producto →
                            </a>
                          </Card.Body>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className={`${styles.message} ${styles.assistant}`}>
                <div className={styles.messageContent}>
                  <Spinner animation="border" size="sm" role="status">
                    <span className="visually-hidden">Escribiendo...</span>
                  </Spinner>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <Form onSubmit={handleSendMessage} className={styles.chatForm}>
            <Form.Group className={styles.inputGroup}>
              <Form.Control
                ref={inputRef}
                type="text"
                placeholder="Escribe tu pregunta..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={loading}
                className={styles.chatInput}
              />
              <Button
                variant="primary"
                type="submit"
                disabled={loading || !inputValue.trim()}
                className={styles.sendButton}
              >
                <Send size={18} />
              </Button>
            </Form.Group>
          </Form>

          {/* Footer */}
          <div className={styles.chatFooter}>
            <small>Powered by SpideySports AI 🕷️</small>
          </div>
        </div>
      )}
    </div>
  );
}
