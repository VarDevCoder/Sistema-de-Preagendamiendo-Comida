# Fase 2 — Autenticación, roles y datos de ejemplo

## Resumen en simple

- Se puede **crear una cuenta** (email + contraseña) e **ingresar**. Google queda listo: se activa solo con cargar `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET`.
- Hay **3 roles** y cada uno entra a su área: cliente → inicio y `/cuenta`, restaurante → `/panel`, super admin → `/admin`. Si alguien intenta entrar a un área que no le corresponde, se lo redirige a la suya.
- El **seed** carga 3 restaurantes completos (menú, modificadores, macros, franjas, descuentos, planes), 14 usuarios, unos 230 pedidos, 2 planes mensuales y movimientos de billetera. Todo armado con las mismas reglas de precios y validaciones que va a usar la app.

## Cómo funciona (técnico)

### Auth.js v5 con Next.js 16

| Pieza | Archivo | Qué hace |
|---|---|---|
| Config compartida | `src/auth.config.ts` | Sesión JWT, página de login, callbacks que agregan `id` y `role` a la sesión. Sin base de datos. |
| Config completa | `src/auth.ts` | Prisma adapter, provider de credenciales (bcrypt) y Google opcional. Un usuario nuevo de Google recibe su `CustomerProfile`. |
| Proxy | `src/proxy.ts` | (Ex `middleware`, renombrado en Next 16.) Chequeo **optimista** por rol leyendo solo el JWT. |
| Capa de datos | `src/modules/auth/session.ts` | Chequeo **definitivo**: `requireUser(roles)`, `requireRestaurantAccess(id)`. Revalida contra la base (usuario activo, rol actual) en cada request. |
| Reglas de acceso | `src/modules/auth/access.ts` | Función pura `decideAccess(path, role)` + `safeCallbackUrl` (evita redirecciones abiertas). Con tests. |
| Formularios | `src/modules/auth/actions.ts` | Server actions con Zod. Después de ingresar se va al inicio del rol o al `callbackUrl` (solo rutas internas). |

Por qué dos chequeos: el proxy es rápido pero solo ve el JWT, que puede estar desactualizado (ej. un usuario suspendido). La capa de datos consulta la base y es la que realmente protege los datos.

**Cache Components** (activado por defecto en Next 16): leer la sesión es dinámico, así que todo lo que depende del usuario va dentro de `<Suspense>`. El resto de la página se prerenderiza y carga al instante (las páginas aparecen como "Partial Prerender" en el build).

### Módulos de dominio adelantados

El seed necesitaba crear pedidos coherentes, así que ya quedaron implementadas y testeadas las funciones puras de las fases siguientes:

| Módulo | Contenido |
|---|---|
| `modules/shared/money.ts` | `applyBps`, reparto proporcional sin perder guaraníes, formato `Gs. 45.000` |
| `modules/shared/time.ts` | Fechas en America/Asuncion, hora de corte, días ISO, límites de mes |
| `modules/menu/modifiers.ts` | Validación de selección (obligatorios, min/max, inactivas, ajenas, repetidas), `modifierKey`, precarga por preferencias |
| `modules/menu/nutrition.ts` | Macros con deltas (mínimo 0), totales, promedio diario, coherencia kcal vs macros |
| `modules/orders/pricing.ts` | Escalón de anticipación, precio de línea y de pedido, comisión |
| `modules/wallet/entries.ts` | Asientos de pago, cancelación del restaurante (según su acuerdo), reembolso parcial, reverso |
| `modules/wallet/ledger-tx.ts` | Escritura idempotente en el ledger y bloqueo del saldo de billetera |

### Cambios al modelo en esta fase

- `Restaurant.restaurantCancelRefundsCommission` y `restaurantCancelPenaltyBps` + cuenta contable `PLATFORM_PENALTY` (política de cancelación por negocio, la define el super admin).
- `Subscription.deliveryFee`: un plan mensual con delivery suma el envío de cada día al total.

## Datos del seed

Contraseña de todas las cuentas: **`demo1234`**.

| Rol | Cuentas |
|---|---|
| Super admin | `admin@prepago.test` |
| Restaurante | `rosa@prepago.test` (La Cocina de Doña Rosa), `fit@prepago.test` (Fit Bowl), `quincho@prepago.test` (Parrilla El Quincho) |
| Cliente | `ana@`, `maria@`, `juan@`, `sofia@`, `carlos@`, `lucia@`, `diego@`, `valeria@`, `martin@`, `camila@` (todas `@prepago.test`) |

Restaurantes:

| | Doña Rosa | Fit Bowl | El Quincho |
|---|---|---|---|
| Tipo | Casera, menú rotativo lun–vie | Saludable, lun–sáb | Parrilla, mar–dom |
| Modalidad | Retiro + delivery | Retiro + delivery (cena solo delivery) | Solo retiro |
| Corte | Día anterior 20:00 | Día anterior 21:00 | Mismo día 10:00 |
| Anticipación | 24 h −10% · 72 h −15% | 24 h −8% · 48 h −12% · 7 días −15% | 24 h −10% |
| Plan mensual | −20%, mes siguiente | −15%, resto del mes y siguiente | No |
| Si cancela | Devuelve comisión | Devuelve comisión | Absorbe comisión + 5% de penalidad |
| Macros | Opcionales (un plato sin info) | Obligatorios | Opcionales (dos platos sin info) |

Casos especiales incluidos:

1. Doña Rosa canceló un pedido de **Ana** → 100% a su billetera; Ana usó ese saldo en un pedido de Fit Bowl (pago mixto billetera + tarjeta).
2. El Quincho canceló un pedido de **Sofía** → 100% a su billetera; el restaurante absorbe la comisión y paga 5% de penalidad.
3. **Juan** no pagó a tiempo → pedido `EXPIRED` que no ocupa cupo.
4. **María** canceló un pedido antes del corte → 80% a su billetera (política de Fit Bowl).
5. **Plan mensual de Ana** en Doña Rosa para el mes siguiente (2 días libres), con su preferencia "milanesa tostadita" y "sin cebolla" precargadas.
6. **Plan de María** en Fit Bowl con delivery y su preferencia "base de quinoa" en el bowl de pollo.

Al terminar, el seed verifica que el ledger sume 0. Además se verificó por SQL que ninguna franja, plato u opción supere su cupo o stock.
