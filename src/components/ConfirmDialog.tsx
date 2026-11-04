"use client";

/**
 * In-app confirm, used instead of the browser's pop-up (which behaves badly in an installed home-screen app).
 * `fixed` for the phone layouts; omit it inside the 1280x800 canvas, which is transformed and positions children itself.
 */
export default function ConfirmDialog({ title, body, confirmLabel = "Delete", busy, onConfirm, onCancel, fixed }: {
  title: string; body?: string; confirmLabel?: string; busy?: boolean; onConfirm: () => void; onCancel: () => void; fixed?: boolean;
}) {
  return (
    <div
      className={`${fixed ? "fixed" : "absolute"} inset-0 z-50 flex items-center justify-center bg-ground/90 p-5`}
      onClick={onCancel} role="dialog" aria-modal="true" aria-label={title}
    >
      <div className="flex w-full max-w-[460px] flex-col gap-4 rounded-[24px] border-2 border-line bg-tile p-6 text-ink" onClick={(e) => e.stopPropagation()}>
        <span className="text-[20px] font-normal leading-snug">{title}</span>
        {body && <span className="text-[14px] font-light leading-snug text-mist">{body}</span>}
        <div className="flex gap-3 pt-1">
          <button onClick={onCancel} className="h-[52px] flex-1 rounded-full border-2 border-line text-[16px] font-medium text-ink">Cancel</button>
          <button onClick={onConfirm} disabled={busy} className="h-[52px] flex-1 rounded-full bg-ice text-[16px] font-medium text-ground disabled:opacity-50">{busy ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
