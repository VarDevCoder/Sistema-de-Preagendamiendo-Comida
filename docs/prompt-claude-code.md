# Prompt para continuar con Claude Code

Copiá el bloque de abajo y pegalo en Claude Code, abierto en la carpeta del repo clonado.

---

```text
Vas a continuar el desarrollo de este repo: una plataforma (PWA mobile-first) de pedidos
anticipados prepagos para restaurantes de Asunción. Stack: Next.js 16 (App Router, Cache
Components) + TypeScript + Prisma 7 + PostgreSQL (Neon en producción, Docker en local) +
Auth.js v5 + Tailwind v4 + Zod + Vitest. Deploy en Vercel.

ANTES DE ESCRIBIR CÓDIGO leé, en este orden:
1. CLAUDE.md y AGENTS.md (reglas obligatorias: dinero en Int PYG, porcentajes en bps,
   fechas DateKey en America/Asuncion, precios solo en el servidor, locks de cupo/stock,
   ledger inmutable e idempotente, Next 16 con Suspense).
2. docs/relevamiento.md (especificación completa, decisiones confirmadas D-*, mapa de
   rutas y criterios de aceptación por fase).
3. docs/fase-1-modelo-de-datos.md y docs/fase-2-auth-y-seed.md.
4. Las guías de Next 16 en node_modules/next/dist/docs/ cuando toques algo de Next.

ESTADO:
- main: Fases 1 y 2 terminadas (modelo de datos, auth, roles, seed, módulos de dominio con
  tests), más piezas compartidas (ensureDayMaterialized, HOLDING_CONDITION_SQL,
  requireRestaurantBySlug, componentes UI, notify()).
- Hay 4 ramas con trabajo EN PROGRESO de agentes que se cortaron antes de terminar. Todas
  compilan (tsc) y sus tests unitarios pasan, pero NO están verificadas ni integradas:

  fase-8-pwa-notificaciones  (casi terminada)
    Hecho: manifest, íconos, service worker, página offline, prompt de instalación,
    notify() implementado (in-app, email consola/Resend, web push VAPID), API de push,
    /cuenta/notificaciones, cron /api/cron/recordatorios.
    Falta: verificar build, e2e (SW, offline, notify con datos del seed, cron sin
    duplicar), docs/fase-8-notificaciones-pwa.md si no existe.

  fase-7-produccion-admin
    Hecho: módulos production (agrupación + PDF), metrics, admin, claims, transiciones de
    estado y cancelación por el restaurante; páginas /panel/[slug] (dashboard),
    /panel/[slug]/pedidos, /panel/[slug]/produccion y su PDF.
    Falta: TODAS las páginas de /admin (resumen global, /admin/restaurantes, /nuevo,
    /[id], /admin/reclamos) usando los módulos ya hechos; reclamos de ejemplo en el seed
    (revisar el cambio en prisma/seed.ts); build y e2e.

  fase-3-panel
    Hecho: layout y navegación de /panel/[slug], /panel (selector), server actions,
    esquemas Zod, reglas y queries de restaurants, menu (platos y modificadores),
    availability (stock por día, franjas, sincronización de stock futuro), con tests.
    Algunos componentes en src/components/panel/menu.
    Falta: las PÁGINAS /panel/[slug]/menu, /modificadores, /disponibilidad, /franjas,
    /configuracion (la UI que usa esas actions), build y e2e.

  fase-4-pedidos  (la más crítica)
    Hecho: backend del checkout (draft, reservation con FOR UPDATE, checkout idempotente,
    cancelación del cliente, expiración), PaymentProvider (mock + firma HMAC, esqueletos
    Bancard/Pagopar), procesamiento de webhook idempotente, cron expirar-reservas,
    módulos storefront y customers, tests de integración escritos
    (vitest.integration.config.mts, src/test/integration).
    Falta: correr y arreglar los tests de integración (concurrencia de cupo, stock de
    plato y de opción, reserva vencida, webhook duplicado, billetera concurrente, precio
    del servidor); TODA la UI del cliente: /restaurantes (filtros), /restaurantes/[slug]
    (menú por fecha con macros y filtros), sheet del plato con chips de modificadores y
    precarga de preferencias, carrito, /pedido/[slug] (checkout), /pagos/mock/[paymentId],
    resultado del pedido, /cuenta/pedidos, /cuenta/pedidos/[code], /cuenta/perfil,
    /cuenta/preferencias; build y e2e.

PLAN DE TRABAJO (en este orden, una rama por vez):
1. Para cada rama: git checkout <rama>, git merge main, completar lo que falta según
   docs/relevamiento.md, correr npm test, npm run typecheck, npm run lint, npx next build
   y probar en el navegador a 390 px con las cuentas del seed (contraseña demo1234:
   ana@prepago.test, rosa@prepago.test, admin@prepago.test). Para tests de integración
   usá una base aparte. Commits chicos en español.
2. Mergear a main en este orden: fase-8 → fase-7 → fase-3 → fase-4 (fase-3 y fase-7
   comparten /panel/[slug]: el layout es de fase-3 y las páginas Resumen/Pedidos/
   Producción de fase-7). Resolver conflictos de package-lock.json regenerándolo con
   npm install. Si dos ramas agregaron migraciones, verificar que apliquen en orden.
   Después de cada merge: npm run db:reset, tests, build.
3. Con la Fase 4 integrada, seguir con la Fase 5 (plan mensual), la Fase 6 (billetera,
   reversos y liquidaciones en /admin/liquidaciones) y la Fase 9 (navegación tipo app,
   pulido, e2e con Playwright, README final), según los criterios de
   docs/relevamiento.md.
4. Conectar las llamadas a notify() que falten (confirmación del plan, saldo acreditado,
   etc.).
5. Al terminar cada fase, actualizar la tabla de estado de docs/relevamiento.md y README.md,
   mostrarme un resumen en lenguaje simple + el detalle técnico, y esperar mi confirmación
   antes de seguir con la siguiente.

Entorno local: cp .env.example .env (completar AUTH_SECRET con `npx auth secret`),
npm install, npm run db:up, npm run db:reset, npm run dev. En tu máquina `prisma migrate dev`
funciona normal: usalo para generar migraciones nuevas (nunca editar una ya commiteada).

Si algo de la especificación es ambiguo o contradictorio, preguntame antes de decidir.
```

---

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Repo | https://github.com/VarDevCoder/Sistema-de-Preagendamiendo-Comida |
| Especificación, decisiones y plan | `docs/relevamiento.md` |
| Reglas para agentes | `CLAUDE.md` (Claude Code lo lee solo al abrir el repo) |
| Modelo de datos y diagramas | `docs/fase-1-modelo-de-datos.md`, `prisma/schema.prisma` |
| Auth y datos de prueba | `docs/fase-2-auth-y-seed.md`, `prisma/seed.ts` |
| Trabajo en progreso | ramas `fase-3-panel`, `fase-4-pedidos`, `fase-7-produccion-admin`, `fase-8-pwa-notificaciones` |
