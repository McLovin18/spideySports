#!/usr/bin/env node
/**
 * Script para crear zonas de entrega iniciales de prueba en Firestore
 * Uso: node create-initial-zones.mjs
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Inicializar Firebase Admin SDK
const serviceAccountPath = process.env.FIREBASE_CONFIG_PATH || 'firebase-service-account.json';

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`❌ Error: No se encontró ${serviceAccountPath}`);
  console.error('Por favor, coloca tu archivo de credenciales Firebase en la raíz del proyecto');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

// Zonas de prueba principales
const INITIAL_ZONES = [
  {
    name: 'guayaquil-centro',
    minLat: -2.2120,
    maxLat: -2.1980,
    minLng: -79.8850,
    maxLng: -79.8650,
    shippingCost: 3.00,
    estimatedDays: 1,
    active: true,
    description: 'Centro histórico de Guayaquil'
  },
  {
    name: 'guayaquil-norte',
    minLat: -2.1750,
    maxLat: -2.1550,
    minLng: -79.9100,
    maxLng: -79.8750,
    shippingCost: 4.00,
    estimatedDays: 1,
    active: true,
    description: 'Zona norte (Av. Balboa, Circunvalación)'
  },
  {
    name: 'guayaquil-sur',
    minLat: -2.2450,
    maxLat: -2.2200,
    minLng: -79.9050,
    maxLng: -79.8750,
    shippingCost: 4.50,
    estimatedDays: 1,
    active: true,
    description: 'Zona sur (Esteros)'
  },
  {
    name: 'guayaquil-urdesa',
    minLat: -2.1650,
    maxLat: -2.1450,
    minLng: -79.9550,
    maxLng: -79.9250,
    shippingCost: 5.00,
    estimatedDays: 1,
    active: true,
    description: 'Urdesa Premium'
  },
  {
    name: 'guayaquil-samborondon',
    minLat: -2.1350,
    maxLat: -2.0950,
    minLng: -79.9400,
    maxLng: -79.8950,
    shippingCost: 6.00,
    estimatedDays: 2,
    active: true,
    description: 'Samborondón'
  },
];

async function createInitialZones() {
  try {
    console.log('🚀 Creando zonas de entrega iniciales...\n');

    const batch = db.batch();
    const zonesCollection = db.collection('deliveryZones');

    for (const zone of INITIAL_ZONES) {
      const docRef = zonesCollection.doc();
      
      batch.set(docRef, {
        ...zone,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`✅ ${zone.name} - $${zone.shippingCost} USD, ${zone.estimatedDays} día(s)`);
    }

    await batch.commit();

    console.log(`\n✨ Se crearon ${INITIAL_ZONES.length} zonas de entrega correctamente`);
    console.log('\n📋 Próximos pasos:');
    console.log('1. Ir a Admin Panel → Delivery Settings');
    console.log('2. Verificar que las zonas aparecen en la tabla');
    console.log('3. Agregar más zonas o editar existentes según sea necesario');
    console.log('4. Asignar repartidores a las zonas');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error al crear zonas:', error);
    process.exit(1);
  }
}

// Ejecutar
createInitialZones();
