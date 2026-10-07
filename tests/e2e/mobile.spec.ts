import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";

type Point = readonly [number, number];
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function touchDrag(page: Page, points: readonly Point[], cancel = false) {
  // Native touch input exercises browser scrolling and compatibility mouse events.
  const session = await page.context().newCDPSession(page);
  const box = (await page.getByTestId("canvas-surface").boundingBox())!;
  const width = Number(
    (await page.getByTestId("image-size").innerText()).split(" × ")[0],
  );
  for (const [index, [x, y]] of points.entries()) {
    await session.send("Input.dispatchTouchEvent", {
      type: index === 0 ? "touchStart" : "touchMove",
      touchPoints: [
        {
          x: box.x + (x * box.width) / width,
          y: box.y + (y * box.width) / width,
        },
      ],
    });
  }
  await session.send("Input.dispatchTouchEvent", {
    type: cancel ? "touchCancel" : "touchEnd",
    touchPoints: [],
  });
  await session.detach();
}

async function tapImage(page: Page, point: Point) {
  const box = (await page.getByTestId("canvas-surface").boundingBox())!;
  await page.touchscreen.tap(
    box.x + (point[0] * box.width) / 400,
    box.y + (point[1] * box.width) / 400,
  );
}

async function geometry(page: Page, values: readonly number[]) {
  for (const [index, label] of [
    "X position",
    "Y position",
    "Width",
    "Height",
  ].entries()) {
    await expect
      .poll(async () =>
        Math.abs(
          Number(await page.getByLabel(label, { exact: true }).inputValue()) -
            values[index],
        ),
      )
      .toBeLessThanOrEqual(2);
  }
}

async function loadImage(page: Page, width = 400, height = 300) {
  const base64 = await page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      return canvas.toDataURL().split(",")[1];
    },
    { width, height },
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "mobile.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  });
  await expect(page.getByTestId("image-size")).toHaveText(
    `${width} × ${height}`,
  );
}

test.beforeEach(async ({ page, browserName }) => {
  test.skip(
    browserName !== "chromium" && !test.info().title.startsWith("touch places"),
    "Native touch drags use Chromium's CDP input API.",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Localhost exposes randomUUID, unlike the HTTP LAN URL used by real phones.
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined });
  });
  await page.goto("/");
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  await loadImage(page);
});

for (const name of [
  "Arrow",
  "Rectangle",
  "Ellipse",
  "Free draw",
  "Spotlight",
  "Redact",
]) {
  test(`touch draws ${name} once and supports undo/redo`, async ({ page }) => {
    await page.getByRole("button", { name, exact: true }).tap();
    await touchDrag(page, [
      [60, 60],
      [100, 100],
      [160, 140],
    ]);
    await expect(page.getByTestId("annotation-count")).toHaveText(
      "1 annotation",
    );
    if (["Arrow", "Rectangle", "Ellipse", "Free draw"].includes(name)) {
      await expect(
        page.getByLabel("Stroke width", { exact: true }),
      ).toHaveValue("6");
    }
    await page.getByRole("button", { name: "Undo", exact: true }).tap();
    await expect(page.getByTestId("annotation-count")).toHaveText(
      "0 annotations",
    );
    await page.getByRole("button", { name: "Redo", exact: true }).tap();
    await expect(page.getByTestId("annotation-count")).toHaveText(
      "1 annotation",
    );
  });
}

for (const name of ["Text", "Number"]) {
  test(`touch places ${name} without duplicate mouse annotations`, async ({
    page,
  }) => {
    await page.getByRole("button", { name, exact: true }).tap();
    await tapImage(page, [80, 80]);
    await expect(page.getByTestId("annotation-count")).toHaveText(
      "1 annotation",
    );
    await expect(
      page.getByRole("region", { name: "Selected annotation properties" }),
    ).toBeVisible();
  });
}

test("touch selects and moves an annotation in image coordinates", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).tap();
  await touchDrag(page, [
    [60, 60],
    [160, 140],
  ]);
  await geometry(page, [60, 60, 100, 80]);
  await page.getByRole("button", { name: "Select", exact: true }).tap();
  await tapImage(page, [300, 250]);
  await expect(
    page.getByRole("region", { name: "Selected annotation properties" }),
  ).toBeHidden();
  await tapImage(page, [60, 100]);
  await geometry(page, [60, 60, 100, 80]);
  await touchDrag(page, [
    [60, 80],
    [80, 100],
    [100, 120],
  ]);
  await geometry(page, [100, 100, 100, 80]);
  await touchDrag(page, [
    [200, 180],
    [220, 195],
    [240, 210],
  ]);
  // Transformer bounds include the 6px stroke; resizing scales the inner geometry.
  await geometry(page, [100, 100, 100 * (146 / 106), 80 * (116 / 86)]);
});

test("touch crop applies and cancelled drawing does not enter history", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).tap();
  await touchDrag(
    page,
    [
      [60, 60],
      [160, 140],
    ],
    true,
  );
  await expect(page.getByTestId("annotation-count")).toHaveText(
    "0 annotations",
  );
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Crop", exact: true }).tap();
  await touchDrag(
    page,
    [
      [60, 60],
      [160, 140],
    ],
    true,
  );
  await expect(
    page.getByRole("button", { name: "Apply crop", exact: true }),
  ).toBeDisabled();
  await touchDrag(page, [
    [60, 60],
    [160, 140],
  ]);
  await page.getByRole("button", { name: "Apply crop", exact: true }).tap();
  await expect(page.getByTestId("image-size")).toHaveText(/10[0-2] × 8[0-2]/);
});

test("selection handles stay small when a large screenshot is fitted on mobile", async ({
  page,
}) => {
  await loadImage(page, 2400, 1600);
  await page.getByRole("button", { name: "Rectangle", exact: true }).tap();
  await touchDrag(page, [
    [200, 200],
    [600, 500],
    [1000, 800],
  ]);
  await expect(page.getByTestId("annotation-count")).toHaveText("1 annotation");
  expect(
    Number(await page.getByLabel("Zoom percentage").inputValue()),
  ).toBeLessThan(20);
  // Count the anchor's dark fill near the top-left corner in screen pixels.
  // Dividing anchorSize by zoom incorrectly turns an 8px handle into a 64px one.
  const anchorPixels = () =>
    page.getByTestId("canvas-surface").evaluate((surface) => {
      const canvas = Array.from(surface.querySelectorAll("canvas")).at(-1)!;
      const ratio = canvas.width / canvas.getBoundingClientRect().width;
      const zoom = canvas.getBoundingClientRect().width / 2400;
      const radius = Math.round(20 * ratio);
      const pixels = canvas
        .getContext("2d")!
        .getImageData(
          Math.round(200 * zoom * ratio) - radius,
          Math.round(200 * zoom * ratio) - radius,
          radius * 2,
          radius * 2,
        ).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (
          pixels[i] === 21 &&
          pixels[i + 1] === 23 &&
          pixels[i + 2] === 28 &&
          pixels[i + 3] === 255
        )
          count++;
      }
      return count / (ratio * ratio);
    });
  await expect.poll(anchorPixels).toBeGreaterThan(0);
  await expect.poll(anchorPixels).toBeLessThanOrEqual(64);
});

test("stroke defaults follow screen width without changing existing annotations", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).tap();
  await touchDrag(page, [
    [60, 60],
    [160, 140],
  ]);
  await expect(page.getByLabel("Stroke width", { exact: true })).toHaveValue(
    "6",
  );
  await page.getByLabel("Stroke width", { exact: true }).fill("9");
  await page.getByLabel("Stroke width", { exact: true }).blur();
  await page.setViewportSize({ width: 1280, height: 844 });
  await expect(page.getByLabel("Stroke width", { exact: true })).toHaveValue(
    "9",
  );
  await page.getByRole("button", { name: "Rectangle", exact: true }).tap();
  await touchDrag(page, [
    [240, 60],
    [340, 140],
  ]);
  await expect(page.getByLabel("Stroke width", { exact: true })).toHaveValue(
    "4",
  );
  await tapImage(page, [60, 80]);
  await expect(page.getByLabel("Stroke width", { exact: true })).toHaveValue(
    "9",
  );
});

test("image loading is visible in the mobile workspace", async ({ page }) => {
  await page.evaluate(() => {
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return decode.call(this);
    };
  });
  const loading = loadImage(page, 500, 300);
  const overlay = page.getByRole("progressbar", { name: "Loading image" });
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("Processing locally");
  await expect(
    page.getByRole("button", { name: "Rectangle", exact: true }),
  ).toBeDisabled();
  const overlayBox = (await overlay.boundingBox())!;
  const workspaceBox = (await page
    .locator(".workspace-viewport")
    .boundingBox())!;
  expect(Math.abs(overlayBox.x - workspaceBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(overlayBox.y - workspaceBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(overlayBox.width - workspaceBox.width)).toBeLessThanOrEqual(
    1,
  );
  expect(Math.abs(overlayBox.height - workspaceBox.height)).toBeLessThanOrEqual(
    1,
  );
  await loading;
  await expect(overlay).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Rectangle", exact: true }),
  ).toBeEnabled();
});

test("touch pan still moves only the viewport", async ({ page }) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).tap();
  await page.getByRole("button", { name: "Pan", exact: true }).tap();
  const before = (await page.getByTestId("canvas-surface").boundingBox())!;
  await touchDrag(page, [
    [100, 100],
    [130, 120],
    [160, 140],
  ]);
  const after = (await page.getByTestId("canvas-surface").boundingBox())!;
  expect(after.x - before.x).toBeCloseTo((60 * before.width) / 400, 0);
  expect(after.y - before.y).toBeCloseTo((40 * before.width) / 400, 0);
  await expect(page.getByTestId("annotation-count")).toHaveText(
    "0 annotations",
  );
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
});
