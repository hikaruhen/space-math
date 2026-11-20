import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

it("pre-caches each URL once even when the icon is also in the HTML", async () => {
  const listeners: Record<string, (event: unknown) => void> = {};
  let finished: Promise<unknown> = Promise.resolve(),
    saved: string[] = [];
  runInNewContext(
    readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    {
      self: {
        addEventListener: (name: string, handler: (event: unknown) => void) =>
          (listeners[name] = handler),
      },
      fetch: async () => ({
        text: async () =>
          '<link href="./icon.svg"><link href="./manifest.webmanifest"><script src="./assets/game.js"></script><link href="./assets/game.css">',
      }),
      caches: {
        open: async () => ({
          addAll: async (urls: string[]) => {
            if (new Set(urls).size !== urls.length)
              throw Error("duplicate request");
            saved = urls;
          },
        }),
      },
    },
  );
  listeners.install({
    waitUntil: (promise: Promise<unknown>) => (finished = promise),
  });
  await finished;
  expect(saved).toEqual([
    "./",
    "./rocket.svg",
    "./icon.svg",
    "./manifest.webmanifest",
    "./assets/game.js",
    "./assets/game.css",
  ]);
});
