import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, chownSync } from "node:fs";
import path from "node:path";
import pg from "pg";

/** Starts a throwaway Postgres, loads the Supabase stubs and every migration, and hands the tests its address. */
function findBin(name: string): string | null {
  const roots = ["/usr/lib/postgresql", "/opt/homebrew/opt/postgresql@16/bin", "/usr/local/opt/postgresql@16/bin", "/usr/local/bin", "/usr/bin"];
  for (const r of roots) {
    if (r === "/usr/lib/postgresql" && existsSync(r)) {
      for (const v of readdirSync(r).sort().reverse()) { const p = path.join(r, v, "bin", name); if (existsSync(p)) return p; }
    } else { const p = path.join(r, name); if (existsSync(p)) return p; }
  }
  return null;
}

let dir = "";
let asPostgres: (args: string[]) => void = () => {};

export async function setup({ provide }: { provide: (k: string, v: unknown) => void }) {
  const initdb = findBin("initdb"), pgCtl = findBin("pg_ctl");
  if (!initdb || !pgCtl) throw new Error("Postgres server binaries (initdb, pg_ctl) were not found. Install PostgreSQL 14+ to run npm run test:db.");
  dir = mkdtempSync(path.join(process.env.PGTEST_DIR ?? "/var/tmp", "ridedeck-pg-"));
  const root = process.getuid?.() === 0; // Postgres refuses to run as root: use the postgres user
  if (root) chownSync(dir, Number(execFileSync("id", ["-u", "postgres"]).toString()), Number(execFileSync("id", ["-g", "postgres"]).toString()));
  asPostgres = (args) => {
    const r = root ? spawnSync("su", ["postgres", "-s", "/bin/bash", "-c", args.map((a) => `'${a}'`).join(" ")], { encoding: "utf8" }) : spawnSync(args[0], args.slice(1), { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`${args[0]} failed: ${r.stderr || r.stdout}`);
  };
  const port = 54000 + Math.floor(Math.random() * 900);
  asPostgres([initdb, "-D", path.join(dir, "data"), "-A", "trust", "-U", "postgres"]);
  asPostgres([pgCtl, "-D", path.join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=`, "-l", path.join(dir, "log"), "-w", "start"]);

  const c = new pg.Client({ host: dir, port, user: "postgres", database: "postgres" });
  await c.connect();
  const sql = (f: string) => readFileSync(path.join(__dirname, "..", f), "utf8");
  await c.query(sql("tests/stubs.sql"));
  for (const f of readdirSync(path.join(__dirname, "..", "migrations")).filter((x) => x.endsWith(".sql")).sort()) {
    if (f.startsWith("0003")) continue; // needs the backfill first: the tests run it themselves
    await c.query(sql(`migrations/${f}`));
  }
  await c.end();
  provide("pg", { host: dir, port });
}

export async function teardown() {
  if (!dir) return;
  try { asPostgres([findBin("pg_ctl") as string, "-D", path.join(dir, "data"), "-m", "immediate", "stop"]); } catch { /* already stopped */ }
  rmSync(dir, { recursive: true, force: true });
}

declare module "vitest" { export interface ProvidedContext { pg: { host: string; port: number } } }
