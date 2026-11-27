"use client";
import { useState } from "react";
import { isPlausibleEmail, normalizeEmail } from "@/lib/auth/email";
import { LogoHero, Wordmark } from "@/components/Logo";
import type { RequestService } from "@/lib/admin/console";

const input = "h-14 w-full rounded-[14px] border-2 border-line bg-tile px-4 text-[18px] text-ink outline-none focus:border-ice";

const STEPS = [
  ["Pick a ride", "Every ride is built around a playlist and timed to its songs, so each change lands on a beat."],
  ["Open the playlist", "It opens in your own music app, Spotify or Amazon Music. RideDeck plays no audio."],
  ["Start both together", "Press play, start the ride, and follow big cadence and effort targets with a warning before each change."],
];

const SERVICES: [RequestService, string][] = [["spotify", "Spotify"], ["amazon", "Amazon Music"], ["apple", "Apple Music"], ["other", "Something else"]];
const chip = (on: boolean) => `flex h-12 flex-1 items-center justify-center rounded-full px-3 text-[15px] ${on ? "bg-ice font-medium text-ground" : "border-2 border-line text-ink"}`;

/** What a signed-out visitor sees at the main address: what RideDeck is, sign in for the invited, a form to ask for an invite. */
export default function Welcome() {
  const [ask, setAsk] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [service, setService] = useState<RequestService | null>(null);
  const [song, setSong] = useState("");
  const [trap, setTrap] = useState(""); // a hidden field only bots fill in
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const e = normalizeEmail(email);
    if (!isPlausibleEmail(e)) { setErr("Enter a valid email address."); return; }
    if (!service) { setErr("Choose the music service you use."); return; }
    if (!song.trim()) { setErr("Tell us one song you love to ride to."); return; }
    setState("sending"); setErr(null);
    try {
      const res = await fetch("/api/invite-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, note, service, favoriteSong: song, website: trap }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body.error ?? "Couldn't send that. Try again."); setState("idle"); return; }
      setState("done");
    } catch { setErr("No connection. Try again."); setState("idle"); }
  }

  return (
    <main className="flex h-[100dvh] justify-center overflow-y-auto bg-ground px-5 text-ink" style={{ paddingTop: "max(40px, env(safe-area-inset-top))", paddingBottom: "max(40px, env(safe-area-inset-bottom))" }}>
      <div className="flex w-full max-w-[460px] flex-col gap-8 my-auto">
        <div className="flex flex-col items-center gap-5 text-center">
          <LogoHero className="max-w-[260px] sm:max-w-[420px]" />
          <Wordmark size={40} />
          <span className="w-fit rounded-full border-2 border-line px-3 py-[2px] text-[14px] text-ice">Private beta</span>
          <span className="text-[26px] font-light leading-tight">You're invited to test RideDeck</span>
          <span className="text-[17px] font-light leading-snug text-mist">A ride coach for your indoor bike. Rides built around playlists you already know, timed song by song. We're opening a small beta and would love your help.</span>
        </div>

        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="flex flex-col gap-1">
              <span className="text-[17px] font-normal"><span className="text-ice">{i + 1}.</span> {title}</span>
              <span className="text-[15px] font-light leading-snug text-mist">{body}</span>
            </li>
          ))}
        </ul>

        <section className="flex flex-col gap-3 rounded-[18px] border-2 border-line bg-tile p-5" aria-label="Request an invite">
          {state === "done" ? (
            <p className="m-0 text-[16px] leading-snug">Thanks. We've got your request. If there's a spot for you, you'll get an email, and then you can sign in with that address.</p>
          ) : !ask ? (
            <>
              <span className="text-[17px]">Join the beta</span>
              <span className="text-[15px] font-light leading-snug text-mist">Tell us what you ride with and one song you love. We'll build a ride around it.</span>
              <button onClick={() => setAsk(true)} className="h-12 rounded-full bg-ice text-[16px] font-medium text-ground">Request a beta invite</button>
            </>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <span className="text-[17px]">Request a beta invite</span>
              <input className={input} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" aria-label="Your email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <span className="text-[15px] text-mist">Which music service do you use?</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Music service">
                {SERVICES.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={service === v} onClick={() => setService(v)} className={`${chip(service === v)} min-w-[44%]`}>{l}</button>)}
              </div>
              <input className={input} maxLength={150} placeholder="One song you love to ride to (Artist - Song)" aria-label="A song you love to ride to" value={song} onChange={(e) => setSong(e.target.value)} />
              <textarea className={`${input} h-24 py-3 text-[16px]`} maxLength={300} placeholder="How do you ride? (optional)" aria-label="How do you ride" value={note} onChange={(e) => setNote(e.target.value)} />
              <input tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={trap} onChange={(e) => setTrap(e.target.value)} style={{ position: "absolute", left: "-9999px", height: 0, width: 0, opacity: 0 }} />
              <button type="submit" disabled={state === "sending" || !email.trim()} className="h-12 rounded-full bg-ice text-[16px] font-medium text-ground disabled:opacity-40">{state === "sending" ? "Sending…" : "Send request"}</button>
              <p className="m-0 text-[14px] leading-snug text-mist">We use this only to invite you and pick your first ride. No spam, and we never share it. <a href="/privacy" className="text-ice underline underline-offset-4">Privacy</a></p>
            </form>
          )}
          {err && <p className="m-0 text-[15px] leading-snug text-ice" role="alert">{err}</p>}
        </section>

        <div className="flex flex-col gap-3">
          <a href="/login" className="flex h-14 items-center justify-center rounded-full bg-ice text-[17px] font-medium text-ground">Sign in</a>
          <span className="text-center text-[14px] text-mist">Already invited? Sign in with your email.</span>
        </div>


        <p className="m-0 text-center text-[14px] text-mist"><a href="/privacy" className="underline underline-offset-4">Privacy</a></p>
      </div>
    </main>
  );
}
