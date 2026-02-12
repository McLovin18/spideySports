import { doc, setDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { NextRequest } from 'next/server';

/**
 * 📊 SISTEMA DE AUDITORÍA Y LOGGING
 * 
 * Registra todas las acciones importantes para:
 * - Debugging y troubleshooting
 * - Detección de fraude
 * - Cumplimiento legal (audits)
 * - Alertas de seguridad
 */

export type AuditAction =
  | 'LOGIN_ATTEMPT'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'OTP_SEND'
  | 'OTP_VERIFY_SUCCESS'
  | 'OTP_VERIFY_FAILED'
  | 'QUIZ_ATTEMPT'
  | 'QUIZ_SUCCESS'
  | 'QUIZ_FAILED'
  | 'PURCHASE_ATTEMPT'
  | 'PURCHASE_SUCCESS'
  | 'PURCHASE_FAILED'
  | 'PRICE_VALIDATION_FAILED'
  | 'DELIVERY_VALIDATION'
  | 'FRAUD_DETECTED'
  | 'RATE_LIMIT_HIT'
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED_ACCESS'
  | 'SERVER_ERROR'
  | 'ADMIN_ACTION'
  | 'DATABASE_ERROR';

export type AuditStatus = 'success' | 'failed' | 'suspicious' | 'blocked';
export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AuditLog {
  id: string;
  action: AuditAction;
  timestamp: string;
  userId?: string;
  email?: string;
  ip: string;
  userAgent: string;
  status: AuditStatus;
  severity: AuditSeverity;
  details: Record<string, any>;
  endpoint?: string;
  method?: string;
  responseTime?: number;
}

/**
 * Obtener IP del cliente desde headers
 */
export function getClientIP(request: NextRequest): string {
  // Intentar obtener de headers comunes
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP;

  const cfIP = request.headers.get('cf-connecting-ip'); // Cloudflare
  if (cfIP) return cfIP;

  // Fallback
  return request.ip || '0.0.0.0';
}

/**
 * Registrar acción en auditoría
 */
export async function logAudit(
  action: AuditAction,
  details: Record<string, any>,
  request: NextRequest,
  options: {
    status?: AuditStatus;
    severity?: AuditSeverity;
    userId?: string;
    email?: string;
    responseTime?: number;
  } = {}
): Promise<void> {
  try {
    const ip = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const severity = options.severity || 'low';
    const status = options.status || 'success';

    // En desarrollo, no loguear acciones de baja severidad para no contaminar
    if (process.env.NODE_ENV === 'development' && severity === 'low') {
      return;
    }

    const logId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const log: AuditLog = {
      id: logId,
      action,
      timestamp: new Date().toISOString(),
      userId: options.userId,
      email: options.email,
      ip,
      userAgent,
      status,
      severity,
      details: {
        ...details,
        // Nunca loguear datos sensibles completos
        email: options.email ? options.email.split('@')[0] + '@***' : undefined,
      },
      endpoint: request.nextUrl.pathname,
      method: request.method,
      responseTime: options.responseTime,
    };

    // Guardar en Firestore
    await setDoc(doc(db, 'auditLogs', logId), log);

    // Log en consola según severidad
    if (severity === 'critical') {
      console.error(`🚨 [CRITICAL] ${action}:`, log);
    } else if (severity === 'high') {
      console.warn(`⚠️  [HIGH] ${action}:`, log);
    } else {
      console.log(`📋 [AUDIT] ${action}:`, log);
    }

    // Alertar si es crítico (podrías agregar webhooks, emails, Slack, etc)
    if (severity === 'critical') {
      await sendSecurityAlert(action, log);
    }
  } catch (error) {
    // No fallar la request si hay error en auditoría
    console.error('❌ Failed to log audit:', error);
  }
}

/**
 * Enviar alerta de seguridad (implementar con tu servicio de notificación)
 */
async function sendSecurityAlert(action: AuditAction, log: AuditLog): Promise<void> {
  try {
    // TODO: Integrar con tu servicio de alertas
    // Ejemplos:
    // - Enviar email a admin
    // - Slack webhook
    // - PagerDuty
    // - Sentry

    if (process.env.ADMIN_EMAIL && process.env.NODE_ENV === 'production') {
      console.log(`🚨 Alert would be sent to ${process.env.ADMIN_EMAIL} for ${action}`);
    }
  } catch (error) {
    console.error('Failed to send security alert:', error);
  }
}

/**
 * Obtener logs de auditoría (solo para admins)
 */
export async function getAuditLogs(filters?: {
  action?: AuditAction;
  email?: string;
  ip?: string;
  severity?: AuditSeverity;
  hoursBack?: number;
  limit?: number;
}): Promise<AuditLog[]> {
  try {
    const constraints = [];

    if (filters?.hoursBack) {
      const timeAgo = new Date();
      timeAgo.setHours(timeAgo.getHours() - filters.hoursBack);
      // Firestore doesn't have >= operator, so we use > with the previous second
      constraints.push(where('timestamp', '>=', timeAgo.toISOString()));
    }

    if (filters?.action) {
      constraints.push(where('action', '==', filters.action));
    }

    if (filters?.email) {
      // Buscar por email parcial (cuidado con privacidad)
      constraints.push(where('email', '==', filters.email));
    }

    if (filters?.ip) {
      constraints.push(where('ip', '==', filters.ip));
    }

    if (filters?.severity) {
      constraints.push(where('severity', '==', filters.severity));
    }

    constraints.push(orderBy('timestamp', 'desc'));
    constraints.push(limit(filters?.limit || 100));

    const q = query(collection(db, 'auditLogs'), ...constraints);
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => doc.data() as AuditLog);
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return [];
  }
}

/**
 * Detectar actividad sospechosa
 */
export async function checkFraudIndicators(
  email: string,
  ip: string,
  _action: string
): Promise<{
  suspicious: boolean;
  score: number; // 0-100
  reason?: string;
}> {
  try {
    // Contar intentos fallidos del mismo email en últimas 2 horas
    const failedAttempts = await getAuditLogs({
      email,
      severity: 'high',
      hoursBack: 2,
    });

    if (failedAttempts.length >= 5) {
      return {
        suspicious: true,
        score: 85,
        reason: 'Too many failed attempts from this email',
      };
    }

    // Contar intentos del mismo IP en última 1 hora
    const ipAttempts = await getAuditLogs({
      ip,
      hoursBack: 1,
      limit: 200,
    });

    if (ipAttempts.length >= 50) {
      return {
        suspicious: true,
        score: 75,
        reason: 'Too many requests from this IP',
      };
    }

    return {
      suspicious: false,
      score: 10,
    };
  } catch (error) {
    console.error('Failed to check fraud indicators:', error);
    return { suspicious: false, score: 0 };
  }
}

/**
 * Helpers para casos comunes
 */

export const AuditHelpers = {
  /**
   * Loguear intento de login fallido
   */
  async logLoginFailed(
    email: string,
    reason: string,
    request: NextRequest
  ) {
    const fraud = await checkFraudIndicators(email, getClientIP(request), 'LOGIN');
    return logAudit(
      'LOGIN_FAILED',
      { email, reason },
      request,
      {
        status: 'failed',
        severity: fraud.suspicious ? 'high' : 'medium',
        email,
      }
    );
  },

  /**
   * Loguear intento de OTP fallido
   */
  async logOTPFailed(
    email: string,
    reason: string,
    request: NextRequest
  ) {
    return logAudit(
      'OTP_VERIFY_FAILED',
      { email, reason },
      request,
      {
        status: 'failed',
        severity: 'medium',
        email,
      }
    );
  },

  /**
   * Loguear validación de precio fallida
   */
  async logPriceValidationFailed(
    email: string,
    expectedTotal: number,
    receivedTotal: number,
    request: NextRequest
  ) {
    return logAudit(
      'PRICE_VALIDATION_FAILED',
      {
        email,
        expectedTotal,
        receivedTotal,
        difference: Math.abs(expectedTotal - receivedTotal),
      },
      request,
      {
        status: 'suspicious',
        severity: 'high',
        email,
      }
    );
  },

  /**
   * Loguear intento de acceso no autorizado
   */
  async logUnauthorizedAccess(
    email: string | undefined,
    reason: string,
    request: NextRequest
  ) {
    return logAudit(
      'UNAUTHORIZED_ACCESS',
      { reason },
      request,
      {
        status: 'blocked',
        severity: 'high',
        email,
      }
    );
  },

  /**
   * Loguear error de input inválido
   */
  async logInvalidInput(
    field: string,
    reason: string,
    request: NextRequest
  ) {
    return logAudit(
      'INVALID_INPUT',
      { field, reason },
      request,
      {
        status: 'failed',
        severity: 'low',
      }
    );
  },

  /**
   * Loguear compra exitosa
   */
  async logPurchaseSuccess(
    email: string,
    orderId: string,
    total: number,
    request: NextRequest
  ) {
    return logAudit(
      'PURCHASE_SUCCESS',
      { email, orderId, total },
      request,
      {
        status: 'success',
        severity: 'low',
        email,
      }
    );
  },

  /**
   * Loguear fraude detectado
   */
  async logFraudDetected(
    email: string,
    reason: string,
    risk_score: number,
    request: NextRequest
  ) {
    return logAudit(
      'FRAUD_DETECTED',
      { email, reason, risk_score },
      request,
      {
        status: 'blocked',
        severity: 'critical',
        email,
      }
    );
  },
};

export default {
  logAudit,
  getAuditLogs,
  checkFraudIndicators,
  getClientIP,
  AuditHelpers,
};
