const p = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export function HandIcon({ size = 20, color = "currentColor", stroke = 2 }: { size?: number; color?: string; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} strokeWidth={stroke} {...p}>
      <path d="M9 11V5a2 2 0 0 1 4 0v6" />
      <path d="M13 9a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2-4a2 2 0 0 1 3-2l2 2" />
    </svg>
  );
}

export function NoteIcon({ size = 24, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} strokeWidth={2} {...p}>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  );
}
