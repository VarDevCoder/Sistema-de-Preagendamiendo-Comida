import Link from "next/link";
import { Suspense } from "react";
import { UtensilsCrossed } from "lucide-react";
import { brand } from "@/lib/brand";
import { UserMenu } from "./user-menu";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <UtensilsCrossed className="size-4" />
          </span>
          {brand.name}
        </Link>
        {/* La sesión se lee por request: va detrás de un Suspense para no bloquear la página. */}
        <Suspense fallback={<div className="h-9 w-24 animate-pulse rounded-md bg-muted" />}>
          <UserMenu />
        </Suspense>
      </div>
    </header>
  );
}
