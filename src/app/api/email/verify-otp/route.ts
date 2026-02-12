import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/utils/firebase';
import { doc, setDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { sendOTPViaEmail } from '@/app/utils/nodemailer';
import { isValidEmail, isValidOTPCode } from '@/app/utils/validation';
import { logAudit, getClientIP, AuditHelpers } from '@/app/utils/auditLogger';

console.log('[OTP ROUTE] Modulo cargado - DB disponible:', !!db);

interface SendOTPRequest {
  email: string;
}

interface VerifyOTPRequest {
  email: string;
  otp: string;
}

interface OTPResponse {
  success: boolean;
  message?: string;
  errors?: string[];
  otpId?: string;
  verified?: boolean;
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOTPEmail(email: string, otp: string): Promise<boolean> {
  // Usar Nodemailer directamente en lugar de Cloud Functions
  return await sendOTPViaEmail(email, otp);
}

export async function POST(request: NextRequest) {
  try {
    console.log('\n========================================');
    console.log('[OTP-POST] Solicitud recibida');
    console.log('[OTP-POST] URL:', request.url);
    
    const body = await request.json();
    console.log('[OTP-POST] Body:', body);
    
    const action = request.nextUrl.searchParams.get('action');
    console.log('[OTP-POST] Action:', action);
    console.log('[OTP-POST] DB existe:', !!db);
    console.log('========================================\n');

    if (action === 'send') {
      console.log('[OTP-POST] -> Llamando handleSendOTP');
      return handleSendOTP(body as SendOTPRequest, request);
    } else if (action === 'verify') {
      console.log('[OTP-POST] -> Llamando handleVerifyOTP');
      return handleVerifyOTP(body as VerifyOTPRequest, request);
    } else {
      return NextResponse.json({
        success: false,
        message: 'Accion no especificada',
        errors: ['Usa ?action=send o ?action=verify'],
      } as OTPResponse, { status: 400 });
    }
  } catch (error) {
    console.error('[OTP-POST] Error:', error);
    return NextResponse.json({
      success: false,
      message: 'Error en handler',
      errors: [error instanceof Error ? error.message : String(error)],
    } as OTPResponse, { status: 500 });
  }
}

async function handleSendOTP(
  body: SendOTPRequest,
  request: NextRequest
): Promise<NextResponse<OTPResponse>> {
  const { email } = body;
  console.log('[SEND-OTP] Iniciando - email:', email);

  // ✅ VALIDAR EMAIL
  const emailValidation = isValidEmail(email);
  if (!emailValidation.valid) {
    console.log('[SEND-OTP] Email inválido:', emailValidation.reason);
    await logAudit('OTP_SEND', { email, reason: emailValidation.reason }, request, {
      status: 'failed',
      severity: 'low',
    });
    return NextResponse.json(
      {
        success: false,
        message: emailValidation.reason,
        errors: [emailValidation.reason || 'Invalid email'],
      } as OTPResponse,
      { status: 400 }
    );
  }

  const otp = generateOTP();
  const otpId = `otp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    if (!db) throw new Error('Firebase DB no esta inicializado');

    const otpRef = doc(db, 'emailVerifications', otpId);
    const dataToSave = {
      email,
      otp,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      attempts: 0,
      verified: false,
    };

    await setDoc(otpRef, dataToSave);
    console.log('[SEND-OTP] Datos guardados en Firestore');

    const emailSent = await sendOTPEmail(email, otp);

    if (!emailSent) {
      console.error('[SEND-OTP] Error al enviar email');
      await logAudit('OTP_SEND', { email, reason: 'Email send failed' }, request, {
        status: 'failed',
        severity: 'high',
        email,
      });
      return NextResponse.json(
        {
          success: false,
          message: 'OTP creado pero no se pudo enviar el email',
          errors: ['Intenta más tarde'],
        } as OTPResponse,
        { status: 500 }
      );
    }

    console.log('[SEND-OTP] Email enviado exitosamente');
    await logAudit('OTP_SEND', { email }, request, {
      status: 'success',
      severity: 'low',
      email,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Codigo enviado a ${email}`,
        otpId,
      } as OTPResponse,
      { status: 200 }
    );
  } catch (error) {
    console.error('[SEND-OTP] Error:', error);
    await logAudit('OTP_SEND', { email, error: String(error) }, request, {
      status: 'failed',
      severity: 'high',
      email,
    });
    return NextResponse.json(
      {
        success: false,
        message: 'Error guardando OTP',
        errors: [error instanceof Error ? error.message : String(error)],
      } as OTPResponse,
      { status: 500 }
    );
  }
}

async function handleVerifyOTP(
  body: VerifyOTPRequest,
  request: NextRequest
): Promise<NextResponse<OTPResponse>> {
  const { email, otp } = body;

  console.log('[VERIFY-OTP] Email:', email, 'OTP:', otp);

  // ✅ VALIDAR EMAIL
  const emailValidation = isValidEmail(email);
  if (!emailValidation.valid) {
    console.log('[VERIFY-OTP] Email inválido');
    await AuditHelpers.logOTPFailed(email, emailValidation.reason || 'Invalid email', request);
    return NextResponse.json({
      success: false,
      message: emailValidation.reason,
      errors: [emailValidation.reason || 'Invalid email'],
    } as OTPResponse, { status: 400 });
  }

  // ✅ VALIDAR OTP CODE (6 dígitos)
  if (!isValidOTPCode(otp)) {
    console.log('[VERIFY-OTP] Código OTP inválido');
    await AuditHelpers.logOTPFailed(email, 'Invalid OTP format', request);
    return NextResponse.json({
      success: false,
      message: 'OTP invalido',
      errors: ['El codigo debe tener 6 digitos'],
    } as OTPResponse, { status: 400 });
  }

  try {
    console.log('[VERIFY-OTP] Buscando OTP en Firestore para:', email);

    const emailVerificationsRef = collection(db, 'emailVerifications');
    const q = query(emailVerificationsRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);

    console.log(`[VERIFY-OTP] Documentos encontrados: ${querySnapshot.size}`);

    if (querySnapshot.empty) {
      console.log('[VERIFY-OTP] No se encontró documento OTP para este email');
      await AuditHelpers.logOTPFailed(email, 'No OTP found', request);
      return NextResponse.json({
        success: false,
        message: 'No se encontró codigo para este email',
        errors: ['Solicita un nuevo codigo'],
      } as OTPResponse, { status: 400 });
    }

    let otpData: any = null;
    let otpDocId = '';

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (!otpData || new Date(data.createdAt) > new Date(otpData.createdAt)) {
        otpData = data;
        otpDocId = doc.id;
      }
    });

    const now = new Date();
    const expiresAt = new Date(otpData.expiresAt);

    if (now > expiresAt) {
      console.log('[VERIFY-OTP] OTP expirado');
      await AuditHelpers.logOTPFailed(email, 'OTP expired', request);
      return NextResponse.json({
        success: false,
        message: 'Codigo expirado',
        errors: ['Solicita un nuevo codigo'],
      } as OTPResponse, { status: 400 });
    }

    if (otpData.otp !== otp) {
      console.log('[VERIFY-OTP] OTP no coincide');
      await updateDoc(doc(db, 'emailVerifications', otpDocId), {
        attempts: (otpData.attempts || 0) + 1,
      });
      await AuditHelpers.logOTPFailed(email, 'OTP mismatch', request);

      return NextResponse.json({
        success: false,
        message: 'Codigo incorrecto',
        errors: ['El OTP no coincide'],
      } as OTPResponse, { status: 400 });
    }

    console.log('[VERIFY-OTP] OTP correcto! Marcando como verificado');

    await updateDoc(doc(db, 'emailVerifications', otpDocId), {
      verified: true,
      verifiedAt: new Date().toISOString(),
    });

    const verificationRef = doc(db, 'verifiedEmails', email.replace('@', '_').replace('.', '_'));
    await setDoc(verificationRef, {
      email,
      verifiedAt: new Date().toISOString(),
      status: 'verified',
    }, { merge: true });

    console.log('[VERIFY-OTP] Email verificado exitosamente');

    await logAudit('OTP_VERIFY_SUCCESS', { email }, request, {
      status: 'success',
      severity: 'low',
      email,
    });

    return NextResponse.json({
      success: true,
      message: `Email verificado: ${email}`,
      verified: true,
    } as OTPResponse, { status: 200 });
  } catch (error) {
    console.error('[VERIFY-OTP] Error:', error);
    await logAudit('OTP_VERIFY_SUCCESS', { email, error: String(error) }, request, {
      status: 'failed',
      severity: 'high',
      email,
    });
    return NextResponse.json({
      success: false,
      message: 'Error verificando codigo',
      errors: [error instanceof Error ? error.message : 'Error desconocido'],
    } as OTPResponse, { status: 500 });
  }
}