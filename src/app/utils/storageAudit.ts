/**
 * 📊 STORAGE AUDIT - Auditoría de acceso a archivos
 * 
 * Registra quién accedió a qué archivo, cuándo y desde dónde
 * Esencial para:
 * - Detectar acceso sospechoso
 * - Compliance (GDPR, etc)
 * - Investigación de incidentes
 */

import { collection, addDoc, query, where, getDocs, Timestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '@/app/utils/firebase';
import { NextRequest } from 'next/server';

interface StorageAccessLog {
  id?: string;
  userId?: string;
  email?: string;
  action: 'UPLOAD' | 'DOWNLOAD' | 'DELETE' | 'RENAME' | 'VIEW_METADATA';
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  status: 'success' | 'failed';
  reason?: string; // Por qué falló
  ipAddress: string;
  userAgent?: string;
  timestamp: Timestamp;
  duration?: number; // milisegundos
}

/**
 * ✅ LOGUEAR ACCESO A ARCHIVO
 */
export async function logStorageAccess(
  action: StorageAccessLog['action'],
  filePath: string,
  fileName: string,
  fileSize: number,
  request: NextRequest,
  options?: {
    userId?: string;
    email?: string;
    status?: 'success' | 'failed';
    reason?: string;
    mimeType?: string;
    duration?: number;
  }
): Promise<void> {
  try {
    // Extraer IP del cliente
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const accessLog: StorageAccessLog = {
      userId: options?.userId,
      email: options?.email,
      action,
      filePath,
      fileName,
      fileSize,
      mimeType: options?.mimeType,
      status: options?.status || 'success',
      reason: options?.reason,
      ipAddress: ipAddress.trim(),
      userAgent: request.headers.get('user-agent') || undefined,
      timestamp: Timestamp.now(),
      duration: options?.duration,
    };

    // Guardar en Firestore
    const logsRef = collection(db, 'storageAccessLogs');
    await addDoc(logsRef, accessLog);

    console.log(`📁 Storage audit: ${action} - ${filePath} by ${options?.email || 'anonymous'}`);
  } catch (error) {
    console.error('❌ Error loguando acceso:', error);
    // No fallar la operación principal
  }
}

/**
 * ✅ OBTENER LOGS DE ACCESO POR USUARIO
 */
export async function getUserStorageAccessLogs(
  userId: string,
  options?: {
    limit?: number;
    action?: StorageAccessLog['action'];
    days?: number;
  }
): Promise<StorageAccessLog[]> {
  try {
    const logsRef = collection(db, 'storageAccessLogs');
    const daysAgo = (options?.days || 30) * 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - daysAgo);

    const constraints = [
      where('userId', '==', userId),
      where('timestamp', '>=', Timestamp.fromDate(since)),
      orderBy('timestamp', 'desc'),
      limit(options?.limit || 100),
    ];

    if (options?.action) {
      constraints.push(where('action', '==', options.action));
    }

    const q = query(logsRef, ...constraints);
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as StorageAccessLog[];
  } catch (error) {
    console.error('❌ Error obteniendo logs:', error);
    return [];
  }
}

/**
 * ✅ OBTENER LOGS DE ACCESO POR EMAIL
 */
export async function getEmailStorageAccessLogs(
  email: string,
  options?: {
    limit?: number;
    days?: number;
  }
): Promise<StorageAccessLog[]> {
  try {
    const logsRef = collection(db, 'storageAccessLogs');
    const daysAgo = (options?.days || 30) * 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - daysAgo);

    const q = query(
      logsRef,
      where('email', '==', email),
      where('timestamp', '>=', Timestamp.fromDate(since)),
      orderBy('timestamp', 'desc'),
      limit(options?.limit || 100)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as StorageAccessLog[];
  } catch (error) {
    console.error('❌ Error obteniendo logs:', error);
    return [];
  }
}

/**
 * ✅ DETECTAR ACTIVIDAD SOSPECHOSA
 * 
 * Analizar logs para patrones de riesgo
 */
export async function detectSuspiciousActivity(userId: string): Promise<{
  suspicious: boolean;
  issues: string[];
  score: number;
}> {
  try {
    const logs = await getUserStorageAccessLogs(userId, { days: 1, limit: 100 });
    const issues: string[] = [];
    let score = 0;

    // 1. Múltiples descargas fallidas
    const failedDownloads = logs.filter((l) => l.action === 'DOWNLOAD' && l.status === 'failed').length;
    if (failedDownloads > 10) {
      issues.push(`${failedDownloads} descargas fallidas en 24 horas`);
      score += 20;
    }

    // 2. Muchas operaciones en poco tiempo
    if (logs.length > 50) {
      issues.push(`${logs.length} operaciones en 24 horas (excepto)`);
      score += 15;
    }

    // 3. Acceso a múltiples IPs diferentes
    const uniqueIPs = new Set(logs.map((l) => l.ipAddress)).size;
    if (uniqueIPs > 5) {
      issues.push(`Acceso desde ${uniqueIPs} direcciones IP diferentes`);
      score += 10;
    }

    // 4. Patrones de escaneo (acceso a archivos no existentes)
    const failedAccess = logs.filter((l) => l.status === 'failed' && l.reason?.includes('not found')).length;
    if (failedAccess > 20) {
      issues.push(`Intento de acceso a ${failedAccess} archivos no encontrados`);
      score += 25;
    }

    // 5. Horario inusual
    const hour = new Date().getHours();
    if (hour < 5 || hour > 23) {
      if (logs.length > 10) {
        issues.push(`Actividad en horario inusual (${hour}:00)`);
        score += 10;
      }
    }

    return {
      suspicious: score >= 40,
      issues,
      score: Math.min(100, score),
    };
  } catch (error) {
    console.error('❌ Error detectando actividad:', error);
    return { suspicious: false, issues: [], score: 0 };
  }
}

/**
 * 📊 ESTADÍSTICAS DE ALMACENAMIENTO
 */
export async function getStorageStats(userId: string): Promise<{
  totalAccess: number;
  uploads: number;
  downloads: number;
  deletes: number;
  failures: number;
  lastAccess?: Date;
  mostAccessedFile?: string;
}> {
  try {
    const logs = await getUserStorageAccessLogs(userId, { days: 90, limit: 1000 });

    const stats = {
      totalAccess: logs.length,
      uploads: logs.filter((l) => l.action === 'UPLOAD').length,
      downloads: logs.filter((l) => l.action === 'DOWNLOAD').length,
      deletes: logs.filter((l) => l.action === 'DELETE').length,
      failures: logs.filter((l) => l.status === 'failed').length,
      lastAccess: logs.length > 0 ? logs[0].timestamp.toDate() : undefined,
      mostAccessedFile:
        logs.length > 0
          ? Object.keys(
              logs.reduce(
                (acc, log) => ({
                  ...acc,
                  [log.filePath]: (acc[log.filePath] || 0) + 1,
                }),
                {} as Record<string, number>
              )
            ).sort(
              (a, b) =>
                (logs.reduce((c, l) => (l.filePath === b ? c + 1 : c), 0) || 0) -
                (logs.reduce((c, l) => (l.filePath === a ? c + 1 : c), 0) || 0)
            )[0]
          : undefined,
    };

    return stats;
  } catch (error) {
    console.error('❌ Error obteniendo stats:', error);
    return {
      totalAccess: 0,
      uploads: 0,
      downloads: 0,
      deletes: 0,
      failures: 0,
    };
  }
}

/**
 * 🔐 VALIDAR ACCESO AUTORIZADO
 * 
 * Verificar que el usuario tiene derecho a acceder al archivo
 */
export function isAuthorizedToAccessFile(
  filePath: string,
  userId: string,
  email: string
): { authorized: boolean; reason?: string } {
  // Archivos públicos
  if (filePath.startsWith('products/') || filePath.startsWith('public/')) {
    return { authorized: true };
  }

  // Archivos propios del usuario
  if (filePath.startsWith(`users/${userId}/`) || filePath.startsWith(`avatars/${userId}/`)) {
    return { authorized: true };
  }

  // Archivos temporales
  if (filePath.startsWith(`temp/${userId}/`)) {
    return { authorized: true };
  }

  // No autorizado
  return {
    authorized: false,
    reason: `Usuario ${email} intentó acceder a ${filePath}`,
  };
}
