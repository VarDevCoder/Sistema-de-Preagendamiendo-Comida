import { NotImplementedProviderError, type PaymentProvider, type RemoteStatus } from "./types";

/**
 * Bancard vPOS 2.0 (esqueleto). Para implementarlo:
 * - createCheckout: POST /vpos/api/0.3/single_buy con shop_process_id = paymentId,
 *   amount "123000.00", currency "PYG", token = md5(private_key + shop_process_id + amount + currency),
 *   return_url / cancel_url. Devuelve process_id → redirigir al iframe/checkout de Bancard.
 * - parseWebhook: Bancard confirma con POST a la URL de confirmación con
 *   operation.token = md5(private_key + shop_process_id + "confirm" + amount + currency);
 *   response_code "00" = aprobado. eventId = `${shop_process_id}:${response_code}`.
 * - getStatus: GET /vpos/api/0.3/single_buy/confirmations (rollback si corresponde).
 * Credenciales: BANCARD_PUBLIC_KEY, BANCARD_PRIVATE_KEY, BANCARD_ENV (staging|production).
 */
export class BancardProvider implements PaymentProvider {
  readonly kind = "BANCARD" as const;
  async createCheckout(): Promise<never> {
    throw new NotImplementedProviderError("Bancard");
  }
  async parseWebhook(): Promise<never> {
    throw new NotImplementedProviderError("Bancard");
  }
  async getStatus(): Promise<RemoteStatus> {
    throw new NotImplementedProviderError("Bancard");
  }
}
