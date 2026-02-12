/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 🔒 UTILIDADES DE SEGURIDAD
 * Sistema centralizado de validación, sanitización y protección
 */

import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

// ✅ VALIDACIÓN DE ENTRADA
export class InputValidator {
  // Validar email
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
  }

  // Validar contraseña fuerte
  static isValidPassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (password.length < 8) {
      errors.push('La contraseña debe tener al menos 8 caracteres');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Debe contener al menos una mayúscula');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Debe contener al menos una minúscula');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Debe contener al menos un número');
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Debe contener al menos un carácter especial');
    }

    return { valid: errors.length === 0, errors };
  }

  // Validar nombre de usuario
  static isValidName(name: string): boolean {
    const trimmedName = name.trim();
    return trimmedName.length >= 2 && trimmedName.length <= 50 && /^[a-zA-ZÀ-ÿ\s]+$/.test(trimmedName);
  }

  // Validar comentario
  static isValidComment(comment: string): boolean {
    const trimmedComment = comment.trim();
    return trimmedComment.length >= 10 && trimmedComment.length <= 500;
  }

  // Validar teléfono
  static isValidPhone(phone: string): boolean {
    const phoneRegex = /^[+]?[\d\s\-\(\)]{10,15}$/;
    return phoneRegex.test(phone.trim());
  }
}

// ✅ SANITIZACIÓN DE DATOS
export class DataSanitizer {
  // Limpiar HTML y scripts
  static sanitizeHtml(input: string): string {
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  }

  // Sanitizar texto general
  static sanitizeText(input: string): string {
    return input
      .replace(/[<>\"'&]/g, (match) => {
        const map: { [key: string]: string } = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        };
        return map[match];
      })
      .trim();
  }

  // Sanitizar número de teléfono
  static sanitizePhone(phone: string): string {
    return phone.replace(/[^\d+\-\(\)\s]/g, '');
  }

  // Sanitizar dirección
  static sanitizeAddress(address: string): string {
    return this.sanitizeText(address).substring(0, 200);
  }
}

// ✅ CONTROL DE ACCESO Y ROLES
export class AccessControl {
  // Verificar si el usuario es admin
  static async isAdmin(userEmail?: string): Promise<boolean> {
    if (!auth.currentUser) return false;
    
    const adminEmails = [
      'hectorcobea03@gmail.com',
      'tiffanysvariedades@gmail.com',
      'lucilaaquino79@gmail.com'
    ];
    
    const email = userEmail || auth.currentUser.email;
    return email ? adminEmails.includes(email.toLowerCase()) : false;
  }

  // Verificar si el usuario es delivery - SISTEMA DINÁMICO
  static async isDelivery(userEmail?: string): Promise<boolean> {
    if (!auth.currentUser) return false;
    
    try {
      const email = userEmail || auth.currentUser.email;
      if (!email) return false;

      // 🆕 CONSULTAR FIREBASE EN LUGAR DE LISTA HARDCODED
      const deliveryUserRef = doc(db, 'deliveryUsers', email.toLowerCase());
      const deliveryUserSnap = await getDoc(deliveryUserRef);
      
      // Verificar si existe y está activo
      if (deliveryUserSnap.exists()) {
        const deliveryData = deliveryUserSnap.data();
        return deliveryData?.active === true;
      }
      
      return false;
    } catch (error) {
      SecureLogger.error('Error checking delivery status', error);
      return false;
    }
  }

  // Verificar si el usuario puede acceder a un recurso
  static async canAccessResource(resourceUserId: string): Promise<boolean> {
    if (!auth.currentUser) return false;
    
    // Admin puede acceder a todo
    if (await this.isAdmin()) return true;
    
    // Usuario solo puede acceder a sus propios recursos
    return auth.currentUser.uid === resourceUserId;
  }

  // Verificar autenticación
  static isAuthenticated(): boolean {
    return !!auth.currentUser;
  }
}

// ✅ RATE LIMITING (Cliente)
export class RateLimiter {
  private static attempts: Map<string, { count: number; lastAttempt: number }> = new Map();

  // Verificar rate limit para una acción
  static checkRateLimit(action: string, maxAttempts: number = 5, windowMs: number = 60000): boolean {
    const now = Date.now();
    const key = `${action}_${auth.currentUser?.uid || 'anonymous'}`;
    
    const attempt = this.attempts.get(key);
    
    if (!attempt) {
      this.attempts.set(key, { count: 1, lastAttempt: now });
      return true;
    }

    // Resetear ventana de tiempo
    if (now - attempt.lastAttempt > windowMs) {
      this.attempts.set(key, { count: 1, lastAttempt: now });
      return true;
    }

    // Verificar límite
    if (attempt.count >= maxAttempts) {
      return false;
    }

    // Incrementar contador
    attempt.count++;
    attempt.lastAttempt = now;
    this.attempts.set(key, attempt);
    
    return true;
  }

  // Limpiar intentos antiguos
  static cleanup(): void {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    for (const [key, attempt] of this.attempts) {
      if (now - attempt.lastAttempt > oneHour) {
        this.attempts.delete(key);
      }
    }
  }
}

// ✅ LOGGING SEGURO
export class SecureLogger {
  // Solo loggear en desarrollo
  static log(message: string, data?: any): void {
    // Logs deshabilitados en producción
    if (process.env.NODE_ENV === 'development' && false) {
      console.log(`🔍 [${new Date().toISOString()}] ${message}`, data);
    }
  }

  // Loggear errores (siempre)
  static error(message: string, error?: any): void {
    const sanitizedError = error ? {
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    } : null;
    
    console.error(`❌ [${new Date().toISOString()}] ${message}`, sanitizedError);
  }

  // Loggear eventos de seguridad
  static security(event: string, details?: any): void {
    const securityLog = {
      event,
      timestamp: new Date().toISOString(),
      user: auth.currentUser?.uid || 'anonymous',
      details: details || {}
    };
    
    console.warn(`🔒 [SECURITY] ${event}`, securityLog);
  }
}

// ✅ VALIDACIÓN DE PAYPAL
export class PayPalValidator {
  // Validar datos de transacción PayPal
  static validateTransaction(transactionData: any): boolean {
    if (!transactionData) return false;
    
    const required = ['id', 'status', 'amount', 'payer'];
    return required.every(field => transactionData[field] !== undefined);
  }

  // Verificar que el monto coincida
  static verifyAmount(paypalAmount: number, cartTotal: number): boolean {
    const tolerance = 0.01; // Tolerancia de 1 centavo
    return Math.abs(paypalAmount - cartTotal) <= tolerance;
  }
}

// ✅ ENCRIPTACIÓN BÁSICA (para datos no críticos)
export class BasicEncryption {
  private static key = 'tiendaonline_2025_secure';

  // Encriptar texto simple (base64 + rotación)
  static encrypt(text: string): string {
    try {
      const shifted = text.split('').map(char => 
        String.fromCharCode(char.charCodeAt(0) + 3)
      ).join('');
      return btoa(shifted);
    } catch {
      return text;
    }
  }

  // Desencriptar texto simple
  static decrypt(encrypted: string): string {
    try {
      const decoded = atob(encrypted);
      return decoded.split('').map(char => 
        String.fromCharCode(char.charCodeAt(0) - 3)
      ).join('');
    } catch {
      return encrypted;
    }
  }
}

// ✅ VALIDADOR DE SESIÓN
export class SessionValidator {
  // Verificar que la sesión sea válida
  static async validateSession(): Promise<boolean> {
    if (!auth.currentUser) return false;
    
    try {
      // Refrescar token
      await auth.currentUser.getIdToken(true);
      return true;
    } catch (error) {
      SecureLogger.security('Invalid session detected', { error });
      return false;
    }
  }

  // Verificar integridad de datos del usuario
  static validateUserData(userData: any): boolean {
    if (!userData) return false;
    
    const required = ['uid', 'email'];
    return required.every(field => userData[field]);
  }
}
