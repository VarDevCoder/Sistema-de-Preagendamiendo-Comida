# Fase 8 — Notificaciones y PWA

## Resumen en simple

- La app se puede **instalar** en el celular (ícono en el inicio, pantalla completa). Si la conexión falla, se ve una pantalla de "Estás sin conexión" en vez de un error en blanco, y aclara que los pedidos y el saldo siguen guardados.
- Cada hecho importante (pedido confirmado, listo, cancelado, cambio de día del plan, saldo acreditado, reclamo actualizado, recordatorio del día anterior) se avisa por **tres canales**: una bandeja dentro de la app (`/cuenta/notificaciones`), email y notificación push al celular/navegador — según lo que tenga configurado el usuario.
- El mismo hecho **nunca se notifica dos veces** por el mismo canal, aunque el cron que manda los recordatorios se ejecute varias veces o un webhook llegue repetido.
- En desarrollo, sin credenciales de verdad, los emails se imprimen en la consola del servidor y el push queda desactivado mostrando el motivo ("todavía no están disponibles").

## Cómo funciona (técnico)

### Un solo punto de entrada: `notify()`

Las fases 4 a 7 (pedidos, plan mensual, billetera, producción) van a llamar a `notify(event)` ([`src/modules/notifications/events.ts`](../src/modules/notifications/events.ts)) **después** de confirmar la transacción que originó el hecho, nunca antes ni adentro del `$transaction`. `notify()` nunca lanza: una falla al notificar no puede romper un pedido o un pago.

Dentro de una request (server action, route handler) usa `after()` de `next/server` para no demorar la respuesta al usuario; fuera de una request (cron, scripts) entrega en el momento.

```
notify({ type: "ORDER_CONFIRMED", orderId })
  → events.ts: deliverSafely (nunca lanza, log si falla)
    → service.ts: deliverNotification (arma el notifier una sola vez por proceso)
      → notifier.ts: resolver destinatario y contenido → elegir canales → insertar
        filas Notification ignorando duplicados (dedupeKey) → enviar SOLO las
        filas recién creadas → marcar SENT / FAILED
```

| Pieza | Archivo | Responsabilidad |
|---|---|---|
| Tipos de evento | `events.ts` | Unión `NotificationEvent`; único punto de entrada `notify()`. |
| Resolver | `resolve.ts` | Por tipo de evento, busca la entidad (pedido, suscripción, reclamo, usuario) y arma el contenido (`content.ts`) y el destinatario. Devuelve `null` si la entidad no existe o el evento no aplica (nunca lanza). |
| Núcleo de envío | `notifier.ts` | Puro respecto de Prisma y Next (recibe sus dependencias por parámetro): elige canales, inserta, envía, marca estado. Se testea con mocks. |
| Canales | `channels.ts` | `IN_APP` siempre; `EMAIL` si hay proveedor y el usuario tiene email; `PUSH` si hay VAPID y al menos un dispositivo suscripto. Usuario inactivo → solo `IN_APP`. |
| Idempotencia | `keys.ts` | `dedupeKey(eventKey, channel)`. El insert ignora conflictos de `Notification.dedupeKey` (único en la base) y el notifier solo envía las filas que realmente se crearon. |
| Service | `service.ts` | Arma el notifier real (Prisma + proveedores del entorno) una vez por proceso. |
| Store | `store.ts` | Implementación Prisma de `NotificationStore` (insertar, marcar enviado/fallido, leer/crear suscripciones push). |
| Contenido | `content.ts`, `format.ts` | Textos en español/voseo por tipo de evento (título, cuerpo, URL de destino). |

### Email

`email/providers.ts` define `EmailProvider` (`send(message)`) con dos implementaciones intercambiables, elegidas por `EMAIL_PROVIDER` en `config.ts`:

- **`ConsoleEmailProvider`** (por defecto en desarrollo): imprime el email en la consola del servidor.
- **`ResendEmailProvider`**: llama a la API HTTP de Resend (sin SDK) con `RESEND_API_KEY`.

`email/template.ts` arma el HTML y el texto plano a partir de `NotificationContent`.

### Push (web push / VAPID)

- `push/sender.ts`: envía usando `web-push` y las claves `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`. Si el proveedor responde que la suscripción ya no existe (410/404), el notifier la borra (`deletePushSubscription`) para no reintentar en el vacío.
- `push-subscriptions.ts`, `push-schema.ts`: alta/baja de suscripciones, validadas con Zod.
- `src/components/notifications/push-toggle.tsx`: switch en `/cuenta/notificaciones`. Estados: `unsupported` (navegador sin soporte), `ios-install` (iPhone necesita instalar la PWA primero, requisito de iOS 16.4+), `server-disabled` (sin `VAPID_PUBLIC_KEY`), `denied` (el usuario bloqueó el permiso), `off`/`on`. El Service Worker (`/sw.js`) recién se registra cuando el usuario activa el switch, no al cargar la app.
- `npm run vapid:generate` (`scripts/vapid-generate.mjs`) genera el par de claves para `.env`.
- `/api/push/suscribir`, `/api/push/desuscribir`, `/api/push/prueba`: altas, bajas y un envío de prueba al dispositivo actual.

### Bandeja in-app

`/cuenta/notificaciones` (`queries.ts`, `actions.ts`) lista las filas `Notification` del usuario (canal `IN_APP`, que quedan `SENT` al crearse), con contador de no leídas y "marcar todas como leídas".

### Cron de recordatorios

`/api/cron/recordatorios` (`src/app/api/cron/recordatorios/route.ts`) llama a `sendOrderReminders()` (`reminders-job.ts`), que busca los pedidos `CONFIRMED` cuyo día de servicio es **mañana** en America/Asuncion (`reminderServiceDate()`, `reminders.ts`) y notifica `ORDER_REMINDER` para cada uno. Protegido con `Authorization: Bearer $CRON_SECRET` (`http.ts`, `isAuthorizedCron`). Programado en `vercel.json` para las 21:00 UTC (18:00 Asunción).

Es idempotente por diseño (mismo mecanismo de `dedupeKey` que cualquier otro evento): correrlo dos veces el mismo día no duplica notificaciones, solo cuenta `alreadyNotified`.

### PWA

| Pieza | Archivo |
|---|---|
| Manifest | `src/app/manifest.ts` → `/manifest.webmanifest` (nombre, íconos, shortcuts a `/cuenta/pedidos` y `/restaurantes`, `display: standalone`) |
| Íconos | `public/icons/` (192, 512, maskable 512, badge) |
| Service Worker | `public/sw.js` — navegación: *network-first* con fallback a `/offline` (las páginas no se cachean porque tienen datos del usuario); assets con hash (`/_next/static`, íconos): *cache-first*; nunca cachea `/api/*`, server actions ni nada que no sea `GET`. Muestra las notificaciones push y al tocarlas enfoca/abre la URL del pedido. Versión embebida (`VERSION`) para invalidar cachés viejos al publicar. |
| Registro del SW | `src/components/pwa/pwa-client.tsx` | Se registra al cargar la app (si `SW_ENABLED`), aparte del registro que hace `push-toggle.tsx` al activar el switch. |
| Página offline | `app/offline/page.tsx` | Se precachea en el `install` del SW junto con sus assets, para que se vea bien aunque el usuario nunca la haya visitado. |
| Prompt de instalación | componente que escucha `beforeinstallprompt` / detecta iOS para mostrar las instrucciones manuales | Aparece en la landing. |

## Verificado en esta fase

- `npx next build` compila sin errores con Cache Components y Partial Prefetching activados.
- Migraciones y seed corridos contra una base Neon real (proyecto de desarrollo aparte): 3 restaurantes, 17 platos, ~230 pedidos, 2 planes, billeteras, ledger balanceado.
- `/`, `/ingresar`, `/cuenta/notificaciones`, `/offline` probadas en navegador a 390 px de ancho.
- Login con `ana@prepago.test` (demo1234); bandeja de notificaciones funcional: "Marcar todas como leídas" actualiza el contador y quita el estado "sin leer".
- `GET /api/cron/recordatorios` con `Authorization: Bearer $CRON_SECRET`: primera corrida notificó 15 pedidos confirmados para el día siguiente; segunda corrida el mismo día devolvió `notified: 0, alreadyNotified: 15` — confirma que no duplica.
- Manifest (`/manifest.webmanifest`) válido; Service Worker (`/sw.js`) se registra y queda `active` al cargar la landing.
- No se pudo verificar en este entorno automatizado: la suscripción push real de punta a punta (requiere el permiso de notificaciones del navegador, que en Chromium headless no se puede otorgar mediante script) y el comportamiento offline real del Service Worker (requiere desconectar la red del navegador, no disponible con las herramientas de este entorno). El código de ambos se revisó y el diseño es correcto; falta la prueba manual en un navegador real.

## Pendiente

- Probar instalación real en un celular (Android/Chrome y iOS/Safari) y activar push de punta a punta con las claves VAPID de verdad.
- Conectar las llamadas a `notify()` que todavía faltan desde las fases 4, 5, 6 y 7 (confirmación de pedido, pedido listo, cancelación, cambio de día del plan, saldo acreditado, reclamo actualizado) — hoy el módulo está listo pero casi nada lo invoca todavía.
- Cargar `RESEND_API_KEY` y claves VAPID de producción cuando el dueño del producto las tenga.
