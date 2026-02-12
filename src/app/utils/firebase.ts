/* eslint-disable @typescript-eslint/no-explicit-any */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from "firebase/functions";

// Detectar si estamos en build de Vercel sin variables
const isBuilding =
  process.env.NODE_ENV === 'production' &&
  !process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

console.log('🔥 [firebase.ts] Inicializando Firebase...');
console.log('🔥 [firebase.ts] NODE_ENV:', process.env.NODE_ENV);
console.log('🔥 [firebase.ts] NEXT_PUBLIC_FIREBASE_API_KEY:', process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✅ EXISTE' : '❌ NO EXISTE');
console.log('🔥 [firebase.ts] isBuilding:', isBuilding);

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || (isBuilding ? 'fake-api-key-for-build' : ''),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || (isBuilding ? 'fake-domain.firebaseapp.com' : ''),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || (isBuilding ? 'fake-project-id' : ''),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || (isBuilding ? 'fake-bucket.appspot.com' : ''),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || (isBuilding ? '123456789' : ''),
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || (isBuilding ? 'fake-app-id' : ''),
};

console.log('🔥 [firebase.ts] firebaseConfig.projectId:', firebaseConfig.projectId);

let app: any = null;
let auth: any = null;
let db: any = null;
let storage: any = null;
let googleProvider: any = null;
let functions: any = null;

if (!isBuilding) {
  try {
    console.log('🔥 [firebase.ts] Inicializando aplicación...');
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    console.log('🔥 [firebase.ts] App inicializado ✅');
    
    auth = getAuth(app);
    console.log('🔥 [firebase.ts] Auth obtenido ✅');
    
    db = getFirestore(app);
    console.log('🔥 [firebase.ts] Firestore inicializado ✅');
    
    storage = getStorage(app);
    console.log('🔥 [firebase.ts] Storage inicializado ✅');
    
    googleProvider = new GoogleAuthProvider();
    functions = getFunctions(app);
    console.log('🔥 [firebase.ts] Firebase completamente inicializado ✅');
    
  } catch (error) {
    console.error('❌ Error al inicializar Firebase');
    if (process.env.NODE_ENV === 'development') {
      console.error('Detalles del error:', error);
    }
  }
} else {
  console.log('🔥 [firebase.ts] En modo de BUILD - Firebase mock (no inicializado)');
}

export { app, auth, db, storage, googleProvider, functions };
