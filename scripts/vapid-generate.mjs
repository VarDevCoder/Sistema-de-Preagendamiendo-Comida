// Genera un par de claves VAPID para web push (sin red).
// Uso: npm run vapid:generate  → copiar las líneas al .env / variables de Vercel.
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`# Claves VAPID generadas el ${new Date().toISOString()}`);
console.log(`VAPID_PUBLIC_KEY="${publicKey}"`);
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY="${publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${privateKey}"`);
console.log(`VAPID_SUBJECT="mailto:soporte@tu-dominio.com.py"`);
console.error("\nLa clave privada es secreta: no la commitees. Si la cambiás, los dispositivos deben volver a activar las notificaciones.");
