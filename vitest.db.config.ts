import { defineConfig } from "vitest/config";

/** Database tests: run the SQL migrations on a throwaway local Postgres. `npm run test:db` */
export default defineConfig({
  test: { include: ["supabase/tests/**/*.test.ts"], environment: "node", globalSetup: ["supabase/tests/globalSetup.ts"], testTimeout: 30000, hookTimeout: 60000, fileParallelism: false },
});
