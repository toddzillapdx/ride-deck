/** A published ride is addressed as "pub-<uuid>" everywhere a ride id goes (library, ride screen, history). Safe for the browser. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CURATED_PREFIX = "pub-";
export const isCuratedId = (id: string) => id.startsWith(CURATED_PREFIX) && UUID.test(id.slice(CURATED_PREFIX.length));
export const curatedId = (uuid: string) => CURATED_PREFIX + uuid;
export const curatedUuid = (id: string) => id.slice(CURATED_PREFIX.length);
