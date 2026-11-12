/** Weekly use of the song planner. A full "Plan songs" costs a plan; a one-song swap or add costs a swap. Server-side. */
const limit = (name: string, fallback: number) => { const n = Number(process.env[name]); return Number.isInteger(n) && n > 0 ? n : fallback; };
export const PLAN_LIMIT = () => limit("PLAN_WEEKLY_LIMIT", 5);
export const SWAP_LIMIT = () => limit("SWAP_WEEKLY_LIMIT", 30);
