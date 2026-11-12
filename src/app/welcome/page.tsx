"use client";
import { useState } from "react";
import { isPlausibleEmail, normalizeEmail } from "@/lib/auth/email";

const input = "h-14 w-full rounded-[14px] border-2 border-line bg-tile px-4 text-[18px] text-ink outline-none focus:border-ice";

const POINTS = [
  ["Pick the music first", "Choose a style and a ride length. RideDeck picks the songs and looks up their real lengths."],
  ["The ride fits the songs", "Warm-up, hills and intervals line up with each song, so a change always lands on a beat."],
  ["Just ride", "Big cadence and effort targets, a clear warning before each change, and no sound at all. Your music plays in your own app."],
];

/** What a signed-out visitor sees at the main address: what RideDeck is, sign in for the invited, a form to ask for an invite. */
export default function Welcome() {
  const [ask, setAsk] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [trap, setTrap] = useState(""); // a hidden field only bots fill in
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const e = normalizeEmail(email);
    if (!isPlausibleEmail(e)) { setErr("Enter a valid email address."); return; }
    setState("sending"); setErr(null);
    try {
      const res = await fetch("/api/invite-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, note, website: trap }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body.error ?? "Couldn't send that. Try again."); setState("idle"); return; }
      setState("done");
    } catch { setErr("No connection. Try again."); setState("idle"); }
  }

  return (
    <main className="flex min-h-[100dvh] justify-center bg-ground px-5 text-ink" style={{ paddingTop: "max(40px, env(safe-area-inset-top))", paddingBottom: "max(40px, env(safe-area-inset-bottom))" }}>
      <div className="flex w-full max-w-[460px] flex-col gap-8 self-center">
        <div className="flex flex-col gap-3">
          <span className="text-[40px] font-light uppercase leading-none" style={{ letterSpacing: ".02em" }}>RideDeck</span>
          <span className="text-[19px] font-light leading-snug text-mist">A ride coach for your indoor bike. Music first, then a ride built to match it.</span>
          <span className="w-fit rounded-full border-2 border-line px-3 py-[2px] text-[14px] text-ice">Private beta</span>
        </div>

        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {POINTS.map(([title, body]) => (
            <li key={title} className="flex flex-col gap-1">
              <span className="text-[17px] font-normal">{title}</span>
              <span className="text-[15px] font-light leading-snug text-mist">{body}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3">
          <a href="/login" className="flex h-14 items-center justify-center rounded-full bg-ice text-[17px] font-medium text-ground">Sign in</a>
          <span className="text-center text-[14px] text-mist">Already invited? Sign in with your email.</span>
        </div>

        <section className="flex flex-col gap-3 rounded-[18px] border-2 border-line bg-tile p-5" aria-label="Request an invite">
          {state === "done" ? (
            <p className="m-0 text-[16px] leading-snug">Thanks. We've got your request. If there's a spot for you, you'll get an email, and then you can sign in with that address.</p>
          ) : !ask ? (
            <>
              <span className="text-[17px]">Not invited yet?</span>
              <button onClick={() => setAsk(true)} className="h-12 rounded-full border-2 border-ice text-[16px] font-medium text-ice">Request an invite</button>
            </>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <span className="text-[17px]">Request an invite</span>
              <input className={input} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" aria-label="Your email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <textarea className={`${input} h-24 py-3 text-[16px]`} maxLength={300} placeholder="How do you ride? (optional)" aria-label="How do you ride" value={note} onChange={(e) => setNote(e.target.value)} />
              <input tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={trap} onChange={(e) => setTrap(e.target.value)} style={{ position: "absolute", left: "-9999px", height: 0, width: 0, opacity: 0 }} />
              <button type="submit" disabled={state === "sending" || !email.trim()} className="h-12 rounded-full bg-ice text-[16px] font-medium text-ground disabled:opacity-40">{state === "sending" ? "Sending…" : "Send request"}</button>
              <p className="m-0 text-[14px] leading-snug text-mist">We only use your email to invite you. No spam, and we never share it.</p>
            </form>
          )}
          {err && <p className="m-0 text-[15px] leading-snug text-ice" role="alert">{err}</p>}
        </section>
      </div>
    </main>
  );
}
