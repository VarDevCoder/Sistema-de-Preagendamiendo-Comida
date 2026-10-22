# Relevamiento del proyecto

Documento de referencia para cualquier persona o agente que trabaje en el proyecto. Reúne la especificación original, las decisiones confirmadas con el dueño del producto, la arquitectura, el estado actual y el plan de trabajo con criterios de aceptación.

> Para convenciones de código y comandos, ver también [`CLAUDE.md`](../CLAUDE.md).
> Modelo de datos en detalle: [`fase-1-modelo-de-datos.md`](fase-1-modelo-de-datos.md). Autenticación y seed: [`fase-2-auth-y-seed.md`](fase-2-auth-y-seed.md).

---

## 1. Producto

Plataforma web **mobile-first, instalable como PWA**, de **pedidos anticipados prepagos** para varios restaurantes (marketplace multi-tenant) en Asunción, Paraguay.

| Para quién | Propuesta de valor |
|---|---|
| **Cliente** | Paga por adelantado y obtiene un precio más bajo que pidiendo en el momento. Garantía: si el restaurante cancela, recibe el reembolso al instante como saldo en la app. |
| **Restaurante** | Sabe con anticipación qué va a producir: compra justo, desperdicia menos, cocina en tandas y cobra por adelantado. Nunca recibe más pedidos de los que puede producir. |

Diferenciales frente a PedidosYa y similares (deben verse en el diseño):

1. **Precio por anticipación**: descuento configurable según cuánto antes se pide.
2. **Plan mensual**: el cliente elige sus comidas para todo el mes de una vez, con mayor descuento.
3. **Cupos por franja horaria y stock diario por plato**: sin cancelaciones por saturación.
4. **Hora de corte**: el restaurante recibe una lista de producción consolidada antes de arrancar el día.
5. **Reembolso instantáneo** a una billetera interna si el restaurante cancela.
6. **Panel con métricas** para el restaurante: ahorro estimado, pedidos confirmados por día, previsión.
7. **Personalización estructurada**: punto de cocción, guarnición, ingredientes a quitar, extras, con opciones cerradas que define el restaurante. La cocina las recibe agrupadas para seguir cocinando en tandas.
8. **Información nutricional (macros)** por plato, por pedido y sumada en el plan mensual.

Moneda **PYG** (sin decimales). Zona horaria **America/Asuncion**. UI en **español** (Paraguay), mobile-first; la vista del cliente debe sentirse como una app, no como un sistema administrativo.

## 2. Roles

| Rol | Puede |
|---|---|
| **Cliente** (`CUSTOMER`) | Explorar restaurantes, armar y pagar pedidos, gestionar su plan mensual, su billetera, alergias y preferencias. |
| **Restaurante** (`RESTAURANT_ADMIN` + `RestaurantMember`) | Gestionar menú, precios, modificadores, macros, cupos, stock, descuentos, hora de corte y plan mensual. Ver la lista de producción y las métricas. Gestionar y cancelar pedidos del día. |
| **Super admin** (`SUPER_ADMIN`, el dueño de la plataforma) | Alta, baja y suspensión de restaurantes. Comisión por restaurante y política de cancelación. Liquidaciones, métricas globales, reclamos y reembolsos. |

## 3. Requerimientos funcionales

Los identificadores (`RF-…`) sirven para referenciarlos en commits y PRs.

### 3.1 Cliente

- **RF-C1** Registro e inicio de sesión con email + contraseña; Google opcional. ✅
- **RF-C2** Listado de restaurantes con filtros: zona, tipo de comida, retiro/delivery.
- **RF-C3** Menú de un restaurante **por fecha**: solo platos con stock y cupo para ese día.
- **RF-C4** Pedido programado: fecha, franja horaria, modalidad (retiro, o delivery si el restaurante lo habilita), pago.
- **RF-C5** Precio con el descuento por anticipación aplicado, mostrando cuánto ahorra frente al precio normal.
- **RF-C6** Personalización del plato con modificadores (chips/toggles rápidos, no formularios largos) y nota libre opcional.
- **RF-C7** Preferencias guardadas que **precargan** los modificadores; alergias guardadas que se precargan en cada pedido.
- **RF-C8** Plan mensual (si el restaurante lo habilitó):
  - calendario del mes siguiente (o del resto del mes actual, según el restaurante);
  - un plato por día hábil disponible, con acciones rápidas: "repetir el mismo plato todos los días", "copiar la semana 1 al resto del mes", "dejar días libres";
  - un solo pago con el descuento del plan;
  - cambiar el plato o los modificadores de un día futuro hasta la hora de corte: si es más caro paga la diferencia, si es más barato se acredita en la billetera;
  - pausar o cancelar días según la política del restaurante (crédito a la billetera);
  - totales y promedio diario de kcal y macros, vista por semana.
- **RF-C9** Billetera: saldo por reembolsos y cancelaciones, usable en cualquier restaurante; historial de movimientos.
- **RF-C10** Historial de pedidos con estados.
- **RF-C11** Notificaciones por email y web push: confirmación, recordatorio el día anterior, pedido listo, cancelación.
- **RF-C12** Cancelar un pedido suelto hasta la hora de corte, con reembolso a la billetera según el % del restaurante.

### 3.2 Restaurante

- **RF-R1** Configuración del local: datos, horarios, días de atención, modalidades, zonas de delivery con costo.
- **RF-R2** Menú: CRUD de platos (foto, descripción, precio normal, categoría) con **información nutricional**.
- **RF-R3** Modificadores: CRUD de grupos y opciones, asignación a platos con orden por plato, desactivación temporal de opciones, stock diario opcional por opción, tags de preferencia, deltas de precio y de macros.
- **RF-R4** Disponibilidad por fecha (menú rotativo) y stock diario por plato.
- **RF-R5** Franjas horarias con cupo (ej. 12:00–12:30, máx. 20 pedidos); la franja se cierra sola al llenarse.
- **RF-R6** Hora de corte configurable (ej. el día anterior a las 20:00).
- **RF-R7** Escalones de descuento por anticipación (ej. 24 h −10%, 72 h −15%).
- **RF-R8** Plan mensual: habilitar, % de descuento, días de la semana, fecha límite de suscripción, política de cancelación por día (hasta cuándo y qué % devuelve).
- **RF-R9** Lista de producción después de la hora de corte:
  - cantidad total por plato, **agrupada por combinación de modificadores**;
  - dentro de cada combinación, desglose por franja y detalle de pedidos con nombre del cliente;
  - alergias y notas destacadas (color + etiqueta);
  - exportable a PDF e imprimible.
- **RF-R10** Gestión de pedidos del día: "en preparación", "listo", "entregado".
- **RF-R11** Cancelación por el restaurante con motivo obligatorio: reembolso automático a la billetera del cliente y registro en métricas.
- **RF-R12** Dashboard: pedidos confirmados próximos 7 días, ingresos cobrados por adelantado, suscriptores al plan, tasa de cancelación, platos más pedidos, modificadores más elegidos por plato, ahorro estimado.
- **RF-R13** Aviso (no bloqueante) si kcal no cuadra con P×4 + C×4 + G×9 (tolerancia configurable, 15% por defecto). Si el super admin marcó macros obligatorios, no se puede publicar un plato sin macros.

### 3.3 Super admin

- **RF-A1** Alta, baja y suspensión de restaurantes (y asignación de su usuario administrador).
- **RF-A2** Comisión por restaurante (% por pedido) y **política si el restaurante cancela** (devolver o no la comisión; penalidad %).
- **RF-A3** Marcar por restaurante que los macros sean obligatorios.
- **RF-A4** Liquidaciones por período: ventas − comisión − reembolsos (y penalidades), con registro de pago.
- **RF-A5** Métricas globales.
- **RF-A6** Gestión de reclamos (disputas) con reembolso opcional a la billetera.

## 4. Reglas de negocio críticas

- **RN-1** Cupo y stock (platos y opciones con stock propio) se validan **en el servidor, dentro de una transacción, con bloqueo** (`SELECT … FOR UPDATE`) para evitar sobreventa.
- **RN-2** Un pedido pasa a `CONFIRMED` solo cuando el pago se aprueba. Mientras tanto, cupo y stock quedan **reservados 10 minutos** (`PlatformSettings.holdMinutes`); si no se paga, se liberan solos.
- **RN-3** El precio final se calcula **siempre en el servidor**. Nunca se confía en lo que manda el cliente (precios, opciones, macros).
- **RN-4** Todo movimiento de dinero va a un **ledger inmutable de doble registro**. No se edita ni se borra; las correcciones son movimientos inversos.
- **RN-5** El plan mensual genera **un pedido por cada día elegido**, así la lista de producción lo trata igual que a un pedido suelto.
- **RN-6** Webhooks del proveedor de pago **idempotentes**: el mismo evento dos veces no duplica el efecto.
- **RN-7** Fechas y horas siempre en **America/Asuncion**.
- **RN-8** Personalización: validación con Zod en el servidor (grupos obligatorios, min/max, opciones activas y del plato). Precio del ítem = base + Σ `priceDelta`; los descuentos se aplican sobre ese total.
- **RN-9** Al confirmar, se guarda un **snapshot** de modificadores (nombre, precio) y macros. Editar el menú después no cambia pedidos hechos.
- **RN-10** Macros del ítem = macros del plato + Σ deltas de las opciones (mínimo 0 por campo). Los carga siempre el restaurante; la plataforma no inventa valores. Leyenda fija: "Valores aproximados informados por el restaurante".
- **RN-11** Una preferencia que no aplica a un plato se ignora sin error.

## 5. Decisiones confirmadas

| # | Decisión | Fuente |
|---|---|---|
| D-1 | Si el **restaurante cancela**, el cliente **siempre** recibe el 100% en la billetera. Quién absorbe el costo depende del acuerdo con cada negocio y lo configura el **super admin** por restaurante: devolver la comisión (por defecto sí) y penalidad opcional en % (por defecto 0), descontada en la liquidación. Se aplica la política vigente al momento de cancelar. | Dueño del producto |
| D-2 | El cliente puede cancelar un **pedido suelto** hasta la hora de corte, con reembolso a la billetera del `customerCancelRefundBps` del restaurante (100% por defecto). | Confirmado |
| D-3 | La **billetera** sirve para pagar todo o parte de un pedido en cualquier restaurante; **no se puede retirar** a efectivo. | Confirmado |
| D-4 | Los descuentos **no se acumulan**: un día de plan lleva solo el descuento del plan. | Supuesto aceptado |
| D-5 | La anticipación se mide desde la creación del pedido hasta el **inicio de la franja**. | Supuesto aceptado |
| D-6 | El costo de **envío** no tiene descuento ni comisión y va íntegro al restaurante. | Supuesto aceptado |
| D-7 | **Alergias** a nivel pedido (precargadas del perfil, editables). | Supuesto aceptado |
| D-8 | Plan mensual: una franja y modalidad por defecto para todo el plan, editables por día. Días disponibles = días del plan menos feriados del restaurante. | Supuesto aceptado |
| D-9 | **Liquidaciones**: pedidos cuyo día de servicio cae en el período y no fueron cancelados, menos comisión, reembolsos y penalidades. | Supuesto aceptado |
| D-10 | El **cupo** de una franja cuenta **pedidos**, no platos. | Diseño |
| D-11 | Preferencias generales entre restaurantes vía catálogo `PreferenceTag` (cada restaurante etiqueta sus opciones). | Diseño |
| D-12 | Deploy en **Vercel + Neon**. Correctitud sin depender de crons (en el plan Hobby corren como mucho una vez por día). | Dueño del producto |

## 6. Arquitectura

| Capa | Elección | Notas |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack, **Cache Components**, Partial Prefetching) | Leer la sesión o la base es dinámico → dentro de `<Suspense>`. `middleware` ahora es `src/proxy.ts`. |
| Lenguaje | TypeScript estricto | |
| Base de datos | PostgreSQL 16 — Neon en producción, Docker en local | `DATABASE_URL` pooled (runtime), `DIRECT_URL` directa (migraciones). |
| ORM | Prisma 7 con `@prisma/adapter-pg` | Cliente generado en `src/generated/prisma` (no se commitea). Config en `prisma.config.ts`. |
| Auth | Auth.js v5 (JWT) + Prisma adapter | Credenciales (bcryptjs) y Google opcional. |
| UI | Tailwind v4 + componentes estilo shadcn/ui en `src/components/ui` | Fuente Geist local (paquete `geist`). Iconos `lucide-react`. |
| Validación | Zod 4 | |
| Tests | Vitest | Unitarios en `src/**/*.test.ts`. |
| Pagos | Abstracción `PaymentProvider` (mock en desarrollo; Bancard vPOS / Pagopar preparados, sin implementar) | |
| Tareas programadas | Vercel Cron (`vercel.json`) con `CRON_SECRET` | `/api/cron/expirar-reservas` (limpieza) y `/api/cron/recordatorios`. |
| Archivos | Vercel Blob (fotos de platos) | Fase 3. |

### Módulos de dominio (`src/modules`)

| Módulo | Estado | Contenido |
|---|---|---|
| `shared` | ✅ | `money` (bps, reparto, formato Gs.), `time` (America/Asuncion, corte, meses), `labels` |
| `auth` | ✅ | Reglas de acceso, sesión/DAL, acciones, esquemas |
| `menu` | ✅ parcial | `modifiers` (validación, `modifierKey`, precarga), `nutrition` (macros, totales, coherencia) |
| `orders` | ✅ parcial | `pricing` (anticipación, línea, pedido, comisión), `statuses` (condición de retención de cupo) |
| `availability` | ✅ parcial | `materialize` (`ensureDayMaterialized`) |
| `wallet` | ✅ parcial | `entries` (asientos), `ledger-tx` (escritura idempotente, lock de billetera), `ledger` |
| `restaurants`, `subscriptions`, `payments`, `notifications` | ⏳ | Fases 3–8 |

### Mapa de rutas

| Área | Ruta | Fase |
|---|---|---|
| Público | `/` (landing) · `/ingresar` · `/registro` | ✅ |
| Cliente | `/restaurantes` (listado + filtros) · `/restaurantes/[slug]?fecha=AAAA-MM-DD` (menú del día) | 4 |
| Cliente | `/pedido/[slug]` (checkout) · `/pagos/mock/[paymentId]` (pasarela simulada) | 4 |
| Cliente | `/cuenta` · `/cuenta/pedidos` · `/cuenta/pedidos/[code]` · `/cuenta/perfil` (alergias, direcciones) · `/cuenta/preferencias` | 2 ✅ / 4 |
| Cliente | `/restaurantes/[slug]/plan` · `/cuenta/planes/[code]` | 5 |
| Cliente | `/cuenta/billetera` | 6 |
| Restaurante | `/panel` (elige restaurante) · `/panel/[slug]/{menu,modificadores,disponibilidad,franjas,configuracion}` | 3 |
| Restaurante | `/panel/[slug]` (dashboard) · `/panel/[slug]/pedidos` · `/panel/[slug]/produccion` | 7 |
| Super admin | `/admin` · `/admin/restaurantes/**` · `/admin/reclamos` | 7 |
| Super admin | `/admin/liquidaciones` | 6 |
| API | `/api/auth/*` ✅ · `/api/pagos/webhook/[provider]` (4) · `/api/cron/expirar-reservas` (4) · `/api/cron/recordatorios` (8) · `/api/push/*` (8) | |

## 7. Estado actual

| Fase | Estado | Resultado |
|---|---|---|
| 1. Modelo de datos | ✅ | ~40 tablas, migraciones con CHECKs y ledger inmutable/balanceado por triggers. |
| 2. Auth, roles y seed | ✅ | Login/registro, áreas por rol, proxy + DAL, seed con 3 restaurantes, ~230 pedidos, 2 planes, billeteras. 56 tests. |
| 3. Panel del restaurante | 🚧 | En curso |
| 4. Flujo de pedido del cliente | 🚧 | En curso |
| 5. Plan mensual | ⏳ | Depende de 4 |
| 6. Billetera, reembolsos, ledger, liquidaciones | ⏳ | Depende de 4 |
| 7. Producción, dashboard, super admin | 🚧 | En curso |
| 8. Notificaciones y PWA | 🚧 | En curso |
| 9. Pulido, tests y README | ⏳ | Al final |

## 8. Plan por fase y criterios de aceptación

### Fase 3 — Panel del restaurante
- CRUD de platos con categoría, foto (Vercel Blob; en desarrollo sin token, aceptar URL), precio, `allowNotes`, macros con aviso de coherencia (RF-R13) y bloqueo si `macrosRequired`.
- CRUD de grupos y opciones (RF-R3), asignación a platos con orden, desactivar opción "por hoy" y stock diario por opción.
- Disponibilidad: plantilla semanal por plato (`DishSchedule`) y edición por fecha (`DailyDishStock`: stock, `isClosed`), feriados (`RestaurantClosure`).
- Franjas: plantillas semanales con cupo y alcance (retiro/delivery/ambos), cierre manual por fecha. Mostrar ocupación usando `HOLDING_CONDITION_SQL`.
- Configuración: datos, horarios, modalidades, zonas de delivery, hora de corte, escalones de anticipación, plan mensual, % de reembolso por cancelación del cliente.
- **Acepta si**: todo se valida con Zod en server actions; un cambio de stock por defecto o de `dailyStock` de opción actualiza las filas de días futuros **sin pedidos** que todavía usan el valor anterior; un restaurante no puede ver ni editar datos de otro; tests de los esquemas y reglas.

### Fase 4 — Pedido programado del cliente
- Listado con filtros (RF-C2), menú por fecha (RF-C3) con macros compactos, filtros "alto en proteína", "menos de X kcal", orden por proteína/kcal (RF de macros).
- Detalle de plato con chips de modificadores, precio y macros recalculados en vivo, precarga por preferencias (RF-C6/C7).
- Checkout: fecha, franja, modalidad, dirección, alergias precargadas, uso de billetera, resumen con ahorro.
- Reserva: transacción con `ensureDayMaterialized` + `FOR UPDATE` (franja → platos por id → opciones por id), `PENDING_PAYMENT` con `holdExpiresAt`.
- `PaymentProvider` (`createCheckout`, `parseWebhook`, verificación de firma) con implementación **mock** (página `/pagos/mock/[id]` aprobar/rechazar) y esqueletos Bancard/Pagopar. Webhook idempotente (`PaymentWebhookEvent`). Al aprobar: `CONFIRMED` + asientos `PAYMENT_CAPTURED`. Pago 100% con billetera sin pasarela.
- Cancelación del cliente antes del corte (D-2). Historial de pedidos.
- Cron `/api/cron/expirar-reservas` (solo limpieza, idempotente).
- **Acepta si**: test de concurrencia contra Postgres real (N clientes por el último cupo → exactamente 1 gana; ídem stock de plato y de opción); webhook repetido no duplica; precio y macros solo del servidor.

### Fase 5 — Plan mensual
- Calendario, acciones rápidas, modificadores por día con precarga, totales nutricionales por mes/semana, un pago.
- Cambios por día antes del corte con `OrderChange` (cobro de diferencia o crédito a billetera), pausa/cancelación por día según la política snapshot.
- **Acepta si**: tests de totales del plan, de diferencias de precio y de la política de cancelación.

### Fase 6 — Billetera, reembolsos, ledger, liquidaciones
- `/cuenta/billetera` con saldo e historial. Reversos (`REVERSAL`). Liquidaciones por período (D-9) con marca de pago (`RESTAURANT_PAYOUT`). Reportes de conciliación.
- **Acepta si**: el saldo nunca queda negativo con pagos concurrentes (test), y las liquidaciones cuadran con el ledger.

### Fase 7 — Producción, dashboard y super admin
- Lista de producción agrupada por `(plato, modifierKey)` con desglose por franja y pedidos, alergias/notas destacadas, versión imprimible y PDF.
- Gestión de pedidos del día y cancelación por el restaurante (motivo obligatorio, `restaurantCancelEntries` con la política del restaurante, notificación).
- Dashboard del restaurante (RF-R12). Super admin: restaurantes (alta/baja/suspensión, comisión, política de cancelación, macros obligatorios), métricas globales, reclamos.
- **Acepta si**: test de la agrupación de producción; cancelación idempotente.

### Fase 8 — Notificaciones y PWA
- Manifest, íconos, service worker (offline básico), prompt de instalación.
- Web push (VAPID) y email con abstracción de proveedor (consola en desarrollo). `Notification.dedupeKey` para no duplicar.
- Cron de recordatorios del día anterior.

### Fase 9 — Pulido
- Navegación tipo app (barra inferior en cliente), estados vacíos y de carga, accesibilidad, tests faltantes, e2e con Playwright, README final.

## 9. Pendientes del dueño del producto

- [ ] Crear el proyecto en **Neon** y el proyecto en **Vercel**; cargar variables (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `CRON_SECRET`); correr el seed una vez.
- [ ] **Nombre de la marca** (hoy "Prepago", se cambia en `src/lib/brand.ts`).
- [ ] Credenciales de **Google OAuth** (opcional).
- [ ] Credenciales de **Bancard vPOS / Pagopar** cuando se implemente la pasarela real.
- [ ] Proveedor de **email** (ej. Resend) y claves **VAPID** para push.
- [ ] Token de **Vercel Blob** para fotos.

## 10. Preguntas abiertas

- ¿El restaurante puede tener varios usuarios (cocina, caja) con permisos distintos? El modelo lo soporta (`RestaurantMember.role`), la UI por ahora trata a todos como administradores.
- ¿Hay monto mínimo de pedido o de delivery por restaurante?
- ¿La plataforma emite factura electrónica (SIFEN) o la emite cada restaurante?
