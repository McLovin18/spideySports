/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 🔔 CRITICAL ALERTS SYSTEM - Sistema de alertas críticas
 * 
 * Envía notificaciones en tiempo real para eventos críticos:
 * - Intentos de fraude detectados
 * - Múltiples fallos de autenticación
 * - Acceso no autorizado
 * - Manipulación de precios
 * - Cambios de configuración
 */

import nodemailer from 'nodemailer';

interface AlertConfig {
  email: {
    enabled: boolean;
    recipientEmails: string[];
    senderEmail: string;
  };
  slack: {
    enabled: boolean;
    webhookUrl?: string;
  };
  threshold: {
    maxFailedAttempts: number;
    fraudScoreThreshold: number;
    timingWindow: number; // milisegundos
  };
}

interface CriticalAlert {
  type: 'FRAUD_DETECTED' | 'AUTH_FAILED' | 'UNAUTHORIZED_ACCESS' | 'PRICE_MANIPULATION' | 'CONFIG_CHANGE' | 'CUSTOM';
  severity: 'critical' | 'high' | 'medium';
  title: string;
  message: string;
  details: Record<string, any>;
  timestamp: string;
  affectedUser?: string;
  affectedResource?: string;
}

// Configuración predeterminada
const DEFAULT_CONFIG: AlertConfig = {
  email: {
    enabled: process.env.EMAIL_USER !== undefined,
    recipientEmails: [process.env.ALERT_EMAIL_ADMINS || process.env.EMAIL_USER || ''].filter(Boolean),
    senderEmail: process.env.EMAIL_USER || 'alerts@spideysports.com',
  },
  slack: {
    enabled: !!process.env.SLACK_WEBHOOK_URL,
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
  },
  threshold: {
    maxFailedAttempts: 5,
    fraudScoreThreshold: 60,
    timingWindow: 5 * 60 * 1000, // 5 minutos
  },
};

/**
 * Crear transporter de email
 */
function createEmailTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

/**
 * ✅ ENVIAR ALERTA POR EMAIL
 */
async function sendEmailAlert(alert: CriticalAlert, recipientEmails: string[]): Promise<boolean> {
  try {
    const transporter = createEmailTransporter();

    const emailBody = `
🚨 ALERTA CRÍTICA - SPIDEY SPORTS

Tipo: ${alert.type}
Severidad: ${alert.severity.toUpperCase()}
Título: ${alert.title}

Mensaje:
${alert.message}

Detalles Técnicos:
${JSON.stringify(alert.details, null, 2)}

Usuario Afectado: ${alert.affectedUser || 'N/A'}
Recurso Afectado: ${alert.affectedResource || 'N/A'}
Timestamp: ${alert.timestamp}

---
Este es un email automático. No responder a este email.
Revisar la consola de administración para más información.
    `;

    const mailOptions = {
      from: DEFAULT_CONFIG.email.senderEmail,
      to: recipientEmails.join(', '),
      subject: `🚨 [${alert.severity.toUpperCase()}] ${alert.title}`,
      text: emailBody,
      html: `<pre>${emailBody}</pre>`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Alerta enviada por email a: ${recipientEmails.join(', ')}`);
    return true;
  } catch (error) {
    console.error('❌ Error enviando email de alerta:', error);
    return false;
  }
}

/**
 * ✅ ENVIAR ALERTA A SLACK
 */
async function sendSlackAlert(alert: CriticalAlert): Promise<boolean> {
  try {
    if (!DEFAULT_CONFIG.slack.webhookUrl) {
      console.warn('⚠️  SLACK_WEBHOOK_URL no está configurada');
      return false;
    }

    const severityColor = {
      critical: '#FF0000', // Rojo
      high: '#FF6B00', // Naranja
      medium: '#FFB800', // Amarillo
    };

    const slackMessage = {
      attachments: [
        {
          color: severityColor[alert.severity],
          title: `🚨 ${alert.title}`,
          text: alert.message,
          fields: [
            {
              title: 'Tipo',
              value: alert.type,
              short: true,
            },
            {
              title: 'Severidad',
              value: alert.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Usuario Afectado',
              value: alert.affectedUser || 'N/A',
              short: true,
            },
            {
              title: 'Recurso',
              value: alert.affectedResource || 'N/A',
              short: true,
            },
            {
              title: 'Timestamp',
              value: alert.timestamp,
              short: false,
            },
            {
              title: 'Detalles',
              value: `\`\`\`${JSON.stringify(alert.details, null, 2)}\`\`\``,
              short: false,
            },
          ],
          ts: Math.floor(new Date(alert.timestamp).getTime() / 1000),
        },
      ],
    };

    const response = await fetch(DEFAULT_CONFIG.slack.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage),
    });

    if (!response.ok) {
      throw new Error(`Slack returned ${response.status}`);
    }

    console.log('✅ Alerta enviada a Slack');
    return true;
  } catch (error) {
    console.error('❌ Error enviando alerta a Slack:', error);
    return false;
  }
}

/**
 * ✅ DISPARAR ALERTA CRÍTICA
 *
 * Centro de control para enviar alertas a múltiples canales
 */
export async function triggerCriticalAlert(alert: CriticalAlert): Promise<void> {
  console.log(`🚨 ALERTA CRÍTICA DISPARADA: ${alert.type}`);
  console.log(JSON.stringify(alert, null, 2));

  const promises = [];

  // Enviar por email si está habilitado
  if (DEFAULT_CONFIG.email.enabled && DEFAULT_CONFIG.email.recipientEmails.length > 0) {
    promises.push(sendEmailAlert(alert, DEFAULT_CONFIG.email.recipientEmails));
  }

  // Enviar a Slack si está habilitado
  if (DEFAULT_CONFIG.slack.enabled) {
    promises.push(sendSlackAlert(alert));
  }

  // Si no hay canales habilitados, al menos log
  if (promises.length === 0) {
    console.warn('⚠️  Ningún canal de alertas configurado. Solo logging.');
  }

  // Ejecutar todos en paralelo
  await Promise.all(promises);
}

/**
 * 🔴 DETECCIÓN DE FRAUDE
 *
 * Dispara alerta si se detecta fraude alto
 */
export async function alertFraudDetected(
  email: string,
  fraudScore: number,
  details: Record<string, any>
): Promise<void> {
  if (fraudScore >= DEFAULT_CONFIG.threshold.fraudScoreThreshold) {
    await triggerCriticalAlert({
      type: 'FRAUD_DETECTED',
      severity: fraudScore > 80 ? 'critical' : 'high',
      title: 'Fraude Detectado',
      message: `Patrón fraudulento detectado en intento de compra. Score: ${fraudScore}/100`,
      details: {
        fraudScore,
        email,
        timestamp: new Date().toISOString(),
        ...details,
      },
      timestamp: new Date().toISOString(),
      affectedUser: email,
      affectedResource: 'Payment Transaction',
    });
  }
}

/**
 * 🔴 MÚLTIPLES FALLOS DE AUTENTICACIÓN
 *
 * Dispara alerta si hay muchos intentos fallidos
 */
export async function alertMultipleAuthFailures(
  email: string,
  failureCount: number,
  lastAttempt: string
): Promise<void> {
  if (failureCount >= DEFAULT_CONFIG.threshold.maxFailedAttempts) {
    await triggerCriticalAlert({
      type: 'AUTH_FAILED',
      severity: 'high',
      title: 'Múltiples Intentos de Autenticación Fallidos',
      message: `${failureCount} intentos fallidos de autenticación para: ${email}`,
      details: {
        email,
        failureCount,
        lastAttempt,
        threshold: DEFAULT_CONFIG.threshold.maxFailedAttempts,
        recommendation: 'Considera bloquear temporalmente la cuenta',
      },
      timestamp: new Date().toISOString(),
      affectedUser: email,
      affectedResource: 'Authentication System',
    });
  }
}

/**
 * 🔴 ACCESO NO AUTORIZADO
 */
export async function alertUnauthorizedAccess(
  attemptedAction: string,
  userId: string | undefined,
  ipAddress: string,
  details: Record<string, any>
): Promise<void> {
  await triggerCriticalAlert({
    type: 'UNAUTHORIZED_ACCESS',
    severity: 'critical',
    title: 'Intento de Acceso No Autorizado',
    message: `Intento de ${attemptedAction} sin autorización apropiada`,
    details: {
      attemptedAction,
      userId: userId || 'Anonymous',
      ipAddress,
      timestamp: new Date().toISOString(),
      ...details,
    },
    timestamp: new Date().toISOString(),
    affectedUser: userId,
    affectedResource: attemptedAction,
  });
}

/**
 * 🔴 MANIPULACIÓN DE PRECIOS
 */
export async function alertPriceManipulation(
  expectedTotal: number,
  receivedTotal: number,
  userId: string | undefined,
  itemCount: number
): Promise<void> {
  const difference = Math.abs(expectedTotal - receivedTotal);
  const percentDiff = ((difference / expectedTotal) * 100).toFixed(2);

  await triggerCriticalAlert({
    type: 'PRICE_MANIPULATION',
    severity: 'critical',
    title: 'Intento de Manipulación de Precio Detectado',
    message: `Discrepancia de precio: -$${difference.toFixed(2)} (${percentDiff}%) para ${itemCount} items`,
    details: {
      expectedTotal: expectedTotal.toFixed(2),
      receivedTotal: receivedTotal.toFixed(2),
      difference: difference.toFixed(2),
      percentageDiff: percentDiff,
      itemCount,
      userId: userId || 'Guest',
      timestamp: new Date().toISOString(),
      recommendation: 'Rechazar transacción inmediatamente',
    },
    timestamp: new Date().toISOString(),
    affectedUser: userId,
    affectedResource: 'Payment Processing',
  });
}

/**
 * 🟡 CAMBIO DE CONFIGURACIÓN
 */
export async function alertConfigurationChange(
  changeDescription: string,
  configKey: string,
  oldValue: any,
  newValue: any,
  changedBy: string
): Promise<void> {
  await triggerCriticalAlert({
    type: 'CONFIG_CHANGE',
    severity: 'high',
    title: 'Cambio de Configuración Detectado',
    message: `${changeDescription} fue modificado`,
    details: {
      configKey,
      oldValue,
      newValue,
      changedBy,
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
    affectedUser: changedBy,
    affectedResource: `Configuration: ${configKey}`,
  });
}

/**
 * 📊 ESTADO DE ALERTAS
 */
export function getAlertStatus(): {
  emailEnabled: boolean;
  slackEnabled: boolean;
  emailRecipients: number;
  webhookConfigured: boolean;
} {
  return {
    emailEnabled: DEFAULT_CONFIG.email.enabled,
    slackEnabled: DEFAULT_CONFIG.slack.enabled,
    emailRecipients: DEFAULT_CONFIG.email.recipientEmails.length,
    webhookConfigured: !!DEFAULT_CONFIG.slack.webhookUrl,
  };
}
