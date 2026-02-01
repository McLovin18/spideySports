import React from 'react';
import { ProgressBar } from 'react-bootstrap';
import type { CustomerAnalytics } from '../../services/analyticsService';

interface Props {
  data: CustomerAnalytics | null;
}

export default function CustomerAnalyticsChart({ data }: Props) {
  if (!data) {
    return <p className="text-muted">No hay datos disponibles</p>;
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <strong>Nuevos Clientes</strong>
          <span className="badge bg-success">{data.newCustomers}</span>
        </div>
        <ProgressBar 
          now={data.newCustomerPercentage} 
          variant="success" 
          label={`${data.newCustomerPercentage}%`}
        />
      </div>

      <div>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <strong>Clientes Recurrentes</strong>
          <span className="badge bg-info">{data.returningCustomers}</span>
        </div>
        <ProgressBar 
          now={data.returningCustomerPercentage} 
          variant="info" 
          label={`${data.returningCustomerPercentage}%`}
        />
      </div>

      <div className="mt-3 p-3 bg-light rounded">
        <div className="text-center">
          <h4 className="mb-1">{data.totalCustomers}</h4>
          <small className="text-muted">Total de Clientes</small>
        </div>
      </div>
    </div>
  );
}
