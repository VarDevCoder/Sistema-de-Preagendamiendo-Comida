-- =============================================================================
-- Reglas de integridad que Prisma no puede expresar en schema.prisma.
-- Son la última línea de defensa: la app valida antes con Zod, pero la base
-- de datos nunca acepta un estado inválido aunque haya un bug.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Restaurante y configuración
-- ---------------------------------------------------------------------------
ALTER TABLE "Restaurant"
  ADD CONSTRAINT "Restaurant_cutoff_chk" CHECK ("cutoffDaysBefore" >= 0 AND "cutoffMinute" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "Restaurant_maxDaysAhead_chk" CHECK ("maxDaysAhead" BETWEEN 1 AND 120),
  ADD CONSTRAINT "Restaurant_commission_chk" CHECK ("commissionBps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "Restaurant_cancelRefund_chk" CHECK ("customerCancelRefundBps" BETWEEN 0 AND 10000);

ALTER TABLE "OpeningHours"
  ADD CONSTRAINT "OpeningHours_weekday_chk" CHECK ("weekday" BETWEEN 1 AND 7),
  ADD CONSTRAINT "OpeningHours_range_chk" CHECK ("opensMinute" >= 0 AND "closesMinute" <= 1440 AND "opensMinute" < "closesMinute");

ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_fee_chk" CHECK ("fee" >= 0);

ALTER TABLE "AdvanceDiscountTier"
  ADD CONSTRAINT "AdvanceDiscountTier_chk" CHECK ("minHoursBefore" >= 0 AND "discountBps" BETWEEN 0 AND 9000);

ALTER TABLE "MonthlyPlanConfig"
  ADD CONSTRAINT "MonthlyPlanConfig_discount_chk" CHECK ("discountBps" BETWEEN 0 AND 9000),
  ADD CONSTRAINT "MonthlyPlanConfig_weekdays_chk" CHECK ("weekdays" <@ ARRAY[1,2,3,4,5,6,7]),
  ADD CONSTRAINT "MonthlyPlanConfig_deadline_chk" CHECK ("signupDeadlineDay" BETWEEN 1 AND 28),
  ADD CONSTRAINT "MonthlyPlanConfig_minDays_chk" CHECK ("minDays" >= 1),
  ADD CONSTRAINT "MonthlyPlanConfig_cancel_chk" CHECK ("cancelDaysBefore" >= 0 AND "cancelMinute" BETWEEN 0 AND 1439 AND "cancelRefundBps" BETWEEN 0 AND 10000);

ALTER TABLE "PlatformSettings"
  ADD CONSTRAINT "PlatformSettings_singleton_chk" CHECK ("id" = 1),
  ADD CONSTRAINT "PlatformSettings_values_chk" CHECK ("holdMinutes" BETWEEN 1 AND 60 AND "defaultCommissionBps" BETWEEN 0 AND 10000 AND "macroTolerancePct" BETWEEN 0 AND 100);

-- ---------------------------------------------------------------------------
-- Menú, macros y modificadores
-- ---------------------------------------------------------------------------
ALTER TABLE "Dish"
  ADD CONSTRAINT "Dish_price_chk" CHECK ("basePrice" >= 0),
  ADD CONSTRAINT "Dish_nutrition_chk" CHECK (
    coalesce("servingGrams", 0) >= 0 AND coalesce("kcal", 0) >= 0 AND
    coalesce("proteinG", 0) >= 0 AND coalesce("carbsG", 0) >= 0 AND coalesce("fatG", 0) >= 0 AND
    coalesce("fiberG", 0) >= 0 AND coalesce("sugarG", 0) >= 0 AND coalesce("sodiumMg", 0) >= 0
  );

ALTER TABLE "ModifierGroup"
  ADD CONSTRAINT "ModifierGroup_select_chk" CHECK ("minSelect" >= 0 AND "maxSelect" >= 1 AND "minSelect" <= "maxSelect"),
  ADD CONSTRAINT "ModifierGroup_required_chk" CHECK (NOT "required" OR "minSelect" >= 1);

ALTER TABLE "ModifierOption"
  ADD CONSTRAINT "ModifierOption_stock_chk" CHECK ("dailyStock" IS NULL OR "dailyStock" >= 0);

-- ---------------------------------------------------------------------------
-- Disponibilidad
-- ---------------------------------------------------------------------------
ALTER TABLE "DishSchedule"
  ADD CONSTRAINT "DishSchedule_chk" CHECK ("weekday" BETWEEN 1 AND 7 AND "defaultStock" >= 0);

ALTER TABLE "DailyDishStock" ADD CONSTRAINT "DailyDishStock_stock_chk" CHECK ("stock" >= 0);
ALTER TABLE "OptionDailyStock" ADD CONSTRAINT "OptionDailyStock_stock_chk" CHECK ("stock" >= 0);

ALTER TABLE "TimeSlotTemplate"
  ADD CONSTRAINT "TimeSlotTemplate_chk" CHECK (
    "weekday" BETWEEN 1 AND 7 AND "capacity" >= 0 AND
    "startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute"
  );

ALTER TABLE "DailySlot"
  ADD CONSTRAINT "DailySlot_chk" CHECK (
    "capacity" >= 0 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute"
  );

-- ---------------------------------------------------------------------------
-- Pedidos, planes y pagos: aritmética de precios cerrada en la base
-- ---------------------------------------------------------------------------
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_amounts_chk" CHECK (
    "itemsSubtotal" >= 0 AND "discountAmount" >= 0 AND "deliveryFee" >= 0 AND
    "discountAmount" <= "itemsSubtotal" AND
    "total" = "itemsSubtotal" - "discountAmount" + "deliveryFee" AND
    "discountBps" BETWEEN 0 AND 10000 AND
    "commissionBps" BETWEEN 0 AND 10000 AND "commissionAmount" BETWEEN 0 AND "total"
  ),
  ADD CONSTRAINT "Order_hold_chk" CHECK ("status" <> 'PENDING_PAYMENT' OR "holdExpiresAt" IS NOT NULL),
  ADD CONSTRAINT "Order_kind_chk" CHECK (("kind" = 'PLAN_DAY') = ("subscriptionId" IS NOT NULL)),
  ADD CONSTRAINT "Order_slot_chk" CHECK ("slotStartMinute" < "slotEndMinute");

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_amounts_chk" CHECK (
    "quantity" > 0 AND "unitBasePrice" >= 0 AND
    "unitListPrice" = "unitBasePrice" + "unitModifiersTotal" AND "unitListPrice" >= 0 AND
    "lineListTotal" = "unitListPrice" * "quantity" AND
    "lineDiscount" >= 0 AND "lineTotal" = "lineListTotal" - "lineDiscount" AND "lineTotal" >= 0
  ),
  ADD CONSTRAINT "OrderItem_nutrition_chk" CHECK (
    coalesce("kcal", 0) >= 0 AND coalesce("proteinG", 0) >= 0 AND coalesce("carbsG", 0) >= 0 AND
    coalesce("fatG", 0) >= 0 AND coalesce("fiberG", 0) >= 0 AND coalesce("sugarG", 0) >= 0 AND
    coalesce("sodiumMg", 0) >= 0
  );

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_amounts_chk" CHECK (
    "itemsSubtotal" >= 0 AND "discountAmount" BETWEEN 0 AND "itemsSubtotal" AND
    "total" = "itemsSubtotal" - "discountAmount" AND "discountBps" BETWEEN 0 AND 10000
  ),
  ADD CONSTRAINT "Subscription_period_chk" CHECK ("periodStart" <= "periodEnd");

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amounts_chk" CHECK (
    "amount" > 0 AND "walletAmount" >= 0 AND "gatewayAmount" >= 0 AND
    "amount" = "walletAmount" + "gatewayAmount"
  ),
  ADD CONSTRAINT "Payment_target_chk" CHECK (
    ("purpose" = 'SUBSCRIPTION' AND "subscriptionId" IS NOT NULL AND "orderId" IS NULL) OR
    ("purpose" IN ('ORDER', 'ORDER_ADJUSTMENT') AND "orderId" IS NOT NULL AND "subscriptionId" IS NULL)
  ),
  ADD CONSTRAINT "Payment_wallet_only_chk" CHECK ("provider" <> 'WALLET' OR "gatewayAmount" = 0);

ALTER TABLE "Settlement"
  ADD CONSTRAINT "Settlement_amounts_chk" CHECK ("netAmount" = "grossSales" - "commission" - "refunds");

-- ---------------------------------------------------------------------------
-- Ledger inmutable de doble registro
-- ---------------------------------------------------------------------------
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_nonzero_chk" CHECK ("amount" <> 0);

-- 1) Inmutabilidad: nada de UPDATE / DELETE / TRUNCATE. Las correcciones son
--    transacciones nuevas de tipo REVERSAL.
CREATE FUNCTION ledger_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El ledger es inmutable: % sobre % no está permitido. Usá un movimiento inverso (REVERSAL).',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "LedgerEntry_immutable"
  BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation();
CREATE TRIGGER "LedgerEntry_no_truncate"
  BEFORE TRUNCATE ON "LedgerEntry"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_forbid_mutation();
CREATE TRIGGER "LedgerTransaction_immutable"
  BEFORE UPDATE OR DELETE ON "LedgerTransaction"
  FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation();
CREATE TRIGGER "LedgerTransaction_no_truncate"
  BEFORE TRUNCATE ON "LedgerTransaction"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_forbid_mutation();

-- 2) Partida doble: al hacer COMMIT, cada transacción tocada debe tener
--    al menos 2 asientos y sumar exactamente 0 (débitos = créditos).
--    Es un CONSTRAINT TRIGGER diferido, así la app puede insertar la
--    transacción y sus asientos en cualquier orden dentro de la misma
--    transacción SQL.
CREATE FUNCTION ledger_check_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tx_id TEXT;
  n INTEGER;
  total BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'LedgerTransaction' THEN
    tx_id := NEW."id";
  ELSE
    tx_id := NEW."transactionId";
  END IF;

  SELECT count(*), coalesce(sum("amount"), 0) INTO n, total
  FROM "LedgerEntry" WHERE "transactionId" = tx_id;

  IF n < 2 THEN
    RAISE EXCEPTION 'Transacción de ledger % con % asiento(s): se requieren al menos 2', tx_id, n
      USING ERRCODE = 'check_violation';
  END IF;
  IF total <> 0 THEN
    RAISE EXCEPTION 'Transacción de ledger % desbalanceada: suma = %', tx_id, total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "LedgerTransaction_balanced"
  AFTER INSERT ON "LedgerTransaction"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check_balanced();
CREATE CONSTRAINT TRIGGER "LedgerEntry_balanced"
  AFTER INSERT ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check_balanced();
