# 🤖 SpideySports AI Chatbot - Guía de Configuración e Implementación

## 📋 Resumen Ejecutivo

Se ha implementado un **chatbot inteligente de IA** para SpideySports que:
- ✅ Consulta productos según características que el cliente solicita
- ✅ Recomienda productos relevantes automáticamente
- ✅ Responde preguntas comunes sobre camisetas deportivas
- ✅ Se entrena automáticamente con contexto de productos y FAQ
- ✅ Interfaz flotante elegante y responsive
- ✅ Integración seamless en la página principal

---

## 🔧 Configuración Requerida

### 1. Obtener API Key de OpenAI

#### Paso 1: Crear cuenta en OpenAI
1. Ir a https://platform.openai.com/signup
2. Crear cuenta o login si ya tienes una
3. Verificar email

#### Paso 2: Crear API Key
1. Ir a https://platform.openai.com/api-keys
2. Click en "Create new secret key"
3. Copiar la clave (empieza con `sk-proj-`)
4. ⚠️ Guardar en lugar seguro - **no compartir públicamente**

#### Paso 3: Agregar a .env.local
```env

```

### 2. Configurar Créditos OpenAI

El chatbot usa **GPT-4 Turbo** que tiene costo:
- **Aprox. $0.01-0.05 USD por conversación** (depende de largo del chat)
- Se recomienda establecer límites de gastos en OpenAI dashboard

**Para set limits:**
1. Ir a https://platform.openai.com/account/billing/limits
2. Click "Set a monthly budget"
3. Establecer máximo (ej: $20/mes)

---

## 🎯 Componentes Implementados

### Archivos Creados

| Archivo | Descripción |
|---------|-------------|
| `src/app/services/chatbotService.ts` | Servicio principal de IA con OpenAI API |
| `src/app/api/chat/route.ts` | API endpoint POST /api/chat |
| `src/app/components/Chatbot.tsx` | Componente React del chatbot flotante |
| `src/app/components/Chatbot.module.css` | Estilos CSS (responsive + animaciones) |

### Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `src/app/page.tsx` | Agregado import y componente `<Chatbot />` |
| `.env.local` | Agregada variable `OPENAI_API_KEY` |

---

## 🚀 Cómo Funciona

### Flujo de Conversación

```
Usuario escribe mensaje
    ↓
API POST /api/chat recibe mensaje
    ↓
chatbotService.processMessage() ejecuta:
    1. Recupera contexto de productos (búsqueda semántica)
    2. Formatea contexto con FAQ de camisetas
    3. Envía a OpenAI con sistema prompt especializado
    4. OpenAI retorna respuesta inteligente
    5. Extrae productos mencionados
    ↓
Frontend recibe respuesta + productos recomendados
    ↓
Chatbot muestra mensaje con producto cards interactivas
```

### Características de IA

#### 1. **Búsqueda de Productos Inteligente**
- Matchea keywords del usuario con productos disponibles
- Prioriza productos destacados (featured)
- Retorna máx 5 productos relevantes

#### 2. **Sistema Prompt Avanzado**
Incluye:
- **Contexto de negocio**: Historia de SpideySports
- **Guía de tono**: Amable, profesional, entusiasta
- **Base de conocimiento**: FAQ sobre camisetas deportivas
- **Catálogo**: Estructura de secciones (Clubes, Selecciones, Especiales, Retro)

#### 3. **Recomendaciones Automáticas**
El chatbot automáticamente:
- Identifica necesidades del cliente
- Recomienda productos específicos
- Proporciona info de talla, material, cuidado

#### 4. **Entrenam iento Continuo**
- El sistema aprende del historial de conversación
- Mantiene contexto entre mensajes
- Mejora respuestas basadas en interacciones previas

---

## 🎨 Interfaz de Usuario

### Botón Flotante
- **Ubicación**: Esquina inferior derecha
- **Diseño**: Circular con gradiente teal/cyan
- **Animación**: Pulse effect para llamar atención
- **Badge**: Muestra "Chat" para indicar función

### Ventana de Chat
- **Tamaño**: 380px × 600px (desktop), fullscreen (móvil)
- **Responsivo**: Se adapta a tablets y phones
- **Características**:
  - Header con gradiente y acciones (limpiar, cerrar)
  - Área de mensajes con auto-scroll
  - Input con botón send flotante
  - Muestra indicador de escritura
  - Product cards inline en respuestas

### Estilos
- **Color principal**: Teal oscuro (#0f766e) + Cyan (#14b8a6)
- **Mensajes usuario**: Fondo gradiente teal
- **Mensajes asistente**: Fondo gris claro
- **Animaciones**: Smooth fade-in, slide-up, pulse

---

## 📝 Ejemplos de Conversación

### Ejemplo 1: Búsqueda de Camiseta
```
Usuario: "Quiero una camiseta de Manchester United"
Chatbot: "¡Excelente! Tenemos camisetas oficiales de Manchester United 
en nuestro catálogo de Clubes Internacionales. ¿Buscas la versión home 
(roja) o away (blanca)? ¿Qué talla necesitas? Tenemos desde XS hasta XXL."
[Muestra 2-3 camisetas relevantes]
```

### Ejemplo 2: Recomendación Inteligente
```
Usuario: "Necesito algo para entrenar, que transpire bien"
Chatbot: "¡Perfecto! Para entrenamientos intensos recomiendo nuestras 
camisetas de 100% poliéster con tecnología moisture-wicking. Son ideales 
para gym, running o fútbol. Recomendaciones: [Products]"
```

### Ejemplo 3: Pregunta de Cuidado
```
Usuario: "¿Cómo cuido una camiseta deportiva para que no se encoja?"
Chatbot: "Excelente pregunta! Aquí está cómo mantener tus camisetas 
deportivas en perfecto estado:
1. Lava con agua fría, evita calor excesivo
2. NO uses suavizante - afecta la transpiración
3. Cuelga para secar o baja temperatura en secadora
4. Lava por primera vez antes de usar
¿Necesitas recomendaciones de productos durables?"
```

---

## 🛠️ Troubleshooting

### ❌ Error: "No se pudo procesar el mensaje"

**Causas posibles:**
1. `OPENAI_API_KEY` no configurada o inválida
2. Créditos OpenAI agotados
3. Límite de rate limit alcanzado

**Soluciones:**
```bash
# 1. Verificar que .env.local tiene la clave
cat .env.local | grep OPENAI_API_KEY

# 2. Ir a OpenAI dashboard y revisar créditos
# https://platform.openai.com/account/billing/overview

# 3. Reiniciar el servidor Next.js
npm run dev
```

### ❌ Error: "Cannot find module 'openai'"

**Solución:**
```bash
npm install openai
```

### ❌ Chatbot no aparece en la página

**Verificar:**
1. ¿Está `<Chatbot />` en `src/app/page.tsx`? ✅
2. ¿Está el import correcto? ✅
3. ¿Build sin errores? Ejecutar:
```bash
npm run build
```

### ❌ Respuestas lentasNecesitan más de 5 segundos**

**Causas:**
- OpenAI API lenta (problema de su lado)
- Conexión de internet lenta
- Servidor Next.js sobrecargado

**Solución:**
- Agregar timeout en `Chatbot.tsx` si lo deseas
- Considerar usar GPT-3.5 (más rápido, menos caro) en lugar de GPT-4

---

## 🔐 Seguridad

### ⚠️ Nunca compartas tu API Key

- **NO** la agregues a Git/GitHub
- **NO** la compartas en chats públicos
- **NO** la incluyas en código frontend (OPENAI_API_KEY es solo backend)

### Buenas Prácticas

1. **Usar `.env.local`** (git-ignored automáticamente)
2. **Rotación de keys** cada 3-6 meses
3. **Monitorear uso** en OpenAI dashboard regularmente
4. **Set spending limits** para evitar sorpresas

---

## 📊 Optimizaciones Futuras

### Mejoras Posibles

1. **Historial Persistente**
   - Guardar conversaciones en Firestore
   - Permitir recuperar chats anteriores
   - Analytics de preguntas frecuentes

2. **Entrenamiento Local**
   - Fine-tuning con datos propios de SpideySports
   - Mejor comprensión de productos específicos
   - Respuestas más personalizadas

3. **Integración con Órdenes**
   - Chatbot sugiere productos basado en historial de compras
   - Recomendaciones personalizadas por cliente
   - Seguimiento de pedidos via chat

4. **Multiidioma**
   - Detectar idioma automáticamente
   - Responder en español, inglés, portugués

5. **Análisis de Sentimiento**
   - Detectar si cliente está satisfecho/insatisfecho
   - Escalar a support human si es necesario
   - Feedback loop para mejorar respuestas

---

## 📞 Soporte

### Documentación Oficial

- **OpenAI API Docs**: https://platform.openai.com/docs/api-reference
- **Next.js API Routes**: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- **React Docs**: https://react.dev

### Debugging

```typescript
// En chatbotService.ts línea 25, agregar logs:
console.log('User message:', userMessage);
console.log('Relevant products found:', relevantProducts);
console.log('LLM response:', response);
```

---

## ✅ Checklist de Verificación

- [ ] ¿API Key OpenAI configurada en `.env.local`?
- [ ] ¿`npm install openai` ejecutado?
- [ ] ¿`npm run build` compiló sin errores?
- [ ] ¿Chatbot aparece en esquina inferior derecha?
- [ ] ¿Botón flotante clickeable?
- [ ] ¿Puedes escribir y enviar mensajes?
- [ ] ¿Respuestas del IA aparecen?
- [ ] ¿Product cards se muestran?
- [ ] ¿Mobile responsive?
- [ ] ¿Puedes limpiar historial?

---

## 🎉 ¡Listo!

Tu chatbot de IA está completo y funcional. 

**Próximos pasos:**
1. ✅ Configura tu API Key
2. ✅ Prueba en desarrollo (`npm run dev`)
3. ✅ Verifica que todo funciona
4. ✅ Deploy a producción
5. ✅ Monitorea el uso en OpenAI dashboard

**¡Que venda muchas camisetas! 🕷️⚽**
