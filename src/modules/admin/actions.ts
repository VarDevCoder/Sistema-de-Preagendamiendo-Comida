"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { Tx } from "@/lib/db-types";
import { hashPassword } from "@/modules/auth/password";
import { requireUser } from "@/modules/auth/session";
import { RESTAURANT_STATUS_LABEL } from "@/modules/shared/labels";
import { dateKeyToDb, todayKey } from "@/modules/shared/time";
import {
  addAdminSchema,
  commercialTermsSchema,
  createRestaurantSchema,
  fieldErrors,
  statusChangeSchema,
  type CreateRestaurantInput,
} from "./schemas";

export type AdminFormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

// Todas las acciones del super admin re-autorizan con requireUser(["SUPER_ADMIN"])
// y dejan registro de los cambios sensibles en AuditLog.

function formValues(formData: FormData, omit: string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData) if (typeof v === "string" && !k.startsWith("$") && !omit.includes(k)) out[k] = v;
  return out;
}

type OwnerInput = Pick<CreateRestaurantInput, "ownerMode"> &
  Partial<{ ownerName: string; ownerEmail: string; ownerPassword: string; existingOwnerEmail: string }>;

/** Valida el dueño (nuevo o existente) antes de abrir la transacción. */
async function resolveOwner(owner: OwnerInput): Promise<
  { ok: true; existingId?: string; create?: { name: string; email: string; passwordHash: string } } | { ok: false; fieldErrors: Record<string, string[]> }
> {
  if (owner.ownerMode === "existing") {
    const user = await db.user.findUnique({ where: { email: owner.existingOwnerEmail! }, select: { id: true, role: true, isActive: true } });
    if (!user) return { ok: false, fieldErrors: { existingOwnerEmail: ["No existe un usuario con ese email."] } };
    if (user.role !== "RESTAURANT_ADMIN" || !user.isActive) {
      return { ok: false, fieldErrors: { existingOwnerEmail: ["Ese usuario no es un administrador de restaurante activo."] } };
    }
    return { ok: true, existingId: user.id };
  }
  const exists = await db.user.findUnique({ where: { email: owner.ownerEmail! }, select: { id: true } });
  if (exists) return { ok: false, fieldErrors: { ownerEmail: ["Ya existe una cuenta con ese email. Elegí “usuario existente”."] } };
  return {
    ok: true,
    create: { name: owner.ownerName!, email: owner.ownerEmail!, passwordHash: await hashPassword(owner.ownerPassword!) },
  };
}

async function ownerIdIn(tx: Tx, owner: { existingId?: string; create?: { name: string; email: string; passwordHash: string } }) {
  if (owner.existingId) return owner.existingId;
  const user = await tx.user.create({ data: { ...owner.create!, role: "RESTAURANT_ADMIN" } });
  return user.id;
}

export async function createRestaurantAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const admin = await requireUser(["SUPER_ADMIN"]);
  const values = formValues(formData, ["ownerPassword"]);
  const parsed = createRestaurantSchema.safeParse({
    ...values,
    ownerPassword: formData.get("ownerPassword") ?? undefined,
    refundsCommission: formData.get("refundsCommission"),
    macrosRequired: formData.get("macrosRequired"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const input = parsed.data;

  const [slugTaken, zone] = await Promise.all([
    db.restaurant.findUnique({ where: { slug: input.slug }, select: { id: true } }),
    db.zone.findUnique({ where: { id: input.zoneId }, select: { id: true } }),
  ]);
  if (slugTaken) return { fieldErrors: { slug: ["Ya hay un restaurante con esa dirección web."] }, values };
  if (!zone) return { fieldErrors: { zoneId: ["Elegí una zona válida."] }, values };

  const owner = await resolveOwner(input);
  if (!owner.ok) return { fieldErrors: owner.fieldErrors, values };

  const restaurant = await db.$transaction(async (tx) => {
    const ownerId = await ownerIdIn(tx, owner);
    const r = await tx.restaurant.create({
      data: {
        name: input.name,
        slug: input.slug,
        addressLine: input.addressLine,
        zoneId: input.zoneId,
        phone: input.phone,
        email: input.email,
        description: input.description,
        // Arranca "en configuración": no es visible para clientes hasta que el admin lo active.
        status: "PENDING",
        commissionBps: input.commission,
        restaurantCancelRefundsCommission: input.refundsCommission,
        restaurantCancelPenaltyBps: input.penalty,
        macrosRequired: input.macrosRequired,
        members: { create: { userId: ownerId, role: "OWNER" } },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "restaurant.create",
        entityType: "Restaurant",
        entityId: r.id,
        data: {
          slug: r.slug,
          ownerId,
          ownerCreated: Boolean(owner.create),
          commissionBps: r.commissionBps,
          restaurantCancelRefundsCommission: r.restaurantCancelRefundsCommission,
          restaurantCancelPenaltyBps: r.restaurantCancelPenaltyBps,
          macrosRequired: r.macrosRequired,
        },
      },
    });
    return r;
  });
  redirect(`/admin/restaurantes/${restaurant.id}?creado=1`);
}

export async function updateCommercialTermsAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const admin = await requireUser(["SUPER_ADMIN"]);
  const restaurantId = String(formData.get("restaurantId") ?? "");
  const values = formValues(formData);
  const parsed = commercialTermsSchema.safeParse({
    commission: formData.get("commission") ?? "",
    penalty: formData.get("penalty") ?? "",
    refundsCommission: formData.get("refundsCommission"),
    macrosRequired: formData.get("macrosRequired"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const before = await db.restaurant.findUnique({
    where: { id: restaurantId },
    select: { commissionBps: true, restaurantCancelRefundsCommission: true, restaurantCancelPenaltyBps: true, macrosRequired: true },
  });
  if (!before) return { error: "No encontramos el restaurante." };
  const after = {
    commissionBps: parsed.data.commission,
    restaurantCancelRefundsCommission: parsed.data.refundsCommission,
    restaurantCancelPenaltyBps: parsed.data.penalty,
    macrosRequired: parsed.data.macrosRequired,
  };
  const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => before[k] !== after[k]);
  if (changed.length === 0) return { ok: true, message: "No había cambios para guardar." };

  await db.$transaction([
    db.restaurant.update({ where: { id: restaurantId }, data: after }),
    db.auditLog.create({
      data: {
        actorId: admin.id,
        action: "restaurant.terms.update",
        entityType: "Restaurant",
        entityId: restaurantId,
        data: Object.fromEntries(changed.map((k) => [k, { from: before[k], to: after[k] }])),
      },
    }),
  ]);
  refresh();
  // La comisión nueva aplica a pedidos futuros (cada pedido guarda su snapshot);
  // la política de cancelación aplica desde ahora (D-1: la vigente al cancelar).
  return { ok: true, message: "Condiciones comerciales actualizadas." };
}

export async function changeRestaurantStatusAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const admin = await requireUser(["SUPER_ADMIN"]);
  const parsed = statusChangeSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    status: formData.get("status"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { restaurantId, status, reason } = parsed.data;

  const r = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { status: true } });
  if (!r) return { error: "No encontramos el restaurante." };
  if (r.status === status) return { ok: true, message: `Ya estaba ${RESTAURANT_STATUS_LABEL[status].toLowerCase()}.` };
  if ((status === "SUSPENDED" || status === "CLOSED") && !reason) {
    return { fieldErrors: { reason: ["Contá el motivo (queda registrado)."] } };
  }

  await db.$transaction([
    db.restaurant.update({ where: { id: restaurantId }, data: { status } }),
    db.auditLog.create({
      data: {
        actorId: admin.id,
        action: "restaurant.status.update",
        entityType: "Restaurant",
        entityId: restaurantId,
        data: { from: r.status, to: status, reason: reason ?? null },
      },
    }),
  ]);
  // Suspender o dar de baja no toca pedidos ya pagos: siguen su curso (o el
  // restaurante los cancela con reembolso). Solo deja de recibir pedidos nuevos.
  const pending = await db.order.count({
    where: { restaurantId, serviceDate: { gte: dateKeyToDb(todayKey()) }, status: { in: ["CONFIRMED", "IN_PREPARATION", "READY"] } },
  });
  refresh();
  return {
    ok: true,
    message:
      status === "SUSPENDED" || status === "CLOSED"
        ? `Estado: ${RESTAURANT_STATUS_LABEL[status]}. Los ${pending} pedidos ya pagos para hoy o días futuros siguen vigentes.`
        : `Estado: ${RESTAURANT_STATUS_LABEL[status]}.`,
  };
}

export async function addRestaurantAdminAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const admin = await requireUser(["SUPER_ADMIN"]);
  const values = formValues(formData, ["ownerPassword"]);
  const parsed = addAdminSchema.safeParse({ ...values, ownerPassword: formData.get("ownerPassword") ?? undefined });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const restaurant = await db.restaurant.findUnique({ where: { id: parsed.data.restaurantId }, select: { id: true } });
  if (!restaurant) return { error: "No encontramos el restaurante." };

  const owner = await resolveOwner(parsed.data);
  if (!owner.ok) return { fieldErrors: owner.fieldErrors, values };
  if (owner.existingId) {
    const member = await db.restaurantMember.findUnique({
      where: { userId_restaurantId: { userId: owner.existingId, restaurantId: restaurant.id } },
    });
    if (member) return { fieldErrors: { existingOwnerEmail: ["Ese usuario ya administra este restaurante."] }, values };
  }

  await db.$transaction(async (tx) => {
    const userId = await ownerIdIn(tx, owner);
    await tx.restaurantMember.create({ data: { userId, restaurantId: restaurant.id, role: "OWNER" } });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "restaurant.member.add",
        entityType: "Restaurant",
        entityId: restaurant.id,
        data: { userId, userCreated: Boolean(owner.create) },
      },
    });
  });
  refresh();
  return { ok: true, message: "Administrador asignado." };
}
