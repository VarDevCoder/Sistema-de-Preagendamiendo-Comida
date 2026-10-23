"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { deleteCategoryAction, saveCategoryAction } from "@/modules/menu/dish-actions";
import { initialActionState } from "@/modules/restaurants/form";
import { ConfirmActionButton } from "../action-buttons";
import { FieldError, formView, FormMessages, SubmitButton } from "../form-bits";
import { Input } from "@/components/ui/input";

type Category = { id: string; name: string; sortOrder: number; dishCount: number };

/** Alta, renombre, orden y baja de categorías del menú. */
export function CategoryManager({ slug, categories }: { slug: string; categories: Category[] }) {
  return (
    <div className="grid gap-3">
      {categories.length ? (
        <ul className="grid gap-2">
          {categories.map((c) => (
            <li key={c.id}>
              <CategoryRow slug={slug} category={c} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay categorías.</p>
      )}
      <NewCategory slug={slug} nextOrder={categories.reduce((m, c) => Math.max(m, c.sortOrder + 1), 0)} />
    </div>
  );
}

function CategoryRow({ slug, category }: { slug: string; category: Category }) {
  const [state, action] = useActionState(saveCategoryAction.bind(null, slug, category.id), initialActionState);
  const v = formView(state, { name: category.name, sortOrder: String(category.sortOrder) });
  return (
    <form action={action} className="grid gap-1">
      <div className="flex items-center gap-2">
        <Input name="name" aria-label="Nombre de la categoría" defaultValue={v.text("name")} aria-invalid={v.error("name") ? true : undefined} className="flex-1" />
        <Input name="sortOrder" aria-label="Orden" inputMode="numeric" defaultValue={v.text("sortOrder")} className="w-16 text-center" />
        <SubmitButton size="sm" variant="secondary" pendingLabel="…">
          Guardar
        </SubmitButton>
        <ConfirmActionButton
          action={deleteCategoryAction.bind(null, slug, category.id)}
          title={`¿Eliminar "${category.name}"?`}
          description={
            category.dishCount
              ? `Sus ${category.dishCount} plato(s) quedan sin categoría; no se borra ningún plato.`
              : "La categoría está vacía."
          }
          size="icon"
          variant="ghost"
        >
          <Trash2 />
          <span className="sr-only">Eliminar categoría</span>
        </ConfirmActionButton>
      </div>
      <FieldError message={v.error("name") ?? v.error("sortOrder") ?? state.error} />
    </form>
  );
}

function NewCategory({ slug, nextOrder }: { slug: string; nextOrder: number }) {
  const [state, action] = useActionState(saveCategoryAction.bind(null, slug, null), initialActionState);
  const v = formView(state, { name: "", sortOrder: String(nextOrder) });
  return (
    <form action={action} className="grid gap-1 border-t pt-3">
      <div className="flex items-center gap-2">
        <Input name="name" placeholder="Nueva categoría (ej. Postres)" aria-label="Nueva categoría" defaultValue={v.text("name")} className="flex-1" />
        <input type="hidden" name="sortOrder" value={v.text("sortOrder")} />
        <SubmitButton size="sm" pendingLabel="…">
          Agregar
        </SubmitButton>
      </div>
      <FieldError message={v.error("name")} />
      <FormMessages state={{ ok: state.ok, message: state.message }} />
    </form>
  );
}
