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
}

interface ChatbotProps {
  isOpen?: boolean;
}

export default function Chatbot({ isOpen: initialIsOpen = true }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(initialIsOpen);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '¡Hola! 👋 Soy el asistente de SpideySports. ¿Qué tipo de camiseta deportiva estás buscando hoy?',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll al final cuando hay nuevos mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus en input cuando se abre
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    // Agregar mensaje del usuario
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      // Enviar al API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputValue,
          conversationHistory,
        }),
      });

      if (!response.ok) {
        throw new Error('Error del servidor');
      }

      const data = await response.json();

      // Agregar respuesta del asistente
      const assistantMessage: Message = {
        id: `${Date.now()}_ai`,
        role: 'assistant',
        content: data.message,
        recommendedProducts: data.products || [],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setConversationHistory(data.conversationHistory || []);
    } catch (error) {
      console.error('Error sending message:', error);

      const errorMessage: Message = {
        id: `${Date.now()}_error`,
        role: 'assistant',
        content: 'Disculpa, tuve un problema. Intenta de nuevo.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: '1',
        role: 'assistant',
        content: '¡Hola de nuevo! 👋 ¿En qué puedo ayudarte?',
        timestamp: new Date(),
      },
    ]);
    setConversationHistory([]);
  };

  return (
    <div className={styles.chatbotContainer}>
      {/* Botón flotante con imagen */}
      {!isOpen && (
        <button
          className={styles.floatingButton}
          onClick={() => setIsOpen(true)}
          title="Abrir chat"
        >
          <Image
            src="/chatMain.png"
            alt="Chat"
            width={70}
            height={70}
            className={styles.chatImage}
            priority
          />
        </button>
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

                  {/* Productos recomendados */}
                  {msg.recommendedProducts && msg.recommendedProducts.length > 0 && (
                    <div className={styles.recommendedProducts}>
                      <small className={styles.recommendedLabel}>Productos recomendados:</small>
                      {msg.recommendedProducts.map((product) => (
                        <Card key={product.id} className={styles.productCard}>
                          {product.image && (
                            <Card.Img
                              variant="top"
                              src={product.image}
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
                            <a href={`/producto/${product.id}`} className={styles.productLink}>
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
