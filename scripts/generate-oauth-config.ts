import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputPath = resolve(process.cwd(), "build", "oauth-config.json");
const clientId = process.env.GOOGLE_CLIENT_ID?.trim();

if (!clientId) {
  throw new Error(
    "Missing GOOGLE_CLIENT_ID. Put it in the project root .env or export it before building."
  );
}

const config = { clientId };

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");

console.log(`Wrote OAuth config with client ID to ${outputPath}`);
