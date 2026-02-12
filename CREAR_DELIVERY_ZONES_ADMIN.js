/**
 * 🚀 Script para crear la colección deliveryZones en Firestore
 * Junto a las coordenadas de las zonas disponibles para delivery
 * 
 * INSTRUCCIONES:
 * 1. Abre Firebase Console: https://console.firebase.google.com
 * 2. Proyecto: spidey-sports-db
 * 3. Firestore Database
 * 4. Copia cada documento en la colección "deliveryZones"
 */

const DELIVERY_ZONES = [
  // GUAYAQUIL
  {
    id: 'guayaquil-centro',
    name: 'Guayaquil Centro',
    minLat: -2.2000,
    maxLat: -2.1800,
    minLng: -79.8900,
    maxLng: -79.8700,
    shippingCost: 3,
    estimatedDays: 1,
    active: true
  },
  {
    id: 'guayaquil-norte',
    name: 'Guayaquil Norte',
    minLat: -2.1500,
    maxLat: -2.1000,
    minLng: -79.9000,
    maxLng: -79.8500,
    shippingCost: 5,
    estimatedDays: 1,
    active: true
  },
  {
    id: 'guayaquil-sur',
    name: 'Guayaquil Sur',
    minLat: -2.2200,
    maxLat: -2.1900,
    minLng: -79.9100,
    maxLng: -79.8600,
    shippingCost: 5,
    estimatedDays: 1,
    active: true
  },
  {
    id: 'guayaquil-urdesa',
    name: 'Guayaquil Urdesa',
    minLat: -2.1700,
    maxLat: -2.1300,
    minLng: -79.9300,
    maxLng: -79.8900,
    shippingCost: 7,
    estimatedDays: 1,
    active: true
  },
  {
    id: 'guayaquil-samborondon',
    name: 'Guayaquil Samborondón',
    minLat: -2.1600,
    maxLat: -2.1200,
    minLng: -79.8500,
    maxLng: -79.8000,
    shippingCost: 8,
    estimatedDays: 1,
    active: true
  },
  {
    id: 'guayaquil-ceibos',
    name: 'Guayaquil Ceibos',
    minLat: -2.1900,
    maxLat: -2.1400,
    minLng: -79.8700,
    maxLng: -79.8100,
    shippingCost: 7,
    estimatedDays: 1,
    active: true
  },
  {
    id: 'guayaquil-alborada',
    name: 'Guayaquil Alborada',
    minLat: -2.1800,
    maxLat: -2.1200,
    minLng: -79.8900,
    maxLng: -79.8200,
    shippingCost: 6,
    estimatedDays: 1,
    active: true
  },
  {
    id: 'guayaquil-kennedy',
    name: 'Guayaquil Kennedy',
    minLat: -2.1500,
    maxLat: -2.0900,
    minLng: -79.9200,
    maxLng: -79.8600,
    shippingCost: 6,
    estimatedDays: 1,
    active: true
  },
  {
    id: 'guayaquil-las-penas',
    name: 'Guayaquil Las Peñas',
    minLat: -2.2100,
    maxLat: -2.1900,
    minLng: -79.8800,
    maxLng: -79.8600,
    shippingCost: 3,
    estimatedDays: 1,
    active: true
  },
  {
    id: 'guayaquil-mapasingue',
    name: 'Guayaquil Mapasingue',
    minLat: -2.1400,
    maxLat: -2.0900,
    minLng: -79.8700,
    maxLng: -79.8200,
    shippingCost: 5,
    estimatedDays: 1,
    active: true
  },
  {
    id: 'guayaquil-sauces',
    name: 'Guayaquil Sauces',
    minLat: -2.1600,
    maxLat: -2.1100,
    minLng: -79.8900,
    maxLng: -79.8300,
    shippingCost: 6,
    estimatedDays: 1,
    active: true
  },
  {
    id: 'guayaquil-via-costa',
    name: 'Guayaquil Vía Costa',
    minLat: -2.2000,
    maxLat: -2.1500,
    minLng: -79.8700,
    maxLng: -79.8100,
    shippingCost: 7,
    estimatedDays: 1,
    active: true
  },
  {
    id: 'guayaquil-general',
    name: 'Guayaquil General',
    minLat: -2.2500,
    maxLat: -2.0800,
    minLng: -79.9500,
    maxLng: -79.7800,
    shippingCost: 5,
    estimatedDays: 1,
    active: true
  },
  // SANTA ELENA
  {
    id: 'santa-elena-centro',
    name: 'Santa Elena Centro',
    minLat: -2.2300,
    maxLat: -2.2100,
    minLng: -80.3600,
    maxLng: -80.3400,
    shippingCost: 12,
    estimatedDays: 2,
    active: true
  },
  {
    id: 'santa-elena-libertad',
    name: 'Santa Elena Libertad',
    minLat: -2.2400,
    maxLat: -2.2200,
    minLng: -80.3700,
    maxLng: -80.3500,
    shippingCost: 12,
    estimatedDays: 2,
    active: true
  },
  {
    id: 'santa-elena-ballenita',
    name: 'Santa Elena Ballenita',
    minLat: -2.3400,
    maxLat: -2.3100,
    minLng: -80.4200,
    maxLng: -80.3900,
    shippingCost: 15,
    estimatedDays: 2,
    active: true
  },
  {
    id: 'santa-elena-salinas',
    name: 'Santa Elena Salinas',
    minLat: -2.2100,
    maxLat: -2.1800,
    minLng: -80.9700,
    maxLng: -80.9400,
    shippingCost: 20,
    estimatedDays: 3,
    active: true
  },
  {
    id: 'santa-elena-general',
    name: 'Santa Elena General',
    minLat: -2.3500,
    maxLat: -2.1700,
    minLng: -80.9800,
    maxLng: -80.3300,
    shippingCost: 15,
    estimatedDays: 2,
    active: true
  },
  // NACIONAL
  {
    id: 'ecuador-nacional',
    name: 'Ecuador - Entrega Nacional',
    minLat: -5.0,
    maxLat: 1.5,
    minLng: -81.0,
    maxLng: -75.0,
    shippingCost: 25,
    estimatedDays: 5,
    active: true
  }
];

console.log(`
✅ ZONAS DE ENTREGA DISPONIBLES (${DELIVERY_ZONES.length} total):

Para crear manualmente en Firestore:
1. Ve a https://console.firebase.google.com
2. Proyecto: spidey-sports-db
3. Firestore > Crear colección: "deliveryZones"
4. Copia cada objeto JSON abajo y úsalo como documento
`);

DELIVERY_ZONES.forEach(zone => {
  console.log(`
📍 ${zone.name}
{
  "name": "${zone.name}",
  "minLat": ${zone.minLat},
  "maxLat": ${zone.maxLat},
  "minLng": ${zone.minLng},
  "maxLng": ${zone.maxLng},
  "shippingCost": ${zone.shippingCost},
  "estimatedDays": ${zone.estimatedDays},
  "active": ${zone.active}
}
  `);
});

console.log(`
✅ ALTERNATIVAMENTE: Ejecuta esto en la consola del navegador:

async function createDeliveryZones() {
  const { initializeApp, getApps, getApp } = await import('firebase/app');
  const { getFirestore, collection, addDoc } = await import('firebase/firestore');
  
  const firebaseConfig = {
    apiKey: "AIzaSyDp3FlZ5ilsTS9-wWU41FKPmkKelFnR_5Y",
    authDomain: "spidey-sports-db.firebaseapp.com",
    projectId: "spidey-sports-db",
    storageBucket: "spidey-sports-db.appspot.com",
    messagingSenderId: "959486835099",
    appId: "1:959486835099:web:8aa39e4f03abe84f2f2fa5"
  };

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const zonesRef = collection(db, 'deliveryZones');
  
  const zones = ${JSON.stringify(DELIVERY_ZONES, null, 2)};
  
  for (let zone of zones) {
    await addDoc(zonesRef, zone);
    console.log('✅ Zona creada:', zone.name);
  }
  console.log('✅ TODAS LAS ZONAS CREADAS');
}

createDeliveryZones();
`);
