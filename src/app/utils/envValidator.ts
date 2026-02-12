/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
/**
 * 🔐 ENVIRONMENT VARIABLES VALIDATOR
 * 
 * Valida que todas las variables críticas de entorno estén configuradas
 * correctamente y con valores seguros.
 * 
 * Se ejecuta en tiempo de construcción (build time) y runtime.
 */

interface EnvValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missing: string[];
}

interface EnvRequirements {
  required: string[];
  recommended: string[];
  publicVars: string[]; // Variables que es OK sean públicas
  sensitiveVars: string[]; // Variables críticas que NUNCA deben exponerse
}

// ⚠️ VARIABLE CRÍTICA: Nunca debe estar en .env.local
const SENSITIVE_VARS = [
  'EMAIL_PASS',
  'FIREBASE_ADMIN_SDK_KEY',
  'ENCRYPTION_KEY',
  'ENCRYPTION_IV',
  'ADMIN_2FA_SECRET',
  'SLACK_WEBHOOK_URL',
];

// Firebase variables públicas (es OK exponerlas)
const PUBLIC_FIREBASE_VARS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

// PayPal variables públicas (es OK exposar, se validan en servidor)
const PUBLIC_PAYPAL_VARS = [
  'NEXT_PUBLIC_PAYPAL_MODE',
  'NEXT_PUBLIC_PAYPAL_CLIENT_ID_SANDBOX',
  'NEXT_PUBLIC_PAYPAL_CLIENT_ID_LIVE',
  'NEXT_PUBLIC_PAYPAL_CLIENT_ID',
];

/**
 * Validar valor de variable sensible
 * @param value - Valor a validar
 * @param varName - Nombre de la variable
 * @returns Objeto con validación
 */
function validateSensitiveVar(value: string | undefined, varName: string): { valid: boolean; error?: string } {
  if (!value) {
    return { valid: false, error: `CRÍTICO: ${varName} no está configurada` };
  }

  if (value.length < 8) {
    return { valid: false, error: `CRÍTICO: ${varName} es demasiado corta (< 8 caracteres)` };
  }

  // Detectar placeholders no reemplazados
  if (value.includes('your_') || value.includes('YOUR_') || value === '{}') {
    return { valid: false, error: `CRÍTICO: ${varName} tiene valor de ejemplo (sin reemplazar)` };
  }

  return { valid: true };
}

/**
 * Validar formato de email
 */
function isValidEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validar configuración de Firebase
 */
function validateFirebase(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const requiredVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  ];

  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value) {
      errors.push(`Firebase: ${varName} falta`);
    }
  }

  // Validar formato de Auth Domain
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  if (authDomain && !authDomain.includes('firebaseapp.com')) {
    errors.push(`Firebase: AUTH_DOMAIN tiene formato inválido (debe terminar en .firebaseapp.com)`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validar configuración de PayPal
 */
function validatePayPal(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const mode = process.env.NEXT_PUBLIC_PAYPAL_MODE;
  if (!mode || !['sandbox', 'live'].includes(mode)) {
    errors.push(`PayPal: PAYPAL_MODE debe ser 'sandbox' o 'live'`);
  }

  if (mode === 'live') {
    // En producción, validar más estrictamente
    const liveClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID_LIVE;
    if (!liveClientId || liveClientId.length < 20) {
      errors.push(`PayPal: CLIENT_ID_LIVE es requerida en modo LIVE y debe ser válida`);
    }
  }

  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  if (!clientId) {
    errors.push(`PayPal: PAYPAL_CLIENT_ID no está configurada`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validar configuración de Email
 */
function validateEmail(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const emailUser = process.env.EMAIL_USER;
  if (!emailUser) {
    errors.push(`Email: EMAIL_USER no está configurada`);
  } else if (!isValidEmailFormat(emailUser)) {
    errors.push(`Email: EMAIL_USER tiene formato inválido`);
  }

  // Email password DEBE ser una App Password de Google, no la contraseña real
  const emailPass = process.env.EMAIL_PASS;
  if (!emailPass) {
    errors.push(`Email: EMAIL_PASS no está configurada`);
  } else if (emailPass.length < 12 || !emailPass.includes(' ')) {
    // Los Google App Passwords tienen formato: "aaaa bbbb cccc dddd" (4 grupos de 4)
    errors.push(`Email: EMAIL_PASS parece inválida (debe ser Google App Password con espacios)`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validar claves de encriptación
 */
function validateEncryption(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const encKey = process.env.ENCRYPTION_KEY;
  if (!encKey) {
    warnings.push(`Encriptación: ENCRYPTION_KEY no está configurada (algunas features deshabilitadas)`);
  } else if (encKey.length < 64) {
    // 32 bytes = 64 caracteres hex
    errors.push(`Encriptación: ENCRYPTION_KEY debe ser 64 caracteres hex (32 bytes)`);
  }

  const encIv = process.env.ENCRYPTION_IV;
  if (!encIv) {
    warnings.push(`Encriptación: ENCRYPTION_IV no está configurada`);
  } else if (encIv.length < 32) {
    // 16 bytes = 32 caracteres hex
    errors.push(`Encriptación: ENCRYPTION_IV debe ser 32 caracteres hex (16 bytes)`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * VALIDACIÓN PRINCIPAL
 */
export function validateEnvironment(): EnvValidation {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];
  const missing: string[] = [];

  // 1️⃣ Validar Firebase
  const firebaseValidation = validateFirebase();
  allErrors.push(...firebaseValidation.errors);

  // 2️⃣ Validar PayPal
  const paypalValidation = validatePayPal();
  allErrors.push(...paypalValidation.errors);

  // 3️⃣ Validar Email
  const emailValidation = validateEmail();
  allErrors.push(...emailValidation.errors);

  // 4️⃣ Validar Encriptación
  const encryptionValidation = validateEncryption();
  allErrors.push(...encryptionValidation.errors);
  allWarnings.push(...encryptionValidation.warnings);

  // 5️⃣ Validar variables sensibles NO están expuestas públicamente
  for (const sensitiveVar of SENSITIVE_VARS) {
    const publicVar = `NEXT_PUBLIC_${sensitiveVar}`;
    if (process.env[publicVar]) {
      allErrors.push(
        `🚨 CRÍTICO: ${sensitiveVar} fue marcada como NEXT_PUBLIC (expuesta al cliente)!`
      );
    }
  }

  // 6️⃣ Verificar que .env.local no está en git
  // Esto se valida en el .gitignore, pero podemos advertir aquí

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    missing,
  };
}

/**
 * VALIDACIÓN EN TIEMPO DE CONSTRUCCIÓN
 * Se ejecuta automáticamente en build
 */
export function validateEnvironmentBuild(): void {
  const validation = validateEnvironment();

  console.log('\n' + '='.repeat(60));
  console.log('🔐 VALIDACIÓN DE CONFIGURACIÓN DE ENTORNO');
  console.log('='.repeat(60) + '\n');

  if (validation.errors.length > 0) {
    console.error('❌ ERRORES CRÍTICOS:');
    validation.errors.forEach((error) => console.error(`  • ${error}`));
    console.log('\n');
  }

  if (validation.warnings.length > 0) {
    console.warn('⚠️  ADVERTENCIAS:');
    validation.warnings.forEach((warning) => console.warn(`  • ${warning}`));
    console.log('\n');
  }

  if (validation.valid) {
    console.log('✅ Todas las variables de entorno están correctamente configuradas\n');
  } else {
    console.error('\n❌ FALLA EN VALIDACIÓN DE ENTORNO');
    console.error('Por favor, revisa las instrucciones en .env.local.example\n');
    process.exit(1);
  }

  console.log('='.repeat(60) + '\n');
}

/**
 * HELPER: Generar ENCRYPTION_KEY segura
 */
export function generateEncryptionKey(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

/**
 * HELPER: Generar ENCRYPTION_IV segura
 */
export function generateEncryptionIV(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(16).toString('hex');
}
