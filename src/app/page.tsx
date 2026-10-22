import Link from "next/link";
import { CalendarCheck, PiggyBank, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brand } from "@/lib/brand";

const BENEFITS = [
  { icon: PiggyBank, title: "Más barato", text: "Cuanto antes pedís, mayor el descuento. Con el plan mensual, todavía más." },
  { icon: CalendarCheck, title: "Tu comida, a tu hora", text: "Elegís día y franja horaria. Retirás o te lo llevan." },
  { icon: Sparkles, title: "A tu gusto", text: "Punto de cocción, guarnición, sin cebolla, extra queso… y los macros de cada plato." },
  { icon: ShieldCheck, title: "Garantía", text: "Si el restaurante cancela, te devolvemos todo al instante en tu billetera." },
];

export default function HomePage() {
  return (
    <div className="grid gap-10 py-8">
      <section className="grid gap-4">
        <p className="text-sm font-medium text-primary">{brand.tagline}</p>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          Programá tu almuerzo con anticipación y pagá menos.
        </h1>
        <p className="max-w-prose text-muted-foreground">{brand.description}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href="/registro">Crear cuenta</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/ingresar">Ya tengo cuenta</Link>
          </Button>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        {BENEFITS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex gap-3 rounded-xl border bg-card p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
              <Icon className="size-5" />
            </span>
            <div>
              <h2 className="font-medium">{title}</h2>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
