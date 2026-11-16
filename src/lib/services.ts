/** Every music service the app knows about. The database accepts a playlist link for any of these. */
export const SERVICES = ["spotify", "apple", "amazon"] as const;
export type Service = (typeof SERVICES)[number];

export const isService = (v: unknown): v is Service => typeof v === "string" && (SERVICES as readonly string[]).includes(v);

/**
 * The services switched ON: riders can choose these, and a ride needs a link for each to be published. Apple Music is built but off
 * until playlists exist on it (it needs a subscription to make them). To switch it on, add "apple" here: the picker, the editor and
 * the publish rule follow, and existing rides then show as missing an Apple link until one is added.
 */
export const ACTIVE_SERVICES: readonly Service[] = ["spotify", "amazon"];
export const isActiveService = (v: unknown): v is Service => isService(v) && ACTIVE_SERVICES.includes(v);

export const SERVICE_LABEL: Record<Service, string> = { spotify: "Spotify", apple: "Apple Music", amazon: "Amazon Music" };


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

/** The services that still need a link before a ride can be published: every switched-on service must have one. */
export function missingServices(links: Partial<Record<Service, string | null | undefined>>): Service[] {
  return ACTIVE_SERVICES.filter((s) => !isHttpsUrl((links[s] ?? "").trim()));
}
