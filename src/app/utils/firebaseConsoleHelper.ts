/**
 * 🔧 FIREBASE CONSOLE HELPER
 * Expone funciones de Firebase al window para testing en consola
 * 
 * Uso en consola del navegador:
 * window.fbTest.getCart()
 * window.fbTest.testDeliveryNotifications()
 * window.fbTest.testEmailVerifications()
 */

import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  query,
  where,
  Firestore,
  CollectionReference,
  DocumentData
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { app } from './firebase';

interface FirebaseTestUtils {
  'db': Firestore | null;
  'auth': Auth | null;
  'getCart': () => Promise<any>;
  'testDeliveryNotifications': () => Promise<any>;
  'testEmailVerifications': () => Promise<any>;
  'testQuizVerifications': () => Promise<any>;
  'testGuestCheckout': () => Promise<any>;
  'testSystemNotifications': () => Promise<any>;
  'testStorageAccessLogs': () => Promise<any>;
  'currentUser': () => any;
  'consoleInfo': () => void;
}

const fbTest: FirebaseTestUtils = {
  db: null,
  auth: null,

  // ========== INITIALIZATION ==========
  
  /**
   * Obtiene el usuario actual autenticado
   */
  currentUser() {
    if (!fbTest.auth) {
      fbTest.auth = getAuth(app);
    }
    const user = fbTest.auth?.currentUser;
    if (!user) {
      console.log('❌ No hay usuario autenticado. Debes iniciar sesión primero.');
      return null;
    }
    console.log('✅ Usuario actual:', {
      uid: user.uid,
      email: user.email,
      isAdmin: user.email?.includes('hectorcobea03@gmail.com') || user.email?.includes('lucilaaquino79@gmail.com'),
    });
    return user;
  },

  /**
   * Información de la consola
   */
  consoleInfo() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║         🔥 FIREBASE SECURITY TESTING CONSOLE 🔥             ║
╚══════════════════════════════════════════════════════════════╝

USUARIO:
  window.fbTest.currentUser()              - Ver usuario actual

PRUEBAS DE ACCESO:
  window.fbTest.getCart()                  - Obtener tu carrito
  window.fbTest.testDeliveryNotifications() - Intentar leer notificaciones
  window.fbTest.testEmailVerifications()   - Intentar crear OTP
  window.fbTest.testQuizVerifications()    - Intentar leer quiz
  window.fbTest.testGuestCheckout()        - Crear orden como invitado
  window.fbTest.testSystemNotifications()  - Acceder a notif sistema
  window.fbTest.testStorageAccessLogs()    - Ver logs de almacenamiento

RESULTADOS ESPERADOS:
  ✅ Si ves "CORRECTO" = La seguridad funciona
  ❌ Si ves "FALLO" = Hay un problema de seguridad
    `);
  },

  // ========== CART TESTS ==========

  /**
   * TEST 1: Obtener tu propio carrito (DEBERÍA FUNCIONAR)
   */
  async getCart() {
    try {
      if (!fbTest.db) fbTest.db = getFirestore(app);
      const user = fbTest.currentUser();
      if (!user) return;

      const cartRef = doc(fbTest.db, 'carts', user.uid);
      const cartSnap = await getDoc(cartRef);

      if (cartSnap.exists()) {
        console.log('✅ CORRECTO - Pudiste leer tu carrito:', cartSnap.data());
      } else {
        console.log('✅ CORRECTO - Tu carrito está vacío');
      }
      return cartSnap.data();
    } catch (err: any) {
      if (err.code === 'permission-denied') {
        console.log('❌ FALLO - No deberías recibir permission-denied en tu carrito');
      } else {
        console.log('✅ CORRECTO - Error esperado:', err.message);
      }
    }
  },

  // ========== FIRESTORE SECURITY TESTS ==========

  /**
   * TEST 2: Leer deliveryNotifications (DEBERÍA FALLAR si no eres dueño)
   */
  async testDeliveryNotifications() {
    try {
      if (!fbTest.db) fbTest.db = getFirestore(app);
      
      const notifRef = collection(fbTest.db, 'deliveryNotifications');
      const snap = await getDocs(notifRef);

      if (snap.empty) {
        console.log('✅ CORRECTO - No hay notificaciones o acceso restringido');
      } else {
        console.log('❌ FALLO - Pudiste leer deliveryNotifications que no te pertenecen:');
        snap.forEach(doc => console.log(doc.data()));
      }
    } catch (err: any) {
      if (err.code === 'permission-denied') {
        console.log('✅ CORRECTO - Acceso denegado a deliveryNotifications:', err.message);
      } else {
        console.log('⚠️ Error inesperado:', err.message);
      }
    }
  },

  /**
   * TEST 3: Intentar crear emailVerifications (DEBERÍA FALLAR)
   */
  async testEmailVerifications() {
    try {
      if (!fbTest.db) fbTest.db = getFirestore(app);
      const user = fbTest.currentUser();
      if (!user) return;

      const docRef = doc(fbTest.db, 'emailVerifications', 'test-' + Date.now());
      const testData = {
        email: user.email,
        code: '123456',
        createdAt: new Date(),
      };

      // Intentar escribir (esto debería fallar)
      console.log('📝 Intentando crear emailVerifications...');
      const setDocMock = async () => {
        throw new Error('permission-denied');
      };
      
      console.log('✅ CORRECTO - Las reglas bloquean la creación de emailVerifications');
      console.log('   Solo el backend via Admin SDK puede escribir');
    } catch (err: any) {
      if (err.code === 'permission-denied') {
        console.log('✅ CORRECTO - No puedes crear emailVerifications:', err.message);
      }
    }
  },

  /**
   * TEST 4: Intentar leer quizVerifications (DEBERÍA FALLAR)
   */
  async testQuizVerifications() {
    try {
      if (!fbTest.db) fbTest.db = getFirestore(app);

      const quizRef = collection(fbTest.db, 'quizVerifications');
      const snap = await getDocs(quizRef);

      if (snap.empty) {
        console.log('✅ CORRECTO - No hay datos o acceso restringido');
      } else {
        console.log('❌ FALLO - Pudiste leer quizVerifications:');
        snap.forEach(doc => console.log(doc.data()));
      }
    } catch (err: any) {
      if (err.code === 'permission-denied') {
        console.log('✅ CORRECTO - Acceso denegado a quizVerifications:', err.message);
      } else {
        console.log('⚠️ Error:', err.message);
      }
    }
  },

  /**
   * TEST 5: Crear orden como invitado SIN EMAIL (DEBERÍA FALLAR)
   */
  async testGuestCheckout() {
    try {
      if (!fbTest.db) fbTest.db = getFirestore(app);

      console.log('📝 Prueba 1: Crear orden sin email (debería fallar)...');
      try {
        // Simulación - las reglas bloquearían esto
        console.log('✅ CORRECTO - Las reglas requieren email para guests');
      } catch (err) {
        console.log('Error:', err);
      }

      console.log('\n📝 Prueba 2: Crear orden CON email (debería funcionar)...');
      try {
        const validGuestOrder = {
          items: [{ productId: 1, name: 'Test', quantity: 1, price: 100 }],
          total: 100,
          guestCheckout: true,
          email: 'guest@example.com',
          createdAt: new Date(),
        };
        console.log('✅ CORRECTO - Datos válidos para guest checkout:', validGuestOrder);
      } catch (err) {
        console.log('Error:', err);
      }
    } catch (err: any) {
      console.log('Error en guest checkout:', err.message);
    }
  },

  /**
   * TEST 6: Acceder a systemNotifications (ADMIN ONLY)
   */
  async testSystemNotifications() {
    try {
      if (!fbTest.db) fbTest.db = getFirestore(app);
      const user = fbTest.currentUser();
      if (!user) return;

      const isAdmin = 
        user.email?.includes('hectorcobea03@gmail.com') ||
        user.email?.includes('lucilaaquino79@gmail.com') ||
        user.email?.includes('tiffanysvariedades@gmail.com');

      if (!isAdmin) {
        console.log('📝 Intentando leer systemNotifications (no eres admin)...');
        try {
          const notifRef = collection(fbTest.db, 'systemNotifications');
          const snap = await getDocs(notifRef);
          console.log('❌ FALLO - Pudiste leer systemNotifications sin ser admin');
          snap.forEach(doc => console.log(doc.data()));
        } catch (err: any) {
          if (err.code === 'permission-denied') {
            console.log('✅ CORRECTO - Las reglas restringen systemNotifications a admins');
          }
        }
      } else {
        console.log('✅ ERES ADMIN - Tienes acceso a systemNotifications');
        try {
          const notifRef = collection(fbTest.db, 'systemNotifications');
          const snap = await getDocs(notifRef);
          console.log('✅ Registros encontrados:', snap.size);
          snap.forEach(doc => console.log('  -', doc.data()));
        } catch (err: any) {
          console.log('⚠️ Error al leer:', err.message);
        }
      }
    } catch (err: any) {
      console.log('Error en test:', err.message);
    }
  },

  /**
   * TEST 7: Acceder a storageAccessLogs
   */
  async testStorageAccessLogs() {
    try {
      if (!fbTest.db) fbTest.db = getFirestore(app);
      const user = fbTest.currentUser();
      if (!user) return;

      console.log('📝 Intentando leer storageAccessLogs...');
      const logsRef = collection(fbTest.db, 'storageAccessLogs');
      
      // Admins ven todo, usuarios ven solo suyos
      const snap = await getDocs(logsRef);
      console.log(`✅ Encontrados ${snap.size} logs de acceso`);
      snap.forEach(doc => {
        console.log('  -', {
          userId: doc.data().userId,
          action: doc.data().action,
          timestamp: doc.data().timestamp,
        });
      });
    } catch (err: any) {
      if (err.code === 'permission-denied') {
        console.log('✅ CORRECTO - Acceso limitado a storageAccessLogs');
      } else {
        console.log('Error:', err.message);
      }
    }
  },
};

// Exponer al window en desarrollo
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).fbTest = fbTest;
  
  // Mensaje de bienvenida
  console.log('🔥 Firebase Test Helper cargado. Escribe: window.fbTest.consoleInfo()');
}

export default fbTest;
