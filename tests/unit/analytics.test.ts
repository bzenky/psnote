import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeAnalytics } from "../../src/app/analytics";

function configure(production: boolean, hostname: string) {
  vi.stubEnv("PROD", production);
  const target = {
    location: { hostname },
    dataLayer: [] as unknown[][],
  };
  vi.stubGlobal("window", target);
  return target;
}

const scriptSelector = 'script[src*="googletagmanager.com/gtag/js"]';

afterEach(() => {
  document
    .querySelectorAll(scriptSelector)
    .forEach((script) => script.remove());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("analytics initialization", () => {
  it("does not load analytics during development, even on the live hostname", () => {
    const target = configure(false, "www.psnote.bzenky.dev");
    initializeAnalytics();
    expect(document.querySelector(scriptSelector)).toBeNull();
    expect(target.dataLayer).toEqual([]);
  });

  it.each(["localhost", "127.0.0.1", "staging.psnote.bzenky.dev"])(
    "does not load analytics on %s in production builds",
    (hostname) => {
      const target = configure(true, hostname);
      initializeAnalytics();
      expect(document.querySelector(scriptSelector)).toBeNull();
      expect(target.dataLayer).toEqual([]);
    },
  );

  it("loads one async tag and queues initialization only on the live production site", () => {
    const target = configure(true, "www.psnote.bzenky.dev");
    initializeAnalytics();
    initializeAnalytics();
    const scripts =
      document.querySelectorAll<HTMLScriptElement>(scriptSelector);
    expect(scripts).toHaveLength(1);
    expect(scripts[0].async).toBe(true);
    expect(scripts[0].src).toBe(
      "https://www.googletagmanager.com/gtag/js?id=G-PSWQEK5NSZ",
    );
    expect(target.dataLayer).toEqual([
      ["js", expect.any(Date)],
      ["config", "G-PSWQEK5NSZ"],
    ]);
  });
});
