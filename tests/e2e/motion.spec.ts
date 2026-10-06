import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";

async function loadImage(page: Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "motion-fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  });
  await expect(page.getByTestId("image-size")).toHaveText("400 × 300");
}

async function addMarker(page: Page) {
  await page.getByRole("button", { name: "Number", exact: true }).click();
  const surface = page.getByTestId("canvas-surface");
  const box = (await surface.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("annotation-count")).toHaveText("1 annotation");
}

test("entrance effects do not transform the canvas or delay annotation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator(".empty-state")).toHaveCSS(
    "animation-name",
    "editor-fade-in",
  );
  await loadImage(page);
  await expect(page.getByTestId("canvas-surface")).toHaveCSS(
    "transform",
    "none",
  );
  await expect(page.getByTestId("canvas-surface")).toHaveCSS(
    "animation-name",
    "editor-fade-in",
  );
  await addMarker(page);
  await expect(page.locator(".properties")).toHaveCSS(
    "animation-name",
    "editor-fade-in",
  );
  await expect(page.getByTestId("canvas-surface")).toHaveCSS(
    "transform",
    "none",
  );
});

test("annotation and crop options do not resize or move the workspace", async ({
  page,
}) => {
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await loadImage(page);
    await expect(page.locator(".context-bar")).toHaveCSS("height", "48px");
    const status = (await page.locator(".status-bar").boundingBox())!;
    expect(status.height).toBeLessThanOrEqual(48);
    for (const button of await page.locator(".status-bar button").all()) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(32);
      expect(bounds.y).toBeGreaterThanOrEqual(status.y);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        status.y + status.height,
      );
    }
    const workspace = page.locator(".workspace");
    const surface = page.getByTestId("canvas-surface");
    const beforeWorkspace = await workspace.boundingBox();
    const beforeSurface = await surface.boundingBox();
    const beforeZoom = await page.getByTestId("zoom-value").textContent();
    await addMarker(page);
    await expect(page.locator(".properties")).toBeVisible();
    expect(await workspace.boundingBox()).toEqual(beforeWorkspace);
    expect(await surface.boundingBox()).toEqual(beforeSurface);
    await page.getByRole("button", { name: "Crop", exact: true }).click();
    await expect(page.locator(".crop-controls")).toBeVisible();
    expect(await workspace.boundingBox()).toEqual(beforeWorkspace);
    expect(await surface.boundingBox()).toEqual(beforeSurface);
    await page
      .getByRole("button", { name: "Cancel crop", exact: true })
      .click();
    await expect(page.locator(".properties")).toBeVisible();
    await page
      .getByRole("button", { name: "Delete selected annotation" })
      .click();
    await expect(page.locator(".properties")).toHaveCount(0);
    expect(await workspace.boundingBox()).toEqual(beforeWorkspace);
    expect(await surface.boundingBox()).toEqual(beforeSurface);
    await expect(page.getByTestId("zoom-value")).toHaveText(beforeZoom!);
    await page.getByRole("button", { name: "Text", exact: true }).click();
    const box = (await surface.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.getByLabel("Annotation text").focus();
    await expect(page.getByLabel("Annotation text")).toBeFocused();
    const context = (await page.locator(".context-bar").boundingBox())!;
    for (const control of await page
      .locator(".context-bar input, .context-bar textarea, .context-bar button")
      .all()) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(context.y);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        context.y + context.height,
      );
    }
    expect(await workspace.boundingBox()).toEqual(beforeWorkspace);
    expect(await surface.boundingBox()).toEqual(beforeSurface);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});

test("interactive icons animate without moving buttons or the canvas", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const arrow = page.getByRole("button", { name: "Arrow", exact: true });
  await arrow.hover();
  await expect(arrow.locator(".ui-icon")).toHaveCSS("transform", "none");
  await expect(arrow.locator(".ui-icon")).toHaveCSS("animation-name", "none");
  await loadImage(page);
  const before = await arrow.boundingBox();
  const canvas = await page.getByTestId("canvas-surface").boundingBox();
  await arrow.hover();
  await expect(arrow.locator(".ui-icon")).not.toHaveCSS("transform", "none");
  expect(await arrow.boundingBox()).toEqual(before);
  await arrow.click();
  await expect(arrow.locator(".ui-icon")).toHaveCSS("animation-name", "none");
  expect(await page.getByTestId("canvas-surface").boundingBox()).toEqual(
    canvas,
  );
  await expect(
    page.locator('.app-footer .ui-icon[data-icon="shield"]'),
  ).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(arrow.locator(".ui-icon")).toHaveCSS("animation-name", "none");
  await expect(arrow.locator(".ui-icon")).toHaveCSS("transform", "none");
});

test("history actions work without decorative icon animations", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await loadImage(page);
  for (let index = 0; index < 3; index++) {
    await page.getByRole("button", { name: "Number", exact: true }).click();
    const box = (await page.getByTestId("canvas-surface").boundingBox())!;
    await page.mouse.click(box.x + 40 + index * 40, box.y + 60);
  }
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  await undo.click();
  await expect(undo.locator(".ui-icon")).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("annotation-count")).toHaveText("1 annotation");
  await expect(undo.locator(".ui-icon")).toHaveCSS("animation-name", "none");
  await redo.click();
  await expect(redo.locator(".ui-icon")).toHaveCSS("animation-name", "none");
  await expect(page.getByTestId("annotation-count")).toHaveText(
    "2 annotations",
  );
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`copy feedback waits for success and resets (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");
    await loadImage(page);
    await page.evaluate(() => {
      Object.defineProperty(window, "ClipboardItem", {
        configurable: true,
        value: class {},
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          write: () =>
            new Promise<void>((resolve) => {
              (window as unknown as { finishCopy: () => void }).finishCopy =
                resolve;
            }),
        },
      });
    });
    const copy = page.getByRole("button", { name: "Copy image", exact: true });
    await copy.click();
    await expect(copy.locator(".ui-icon")).toHaveAttribute("data-icon", "copy");
    await expect(page.getByRole("status")).not.toContainText("Image copied");
    await page.evaluate(() =>
      (window as unknown as { finishCopy: () => void }).finishCopy(),
    );
    await expect(copy.locator(".ui-icon")).toHaveAttribute(
      "data-icon",
      "check",
    );
    await expect(copy.locator(".ui-icon")).toHaveCSS(
      "animation-name",
      reducedMotion === "reduce" ? "none" : "icon-confirm",
    );
    await expect(copy.locator(".ui-icon")).toHaveAttribute("data-icon", "copy");
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { write: () => Promise.reject(new Error("Denied")) },
      }),
    );
    await copy.click();
    await expect(page.getByRole("status")).toContainText(
      "Could not copy image",
    );
    await expect(copy.locator(".ui-icon")).toHaveAttribute("data-icon", "copy");
  });
}

test("reduced motion disables entrance effects and interaction transitions", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".empty-state")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(
    page.getByRole("button", { name: "Open image", exact: true }).first(),
  ).toHaveCSS("transition-duration", "0s");
  await loadImage(page);
  await addMarker(page);
  await expect(page.locator(".properties")).toHaveCSS("animation-name", "none");
  await expect(page.getByTestId("canvas-surface")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.getByTestId("canvas-surface")).toHaveCSS(
    "transform",
    "none",
  );
});
