import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputPath = resolve(process.cwd(), "build", "oauth-config.json");

const config = {
  clientId: "234277816966-ds42jbf56s6d5vdalfdtlcejucm04dop.apps.googleusercontent.com",
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");

console.log(`Wrote OAuth config to ${outputPath}`);
