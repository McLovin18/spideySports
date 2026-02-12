import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/utils/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { checkRateLimit, getClientIP, recordFailedAttempt, blockKey } from '@/app/utils/rateLimiter';
import { isValidEmail } from '@/app/utils/validation';
import { logAudit, AuditHelpers } from '@/app/utils/auditLogger';

/**
 * 🔐 QUIZ VERIFICATION ENDPOINT - Server-side secret validation
 * 
 * Rate limits:
 * - 5 intentos/minuto por IP
 * - 3 intentos/minuto por email
 * - 5 intentos/minuto por quizType
 * - Bloqueo de 10 minutos después de 3 fallos consecutivos
 */

// Quiz answer database (server-side secret)
const QUIZ_DATABASE = {
  legalAge: {
    questions: [
      {
        id: 'q1',
        text: '¿A qué edad es legal comprar alcohol?',
        answers: ['18', 'dieciocho'],
      },
    ],
  },
  terms: {
    questions: [
      {
        id: 'q1',
        text: '¿Acepta nuestros términos y condiciones?',
        answers: ['si', 'sí', 'yes', 'aceptar'],
      },
    ],
  },
};

interface VerifyQuizRequest {
  answer: string;
  quizType: keyof typeof QUIZ_DATABASE;
  email: string;
}

interface VerifyQuizResponse {
  success: boolean;
  verified: boolean;
  token?: string;
  message: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);

  try {
    const body: VerifyQuizRequest = await request.json();
    const { answer, quizType, email } = body;

    // ✅ VALIDAR EMAIL
    const emailValidation = isValidEmail(email);
    if (!emailValidation.valid) {
      console.log('[QUIZ-VERIFY] Email inválido:', emailValidation.reason);
      await logAudit('QUIZ_VERIFY', { email, reason: emailValidation.reason }, request, {
        status: 'failed',
        severity: 'low',
      });
      return NextResponse.json(
        {
          success: false,
          verified: false,
          message: emailValidation.reason,
          error: 'INVALID_EMAIL',
        } as VerifyQuizResponse,
        { status: 400 }
      );
    }

    // ✅ VALIDAR RESPUESTA
    if (!answer || typeof answer !== 'string') {
      console.log('[QUIZ-VERIFY] Answer inválido');
      await logAudit('QUIZ_VERIFY', { email, reason: 'Invalid answer' }, request, {
        status: 'failed',
        severity: 'low',
      });
      return NextResponse.json(
        {
          success: false,
          verified: false,
          message: 'Answer is required',
          error: 'INVALID_ANSWER',
        } as VerifyQuizResponse,
        { status: 400 }
      );
    }

    // ✅ VALIDAR QUIZ TYPE
    if (!quizType || !QUIZ_DATABASE[quizType]) {
      console.log('[QUIZ-VERIFY] Quiz type inválido:', quizType);
      await logAudit('QUIZ_VERIFY', { email, reason: 'Invalid quiz type' }, request, {
        status: 'failed',
        severity: 'low',
      });
      return NextResponse.json(
        {
          success: false,
          verified: false,
          message: 'Invalid quiz type',
          error: 'INVALID_QUIZ_TYPE',
        } as VerifyQuizResponse,
        { status: 400 }
      );
    }

    // 🔐 RATE LIMITING - MÚLTIPLES CAPAS
    const keyIP = `${clientIP}-quiz`;
    const keyEmail = `${email}-quiz`;
    const keyQuizType = `${quizType}-quiz`;

    // Limit por IP: 5 intentos/minuto
    const limitIP = checkRateLimit(keyIP, { maxRequests: 5, windowMs: 60000 });
    if (!limitIP.allowed) {
      console.warn(`⚠️ Rate limit por IP excedido: ${clientIP}`);
      await logAudit('QUIZ_VERIFY_RATE_LIMIT_IP', { email, clientIP }, request, {
        status: 'blocked',
        severity: 'medium',
      });
      return NextResponse.json(
        {
          success: false,
          verified: false,
          message: 'Too many attempts from your IP. Please try again later.',
          error: 'RATE_LIMIT_IP',
        },
        {
          status: 429,
          headers: { 'Retry-After': limitIP.retryAfter?.toString() || '60' },
        }
      );
    }

    // Limit por email: 3 intentos/minuto
    const limitEmail = checkRateLimit(keyEmail, { maxRequests: 3, windowMs: 60000 });
    if (!limitEmail.allowed) {
      console.warn(`⚠️ Rate limit por email excedido: ${email}`);
      await logAudit('QUIZ_VERIFY_RATE_LIMIT_EMAIL', { email }, request, {
        status: 'blocked',
        severity: 'medium',
      });
      return NextResponse.json(
        {
          success: false,
          verified: false,
          message: 'Too many attempts for this email. Please try again later.',
          error: 'RATE_LIMIT_EMAIL',
        },
        {
          status: 429,
          headers: { 'Retry-After': limitEmail.retryAfter?.toString() || '60' },
        }
      );
    }

    // Limit por quizType: 5 intentos/minuto
    const limitQuizType = checkRateLimit(keyQuizType, { maxRequests: 5, windowMs: 60000 });
    if (!limitQuizType.allowed) {
      console.warn(`⚠️ Rate limit por quizType excedido: ${quizType}`);
      await logAudit('QUIZ_VERIFY_RATE_LIMIT_TYPE', { email, quizType }, request, {
        status: 'blocked',
        severity: 'medium',
      });
      return NextResponse.json(
        {
          success: false,
          verified: false,
          message: 'Too many attempts for this quiz. Please try again later.',
          error: 'RATE_LIMIT_QUIZ',
        },
        {
          status: 429,
          headers: { 'Retry-After': limitQuizType.retryAfter?.toString() || '60' },
        }
      );
    }

    // 🔐 VERIFICAR RESPUESTA EN SERVIDOR (secreto)
    const quiz = QUIZ_DATABASE[quizType];
    const question = quiz.questions[0];

    const normalizedAnswer = answer.trim().toLowerCase();
    const isCorrect = question.answers.some(
      (correctAnswer) => normalizedAnswer === correctAnswer.toLowerCase()
    );

    // 🔐 RASTREAR INTENTOS FALLIDOS
    if (!isCorrect) {
      const failedAttempts = recordFailedAttempt(keyEmail);
      console.log(`❌ Intento fallido para ${email}: ${failedAttempts}/3`);
      
      await logAudit('QUIZ_VERIFY_WRONG_ANSWER', { email, quizType }, request, {
        status: 'failed',
        severity: 'low',
        email,
      });

      // Bloquear después de 3 fallos consecutivos (10 minutos)
      if (failedAttempts >= 3) {
        console.error(`🚨 BLOQUEADO: ${email} - Demasiados intentos fallidos`);
        blockKey(keyEmail, 10 * 60 * 1000); // 10 minutos

        await logAudit('QUIZ_VERIFY_BLOCKED', { email, quizType, failedAttempts }, request, {
          status: 'blocked',
          severity: 'high',
          email,
        });
        
        return NextResponse.json(
          {
            success: false,
            verified: false,
            message: 'Too many failed attempts. Your account is temporarily blocked.',
            error: 'BLOCKED',
          },
          { status: 429, headers: { 'Retry-After': '600' } } // 10 minutos
        );
      }

      return NextResponse.json(
        {
          success: true,
          verified: false,
          message: 'Incorrect answer. Please try again.',
          error: 'WRONG_ANSWER',
        } as VerifyQuizResponse,
        { status: 200 }
      );
    }

    // ✅ RESPUESTA CORRECTA - Generar token
    const verificationToken = `quiz_${quizType}_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      // Guardar en Firestore (opcional para rate limiting test)
      try {
        const verificationRef = doc(db, 'quizVerifications', verificationToken);
        await setDoc(verificationRef, {
          email,
          quizType,
          token: verificationToken,
          verified: true,
          clientIP,
          timestamp: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutos
        });
        console.log(`✅ Quiz verificado y guardado en Firestore para ${email}: ${quizType}`);

        await logAudit('QUIZ_VERIFY_SUCCESS', { email, quizType }, request, {
          status: 'success',
          severity: 'low',
          email,
        });
      } catch (firestoreError) {
        // Firestore write failed, but we still return success with the token
        // This allows testing rate limiting even if Firestore permissions aren't configured
        console.warn(`⚠️ Firestore write failed (permissions issue), but returning success token:`, firestoreError);
        
        await logAudit('QUIZ_VERIFY_SUCCESS_FIRESTORE_WARN', { email, quizType }, request, {
          status: 'success',
          severity: 'medium',
          email,
        });
      }

      return NextResponse.json(
        {
          success: true,
          verified: true,
          token: verificationToken,
          message: 'Correct answer! Verification token generated.',
        } as VerifyQuizResponse,
        { status: 200 }
      );
    } catch (error) {
      console.error('Error en quiz verification:', error);
      
      await logAudit('QUIZ_VERIFY_ERROR', { email, quizType, error: String(error) }, request, {
        status: 'failed',
        severity: 'high',
        email,
      });

      return NextResponse.json(
        {
          success: false,
          verified: false,
          message: 'Quiz verification failed',
          error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
        } as VerifyQuizResponse,
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error en quiz verification:', error);
    
    await logAudit('QUIZ_VERIFY_ERROR', { error: String(error) }, request, {
      status: 'failed',
      severity: 'high',
    });

    return NextResponse.json(
      {
        success: false,
        verified: false,
        message: 'Quiz verification failed',
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      } as VerifyQuizResponse,
      { status: 500 }
    );
  }
}
