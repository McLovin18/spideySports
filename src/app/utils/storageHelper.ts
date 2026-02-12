/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
/**
 * 🔐 STORAGE SECURITY HELPER - Utilidades de seguridad para Storage
 * 
 * Proporciona:
 * - Signed URLs (acceso temporal)
 * - Validación de contenido (magic bytes)
 * - Quotas por usuario
 * - Headers de seguridad
 */

import { bucket, db } from '@/app/utils/firebase';
import { doc, getDoc, updateDoc, increment, Timestamp } from 'firebase/firestore';

interface FileValidation {
  valid: boolean;
  error?: string;
  mimeType?: string;
  realType?: string;
}

interface UserStorageQuota {
  userId: string;
  used: number; // bytes
  limit: number; // bytes
  remaining: number;
  canUpload: boolean;
}

interface SignedURLResponse {
  url: string;
  expiresAt: Date;
  filename: string;
}

// Definir límites de almacenamiento (en bytes)
const QUOTAS = {
  avatar: 2 * 1024 * 1024, // 2MB
  productImage: 5 * 1024 * 1024, // 5MB
  userFile: 100 * 1024 * 1024, // 100MB
  blogImage: 10 * 1024 * 1024, // 10MB
  total: 500 * 1024 * 1024, // 500MB total por usuario
};

// Magic bytes para validar tipo de archivo real
const MAGIC_BYTES = {
  jpeg: { bytes: [0xFF, 0xD8, 0xFF], type: 'image/jpeg' },
  png: { bytes: [0x89, 0x50, 0x4E, 0x47], type: 'image/png' },
  gif: { bytes: [0x47, 0x49, 0x46], type: 'image/gif' },
  webp: { bytes: [0x52, 0x49, 0x46, 0x46], type: 'image/webp' },
  pdf: { bytes: [0x25, 0x50, 0x44, 0x46], type: 'application/pdf' },
};

/**
 * ✅ VALIDAR CONTENIDO REAL DEL ARCHIVO
 * 
 * Valida magic bytes para asegurar que el archivo es lo que dice ser
 * Previene ataques de tipo: .exe renombrado a .jpg
 */
export async function validateFileContent(
  filePath: string,
  expectedMimeType?: string
): Promise<FileValidation> {
  try {
    const file = bucket.file(filePath);
    const [buffer] = await file.download();

    // Obtener los primeros 4 bytes
    const header = buffer.slice(0, 4);

    // Buscar coincidencia con magic bytes conocidos
    for (const [name, signature] of Object.entries(MAGIC_BYTES)) {
      const sigBytes = Buffer.from(signature.bytes);
      if (buffer.slice(0, signature.bytes.length).equals(sigBytes)) {
        // Validar que el MIME type coincida
        if (expectedMimeType && !signature.type.includes(expectedMimeType.split('/')[0])) {
          return {
            valid: false,
            error: `Archivo no coincide: MIME "${expectedMimeType}" pero magic bytes indican "${signature.type}"`,
            mimeType: expectedMimeType,
            realType: signature.type,
          };
        }

        return {
          valid: true,
          mimeType: expectedMimeType || signature.type,
          realType: signature.type,
        };
      }
    }

    // Si no encontramos magic bytes conocidos, rechazar
    return {
      valid: false,
      error: 'Tipo de archivo no reconocido o inválido',
      mimeType: expectedMimeType,
    };
  } catch (error) {
    return {
      valid: false,
      error: `Error validando archivo: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * ✅ GENERAR SIGNED URL (acceso temporal)
 * 
 * Genera URL firmada que expira automáticamente
 * Más seguro que URLs directas permanentes
 * 
 * @param filePath Ruta en Storage
 * @param expirationMinutes Minutos hasta que expire (default 15)
 * @returns URL firmada y fecha de expiración
 */
export async function generateSignedURL(
  filePath: string,
  expirationMinutes: number = 15
): Promise<SignedURLResponse> {
  try {
    const file = bucket.file(filePath);

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expirationMinutes * 60 * 1000,
      // Headers adicionales de seguridad
      responseDisposition: `attachment; filename="${filePath.split('/').pop()}"`,
    });

    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    return {
      url,
      expiresAt,
      filename: filePath.split('/').pop() || 'file',
    };
  } catch (error) {
    console.error('❌ Error generando signed URL:', error);
    throw new Error(`No se pudo generar acceso temporal: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * ✅ OBTENER CUOTA DE ALMACENAMIENTO DEL USUARIO
 * 
 * Rastrear cuánto espacio está usando
 */
export async function getUserStorageQuota(userId: string, type: keyof typeof QUOTAS = 'total'): Promise<UserStorageQuota> {
  try {
    const userStorageRef = doc(db, 'storageQuotas', userId);
    const docSnap = await getDoc(userStorageRef);

    let used = 0;
    if (docSnap.exists()) {
      used = docSnap.data().totalUsed || 0;
    }

    const limit = QUOTAS[type];
    const remaining = Math.max(0, limit - used);

    return {
      userId,
      used,
      limit,
      remaining,
      canUpload: remaining > 0,
    };
  } catch (error) {
    console.error('❌ Error obteniendo cuota:', error);
    return {
      userId,
      used: 0,
      limit: QUOTAS.total,
      remaining: QUOTAS.total,
      canUpload: true,
    };
  }
}

/**
 * ✅ ACTUALIZAR CUOTA DESPUÉS DE SUBIDA
 * 
 * Registrar bytes usados
 */
export async function updateStorageUsage(userId: string, fileSize: number): Promise<void> {
  try {
    const userStorageRef = doc(db, 'storageQuotas', userId);
    await updateDoc(userStorageRef, {
      totalUsed: increment(fileSize),
      lastUpdated: Timestamp.now(),
    }).catch(async () => {
      // Si no existe el documento, crearlo
      await updateDoc(userStorageRef, {
        userId,
        totalUsed: fileSize,
        createdAt: Timestamp.now(),
        lastUpdated: Timestamp.now(),
      });
    });
  } catch (error) {
    console.error('⚠️  Error actualizando cuota:', error);
    // No fallar la operación por esto
  }
}

/**
 * ✅ VALIDAR QUE PUEDA SUBIR ARCHIVO
 * 
 * Verificar quota antes de permitir subida
 */
export async function canUploadFile(userId: string, fileSize: number, type: keyof typeof QUOTAS = 'total'): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const quota = await getUserStorageQuota(userId, type);

    if (fileSize > quota.limit) {
      return {
        allowed: false,
        reason: `Archivo excede límite de ${quota.limit / 1024 / 1024}MB`,
      };
    }

    if (fileSize > quota.remaining) {
      return {
        allowed: false,
        reason: `Espacio insuficiente. Disponible: ${quota.remaining / 1024 / 1024}MB, Necesario: ${fileSize / 1024 / 1024}MB`,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('❌ Error validando upload:', error);
    return { allowed: false, reason: 'Error validando espacio disponible' };
  }
}

/**
 * ✅ GENERAR HEADERS SEGUROS PARA DESCARGA
 */
export function getSecureDownloadHeaders() {
  return {
    'Content-Disposition': 'attachment',
    'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  };
}

/**
 * ✅ VALIDAR RUTA DE ARCHIVO (prevenir directory traversal)
 * 
 * Asegurar que no se intente acceder a archivos fuera del directorio permitido
 */
export function validateFilePath(path: string, allowedPrefix: string): boolean {
  // Prevenir directory traversal attacks
  if (path.includes('..') || path.startsWith('/')) {
    return false;
  }

  // Verificar que está dentro del prefijo permitido
  return path.startsWith(allowedPrefix);
}

/**
 * ✅ OBTENER INFO DEL ARCHIVO
 * 
 * Metadata: tamaño, tipo, fecha subida
 */
export async function getFileMetadata(filePath: string) {
  try {
    const file = bucket.file(filePath);
    const [metadata] = await file.getMetadata();

    return {
      name: metadata.name,
      size: parseInt(metadata.size || '0'),
      contentType: metadata.contentType,
      created: new Date(metadata.timeCreated),
      updated: new Date(metadata.updated),
      md5Hash: metadata.md5Hash,
    };
  } catch (error) {
    console.error('❌ Error obteniendo metadata:', error);
    return null;
  }
}

/**
 * 📊 INFORMACIÓN DE QUOTAS
 */
export function getQuotasInfo() {
  return {
    avatar: `${QUOTAS.avatar / 1024 / 1024}MB`,
    productImage: `${QUOTAS.productImage / 1024 / 1024}MB`,
    userFile: `${QUOTAS.userFile / 1024 / 1024}MB`,
    blogImage: `${QUOTAS.blogImage / 1024 / 1024}MB`,
    totalPerUser: `${QUOTAS.total / 1024 / 1024}MB`,
  };
}
