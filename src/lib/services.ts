/** The music services a ride can have a playlist on. The same three are offered to riders. */
export const SERVICES = ["spotify", "apple", "amazon"] as const;
export type Service = (typeof SERVICES)[number];

export const SERVICE_LABEL: Record<Service, string> = { spotify: "Spotify", apple: "Apple Music", amazon: "Amazon Music" };

export const isService = (v: unknown): v is Service => typeof v === "string" && (SERVICES as readonly string[]).includes(v);

/** A usable playlist link: https, one word, not absurdly long. (The database checks the same thing.) */
export function isHttpsUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 600 || /\s/.test(v)) return false;
  try { return new URL(v).protocol === "https:"; } catch { return false; }
}

const HOSTS: Record<Service, RegExp[]> = {
  spotify: [/(^|\.)spotify\.com$/, /(^|\.)spotify\.link$/],
  apple: [/(^|\.)music\.apple\.com$/, /(^|\.)itunes\.apple\.com$/, /(^|\.)apple\.co$/],
  amazon: [/(^|\.)music\.amazon\.[a-z.]+$/, /(^|\.)amazon\.[a-z.]+$/, /(^|\.)amzn\.(to|eu|asia)$/],
};

/** Which service a link looks like it belongs to, or null if it is none of them. */
export function serviceOfUrl(url: string): Service | null {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  return SERVICES.find((s) => HOSTS[s].some((re) => re.test(host))) ?? null;
}

/**
 * A gentle warning for the admin when a link does not look like the service it is filed under (a Spotify link pasted in the
 * Apple Music box). A warning, not a block: services change link formats and short links exist.
 */
export function linkWarning(service: Service, url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (!isHttpsUrl(u)) return "That doesn't look like a link. Paste the full https:// address.";
  const found = serviceOfUrl(u);
  if (found === service) return null;
  return found ? `This looks like a ${SERVICE_LABEL[found]} link, not ${SERVICE_LABEL[service]}.` : `This doesn't look like a ${SERVICE_LABEL[service]} link. Check it opens the right playlist.`;
}

/** Every service has a link: the rule for publishing. */
export function missingServices(links: Partial<Record<Service, string | null | undefined>>): Service[] {
  return SERVICES.filter((s) => !isHttpsUrl((links[s] ?? "").trim()));
}
