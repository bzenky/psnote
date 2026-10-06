import { expect } from "@playwright/test";
import { test } from "./fixtures";

const headline = "Annotate screenshots online, without uploading them.";

test.describe("homepage without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("instructions and native FAQs remain readable without the editor", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(headline);
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    await expect(page.locator(".javascript-notice")).toBeVisible();
    await expect(page.locator(".javascript-notice")).toContainText(
      "The screenshot editor needs JavaScript.",
    );
    await expect(page.locator(".homepage-steps li")).toHaveCount(3);
    await page
      .getByText("Does redaction remove the covered pixels from exports?", {
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Solid redaction replaces", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.locator("#root")).toBeEmpty();
  });
});

test("React startup preserves one copy of the static content and editor navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open image", exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(headline);
  await expect(page.locator(".homepage-info")).toHaveCount(1);
  await expect(page.locator(".javascript-notice")).not.toBeVisible();
  await page.getByRole("link", { name: "How it works ↓" }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.locator("#how-it-works")).toBeInViewport();
  await page
    .getByRole("link", { name: "Back to the screenshot editor ↑" })
    .click();
  await expect(page).toHaveURL(/#root$/);
  await expect(
    page.getByRole("button", { name: "Open image", exact: true }).first(),
  ).toBeInViewport();
  expect(errors).toEqual([]);
});

test("styles and editor space are ready before JavaScript loads", async ({
  page,
}) => {
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") await scriptsReady;
    await route.fallback();
  });

  try {
    await page.goto("/", { waitUntil: "commit" });
    const content = page.locator(".homepage-info");
    await expect(content).toBeVisible();
    await expect(page.locator("#root")).toBeEmpty();
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.documentElement).backgroundColor,
        ),
      )
      .toBe("rgb(17, 19, 24)");
    const before = await content.boundingBox();
    const viewportHeight = page.viewportSize()!.height;
    expect(before!.y).toBe(Math.max(660, viewportHeight));

    releaseScripts();
    await expect(
      page.getByRole("button", { name: "Open image", exact: true }).first(),
    ).toBeVisible();
    const after = await content.boundingBox();
    expect(after!.y).toBe(before!.y);
    expect(after!.height).toBe(before!.height);
  } finally {
    releaseScripts();
  }
});

test("homepage content fits desktop and mobile widths", async ({ page }) => {
  await page.goto("/");
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".homepage-info").scrollIntoViewIfNeeded();
    const content = await page.locator(".homepage-info").boundingBox();
    expect(content).not.toBeNull();
    expect(content!.x).toBeGreaterThanOrEqual(0);
    expect(content!.x + content!.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});
