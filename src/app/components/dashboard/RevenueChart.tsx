import React from 'react';
import type { WeeklyRevenue } from '../../services/analyticsService';

interface Props {
  data: WeeklyRevenue[];
}

export default function RevenueChart({ data }: Props) {
  if (!data || data.length === 0) {
    return <p className="text-muted">No hay datos disponibles</p>;
  }

  // Obtener máximo ingresos para escala
  const maxRevenue = Math.max(...data.map(d => d.revenue));
  const chartHeight = 200;

  return (
    <div className="d-flex flex-column">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: `${chartHeight}px` }}>
        {data.map((week, idx) => {
          const height = (week.revenue / maxRevenue) * 100;
          return (
            <div key={idx} className="flex-grow-1" title={`${week.week}: $${week.revenue.toLocaleString('es-ES')}`}>
              <div
                style={{
                  height: `${height}%`,
                  background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: '4px 4px 0 0',
                  minHeight: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.opacity = '0.8';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.opacity = '1';
                }}
              />
              <small className="text-muted d-block text-center mt-2">
                {new Date(week.startDate).toLocaleDateString('es-ES', { month: 'short', day: '2-digit' })}
              </small>
            </div>
          );
        })}
      </div>
      
      <div className="mt-4 p-3 bg-light rounded">
        <div className="row">
          <div className="col-md-6">
            <small className="text-muted">Ingreso Total (últimas 12 semanas)</small>
            <h5>${data.reduce((sum, w) => sum + w.revenue, 0).toLocaleString('es-ES')}</h5>
          </div>
          <div className="col-md-6">
            <small className="text-muted">Promedio por Semana</small>
            <h5>${(data.reduce((sum, w) => sum + w.revenue, 0) / data.length).toLocaleString('es-ES', { maximumFractionDigits: 0 })}</h5>
          </div>
        </div>
      </div>
    </div>
  );
}
