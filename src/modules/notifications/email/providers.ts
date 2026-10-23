import { emailProviderName } from "../config";

// Proveedores de email intercambiables. La app solo conoce `EmailProvider`.

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Clave de idempotencia (dedupeKey): si el proveedor la soporta, evita duplicados en reintentos. */
  idempotencyKey?: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/** Desarrollo: imprime el email en la consola del servidor. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  constructor(private readonly log: (line: string) => void = (line) => console.info(line)) {}

  async send(message: EmailMessage): Promise<void> {
    this.log(
      [
        "──────── [email:console] ────────",
        `Para: ${message.to}`,
        `Asunto: ${message.subject}`,
        "",
        message.text,
        "─────────────────────────────────",
      ].join("\n"),
    );
  }
}

/** Resend vía su API HTTP (sin SDK). https://resend.com/docs/api-reference/emails/send-email */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (message.idempotencyKey) headers["Idempotency-Key"] = message.idempotencyKey.slice(0, 256);
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend respondió ${res.status}: ${detail.slice(0, 300)}`);
    }
  }
}

/** Proveedor según la configuración, o null si el email está deshabilitado. */
export function getEmailProvider(env: Record<string, string | undefined> = process.env): EmailProvider | null {
  switch (emailProviderName(env)) {
    case "resend":
      if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
        console.error("[notificaciones] EMAIL_PROVIDER=resend requiere RESEND_API_KEY y EMAIL_FROM");
        return null;
      }
      return new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM);
    case "console":
      return new ConsoleEmailProvider();
    case "none":
      return null;
  }
}
