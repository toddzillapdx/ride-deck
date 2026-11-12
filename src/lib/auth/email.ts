/** Pure helpers for the sign-in form. Shared by the screen and the server route. */

export const normalizeEmail = (raw: unknown): string => (typeof raw === "string" ? raw.trim().toLowerCase() : "");

/** Good enough to catch typos; the real check is that the email can receive the code. */
export const isPlausibleEmail = (e: string): boolean => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/**
 * How long the emailed code is. Supabase sends 8 digits by default (you can change it in Authentication, Email, OTP length);
 * set NEXT_PUBLIC_OTP_LENGTH to match if you change it. The box submits by itself at this length.
 */
export const OTP_LENGTH = Number(process.env.NEXT_PUBLIC_OTP_LENGTH) || 8;

/** The code the person typed or pasted, digits only ("1234 5678" and "1234-5678" both work). Never cut shorter than a real code. */
export const cleanCode = (raw: string): string => raw.replace(/\D/g, "").slice(0, 10);
/** Anything between 6 and 10 digits can be tried with the button, whatever length the project is set to. */
export const isCompleteCode = (c: string): boolean => /^\d{6,10}$/.test(c);

/** Only ever send people to a path inside the app after signing in. */
export const safeNext = (raw: string | null | undefined): string => (raw && /^\/(?![/\\])/.test(raw) ? raw : "/");
