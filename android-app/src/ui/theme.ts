/** One palette for the whole app, matching the Mac popup: ink, white sheets, soft blue. */
export const colors = {
  ink: '#0b0f17',
  inkRaised: '#161b26',
  /** Navy for the dock and hero buttons: reads against both the ink page and white sheets. */
  navy: '#1f2a44',
  white: '#ffffff',
  text: '#111827',
  textSoft: '#4b5363',
  muted: '#8b93a3',
  line: '#eceff4',
  soft: '#f4f6fa',
  accent: '#8fb3ea',
  accentStrong: '#5b8ad6',
  accentSoft: '#eaf1fd',
  ok: '#22a04b',
  okSoft: '#e6f6eb',
  warn: '#d97706',
  warnSoft: '#fdf1e1',
  danger: '#dc2626',
  dangerSoft: '#fdeaea',
  /** Hero card: daylight sky into deep water, like the reference design. */
  heroGradient: 'linear-gradient(180deg, #dcebfb 0%, #b4d3f4 45%, #7fb0e4 100%)',
} as const;

export const radius = {
  hero: 40,
  sheet: 36,
  card: 28,
  pill: 999,
} as const;

/** Android package names make poor labels; "com.whatsapp" reads better as "Whatsapp". */
export function appLabel(packageName: string): string {
  const parts = packageName.split('.').filter(Boolean);
  const skip = new Set(['com', 'org', 'net', 'android', 'google', 'apps', 'app']);
  const name = [...parts].reverse().find(part => !skip.has(part)) ?? parts[parts.length - 1];
  if (!name) return packageName;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "8:10 AM" without relying on Intl, which Hermes builds may not ship fully. */
export function clockTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}
