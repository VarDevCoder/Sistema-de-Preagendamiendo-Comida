"use client";

import { useRef, useState, useTransition } from "react";
import { ImageIcon, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadDishPhotoAction } from "@/modules/menu/dish-actions";
import { FieldError } from "../form-bits";

/**
 * Foto del plato: URL (siempre) y, si hay Vercel Blob configurado, subida
 * directa desde el celular. La imagen se achica en el navegador (máx. 1600 px,
 * JPEG) para no superar el límite de 1 MB de las server actions.
 */
export function PhotoField({ slug, defaultUrl, error, uploadEnabled }: { slug: string; defaultUrl: string; error?: string; uploadEnabled: boolean }) {
  const [url, setUrl] = useState(defaultUrl);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    startTransition(async () => {
      try {
        const blob = await shrinkImage(file);
        const fd = new FormData();
        fd.set("file", blob);
        const result = await uploadDishPhotoAction(slug, fd);
        if (result.url) setUrl(result.url);
        else setUploadError(result.error ?? "No pudimos subir la foto.");
      } catch {
        setUploadError("No pudimos leer esa imagen.");
      }
    });
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="f-photoUrl">Foto</Label>
      <div className="flex items-start gap-3">
        <div
          className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted bg-cover bg-center text-muted-foreground"
          style={url ? { backgroundImage: `url("${url.replace(/"/g, "%22")}")` } : undefined}
          aria-hidden
        >
          {url ? null : <ImageIcon className="size-6" />}
        </div>
        <div className="grid flex-1 gap-2">
          <Input
            id="f-photoUrl"
            name="photoUrl"
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-invalid={error ? true : undefined}
          />
          {uploadEnabled ? (
            <>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => fileRef.current?.click()}>
                <Upload />
                {pending ? "Subiendo…" : "Subir foto"}
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Pegá la URL de una foto (la subida directa se activa con Vercel Blob).</p>
          )}
        </div>
      </div>
      <FieldError message={error ?? uploadError ?? undefined} />
    </div>
  );
}

async function shrinkImage(file: File, maxSide = 1600): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= 900_000) return new File([blob], "foto.jpg", { type: "image/jpeg" });
  }
  throw new Error("imagen demasiado grande");
}
