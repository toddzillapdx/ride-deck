"use client";
import { useEffect, useState } from "react";
import { parseKcal } from "@/lib/history";

/** Calories typed in from the Peloton screen. Blank clears it. */
export default function KcalField({ value, save, disabled, hint }: {
  value?: number;
  save: (kcal: number | null) => Promise<void>;
  disabled?: boolean;
  hint?: string;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState("");
  // Follow the saved value, but leave the status alone: a successful save updates `value`, and must keep showing "Saved".
  useEffect(() => { setText(value === undefined ? "" : String(value)); }, [value]);

  async function submit() {
    let kcal: number | null;
    try { kcal = parseKcal(text); } catch (e) { setErr((e as Error).message); setState("error"); return; }
    setState("saving"); setErr("");
    try { await save(kcal); setState("saved"); }
    catch (e) { setErr((e as Error).message); setState("error"); }
  }

  const dirty = text.trim() !== (value === undefined ? "" : String(value));
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[13px] font-medium uppercase tracking-[.18em] text-mist" htmlFor="kcal">Calories (kcal)</label>
      <div className="flex items-center gap-3">
        <input
          id="kcal" value={text} inputMode="numeric" placeholder="e.g. 312" disabled={disabled}
          onChange={(e) => { setText(e.target.value); setState("idle"); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="h-[60px] w-[170px] rounded-[16px] border-2 border-line bg-ground px-4 text-[30px] font-light text-ink outline-none focus:border-ice disabled:opacity-40"
          style={{ fontVariantNumeric: "tabular-nums" }}
        />
        <button onClick={submit} disabled={disabled || state === "saving" || (!dirty && state !== "error")}
          className="h-[60px] rounded-full bg-ice px-7 text-[16px] font-medium text-ground disabled:opacity-40">
          {state === "saving" ? "Saving…" : state === "saved" && !dirty ? "Saved ✓" : "Save"}
        </button>
      </div>
      <span className={`min-h-[20px] text-[14px] ${state === "error" ? "text-ice" : "text-mist"}`}>
        {state === "error" ? err : hint ?? "Read it off the Peloton screen"}
      </span>
    </div>
  );
}
