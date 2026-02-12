// 🔍 SCRIPT DE DIAGNÓSTICO - Verificar reglas de Firestore y acceso
// Copia esto en la consola del navegador (DevTools) mientras estés en la tienda

console.log('🔍 [DIAGNÓSTICO] Iniciando verificación de Firestore...');

// Test 1: Verificar que Firebase está inicializado
try {
  const { db } = await import('@/app/utils/firebase');
  console.log('✅ Firebase db inicializado correctamente');
  console.log('   - DB:', db);
} catch (e) {
  console.error('❌ ERROR: Firebase no está inicializado', e);
}

// Test 2: Intentar leer desde una colección pública
try {
  const { db } = await import('@/app/utils/firebase');
  const { collection, getDocs } = await import('firebase/firestore');
  
  console.log('📖 Intentando leer de colección pública (products)...');
  const productsRef = collection(db, 'products');
  const snapshot = await getDocs(productsRef);
  console.log(`✅ Se leyeron ${snapshot.size} productos`);
} catch (e) {
  console.error('❌ ERROR leyendo products:', e.message);
}

// Test 3: Intentar escribir en emailVerifications (lo que hace handleSendOTP)
try {
  const { db } = await import('@/app/utils/firebase');
  const { doc, setDoc } = await import('firebase/firestore');
  
  console.log('📝 Intentando escribir en emailVerifications...');
  const testId = `test_${Date.now()}`;
  const testRef = doc(db, 'emailVerifications', testId);
  
  await setDoc(testRef, {
    email: 'test@example.com',
    otp: '123456',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    attempts: 0,
    verified: false,
  });
  
  console.log('✅ ÉXITO: Se escribió en emailVerifications');
  console.log('   - Document ID:', testId);
} catch (e) {
  console.error('❌ ERROR escribiendo en emailVerifications:', e.message);
  console.error('   - Code:', e.code);
  console.error('   - Si ves "permission-denied", las reglas no se actualizaron correctamente');
}

// Test 4: Resumir estado
console.log('\n📋 RESUMEN:');
console.log('Si ves ❌ permission-denied en Test 3:');
console.log('1. Ve a Firebase Console → Firestore → Rules');
console.log('2. Verifica que las reglas incluyan emailVerifications');
console.log('3. Busca este bloque y verifica que esté presente:');
console.log(`
  match /emailVerifications/{docId} {
    allow read: if false;
    allow create: if request.resource.data.email != null && 
                     request.resource.data.otp != null &&
                     request.resource.data.createdAt != null &&
                     request.resource.data.expiresAt != null;
    allow update: if request.resource.data.email == resource.data.email;
    allow delete: if false;
    allow list: if false;
  }
`);
console.log('4. Si está presente, haz click en "Publish" nuevamente');
console.log('5. Espera 5-10 segundos a que se publique');
console.log('6. Recarga la página y vuelve a intentar');
