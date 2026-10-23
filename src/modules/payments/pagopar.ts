import { NotImplementedProviderError, type PaymentProvider, type RemoteStatus } from "./types";

/**
 * Pagopar (esqueleto). Para implementarlo:
 * - createCheckout: POST /api/comercios/2.0/iniciar-transaccion con
 *   token = sha1(private_key + id_pedido_comercio + monto_total) y el detalle del pedido.
 *   Devuelve un hash → redirigir a https://www.pagopar.com/pagos/<hash>.
 * - parseWebhook: Pagopar notifica con POST; verificar token = sha1(private_key + hash_pedido).
 *   pagado = true → aprobado. eventId = `${hash_pedido}:${estado}`.
 * - getStatus: POST /api/pedidos/1.1/traer.
 * Credenciales: PAGOPAR_PUBLIC_KEY, PAGOPAR_PRIVATE_KEY.
 */
export class PagoparProvider implements PaymentProvider {
  readonly kind = "PAGOPAR" as const;
  async createCheckout(): Promise<never> {
    throw new NotImplementedProviderError("Pagopar");
  }
  async parseWebhook(): Promise<never> {
    throw new NotImplementedProviderError("Pagopar");
  }
  async getStatus(): Promise<RemoteStatus> {
    throw new NotImplementedProviderError("Pagopar");
  }
}
