import { test as base } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Optional production-bundle harness for environments that cannot bind localhost.
// It runs the same browser assertions and does not require network access.
export const test = base.extend({
  page: async ({ page }, use) => {
    if (process.env.PSNOTE_OFFLINE_BROWSER === "1") {
      await page.route("http://127.0.0.1:4173/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const filename = pathname === "/" ? "index.html" : pathname.slice(1);
        const root = path.resolve("dist");
        const target = path.resolve(root, filename);
        if (!target.startsWith(`${root}${path.sep}`)) {
          await route.abort();
          return;
        }
        const extension = path.extname(target);
        const types: Record<string, string> = {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
        };
        try {
          await route.fulfill({
            status: 200,
            contentType: types[extension] ?? "application/octet-stream",
            body: await readFile(target),
          });
        } catch {
          await route.fulfill({ status: 404, body: "Not found" });
        }
      });
    }
    await use(page);
  },
});
