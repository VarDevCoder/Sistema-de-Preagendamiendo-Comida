export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="grid gap-1 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function SectionSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true">
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
