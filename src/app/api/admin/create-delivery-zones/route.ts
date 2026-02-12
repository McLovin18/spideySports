import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/app/utils/auditLogger';

const DELIVERY_ZONES = [
  // GUAYAQUIL
  { name: 'Guayaquil Centro', minLat: -2.2000, maxLat: -2.1800, minLng: -79.8900, maxLng: -79.8700, shippingCost: 3, estimatedDays: 1, active: true },
  { name: 'Guayaquil Norte', minLat: -2.1500, maxLat: -2.1000, minLng: -79.9000, maxLng: -79.8500, shippingCost: 5, estimatedDays: 1, active: true },
  { name: 'Guayaquil Sur', minLat: -2.2200, maxLat: -2.1900, minLng: -79.9100, maxLng: -79.8600, shippingCost: 5, estimatedDays: 1, active: true },
  { name: 'Guayaquil Urdesa', minLat: -2.1700, maxLat: -2.1300, minLng: -79.9300, maxLng: -79.8900, shippingCost: 7, estimatedDays: 1, active: true },
  { name: 'Guayaquil Samborondón', minLat: -2.1600, maxLat: -2.1200, minLng: -79.8500, maxLng: -79.8000, shippingCost: 8, estimatedDays: 1, active: true },
  { name: 'Guayaquil Ceibos', minLat: -2.1900, maxLat: -2.1400, minLng: -79.8700, maxLng: -79.8100, shippingCost: 7, estimatedDays: 1, active: true },
  { name: 'Guayaquil Alborada', minLat: -2.1800, maxLat: -2.1200, minLng: -79.8900, maxLng: -79.8200, shippingCost: 6, estimatedDays: 1, active: true },
  { name: 'Guayaquil Kennedy', minLat: -2.1500, maxLat: -2.0900, minLng: -79.9200, maxLng: -79.8600, shippingCost: 6, estimatedDays: 1, active: true },
  { name: 'Guayaquil Las Peñas', minLat: -2.2100, maxLat: -2.1900, minLng: -79.8800, maxLng: -79.8600, shippingCost: 3, estimatedDays: 1, active: true },
  { name: 'Guayaquil Mapasingue', minLat: -2.1400, maxLat: -2.0900, minLng: -79.8700, maxLng: -79.8200, shippingCost: 5, estimatedDays: 1, active: true },
  { name: 'Guayaquil Sauces', minLat: -2.1600, maxLat: -2.1100, minLng: -79.8900, maxLng: -79.8300, shippingCost: 6, estimatedDays: 1, active: true },
  { name: 'Guayaquil Vía Costa', minLat: -2.2000, maxLat: -2.1500, minLng: -79.8700, maxLng: -79.8100, shippingCost: 7, estimatedDays: 1, active: true },
  { name: 'Guayaquil General', minLat: -2.2500, maxLat: -2.0800, minLng: -79.9500, maxLng: -79.7800, shippingCost: 5, estimatedDays: 1, active: true },
  // SANTA ELENA
  { name: 'Santa Elena Centro', minLat: -2.2300, maxLat: -2.2100, minLng: -80.3600, maxLng: -80.3400, shippingCost: 12, estimatedDays: 2, active: true },
  { name: 'Santa Elena Libertad', minLat: -2.2400, maxLat: -2.2200, minLng: -80.3700, maxLng: -80.3500, shippingCost: 12, estimatedDays: 2, active: true },
  { name: 'Santa Elena Ballenita', minLat: -2.3400, maxLat: -2.3100, minLng: -80.4200, maxLng: -80.3900, shippingCost: 15, estimatedDays: 2, active: true },
  { name: 'Santa Elena Salinas', minLat: -2.2100, maxLat: -2.1800, minLng: -80.9700, maxLng: -80.9400, shippingCost: 20, estimatedDays: 3, active: true },
  { name: 'Santa Elena General', minLat: -2.3500, maxLat: -2.1700, minLng: -80.9800, maxLng: -80.3300, shippingCost: 15, estimatedDays: 2, active: true },
  // NACIONAL
  { name: 'Ecuador - Entrega Nacional', minLat: -5.0, maxLat: 1.5, minLng: -81.0, maxLng: -75.0, shippingCost: 25, estimatedDays: 5, active: true }
];

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Iniciando creación de zonas de entrega via REST API...');
    
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    
    if (!projectId || !apiKey) {
      console.error('❌ Configuración incompleta', { projectId: !!projectId, apiKey: !!apiKey });
      return NextResponse.json(
        {
          success: false,
          error: 'Configuración incompleta',
          message: 'ID del proyecto o API key no configurados'
        },
        { status: 500 }
      );
    }

    let createdCount = 0;
    const createdZones: string[] = [];
    const errors: string[] = [];

    for (const zone of DELIVERY_ZONES) {
      const docId = zone.name.toLowerCase().replace(/\s+/g, '-');
      const now = new Date().toISOString();

      try {
        console.log(`📝 Creando zona: ${zone.name} (docId: ${docId})`);
        
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/deliveryZones/${docId}?key=${apiKey}`;
        console.log(`📡 URL: ${url.split('?')[0]}?***`);
        
        // Usar Firestore REST API directamente
        const response = await fetch(url, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: {
              name: { stringValue: zone.name },
              minLat: { doubleValue: zone.minLat },
              maxLat: { doubleValue: zone.maxLat },
              minLng: { doubleValue: zone.minLng },
              maxLng: { doubleValue: zone.maxLng },
              shippingCost: { integerValue: zone.shippingCost },
              estimatedDays: { integerValue: zone.estimatedDays },
              active: { booleanValue: zone.active },
              createdAt: { timestampValue: now },
              updatedAt: { timestampValue: now }
            }
          })
        });

        console.log(`📊 Response status: ${response.status}`);

        if (response.ok) {
          createdCount++;
          createdZones.push(zone.name);
          console.log(`✅ Zona creada: ${zone.name}`);
        } else {
          const errorText = await response.text();
          console.error(`❌ Response error (${response.status}):`, errorText);
          errors.push(`${zone.name}: HTTP ${response.status} - ${errorText.substring(0, 100)}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error creando zona ${zone.name}:`, errorMsg);
        errors.push(`${zone.name}: ${errorMsg}`);
      }
    }

    console.log(`\n📊 RESUMEN: ${createdCount} zonas creadas, ${errors.length} errores`);
    if (errors.length > 0) {
      console.log('📋 Errores:', errors);
    }

    // Log audit
    await logAudit('DELIVERY_ZONES_CREATED', { count: createdCount, zones: createdZones, errors }, request, {
      status: createdCount > 0 ? 'success' : 'failed',
      severity: 'low'
    });

    return NextResponse.json(
      {
        success: createdCount > 0,
        message: `✅ ${createdCount} zonas de entrega creadas exitosamente`,
        createdCount,
        zones: createdZones,
        errors: errors.length > 0 ? errors : undefined
      },
      { status: createdCount > 0 ? 200 : 207 }
    );
  } catch (error) {
    console.error('❌ Error en create-delivery-zones:', error);

    const errorMsg = error instanceof Error ? error.message : String(error);

    await logAudit('DELIVERY_ZONES_ERROR', { error: errorMsg }, request, {
      status: 'failed',
      severity: 'high'
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Error creando zonas',
        message: errorMsg
      },
      { status: 500 }
    );
  }
}

// Inicializar Firebase Admin en el servidor
async function getAdminFirestore() {
  try {
    const admin = await import('firebase-admin');
    
    // Verificar si ya está inicializado
    if (admin.apps && admin.apps.length > 0) {
      return admin.firestore();
    }
    
    // Obtener credenciales del service account
    const serviceAccountKey = process.env.FIREBASE_ADMIN_SDK_KEY;
    
    if (!serviceAccountKey) {
      console.error('❌ FIREBASE_ADMIN_SDK_KEY no configurado');
      return null;
    }
    
    const serviceAccount = JSON.parse(
      Buffer.from(serviceAccountKey, 'base64').toString('utf-8')
    );
    
    // Inicializar Admin SDK
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    });
    
    console.log('✅ Firebase Admin SDK inicializado');
    return admin.firestore();
  } catch (error) {
    console.error('❌ Error inicializando Firebase Admin:', error);
    return null;
  }
}
