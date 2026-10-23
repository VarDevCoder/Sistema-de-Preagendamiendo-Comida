import { niceMax } from "@/modules/metrics/calc";

// Gráfico de barras simple en SVG (sin librerías): una serie, eje recesivo,
// tope redondeado de 4px anclado a la base, valor sobre cada barra y <title>
// para el hover. Debajo va la tabla con los mismos datos (accesible).

export function BarChart({
  data,
  label,
  unit = "pedidos",
}: {
  data: { key: string; label: string; value: number }[];
  label: string;
  unit?: string;
}) {
  const W = 340;
  const H = 170;
  const pad = { top: 18, right: 8, bottom: 24, left: 26 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(32, band * 0.62);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];

  return (
    <figure className="grid gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={pad.left - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[9px] tabular-nums">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.left + i * band + (band - barW) / 2;
          const top = y(d.value);
          const h = pad.top + innerH - top;
          const r = Math.min(4, h, barW / 2);
          const base = pad.top + innerH;
          const path =
            h <= 0
              ? ""
              : `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`;
          return (
            <g key={d.key}>
              <title>{`${d.label}: ${d.value} ${unit}`}</title>
              {/* área de hover más grande que la barra */}
              <rect x={pad.left + i * band} y={pad.top} width={band} height={innerH} fill="transparent" />
              {path ? <path d={path} className="fill-primary" /> : null}
              <text x={x + barW / 2} y={top - 4} textAnchor="middle" className="fill-foreground text-[10px] font-medium tabular-nums">
                {d.value}
              </text>
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}
