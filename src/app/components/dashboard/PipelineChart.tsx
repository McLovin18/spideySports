import React from 'react';
import { ProgressBar, Badge } from 'react-bootstrap';
import type { SalesPipeline } from '../../services/pipelineService';

interface Props {
  pipeline: SalesPipeline | null;
}

export default function PipelineChart({ pipeline }: Props) {
  if (!pipeline) {
    return <p className="text-muted">No hay datos disponibles</p>;
  }

  const stages = [
    {
      name: 'Prospects',
      count: pipeline.prospects.count,
      description: 'Visitantes potenciales',
      color: '#6c757d',
      percentage: pipeline.totalFunnel > 0 
        ? Math.round((pipeline.prospects.count / pipeline.totalFunnel) * 100) 
        : 0,
    },
    {
      name: 'Leads',
      count: pipeline.leads.count,
      description: 'Carritos abandonados con items',
      color: '#ffc107',
      percentage: pipeline.totalFunnel > 0
        ? Math.round((pipeline.leads.count / pipeline.totalFunnel) * 100)
        : 0,
      conversionRate: pipeline.prospects.conversionRate || 0,
    },
    {
      name: 'Clientes',
      count: pipeline.customers.count,
      description: 'Compras realizadas',
      color: '#28a745',
      percentage: pipeline.totalFunnel > 0
        ? Math.round((pipeline.customers.count / pipeline.totalFunnel) * 100)
        : 0,
      conversionRate: pipeline.leads.conversionRate || 0,
      value: pipeline.customers.value,
    },
  ];

  return (
    <div>
      {/* Vista de Funnel */}
      <div className="mb-5">
        <h5 className="mb-4">📊 Pipeline de Ventas</h5>
        
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          {stages.map((stage, idx) => (
            <div key={idx} className="mb-4">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <strong>{stage.name}</strong>
                  <p className="mb-1 text-muted small">{stage.description}</p>
                </div>
                <div className="text-end">
                  <h6 className="mb-0">{stage.count}</h6>
                  <small className="text-muted">{stage.percentage}% del total</small>
                </div>
              </div>

              <div
                style={{
                  width: `${Math.max(stage.percentage, 10)}%`,
                  padding: '12px 16px',
                  background: stage.color,
                  borderRadius: '4px',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  marginBottom: '8px',
                }}
              >
                {stage.percentage}%
              </div>

              {stage.conversionRate !== undefined && (
                <small className="text-muted">
                  Conversión a siguiente etapa: <strong>{stage.conversionRate}%</strong>
                </small>
              )}

              {stage.value !== undefined && (
                <p className="mb-0 mt-2">
                  <Badge bg="success">Valor: ${stage.value.toLocaleString('es-ES')}</Badge>
                </p>
              )}

              {idx < stages.length - 1 && (
                <div className="text-center my-3">
                  <small className="text-muted">⬇️</small>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Métricas clave */}
      <div className="row mt-5">
        <div className="col-md-6">
          <div className="p-4 bg-light rounded">
            <h6 className="text-primary mb-3">📈 Tasa de Conversión General</h6>
            <h3 className="mb-0">{pipeline.conversionRate}%</h3>
            <small className="text-muted">De prospects a clientes finales</small>
          </div>
        </div>
        <div className="col-md-6">
          <div className="p-4 bg-light rounded">
            <h6 className="text-success mb-3">💰 Valor Total del Pipeline</h6>
            <h3 className="mb-0">
              ${(pipeline.customers.value + pipeline.leads.value).toLocaleString('es-ES')}
            </h3>
            <small className="text-muted">Clientes + Leads potenciales</small>
          </div>
        </div>
      </div>

      {/* Recomendaciones */}
      <div className="alert alert-info mt-4" role="alert">
        <strong>💡 Análisis del Pipeline:</strong>
        <ul className="mb-0 mt-2">
          <li>
            <strong>{pipeline.leads.count}</strong> leads con carrito abandonado - 
            <strong>${pipeline.leads.value.toLocaleString('es-ES')}</strong> en oportunidad
          </li>
          <li>
            Tasa de conversión Prospect→Lead: <strong>{pipeline.prospects.conversionRate}%</strong>
          </li>
          <li>
            Tasa de conversión Lead→Customer: <strong>{pipeline.leads.conversionRate}%</strong>
          </li>
          <li>
            Enfócate en mejorar la conversión de leads (carritos abandonados) para aumentar ventas
          </li>
        </ul>
      </div>
    </div>
  );
}
