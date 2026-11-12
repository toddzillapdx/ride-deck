/**
 * Sign-in settings. These two values are meant for the browser (they are not secrets), so they use the NEXT_PUBLIC_ names.
 * Next.js only inlines them when written exactly like this. When they are missing, accounts are simply "off" and the
 * app behaves as it always has.
 */
export const authUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const authKey = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const authConfigured = () => Boolean(authUrl() && authKey());
