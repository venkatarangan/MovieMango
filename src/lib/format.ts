export function formatRuntime(minutes?: number | null): string {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h} hr`;
}

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
