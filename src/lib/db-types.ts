import type { Prisma } from "@/generated/prisma/client";

/** Cliente dentro de una transacción interactiva (`db.$transaction(async (tx) => …)`). */
export type Tx = Prisma.TransactionClient;
