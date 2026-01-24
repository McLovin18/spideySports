'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import { Form, Button, Card, Alert } from 'react-bootstrap';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register, loginWithGoogle } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !password || !confirmPassword) {
      setError('Por favor, complete todos los campos');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    try {
      setLoading(true);
      await register(email, password, name);
      router.push('/auth/verify-email'); // 👈 Página de verificación
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        setError('Este correo electrónico ya está en uso');
      } else {
        setError('Error al crear la cuenta. Inténtelo de nuevo.');
        console.error(error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await loginWithGoogle();
      router.push('/');
    } catch (error) {
      setError('Error al iniciar sesión con Google');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <Card className="auth-card shadow-lg border-0">
        <div className="auth-card-header text-center mb-4">
          <span className="auth-tagline">SpideySports Matchday</span>
          <h2 className="auth-title">Crear cuenta</h2>
          <p className="auth-subtitle">Regístrate y completa tu colección de camisetas legendarias.</p>
        </div>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label>Nombre</Form.Label>
            <Form.Control type="text" value={name} onChange={(e) => setName(e.target.value)} required className="rounded-1" />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Email</Form.Label>
            <Form.Control type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-1" />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Contraseña</Form.Label>
            <Form.Control type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="rounded-1" />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Confirmar Contraseña</Form.Label>
            <Form.Control type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="rounded-1" />
          </Form.Group>
          {error && <Alert variant="danger" className="auth-alert">{error}</Alert>}
          <Button type="submit" variant="primary" className="w-100 rounded-1 mb-3" disabled={loading}>
            {loading ? 'Cargando...' : 'Crear cuenta'}
          </Button>
          <div className="auth-divider">
            <span>o continúa con</span>
          </div>
          <Button type="button" variant="outline-light" className="w-100 rounded-1" onClick={handleGoogleLogin} disabled={loading}>
            <i className="bi bi-google me-2"></i> Registrarse con Google
          </Button>
          <div className="text-center mt-3">
            <Link href="/auth/login" className="auth-link">¿Ya tienes cuenta? Inicia sesión</Link>
          </div>
        </Form>
      </Card>
    </main>
  );
};

export default Register;
