/* eslint-disable @typescript-eslint/no-explicit-any */
// 📧 Servicio de Email para Notificaciones de Delivery
// Este servicio maneja el envío de emails a repartidores

export interface EmailTemplate {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface UrgentContactEmail {
  deliveryPersonEmail: string;
  deliveryPersonName: string;
  order: {
    id: string;
    userName: string;
    userEmail: string;
    total: number;
    shipping: any;
  };
  adminMessage?: string;
}

export class EmailService {
  
  // 📧 Crear template de email para contacto urgente
  static createUrgentContactTemplate(data: UrgentContactEmail): EmailTemplate {
    const { deliveryPersonEmail, deliveryPersonName, order, adminMessage } = data;
    
    const subject = `🚨 URGENTE - Seguimiento Pedido #${order.id.substring(0, 8)}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #e74c3c; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
              .order-details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #3498db; }
              .action-required { background: #fff3cd; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #ffc107; }
              .footer { background: #34495e; color: white; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; }
              .urgent { color: #e74c3c; font-weight: bold; }
              ul { padding-left: 20px; }
              li { margin: 5px 0; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>🚨 CONTACTO URGENTE</h1>
                  <p>Administración - Tienda Online</p>
              </div>
              
              <div class="content">
                  <h2>Hola ${deliveryPersonName},</h2>
                  
                  <p>El administrador solicita <span class="urgent">seguimiento URGENTE</span> del siguiente pedido:</p>
                  
                  <div class="order-details">
                      <h3>📦 Detalles del Pedido</h3>
                      <ul>
                          <li><strong>Pedido:</strong> #${order.id.substring(0, 8)}</li>
                          <li><strong>Cliente:</strong> ${order.userName}</li>
                          <li><strong>Email:</strong> ${order.userEmail}</li>
                          <li><strong>Total:</strong> $${order.total.toFixed(2)}</li>
                          <li><strong>Dirección:</strong> ${order.shipping?.address || 'Ver en aplicación'}</li>
                          <li><strong>Teléfono:</strong> ${order.shipping?.phone || 'Ver en aplicación'}</li>
                      </ul>
                  </div>
                  
                  ${adminMessage ? `
                  <div class="action-required">
                      <h3>💬 Mensaje del Administrador</h3>
                      <p>${adminMessage}</p>
                  </div>
                  ` : ''}
                  
                  <div class="action-required">
                      <h3>⚡ ACCIÓN REQUERIDA</h3>
                      <ul>
                          <li>Contactar al cliente <strong>inmediatamente</strong></li>
                          <li>Confirmar dirección de entrega</li>
                          <li>Actualizar estado en la aplicación</li>
                          <li>Completar entrega lo antes posible</li>
                      </ul>
                  </div>
                  
                  <p><strong>Este pedido ha sido marcado como PRIORITARIO.</strong></p>
                  
                  <p>Si tienes algún problema con la entrega, contacta inmediatamente al administrador.</p>
              </div>
              
              <div class="footer">
                  <p>📧 Sistema Automatizado de Entregas</p>
                  <p>🏪 Tienda Online</p>
                  <p><small>Generado el ${new Date().toLocaleString('es-ES')}</small></p>
              </div>
          </div>
      </body>
      </html>
    `;
    
    const text = `
🚨 CONTACTO URGENTE - Administración Tienda Online

Hola ${deliveryPersonName},

El administrador solicita seguimiento URGENTE del siguiente pedido:

📦 DETALLES DEL PEDIDO:
• Pedido: #${order.id.substring(0, 8)}
• Cliente: ${order.userName}
• Email: ${order.userEmail}
• Total: $${order.total.toFixed(2)}
• Dirección: ${order.shipping?.address || 'Ver en aplicación'}
• Teléfono: ${order.shipping?.phone || 'Ver en aplicación'}

${adminMessage ? `💬 MENSAJE DEL ADMINISTRADOR:\n${adminMessage}\n\n` : ''}

⚡ ACCIÓN REQUERIDA:
• Contactar al cliente inmediatamente
• Confirmar dirección de entrega
• Actualizar estado en la aplicación
• Completar entrega lo antes posible

Este pedido ha sido marcado como PRIORITARIO.

Si tienes algún problema con la entrega, contacta inmediatamente al administrador.

---
📧 Sistema Automatizado de Entregas
🏪 Tienda Online
Generado el ${new Date().toLocaleString('es-ES')}
    `;
    
    return {
      to: deliveryPersonEmail,
      subject,
      html,
      text
    };
  }
  
  // 📧 Enviar email usando el cliente de email por defecto del sistema
  static sendUrgentContactEmail(data: UrgentContactEmail): void {
    const template = this.createUrgentContactTemplate(data);
    
    // Crear URL mailto con el contenido
    const subject = encodeURIComponent(template.subject);
    const body = encodeURIComponent(template.text);
    
    const mailtoUrl = `mailto:${template.to}?subject=${subject}&body=${body}`;
    
    // Intentar múltiples métodos para abrir el email
    try {
      // Método 1: window.open
      const emailWindow = window.open(mailtoUrl, '_blank');
      
      // Método 2: Si window.open falla, usar location.href como fallback
      setTimeout(() => {
        if (!emailWindow || emailWindow.closed) {
          window.location.href = mailtoUrl;
        }
      }, 100);
      
    } catch (error) {
      console.error('Error abriendo cliente de email:', error);
      
      // Método 3: Fallback - copiar al clipboard y mostrar instrucciones
      this.copyEmailToClipboard(template);
    }
  }
  
  // 📋 Copiar email al clipboard como fallback
  static copyEmailToClipboard(template: EmailTemplate): void {
    const emailContent = `Para: ${template.to}\nAsunto: ${template.subject}\n\n${template.text}`;
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(emailContent).then(() => {
        alert('📧 Email copiado al portapapeles.\n\nAbre tu cliente de email y pega el contenido.');
      }).catch(() => {
        this.showEmailInModal(template);
      });
    } else {
      this.showEmailInModal(template);
    }
  }
  
  // 📝 Mostrar email en modal como último recurso
  static showEmailInModal(template: EmailTemplate): void {
    const emailContent = `Para: ${template.to}\nAsunto: ${template.subject}\n\n${template.text}`;
    
    // Crear modal temporal
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
      background: rgba(0,0,0,0.5); z-index: 10000; display: flex; 
      align-items: center; justify-content: center;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      background: white; padding: 20px; border-radius: 8px; 
      max-width: 600px; max-height: 80%; overflow-y: auto;
    `;
    
    content.innerHTML = `
      <h3>📧 Email para Repartidor</h3>
      <p>Copia este contenido y envíalo por email:</p>
      <textarea style="width: 100%; height: 300px; font-family: monospace;">${emailContent}</textarea>
      <br><br>
      <button onclick="this.parentElement.parentElement.remove()" 
              style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px;">
        Cerrar
      </button>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
  }
  
  // 📧 Crear template simple para seguimiento
  static createFollowUpTemplate(deliveryPersonEmail: string, orderInfo: any): EmailTemplate {
    const subject = `📋 Seguimiento Pedido #${orderInfo.id?.substring(0, 8)}`;
    
    const text = `
Hola,

Solicito seguimiento del pedido #${orderInfo.id?.substring(0, 8)}.

Cliente: ${orderInfo.userName}
Total: $${orderInfo.total}

Por favor confirma el estado de la entrega.

Saludos,
Administración
    `;
    
    return {
      to: deliveryPersonEmail,
      subject,
      html: text.replace(/\n/g, '<br>'),
      text
    };
  }
}

export default EmailService;
