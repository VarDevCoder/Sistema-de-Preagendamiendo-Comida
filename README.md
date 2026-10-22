# Prepago — pedidos anticipados prepagos para restaurantes

Marketplace multi-restaurante (PWA mobile-first) donde el cliente paga por adelantado más barato y el restaurante sabe exactamente qué producir.

**Stack:** Next.js 16 (App Router) · TypeScript · PostgreSQL ([Neon](https://neon.tech) en producción) · Prisma 7 · Auth.js · Tailwind + shadcn/ui · Zod · Deploy en [Vercel](https://vercel.com).
Moneda PYG (sin decimales) · Zona horaria America/Asuncion.

> Estado: **Fase 1 — modelo de datos**. Ver [`docs/fase-1-modelo-de-datos.md`](docs/fase-1-modelo-de-datos.md).

## Desarrollo local

Requisitos: Node 20.9+ y Docker.

```bash
cp .env.example .env
npm install            # también genera el cliente de Prisma
npm run db:up          # Postgres 16 en localhost:5432
npm run db:deploy      # aplica las migraciones
npm run dev
```

## Deploy en Vercel + Neon

1. Crear un proyecto en Neon y copiar dos cadenas de conexión:
   - **Pooled** (host con `-pooler`) → `DATABASE_URL`
   - **Direct** → `DIRECT_URL`
2. Importar el repo en Vercel y cargar las variables de [`.env.example`](.env.example) (como mínimo `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `CRON_SECRET`).
3. Vercel ejecuta `npm run vercel-build`, que corre `prisma migrate deploy` con `DIRECT_URL` antes de `next build`.
4. Opcional: activar la integración Neon ↔ Vercel para tener una rama de base de datos por cada preview.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run db:up` | Levanta Postgres con Docker Compose |
| `npm run db:migrate` | Crea/aplica migraciones en desarrollo |
| `npm run db:deploy` | Aplica migraciones pendientes (CI/producción) |
| `npm run db:reset` | Borra y recrea la base local |
| `npm run db:seed` | Carga datos de ejemplo (Fase 2) |
| `npm run typecheck` / `npm run lint` | Chequeos estáticos |
