@AGENTS.md

# Guía para agentes

Plataforma de pedidos anticipados prepagos para restaurantes (Asunción, PY). **Antes de trabajar leé [`docs/relevamiento.md`](docs/relevamiento.md)**: especificación, decisiones confirmadas, mapa de rutas, estado y criterios de aceptación por fase.

## Comandos

```bash
npm run db:up        # Postgres local (Docker)
npm run db:reset     # migraciones + seed (borra todo)
npm run dev
npm test             # Vitest
npm run typecheck && npm run lint
npx next build       # verificar antes de commitear (detecta errores de Cache Components)
```

Cuentas del seed: contraseña `demo1234` → `ana@prepago.test` (cliente), `rosa@prepago.test` (restaurante), `admin@prepago.test` (super admin).

## Reglas de dominio (no negociables)

- **Dinero**: `Int` en guaraníes. **Porcentajes**: `Int` en bps (`1000` = 10%). Usar `applyBps` y `allocateProportionally` de `src/modules/shared/money.ts`. Nunca floats para dinero.
- **Fechas**: un día de servicio es un `DateKey` (`"2026-11-03"`), interpretado en America/Asuncion. Horas del día = minutos desde 00:00. Usar `src/modules/shared/time.ts` (`todayKey`, `zonedInstant`, `cutoffInstant`, `dateKeyToDb`…). Nunca `new Date().getDate()` ni `toLocaleDateString` para lógica.
- **Precios y macros solo en el servidor**: `priceLine`/`priceOrder` (`modules/orders/pricing.ts`), `itemNutrition`/`sumNutrition` (`modules/menu/nutrition.ts`), `validateSelection` (`modules/menu/modifiers.ts`). Lo que manda el cliente son solo ids y cantidades.
- **Snapshots**: al crear un pedido se copian nombre, precios y macros a `OrderItem`/`OrderItemModifier`. Platos, grupos y opciones se borran con `deletedAt`, nunca físicamente.
- **Cupo y stock**: dentro de `db.$transaction`, primero `ensureDayMaterialized` (`modules/availability/materialize.ts`), después `SELECT … FOR UPDATE` en este orden: `DailySlot` → `DailyDishStock` (por id) → `OptionDailyStock` (por id). Contar con `HOLDING_CONDITION_SQL` (`modules/orders/statuses.ts`): una reserva `PENDING_PAYMENT` vencida no cuenta. **No depender de crons para la correctitud.**
- **Ledger**: todo movimiento de dinero con `postLedgerTransaction` (`modules/wallet/ledger-tx.ts`) usando los constructores de asientos de `modules/wallet/entries.ts`. Siempre con `idempotencyKey` única del hecho (`payment:<id>:captured`, `order:<id>:restaurant-cancel`…). Las tablas del ledger rechazan UPDATE/DELETE y transacciones desbalanceadas (triggers). Para gastar billetera: `lockWalletBalance` dentro de la transacción.
- **Webhooks y crons idempotentes** (`PaymentWebhookEvent` único por `(provider, eventId)`; `Notification.dedupeKey`).

## Next.js 16 (leer `node_modules/next/dist/docs/` ante la duda)

- `cacheComponents: true`: todo lo que lee sesión, cookies o la base va en un componente async **dentro de `<Suspense>`**. La página exterior debe poder prerenderizarse.
- Sesión: `getSessionUser()` / `requireUser(roles)` / `requireRestaurantBySlug(slug)` de `src/modules/auth/session.ts`. Autorizar **dentro de cada server action y route handler**, no solo en la página.
- Si una función usa aleatoriedad o `Date.now()` antes de leer la request (ej. Auth.js), llamar primero `await connection()` (`next/server`).
- `src/proxy.ts` es el ex-middleware: solo chequeo optimista por rol.
- `params` y `searchParams` son Promises.

## Base de datos y migraciones

- Schema: `prisma/schema.prisma`. Cliente generado en `src/generated/prisma` (import desde `@/generated/prisma/client` y `@/generated/prisma/enums`).
- Cada cambio de schema = **migración nueva** en `prisma/migrations/<timestamp>_<nombre>/migration.sql`. Nunca editar una migración ya commiteada.
- Reglas que Prisma no expresa (CHECKs, triggers) van como SQL en la migración, con comentario.
- `prisma.config.ts` usa `DIRECT_URL` para migrar; la app usa `DATABASE_URL` (pooled en Neon) vía `src/lib/db.ts`.

## UI

- Español rioplatense/paraguayo con voseo ("Elegí", "Pagá"). Mobile-first; probar a 390 px de ancho.
- Componentes en `src/components/ui` (estilo shadcn: button, input, label, card, alert, badge, textarea, native-select, separator, switch, checkbox, tabs, dialog, sheet, skeleton, table). Reutilizarlos antes de crear nuevos. `cn()` en `src/lib/utils.ts`.
- Formatos: `formatGs`, `formatBps`, `formatMinute`, `formatMacrosCompact`. Etiquetas en `src/modules/shared/labels.ts`.
- Selección de modificadores con chips/toggles, no formularios largos. Alergias siempre destacadas (color + etiqueta).

## Código

- Lógica de negocio pura en `src/modules/<dominio>/*.ts` con tests `*.test.ts` al lado; acceso a datos y server actions en el mismo módulo (`actions.ts`, `queries.ts`). Las páginas solo componen.
- Server actions: `"use server"`, validar con Zod, devolver `{ error, fieldErrors }` para formularios.
- Comentarios en español, breves, explicando el porqué.
- Commits en español, descriptivos.
