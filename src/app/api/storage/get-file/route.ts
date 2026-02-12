/**
 * 🔐 API ENDPOINT - Descarga segura de archivos con signed URLs
 * 
 * Ruta: POST /api/storage/get-file
 * 
 * Proporciona acceso temporal y controlado a archivos
 * - Valida autorización
 * - Genera signed URL temporal
 * - Audita el acceso
 * - Previene abuso
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateSignedURL, validateFilePath } from '@/app/utils/storageHelper';
import { logStorageAccess, isAuthorizedToAccessFile, detectSuspiciousActivity } from '@/app/utils/storageAudit';
import { getClientIP } from '@/app/utils/rateLimiter';
import { logAudit } from '@/app/utils/auditLogger';

interface GetFileRequest {
  filePath: string; // Ruta en storage: "avatars/userId/file.jpg"
  userId?: string;
  email?: string;
  expirationMinutes?: number; // 15 por defecto
}

interface GetFileResponse {
  success: boolean;
  url?: string;
  expiresAt?: string;
  message?: string;
  error?: string;
}

/**
 * POST /api/storage/get-file
 * 
 * Generar signed URL temporal para descargar archivo
 */
export async function POST(request: NextRequest): Promise<NextResponse<GetFileResponse>> {
  const clientIP = getClientIP(request);

  try {
    const body: GetFileRequest = await request.json();
    const { filePath, userId, email, expirationMinutes = 15 } = body;

    // ✅ VALIDAR ENTRADA
    if (!filePath || typeof filePath !== 'string') {
      await logAudit('STORAGE_GET_FILE_INVALID', { filePath, reason: 'Invalid path' }, request, {
        status: 'failed',
        severity: 'low',
      });
      return NextResponse.json(
        {
          success: false,
          error: 'filePath es requerido',
        },
        { status: 400 }
      );
    }

    // ✅ VALIDAR RUTA (prevenir directory traversal)
    if (!validateFilePath(filePath, '')) {
      console.warn(`🚨 INTENTO DE DIRECTORY TRAVERSAL: ${filePath}`);
      await logAudit('STORAGE_DIRECTORY_TRAVERSAL', { filePath, userId, email }, request, {
        status: 'blocked',
        severity: 'critical',
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Acceso denegado',
        },
        { status: 403 }
      );
    }

    // ✅ VALIDAR AUTORIZACIÓN
    const authorization = isAuthorizedToAccessFile(filePath, userId || '', email || '');
    if (!authorization.authorized) {
      console.warn(`🚨 ACCESO NO AUTORIZADO: ${authorization.reason}`);
      await logAudit('STORAGE_UNAUTHORIZED_ACCESS', 
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
          error: 'No tienes permiso para acceder a este archivo',
        },
        { status: 403 }
      );
    }

    // ✅ VALIDAR RATE LIMITING
    const { checkRateLimit } = await import('@/app/utils/rateLimiter');
    const rateLimitKey = `storage-download-${email || clientIP}`;
    const rateLimit = checkRateLimit(rateLimitKey, {
      maxRequests: 50, // 50 descargas por minuto
      windowMs: 60000,
    });

    if (!rateLimit.allowed) {
      console.warn(`⚠️  Rate limit excedido: ${email || clientIP}`);
      await logAudit('STORAGE_RATE_LIMIT', { filePath, email }, request, {
        status: 'blocked',
        severity: 'medium',
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Demasiadas solicitudes. Intenta más tarde.',
        },
        {
          status: 429,
          headers: { 'Retry-After': (rateLimit.retryAfter || 60).toString() },
        }
      );
    }

    // ✅ DETECTAR ACTIVIDAD SOSPECHOSA
    if (userId) {
      const suspicious = await detectSuspiciousActivity(userId);
      if (suspicious.suspicious) {
        console.warn(`⚠️  ACTIVIDAD SOSPECHOSA DETECTADA: ${email}`);
        console.warn(`   Issues: ${suspicious.issues.join(', ')}`);
        console.warn(`   Score: ${suspicious.score}/100`);

        if (suspicious.score > 70) {
          await logAudit('STORAGE_SUSPICIOUS_ACTIVITY', 
            { userId, email, issues: suspicious.issues, score: suspicious.score }, 
            request, 
            {
              status: 'suspicious',
              severity: 'high',
            }
          );
          return NextResponse.json(
            {
              success: false,
              error: 'Actividad inusual detectada. Contacta con soporte.',
            },
            { status: 403 }
          );
        }
      }
    }

    // ✅ GENERAR SIGNED URL
    const startTime = Date.now();
    const signedUrl = await generateSignedURL(filePath, expirationMinutes);
    const duration = Date.now() - startTime;

    // ✅ LOGUEAR ACCESO
    await logStorageAccess('DOWNLOAD', filePath, filePath.split('/').pop() || 'file', 0, request, {
      userId,
      email,
      status: 'success',
      duration,
    });

    await logAudit('STORAGE_GET_FILE_SUCCESS', 
      { filePath, userId, email, expirationMinutes }, 
      request, 
      {
        status: 'success',
        severity: 'low',
      }
    );

    return NextResponse.json(
      {
        success: true,
        url: signedUrl.url,
        expiresAt: signedUrl.expiresAt.toISOString(),
        message: `URL temporal válida por ${expirationMinutes} minutos`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Error en get-file:', error);

    await logAudit('STORAGE_GET_FILE_ERROR', 
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
        error: 'Error generando acceso al archivo',
      },
      { status: 500 }
    );
  }
}
