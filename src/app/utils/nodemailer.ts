import * as nodemailer from 'nodemailer';

const EMAIL_USER = process.env.EMAIL_USER || 'hectorcobea03@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || '';

// Crear transporter una sola vez (reutilizable)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

export async function sendOTPViaEmail(email: string, otp: string): Promise<boolean> {
  try {
    console.log(`[NODEMAILER] Iniciando envío a: ${email}`);
    console.log(`[NODEMAILER] EMAIL_USER: ${EMAIL_USER}`);
    console.log(`[NODEMAILER] EMAIL_PASS configurada: ${!!EMAIL_PASS}`);

    if (!EMAIL_PASS) {
      console.error('[NODEMAILER] ERROR: EMAIL_PASS no está configurada');
      return false;
    }

    // Enviar email
    const info = await transporter.sendMail({
      from: `"SpideySports" <${EMAIL_USER}>`,
      to: email,
      subject: 'Tu código de verificación - SpideySports',
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #f5f5f5; padding: 20px;">
          <div style="background-color: white; border-radius: 10px; padding: 30px; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #333; text-align: center;">Verifica tu email</h2>
            <p style="color: #666; text-align: center; margin-bottom: 30px;">
              Usa este código para completar tu compra en SpideySports
            </p>
            
            <div style="background-color: #f0f0f0; border: 2px solid #007bff; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
              <p style="font-size: 32px; font-weight: bold; color: #007bff; margin: 0; letter-spacing: 5px;">
                ${otp}
              </p>
            </div>
            
            <p style="color: #999; font-size: 12px; text-align: center;">
              Este código es válido por 10 minutos
            </p>
            
            <p style="color: #999; font-size: 12px; text-align: center;">
              Si no solicitaste este código, ignora este email
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 11px; text-align: center;">
              © 2026 SpideySports. Todos los derechos reservados.
            </p>
          </div>
        </div>
      `,
    });

    console.log(`[NODEMAILER] Email enviado exitosamente!`);
    console.log(`[NODEMAILER] Message ID: ${info.messageId}`);
    return true;

  } catch (error) {
    console.error(`[NODEMAILER] Error enviando email:`, error);
    if (error instanceof Error) {
      console.error(`[NODEMAILER] Mensaje: ${error.message}`);
    }
    return false;
  }
}
