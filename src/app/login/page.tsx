"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authConfigured } from "@/lib/auth/config";
import { browserClient } from "@/lib/auth/browser";
import { cleanCode, isCompleteCode, isPlausibleEmail, normalizeEmail, safeNext } from "@/lib/auth/email";

const input = "h-14 w-full rounded-[14px] border-2 border-line bg-tile px-4 text-[18px] text-ink outline-none focus:border-ice";
const primary = "h-14 w-full rounded-full bg-ice text-[17px] font-medium text-ground disabled:opacity-40";
const quiet = "text-[15px] text-mist underline underline-offset-4";

function SignIn() {
  const next = safeNext(useSearchParams().get("next"));
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [wait, setWait] = useState(0);
  const [me, setMe] = useState<string | null | undefined>(undefined); // undefined: checking
  const codeRef = useRef<HTMLInputElement>(null);
  const on = authConfigured();

  useEffect(() => {
    const c = browserClient();
    if (!c) { setMe(null); return; }
    c.auth.getUser().then(({ data }) => setMe(data.user?.email ?? null)).catch(() => setMe(null));
  }, []);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);
  useEffect(() => { if (step === "code") codeRef.current?.focus(); }, [step]);

  async function sendCode() {
    const e = normalizeEmail(email);
    if (!isPlausibleEmail(e)) { setMsg({ text: "Enter a valid email address.", bad: true }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/auth/request-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ text: body.error ?? "Couldn't send a code. Try again.", bad: true }); return; }
      setEmail(e); setStep("code"); setCode(""); setWait(60);
      setMsg({ text: `If ${e} is on the invite list, a 6-digit code is on its way. It can take a minute.` });
    } catch { setMsg({ text: "No connection. Try again.", bad: true }); }
    finally { setBusy(false); }
  }

  const verify = useCallback(async (c: string) => {
    const client = browserClient();
    if (!client || !isCompleteCode(c)) return;
    setBusy(true); setMsg(null);
    const { error } = await client.auth.verifyOtp({ email, token: c, type: "email" });
    if (error) { setBusy(false); setCode(""); setMsg({ text: "That code didn't work. Check it, or ask for a new one.", bad: true }); codeRef.current?.focus(); return; }
    window.location.href = next; // a full load, so the server sees the new session
  }, [email, next]);

  async function signOut() {
    await browserClient()?.auth.signOut();
    setMe(null); setStep("email"); setMsg(null);
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-ground px-5 py-10 text-ink" style={{ paddingTop: "max(40px, env(safe-area-inset-top))", paddingBottom: "max(40px, env(safe-area-inset-bottom))" }}>
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-[34px] font-light uppercase leading-none" style={{ letterSpacing: ".02em" }}>RideDeck</span>
          <span className="text-[15px] font-light text-mist">{step === "code" ? "Enter your code" : "Sign in with your email"}</span>
        </div>

        {!on ? (
          <p className="m-0 text-[16px] leading-snug text-ice">Accounts aren't set up on this deployment yet.</p>
        ) : me === undefined ? (
          <p className="m-0 text-[16px] text-mist">Checking…</p>
        ) : me ? (
          <div className="flex flex-col gap-4">
            <p className="m-0 text-[16px] leading-snug">You're signed in as <span className="text-ice">{me}</span>.</p>
            <a href={next} className="flex h-14 items-center justify-center rounded-full bg-ice text-[17px] font-medium text-ground">Open RideDeck</a>
            <button onClick={signOut} className={quiet}>Sign out</button>
          </div>
        ) : step === "email" ? (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
            <input className={input} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              placeholder="you@example.com" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit" disabled={busy || !email.trim()} className={primary}>{busy ? "Sending…" : "Email me a code"}</button>
            <p className="m-0 text-[14px] leading-snug text-mist">RideDeck is invite-only for now. We'll email you a 6-digit code, so there's no password to remember.</p>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <input ref={codeRef} className={`${input} text-center text-[28px] tracking-[.4em]`} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={14}
              placeholder="······" aria-label="6-digit code" value={code}
              onChange={(e) => { const c = cleanCode(e.target.value); setCode(c); if (isCompleteCode(c)) void verify(c); }} />
            <button onClick={() => void verify(code)} disabled={busy || !isCompleteCode(code)} className={primary}>{busy ? "Checking…" : "Sign in"}</button>
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => { setStep("email"); setMsg(null); }} className={quiet}>Use a different email</button>
              <button onClick={() => void sendCode()} disabled={wait > 0 || busy} className={`${quiet} disabled:no-underline disabled:opacity-50`}>{wait > 0 ? `Send again in ${wait}s` : "Send a new code"}</button>
            </div>
          </div>
        )}

        {msg && <p className={`m-0 text-[15px] leading-snug ${msg.bad ? "text-ice" : "text-mist"}`} role={msg.bad ? "alert" : "status"}>{msg.text}</p>}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><SignIn /></Suspense>;
}
