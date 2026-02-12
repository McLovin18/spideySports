/**
 * 🔐 API ENDPOINT - Eliminación segura de archivos
 * 
 * Ruta: POST /api/storage/delete-file
 * 
 * Elimina archivos de Storage con:
 * - Validación de autorización
 * - Prevención de directory traversal
 * - Auditoría completa
 * - Rate limiting
 */

import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { validateFilePath } from '@/app/utils/storageHelper';
import { logStorageAccess, isAuthorizedToAccessFile } from '@/app/utils/storageAudit';
import { getClientIP, checkRateLimit } from '@/app/utils/rateLimiter';
import { logAudit } from '@/app/utils/auditLogger';

interface DeleteFileRequest {
  filePath: string;
  userId?: string;
  email?: string;
}

interface DeleteFileResponse {
  success: boolean;
  message?: string;
  error?: string;
  code?: string;
}

const storage = new Storage({
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});

const bucket = storage.bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '');

/**
 * POST /api/storage/delete-file
 * 
 * Eliminar archivo de forma segura
 */
export async function POST(request: NextRequest): Promise<NextResponse<DeleteFileResponse>> {
  const clientIP = getClientIP(request);

  try {
    const body: DeleteFileRequest = await request.json();
    const { filePath, userId, email } = body;

    // ✅ VALIDAR ENTRADA
    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'filePath es requerido',
          code: 'MISSING_FILEPATH',
        },
        { status: 400 }
      );
    }

    // ✅ VALIDAR RUTA (prevenir directory traversal)
    if (!validateFilePath(filePath, '')) {
      console.warn(`🚨 INTENTO DE DIRECTORY TRAVERSAL AL ELIMINAR: ${filePath}`);
      await logAudit('STORAGE_DELETE_DIRECTORY_TRAVERSAL', { filePath }, request, {
        status: 'blocked',
        severity: 'critical',
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Acceso denegado',
          code: 'PATH_TRAVERSAL',
        },
        { status: 403 }
      );
    }

    // ✅ VALIDAR AUTORIZACIÓN
    const authorization = isAuthorizedToAccessFile(filePath, userId || '', email || '');
    if (!authorization.authorized) {
      console.warn(`🚨 INTENTO DE ELIMINAR ARCHIVO NO AUTORIZADO: ${filePath}`);
      await logAudit('STORAGE_DELETE_UNAUTHORIZED', 
        { filePath, userId, email, reason: authorization.reason }, 
        request, 
        {
          status: 'blocked',
          severity: 'high',
        }
      );
      return NextResponse.json(
        {
          success: false,
          error: 'No tienes permiso para eliminar este archivo',
          code: 'UNAUTHORIZED',
        },
        { status: 403 }
      );
    }

    // ✅ RATE LIMITING
    const rateLimitKey = `storage-delete-${email || clientIP}`;
    const rateLimit = checkRateLimit(rateLimitKey, {
      maxRequests: 50, // 50 eliminaciones por minuto
      windowMs: 60000,
    });

    if (!rateLimit.allowed) {
      await logAudit('STORAGE_DELETE_RATE_LIMIT', { email }, request, {
        status: 'blocked',
        severity: 'medium',
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Demasiadas solicitudes. Intenta más tarde.',
          code: 'RATE_LIMIT',
        },
        {
          status: 429,
          headers: { 'Retry-After': (rateLimit.retryAfter || 60).toString() },
        }
      );
    }

    // ✅ VERIFICAR QUE EL ARCHIVO EXISTE
    const fileObject = bucket.file(filePath);
    const [exists] = await fileObject.exists();

    if (!exists) {
      await logAudit('STORAGE_DELETE_NOT_FOUND', { filePath }, request, {
        status: 'failed',
        severity: 'low',
      });
      return NextResponse.json(
        {
          success: false,
          error: 'El archivo no existe',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      );
    }

    // ✅ ELIMINAR ARCHIVO
    const startTime = Date.now();
    await fileObject.delete();
    const duration = Date.now() - startTime;

    // ✅ LOGUEAR ACCESO
    const fileName = filePath.split('/').pop() || 'file';
    await logStorageAccess('DELETE', filePath, fileName, 0, request, {
      userId,
      email,
      status: 'success',
      duration,
    });

    await logAudit('STORAGE_DELETE_SUCCESS', 
      { filePath, fileName }, 
      request, 
      {
        status: 'success',
        severity: 'low',
      }
    );

    return NextResponse.json(
      {
        success: true,
        message: `Archivo eliminado exitosamente`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Error en delete-file:', error);

    await logAudit('STORAGE_DELETE_ERROR', 
      { error: String(error) }, 
      request, 
      {
        status: 'failed',
        severity: 'high',
      }
    );

    return NextResponse.json(
      {
        success: false,
        error: 'Error eliminando archivo',
        code: 'DELETE_ERROR',
      },
      { status: 500 }
    );
  }
}
