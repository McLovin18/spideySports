/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
/**
 * 🔐 ENCRYPTION UTILS - Encriptación de datos sensibles
 * 
 * Proporciona funciones para encriptar/desencriptar datos sensibles
 * usando AES-256-CBC (estándar militar).
 * 
 * Uso:
 * - Datos de usuarios (SSN, DOB, etc)
 * - Información de pagos (últimos 4 dígitos)
 * - Direcciones privadas
 * - Tokens de sesión
 */

import crypto from 'crypto';

interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
}

interface EncryptedData {
  iv: string; // Initialization Vector en hex
  encrypted: string; // Datos encriptados en hex
  tag?: string; // GCM authentication tag
}

const CONFIG: EncryptionConfig = {
  algorithm: 'aes-256-cbc',
  keyLength: 32, // 256 bits
  ivLength: 16, // 128 bits
};

/**
 * Validar que la clave de encriptación esté configurada y sea válida
 */
function getEncryptionKey(): Buffer {
  const keyString = process.env.ENCRYPTION_KEY;

  if (!keyString) {
    throw new Error(
      '🔐 ENCRYPTION_KEY no está configurada. ' +
        'Genera una con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  if (keyString.length !== 64) {
    throw new Error(`ENCRYPTION_KEY debe ser 64 caracteres hex (32 bytes), tienes: ${keyString.length}`);
  }

  return Buffer.from(keyString, 'hex');
}

/**
 * Validar que el IV esté configurado (opcional, se puede generar)
 */
function getOrGenerateIV(): Buffer {
  const ivString = process.env.ENCRYPTION_IV;

  if (ivString) {
    if (ivString.length !== 32) {
      throw new Error(`ENCRYPTION_IV debe ser 32 caracteres hex (16 bytes), tienes: ${ivString.length}`);
    }
    return Buffer.from(ivString, 'hex');
  }

  // Generar IV aleatorio si no está configurado
  return crypto.randomBytes(CONFIG.ivLength);
}

/**
 * ✅ ENCRIPTAR datos sensibles
 *
 * @param plaintext - Texto a encriptar
 * @returns Objeto con IV y datos encriptados
 *
 * Ejemplo:
 * ```typescript
 * const encrypted = encrypt('SSN 123-45-6789');
 * // { iv: 'a1b2c3...', encrypted: 'x9y8z7...' }
 * ```
 */
export function encrypt(plaintext: string): EncryptedData {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(CONFIG.ivLength);

    const cipher = crypto.createCipheriv(CONFIG.algorithm, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      iv: iv.toString('hex'),
      encrypted,
    };
  } catch (error) {
    console.error('❌ Error encriptando:', error);
    throw error;
  }
}

/**
 * ✅ DESENCRIPTAR datos
 *
 * @param encryptedData - Objeto con IV y datos encriptados
 * @returns Texto plano desencriptado
 *
 * Ejemplo:
 * ```typescript
 * const plaintext = decrypt({ iv: 'a1b2c3...', encrypted: 'x9y8z7...' });
 * // 'SSN 123-45-6789'
 * ```
 */
export function decrypt(encryptedData: EncryptedData): string {
  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(encryptedData.iv, 'hex');

    const decipher = crypto.createDecipheriv(CONFIG.algorithm, key, iv);

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('❌ Error desencriptando:', error);
    throw error;
  }
}

/**
 * ✅ ENCRIPTAR y serializar a JSON
 *
 * Útil para guardar en Firestore
 *
 * @param plaintext - Texto a encriptar
 * @returns String JSON serializado
 */
export function encryptToJSON(plaintext: string): string {
  const encrypted = encrypt(plaintext);
  return JSON.stringify(encrypted);
}

/**
 * ✅ DESENCRIPTAR de JSON
 *
 * @param jsonString - String JSON serializado
 * @returns Texto plano
 */
export function decryptFromJSON(jsonString: string): string {
  try {
    const encryptedData = JSON.parse(jsonString) as EncryptedData;
    return decrypt(encryptedData);
  } catch (error) {
    console.error('❌ Error desencriptando JSON:', error);
    throw error;
  }
}

/**
 * 🔐 HASH de datos (unidireccional)
 *
 * Usar para:
 * - Verificar integridad de datos
 * - Comparar sin exposición
 * - Almacenar sin poder recuperar
 *
 * Ejemplo:
 * ```typescript
 * const emailHash = hash('user@example.com');
 * // Comparar: hash('user@example.com') === emailHash
 * ```
 */
export function hash(data: string, algorithm: string = 'sha256'): string {
  return crypto.createHash(algorithm).update(data).digest('hex');
}

/**
 * 🔐 GENERAR SALT para hashing
 *
 * Usar para bcrypt/scrypt
 */
export function generateSalt(rounds: number = 10): Promise<string> {
  const bcrypt = require('bcrypt');
  return bcrypt.genSalt(rounds);
}

/**
 * 🔐 HASH CON SALT (bcrypt)
 *
 * Usar para contraseñas
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = require('bcrypt');
  return bcrypt.hash(password, 10);
}

/**
 * 🔐 VERIFICAR PASSWORD (bcrypt)
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = require('bcrypt');
  return bcrypt.compare(password, hash);
}

/**
 * 🔐 GENERAR TOKEN SEGURO
 *
 * Para tokens de sesión, reset password, etc
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * 🔐 MASK / REDACTAR datos sensibles
 *
 * Para logging sin exponerlos
 *
 * Ejemplo:
 * ```typescript
 * maskEmail('user@example.com'); // 'u***@example.com'
 * maskSSN('123-45-6789');        // '***-**-6789'
 * ```
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `***@${domain}`;
  return `${local.charAt(0)}***@${domain}`;
}

export function maskSSN(ssn: string): string {
  const digits = ssn.replace(/\D/g, '');
  if (digits.length !== 9) return '***-**-****';
  return `***-**-${digits.slice(5)}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***-****';
  return `***-***-${digits.slice(-4)}`;
}

export function maskCreditCard(cc: string): string {
  const digits = cc.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `****-****-****-${digits.slice(-4)}`;
}

/**
 * 🧪 FUNCIONES DE TESTING
 * (Solo para desarrollo)
 */

export function generateTestEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateTestEncryptionIV(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 📊 INFORMACIÓN DE ENCRIPTACIÓN
 */
export function getEncryptionInfo(): {
  algorithm: string;
  keyLengthBits: number;
  ivLengthBits: number;
  keyConfigured: boolean;
  ivConfigured: boolean;
} {
  return {
    algorithm: CONFIG.algorithm,
    keyLengthBits: CONFIG.keyLength * 8,
    ivLengthBits: CONFIG.ivLength * 8,
    keyConfigured: !!process.env.ENCRYPTION_KEY,
    ivConfigured: !!process.env.ENCRYPTION_IV,
  };
}

/**
 * 🧹 LIMPIAR DATOS SENSIBLES EN MEMORIA
 * (Mejor esfuerzo - Node.js no garantiza)
 */
export function secureClean(data: any): void {
  if (Buffer.isBuffer(data)) {
    data.fill(0);
  } else if (typeof data === 'string') {
    // No se puede limpiar strings en JavaScript
    console.warn('⚠️  No se pueden limpiar strings automáticamente en Node.js');
  } else if (typeof data === 'object') {
    Object.keys(data).forEach((key) => {
      secureClean(data[key]);
      delete data[key];
    });
  }
}
