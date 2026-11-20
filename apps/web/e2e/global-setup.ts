import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/** Baza de test e resetată și re-populată cu date mock înainte de fiecare rulare e2e. */
export default function globalSetup() {
  const root = resolve(__dirname, "../../..");
  const env = { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/storyforge_test" };
  if (!/_test(\?|$)/.test(env.DATABASE_URL!)) throw new Error("E2E rulează doar pe o bază al cărei nume se termină în _test");
  // migrate deploy nu șterge nimic; seed-ul înlocuiește doar date [MOCK] (vezi garda din seed).
  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: root, env, stdio: "inherit" });
  // baza e verificată mai sus ca fiind de test (_test): golirea e permisă explicit
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { cwd: root, env: { ...env, SEED_ALLOW_WIPE: "1" }, stdio: "inherit" });
}
