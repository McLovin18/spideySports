# 📊 Sistema CRM/ERP para SpideySports - Guía de Implementación

## 🎯 Resumen General

Se han implementado **8 módulos principales** para mejorar las ventas de camisetas y entender el comportamiento de clientes:

1. **Dashboard de Ventas** `/ventas` - Análisis completo en tiempo real
2. **Análisis de Inventario** - Control de stock y velocidad de venta
3. **Gestión de Carritos Abandonados** - Recuperación de ventas perdidas
4. **Pipelines de Ventas** - Visualización del funnel de conversión
5. **Recomendaciones Inteligentes** - Sugerencias en la home
6. **Alertas de Carrito** - Notificación a usuarios con carrito abandonado
7. **Servicios de Datos** - API completa de análisis
8. **Componentes de Gráficos** - Visualización interactiva

---

## 🚀 CÓMO USAR

### 1️⃣ **Acceder al Dashboard de Ventas**

**URL:** `https://tu-dominio.com/admin/ventas`

**Requisito:** Solo admininistradores autenticados

**Admins configurados:**
- `lucilaaquino79@gmail.com`
- `hectorcobea03@gmail.com`
- `tiffanysvariedades@gmail.com`

**Funcionalidades:**
- 📈 Ingresos por semana (últimas 12 semanas)
- 🏆 Top 10 productos más vendidos
- 👥 Análisis de clientes (nuevos vs. recurrentes)
- 📊 Análisis de inventario
- 🛒 Carritos abandonados
- 📋 Pipeline de ventas

---

### 2️⃣ **Tab: Dashboard Principal**

Muestra 4 tarjetas principales:

```
[Ingresos Semana] [Órdenes Semana] [Clientes Totales] [Clientes Recurrentes]
```

**Debajo:**
- Gráfico de ingresos por semana (últimas 12 semanas)
- Distribución de clientes (nuevos vs. recurrentes)
- Tabla de top 10 productos más vendidos

---

### 3️⃣ **Tab: Análisis de Inventario**

Clasifica productos en 3 categorías:

**🚀 Rápidos** (10+ unidades en 30 días)
- Productos con alto movimiento
- Recomendación: Aumentar stock

**⚡ Medios** (3-9 unidades en 30 días)
- Movimiento normal
- Monitorear regularmente

**🐌 Lentos** (0-2 unidades en 30 días)
- Bajo movimiento
- Recomendación: Promociones o descuentos

---

### 4️⃣ **Tab: Carritos Abandonados**

Estadísticas principales:

```
🛒 Carritos Abandonados: X
💰 Valor Total: $X,XXX
📊 Valor Promedio por Carrito: $XXX
📈 Tasa de Recuperación: X%
```

**Tabla de carritos:**
- Usuario y email
- Cantidad de items
- Valor del carrito
- Fecha de abandono
- Estado (Visto/Nuevo)

---

### 5️⃣ **Tab: Pipeline de Ventas**

Visualiza el funnel de conversión:

```
Prospects (Visitantes)
        ⬇️
Leads (Carritos Abandonados)
        ⬇️
Customers (Compras Realizadas)
```

Muestra:
- Cantidad en cada etapa
- Porcentaje del total
- Tasa de conversión entre etapas
- Valor monetario

---

## 🔧 SERVICIOS IMPLEMENTADOS

### `analyticsService.ts`

```typescript
// Obtener ingresos por semana
const weeklyRevenue = await analyticsService.getWeeklyRevenue(12);

// Top 10 productos
const topProducts = await analyticsService.getTopProducts(10);

// Análisis de clientes
const customerData = await analyticsService.getCustomerAnalytics();

// Velocidad de productos
const velocity = await analyticsService.getProductVelocity();
```

### `abandonedCartService.ts`

```typescript
// Registrar carrito abandonado
await abandonedCartService.trackAbandonedCart(userId, items, total);

// Obtener carritos abandonados
const carts = await abandonedCartService.getAllAbandonedCarts();

// Marcar como visto
await abandonedCartService.dismissAbandonedCartAlert(userId);

// Eliminar registro
await abandonedCartService.deleteAbandonedCart(userId);
```

### `pipelineService.ts`

```typescript
// Obtener pipeline completo
const pipeline = await pipelineService.getSalesPipeline();

// Breakdown detallado
const breakdown = await pipelineService.getPipelineBreakdown();
```

### `recommendationService.ts` (mejorado)

```typescript
// Productos populares
const popular = recommendationEngine.getPopularProducts(4);

// Recomendaciones para producto específico
const recommendations = await recommendationEngine.getRecommendationsForProduct(productId);
```

---

## 🔔 ALERTAS DE CARRITO ABANDONADO

### Cómo funciona:

1. **Detección:** Cuando un usuario autenticado permanece 5 minutos en el carrito sin comprar
2. **Registro:** Se guarda automáticamente en collection `abandonedCarts` en Firestore
3. **Visualización:** Aparece alerta en la página del carrito
4. **Notificación:** El usuario ve un banner amarillo con opción "OK" para cerrar

### Banner:

```
┌─────────────────────────────────────┐
│ 🛒 ¡Completá tu compra!             │
│                                     │
│ Detectamos que dejaste un carrito   │
│ con 3 artículos hace 2 horas        │
│                                     │
│ Valor: $89.99                [OK]   │
└─────────────────────────────────────┘
```

### Limpieza automática:

- Cuando el usuario compra → Carrito abandonado se elimina
- Cuando el usuario clickea "OK" → Se marca como visto (no se vuelve a mostrar)

---

## 💡 RECOMENDACIONES INTELIGENTES EN HOME

### Ubicación:

En la página de inicio (antes del footer), aparece sección:

```
💡 Más Populares en SpideySports
```

Muestra 4 productos:
- Destacados (si están configurados como `featured: true`)
- O los más vendidos

### Características:

- Imagen del producto
- Badge "⭐ Popular"
- Nombre y categoría
- Precio
- Botón "Ver Producto"

---

## 📊 FIRESTORE COLLECTIONS

### `abandonedCarts`

```json
{
  "userId": "user123",
  "userEmail": "user@example.com",
  "userName": "John Doe",
  "items": [...CartItem[]],
  "cartTotal": 89.99,
  "cartSize": 3,
  "abandonedAt": "2024-02-01T10:30:00Z",
  "dismissed": false,
  "dismissedAt": null
}
```

### `dailyOrders` (existente, usado para analytics)

Se usa para calcular:
- Ingresos por semana
- Top productos
- Análisis de clientes

---

## 📈 KPIs PRINCIPALES A MONITOREAR

1. **Tasa de Abandono de Carrito**
   - Fórmula: `(Carritos Abandonados / Total Sesiones) × 100`
   - Meta: < 30%

2. **Valor Promedio Abandonado**
   - Fórmula: `Total Valor Abandonado / Cantidad de Carritos`
   - Meta: Recuperar 10-20%

3. **Velocidad de Productos**
   - Rápidos: Aumentar inventario
   - Lentos: Aplicar descuentos o promotions

4. **Tasa de Conversión Pipeline**
   - Prospect → Lead: % que agregó algo al carrito
   - Lead → Customer: % que completó la compra

---

## 🔐 SEGURIDAD

### Protecciones implementadas:

1. **Ruta protegida:** Solo admins pueden acceder a `/ventas`
2. **Verificación de rol:** Chequeo en `useRole()` hook
3. **Redirección:** Usuarios no-admin son redirigidos a home
4. **Datos privados:** Solo ve datos de sus propios carritos abandonados

---

## 📱 COMPATIBILIDAD

- ✅ Desktop (1920px+)
- ✅ Tablet (768px - 1919px)
- ✅ Mobile (< 768px)
- ✅ Bootstrap 5 responsive

---

## 🎨 ESTILOS UTILIZADOS

- Gradientes personalizados
- Colores de marca (cosmetic-primary, cosmetic-secondary)
- Animaciones suaves
- Iconos Bootstrap
- Diseño moderno y limpio

---

## 🚨 NOTAS IMPORTANTES

1. **Dashboard actualiza cada 5 minutos** automáticamente
2. **Botón "Actualizar"** permite refresh manual
3. **Los datos se recalculan en tiempo real** desde Firestore
4. **No se envían emails** de recordatorio (solo dashboard + alerta en carrito)
5. **Los carritos se registran después de 5 minutos** de inactividad

---

## 📞 PRÓXIMAS MEJORAS SUGERIDAS

1. **Email reminders** para carritos abandonados (opcional)
2. **SMS notifications** mediante Twilio
3. **Descuentos automáticos** para recuperar carritos
4. **Predicción de demanda** con Machine Learning
5. **A/B testing** de mensajes de recuperación
6. **Integración con programas de lealtad**
7. **Reportes exportables** (PDF/Excel)
8. **Dashboard de métricas personalizadas**

---

## 🐛 TROUBLESHOOTING

### Dashboard no carga datos:
- Verifica conexión a Firestore
- Asegúrate de estar autenticado como admin
- Revisa console del navegador (F12) para errores

### Alertas de carrito no aparecen:
- Verifica que `abandonedCartService` esté en Firestore
- Comprueba que pasó > 5 minutos en el carrito
- Limpia cache del navegador

### Recomendaciones no aparecen en home:
- Asegúrate de que hay productos con `featured: true`
- O que hay al menos 4 productos en el inventario
- Revisa que `SmartRecommendations` está importado correctamente

---

**Creado:** Febrero 2026  
**Sistema:** SpideySports CRM/ERP v1.0  
**Estado:** 🟢 Producción
