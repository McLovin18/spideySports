/**
 * 🔐 2FA - TWO-FACTOR AUTHENTICATION SYSTEM
 * 
 * Implementa TOTP (Time-based One-Time Password)
 * Compatible con: Google Authenticator, Microsoft Authenticator, Authy
 * 
 * Basado en RFC 6238
 */

import crypto from 'crypto';
import base32 from 'base32';

interface TOTPOptions {
  issuer?: string;
  accountName?: string;
  window?: number; // Ventana de validación (30 segundos por defecto)
  digits?: number; // Dígitos del código OTP (6 por defecto)
}

interface TwoFASetup {
  secret: string; // Secreto en base32 para guardar
  qrCode: string; // Código QR como URL (para escanear)
  backupCodes: string[]; // Códigos de backup por si pierdes acceso
  manualEntry: string; // Para entrada manual si no funciona QR
}

interface TwoFAVerification {
  valid: boolean;
  message?: string;
  remainingAttempts?: number;
}

const DEFAULT_OPTIONS: TOTPOptions = {
  issuer: 'Spidey Sports',
  window: 30, // RFC 6238 default
  digits: 6,
};

/**
 * Generar secreto TOTP aleatorio
 * 
 * @returns Secreto en base32
 */
export function generateTOTPSecret(length: number = 32): string {
  const buffer = crypto.randomBytes(length);
  return base32.encode(buffer).toString().replace(/=/g, '');
}

/**
 * Generar códigos de backup (para recuperación)
 * 
 * En caso de que el usuario pierda acceso a su autenticador
 * 
 * @returns Array de códigos backup
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/**
 * Generar código TOTP basado en tiempo actual
 * 
 * @param secret - Secreto base32
 * @param time - Timestamp (por defecto: ahora)
 * @returns Código OTP de 6 dígitos
 */
function generateTOTPCode(secret: string, time: number = Date.now()): string {
  const window = Math.floor(time / 1000 / DEFAULT_OPTIONS.window!);
  const secretBuffer = base32.decode(secret);

  const hmac = crypto.createHmac('sha1', secretBuffer);
  hmac.update(Buffer.from(window.toString(16).padStart(16, '0'), 'hex'));

  const hmacValue = hmac.digest();
  const offset = hmacValue[hmacValue.length - 1] & 0x0f;

  const code =
    (hmacValue[offset] & 0x7f) << 24 |
    (hmacValue[offset + 1] & 0xff) << 16 |
    (hmacValue[offset + 2] & 0xff) << 8 |
    (hmacValue[offset + 3] & 0xff);

  return (code % Math.pow(10, DEFAULT_OPTIONS.digits!)).toString().padStart(DEFAULT_OPTIONS.digits!, '0');
}

/**
 * ✅ CONFIGURAR 2FA PARA UN USUARIO
 * 
 * Devuelve QR code para escanear y códigos de backup
 * 
 * @param email - Email del usuario
 * @param userId - ID del usuario en DB
 * @returns Setup con QR code y backup codes
 */
export function setupTwoFA(email: string, userId: string): TwoFASetup {
  const secret = generateTOTPSecret();
  const backupCodes = generateBackupCodes();

  // Generar código QR usando URL protocol
  // https://github.com/google/google-authenticator/wiki/Key-Uri-Format
  const otpauthUrl = getOTPAuthURL(secret, email, userId);

  // En producción, generar QR con librería como `qrcode`
  // Por ahora, retornamos la URL que puede ser convertida a QR

  return {
    secret,
    qrCode: otpauthUrl,
    backupCodes,
    manualEntry: secret, // Para entrada manual
  };
}

/**
 * Generar URL otpauth:// para Google Authenticator
 */
function getOTPAuthURL(secret: string, email: string, userId: string): string {
  const issuer = encodeURIComponent(DEFAULT_OPTIONS.issuer || 'Spidey Sports');
  const accountName = encodeURIComponent(`${email} (${userId})`);

  return (
    `otpauth://totp/${issuer}:${accountName}?` +
    `secret=${secret}&` +
    `issuer=${issuer}&` +
    `algorithm=SHA1&` +
    `digits=${DEFAULT_OPTIONS.digits}&` +
    `period=${DEFAULT_OPTIONS.window}`
  );
}

/**
 * ✅ VERIFICAR CÓDIGO 2FA
 * 
 * Valida que el código ingresado sea correcto
 * Permite ventana de ±30 segundos para sincronización
 * 
 * @param secret - Secreto base32 del usuario
 * @param code - Código de 6 dígitos ingresado
 * @returns Validación del código
 */
export function verify2FACode(secret: string, code: string): boolean {
  if (!secret || !code || code.length !== 6) {
    return false;
  }

  // Obtener tiempo actual y calcular ventana
  const now = Date.now();
  const window = DEFAULT_OPTIONS.window || 30;

  // Permitir ±1 ventana (30s antes y después)
  // Esto es por sincronización de reloj
  for (let i = -1; i <= 1; i++) {
    const time = now + i * window * 1000;
    const expectedCode = generateTOTPCode(secret, time);

    if (code === expectedCode) {
      return true;
    }
  }

  return false;
}

/**
 * ✅ VERIFICAR CÓDIGO DE BACKUP
 * 
 * @param code - Código backup ingresado
 * @param storedCodes - Códigos almacenados (encriptados idealmente)
 * @returns true si es válido y se encuentra
 */
export function verifyBackupCode(code: string, storedCodes: string[]): boolean {
  // Normalizar código (remover espacios)
  const normalizedCode = code.replace(/\s/g, '').toUpperCase();

  // Buscar en códigos almacenados
  return storedCodes.some((stored) => {
    const normalizedStored = stored.replace(/\s/g, '').toUpperCase();
    return normalizedCode === normalizedStored;
  });
}

/**
 * 🔴 DESHABILITAR 2FA
 * 
 * Requiere autenticación adicional (contraseña o código actual)
 */
export function disableTwoFA(secret: string, currentCode: string): boolean {
  // Verificar que el código actual sea válido
  return verify2FACode(secret, currentCode);
}

/**
 * 🔍 OBTENER INFORMACIÓN DE 2FA
 */
export function getTwoFAInfo(secret?: string): {
  enabled: boolean;
  isConfigured: boolean;
  expiresIn?: number;
  nextCode?: string;
} {
  if (!secret) {
    return {
      enabled: false,
      isConfigured: false,
    };
  }

  const now = Date.now();
  const window = DEFAULT_OPTIONS.window || 30;
  const expiresIn = window * 1000 - (now % (window * 1000));

  return {
    enabled: true,
    isConfigured: true,
    expiresIn: Math.round(expiresIn / 1000), // segundos
    nextCode: generateTOTPCode(secret),
  };
}

/**
 * 📊 GENERAR CÓDIGOS DE PRUEBA (solo desarrollo)
 * 
 * Para testing sin escaneador
 */
export function generateTestCodes(secret: string, count: number = 5): { time: string; code: string }[] {
  const codes = [];
  const window = DEFAULT_OPTIONS.window || 30;

  for (let i = 0; i < count; i++) {
    const time = Date.now() + i * window * 1000;
    const code = generateTOTPCode(secret, time);
    codes.push({
      time: new Date(time).toISOString(),
      code,
    });
  }

  return codes;
}

/**
 * 🔐 HASH DEL SECRETO (para almacenamiento seguro)
 */
export function hashTOTPSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * ✅ VALIDACIÓN DE 2FA
 * 
 * Interface para manejo completo de 2FA
 */
export interface TwoFAValidator {
  setupTwoFA(email: string, userId: string): TwoFASetup;
  verify(secret: string, code: string): TwoFAVerification;
  verifyBackup(code: string, storedCodes: string[]): TwoFAVerification;
  disable(secret: string, currentCode: string): TwoFAVerification;
}

export const TwoFAValidator: TwoFAValidator = {
  setupTwoFA(email: string, userId: string): TwoFASetup {
    return setupTwoFA(email, userId);
  },

  verify(secret: string, code: string): TwoFAVerification {
    const isValid = verify2FACode(secret, code);
    return {
      valid: isValid,
      message: isValid ? '✅ Código válido' : '❌ Código inválido',
    };
  },

  verifyBackup(code: string, storedCodes: string[]): TwoFAVerification {
    const isValid = verifyBackupCode(code, storedCodes);
    return {
      valid: isValid,
      message: isValid ? '✅ Código backup válido' : '❌ Código backup inválido',
      remainingAttempts: isValid ? storedCodes.length - 1 : storedCodes.length,
    };
  },

  disable(secret: string, currentCode: string): TwoFAVerification {
    const isValid = disableTwoFA(secret, currentCode);
    return {
      valid: isValid,
      message: isValid ? '✅ 2FA deshabilitado' : '❌ Código inválido, 2FA no deshabilitado',
    };
  },
};
