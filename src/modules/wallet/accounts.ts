import type { LedgerAccountType } from "@/generated/prisma/enums";

// Códigos estables de cuentas contables. Una cuenta se crea la primera vez que se usa.

export const accounts = {
  wallet: (userId: string) => `wallet:${userId}`,
  restaurant: (restaurantId: string) => `restaurant:${restaurantId}`,
  commission: "platform:commission",
  penalty: "platform:penalty",
  gateway: "platform:gateway",
  bank: "platform:bank",
  goodwill: "platform:goodwill",
} as const;

export type AccountRef = {
  code: string;
  type: LedgerAccountType;
  userId?: string;
  restaurantId?: string;
};

export function describeAccount(code: string): AccountRef {
  const [prefix, id] = code.split(":");
  switch (prefix) {
    case "wallet":
      return { code, type: "CUSTOMER_WALLET", userId: id };
    case "restaurant":
      return { code, type: "RESTAURANT_PAYABLE", restaurantId: id };
    case "platform": {
      const types: Record<string, LedgerAccountType> = {
        commission: "PLATFORM_COMMISSION",
        penalty: "PLATFORM_PENALTY",
        gateway: "GATEWAY_CLEARING",
        bank: "PLATFORM_BANK",
        goodwill: "PLATFORM_GOODWILL",
      };
      const type = types[id];
      if (type) return { code, type };
    }
  }
  throw new Error(`Código de cuenta contable desconocido: ${code}`);
}
