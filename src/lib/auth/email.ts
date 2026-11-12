/** Pure helpers for the sign-in form. Shared by the screen and the server route. */

export const normalizeEmail = (raw: unknown): string => (typeof raw === "string" ? raw.trim().toLowerCase() : "");

/** Good enough to catch typos; the real check is that the email can receive the code. */
export const isPlausibleEmail = (e: string): boolean => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/** The code the person typed or pasted, digits only ("123 456" and "123-456" both work). */
export const cleanCode = (raw: string): string => raw.replace(/\D/g, "").slice(0, 6);
export const isCompleteCode = (c: string): boolean => /^\d{6}$/.test(c);

/** Only ever send people to a path inside the app after signing in. */
export const safeNext = (raw: string | null | undefined): string => (raw && /^\/(?![/\\])/.test(raw) ? raw : "/");
