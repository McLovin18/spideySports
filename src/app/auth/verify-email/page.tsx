'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendEmailVerification, auth } from '../../utils/firebase';
import { Button, Card, Alert } from 'react-bootstrap';

const VerifyEmail = () => {
  const router = useRouter();
  const [message, setMessage] = useState('');

  const handleResend = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
      setMessage('Se ha reenviado el correo de verificación.');
    }
  };

  const goToLogin = () => {
    router.push('/auth/login'); // Lleva al login para iniciar sesión después de verificar
  };

  return (
    <main className="auth-page">
      <Card className="auth-card shadow-lg border-0">
        <div className="auth-card-header text-center mb-4">
          <span className="auth-tagline">SpideySports Matchday</span>
          <h3 className="auth-title">Verifica tu correo</h3>
          <p className="auth-subtitle">Confirma tu cuenta para desbloquear fichajes, listas personalizadas y alertas de drops.</p>
        </div>

        {message && <Alert variant="success" className="auth-alert">{message}</Alert>}

        <Button variant="primary" className="w-100 mb-3" onClick={handleResend}>
          Reenviar correo de verificación
        </Button>

        <Button variant="outline-light" className="w-100" onClick={goToLogin}>
          Ya verifiqué, iniciar sesión
        </Button>
      </Card>
    </main>
  );
};

export default VerifyEmail;
