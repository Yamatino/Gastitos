/**
 * Recharts needs literal color strings (fill/stroke), not Tailwind classes.
 * Reads the app's HSL custom properties from index.css so charts stay in
 * sync with the active theme tokens.
 */
export function getChartColors() {
  const style = getComputedStyle(document.documentElement)
  const hsl = (name: string) => `hsl(${style.getPropertyValue(name).trim()})`

  return {
    success: hsl('--success'),
    destructive: hsl('--destructive'),
    warning: hsl('--warning'),
    primary: hsl('--primary'),
    mutedForeground: hsl('--muted-foreground'),
    border: hsl('--border'),
    card: hsl('--card'),
  }
}

export type ChartColors = ReturnType<typeof getChartColors>
