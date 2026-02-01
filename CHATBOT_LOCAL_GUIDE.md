# 🤖 CHATBOT LOCAL - GUÍA RÁPIDA

## ¿Qué es?

Un **chatbot simple y local** que funciona en tu servidor sin necesidad de APIs externas:
- ✅ Búsqueda inteligente de productos
- ✅ Responde preguntas frecuentes
- ✅ Muestra cards de productos clickeables
- ✅ Completamente personalizable por ti
- ✅ Sin costos de API
- ✅ Rápido y confiable

---

## 🎯 Características

### 1. Búsqueda de Productos
Escribe lo que buscas:
- "Manchester United" → Encuentra camisetas de ese club
- "camiseta roja" → Filtra por color y características
- "Argentina" → Busca selecciones nacionales
- "para entrenar" → Encuentra camisetas deportivas

### 2. Respuestas Automáticas
El chatbot responde:
- Saludos (automático)
- Preguntas sobre tallas, precios, envíos
- Guía de cómo usar el chat
- Información de materiales y devoluciones

### 3. Producto Cards
Cada producto recomendado muestra:
- Imagen del producto
- Nombre
- Precio
- Stock disponible
- Botón "Ver producto" que enlaza a la página

---

## 🔧 Cómo Funciona

### Búsqueda Inteligente
```
Usuario escribe: "camiseta azul para futbol"
    ↓
Chatbot busca en inventario:
- Keywords: "azul", "futbol", "camiseta"
- Matching score por producto
- Retorna top 5 productos más relevantes
    ↓
Muestra: Cards de productos + "Encontré 3 camisetas"
```

### Tipos de Consultas

| Consulta | Ejemplo | Respuesta |
|----------|---------|-----------|
| Saludo | "Hola", "Hi" | Mensaje de bienvenida |
| Ayuda | "Help", "¿Qué puedes hacer?" | Guía de comandos |
| Info | "¿Qué tallas?", "¿Cuánto cuesta?" | Respuesta directa |
| Búsqueda | "Real Madrid", "camiseta roja" | **Cards de productos** |

---

## 📁 Archivos del Sistema

```
src/app/
├── services/
│   └── chatbotService.ts (224 líneas)
│       ├── Búsqueda de productos local
│       ├── Respuestas predefinidas
│       ├── Manejo de historial
│       └── Tipos de consultas
│
├── api/
│   └── chat/
│       └── route.ts (API endpoint)
│
└── components/
    ├── Chatbot.tsx (UI React)
    └── Chatbot.module.css (Estilos)
```

---

## 💡 Agregar Respuestas Personalizadas

Edita `src/app/services/chatbotService.ts`:

```typescript
private readonly RESPONSES = {
  // Agregar nueva respuesta de información
  info: {
    // ... respuestas existentes ...
    garantia: 'Todas nuestras camisetas tienen 6 meses de garantía. 🛡️',
    personalizado: 'Sí, hacemos personalizaciones. Contacta ventas@spideysports.com',
  }
};
```

---

## 🎨 Interfaz

### Botón Flotante
- Ubicación: Esquina inferior derecha
- Diseño: Circular azul teal con animación pulse
- Al clickear: Abre ventana de chat

### Ventana de Chat
- **Header**: Azul teal con opciones (limpiar, cerrar)
- **Mensajes**: Burbujas diferenciadas (usuario/asistente)
- **Productos**: Cards inline con imágenes y links
- **Input**: Campo de texto + botón send
- **Responsive**: Desktop, tablet, mobile

---

## 🚀 Uso en Desarrollo

### 1. Iniciar servidor
```bash
npm run dev
# Chatbot aparece automáticamente en home
```

### 2. Probar conversaciones
- Click en botón flotante esquina derecha
- Escribe: "manchester" 
- Verás productos relevantes
- Click en producto → va a la página

### 3. Ajustar respuestas
- Edita `chatbotService.ts`
- Recarga navegador (hot reload)
- Prueba de nuevo

---

## 🔍 Búsqueda Semántica

### Cómo Busca

```typescript
1. Tokeniza entrada: "camiseta azul" → ["camiseta", "azul"]
2. Busca en cada producto:
   - Nombre
   - Descripción
   - Categoría
3. Score por match:
   - 10 puntos por keyword encontrado
   - +5 bonus si producto es "featured"
4. Ordena por score descendente
5. Retorna top 5
```

### Ejemplos de Búsqueda
- "manchester" → Busca en nombre/descripción
- "roja deportiva" → Busca ambos términos
- "premier league" → Matchea con clubs
- "entrenamiento" → Busca por uso/deporte

---

## ⚙️ Personalización Avanzada

### Cambiar Mensaje de Bienvenida
```typescript
greeting: [
  '¡Bienvenido! Soy tu asistente de camisetas. ¿Qué buscas?',
  'Hola, ¿en qué puedo ayudarte?',
]
```

### Cambiar Rango de Búsqueda
```typescript
// En searchProducts()
.slice(0, 5)  // Cambiar 5 por número de productos a mostrar
```

### Agregar Filtros Avanzados
Puedes agregar lógica como:
- Rango de precios
- Solo en stock
- Solo featured
- Por categoría específica

---

## 🐛 Troubleshooting

### ❌ Chatbot no aparece
- ¿Está en `page.tsx`? Revisa import y `<Chatbot />`
- ¿Compiló sin errores? Corre `npm run build`
- Recarga la página en navegador

### ❌ Búsqueda sin resultados
- ¿El producto existe en inventario?
- ¿El nombre está en la descripción?
- Intenta con diferentes keywords

### ❌ Estilo se ve roto
- Revisa `Chatbot.module.css` existe
- Recarga (Ctrl+F5)
- Verifica import en Chatbot.tsx

---

## ✅ Casos de Uso

### Caso 1: Usuario Busca Club
```
Usuario: "Bayern Munich"
Chatbot: "Encontré 2 camisetas que coinciden 👕"
Productos: [Munich Home 2024, Munich Away 2024]
Usuario clickea en uno → Va a página de producto
```

### Caso 2: Usuario Pregunta Info
```
Usuario: "¿Qué tallas tienen?"
Chatbot: "Tenemos tallas desde XS hasta XXL..."
```

### Caso 3: Usuario Pide Ayuda
```
Usuario: "help"
Chatbot: "Puedo ayudarte a encontrar camisetas..."
```

---

## 🎯 Próximas Iteraciones (Si lo deseas)

- [ ] Agregar más respuestas personalizadas
- [ ] Filtrado por precio/rango de precios
- [ ] Búsqueda por talla
- [ ] Guardado de historial en Firestore
- [ ] Estadísticas de búsquedas más comunes
- [ ] Recomendaciones por historial de usuario
- [ ] Integración con WhatsApp/Telegram

---

## 📝 Resumen

Tu chatbot local:
- 🏃 **Rápido**: Sin latencia de API externa
- 💰 **Gratis**: Sin costos de suscripción
- 🎮 **Controlable**: Tú entrenas las respuestas
- 🔒 **Privado**: Todo en tu servidor
- 🎨 **Bonito**: Interfaz moderna y responsive

**¡Listo para producción!** 🚀
