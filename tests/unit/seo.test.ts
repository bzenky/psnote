import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const origin = "https://www.psnote.bzenky.dev";
const html = readFileSync(resolve("index.html"), "utf8");
const page = new DOMParser().parseFromString(html, "text/html");
const meta = (name: string) =>
  page
    .querySelector(`meta[name="${name}"], meta[property="${name}"]`)
    ?.getAttribute("content");

describe("public SEO assets", () => {
  it("includes descriptive metadata and a single canonical homepage", () => {
    expect(page.documentElement.lang).toBe("en");
    expect(page.title).toBe(
      "Screenshot Annotation Tool — Private & Online | psnote",
    );
    expect(meta("description")).toContain("without uploads");
    expect(page.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(
      page.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ).toBe(`${origin}/`);
    expect(meta("robots")).toBeUndefined();
  });

  it("delivers useful homepage content outside React's mount point", () => {
    expect(page.querySelector("#root")?.childElementCount).toBe(0);
    expect(page.querySelectorAll("h1")).toHaveLength(1);
    const content = page.querySelector(".homepage-info")!;
    expect(content.querySelector("h1")?.textContent).toContain(
      "Annotate screenshots online, without uploading them.",
    );
    expect(content.querySelectorAll(".homepage-steps li")).toHaveLength(3);
    expect(content.querySelectorAll("details summary")).toHaveLength(5);
    expect(content.textContent).toContain("Google Analytics");
    expect(content.textContent).toContain("flattened");
    expect(page.querySelector("body noscript")?.textContent).toContain(
      "editor needs JavaScript",
    );
    for (const link of content.querySelectorAll<HTMLAnchorElement>("a")) {
      expect(page.querySelector(link.getAttribute("href")!)).not.toBeNull();
    }
  });

  it("loads styles directly from the HTML before application JavaScript", () => {
    expect(
      Array.from(page.querySelectorAll('head link[rel="stylesheet"]'), (link) =>
        link.getAttribute("href"),
      ),
    ).toEqual(["/src/app/styles.css", "/src/app/homepage.css"]);
    expect(page.querySelector("head noscript style")?.textContent).toContain(
      "display: none",
    );
  });

  it("provides consistent social metadata with an absolute PNG preview URL", () => {
    expect(meta("og:type")).toBe("website");
    expect(meta("og:site_name")).toBe("psnote");
    expect(meta("og:url")).toBe(`${origin}/`);
    expect(meta("twitter:card")).toBe("summary_large_image");
    for (const prefix of ["og", "twitter"]) {
      expect(meta(`${prefix}:title`)).toBe(page.title);
      expect(meta(`${prefix}:description`)).toBe(meta("description"));
      expect(meta(`${prefix}:image`)).toBe(`${origin}/social-preview.png`);
      expect(meta(`${prefix}:image:alt`)).toContain("psnote");
    }
    const image = readFileSync(resolve("public/social-preview.png"));
    expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(image.readUInt32BE(16)).toBe(Number(meta("og:image:width")));
    expect(image.readUInt32BE(20)).toBe(Number(meta("og:image:height")));
    expect(meta("og:image:type")).toBe("image/png");
  });

  it("allows production crawling and lists only the canonical homepage", () => {
    const robots = readFileSync(resolve("public/robots.txt"), "utf8");
    expect(robots).toContain("User-agent: *\nAllow: /");
    expect(robots).not.toContain("Disallow:");
    expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`);
    const sitemap = new DOMParser().parseFromString(
      readFileSync(resolve("public/sitemap.xml"), "utf8"),
      "application/xml",
    );
    expect(sitemap.querySelector("parsererror")).toBeNull();
    expect(sitemap.documentElement.namespaceURI).toBe(
      "http://www.sitemaps.org/schemas/sitemap/0.9",
    );
    expect(
      Array.from(sitemap.querySelectorAll("loc"), (entry) => entry.textContent),
    ).toEqual([`${origin}/`]);
  });
});
