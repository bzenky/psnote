import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";

type Point = { x: number; y: number };

async function loadImage(page: Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 400, 300);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "pan-fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  });
  await expect(page.getByTestId("image-size")).toHaveText("400 × 300");
  await expect(page.getByTestId("canvas-surface")).toBeVisible();
}

async function surfaceBox(page: Page) {
  const box = await page.getByTestId("canvas-surface").boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function drag(
  page: Page,
  start: Point,
  delta: Point,
  button: "left" | "middle" = "left",
) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button });
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 5 });
  await page.mouse.up({ button });
}

async function expectViewport(
  page: Page,
  before: Awaited<ReturnType<typeof surfaceBox>>,
  delta: Point,
) {
  await expect
    .poll(async () => {
      const after = await surfaceBox(page);
      return Math.max(
        Math.abs(after.x - before.x - delta.x),
        Math.abs(after.y - before.y - delta.y),
        Math.abs(after.width - before.width),
        Math.abs(after.height - before.height),
      );
    })
    .toBeLessThanOrEqual(1);
}

async function drawRectangle(page: Page) {
  const box = await surfaceBox(page);
  const scale = box.width / 400;
  await drag(
    page,
    { x: box.x + 60 * scale, y: box.y + 60 * scale },
    { x: 100 * scale, y: 80 * scale },
  );
  await expect(page.getByTestId("annotation-count")).toHaveText("1 annotation");
  // Browser pointer coordinates can round at fractional zoom levels.
  for (const [label, value] of [
    ["X position", 60],
    ["Y position", 60],
    ["Width", 100],
    ["Height", 80],
  ] as const) {
    await expect
      .poll(async () =>
        Math.abs(
          Number(await page.getByLabel(label, { exact: true }).inputValue()) -
            value,
        ),
      )
      .toBeLessThanOrEqual(2);
  }
}

async function exportDimensions(page: Page) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, Buffer.concat(chunks).toString("base64"));
}

test.beforeEach(async ({ page, browserName }) => {
  test.skip(
    browserName !== "chromium",
    "Viewport panning coverage targets Chromium.",
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await loadImage(page);
});

test("Pan button toggles hand mode and drags only the viewport", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const pan = page.getByRole("button", { name: "Pan", exact: true });
  await pan.click();
  await expect(pan).toHaveAttribute("aria-pressed", "true");
  const before = await surfaceBox(page);
  const delta = { x: 70, y: 45 };
  await drag(
    page,
    { x: before.x + before.width / 2, y: before.y + before.height / 2 },
    delta,
  );
  await expectViewport(page, before, delta);
  await expect(page.getByTestId("annotation-count")).toHaveText(
    "0 annotations",
  );
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Redo", exact: true }),
  ).toBeDisabled();
  await pan.click();
  await expect(pan).toHaveAttribute("aria-pressed", "false");
});

test("H toggles hand mode without creating annotations", async ({ page }) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const pan = page.getByRole("button", { name: "Pan", exact: true });
  await page.keyboard.press("h");
  await expect(pan).toHaveAttribute("aria-pressed", "true");
  const before = await surfaceBox(page);
  const delta = { x: -55, y: 30 };
  await drag(
    page,
    { x: before.x + before.width / 2, y: before.y + before.height / 2 },
    delta,
  );
  await expectViewport(page, before, delta);
  await expect(page.getByTestId("annotation-count")).toHaveText(
    "0 annotations",
  );
  await page.keyboard.press("h");
  await expect(pan).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await drawRectangle(page);
});

test("Space pans from workspace background and release restores image-space drawing", async ({
  page,
}) => {
  await page.getByLabel("Zoom percentage").fill("75");
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const rectangle = page.getByRole("button", {
    name: "Rectangle",
    exact: true,
  });
  const before = await surfaceBox(page);
  const workspace = (await page.locator(".workspace").boundingBox())!;
  // Start beside the image, not on the canvas, to exercise the whole workspace.
  const start = { x: workspace.x + 12, y: workspace.y + workspace.height / 2 };
  expect(start.x).toBeLessThan(before.x);
  const delta = { x: 60, y: 35 };
  await page.keyboard.down("Space");
  try {
    await drag(page, start, delta);
    await expectViewport(page, before, delta);
    await expect(page.getByTestId("annotation-count")).toHaveText(
      "0 annotations",
    );
  } finally {
    await page.keyboard.up("Space");
  }
  await expect(rectangle).toHaveAttribute("aria-pressed", "true");
  await drawRectangle(page);
});

test("middle mouse pans on the canvas without changing the drawing tool", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const before = await surfaceBox(page);
  const delta = { x: 65, y: -20 };
  await drag(
    page,
    { x: before.x + before.width / 2, y: before.y + before.height / 2 },
    delta,
    "middle",
  );
  await expectViewport(page, before, delta);
  await expect(page.getByTestId("annotation-count")).toHaveText(
    "0 annotations",
  );
  await expect(
    page.getByRole("button", { name: "Rectangle", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await drawRectangle(page);
});

test("Fit to screen restores the baseline viewport and pan does not change export dimensions", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Fit to screen", exact: true })
    .click();
  const baseline = await surfaceBox(page);
  await page.getByRole("button", { name: "Pan", exact: true }).click();
  const delta = { x: 75, y: 40 };
  await drag(
    page,
    { x: baseline.x + baseline.width / 2, y: baseline.y + baseline.height / 2 },
    delta,
  );
  await expectViewport(page, baseline, delta);
  await expect(page.getByTestId("image-size")).toHaveText("400 × 300");
  expect(await exportDimensions(page)).toEqual({ width: 400, height: 300 });
  await page
    .getByRole("button", { name: "Fit to screen", exact: true })
    .click();
  await expectViewport(page, baseline, { x: 0, y: 0 });
});

test("Space panning with Crop selected does not create a crop or change the document", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Crop", exact: true }).click();
  const apply = page.getByRole("button", { name: "Apply crop", exact: true });
  await expect(apply).toBeDisabled();
  const before = await surfaceBox(page);
  const delta = { x: 45, y: 25 };
  await page.keyboard.down("Space");
  try {
    await drag(
      page,
      { x: before.x + before.width / 2, y: before.y + before.height / 2 },
      delta,
    );
    await expectViewport(page, before, delta);
  } finally {
    await page.keyboard.up("Space");
  }
  await expect(
    page.getByRole("button", { name: "Crop", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(apply).toBeDisabled();
  await expect(page.getByTestId("annotation-count")).toHaveText(
    "0 annotations",
  );
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  expect(await exportDimensions(page)).toEqual({ width: 400, height: 300 });
});

test("panning over an annotation does not move it or add a history entry", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await drawRectangle(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const labels = ["X position", "Y position", "Width", "Height"];
  const geometry = await Promise.all(
    labels.map((label) => page.getByLabel(label, { exact: true }).inputValue()),
  );
  const before = await surfaceBox(page);
  const scale = before.width / 400;
  const delta = { x: 50, y: 30 };
  // The rectangle's top edge is an annotation hit target, not empty canvas.
  await drag(
    page,
    { x: before.x + 110 * scale, y: before.y + 60 * scale },
    delta,
    "middle",
  );
  await expectViewport(page, before, delta);
  await expect(page.getByTestId("annotation-count")).toHaveText("1 annotation");
  for (const [index, label] of labels.entries()) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(
      geometry[index],
    );
  }
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("annotation-count")).toHaveText(
    "0 annotations",
  );
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await expectViewport(page, before, delta);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("annotation-count")).toHaveText("1 annotation");
  await expectViewport(page, before, delta);
  expect(await exportDimensions(page)).toEqual({ width: 400, height: 300 });
});

test("releasing a drag outside the workspace does not leave panning stuck", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const before = await surfaceBox(page);
  const workspace = (await page.locator(".workspace").boundingBox())!;
  await page.keyboard.down("Space");
  await page.mouse.move(
    before.x + before.width / 2,
    before.y + before.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(workspace.x + 20, workspace.y - 20, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect(page.locator(".workspace")).not.toHaveClass(
    /is-panning|pan-ready/,
  );
  await page
    .getByRole("button", { name: "Fit to screen", exact: true })
    .click();
  await expectViewport(page, before, { x: 0, y: 0 });
  await drawRectangle(page);
});

test("window blur clears temporary Space panning", async ({ page }) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.keyboard.down("Space");
  await expect(page.locator(".workspace")).toHaveCSS("cursor", "grab");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator(".workspace")).not.toHaveClass(
    /is-panning|pan-ready/,
  );
  await page.keyboard.up("Space");
  await drawRectangle(page);
});

test("Space in focused inputs neither activates pan nor intercepts text typing", async ({
  page,
}) => {
  const surface = page.getByTestId("canvas-surface");
  const zoom = page.getByLabel("Zoom percentage");
  await zoom.focus();
  const before = await surfaceBox(page);
  const zoomValue = await zoom.inputValue();
  const cursor = await surface.evaluate(
    (element) => getComputedStyle(element).cursor,
  );
  await page.keyboard.down("Space");
  try {
    await expect(zoom).toBeFocused();
    await expect(zoom).toHaveValue(zoomValue);
    await expect(surface).toHaveCSS("cursor", cursor);
    await expect(page.locator(".workspace")).not.toHaveCSS(
      "cursor",
      /^(grab|grabbing)$/,
    );
    await expectViewport(page, before, { x: 0, y: 0 });
  } finally {
    await page.keyboard.up("Space");
  }

  await page.getByRole("button", { name: "Text", exact: true }).click();
  const box = await surfaceBox(page);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const text = page.getByLabel("Annotation text", { exact: true });
  await text.fill("hello");
  await text.focus();
  await text.press("End");
  const textCursor = await surface.evaluate(
    (element) => getComputedStyle(element).cursor,
  );
  await page.keyboard.down("Space");
  try {
    await expect(text).toHaveValue("hello ");
    await expect(text).toBeFocused();
    await expect(surface).toHaveCSS("cursor", textCursor);
    await expect(page.locator(".workspace")).not.toHaveCSS(
      "cursor",
      /^(grab|grabbing)$/,
    );
  } finally {
    await page.keyboard.up("Space");
  }
  await page.keyboard.type("world");
  await expect(text).toHaveValue("hello world");
  await expect(page.getByTestId("annotation-count")).toHaveText("1 annotation");
});
