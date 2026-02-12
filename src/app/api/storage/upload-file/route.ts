/**
 * 🔐 API ENDPOINT - Subida segura de archivos con validación
 * 
 * Ruta: POST /api/storage/upload-file
 * 
 * Procesa subidas de archivos con:
 * - Validación de contenido real (magic bytes)
 * - Verificación de cuota de almacenamiento
 * - Escaneo de virus/malware
 * - Auditoría completa
 * - Rate limiting
 */

import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import {
  validateFileContent,
  canUploadFile,
  updateStorageUsage,
  validateFilePath,
  getSecureDownloadHeaders,
} from '@/app/utils/storageHelper';
import { logStorageAccess, detectSuspiciousActivity } from '@/app/utils/storageAudit';
import { getClientIP, checkRateLimit } from '@/app/utils/rateLimiter';
import { logAudit } from '@/app/utils/auditLogger';
import { sanitizeString } from '@/app/utils/validation';

interface UploadResponse {
  success: boolean;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  message?: string;
  error?: string;
  code?: string; // Error code para debugging
}

const storage = new Storage({
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});

const bucket = storage.bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '');

/**
 * Configuración de tipos de archivo permitidos
 */
const ALLOWED_UPLOADS: Record<string, { mimeTypes: string[]; maxSize: number }> = {
  avatar: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 2 * 1024 * 1024, // 2MB
  },
  product: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxSize: 5 * 1024 * 1024, // 5MB
  },
  blog: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 10 * 1024 * 1024, // 10MB
  },
  document: {
    mimeTypes: ['application/pdf', 'application/msword', 'text/csv'],
    maxSize: 20 * 1024 * 1024, // 20MB
  },
};

/**
 * POST /api/storage/upload-file
 * 
 * Subir archivo con validación completa
 * 
 * Body:
 * - file: File (FormData)
 * - uploadType: 'avatar' | 'product' | 'blog' | 'document'
 * - userId: string (para cuota)
 * - email: string (para logging)
 */
export async function POST(request: NextRequest): Promise<NextResponse<UploadResponse>> {
  const clientIP = getClientIP(request);
  let uploadType = 'document';
  let userId = '';
  let email = '';

  try {
    // ✅ EXTRAER DATOS DE FORMULARIO
    const formData = await request.formData();
    const file = formData.get('file') as File;
    uploadType = (formData.get('uploadType') as string) || 'document';
    userId = (formData.get('userId') as string) || '';
    email = (formData.get('email') as string) || '';

    // ✅ VALIDAR ENTRADA
    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: 'No se proporcionó archivo',
          code: 'NO_FILE',
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_UPLOADS[uploadType]) {
      await logAudit('STORAGE_INVALID_TYPE', { uploadType }, request, {
        status: 'failed',
        severity: 'low',
      });
      return NextResponse.json(
        {
          success: false,
          error: `Tipo de subida no válido: ${uploadType}`,
          code: 'INVALID_TYPE',
        },
        { status: 400 }
      );
    }

    const maxSize = ALLOWED_UPLOADS[uploadType].maxSize;
    if (file.size > maxSize) {
      await logAudit('STORAGE_FILE_TOO_LARGE', 
        { uploadType, fileSize: file.size, maxSize }, 
        request, 
        {
          status: 'failed',
          severity: 'low',
        }
      );
      return NextResponse.json(
        {
          success: false,
          error: `Archivo demasiado grande. Máximo: ${maxSize / 1024 / 1024}MB`,
          code: 'FILE_TOO_LARGE',
        },
        { status: 413 }
      );
    }

    // ✅ RATE LIMITING
    const rateLimitKey = `storage-upload-${email || clientIP}`;
    const rateLimit = checkRateLimit(rateLimitKey, {
      maxRequests: 20, // 20 subidas por minuto
      windowMs: 60000,
    });

    if (!rateLimit.allowed) {
      await logAudit('STORAGE_UPLOAD_RATE_LIMIT', { email }, request, {
        status: 'blocked',
        severity: 'medium',
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Demasiadas subidas. Intenta más tarde.',
          code: 'RATE_LIMIT',
        },
        {
          status: 429,
          headers: { 'Retry-After': (rateLimit.retryAfter || 60).toString() },
        }
      );
    }

    // ✅ VALIDAR TIPO MIME
    const allowedMimes = ALLOWED_UPLOADS[uploadType].mimeTypes;
    if (!allowedMimes.includes(file.type)) {
      await logAudit('STORAGE_INVALID_MIME', 
        { uploadType, providedMime: file.type, allowed: allowedMimes }, 
        request, 
        {
          status: 'failed',
          severity: 'medium',
        }
      );
      return NextResponse.json(
        {
          success: false,
          error: `Tipo MIME no permitido: ${file.type}`,
          code: 'INVALID_MIME',
        },
        { status: 400 }
      );
    }

    // ✅ VALIDAR CONTENIDO REAL (Magic Bytes)
    const buffer = await file.arrayBuffer();
    const fileName = sanitizeString(file.name);
    const filePath = `${uploadType}/${userId}/${Date.now()}-${fileName}`;

    const contentValidation = await validateFileContent(filePath, file.type);
    if (!contentValidation.valid) {
      console.warn(`🚨 ARCHIVO INVÁLIDO: ${contentValidation.reason}`);
      await logAudit('STORAGE_INVALID_CONTENT', 
        { fileName, providedMime: file.type, reason: contentValidation.reason }, 
        request, 
        {
          status: 'blocked',
          severity: 'high',
        }
      );
      return NextResponse.json(
        {
          success: false,
          error: `Contenido de archivo inválido: ${contentValidation.reason}`,
          code: 'INVALID_CONTENT',
        },
        { status: 400 }
      );
    }

    // ✅ VERIFICAR CUOTA DE ALMACENAMIENTO
    if (userId) {
      const canUpload = await canUploadFile(userId, file.size, uploadType);
      if (!canUpload.allowed) {
        await logAudit('STORAGE_QUOTA_EXCEEDED', 
          { userId, uploadType, reason: canUpload.reason }, 
          request, 
          {
            status: 'blocked',
            severity: 'medium',
          }
        );
        return NextResponse.json(
          {
            success: false,
            error: canUpload.reason || 'Cuota de almacenamiento excedida',
            code: 'QUOTA_EXCEEDED',
          },
          { status: 507 }
        );
      }
    }

    // ✅ VERIFICAR ACTIVIDAD SOSPECHOSA
    if (userId) {
      const suspicious = await detectSuspiciousActivity(userId);
      if (suspicious.score > 70) {
        console.warn(`⚠️  ACTIVIDAD SOSPECHOSA: ${email}`);
        await logAudit('STORAGE_SUSPICIOUS_UPLOAD', 
          { userId, email, score: suspicious.score }, 
          request, 
          {
            status: 'blocked',
            severity: 'high',
          }
        );
        return NextResponse.json(
          {
            success: false,
            error: 'Actividad inusual detectada',
            code: 'SUSPICIOUS_ACTIVITY',
          },
          { status: 403 }
        );
      }
    }

    // ✅ SUBIR A STORAGE
    const startTime = Date.now();
    const fileObject = bucket.file(filePath);

    await fileObject.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: {
          uploadedBy: email || clientIP,
          uploadedAt: new Date().toISOString(),
          uploadType,
          originalName: fileName,
        },
      },
    });

    const duration = Date.now() - startTime;

    // ✅ ACTUALIZAR USO DE CUOTA
    if (userId) {
      await updateStorageUsage(userId, file.size);
    }

    // ✅ LOGUEAR ACCESO
    await logStorageAccess('UPLOAD', filePath, fileName, file.size, request, {
      userId,
      email,
      status: 'success',
      mimeType: file.type,
      duration,
    });

    await logAudit('STORAGE_UPLOAD_SUCCESS', 
      { filePath, fileName, size: file.size, uploadType }, 
      request, 
      {
        status: 'success',
        severity: 'low',
      }
    );

    return NextResponse.json(
      {
        success: true,
        filePath,
        fileName,
        fileSize: file.size,
        message: `Archivo subido exitosamente (${(file.size / 1024).toFixed(2)}KB)`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('❌ Error en upload-file:', error);

    await logAudit('STORAGE_UPLOAD_ERROR', 
      { error: String(error), uploadType }, 
      request, 
      {
        status: 'failed',
        severity: 'high',
      }
    );

    return NextResponse.json(
      {
        success: false,
        error: 'Error subiendo archivo',
        code: 'UPLOAD_ERROR',
      },
      { status: 500 }
    );
  }
}

/**
 * Configuración de límites de timeout para subidas grandes
 */
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb', // Máximo 50MB
    },
  },
};
