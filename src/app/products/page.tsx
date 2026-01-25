'use client';

import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Form, Pagination, Badge, Modal, Accordion, Spinner } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Sidebar from '../components/Sidebar';
import TopbarMobile from '../components/TopbarMobile';
import Footer from "../components/Footer";
import { useProducts } from '../hooks/useProducts';
import { Dr_Sugiyama } from 'next/font/google';
import { getSeasonalDiscountConfig, type SeasonalDiscountConfig, isSeasonalConfigActiveNow } from '../services/seasonalDiscountService';

const drSugiyama = Dr_Sugiyama({
  weight: '400', // Dr Sugiyama solo tiene un peso disponible
  subsets: ['latin'],
});


const ProductsPage = () => {
  const { user } = useAuth();
  const { products, loading: productsLoading } = useProducts();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [seasonalConfig, setSeasonalConfig] = useState<SeasonalDiscountConfig | null>(null);
  const [loadingSeasonal, setLoadingSeasonal] = useState(false);
  const router = useRouter();

  // Función para manejar click en tarjeta de producto
  const handleCardClick = (productId: number) => {
    router.push(`/products/${productId}`);
  };

  // Productos por página responsivo: 24 en desktop (6 filas x 4 productos), 6 en mobile (6 filas x 1 producto)
  const productsPerPage = isMobile ? 6 : 24;

  // Filtrar productos por búsqueda, beneficios y disponibilidad
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBenefit = selectedBenefits.length === 0 || selectedBenefits.some(benefit => 
      product.details?.some(detail => detail.toLowerCase().includes(benefit.toLowerCase()))
    );
    const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(product.category || '');
    // Usar directamente la propiedad inStock del producto para mejor rendimiento
    const isAvailable = product.inStock !== false;
    
    return matchesSearch && matchesBenefit && matchesCategory && isAvailable;
  });

  // Calcular productos para la página actual después del filtrado
  const indexOfLastProduct = currentPage * productsPerPage;
  const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
  const currentProducts = filteredProducts.slice(indexOfFirstProduct, indexOfLastProduct);

  // Calcular número total de páginas
  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);

  // Resetear a página 1 cuando cambien los filtros
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedBenefits, selectedCategories]);

  // Detectar tamaño de pantalla para paginación responsiva
  React.useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint de Bootstrap
    };

    // Verificar al cargar la página
    checkIsMobile();

    // Escuchar cambios en el tamaño de ventana
    window.addEventListener('resize', checkIsMobile);

    // Limpiar el listener al desmontar
    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);

  // Resetear página cuando cambie el modo mobile/desktop
  React.useEffect(() => {
    setCurrentPage(1);
  }, [isMobile]);

  // Cargar configuración pública de descuentos de temporada
  useEffect(() => {
    const loadSeasonal = async () => {
      try {
        setLoadingSeasonal(true);
        const config = await getSeasonalDiscountConfig();
        setSeasonalConfig(config);
      } catch (err) {
        console.error('Error cargando configuración de descuentos de temporada en catálogo:', err);
      } finally {
        setLoadingSeasonal(false);
      }
    };

    loadSeasonal();
  }, []);

  // Obtener todos los beneficios únicos disponibles de los detalles de productos
  const availableBenefits = [...new Set(
    products.flatMap(product => 
      product.details?.flatMap(detail => {
        const keywords = ['hidratante', 'anti-edad', 'nutritivo', 'protección', 'vitamina', 'natural', 'orgánico', 'matificante'];
        return keywords.filter(keyword => detail.toLowerCase().includes(keyword));
      }) || []
    )
  )].sort();
  
  // Nuevo: categorías únicas reales desde los productos
  const availableCategories = [...new Set(
    products
      .map(product => product.category)
      .filter((cat): cat is string => !!cat)
  )].sort();

  // Mapa de descuentos por producto activo para la campaña actual
  const discountMap = React.useMemo(() => {
    const map = new Map<number, { discountPercent: number; discountedPrice: number }>();

    if (loadingSeasonal || !seasonalConfig || !seasonalConfig.products || seasonalConfig.products.length === 0) {
      return map;
    }

    if (!isSeasonalConfigActiveNow(seasonalConfig)) {
      return map;
    }

    const productById = new Map<number, (typeof products)[number]>();
    products.forEach((p) => {
      productById.set(p.id, p);
    });

    seasonalConfig.products.forEach((item) => {
      const base = productById.get(item.productId);
      if (!base) return;

      const discountPercent = item.discountPercent;
      if (!discountPercent || discountPercent <= 0) return;

      const discountedPrice = Math.max(0, base.price * (1 - discountPercent / 100));
      map.set(item.productId, { discountPercent, discountedPrice });
    });

    return map;
  }, [loadingSeasonal, seasonalConfig, products]);

  // Manejar selección de beneficios
  const handleBenefitToggle = (benefit: string) => {
    setSelectedBenefits(prev => 
      prev.includes(benefit) 
        ? prev.filter(b => b !== benefit)
        : [...prev, benefit]
    );
  };

  // Manejar selección de categorías
  const handleCategoryToggle = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  // Limpiar filtros
  const clearFilters = () => {
    setSelectedBenefits([]);
    setSelectedCategories([]);
  };

  // Cambiar página
  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  // Obtener categorías únicas
  const categories = [...new Set(products.map(product => product.category))];

  return (
    <div className="d-flex flex-column min-vh-100">
      {/* Eliminar <NavbarComponent /> de aquí, ya que el layout global ya lo incluye */}
      
      {/* Topbar móvil - fuera del flujo flex para que no ocupe espacio vertical */}
      {user && <TopbarMobile />}
      
      <div className="d-flex flex-grow-1">
        {/* Sidebar desktop - solo se muestra en pantallas grandes */}
        {user && <Sidebar />}
        
        <main className="flex-grow-1 w-100" style={{ backgroundColor: "var(--cosmetic-secondary)" }}>
          <Container className="py-5 py-lg-5 py-md-2 py-sm-2">
            <h1 className={`${drSugiyama.className} fw-bold text-center mb-5`} style={{fontSize: "2.5rem", color: "var(--cosmetic-tertiary)" }}>Catálogo de Productos</h1>

            {/* Barra de búsqueda con filtros */}
            <div className="d-flex justify-content-center mb-4">
              <div className="w-100" style={{ maxWidth: 600 }}>
                <div className="d-flex gap-2">
                  {/* Barra de búsqueda */}
                  <div className="flex-grow-1">
                    <div className="input-group">
                      <Form.Control
                        type="text"
                        placeholder="Buscar productos por nombre..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="rounded-start-pill"
                      />
                      <span className="input-group-text bg-white border-0 rounded-end-pill">
                        <i className="bi bi-search"></i>
                      </span>
                    </div>
                  </div>
                  
                  {/* Botón de filtros */}
                  <Button
                    onClick={() => setShowFilters(true)}
                    className="rounded-pill px-3 d-flex align-items-center btn-cosmetic-primary"
                    style={{ minWidth: 'auto', whiteSpace: 'nowrap' }}
                  >
                    <i className="bi bi-funnel me-2"></i>
                    <span className="d-none d-sm-inline">Filtros</span>
                    {(selectedBenefits.length > 0 || selectedCategories.length > 0) && (
                      <Badge className="ms-2 rounded-circle badge-cosmetic-accent" style={{ fontSize: '0.6rem' }}>
                        {selectedBenefits.length + selectedCategories.length}
                      </Badge>
                    )}
                  </Button>
                </div>
                
                {/* Filtros activos */}
                {(selectedBenefits.length > 0 || selectedCategories.length > 0) && (
                  <div className="mt-2 d-flex flex-wrap gap-1 align-items-center">
                    <small className="text-muted me-2">Filtros activos:</small>
                    {selectedBenefits.map(benefit => (
                      <Badge 
                        key={benefit} 
                        className="d-flex align-items-center badge-cosmetic-primary"
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleBenefitToggle(benefit)}
                      >
                        {benefit} <i className="bi bi-x ms-1"></i>
                      </Badge>
                    ))}
                    {selectedCategories.map(category => (
                      <Badge 
                        key={category} 
                        className="d-flex align-items-center badge-cosmetic-accent"
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleCategoryToggle(category)}
                      >
                        {category} <i className="bi bi-x ms-1"></i>
                      </Badge>
                    ))}
                    <Button
                      variant="link"
                      size="sm"
                      onClick={clearFilters}
                      className="text-decoration-none p-0 ms-1"
                    >
                      <small>Limpiar todo</small>
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <Row className="g-4 products-container">
              {productsLoading ? (
                <Col xs={12} className="text-center py-5">
                  <Spinner animation="border" style={{ color: "var(--cosmetic-primary)" }} />
                  <h4 className="mt-3 text-muted">Cargando productos...</h4>
                  <p className="text-muted">Obteniendo productos del inventario</p>
                </Col>
              ) : filteredProducts.length === 0 ? (
                <Col xs={12} className="text-center py-5">
                  <i className="bi bi-emoji-frown" style={{ fontSize: '2.5rem', color: '#888' }}></i>
                  <h4 className="mt-3 text-muted">No se encontraron productos</h4>
                  <p className="text-muted">Intenta ajustar los filtros de búsqueda</p>
                </Col>
              ) : (
                currentProducts.map((product) => {
                  const discountInfo = discountMap.get(product.id);

                  return (
                  <Col key={product.id} xs={12} sm={6} lg={3}>
                    <Card 
                      className="h-100 border-0 shadow-sm"
                      style={{ 
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        transform: 'scale(1)'
                      }}
                      onClick={() => handleCardClick(product.id)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.02)';
                        e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
                      }}
                    >
                      <div
                        className="position-relative bg-cosmetic-secondary product-image-background"
                        style={{
                          width: 'auto',
                          height: '300px',
                          margin: '0 auto',
                          background: 'rgba(5, 44, 51, 0.92) !important',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '1rem 1rem 0 0',
                          overflow: 'hidden'
                        }}
                      >
                        {discountInfo && (
                          <div
                            className="position-absolute"
                            style={{
                              top: '0.5rem',
                              right: '0.5rem',
                              transform: 'rotate(8deg)',
                              backgroundColor: '#e53935',
                              color: '#fff',
                              padding: '0.45rem 1.7rem',
                              borderRadius: '0.7rem',
                              boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              zIndex: 2
                            }}
                          >
                            <span
                              style={{
                                fontSize: '1.3rem',
                                fontWeight: 800,
                                lineHeight: 1
                              }}
                            >
                              -{discountInfo.discountPercent}%
                            </span>
                            <span
                              style={{
                                fontSize: '0.8rem',
                                letterSpacing: '0.12em',
                                fontWeight: 600
                              }}
                            >
                              OFF
                            </span>
                          </div>
                        )}
                        {product.images && product.images[0] && (
                          <Image
                            src={product.images[0]}
                            alt={product.name}
                            width={200}
                            height={300}
                            style={{
                              objectFit: 'contain',
                              maxWidth: '100%',
                              maxHeight: '100%',
                              margin: '0 auto'
                            }}
                          />
                        )}
                      </div>
                      <Card.Body className="d-flex flex-column justify-content-between">
                        <div>
                          <Card.Title className="fw-bold mb-2" style={{ color: "var(--cosmetic-tertiary)" }}>{product.name}</Card.Title>

                          <Card.Text className="fw-bold fs-5 mb-0" style={{ color: "var(--cosmetic-primary)" }}>
                            {discountInfo ? (
                              <>
                                <span
                                  style={{
                                    textDecoration: 'line-through',
                                    color: '#888',
                                    fontSize: '0.9rem',
                                    marginRight: '0.5rem'
                                  }}
                                >
                                  ${product.price.toFixed(2)}
                                </span>
                                <span style={{ fontSize: '1.15rem' }}>
                                  ${discountInfo.discountedPrice.toFixed(2)}
                                </span>
                              </>
                            ) : (
                              <span style={{ fontSize: '1.1rem' }}>${product.price.toFixed(2)}</span>
                            )}
                          </Card.Text>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                );
                })
              )}
            </Row>

            {/* Información de paginación y controles */}
            {filteredProducts.length > 0 && (
              <div className="mt-5">
                {/* Información de resultados */}
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div className="text-muted">
                    Mostrando {indexOfFirstProduct + 1}-{Math.min(indexOfLastProduct, filteredProducts.length)} de {filteredProducts.length} productos
                    <div className="small">
                      {isMobile ? '6 filas (1 producto por fila)' : '6 filas (4 productos por fila)'}
                    </div>
                  </div>
                  <div className="text-muted">
                    Página {currentPage} de {totalPages}
                  </div>
                </div>

                {/* Navegación de páginas */}
                {totalPages > 1 && (
                  <div className="d-flex justify-content-center">
                    <Pagination className="mb-0 pagination-cosmetic">
                      {/* Botón Primera página */}
                      <Pagination.First 
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        title="Primera página"
                      >
                        <i className="bi bi-chevron-double-left"></i>
                        {!isMobile && <span className="ms-1">Primero</span>}
                      </Pagination.First>
                      
                      {/* Botón Página anterior */}
                      <Pagination.Prev 
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        title="Página anterior"
                      >
                        <i className="bi bi-chevron-left"></i>
                        {!isMobile && <span className="ms-1">Anterior</span>}
                      </Pagination.Prev>

                      {/* Páginas numeradas */}
                      {(() => {
                        const items = [];
                        // Mostrar la misma cantidad de páginas en móvil y desktop
                        const startPage = Math.max(1, currentPage - 2);
                        const endPage = Math.min(totalPages, currentPage + 2);

                        // Mostrar página 1 si no está en el rango visible
                        if (startPage > 1) {
                          items.push(
                            <Pagination.Item key={1} onClick={() => setCurrentPage(1)}>
                              1
                            </Pagination.Item>
                          );
                          if (startPage > 2) {
                            items.push(<Pagination.Ellipsis key="start-ellipsis" />);
                          }
                        }

                        // Páginas en el rango visible
                        for (let page = startPage; page <= endPage; page++) {
                          items.push(
                            <Pagination.Item

                              key={page}
                              active={page === currentPage}
                              onClick={() => setCurrentPage(page)}
                            >
                              {page}
                            </Pagination.Item>
                          );
                        }

                        // Mostrar última página si no está en el rango visible
                        if (endPage < totalPages) {
                          if (endPage < totalPages - 1) {
                            items.push(<Pagination.Ellipsis key="end-ellipsis" />);
                          }
                          items.push(
                            <Pagination.Item key={totalPages} onClick={() => setCurrentPage(totalPages)}>
                              {totalPages}
                            </Pagination.Item>
                          );
                        }

                        return items;
                      })()}

                      {/* Botón Página siguiente */}
                      <Pagination.Next 
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        title="Página siguiente"
                      >
                        {!isMobile && <span className="me-1">Siguiente</span>}
                        <i className="bi bi-chevron-right"></i>
                      </Pagination.Next>
                      
                      {/* Botón Última página */}
                      <Pagination.Last 
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        title="Última página"
                      >
                        {!isMobile && <span className="me-1">Último</span>}
                        <i className="bi bi-chevron-double-right"></i>
                      </Pagination.Last>
                    </Pagination>
                  </div>
                )}
              </div>
            )}
          </Container>
        </main>
      </div>

      {/* Modal de Filtros */}
      <Modal 
        show={showFilters} 
        onHide={() => setShowFilters(false)} 
        centered
        size="lg"
        fullscreen="sm-down"
      >
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="d-flex align-items-center">
            <i className="bi bi-funnel-fill me-2" style={{ color: "var(--cosmetic-primary)" }}></i>
            Filtrar Productos
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-0">
          <Row>
            {/* Filtro por Beneficios */}
            <Col md={6} className="mb-4">
              <h6 className="fw-bold mb-3">
                <i className="bi bi-heart me-2 text-danger"></i>
                Beneficios
              </h6>
              <div className="d-flex flex-wrap gap-2">
                {availableBenefits.map(benefit => (
                  <div
                    key={benefit}
                    className={`badge ${
                      selectedBenefits.includes(benefit) 
                        ? 'badge-cosmetic-primary text-white' 
                        : 'bg-light text-dark border'
                    } p-2 fs-6`}
                    style={{ 
                      cursor: 'pointer',
                      minWidth: '80px',
                      borderRadius: '0.5rem',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={() => handleBenefitToggle(benefit)}
                  >
                    {benefit}
                  </div>
                ))}
              </div>
              {selectedBenefits.length > 0 && (
                <div className="mt-2">
                  <small className="text-muted">
                    {selectedBenefits.length} beneficio{selectedBenefits.length !== 1 ? 's' : ''} seleccionado{selectedBenefits.length !== 1 ? 's' : ''}
                  </small>
                </div>
              )}
            </Col>

            {/* Filtro por Categoría (reemplaza “Tipos Premium”) */}
            <Col md={6} className="mb-4">
              <h6 className="fw-bold mb-3">
                <i className="bi bi-tags me-2 text-primary"></i>
                Categorías
              </h6>
              <div className="d-flex flex-wrap gap-2">
                {availableCategories.map(category => (
                  <div
                    key={category}
                    className={`badge ${
                      selectedCategories.includes(category) 
                        ? 'badge-cosmetic-accent text-white' 
                        : 'bg-light text-dark border'
                    } p-2 fs-6`}
                    style={{ 
                      cursor: 'pointer',
                      borderRadius: '0.5rem',
                      transition: 'all 0.2s ease',
                      maxWidth: '150px'
                    }}
                    onClick={() => handleCategoryToggle(category)}
                    title={category}
                  >
                    <span className="text-truncate">{category}</span>
                  </div>
                ))}
              </div>
              {selectedCategories.length > 0 && (
                <div className="mt-2">
                  <small className="text-muted">
                    {selectedCategories.length} categor{selectedCategories.length === 1 ? 'ía' : 'ías'} seleccionada
                    {selectedCategories.length !== 1 ? 's' : ''}
                  </small>
                </div>
              )}
            </Col>
          </Row>

          {/* Resumen de filtros */}
          <div className="bg-light p-3 rounded">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <strong>Productos encontrados: {filteredProducts.length}</strong>
                <div className="small text-muted">
                  Total de productos: {products.length}
                </div>
              </div>
              <Button
                className='btn-profile-secondary'
                size="sm"
                onClick={clearFilters}
                disabled={selectedBenefits.length === 0 && selectedCategories.length === 0}
              >
                <i className="bi bi-arrow-clockwise me-1"></i>
                Limpiar Filtros
              </Button>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer className="border-0 pt-0">
          <Button className='btn-profile' onClick={() => setShowFilters(false)}>
            <i className=" bi bi-x-circle me-1"></i>
            Cancelar
          </Button>
          <Button className="btn-cosmetic-primary" onClick={() => setShowFilters(false)}>
            <i className="bi bi-check-circle me-1"></i>
            Aplicar Filtros ({filteredProducts.length})
          </Button>
        </Modal.Footer>
      </Modal>
      
      <Footer/>
      
    </div>
  );
};

export default ProductsPage;