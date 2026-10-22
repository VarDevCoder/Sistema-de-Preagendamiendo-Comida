# Prepago — pedidos anticipados prepagos para restaurantes

Marketplace multi-restaurante (PWA mobile-first) donde el cliente paga por adelantado más barato y el restaurante sabe exactamente qué producir.

**Stack:** Next.js 16 (App Router) · TypeScript · PostgreSQL ([Neon](https://neon.tech) en producción) · Prisma 7 · Auth.js · Tailwind + shadcn/ui · Zod · Deploy en [Vercel](https://vercel.com).
Moneda PYG (sin decimales) · Zona horaria America/Asuncion.

## Estado

| Fase | Estado | Documento |
|---|---|---|
| 1. Modelo de datos | ✅ | [`docs/fase-1-modelo-de-datos.md`](docs/fase-1-modelo-de-datos.md) |
| 2. Autenticación, roles y seed | ✅ | [`docs/fase-2-auth-y-seed.md`](docs/fase-2-auth-y-seed.md) |
| 3. Panel del restaurante | ⏳ | |
| 4–9 | ⏳ | |

## Desarrollo local

Requisitos: Node 20.9+ y Docker.

```bash
cp .env.example .env   # completar AUTH_SECRET (npx auth secret)
npm install            # también genera el cliente de Prisma
npm run db:up          # Postgres 16 en localhost:5432
npm run db:reset       # aplica migraciones y carga datos de ejemplo
npm run dev
```

Cuentas de prueba (contraseña `demo1234`): `ana@prepago.test` (cliente), `rosa@prepago.test` (restaurante), `admin@prepago.test` (super admin). Lista completa en [`docs/fase-2-auth-y-seed.md`](docs/fase-2-auth-y-seed.md).

## Deploy en Vercel + Neon

1. Crear un proyecto en Neon y copiar dos cadenas de conexión:
   - **Pooled** (host con `-pooler`) → `DATABASE_URL`
   - **Direct** → `DIRECT_URL`
2. Importar el repo en Vercel y cargar las variables de [`.env.example`](.env.example) (como mínimo `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`). En Vercel no hace falta `AUTH_TRUST_HOST`.
3. Vercel ejecuta `npm run vercel-build`, que corre `prisma migrate deploy` con `DIRECT_URL` antes de `next build`.
4. Para cargar los datos de ejemplo en Neon (una sola vez, con la base vacía), desde tu máquina:
   `DATABASE_URL="<url de Neon>" DIRECT_URL="<url directa>" npm run db:seed`
5. Opcional: `SHOW_DEMO_ACCOUNTS=true` muestra las cuentas de prueba en la pantalla de login (útil en previews, no en producción).
6. Opcional: activar la integración Neon ↔ Vercel para tener una rama de base de datos por cada preview.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run db:up` | Levanta Postgres con Docker Compose |
| `npm run db:migrate` | Crea/aplica migraciones en desarrollo |
| `npm run db:deploy` | Aplica migraciones pendientes (CI/producción) |
| `npm run db:reset` | Borra la base, aplica migraciones y carga el seed |
| `npm run db:seed` | Carga datos de ejemplo (solo sobre una base vacía) |
| `npm test` | Tests unitarios (Vitest) |
| `npm run typecheck` / `npm run lint` | Chequeos estáticos |
