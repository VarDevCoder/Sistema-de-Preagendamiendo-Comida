-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "deliveryFee" INTEGER NOT NULL DEFAULT 0;

-- El total del plan incluye los envíos de los días con delivery.
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_amounts_chk";
ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_amounts_chk" CHECK (
    "itemsSubtotal" >= 0 AND "discountAmount" BETWEEN 0 AND "itemsSubtotal" AND "deliveryFee" >= 0 AND
    "total" = "itemsSubtotal" - "discountAmount" + "deliveryFee" AND "discountBps" BETWEEN 0 AND 10000
  );
