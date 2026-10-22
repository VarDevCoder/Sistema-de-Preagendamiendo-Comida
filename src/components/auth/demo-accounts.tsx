// Cuentas del seed, visibles solo si SHOW_DEMO_ACCOUNTS=true (desarrollo y previews).
const DEMO = [
  { role: "Cliente", email: "ana@prepago.test" },
  { role: "Restaurante", email: "rosa@prepago.test" },
  { role: "Super admin", email: "admin@prepago.test" },
];

export function DemoAccounts() {
  if (process.env.SHOW_DEMO_ACCOUNTS !== "true") return null;
  return (
    <div className="rounded-lg border border-dashed p-3 text-sm">
      <p className="mb-2 font-medium">Cuentas de prueba (contraseña: demo1234)</p>
      <ul className="grid gap-1 text-muted-foreground">
        {DEMO.map((d) => (
          <li key={d.email} className="flex justify-between gap-2">
            <span>{d.role}</span>
            <code className="font-mono text-foreground">{d.email}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
