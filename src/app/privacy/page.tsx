import { LogoMark, Wordmark } from "@/components/Logo";

export const metadata = { title: "Privacy · RideDeck" };

const SECTIONS: [string, string[]][] = [
  ["What we collect", [
    "Your email address, so we can invite you and send you a sign-in code. There is no password.",
    "When you ask for an invite: the music service you use, one song you love to ride to, and anything you choose to tell us about how you ride.",
    "Which music service you pick in the app, and when you start and finish rides (which ride, and the times). We use this to see which rides get used.",
    "Your ride history, so you can see what you rode.",
  ]],
  ["What we don't do", [
    "We don't sell your information or share it for advertising. There are no ads and no trackers.",
    "RideDeck plays no audio. Your music stays in your own music app, and we never see your music account.",
    "We don't collect your location, contacts, health data or payment details.",
  ]],
  ["How we use it", [
    "To let you sign in, to build rides you'll enjoy, and to decide what to improve. During the beta the person running RideDeck can see who has signed up, which service they use, and which rides were started.",
  ]],
  ["Who handles it for us", [
    "Your data is stored with Supabase (database and sign-in), the app is hosted on Vercel, and sign-in and invitation emails are sent through Resend. They process it only to run RideDeck.",
    "Your browser keeps a sign-in session, and remembers small settings such as your chosen music service. These are not used for tracking.",
  ]],
  ["Your choices", [
    "To see, correct or delete your data, or to leave the beta, email hello@ridedeck.app. We'll remove your account and rides.",
  ]],
];

/** Plain-language privacy note, open to everyone (signed in or not). */
export default function Privacy() {
  return (
    <main className="h-[100dvh] overflow-y-auto bg-ground px-5 text-ink" style={{ paddingTop: "max(28px, env(safe-area-inset-top))", paddingBottom: "max(40px, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
        <a href="/" aria-label="RideDeck home" className="flex items-center gap-2"><LogoMark size={30} /><Wordmark size={18} /></a>
        <h1 className="m-0 text-[26px] font-light uppercase" style={{ letterSpacing: ".02em" }}>Privacy</h1>
        <p className="m-0 text-[16px] font-light leading-snug text-mist">RideDeck is in a small private beta. This is what we collect and why, in plain words. Last updated 27 November 2026.</p>
        {SECTIONS.map(([h, items]) => (
          <section key={h} className="flex flex-col gap-2">
            <h2 className="m-0 text-[18px] font-normal">{h}</h2>
            <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
              {items.map((t) => <li key={t} className="text-[16px] font-light leading-snug text-ink">{t}</li>)}
            </ul>
          </section>
        ))}
        <p className="m-0 text-[16px] font-light leading-snug text-mist">Questions? Email <a href="mailto:hello@ridedeck.app" className="text-ice underline underline-offset-4">hello@ridedeck.app</a>.</p>
        <a href="/" className="self-start text-[14px] text-mist underline underline-offset-4">← Back</a>
      </div>
    </main>
  );
}
