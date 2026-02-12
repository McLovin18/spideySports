import { NextRequest, NextResponse } from 'next/server';

/**
 * 🔐 RATE LIMITING MIDDLEWARE
 * 
 * Protege contra ataques de fuerza bruta y DDoS
 * Rastrea requests por IP y limita según el tipo de endpoint
 */

// Rate limit store (en producción usar Redis)
const rateLimitStore = new Map<
  string,
  {
    count: number;
    resetTime: number;
  }
>();

interface RateLimitConfig {
  windowMs: number; // Ventana de tiempo en ms
  maxRequests: number; // Máximo requests en ventana
  keyExtractor: (req: NextRequest) => string; // Cómo extraer la clave identificadora
  message?: string;
}

export function createRateLimiter(config: RateLimitConfig) {
  return (handler: Function) => {
    return async (request: NextRequest) => {
      const key = config.keyExtractor(request);
      const now = Date.now();

      // Obtener registro actual
      let record = rateLimitStore.get(key);

      // Si expiró, crear nuevo
      if (!record || now > record.resetTime) {
        record = {
          count: 0,
          resetTime: now + config.windowMs,
        };
        rateLimitStore.set(key, record);
      }

      // Incrementar contador
      record.count++;

      // Si excede límite, rechazar
      if (record.count > config.maxRequests) {
        console.warn(`⚠️ Rate limit exceeded for ${key}: ${record.count} requests`);
        return NextResponse.json(
          {
            success: false,
            message:
              config.message ||
              'Demasiadas solicitudes. Intenta más tarde.',
            retryAfter: Math.ceil((record.resetTime - now) / 1000),
          },
          {
            status: 429,
            headers: {
              'Retry-After': Math.ceil((record.resetTime - now) / 1000).toString(),
            },
          }
        );
      }

      // Pasar al handler
      return handler(request);
    };
  };
}

/**
 * Rate limiter para pagos (muy restrictivo)
 * 5 intentos por IP en 1 hora
 */
export const paymentRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hora
  maxRequests: 5,
  keyExtractor: (req) => getClientIP(req),
  message: '⚠️ Demasiados intentos de pago. Espera 1 hora antes de reintentar.',
});

/**
 * Rate limiter para quiz (moderado)
 * 20 intentos por email en 10 minutos
 */
export const quizRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutos
  maxRequests: 20,
  keyExtractor: (req) => {
    // Si disponible, usar email; si no, IP
    try {
      const body = req.body;
      // Nota: esto es una simplificación, en realidad necesitas parsear JSON
      return req.headers.get('x-user-email') || getClientIP(req);
    } catch {
      return getClientIP(req);
    }
  },
  message: '⚠️ Demasiados intentos de quiz. Espera 10 minutos.',
});

/**
 * Rate limiter para API en general
 * 100 requests por IP en 5 minutos
 */
export const generalAPIRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutos
  maxRequests: 100,
  keyExtractor: (req) => getClientIP(req),
  message:
    '⚠️ Demasiadas solicitudes. Por favor, espera unos momentos.',
});

/**
 * Extrae IP del cliente (soporta proxies como Cloudflare)
 */
function getClientIP(request: NextRequest): string {
  // Intentar obtener de headers comunes
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // x-forwarded-for puede contener múltiples IPs, tomar la primera
    return forwardedFor.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // Fallback a IP remota (no siempre disponible)
  return request.ip || 'unknown';
}

/**
 * Middleware CORS + Security Headers
 */
export function withSecurityHeaders(handler: Function) {
  return async (request: NextRequest) => {
    // Solo permitir POST, GET, etc. según sea necesario
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_ORIGIN || '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const response = await handler(request);

    // Agregar headers de seguridad
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
    response.headers.set('X-XSS-Protection', '1; mode=block');

    return response;
  };
}

/**
 * Validador de método HTTP
 */
export function withMethodCheck(...allowedMethods: string[]) {
  return (handler: Function) => {
    return async (request: NextRequest) => {
      if (!allowedMethods.includes(request.method)) {
        return NextResponse.json(
          {
            success: false,
            message: `Método ${request.method} no permitido`,
            allowed: allowedMethods,
          },
          { status: 405 }
        );
      }

      return handler(request);
    };
  };
}
