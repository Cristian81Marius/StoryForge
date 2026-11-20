import { hashPassword } from "../lib/password";

const p = process.argv[2];
if (!p) {
  console.error("Folosire: npm run -s hash-password -w @storyforge/web -- 'parola'");
  process.exit(1);
}
console.log(hashPassword(p));
