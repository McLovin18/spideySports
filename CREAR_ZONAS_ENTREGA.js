/**
 * Script para crear zonas de entrega de prueba en Firestore
 * Ejecutar en: Firebase Console > Firestore > Ejecutar en la consola del navegador
 */

async function createDeliveryZones() {
  const { initializeApp, getApps, getApp } = await import('firebase/app');
  const { getFirestore, collection, addDoc, serverTimestamp } = await import('firebase/firestore');
  
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
  
  const zones = [
    {
      name: "Guayaquil Centro",
      minLat: -2.1900,
      maxLat: -2.1500,
      minLng: -79.9000,
      maxLng: -79.8500,
      shippingCost: 5,
      estimatedDays: 1,
      active: true
    },
    {
      name: "Quito Centro",
      minLat: -0.2300,
      maxLat: -0.2000,
      minLng: -78.5200,
      maxLng: -78.4900,
      shippingCost: 8,
      estimatedDays: 2,
      active: true
    },
    {
      name: "Ecuador - Nationwide",
      minLat: -5.0,
      maxLat: 1.5,
      minLng: -81.0,
      maxLng: -75.0,
      shippingCost: 12,
      estimatedDays: 3,
      active: true
    }
  ];

  try {
    const zonesRef = collection(db, 'deliveryZones');
    
    for (const zone of zones) {
      await addDoc(zonesRef, {
        ...zone,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log(`✅ Zona creada: ${zone.name}`);
    }
    
    console.log('\n✅ TODAS LAS ZONAS DE ENTREGA HAN SIDO CREADAS');
    console.log('Ahora puedes intentar nuevamente la compra');
  } catch (error) {
    console.error('❌ Error al crear zonas:', error);
  }
}

// Ejecutar
createDeliveryZones();
