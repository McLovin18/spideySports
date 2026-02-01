import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Spinner, Badge } from 'react-bootstrap';
import Link from 'next/link';
import Image from 'next/image';
import { recommendationEngine, type Product } from '../services/recommendationService';

interface Props {
  title?: string;
  limit?: number;
}

export default function SmartRecommendations({ title = '💡 Recomendaciones para Ti', limit = 4 }: Props) {
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = () => {
    try {
      setLoading(true);
      // Obtener productos destacados como recomendaciones
      const recommended = recommendationEngine.getPopularProducts(limit);
      setRecommendations(recommended);
    } catch (error) {
      console.error('Error loading recommendations:', error);
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <section className="py-5 bg-light">
      <Container>
        <div className="mb-4">
          <h2 className="fw-bold text-cosmetic-tertiary mb-2">{title}</h2>
          <p className="text-muted">Basado en lo más vendido y popular en nuestros clientes</p>
        </div>

        <Row className="g-4">
          {recommendations.map((product) => (
            <Col key={product.id} xs={12} sm={6} md={3} className="mb-3">
              <Card className="h-100 border-0 shadow-sm overflow-hidden transition-all" 
                    style={{ cursor: 'pointer', transition: 'transform 0.3s' }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                    }}>
                
                {/* Imagen */}
                <div style={{ position: 'relative', height: '250px', overflow: 'hidden' }}>
                  <Image
                    src={product.images?.[0] || '/placeholder.jpg'}
                    alt={product.name}
                    fill
                    style={{ objectFit: 'cover' }}
                    className="card-img-top"
                  />
                  <Badge bg="danger" style={{ position: 'absolute', top: '10px', right: '10px' }}>
                    ⭐ Popular
                  </Badge>
                </div>

                {/* Contenido */}
                <Card.Body className="d-flex flex-column">
                  <Card.Title className="text-truncate">{product.name}</Card.Title>
                  
                  <p className="text-muted small mb-2">
                    {product.category}
                  </p>

                  <div className="mt-auto">
                    <h5 className="text-cosmetic-primary fw-bold mb-3">
                      ${product.price.toLocaleString('es-ES')}
                    </h5>

                    <Link href={`/products/${product.id}`} className="btn btn-cosmetic-primary btn-sm w-100 rounded-1">
                      Ver Producto
                    </Link>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      </Container>
    </section>
  );
}
