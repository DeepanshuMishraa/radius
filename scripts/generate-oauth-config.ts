import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputPath = resolve(process.cwd(), "build", "oauth-config.json");
const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const shouldBundleSecret =
  process.env.BUNDLE_GOOGLE_CLIENT_SECRET?.trim().toLowerCase() === "true";

if (!clientId) {
  throw new Error(
    "Missing GOOGLE_CLIENT_ID. Put it in the project root .env or export it before building."
  );
}

if (shouldBundleSecret && !clientSecret) {
  throw new Error(
    "BUNDLE_GOOGLE_CLIENT_SECRET=true was set, but GOOGLE_CLIENT_SECRET is missing."
  );
}

const config = {
  clientId,
  ...(shouldBundleSecret && clientSecret ? { clientSecret } : {}),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");

console.log(
  shouldBundleSecret
    ? `Wrote bundled OAuth config with client ID and secret to ${outputPath}`
    : `Wrote bundled OAuth config with client ID only to ${outputPath}`
);
