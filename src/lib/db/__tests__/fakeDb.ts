/** A tiny in-memory stand-in for the part of the Supabase query builder the data layer uses. Per-schema tables, no network. */
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null };

export class FakeDb {
  tables = new Map<string, Row[]>();
  /** Every call, for call-count assertions: "select rides", "upsert songs", ... */
  calls: string[] = [];
  failWith: string | null = null;
  private seq = 0;
  constructor(readonly schema = "public") {}

  table(name: string): Row[] {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name)!;
  }
  seed(name: string, rows: Row[]) { this.table(name).push(...rows.map((r) => ({ ...r }))); return this; }

  from(name: string) { return new Query(this, name); }
  nextId() { return `00000000-0000-4000-8000-${String(++this.seq).padStart(12, "0")}`; }
  asClient() { return this as unknown as SupabaseClient; }
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private filters: ((r: Row) => boolean)[] = [];
  private sort: { col: string; asc: boolean } | null = null;
  private window: [number, number] | null = null;
  private returning = false;
  private mode: "many" | "single" | "maybe" = "many";
  private conflict = "id";

  constructor(private db: FakeDb, private name: string) {}

  select(_cols = "*") { if (this.op === "select") { this.op = "select"; } else this.returning = true; return this; }
  insert(row: Row | Row[]) { this.op = "insert"; this.payload = row; return this; }
  update(patch: Row) { this.op = "update"; this.payload = patch; return this; }
  upsert(row: Row | Row[], opts?: { onConflict?: string }) { this.op = "upsert"; this.payload = row; this.conflict = opts?.onConflict ?? "id"; return this; }
  delete() { this.op = "delete"; return this; }
  eq(col: string, v: unknown) { this.filters.push((r) => r[col] === v); return this; }
  in(col: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[col])); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.sort = { col, asc: o?.ascending !== false }; return this; }
  range(a: number, b: number) { this.window = [a, b]; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, no?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, no);
  }

  private run(): Result {
    this.db.calls.push(`${this.op} ${this.name}`);
    if (this.db.failWith) return { data: null, error: { message: this.db.failWith } };
    const rows = this.db.table(this.name);
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[] = [];
    if (this.op === "select") {
      out = rows.filter(match).map((r) => ({ ...r }));
      if (this.sort) { const { col, asc } = this.sort; out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1)); }
      if (this.window) out = out.slice(this.window[0], this.window[1] + 1);
    } else if (this.op === "insert") {
      for (const p of [this.payload].flat() as Row[]) {
        const row: Row = { ...p };
        if (this.name === "rides" || this.name === "ride_logs") row.id ??= this.db.nextId();
        rows.push(row); out.push({ ...row });
      }
    } else if (this.op === "upsert") {
      for (const p of [this.payload].flat() as Row[]) {
        const i = rows.findIndex((r) => r[this.conflict] === p[this.conflict]);
        if (i >= 0) rows[i] = { ...rows[i], ...p }; else rows.push({ ...p });
        out.push({ ...(i >= 0 ? rows[i] : p) });
      }
    } else if (this.op === "update") {
      for (const r of rows) if (match(r)) { Object.assign(r, this.payload as Row); out.push({ ...r }); }
    } else {
      const keep: Row[] = [];
      for (const r of rows) (match(r) ? out : keep).push(r);
      this.db.tables.set(this.name, keep);
      out = out.map((r) => ({ ...r }));
    }
    const wantsRows = this.op === "select" || this.returning;
    if (!wantsRows) return { data: null, error: null };
    if (this.mode === "many") return { data: out, error: null };
    if (this.mode === "maybe") return { data: out[0] ?? null, error: null };
    return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: "Row not found" } };
  }
}
