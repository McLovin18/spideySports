// Diagnóstico para verificar por qué los pedidos de usuarios autenticados no aparecen en admin clientes

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, query, orderBy } from 'firebase/firestore';

// Configuración de Firebase (usar las mismas variables de entorno)
const firebaseConfig = {
  apiKey: "AIzaSyCW1RRKpFVuEVfqHfyBxfvlBb-61cWWL4w",
  authDomain: "spidey-sports.firebaseapp.com",
  projectId: "spidey-sports",
  storageBucket: "spidey-sports.appspot.com",
  messagingSenderId: "251804195304",
  appId: "1:251804195304:web:a8a6eac92f3d9e9e6e9f8e"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function diagnosticarAdminClientes() {
  console.log('🔍 DIAGNÓSTICO: Pedidos de usuarios autenticados en admin clientes');
  console.log('==================================================================');

  try {
    // 1. Verificar la colección dailyOrders
    console.log('\n📅 1. Verificando colección dailyOrders...');
    const dailyOrdersRef = collection(db, 'dailyOrders');
    const dailyOrdersQuery = query(dailyOrdersRef, orderBy('date', 'desc'));
    const dailyOrdersSnapshot = await getDocs(dailyOrdersQuery);
    
    console.log(`   - Documentos en dailyOrders: ${dailyOrdersSnapshot.size}`);
    
    let totalOrders = 0;
    let authenticatedOrders = 0;
    let guestOrders = 0;
    let ordersWithUserId = 0;
    let ordersWithUserEmail = 0;
    
    dailyOrdersSnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`   - Documento ${doc.id}:`);
      console.log(`     - Fecha: ${data.date}`);
      console.log(`     - Total órdenes: ${data.totalOrdersCount}`);
      
      if (data.orders) {
        totalOrders += data.orders.length;
        data.orders.forEach((order, index) => {
          console.log(`     - Orden ${index + 1}:`);
          console.log(`       - ID: ${order.id}`);
          console.log(`       - userId: ${order.userId || 'undefined'}`);
          console.log(`       - userName: ${order.userName || 'undefined'}`);
          console.log(`       - userEmail: ${order.userEmail || 'undefined'}`);
          console.log(`       - guestCheckout: ${order.guestCheckout}`);
          
          if (order.userId && order.userId !== 'guest') {
            authenticatedOrders++;
            ordersWithUserId++;
          }
          if (order.guestCheckout === true) {
            guestOrders++;
          }
          if (order.userEmail) {
            ordersWithUserEmail++;
          }
        });
      }
    });
    
    console.log('\n📊 Resumen de órdenes:');
    console.log(`   - Total órdenes: ${totalOrders}`);
    console.log(`   - Órdenes autenticadas: ${authenticatedOrders}`);
    console.log(`   - Órdenes de invitados: ${guestOrders}`);
    console.log(`   - Órdenes con userId: ${ordersWithUserId}`);
    console.log(`   - Órdenes con userEmail: ${ordersWithUserEmail}`);

    // 2. Verificar la colección guestPurchases
    console.log('\n👤 2. Verificando colección guestPurchases...');
    const guestPurchasesRef = collection(db, 'guestPurchases');
    const guestPurchasesSnapshot = await getDocs(guestPurchasesRef);
    console.log(`   - Documentos en guestPurchases: ${guestPurchasesSnapshot.size}`);

    // 3. Verificar algunas subcolecciones de usuarios
    console.log('\n👥 3. Verificando subcolecciones de usuarios...');
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    console.log(`   - Documentos en users: ${usersSnapshot.size}`);
    
    let userPurchasesCount = 0;
    for (const userDoc of usersSnapshot.docs) {
      try {
        const purchasesRef = collection(db, `users/${userDoc.id}/purchases`);
        const purchasesSnapshot = await getDocs(purchasesRef);
        if (purchasesSnapshot.size > 0) {
          console.log(`   - Usuario ${userDoc.id} tiene ${purchasesSnapshot.size} compras`);
          userPurchasesCount += purchasesSnapshot.size;
        }
      } catch (error) {
        console.log(`   - Error accediendo purchases de ${userDoc.id}: ${error.message}`);
      }
    }
    console.log(`   - Total compras en subcolecciones: ${userPurchasesCount}`);

    // 4. Verificar deliveryOrders
    console.log('\n🚚 4. Verificando colección deliveryOrders...');
    const deliveryOrdersRef = collection(db, 'deliveryOrders');
    const deliveryOrdersSnapshot = await getDocs(deliveryOrdersRef);
    console.log(`   - Documentos en deliveryOrders: ${deliveryOrdersSnapshot.size}`);
    
    let deliveryAuthenticatedOrders = 0;
    deliveryOrdersSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.userId && data.userId !== 'guest') {
        deliveryAuthenticatedOrders++;
      }
    });
    console.log(`   - Órdenes de delivery autenticadas: ${deliveryAuthenticatedOrders}`);

    // 5. Análisis de discrepancias
    console.log('\n⚠️  5. Análisis de discrepancias:');
    if (userPurchasesCount > authenticatedOrders) {
      console.log(`   - PROBLEMA: ${userPurchasesCount} compras en subcolecciones vs ${authenticatedOrders} en dailyOrders`);
      console.log(`   - Faltan ${userPurchasesCount - authenticatedOrders} órdenes autenticadas en dailyOrders`);
    } else if (userPurchasesCount === authenticatedOrders) {
      console.log('   - ✅ Las cantidades coinciden entre subcolecciones y dailyOrders');
    } else {
      console.log(`   - ⚠️ Más órdenes en dailyOrders (${authenticatedOrders}) que en subcolecciones (${userPurchasesCount})`);
    }

    if (deliveryAuthenticatedOrders > authenticatedOrders) {
      console.log(`   - PROBLEMA: ${deliveryAuthenticatedOrders} órdenes en delivery vs ${authenticatedOrders} en dailyOrders`);
      console.log(`   - Las órdenes de delivery están llegando pero no a dailyOrders para admin`);
    }

  } catch (error) {
    console.error('❌ Error durante el diagnóstico:', error);
  }
}

// Ejecutar el diagnóstico
diagnosticarAdminClientes().catch(console.error);