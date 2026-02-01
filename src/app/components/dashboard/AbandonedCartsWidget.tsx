import React, { useState, useEffect } from 'react';
import { Table, Badge, Pagination, Button } from 'react-bootstrap';
import type { AbandonedCartStats } from '../../services/abandonedCartService';
import { abandonedCartService, type AbandonedCart } from '../../services/abandonedCartService';

interface Props {
  stats: AbandonedCartStats | null;
}

export default function AbandonedCartsWidget({ stats }: Props) {
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    loadAbandonedCarts();
  }, []);

  const loadAbandonedCarts = async () => {
    try {
      setLoading(true);
      const allCarts = await abandonedCartService.getAllAbandonedCarts();
      setCarts(allCarts);
    } catch (error) {
      console.error('Error loading abandoned carts:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!stats) {
    return <p className="text-muted">No hay datos disponibles</p>;
  }

  const totalPages = Math.ceil(carts.length / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedCarts = carts.slice(startIdx, startIdx + itemsPerPage);

  return (
    <div>
      {/* Estadísticas principales */}
      <div className="row mb-4">
        <div className="col-md-3">
          <div className="p-3 bg-warning bg-opacity-10 rounded">
            <h5 className="text-warning mb-2">🛒 Carritos Abandonados</h5>
            <h3 className="mb-0">{stats.totalAbandoned}</h3>
          </div>
        </div>
        <div className="col-md-3">
          <div className="p-3 bg-info bg-opacity-10 rounded">
            <h5 className="text-info mb-2">💰 Valor Total</h5>
            <h3 className="mb-0">${stats.totalValue.toLocaleString('es-ES')}</h3>
          </div>
        </div>
        <div className="col-md-3">
          <div className="p-3 bg-secondary bg-opacity-10 rounded">
            <h5 className="text-secondary mb-2">📊 Valor Promedio</h5>
            <h3 className="mb-0">${stats.averageCartValue.toLocaleString('es-ES')}</h3>
          </div>
        </div>
        <div className="col-md-3">
          <div className="p-3 bg-success bg-opacity-10 rounded">
            <h5 className="text-success mb-2">📈 Tasa Recuperación</h5>
            <h3 className="mb-0">{stats.recoveryRate}%</h3>
          </div>
        </div>
      </div>

      {/* Tabla de carritos */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-light d-flex justify-content-between align-items-center">
          <h6 className="mb-0">Listado de Carritos Abandonados</h6>
          <Button 
            variant="sm" 
            onClick={loadAbandonedCarts}
            disabled={loading}
            size="sm"
          >
            🔄 Actualizar
          </Button>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <p className="text-muted p-3">Cargando...</p>
          ) : carts.length === 0 ? (
            <p className="text-muted p-3 mb-0">No hay carritos abandonados</p>
          ) : (
            <>
              <Table hover responsive className="mb-0">
                <thead className="bg-light">
                  <tr>
                    <th>Usuario</th>
                    <th className="text-end">Items</th>
                    <th className="text-end">Valor</th>
                    <th>Abandonado</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCarts.map(cart => (
                    <tr key={cart.userId}>
                      <td>
                        <div>
                          <strong>{cart.userName || 'Guest'}</strong>
                          <br />
                          <small className="text-muted">{cart.userEmail}</small>
                        </div>
                      </td>
                      <td className="text-end">
                        <Badge bg="secondary">{cart.cartSize}</Badge>
                      </td>
                      <td className="text-end font-weight-bold">
                        ${cart.cartTotal.toLocaleString('es-ES')}
                      </td>
                      <td>
                        <small className="text-muted">
                          {new Date(cart.abandonedAt).toLocaleDateString('es-ES')} {' '}
                          {new Date(cart.abandonedAt).toLocaleTimeString('es-ES', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </small>
                      </td>
                      <td>
                        {cart.dismissed ? (
                          <Badge bg="secondary">Visto</Badge>
                        ) : (
                          <Badge bg="warning">Nuevo</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="p-3 border-top">
                  <Pagination size="sm" className="mb-0">
                    <Pagination.Prev 
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    />
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = i + 1;
                      return (
                        <Pagination.Item
                          key={pageNum}
                          active={pageNum === currentPage}
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Pagination.Item>
                      );
                    })}
                    {totalPages > 5 && <Pagination.Ellipsis disabled />}
                    <Pagination.Next
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                    />
                  </Pagination>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="alert alert-info mt-4" role="alert">
        <strong>💡 Oportunidad de Recuperación:</strong>
        <p className="mb-0 mt-2">
          Tienes <strong>${stats.totalValue.toLocaleString('es-ES')}</strong> en ingresos potenciales de {stats.totalAbandoned} carritos abandonados.
          Considera implementar estrategias de retargeting o descuentos especiales.
        </p>
      </div>
    </div>
  );
}
