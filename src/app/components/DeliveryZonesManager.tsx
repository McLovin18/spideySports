'use client';

import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Form, Alert, Table, Badge, Modal } from 'react-bootstrap';
import { db } from '@/app/utils/firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';

interface DeliveryZone {
  id: string;
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  shippingCost: number;
  estimatedDays: number;
  active: boolean;
  createdAt: Date;
}

interface DeliveryZonesManagerProps {
  className?: string;
}

const DeliveryZonesManager: React.FC<DeliveryZonesManagerProps> = ({ className }) => {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form states for new zone
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    minLat: '',
    maxLat: '',
    minLng: '',
    maxLng: '',
    shippingCost: '',
    estimatedDays: '',
  });
  
  // Edit states
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    loadZones();
  }, []);

  const loadZones = async () => {
    try {
      setLoading(true);
      const zonesCollection = collection(db, 'deliveryZones');
      const snapshot = await getDocs(zonesCollection);
      
      const zonesList: DeliveryZone[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        zonesList.push({
          id: doc.id,
          name: data.name,
          minLat: data.minLat,
          maxLat: data.maxLat,
          minLng: data.minLng,
          maxLng: data.maxLng,
          shippingCost: data.shippingCost,
          estimatedDays: data.estimatedDays,
          active: data.active !== false,
          createdAt: data.createdAt?.toDate() || new Date()
        });
      });
      
      setZones(zonesList);
      setError(null);
    } catch (error) {
      console.error('Error loading zones:', error);
      setError('Error al cargar zonas de entrega');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateCoordinates = (): string | null => {
    const minLat = parseFloat(formData.minLat);
    const maxLat = parseFloat(formData.maxLat);
    const minLng = parseFloat(formData.minLng);
    const maxLng = parseFloat(formData.maxLng);

    if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLng) || isNaN(maxLng)) {
      return 'Todas las coordenadas deben ser números válidos';
    }

    if (minLat < -90 || maxLat > 90 || minLat >= maxLat) {
      return 'Latitud inválida. Debe estar entre -90 y 90, y minLat < maxLat';
    }

    if (minLng < -180 || maxLng > 180 || minLng >= maxLng) {
      return 'Longitud inválida. Debe estar entre -180 y 180, y minLng < maxLng';
    }

    return null;
  };

  const handleAddZone = async () => {
    if (!formData.name.trim()) {
      setError('El nombre de la zona es requerido');
      return;
    }

    if (!formData.shippingCost || !formData.estimatedDays) {
      setError('El costo de envío y días estimados son requeridos');
      return;
    }

    const coordError = validateCoordinates();
    if (coordError) {
      setError(coordError);
      return;
    }

    try {
      const zonesCollection = collection(db, 'deliveryZones');
      await addDoc(zonesCollection, {
        name: formData.name.trim(),
        minLat: parseFloat(formData.minLat),
        maxLat: parseFloat(formData.maxLat),
        minLng: parseFloat(formData.minLng),
        maxLng: parseFloat(formData.maxLng),
        shippingCost: parseFloat(formData.shippingCost),
        estimatedDays: parseInt(formData.estimatedDays),
        active: true,
        createdAt: serverTimestamp(),
      });

      setSuccess(`✅ Zona "${formData.name}" creada correctamente`);
      setFormData({
        name: '',
        minLat: '',
        maxLat: '',
        minLng: '',
        maxLng: '',
        shippingCost: '',
        estimatedDays: '',
      });
      setShowAddModal(false);
      loadZones();
    } catch (error) {
      console.error('Error adding zone:', error);
      setError('Error al crear la zona');
    }
  };

  const handleEditZone = (zone: DeliveryZone) => {
    setEditingZone(zone);
    setFormData({
      name: zone.name,
      minLat: zone.minLat.toString(),
      maxLat: zone.maxLat.toString(),
      minLng: zone.minLng.toString(),
      maxLng: zone.maxLng.toString(),
      shippingCost: zone.shippingCost.toString(),
      estimatedDays: zone.estimatedDays.toString(),
    });
    setShowEditModal(true);
  };

  const handleUpdateZone = async () => {
    if (!editingZone) return;

    const coordError = validateCoordinates();
    if (coordError) {
      setError(coordError);
      return;
    }

    try {
      const zoneRef = doc(db, 'deliveryZones', editingZone.id);
      await updateDoc(zoneRef, {
        name: formData.name.trim(),
        minLat: parseFloat(formData.minLat),
        maxLat: parseFloat(formData.maxLat),
        minLng: parseFloat(formData.minLng),
        maxLng: parseFloat(formData.maxLng),
        shippingCost: parseFloat(formData.shippingCost),
        estimatedDays: parseInt(formData.estimatedDays),
      });

      setSuccess(`✅ Zona "${formData.name}" actualizada correctamente`);
      setShowEditModal(false);
      setEditingZone(null);
      loadZones();
    } catch (error) {
      console.error('Error updating zone:', error);
      setError('Error al actualizar la zona');
    }
  };

  const handleDeleteZone = async (zoneId: string, zoneName: string) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la zona "${zoneName}"?`)) {
      return;
    }

    try {
      const zoneRef = doc(db, 'deliveryZones', zoneId);
      await deleteDoc(zoneRef);
      setSuccess(`✅ Zona eliminada correctamente`);
      loadZones();
    } catch (error) {
      console.error('Error deleting zone:', error);
      setError('Error al eliminar la zona');
    }
  };

  const handleToggleActive = async (zone: DeliveryZone) => {
    try {
      const zoneRef = doc(db, 'deliveryZones', zone.id);
      await updateDoc(zoneRef, {
        active: !zone.active
      });
      setSuccess(`✅ Zona actualizada`);
      loadZones();
    } catch (error) {
      console.error('Error toggling zone:', error);
      setError('Error al actualizar la zona');
    }
  };

  if (loading) {
    return (
      <Container className={className}>
        <div className="text-center p-5">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container className={className} style={{ marginTop: '20px' }}>
      <Row>
        <Col lg={12}>
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center bg-primary text-white">
              <Card.Title className="m-0">🗺️ Gestión de Zonas de Entrega</Card.Title>
              <Button variant="light" size="sm" onClick={() => setShowAddModal(true)}>
                ➕ Agregar Zona
              </Button>
            </Card.Header>

            <Card.Body>
              {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
              {success && <Alert variant="success" onClose={() => setSuccess(null)} dismissible>{success}</Alert>}

              {zones.length === 0 ? (
                <Alert variant="warning">
                  No hay zonas de entrega configuradas. Crea una nueva zona para comenzar.
                </Alert>
              ) : (
                <div className="table-responsive">
                  <Table striped bordered hover>
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Coordenadas</th>
                        <th>Envío</th>
                        <th>Días</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zones.map((zone) => (
                        <tr key={zone.id}>
                          <td><strong>{zone.name}</strong></td>
                          <td style={{ fontSize: '0.85rem' }}>
                            Lat: {zone.minLat.toFixed(3)} → {zone.maxLat.toFixed(3)}<br />
                            Lng: {zone.minLng.toFixed(3)} → {zone.maxLng.toFixed(3)}
                          </td>
                          <td>${zone.shippingCost}</td>
                          <td>{zone.estimatedDays}</td>
                          <td>
                            <Badge bg={zone.active ? 'success' : 'secondary'}>
                              {zone.active ? '✅ Activa' : '⛔ Inactiva'}
                            </Badge>
                          </td>
                          <td>
                            <Button
                              variant="warning"
                              size="sm"
                              onClick={() => handleEditZone(zone)}
                              className="me-2"
                            >
                              ✏️ Editar
                            </Button>
                            <Button
                              variant={zone.active ? 'secondary' : 'success'}
                              size="sm"
                              onClick={() => handleToggleActive(zone)}
                              className="me-2"
                            >
                              {zone.active ? '⛔' : '✅'}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeleteZone(zone.id, zone.name)}
                            >
                              🗑️
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Modal para agregar zona */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>➕ Agregar Nueva Zona de Entrega</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Nombre de la Zona *</Form.Label>
              <Form.Control
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="ej: Guayaquil Centro"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Rango de Latitud</Form.Label>
              <Row>
                <Col>
                  <Form.Label className="small">Min Lat *</Form.Label>
                  <Form.Control
                    type="number"
                    name="minLat"
                    step="0.001"
                    value={formData.minLat}
                    onChange={handleInputChange}
                    placeholder="-2.2000"
                  />
                </Col>
                <Col>
                  <Form.Label className="small">Max Lat *</Form.Label>
                  <Form.Control
                    type="number"
                    name="maxLat"
                    step="0.001"
                    value={formData.maxLat}
                    onChange={handleInputChange}
                    placeholder="-2.1500"
                  />
                </Col>
              </Row>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Rango de Longitud</Form.Label>
              <Row>
                <Col>
                  <Form.Label className="small">Min Lng *</Form.Label>
                  <Form.Control
                    type="number"
                    name="minLng"
                    step="0.001"
                    value={formData.minLng}
                    onChange={handleInputChange}
                    placeholder="-79.9000"
                  />
                </Col>
                <Col>
                  <Form.Label className="small">Max Lng *</Form.Label>
                  <Form.Control
                    type="number"
                    name="maxLng"
                    step="0.001"
                    value={formData.maxLng}
                    onChange={handleInputChange}
                    placeholder="-79.8500"
                  />
                </Col>
              </Row>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Costo de Envío (USD) *</Form.Label>
              <Form.Control
                type="number"
                name="shippingCost"
                step="0.01"
                value={formData.shippingCost}
                onChange={handleInputChange}
                placeholder="5.00"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Días Estimados de Entrega *</Form.Label>
              <Form.Control
                type="number"
                name="estimatedDays"
                min="1"
                value={formData.estimatedDays}
                onChange={handleInputChange}
                placeholder="1"
              />
            </Form.Group>

            <Alert variant="info" className="mt-3">
              <strong>💡 Tip:</strong> Usa coordenadas geográficas reales. 
              Puedes obtenerlas de Google Maps (click derecho → copiar coordenadas).
            </Alert>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleAddZone}>
            Crear Zona
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modal para editar zona */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>✏️ Editar Zona de Entrega</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Nombre de la Zona *</Form.Label>
              <Form.Control
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="ej: Guayaquil Centro"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Rango de Latitud</Form.Label>
              <Row>
                <Col>
                  <Form.Label className="small">Min Lat *</Form.Label>
                  <Form.Control
                    type="number"
                    name="minLat"
                    step="0.001"
                    value={formData.minLat}
                    onChange={handleInputChange}
                    placeholder="-2.2000"
                  />
                </Col>
                <Col>
                  <Form.Label className="small">Max Lat *</Form.Label>
                  <Form.Control
                    type="number"
                    name="maxLat"
                    step="0.001"
                    value={formData.maxLat}
                    onChange={handleInputChange}
                    placeholder="-2.1500"
                  />
                </Col>
              </Row>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Rango de Longitud</Form.Label>
              <Row>
                <Col>
                  <Form.Label className="small">Min Lng *</Form.Label>
                  <Form.Control
                    type="number"
                    name="minLng"
                    step="0.001"
                    value={formData.minLng}
                    onChange={handleInputChange}
                    placeholder="-79.9000"
                  />
                </Col>
                <Col>
                  <Form.Label className="small">Max Lng *</Form.Label>
                  <Form.Control
                    type="number"
                    name="maxLng"
                    step="0.001"
                    value={formData.maxLng}
                    onChange={handleInputChange}
                    placeholder="-79.8500"
                  />
                </Col>
              </Row>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Costo de Envío (USD) *</Form.Label>
              <Form.Control
                type="number"
                name="shippingCost"
                step="0.01"
                value={formData.shippingCost}
                onChange={handleInputChange}
                placeholder="5.00"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Días Estimados de Entrega *</Form.Label>
              <Form.Control
                type="number"
                name="estimatedDays"
                min="1"
                value={formData.estimatedDays}
                onChange={handleInputChange}
                placeholder="1"
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleUpdateZone}>
            Guardar Cambios
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default DeliveryZonesManager;
