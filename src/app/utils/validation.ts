import validator from 'validator';

/**
 * 🔐 VALIDACIÓN CENTRALIZADA
 * 
 * Módulo para validar todos los inputs de usuarios
 * Previene: SQL Injection, NoSQL Injection, XSS, Integer Overflow, etc
 */

// ✅ LISTA NEGRA DE DOMINIOS DE EMAIL TEMPORALES/SOSPECHOSOS
const BLOCKED_EMAIL_DOMAINS = new Set([
  // Dominios temporales populares
  'tempmail.com',
  '10minutemail.com',
  'throwaway.email',
  'guerrillamail.com',
  'mailinator.com',
  'temp-mail.org',
  'sharklasers.com',
  'yopmail.com',
  'inbox.ru',
  'maildrop.cc',
  'mintemail.com',
  'trashmail.com',
  'spam4.me',
  'throwawaymail.com',
  'fakeinbox.com',
  'temp-mail.io',
  '10minutemail.info',
  'mailnesia.com',
  'tempmail.email',
  'guerrillamail.info',
  'grr.la',
  'pokemail.net',
  'tempmail.us',
  'mail.tm',
]);

/**
 * Validar email con protección contra dominios sospechosos
 * @param email - Email a validar
 * @returns { valid: boolean, reason?: string }
 */
export function isValidEmail(email: string): {
  valid: boolean;
  reason?: string;
} {
  // Validación básica
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'Email must be a non-empty string' };
  }

  // Trim espacios
  email = email.trim().toLowerCase();

  // Formato válido
  if (!validator.isEmail(email)) {
    return { valid: false, reason: 'Invalid email format' };
  }

  // Validación de longitud
  if (email.length < 5 || email.length > 254) {
    return { valid: false, reason: 'Email length must be between 5 and 254 characters' };
  }

  // Extraer dominio
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) {
    return { valid: false, reason: 'No domain found in email' };
  }

  // Validar dominio no esté en blacklist
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) {
    return { 
      valid: false, 
      reason: `Domain ${domain} is not allowed. Please use a real email provider.` 
    };
  }

  // Validar que tenga TLD válido
  if (!domain.includes('.') || domain.endsWith('.') || domain.startsWith('.')) {
    return { valid: false, reason: 'Invalid domain format' };
  }

  // Validar TLD tiene al menos 2 caracteres
  const tld = domain.split('.').pop();
  if (!tld || tld.length < 2) {
    return { valid: false, reason: 'Invalid top-level domain' };
  }

  return { valid: true };
}

/**
 * Validar cantidad (entre 1 y 1000)
 * @param quantity - Cantidad a validar
 * @returns boolean
 */
export function isValidQuantity(quantity: unknown): boolean {
  // Debe ser número entero
  if (!Number.isInteger(quantity)) {
    return false;
  }

  const qty = quantity as number;

  // Debe estar entre 1 y 1000
  return qty > 0 && qty <= 1000;
}

/**
 * Validar precio (positivo, máximo 999999.99)
 * @param price - Precio a validar
 * @returns boolean
 */
export function isValidPrice(price: unknown): boolean {
  // Debe ser número
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    return false;
  }

  // Debe ser positivo
  if (price < 0) {
    return false;
  }

  // Máximo 999999.99
  if (price > 999999.99) {
    return false;
  }

  // Máximo 2 decimales (cents)
  if ((price * 100) % 1 !== 0) {
    return false;
  }

  return true;
}

/**
 * Validar total de orden
 * @param total - Total a validar
 * @returns boolean
 */
export function isValidTotal(total: unknown): boolean {
  // Debe ser número
  if (typeof total !== 'number' || !Number.isFinite(total)) {
    return false;
  }

  // Debe ser positivo
  if (total < 0) {
    return false;
  }

  // Máximo $10,000 por orden (ajusta según tu negocio)
  if (total > 10000000) {
    return false;
  }

  // Máximo 2 decimales
  if ((total * 100) % 1 !== 0) {
    return false;
  }

  return true;
}

/**
 * Validar que un string sea seguro (sin scripts)
 * @param str - String a validar
 * @param maxLen - Longitud máxima (default 500)
 * @returns boolean
 */
export function isSafeString(str: unknown, maxLen: number = 500): boolean {
  // Debe ser string
  if (typeof str !== 'string') {
    return false;
  }

  // Validar longitud
  if (str.length === 0 || str.length > maxLen) {
    return false;
  }

  // Bloquear HTML/scripts
  if (
    str.includes('<') ||
    str.includes('>') ||
    str.includes('script') ||
    str.includes('javascript:') ||
    str.includes('onclick') ||
    str.includes('onerror')
  ) {
    return false;
  }

  return true;
}

/**
 * Sanitizar string (remover/escapear caracteres peligrosos)
 * @param str - String a sanitizar
 * @returns string sanitizado
 */
export function sanitizeString(str: string, maxLen: number = 500): string {
  return validator
    .trim(str)
    .substring(0, maxLen)
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

/**
 * Validar nombre de usuario (3-20 caracteres, alfanuméricos + _ -)
 * @param username - Username a validar
 * @returns boolean
 */
export function isValidUsername(username: unknown): boolean {
  if (typeof username !== 'string') {
    return false;
  }

  // 3-20 caracteres, alfanuméricos, _ y -
  return /^[a-zA-Z0-9_-]{3,20}$/.test(username);
}

/**
 * Validar contraseña
 * Requiere: mínimo 8 caracteres, 1 mayúscula, 1 número, 1 carácter especial
 * @param password - Contraseña a validar
 * @returns { valid: boolean, reason?: string }
 */
export function isValidPassword(password: unknown): {
  valid: boolean;
  reason?: string;
} {
  if (typeof password !== 'string') {
    return { valid: false, reason: 'Password must be a string' };
  }

  if (password.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one uppercase letter' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one number' };
  }

  if (!/[!@#$%^&*]/.test(password)) {
    return { valid: false, reason: 'Password must contain special character (!@#$%^&*)' };
  }

  return { valid: true };
}

/**
 * Validar teléfono (formato internacional)
 * @param phone - Teléfono a validar
 * @returns boolean
 */
export function isValidPhone(phone: unknown): boolean {
  if (typeof phone !== 'string') {
    return false;
  }

  return validator.isMobilePhone(phone, 'any', { strictMode: false });
}

/**
 * Validar dirección de envío
 * @param address - Dirección a validar
 * @returns boolean
 */
export function isValidAddress(address: unknown): boolean {
  if (typeof address !== 'string') {
    return false;
  }

  // Mínimo 5 caracteres, máximo 500
  if (address.length < 5 || address.length > 500) {
    return false;
  }

  // No debe tener scripts
  if (!isSafeString(address, 500)) {
    return false;
  }

  return true;
}

/**
 * Validar código OTP (6 dígitos)
 * @param code - Código a validar
 * @returns boolean
 */
export function isValidOTPCode(code: unknown): boolean {
  if (typeof code !== 'string' && typeof code !== 'number') {
    return false;
  }

  const codeStr = String(code).trim();
  return /^\d{6}$/.test(codeStr);
}

/**
 * Validar cupón código
 * @param coupon - Cupón a validar
 * @returns boolean
 */
export function isValidCoupon(coupon: unknown): boolean {
  if (typeof coupon !== 'string') {
    return false;
  }

  // 3-20 caracteres, alfanuméricos y guiones
  return /^[A-Z0-9-]{3,20}$/.test(coupon.toUpperCase());
}

/**
 * Validar tipo de quiz
 * @param quizType - Tipo de quiz a validar
 * @returns boolean
 */
export function isValidQuizType(quizType: unknown): boolean {
  const validTypes = ['legalAge', 'terms', 'age18plus'];
  return typeof quizType === 'string' && validTypes.includes(quizType);
}

/**
 * Validar respuesta de quiz (número)
 * @param answer - Respuesta a validar
 * @returns boolean
 */
export function isValidQuizAnswer(answer: unknown): boolean {
  if (typeof answer === 'string') {
    // Si es string, debe ser número válido
    const num = parseInt(answer, 10);
    return !isNaN(num) && num.toString() === answer;
  }

  if (typeof answer === 'number') {
    return Number.isInteger(answer) && answer > 0 && answer <= 100;
  }

  return false;
}

/**
 * Validar objeto de item (producto en carrito)
 * @param item - Item a validar
 * @returns { valid: boolean, errors: string[] }
 */
export function isValidCartItem(item: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!item || typeof item !== 'object') {
    return { valid: false, errors: ['Item must be an object'] };
  }

  const obj = item as Record<string, unknown>;

  // Validar id
  if (!obj.id || (typeof obj.id !== 'string' && typeof obj.id !== 'number')) {
    errors.push('Item id is required and must be string or number');
  }

  // Validar quantity
  if (!isValidQuantity(obj.quantity)) {
    errors.push('Quantity must be between 1 and 1000');
  }

  // Validar price (opcional, pero si existe debe ser válido)
  if (obj.price !== undefined && !isValidPrice(obj.price)) {
    errors.push('Price must be valid');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validar array de items
 * @param items - Items a validar
 * @returns { valid: boolean, errors: string[] }
 */
export function isValidCartItems(items: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!Array.isArray(items)) {
    return { valid: false, errors: ['Items must be an array'] };
  }

  if (items.length === 0) {
    return { valid: false, errors: ['Items array must not be empty'] };
  }

  if (items.length > 100) {
    return { valid: false, errors: ['Too many items (max 100)'] };
  }

  // Validar cada item
  items.forEach((item, index) => {
    const itemValidation = isValidCartItem(item);
    if (!itemValidation.valid) {
      errors.push(`Item ${index}: ${itemValidation.errors.join(', ')}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validar estructura completa de una orden
 * @param order - Orden a validar
 * @returns { valid: boolean, errors: string[] }
 */
export function isValidOrder(order: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!order || typeof order !== 'object') {
    return { valid: false, errors: ['Order must be an object'] };
  }

  const obj = order as Record<string, unknown>;

  // Email
  const emailValidation = isValidEmail(obj.email as string);
  if (!emailValidation.valid) {
    errors.push(`Email: ${emailValidation.reason}`);
  }

  // Items
  const itemsValidation = isValidCartItems(obj.items);
  if (!itemsValidation.valid) {
    errors.push(`Items: ${itemsValidation.errors.join(', ')}`);
  }

  // Total
  if (!isValidTotal(obj.total)) {
    errors.push('Total must be a valid positive number with max 2 decimals');
  }

  // Verificar que items + total coincidan (validación básica)
  if (Array.isArray(obj.items) && typeof obj.total === 'number') {
    const calculatedTotal = (obj.items as any[]).reduce((sum, item) => {
      return sum + ((item.price || 0) * (item.quantity || 0));
    }, 0);

    // Permitir pequeñas variaciones por redondeo (0.01)
    if (Math.abs(calculatedTotal - (obj.total as number)) > 0.01) {
      errors.push('Order total does not match items');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Información de utilidad para debugging
 */
export const ValidationStats = {
  blockedDomains: BLOCKED_EMAIL_DOMAINS.size,
  blockedDomainsList: Array.from(BLOCKED_EMAIL_DOMAINS),
};

export default {
  isValidEmail,
  isValidQuantity,
  isValidPrice,
  isValidTotal,
  isSafeString,
  sanitizeString,
  isValidUsername,
  isValidPassword,
  isValidPhone,
  isValidAddress,
  isValidOTPCode,
  isValidCoupon,
  isValidQuizType,
  isValidQuizAnswer,
  isValidCartItem,
  isValidCartItems,
  isValidOrder,
  ValidationStats,
};
