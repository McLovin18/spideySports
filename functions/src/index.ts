import { onRequest } from "firebase-functions/v2/https";
import dotenv from "dotenv";
dotenv.config();
import * as nodemailer from "nodemailer";
import * as cors from "cors";

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

// Configuración CORS
const corsHandler = cors.default({ origin: true });

export const sendOrderEmail = onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Only POST allowed" });
    }

    let body: any = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }

    const { email, orderId, items, total, deliveryLocation } = body;

    if (!email || !orderId || !items || !total) {
      return res.status(400).json({ error: "Missing fields" });
    }

    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: EMAIL_USER,
          pass: EMAIL_PASS
        },
      });

      await transporter.sendMail({
        from: `"Tienda Online" <${EMAIL_USER}>`,
        to: email,
        subject: `Confirmación de Compra - Pedido ${orderId}`,
        html: `
          <h2>Gracias por tu compra</h2>
          <p><b>Pedido:</b> ${orderId}</p>
          <p><b>Total:</b> $${total}</p>
          <h3>Productos:</h3>
          <ul>${items.map((i: any) => `<li>${i.name} x${i.quantity} - $${i.price}</li>`).join("")}</ul>
          <h3>Entrega:</h3>
          <p>${deliveryLocation?.address || "Sin dirección"}</p>
          <p>Gracias, su pedido será entregado pronto.</p>
        `,
      });

      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("Error enviando correo:", err);
      return res.status(500).json({ error: err.message });
    }
  });
});

