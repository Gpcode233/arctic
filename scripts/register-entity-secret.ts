/**
 * One-time entity secret registration script.
 * Run: bun run scripts/register-entity-secret.ts
 * Requires CIRCLE_API_KEY in .env.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

// Read .env manually (bun does not auto-load .env for scripts)
const envPath = path.join(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
}

const apiKey = process.env.CIRCLE_API_KEY;
if (!apiKey) {
  console.error("CIRCLE_API_KEY not found in .env");
  process.exit(1);
}

// Check entity secret is not already registered
if (process.env.CIRCLE_ENTITY_SECRET?.length === 64) {
  console.error("CIRCLE_ENTITY_SECRET already exists in .env — aborting to avoid overwriting.");
  console.error("If you need to rotate, use the Circle Console.");
  process.exit(1);
}

// 1. Generate secret
const entitySecret = crypto.randomBytes(32).toString("hex");

// 2. Register ciphertext and save recovery file
const recoveryDir = "/home/user/app/.circle";
fs.mkdirSync(recoveryDir, { recursive: true });

console.log("Registering entity secret with Circle...");
const response = await registerEntitySecretCiphertext({
  apiKey,
  entitySecret,
  recoveryFileDownloadPath: recoveryDir,
});

const recoveryPath = path.join(recoveryDir, "recovery_file.dat");
if (response.data?.recoveryFile) {
  fs.writeFileSync(recoveryPath, response.data.recoveryFile);
  console.log("Recovery file written to .circle/recovery_file.dat");
} else {
  console.error("Warning: no recovery file data returned — check Circle response");
}

// 3. Append to .env
fs.appendFileSync(envPath, `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`, "utf-8");
console.log("CIRCLE_ENTITY_SECRET appended to .env");

// 4. Verify
process.env.CIRCLE_ENTITY_SECRET = entitySecret;
const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
await client.listWalletSets({ pageSize: 1 });
console.log("Verification OK — entity secret is registered and working.");
console.log("REGISTRATION COMPLETE");
