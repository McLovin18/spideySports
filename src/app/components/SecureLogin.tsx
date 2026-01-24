'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Alert } from 'react-bootstrap';
import {
  InputValidator,
  DataSanitizer
} from '../utils/security';
import { useSecureForm, useRateLimit } from '../utils/securityMiddleware';

const SecureLogin: React.FC = () => {
  const { login, loginWithGoogle } = useAuth();

  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';

  const { errors, isSubmitting, setIsSubmitting, validateField, clearErrors } = useSecureForm();
  const { blocked, attemptsLeft, checkRateLimit } = useRateLimit('login', 3);

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [securityAlert, setSecurityAlert] = useState('');

  const handleInputChange = (name: string, value: string) => {
    const sanitizedValue = DataSanitizer.sanitizeText(value);
    setFormData(prev => ({ ...prev, [name]: sanitizedValue }));

    if (name === 'email') validateField(name, sanitizedValue, { required: true, email: true });
    else if (name === 'password') validateField(name, sanitizedValue, { required: true, minLength: 6 });
  };

  const validateForm = (): boolean => {
    let isValid = true;

    if (!InputValidator.isValidEmail(formData.email)) {
      validateField('email', formData.email, { required: true, email: true });
      isValid = false;
    }

    if (formData.password.length < 6) {
      validateField('password', formData.password, { required: true, minLength: 6 });
      isValid = false;
    }

    return isValid;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (blocked) {
      setSecurityAlert('Demasiados intentos fallidos. Intenta nuevamente en unos minutos.');
      return;
    }

    if (!checkRateLimit()) {
      setSecurityAlert(`Intentos restantes: ${attemptsLeft}. Ten cuidado.`);
      return;
    }

    if (!validateForm()) {
      setSecurityAlert('Por favor corrige los errores en el formulario.');
      return;
    }

    setIsSubmitting(true);
    setSecurityAlert('');

    try {
      await login(formData.email, formData.password);
      clearErrors();
      const redirect = sessionStorage.getItem('redirectAfterLogin') || '/';
      router.push(redirect);
      sessionStorage.removeItem('redirectAfterLogin');
  
    } catch (error: any) {
      let errorMessage = 'Error al iniciar sesión. Verifica tus credenciales.';
      switch (error.code) {
        case 'auth/email-not-verified':
          errorMessage = 'Debes verificar tu correo antes de iniciar sesión.';
          break;
        case 'auth/user-not-found':
          errorMessage = 'No existe una cuenta con este email.';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Contraseña incorrecta.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Demasiados intentos fallidos. Intenta más tarde.';
          break;
        case 'auth/user-disabled':
          errorMessage = 'Esta cuenta ha sido deshabilitada.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'El formato del email no es válido.';
          break;
      }
      setSecurityAlert(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (blocked || !checkRateLimit()) {
      setSecurityAlert('Demasiados intentos. Espera unos minutos.');
      return;
    }

    try {
      await loginWithGoogle();
      router.push(redirectTo); // <-- redirige al blog o página deseada
    } catch (error: any) {
      setSecurityAlert('Error al iniciar sesión con Google. Intenta nuevamente.');
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card shadow-lg border-0">
        <div className="text-center mb-4 auth-card-header">
          <span className="auth-tagline">SpideySports Matchday</span>
          <h2 className="auth-title">Iniciar sesión</h2>
          <p className="auth-subtitle">Vuelve a tu vestidor digital y sigue personalizando tu colección.</p>
        </div>

        {securityAlert && (
          <Alert variant="warning" className="auth-alert d-flex align-items-center">
            <i className="bi bi-shield-exclamation me-2"></i>
            <span>{securityAlert}</span>
          </Alert>
        )}

        {attemptsLeft < 3 && !blocked && (
          <Alert variant="info" className="auth-alert subtle">
            <i className="bi bi-info-circle me-2"></i>
            Intentos restantes: {attemptsLeft}
          </Alert>
        )}

        <form onSubmit={handleLogin}>
          <div className="mb-3">
            <label htmlFor="email" className="form-label">
              Email <span className="text-danger">*</span>
            </label>
            <div className="input-group">
              <span className="input-group-text"><i className="bi bi-envelope"></i></span>
              <input
                type="email"
                className={`form-control ${errors.email ? 'is-invalid' : ''}`}
                id="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="tu@email.com"
                maxLength={100}
                autoComplete="email"
                disabled={blocked}
              />
              {errors.email && <div className="invalid-feedback">{errors.email}</div>}
            </div>
          </div>

          <div className="mb-3">
            <label htmlFor="password" className="form-label">
              Contraseña <span className="text-danger">*</span>
            </label>
            <div className="input-group">
              <span className="input-group-text"><i className="bi bi-lock"></i></span>
              <input
                type={showPassword ? 'text' : 'password'}
                className={`form-control ${errors.password ? 'is-invalid' : ''}`}
                id="password"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                placeholder="••••••••"
                maxLength={128}
                autoComplete="current-password"
                disabled={blocked}
              />
              <button
                type="button"
                className="btn btn-outline-light"
                onClick={() => setShowPassword(!showPassword)}
                disabled={blocked}
              >
                <i className={`bi bi-eye${showPassword ? '-slash' : ''}`}></i>
              </button>
              {errors.password && <div className="invalid-feedback">{errors.password}</div>}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-100 mb-3"
            disabled={isSubmitting || blocked || Object.keys(errors).length > 0}
          >
            {isSubmitting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                Verificando...
              </>
            ) : (
              <>
                <i className="bi bi-box-arrow-in-right me-2"></i>
                Iniciar sesión
              </>
            )}
          </button>

          <div className="auth-divider">
            <span>o continúa con</span>
          </div>

          <button
            type="button"
            className="btn btn-outline-light w-100"
            onClick={handleGoogleLogin}
            disabled={blocked}
          >
            <i className="bi bi-google me-2"></i>
            Google
          </button>
        </form>

        <div className="auth-footer mt-4">
          <div className="auth-footer-item">
            <i className="bi bi-shield-check me-2"></i>
            Conexión segura SSL
          </div>
          <div className="auth-footer-item">
            ¿No tienes cuenta?{' '}
            <Link href="/auth/register" className="auth-link">
              Regístrate
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};

export default SecureLogin;
