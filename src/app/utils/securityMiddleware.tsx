/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 🔒 MIDDLEWARE DE SEGURIDAD
 * Sistema de protección y validación para componentes
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AccessControl, SecureLogger, SessionValidator } from '../utils/security';

// ✅ HOOK DE PROTECCIÓN DE RUTAS
export const useRouteProtection = (requiredRole?: 'admin' | 'delivery' | 'user') => {
  const { user, loading } = useAuth();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuthorization = async () => {
      if (loading) return;

      if (!user) {
        SecureLogger.security('Unauthorized access attempt', { requiredRole });
        setAuthorized(false);
        setChecking(false);
        return;
      }

      // Validar sesión
      const validSession = await SessionValidator.validateSession();
      if (!validSession) {
        SecureLogger.security('Invalid session during route protection', { userId: user.uid });
        setAuthorized(false);
        setChecking(false);
        return;
      }

      // Verificar rol específico
      if (requiredRole) {
        let hasRole = false;
        
        switch (requiredRole) {
          case 'admin':
            hasRole = await AccessControl.isAdmin(user.email!);
            break;
          case 'delivery':
            hasRole = await AccessControl.isDelivery(user.email!);
            break;
          case 'user':
            hasRole = true; // Cualquier usuario autenticado
            break;
        }

        if (!hasRole) {
          SecureLogger.security('Insufficient permissions', { 
            userId: user.uid, 
            requiredRole, 
            userEmail: user.email 
          });
          setAuthorized(false);
          setChecking(false);
          return;
        }
      }

      setAuthorized(true);
      setChecking(false);
    };

    checkAuthorization();
  }, [user, loading, requiredRole]);

  return { authorized, checking };
};

// ✅ COMPONENTE DE PROTECCIÓN
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'delivery' | 'user';
  fallback?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRole, 
  fallback 
}) => {
  const { authorized, checking } = useRouteProtection(requiredRole);

  if (checking) {
    return React.createElement('div', {
      className: 'd-flex justify-content-center align-items-center',
      style: { minHeight: '50vh' }
    }, React.createElement('div', {
      className: 'spinner-border text-cosmetic-primary',
      role: 'status'
    }, React.createElement('span', {
      className: 'visually-hidden'
    }, 'Verificando permisos...')));
  }

  if (!authorized) {
    return fallback || React.createElement('div', {
      className: 'container mt-5'
    }, React.createElement('div', {
      className: 'row justify-content-center'
    }, React.createElement('div', {
      className: 'col-md-6'
    }, React.createElement('div', {
      className: 'card'
    }, React.createElement('div', {
      className: 'card-body text-center'
    }, [
      React.createElement('i', {
        className: 'bi bi-shield-exclamation text-warning fs-1 mb-3',
        key: 'icon'
      }),
      React.createElement('h4', { key: 'title' }, 'Acceso Denegado'),
      React.createElement('p', {
        className: 'text-muted',
        key: 'message'
      }, 'No tienes permisos para acceder a esta sección.'),
      React.createElement('button', {
        className: 'btn btn-cosmetic-primary',
        onClick: () => window.history.back(),
        key: 'button'
      }, 'Volver')
    ])))));
  }

  return React.createElement(React.Fragment, null, children);
};

// ✅ HOOK DE VALIDACIÓN DE FORMULARIOS
export const useSecureForm = () => {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = (name: string, value: string, rules: any = {}) => {
    const newErrors = { ...errors };

    // Limpiar error previo
    delete newErrors[name];

    // Validaciones comunes
    if (rules.required && !value.trim()) {
      newErrors[name] = 'Este campo es obligatorio';
    } else if (rules.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      newErrors[name] = 'Email inválido';
    } else if (rules.minLength && value.length < rules.minLength) {
      newErrors[name] = `Mínimo ${rules.minLength} caracteres`;
    } else if (rules.maxLength && value.length > rules.maxLength) {
      newErrors[name] = `Máximo ${rules.maxLength} caracteres`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const clearErrors = () => setErrors({});

  return {
    errors,
    isSubmitting,
    setIsSubmitting,
    validateField,
    clearErrors,
    hasErrors: Object.keys(errors).length > 0
  };
};

// ✅ COMPONENTE DE INPUT SEGURO
interface SecureInputProps {
  name: string;
  label: string;
  type?: string;
  value: string;
  onChange: (name: string, value: string) => void;
  rules?: any;
  placeholder?: string;
  required?: boolean;
}

export const SecureInput: React.FC<SecureInputProps> = ({
  name,
  label,
  type = 'text',
  value,
  onChange,
  rules = {},
  placeholder,
  required = false
}) => {
  const [localError, setLocalError] = useState('');
  const [touched, setTouched] = useState(false);

  const handleBlur = () => {
    setTouched(true);
    validateInput();
  };

  const validateInput = () => {
    let error = '';

    if (required && !value.trim()) {
      error = 'Este campo es obligatorio';
    } else if (rules.email && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      error = 'Formato de email inválido';
    } else if (rules.minLength && value.length < rules.minLength) {
      error = `Mínimo ${rules.minLength} caracteres`;
    } else if (rules.pattern && !rules.pattern.test(value)) {
      error = rules.patternMessage || 'Formato inválido';
    }

    setLocalError(error);
    return !error;
  };

  return React.createElement('div', {
    className: 'mb-3'
  }, [
    React.createElement('label', {
      htmlFor: name,
      className: 'form-label',
      key: 'label'
    }, [
      label,
      required && React.createElement('span', {
        className: 'text-danger',
        key: 'required'
      }, ' *')
    ]),
    React.createElement('input', {
      type,
      className: `form-control ${touched && localError ? 'is-invalid' : ''}`,
      id: name,
      name,
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(name, e.target.value),
      onBlur: handleBlur,
      placeholder,
      maxLength: rules.maxLength || 255,
      key: 'input'
    }),
    touched && localError && React.createElement('div', {
      className: 'invalid-feedback',
      key: 'error'
    }, localError)
  ]);
};

// ✅ HOOK DE RATE LIMITING
export const useRateLimit = (action: string, maxAttempts: number = 5) => {
  const [blocked, setBlocked] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(maxAttempts);

  const checkRateLimit = () => {
    // Simular rate limiting del lado del cliente
    const key = `rate_limit_${action}`;
    const data = localStorage.getItem(key);
    
    if (data) {
      const { count, timestamp } = JSON.parse(data);
      const now = Date.now();
      const windowMs = 60000; // 1 minuto

      if (now - timestamp < windowMs) {
        if (count >= maxAttempts) {
          setBlocked(true);
          setAttemptsLeft(0);
          return false;
        }
        
        const newCount = count + 1;
        localStorage.setItem(key, JSON.stringify({ count: newCount, timestamp }));
        setAttemptsLeft(maxAttempts - newCount);
        return true;
      }
    }

    // Reiniciar contador
    localStorage.setItem(key, JSON.stringify({ count: 1, timestamp: Date.now() }));
    setAttemptsLeft(maxAttempts - 1);
    setBlocked(false);
    return true;
  };

  const resetRateLimit = () => {
    const key = `rate_limit_${action}`;
    localStorage.removeItem(key);
    setBlocked(false);
    setAttemptsLeft(maxAttempts);
  };

  return { blocked, attemptsLeft, checkRateLimit, resetRateLimit };
};
