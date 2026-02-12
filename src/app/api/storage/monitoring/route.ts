/**
 * 🔐 API ENDPOINT - Monitoreo de actividad y estadísticas de Storage
 * 
 * Ruta: GET /api/storage/monitoring
 * 
 * Proporciona:
 * - Estadísticas de uso de almacenamiento
 * - Detección de actividad sospechosa
 * - Logs de acceso (solo admin/propietario)
 * - Alertas e incidentes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import {
  getStorageStats,
  detectSuspiciousActivity,
  getUserStorageAccessLogs,
  getEmailStorageAccessLogs,
} from '@/app/utils/storageAudit';
import { getClientIP, checkRateLimit } from '@/app/utils/rateLimiter';
import { logAudit } from '@/app/utils/auditLogger';

interface MonitoringQuery {
  type: 'stats' | 'suspicious' | 'logs' | 'alerts';
  userId?: string;
  email?: string;
  days?: number;
  limit?: number;
  role?: string; // 'admin' | 'user'
}

interface MonitoringResponse {
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
  timestamp: string;
}

const db = getFirestore();

/**
 * GET /api/storage/monitoring?type=stats&userId=...
 * 
 * Monitoreo de actividad de Storage
 */
export async function GET(request: NextRequest): Promise<NextResponse<MonitoringResponse>> {
  const clientIP = getClientIP(request);
  const timestamp = new Date().toISOString();

  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') as string;
    const userId = searchParams.get('userId') as string;
    const email = searchParams.get('email') as string;
    const days = parseInt(searchParams.get('days') || '7', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const role = searchParams.get('role') || 'user';

    // ✅ VALIDAR TIPO
    if (!['stats', 'suspicious', 'logs', 'alerts'].includes(type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tipo de monitoreo no válido',
          timestamp,
        },
        { status: 400 }
      );
    }

    // ✅ VALIDAR AUTORIZACIÓN: solo admin puede ver logs de otros usuarios
    if (role !== 'admin' && type === 'logs' && email !== searchParams.get('requestEmail')) {
      await logAudit('STORAGE_MONITORING_UNAUTHORIZED', 
        { type, email, requestEmail: searchParams.get('requestEmail') }, 
        request, 
        {
          status: 'blocked',
          severity: 'high',
        }
      );
      return NextResponse.json(
        {
          success: false,
          error: 'No tienes permiso para ver estos logs',
          timestamp,
        },
        { status: 403 }
      );
    }

    // ✅ RATE LIMITING para monitoreo
    const rateLimitKey = `storage-monitoring-${email || clientIP}`;
    const rateLimit = checkRateLimit(rateLimitKey, {
      maxRequests: 30, // 30 monitoreos por minuto
      windowMs: 60000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Demasiadas solicitudes de monitoreo',
          timestamp,
        },
        { status: 429 }
      );
    }

    // ✅ PROCESAR TIPO DE MONITOREO
    let data: any = {};

    // ==================== ESTADÍSTICAS ====================
    if (type === 'stats' && userId) {
      try {
        const stats = await getStorageStats(userId);
        data = {
          userId,
          ...stats,
          retrievedAt: timestamp,
          report: {
            summary: {
              totalAccess: stats.totalAccess,
              totalUploads: stats.totalUploads,
              totalDownloads: stats.totalDownloads,
              totalDeletes: stats.totalDeletes,
              failureRate: stats.totalAccess > 0 
                ? ((stats.totalFailures / stats.totalAccess) * 100).toFixed(2) + '%'
                : '0%',
            },
            activity: {
              lastAccess: stats.lastAccess?.toISOString() || 'Nunca',
              mostAccessedFile: stats.mostAccessedFile || 'N/A',
              trendingFiles: stats.trendingFiles || [],
            },
          },
        };
      } catch (error) {
        console.warn(`⚠️  Error obteniendo stats para ${userId}:`, error);
        data = { userId, error: 'No hay datos disponibles' };
      }
    }

    // ==================== ACTIVIDAD SOSPECHOSA ====================
    if (type === 'suspicious' && userId) {
      try {
        const suspicious = await detectSuspiciousActivity(userId);
        const suspiciousLevel = suspicious.score > 70 ? 'CRÍTICO' 
                              : suspicious.score > 50 ? 'ALTO' 
                              : suspicious.score > 30 ? 'MEDIO' 
                              : 'BAJO';

        data = {
          userId,
          suspicious: suspicious.suspicious,
          riskLevel: suspiciousLevel,
          score: suspicious.score,
          issues: suspicious.issues,
          recommendations: generateRecommendations(suspicious.issues),
          generatedAt: timestamp,
        };

        // Alertar si es crítico
        if (suspicious.score > 70) {
          await logAudit('STORAGE_CRITICAL_SUSPICIOUS_ACTIVITY', 
            { userId, score: suspicious.score, issues: suspicious.issues }, 
            request, 
            {
              status: 'suspicious',
              severity: 'critical',
            }
          );
        }
      } catch (error) {
        console.warn(`⚠️  Error detectando actividad sospechosa para ${userId}:`, error);
        data = { userId, error: 'No hay datos disponibles' };
      }
    }

    // ==================== LOGS DE ACCESO ====================
    if (type === 'logs') {
      try {
        let logs: any[] = [];

        if (userId) {
          const result = await getUserStorageAccessLogs(userId, { days, limit });
          logs = result.map((log: any) => ({
            ...log,
            timestamp: log.timestamp?.toDate?.() || log.timestamp,
          }));
        } else if (email && role === 'admin') {
          const result = await getEmailStorageAccessLogs(email, { days, limit });
          logs = result.map((log: any) => ({
            ...log,
            timestamp: log.timestamp?.toDate?.() || log.timestamp,
          }));
        }

        data = {
          filter: { userId, email, days, limit },
          totalLogs: logs.length,
          logs,
          retrievedAt: timestamp,
        };
      } catch (error) {
        console.warn(`⚠️  Error obteniendo logs:`, error);
        data = { error: 'Error obteniendo logs' };
      }
    }

    // ==================== ALERTAS ====================
    if (type === 'alerts') {
      try {
        // Obtener alertas de los últimos 7 días
        const alertsSnapshot = await db.collection('storageAccessLogs')
          .where('status', '==', 'suspicious')
          .where('timestamp', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
          .orderBy('timestamp', 'desc')
          .limit(100)
          .get();

        const alerts = alertsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp,
        }));

        // Agrupar por usuario
        const alertsByUser: Record<string, any[]> = {};
        alerts.forEach(alert => {
          if (!alertsByUser[alert.userId]) {
            alertsByUser[alert.userId] = [];
          }
          alertsByUser[alert.userId].push(alert);
        });

        data = {
          totalAlerts: alerts.length,
          criticalUsers: Object.entries(alertsByUser)
            .filter(([_, userAlerts]) => userAlerts.length > 5)
            .map(([userId, userAlerts]) => ({
              userId,
              alertCount: userAlerts.length,
              lastAlert: userAlerts[0]?.timestamp,
            })),
          recentAlerts: alerts.slice(0, 10),
          generatedAt: timestamp,
        };
      } catch (error) {
        console.warn(`⚠️  Error obteniendo alertas:`, error);
        data = { error: 'Error obteniendo alertas' };
      }
    }

    // ✅ LOGUEAR MONITOREO
    await logAudit('STORAGE_MONITORING_REQUEST', 
      { type, userId, email }, 
      request, 
      {
        status: 'success',
        severity: 'low',
      }
    );

    return NextResponse.json(
      {
        success: true,
        data,
        message: `Monitoreo de ${type} completado`,
        timestamp,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Error en monitoring:', error);

    await logAudit('STORAGE_MONITORING_ERROR', 
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
        error: 'Error en monitoreo de storage',
        timestamp,
      },
      { status: 500 }
    );
  }
}

/**
 * Generar recomendaciones basadas en problemas detectados
 */
function generateRecommendations(issues: string[]): string[] {
  const recommendations: string[] = [];

  if (issues.some(i => i.includes('failed downloads'))) {
    recommendations.push('Verificar credenciales y permisos de acceso');
  }

  if (issues.some(i => i.includes('multiple IPs'))) {
    recommendations.push('Considerar cambiar contraseña si acceso no autorizado');
  }

  if (issues.some(i => i.includes('scanning'))) {
    recommendations.push('❌ ALERTA: Posible ataque de fuerza bruta. Contacta a soporte.');
  }

  if (issues.some(i => i.includes('unusual hours'))) {
    recommendations.push('Revisar si estos accesos son autorizados');
  }

  if (issues.some(i => i.includes('operations'))) {
    recommendations.push('Reducir frecuencia de operaciones o optimizar proceso');
  }

  if (recommendations.length === 0) {
    recommendations.push('Vigilancia continua recomendada');
  }

  return recommendations;
}
