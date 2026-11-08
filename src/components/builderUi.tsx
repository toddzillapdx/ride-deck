"use client";
import type { ReactNode } from "react";

export const field = "h-11 rounded-[12px] border-2 border-line bg-ground px-3 text-[15px] font-normal text-ink outline-none focus:border-ice";
export const label = "text-[14px] font-medium uppercase tracking-[.14em] text-mist";
export const ctl = "flex h-11 w-11 items-center justify-center rounded-full border-2 border-line text-[18px] text-ink disabled:opacity-30";
export const pill = "h-11 rounded-full border-2 border-line px-5 text-[14px] font-normal text-ink";

export function Labeled({ text, children }: { text: string; children: ReactNode }) {
  return <label className="flex min-w-0 flex-none flex-col gap-[6px]"><span className={label}>{text}</span>{children}</label>;
}

export function Num({ v, on, w = 60, ph }: { v: string; on: (v: string) => void; w?: number; ph?: string }) {
  return <input className={`${field} px-2 text-center`} style={{ width: w }} value={v} onChange={(e) => on(e.target.value)} inputMode="numeric" placeholder={ph} />;
}

export function Pair({ text, a, b, on, ph = ["min", "max"] }: { text: string; a: string; b: string; on: (a: string, b: string) => void; ph?: [string, string] }) {
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-[14px] font-medium uppercase tracking-[.1em] text-mist">{text}</span>
      <Num v={a} on={(v) => on(v, b)} w={52} ph={ph[0]} /><span className="text-mist">–</span><Num v={b} on={(v) => on(a, v)} w={52} ph={ph[1]} />
    </div>
  );
}

/** A row of buttons where exactly one is lit, so the choice is visible without opening a menu. */
export function Choice<T extends string>({ value, options, on, aria }: { value: T; options: { v: T; text: string; sub?: string }[]; on: (v: T) => void; aria: string }) {
  return (
    <div role="group" aria-label={aria} className="flex gap-1 rounded-full border-2 border-line p-1">
      {options.map((o) => (
        <button key={o.v} aria-pressed={value === o.v} onClick={() => on(o.v)}
          className={`h-9 rounded-full px-4 text-[14px] font-medium ${value === o.v ? "bg-ice text-ground" : "text-mist"}`}>{o.text}{o.sub && <span className={`ml-2 font-light ${value === o.v ? "text-ground" : "text-mist"}`}>{o.sub}</span>}</button>
      ))}
    </div>
  );
}

export function MultiChips({ text, hint, options, value, on, disabled }: { text: string; hint: string; options: readonly string[]; value: string[]; on: (v: string[]) => void; disabled?: boolean }) {
  return (
    <div className={`flex flex-none flex-col gap-2 ${disabled ? "opacity-40" : ""}`}>
      <span className={label}>{text} <span className="normal-case tracking-normal">· {hint}</span></span>
      <div className="flex flex-wrap gap-[6px]">
        {options.map((o) => {
          const sel = value.includes(o);
          return <button key={o} aria-pressed={sel} disabled={disabled} onClick={() => on(sel ? value.filter((x) => x !== o) : [...value, o])}
            className={`rounded-full text-[14px] ${sel ? "bg-ice px-[13px] py-[8px] font-medium text-ground" : "border-2 border-line px-[11px] py-[6px] text-ink"}`}>{o}</button>;
        })}
      </div>
    </div>
  );
}

export function Chips({ text, options, value, on }: { text: string; options: readonly string[]; value: string; on: (v: string) => void }) {
  return (
    <div className="flex flex-none flex-col gap-2">
      <span className={label}>{text}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => <button key={o} onClick={() => on(o)} className={`rounded-full text-[14px] ${o === value ? "bg-ice px-[13px] py-[8px] font-medium text-ground" : "border-2 border-line px-[11px] py-[6px] text-ink"}`}>{o}</button>)}
      </div>
    </div>
  );
}

export function Icon({ text, on, children, active, disabled }: { text: string; on: () => void; children: ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button aria-label={text} title={text} onClick={on} disabled={disabled}
      className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-[16px] disabled:opacity-30 ${active ? "border-ice bg-ice text-ground" : "border-line text-ink"}`}>{children}</button>
  );
}
