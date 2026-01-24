'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Container, Row, Col, Card, Table, Button, Badge, Form, Modal, Alert, InputGroup } from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/adminContext';
import { inventoryService, type ProductInventory } from '../../services/inventoryService';
import NavbarComponent from '../../components/Navbar';
import Sidebar from '../../components/Sidebar';
import TopbarMobile from '../../components/TopbarMobile';
import Footer from '../../components/Footer';
import ProductFormModal from '../../components/ProductFormModal';
import Select from 'react-select';
import { type JerseySizeCode, jerseySizeLabel, JERSEY_SIZE_OPTIONS } from '../../constants/jersey';


// Componente simple de protección local
const SimpleProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useRole();

  if (adminLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="container mt-5">
        <div className="row justify-content-center">
          <div className="col-md-6">
            <div className="alert alert-danger">
              <h4>Acceso Denegado</h4>
              <p>No tienes permisos para acceder a esta página.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default function InventoryManagementPage() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useRole();
  const [products, setProducts] = useState<ProductInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductInventory | null>(null);
  const [stockChange, setStockChange] = useState<number>(0);
  const [selectedSizeCode, setSelectedSizeCode] = useState<JerseySizeCode>(JERSEY_SIZE_OPTIONS[0].code);
  const [actionType, setActionType] = useState<'add' | 'reduce'>('add');
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  // 🔍 Estados para el buscador
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStock, setFilterStock] = useState<'all' | 'inStock' | 'lowStock' | 'outOfStock'>('all');

  const productHasSizeBreakdown = !!(selectedProduct?.sizeStocks && selectedProduct.sizeStocks.length > 0);
  const currentSelectedSizeStock = productHasSizeBreakdown
    ? selectedProduct?.sizeStocks?.find((size) => size.code === selectedSizeCode)
    : undefined;
  const maxStockReduction = productHasSizeBreakdown
    ? currentSelectedSizeStock?.quantity ?? 0
    : selectedProduct?.stock ?? 0;

  useEffect(() => {
    if (user && isAdmin) {
      loadProducts();
    }
  }, [user, isAdmin]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const allProducts = await inventoryService.getAllProducts();
      setProducts(allProducts);
    } catch (error) {
      console.error('Error cargando productos:', error);
      setMessage({type: 'error', text: 'Error al cargar productos'});
    } finally {
      setLoading(false);
    }
  };

  // 🔍 Filtrado de productos
  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    // Filtrar por término de búsqueda
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(product => 
        product.name.toLowerCase().includes(term) ||
        product.productId.toString().includes(term) ||
        product.category?.toLowerCase().includes(term)
      );
    }

    // Filtrar por estado de stock
    switch (filterStock) {
      case 'inStock':
        filtered = filtered.filter(p => p.stock > 5);
        break;
      case 'lowStock':
        filtered = filtered.filter(p => p.stock > 0 && p.stock <= 5);
        break;
      case 'outOfStock':
        filtered = filtered.filter(p => p.stock === 0);
        break;
    }

    return filtered;
  }, [products, searchTerm, filterStock]);

  const handleStockChange = async () => {
    if (!selectedProduct || stockChange === 0) return;

    try {
      const hasSizeConfiguration = selectedProduct.sizeStocks && selectedProduct.sizeStocks.length > 0;
      const sizeArg = hasSizeConfiguration ? selectedSizeCode : undefined;

      let success = false;
      
      if (actionType === 'add') {
        success = await inventoryService.addStock(selectedProduct.productId, Math.abs(stockChange), sizeArg);
      } else if (actionType === 'reduce') {
        success = await inventoryService.reduceStock(selectedProduct.productId, Math.abs(stockChange), sizeArg);
      }

      if (success) {
        setMessage({type: 'success', text: `Stock ${actionType === 'add' ? 'agregado' : 'reducido'} exitosamente`});
        await loadProducts();
        setShowStockModal(false);
        setStockChange(0);
      } else {
        setMessage({type: 'error', text: 'Error al actualizar stock'});
      }
    } catch (error) {
      setMessage({type: 'error', text: 'Error al procesar la acción'});
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este producto? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      const success = await inventoryService.deleteProduct(productId);
      
      if (success) {
        setMessage({type: 'success', text: 'Producto eliminado exitosamente'});
        await loadProducts();
      } else {
        setMessage({type: 'error', text: 'Error al eliminar producto'});
      }
    } catch (error) {
      setMessage({type: 'error', text: 'Error al procesar la acción'});
    }
  };

  const openStockModal = (product: ProductInventory, action: 'add' | 'reduce') => {
    setSelectedProduct(product);
    setActionType(action);
    setStockChange(0);
    const defaultSize = product.sizeStocks && product.sizeStocks.length > 0
      ? product.sizeStocks[0].code
      : JERSEY_SIZE_OPTIONS[0].code;
    setSelectedSizeCode(defaultSize as JerseySizeCode);
    setShowStockModal(true);
  };

  const openProductModal = (product?: ProductInventory) => {
    setSelectedProduct(product || null);
    setShowProductModal(true);
  };

  const handleProductSaved = () => {
    loadProducts();
    setMessage({type: 'success', text: 'Producto guardado exitosamente'});
  };

  const getStockBadgeVariant = (stock: number) => {
    if (stock === 0) return 'danger';
    if (stock <= 5) return 'warning';
    return 'success';
  };

  // 🔍 Función para limpiar búsqueda
  const clearSearch = () => {
    setSearchTerm('');
    setFilterStock('all');
  };

  if (!user || !isAdmin) {
    return (
      <Container className="py-5 text-center">
        <Alert variant="danger">
          <h4>🚫 Acceso Denegado</h4>
          <p>No tienes permisos para acceder a la gestión de inventario.</p>
        </Alert>
      </Container>
    );
  }

  return (
    <SimpleProtectedRoute>
      <div className="d-flex flex-column min-vh-100">
        <TopbarMobile />
        
        <div className="d-flex flex-grow-1">
          <Sidebar />
          
          <main className="flex-grow-1 w-100" style={{ paddingTop: '1rem' }}>
            <Container fluid className="px-2 px-md-4">
              {/* Header */}
              <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
                <div>
                  <h1 className="fw-bold text-dark mb-1">
                    <i className="bi bi-boxes me-2"></i>
                    Gestión de Inventario
                  </h1>
                  <p className="text-muted mb-0">
                    Controla el stock y disponibilidad de productos
                  </p>
                </div>
                <Button className="btn-cosmetic-primary" onClick={() => openProductModal()}>
                  <i className="bi bi-plus-circle me-2"></i>
                  Agregar Producto
                </Button>
              </div>

              {/* Mensaje de estado */}
              {message && (
                <Alert 
                  variant={message.type === 'success' ? 'success' : 'danger'} 
                  dismissible 
                  onClose={() => setMessage(null)}
                >
                  {message.text}
                </Alert>
              )}

              {/* 🔍 Barra de búsqueda y filtros */}
              <Card className="border-0 shadow-sm mb-4">
                <Card.Body>

                  <Row className="g-3">
                    <Col xs={12} md={6}>
                      <InputGroup>
                        <InputGroup.Text>
                          <i className="bi bi-search"></i>
                        </InputGroup.Text>
                        <Form.Control
                          type="text"
                          placeholder="Buscar por nombre, ID o categoría..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                          <Button 
                            variant="outline-secondary" 
                            onClick={() => setSearchTerm('')}
                          >
                            <i className="bi bi-x"></i>
                          </Button>
                        )}
                      </InputGroup>
                    </Col>

                    <Col xs={12} md={4}>
                      <Form.Select
                        value={filterStock}
                        onChange={(e) => setFilterStock(e.target.value as any)}
                        style={{ maxWidth: '100%', minWidth: '100%' }}  // fuerza a usar todo el ancho del contenedor
                      >
                        <option value="all">📦 Todos los productos</option>
                        <option value="inStock">✅ Con stock ({products.filter(p => p.stock > 5).length})</option>
                        <option value="lowStock">⚠️ Stock bajo ({products.filter(p => p.stock > 0 && p.stock <= 5).length})</option>
                        <option value="outOfStock">❌ Sin stock ({products.filter(p => p.stock === 0).length})</option>
                      </Form.Select>
                    </Col>

                    <Col xs={12} md={2}>
                      <Button 
                        variant="outline-secondary" 
                        className="w-100"
                        onClick={clearSearch}
                        disabled={!searchTerm && filterStock === 'all'}
                      >
                        <i className="bi bi-arrow-clockwise me-2"></i>
                        Limpiar
                      </Button>
                    </Col>
                  </Row>

                  {(searchTerm || filterStock !== 'all') && (
                    <div className="mt-3">
                      <small className="text-muted">
                        <i className="bi bi-funnel me-2"></i>
                        Mostrando {filteredProducts.length} de {products.length} productos
                      </small>
                    </div>
                  )}
                </Card.Body>
              </Card>

              {/* Estadísticas rápidas */}
              <Row className="mb-4">
                <Col md={3}>
                  <Card className="text-center border-0 shadow-sm">
                    <Card.Body>
                      <h3 className="fw-bold" style={{ color: "var(--cosmetic-primary)" }}>{products.length}</h3>
                      <p className="text-muted mb-0 small">Total Productos</p>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={3}>
                  <Card className="text-center border-0 shadow-sm">
                    <Card.Body>
                      <h3 className="fw-bold text-success">
                        {products.filter(p => p.stock > 5).length}
                      </h3>
                      <p className="text-muted mb-0 small">Con Stock</p>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={3}>
                  <Card className="text-center border-0 shadow-sm">
                    <Card.Body>
                      <h3 className="fw-bold text-warning">
                        {products.filter(p => p.stock <= 5 && p.stock > 0).length}
                      </h3>
                      <p className="text-muted mb-0 small">Stock Bajo</p>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={3}>
                  <Card className="text-center border-0 shadow-sm">
                    <Card.Body>
                      <h3 className="fw-bold text-danger">
                        {products.filter(p => p.stock === 0).length}
                      </h3>
                      <p className="text-muted mb-0 small">Sin Stock</p>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              {/* Tabla de productos */}
              <Card className="border-0 shadow-sm">
                <Card.Header className="bg-light">
                  <h5 className="mb-0">
                    <i className="bi bi-table me-2"></i>
                    Lista de Productos
                  </h5>
                </Card.Header>
                <Card.Body className="p-0">
                  {loading ? (
                    <div className="text-center py-5">
                      <div className="spinner-border" style={{ color: "var(--cosmetic-primary)" }} role="status">
                        <span className="visually-hidden">Cargando...</span>
                      </div>
                      <p className="mt-3 text-muted">Cargando inventario...</p>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <Table striped hover className="mb-0">
                        <thead className="table-dark">
                          <tr>
                            <th>ID</th>
                            <th>Producto</th>
                            <th>Precio</th>
                            <th>Stock</th>
                            <th>Última Act.</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredProducts.map((product) => (
                            <tr key={product.productId}>
                              <td className="fw-bold">{product.productId}</td>
                              <td>
                                <div className="d-flex align-items-center">
                                  {product.images && product.images.length > 0 && (
                                    <img 
                                      src={product.images[0]} 
                                      alt={product.name}
                                      width="40" 
                                      height="40" 
                                      className="rounded me-2"
                                      style={{ objectFit: 'cover' }}
                                    />
                                  )}
                                  <div>
                                    <div className="fw-bold">{product.name}</div>
                                    {product.category && (
                                      <small className="text-muted">{product.category}</small>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="fw-bold text-success">${product.price.toFixed(2)}</td>
                              <td>
                                <Badge bg={getStockBadgeVariant(product.stock)}>
                                  {product.stock} unidades
                                </Badge>
                              </td>
                              <td>
                                <small className="text-muted">
                                  {new Date(product.lastUpdated).toLocaleDateString()}
                                </small>
                              </td>
                              <td>
                                <div className="d-flex gap-1 flex-wrap">
                                  <Button 
                                    size="sm" 
                                    variant="outline-success"
                                    onClick={() => openStockModal(product, 'add')}
                                    title="Agregar stock"
                                  >
                                    <i className="bi bi-plus"></i>
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline-warning"
                                    onClick={() => openStockModal(product, 'reduce')}
                                    title="Reducir stock"
                                    disabled={product.stock === 0}
                                  >
                                    <i className="bi bi-dash"></i>
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline-primary"
                                    onClick={() => openProductModal(product)}
                                    title="Editar producto"
                                  >
                                    <i className="bi bi-pencil"></i>
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline-danger"
                                    onClick={() => handleDeleteProduct(product.productId)}
                                    title="Eliminar producto"
                                  >
                                    <i className="bi bi-trash"></i>
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {filteredProducts.length === 0 && (
                            <tr>
                              <td colSpan={6} className="text-center py-4">
                                <i className="bi bi-inbox" style={{ fontSize: '3rem', color: 'var(--cosmetic-tertiary-light)' }}></i>
                                <p className="text-muted mt-2 mb-0">
                                  {searchTerm || filterStock !== 'all' 
                                    ? 'No se encontraron productos con los filtros aplicados' 
                                    : 'No hay productos en el inventario'}
                                </p>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </Table>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Container>
          </main>
        </div>
        
        <Footer />
        
        {/* Modal para acciones de stock */}
        <Modal show={showStockModal} onHide={() => setShowStockModal(false)} centered>
          <Modal.Header closeButton>
            <Modal.Title>
              <i className={`bi bi-${actionType === 'add' ? 'plus' : 'dash'}-circle me-2`}></i>
              {actionType === 'add' ? 'Agregar Stock' : 'Reducir Stock'}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {selectedProduct && (
              <div>
                <Alert variant="info">
                  <div className="d-flex align-items-center">
                    {selectedProduct.images && selectedProduct.images.length > 0 && (
                      <img
                        src={selectedProduct.images[0]}
                        alt={selectedProduct.name}
                        width="50"
                        height="50"
                        className="rounded me-3"
                        style={{ objectFit: 'cover' }}
                      />
                    )}
                    <div>
                      <strong>{selectedProduct.name}</strong>
                      <br />
                      {productHasSizeBreakdown ? (
                        <small className="text-muted">
                          Stock total: {selectedProduct.stock} unidades · Talla seleccionada: {jerseySizeLabel(selectedSizeCode)} ({currentSelectedSizeStock?.quantity ?? 0} uds.)
                        </small>
                      ) : (
                        <small className="text-muted">Stock actual: {selectedProduct.stock} unidades</small>
                      )}
                    </div>
                  </div>
                </Alert>

                {productHasSizeBreakdown && (
                  <Form.Group className="mb-3">
                    <Form.Label>Talla que deseas ajustar</Form.Label>
                    <Form.Select
                      value={selectedSizeCode}
                      onChange={(e) => setSelectedSizeCode(e.target.value as JerseySizeCode)}
                    >
                      {selectedProduct.sizeStocks?.map((size) => (
                        <option key={size.code} value={size.code}>
                          {jerseySizeLabel(size.code)} — {size.quantity} unidades en inventario
                        </option>
                      ))}
                    </Form.Select>
                    <Form.Text className="text-muted">
                      Ajustarás el stock de la talla {jerseySizeLabel(selectedSizeCode)}.
                    </Form.Text>
                  </Form.Group>
                )}

                <Form.Group>
                  <Form.Label>
                    <i className={`bi bi-${actionType === 'add' ? 'plus' : 'dash'} me-2`}></i>
                    Cantidad a {actionType === 'add' ? 'agregar' : 'reducir'}:
                  </Form.Label>
                  <Form.Control
                    type="number"
                    min="1"
                    max={actionType === 'reduce' ? maxStockReduction : undefined}
                    value={stockChange}
                    onChange={(e) => setStockChange(parseInt(e.target.value) || 0)}
                    placeholder="Ingresa la cantidad"
                  />
                  {actionType === 'reduce' && stockChange > maxStockReduction && (
                    <Form.Text className="text-danger">
                      No puedes reducir más unidades de las disponibles para esta selección.
                    </Form.Text>
                  )}
                </Form.Group>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowStockModal(false)}>
              <i className="bi bi-x me-2"></i>
              Cancelar
            </Button>
            <Button 
              variant={actionType === 'add' ? 'success' : 'warning'} 
              onClick={handleStockChange}
              disabled={stockChange <= 0 || (actionType === 'reduce' && stockChange > maxStockReduction)}
            >
              <i className={`bi bi-${actionType === 'add' ? 'plus' : 'dash'} me-2`}></i>
              {actionType === 'add' ? 'Agregar Stock' : 'Reducir Stock'}
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Modal para crear/editar producto */}
        <ProductFormModal
          show={showProductModal}
          onHide={() => setShowProductModal(false)}
          product={selectedProduct}
          onProductSaved={handleProductSaved}
          existingProductIds={products.map(p => p.productId)}
        />
      </div>
    </SimpleProtectedRoute>
  );
}