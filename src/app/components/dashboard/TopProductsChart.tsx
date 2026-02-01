import React from 'react';
import { Badge, Table } from 'react-bootstrap';
import type { TopProduct } from '../../services/analyticsService';

interface Props {
  data: TopProduct[];
}

export default function TopProductsChart({ data }: Props) {
  if (!data || data.length === 0) {
    return <p className="text-muted">No hay datos disponibles</p>;
  }

  const maxSold = Math.max(...data.map(p => p.totalSold));

  return (
    <div>
      <Table hover responsive className="mb-0">
        <thead className="bg-light">
          <tr>
            <th>#</th>
            <th>Producto</th>
            <th className="text-end">Vendidos</th>
            <th className="text-end">Ingresos</th>
            <th className="text-end">Precio Promedio</th>
          </tr>
        </thead>
        <tbody>
          {data.map((product, idx) => {
            const percentage = (product.totalSold / maxSold) * 100;
            return (
              <tr key={product.id}>
                <td>
                  <Badge bg="primary" className="rounded-circle">{idx + 1}</Badge>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '4px',
                        height: '40px',
                        background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)',
                        borderRadius: '2px',
                      }}
                    />
                    <div>
                      <strong>{product.name}</strong>
                      <div className="progress mt-1" style={{ height: '4px' }}>
                        <div
                          className="progress-bar"
                          style={{
                            width: `${percentage}%`,
                            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </td>
                <td className="text-end">
                  <Badge bg="info">{product.totalSold}</Badge>
                </td>
                <td className="text-end font-weight-bold">
                  ${product.totalRevenue.toLocaleString('es-ES')}
                </td>
                <td className="text-end">
                  ${product.averagePrice.toLocaleString('es-ES')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
