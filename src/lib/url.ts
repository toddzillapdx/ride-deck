/** First http(s) link in a block of text, minus trailing punctuation. "" if there isn't one. */
export function extractUrl(text: string): string {
  const m = text.match(/https?:\/\/[^\s<>"')\]]+/i);
  return m ? m[0].replace(/[.,;:!?]+$/, "") : "";
}

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** For a link field: paste a whole chat reply and keep just the link. Typing is left alone. */
export function pasteLink(e: { clipboardData: DataTransfer; preventDefault: () => void }, set: (v: string) => void): void {
  const url = extractUrl(e.clipboardData.getData("text"));
  if (url) { e.preventDefault(); set(url); }
}
