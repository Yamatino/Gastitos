/**
 * Recharts takes colors as fill/stroke props, not Tailwind classes. Returning
 * `hsl(var(--token))` strings (instead of resolved values) lets the browser
 * resolve them against the active theme, so charts follow light/dark toggles
 * without re-rendering.
 */
export function getChartColors() {
  const hsl = (name: string) => `hsl(var(${name}))`

  return {
    success: hsl('--success'),
    destructive: hsl('--destructive'),
    warning: hsl('--warning'),
    primary: hsl('--primary'),
    mutedForeground: hsl('--muted-foreground'),
    border: hsl('--border'),
    card: hsl('--card'),
    foreground: hsl('--foreground'),
  }
}

export type ChartColors = ReturnType<typeof getChartColors>
