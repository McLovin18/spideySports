import React from 'react';
import { Badge, Table } from 'react-bootstrap';
import type { ProductVelocity } from '../../services/analyticsService';

interface Props {
  data: ProductVelocity[];
}

export default function InventoryAnalysisChart({ data }: Props) {
  if (!data || data.length === 0) {
    return <p className="text-muted">No hay datos disponibles</p>;
  }

  const fastProducts = data.filter(p => p.velocity === 'fast');
  const mediumProducts = data.filter(p => p.velocity === 'medium');
  const slowProducts = data.filter(p => p.velocity === 'slow');

  return (
    <div>
      <div className="row mb-4">
        <div className="col-md-4">
          <div className="p-3 bg-success bg-opacity-10 rounded">
            <h5 className="text-success mb-2">🚀 Rápidos</h5>
            <p className="mb-0">{fastProducts.length} productos</p>
            <small className="text-muted">({fastProducts.length} unidades en 30 días)</small>
          </div>
        </div>
        <div className="col-md-4">
          <div className="p-3 bg-warning bg-opacity-10 rounded">
            <h5 className="text-warning mb-2">⚡ Medios</h5>
            <p className="mb-0">{mediumProducts.length} productos</p>
            <small className="text-muted">({mediumProducts.reduce((sum, p) => sum + p.soldLast30Days, 0)} unidades en 30 días)</small>
          </div>
        </div>
        <div className="col-md-4">
          <div className="p-3 bg-danger bg-opacity-10 rounded">
            <h5 className="text-danger mb-2">🐌 Lentos</h5>
            <p className="mb-0">{slowProducts.length} productos</p>
            <small className="text-muted">Revisar estrategia de inventario</small>
          </div>
        </div>
      </div>

      <div className="row">
        {/* Rápidos */}
        <div className="col-md-6 mb-4">
          <h6 className="text-success mb-3">Productos de Rápido Movimiento</h6>
          <Table size="sm" hover className="mb-0">
            <thead className="bg-light">
              <tr>
                <th>Producto</th>
                <th className="text-end">30 días</th>
                <th className="text-end">90 días</th>
              </tr>
            </thead>
            <tbody>
              {fastProducts.map(product => (
                <tr key={product.productId}>
                  <td>{product.name}</td>
                  <td className="text-end">
                    <Badge bg="success">{product.soldLast30Days}</Badge>
                  </td>
                  <td className="text-end">
                    <Badge bg="info">{product.soldLast90Days}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>

        {/* Lentos */}
        <div className="col-md-6 mb-4">
          <h6 className="text-danger mb-3">Productos de Movimiento Lento</h6>
          <Table size="sm" hover className="mb-0">
            <thead className="bg-light">
              <tr>
                <th>Producto</th>
                <th className="text-end">30 días</th>
                <th className="text-end">90 días</th>
              </tr>
            </thead>
            <tbody>
              {slowProducts.slice(0, 5).map(product => (
                <tr key={product.productId}>
                  <td>{product.name}</td>
                  <td className="text-end">
                    <Badge bg="secondary">{product.soldLast30Days}</Badge>
                  </td>
                  <td className="text-end">
                    <Badge bg="info">{product.soldLast90Days}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {slowProducts.length > 5 && (
            <small className="text-muted">y {slowProducts.length - 5} más...</small>
          )}
        </div>
      </div>

      <div className="alert alert-info mt-4" role="alert">
        <strong>💡 Recomendaciones:</strong>
        <ul className="mb-0 mt-2">
          <li>Aumenta inventario de productos rápidos ({fastProducts.length})</li>
          <li>Considera promociones para productos lentos ({slowProducts.length})</li>
          <li>Revisa precios o descripción de productos con baja rotación</li>
        </ul>
      </div>
    </div>
  );
}
