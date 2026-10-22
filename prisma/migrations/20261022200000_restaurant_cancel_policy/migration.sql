-- AlterEnum
ALTER TYPE "LedgerAccountType" ADD VALUE 'PLATFORM_PENALTY' AFTER 'PLATFORM_COMMISSION';

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "restaurantCancelPenaltyBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "restaurantCancelRefundsCommission" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Restaurant"
  ADD CONSTRAINT "Restaurant_cancelPenalty_chk" CHECK ("restaurantCancelPenaltyBps" BETWEEN 0 AND 10000);
