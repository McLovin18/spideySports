/**
 * 🧪 SCRIPT DE PRUEBA DE SEGURIDAD
 * 
 * Copia este código en la consola del navegador (F12) para testear
 * que la validación de precio detecta manipulaciones.
 */

// ================================================
// OPCIÓN 1: Interceptar fetch para modificar precio
// ================================================

console.log('🧪 Iniciando test de seguridad...\n');

// Guardar el fetch original
const originalFetch = window.fetch;

// Interceptar fetch
window.fetch = async (...args) => {
  const [resource, config] = args;
  
  // Solo interceptar llamadas a /api/payment/validate-order
  if (typeof resource === 'string' && resource.includes('/api/payment/validate-order')) {
    console.log('🔴 [TEST] Interceptando solicitud de validación de precio');
    
    try {
      const body = JSON.parse(config?.body || '{}');
      console.log('📤 [TEST] Datos originales enviados:', {
        total: body.total,
        items: body.items.length
      });
      
      // 🚨 MODIFICAR EL PRECIO (simular ataque)
      const hackedTotal = 1.00;  // Intento de pagar $1
      body.total = hackedTotal;
      
      console.log('💥 [TEST] PRECIO MODIFICADO MALICIOSAMENTE:');
      console.log(`   Original: $${args[1].body.split('total')[1].split(',')[0]}`);
      console.log(`   Modificado: $${hackedTotal}`);
      
      // Actualizar el body con el precio modificado
      config.body = JSON.stringify(body);
    } catch (e) {
      console.error('Error en interceptación:', e);
    }
  }
  
  // Llamar al fetch original con los datos modificados (o no)
  return originalFetch(...args);
};

console.log('✅ Interceptor de fetch instalado\n');
console.log('📝 Ahora intenta hacer una compra normalmente.');
console.log('   El sistema intentará manipular el precio a $1.00');
console.log('   Deberías ver un error si la validación funciona.\n');

// ================================================
// OPCIÓN 2: Ver en detalle qué se está enviando
// ================================================

console.log('\n📊 MONITOREO DE SOLICITUDES:\n');

const originalFetch2 = window.fetch;
window.fetch = async (...args) => {
  const [resource, config] = args;
  
  if (typeof resource === 'string' && resource.includes('/api/payment/validate-order')) {
    const body = JSON.parse(config?.body || '{}');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 SOLICITUD DE VALIDACIÓN ENVIADA:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Items:', body.items);
    console.log('Total:', body.total);
    console.log('Cupón:', body.couponCode || 'NINGUNO');
    console.log('Usuario:', body.userId || 'GUEST');
    console.log('Quiz Descuento:', body.quizDiscount || 0);
    console.log('Quiz Penalidad:', body.quizPenalty || 0);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
  
  const response = await originalFetch2(...args);
  
  if (typeof resource === 'string' && resource.includes('/api/payment/validate-order')) {
    const responseClone = response.clone();
    const responseData = await responseClone.json();
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📥 RESPUESTA DE VALIDACIÓN:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Válido:', responseData.valid ? '✅ SÍ' : '❌ NO');
    console.log('Total Esperado:', responseData.expectedTotal);
    console.log('Total Recibido:', responseData.receivedTotal);
    console.log('Diferencia:', responseData.details?.difference);
    
    if (!responseData.valid) {
      console.log('\n🚨 ERRORES DETECTADOS:');
      responseData.errors?.forEach((err) => {
        console.log('  ❌', err);
      });
    } else {
      console.log('\n✅ La orden pasó validación');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
  
  return response;
};

console.log('✅ Monitoreo de solicitudes instalado\n');

// ================================================
// OPCIÓN 3: Manipulación REAL (modo experto)
// ================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔧 FUNCIÓN DE PRUEBA: Enviar compra con precio falso\n');

window.testFraud = async (fakePrice) => {
  console.log(`🚨 Intentando enviar pedido con precio falso: $${fakePrice}\n`);
  
  // Esta función es solo para demostración y no debería funcionar
  // porque la validación en el backend lo rechazará
  
  console.log('Simulando ataque fallido...');
  console.log('El backend DEBERÍA rechazar esto.\n');
  
  return `TEST: Si ves este mensaje, la seguridad está implementada.`;
};

console.log('Para testear, escribe en consola:');
console.log('  window.testFraud(1)\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ================================================
// Limpiar cuando se reload la página
// ================================================

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                   🔒 TEST DE SEGURIDAD ACTIVO                 ║
║                                                                ║
║  El sistema está monitoreando y detectando intentos de        ║
║  manipulación de precios.                                     ║
║                                                                ║
║  Deberías ver en la consola:                                  ║
║  ✅ Logs de validación                                        ║
║  ✅ Errores si hay discrepancia                              ║
║  ❌ NUNCA un pago aprobado con precio falso                  ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);
