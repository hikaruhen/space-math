import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const html = await readFile(
  new URL("../dist/index.html", import.meta.url),
  "utf8",
);
const path = new URL("../dist/sw.js", import.meta.url);
const worker = await readFile(path, "utf8");
const hash = createHash("sha256")
  .update(html)
  .update(worker)
  .digest("hex")
  .slice(0, 12);
await writeFile(path, worker.replace("space-math-v1", `space-math-${hash}`));
await writeFile(
  new URL("../dist/version.json", import.meta.url),
  JSON.stringify({ version: "2.0.0", build: hash }),
);
console.log(`Build ${hash}`);
