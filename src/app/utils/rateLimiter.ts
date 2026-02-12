/**
 * 🔐 SIMPLE RATE LIMITER - Base en memoria (perfecto para VPS único)
 * 
 * Para producción distribuida / serverless, usa:
 * - Upstash Redis (@upstash/ratelimit)
 * - CloudFlare Durable Objects
 * - Kong API Gateway
 */

interface RateLimitRecord {
  count: number;
  expires: number;
  failedAttempts?: number; // Track failed auth attempts
}

// Store en memoria - se borra cuando reinicia el servidor (aceptable para desarrollo)
const rateLimitStore = new Map<string, RateLimitRecord>();

// Limpiar registos expirados cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (record.expires < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // en milisegundos
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  remaining?: number;
}

/**
 * Verificar rate limit con llave única
 * @param key - Identificador único (ej: "192.168.1.1-quiz-legalAge" o "user@email.com-quiz-terms")
 * @param config - { maxRequests: 5, windowMs: 60000 }
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig = { maxRequests: 5, windowMs: 60000 }
): RateLimitResult {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  // Nuevo registro o expirado
  if (!record || record.expires < now) {
    rateLimitStore.set(key, {
      count: 1,
      expires: now + config.windowMs,
      failedAttempts: 0,
    });

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
    };
  }

  // Verificar si se alcanzó el límite
  if (record.count >= config.maxRequests) {
    const retryAfter = Math.ceil((record.expires - now) / 1000);
    return {
      allowed: false,
      retryAfter,
      remaining: 0,
    };
  }

  // Incrementar contador
  record.count++;

  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
  };
}

/**
 * Registrar intento fallido para bloqueo progresivo
 * Ej: 3 intentos fallidos = bloqueo de 10 minutos
 */
export function recordFailedAttempt(key: string): number {
  const record = rateLimitStore.get(key);
  if (!record) {
    rateLimitStore.set(key, {
      count: 1,
      expires: Date.now() + 60000,
      failedAttempts: 1,
    });
    return 1;
  }

  record.failedAttempts = (record.failedAttempts || 0) + 1;
  return record.failedAttempts;
}

/**
 * Bloquear temporalmente una clave (ej: después de 3 fallos)
 */
export function blockKey(key: string, durationMs: number = 10 * 60 * 1000): void {
  rateLimitStore.set(key, {
    count: 999, // Simular límite excedido
    expires: Date.now() + durationMs,
    failedAttempts: 999,
  });
}

/**
 * Obtener IP del cliente desde headers
 * IMPORTANTE: En producción, configura correctamente tu proxy
 */
export function getClientIP(request: Request): string {
  // Próximas en orden de preferencia
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip'); // Cloudflare

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  return 'unknown';
}
