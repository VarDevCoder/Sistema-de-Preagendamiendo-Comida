import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Field({
  name,
  label,
  errors,
  ...props
}: React.ComponentProps<typeof Input> & { name: string; label: string; errors?: string[] }) {
  const errorId = `${name}-error`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={errors?.length ? errorId : undefined}
        {...props}
      />
      {errors?.length ? (
        <p id={errorId} className="text-sm text-destructive">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}
