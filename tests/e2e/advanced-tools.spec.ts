import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";

type Point = readonly [number, number];
const tools = [
  { name: "Ellipse", key: "e", hit: [160, 100], editedHit: [220, 120] },
  { name: "Free draw", key: "p", hit: [160, 100], editedHit: [220, 120] },
  { name: "Spotlight", key: "s", hit: [100, 100], editedHit: [100, 100] },
] as const;
const white = [255, 255, 255, 255];
const blue = [0, 0, 255, 255];

async function surfaceBox(page: Page) {
  const box = await page.getByTestId("canvas-surface").boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function drag(page: Page, points: readonly Point[]) {
  const box = await surfaceBox(page);
  const scale = box.width / 400;
  await page.mouse.move(
    box.x + points[0][0] * scale,
    box.y + points[0][1] * scale,
  );
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) {
    await page.mouse.move(box.x + x * scale, box.y + y * scale, { steps: 5 });
  }
  await page.mouse.up();
}

async function draw(page: Page, name: string, points?: readonly Point[]) {
  await page.getByRole("button", { name, exact: true }).click();
  await drag(
    page,
    points ??
      (name === "Free draw"
        ? [
            [60, 60],
            [160, 60],
            [160, 140],
          ]
        : [
            [60, 60],
            [160, 140],
          ]),
  );
}

async function select(page: Page, point: Point) {
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const box = await surfaceBox(page);
  // Selection coordinates use the current document width (including after crop).
  const width = Number(
    (await page.getByTestId("image-size").innerText()).split(" × ")[0],
  );
  const scale = box.width / width;
  await page.mouse.click(box.x + point[0] * scale, box.y + point[1] * scale);
  await expect(
    page.getByRole("region", { name: "Selected annotation properties" }),
  ).toBeVisible();
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

async function edit(page: Page, label: string, value: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.blur();
  await expect(input).toHaveValue(value);
}

async function downloadPixels(page: Page, points: readonly Point[]) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("psnote.png");
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return page.evaluate(
    async ({ base64, points }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return {
        width: canvas.width,
        height: canvas.height,
        pixels: points.map(([x, y]) =>
          Array.from(context.getImageData(x, y, 1, 1).data),
        ),
      };
    },
    { base64: Buffer.concat(chunks).toString("base64"), points },
  );
}

function expectDim(pixel: number[]) {
  for (const channel of pixel.slice(0, 3))
    expect(Math.abs(channel - 102)).toBeLessThanOrEqual(2);
  expect(pixel[3]).toBe(255);
}

const count = (page: Page) => page.getByTestId("annotation-count");
const history = (page: Page, name: "Undo" | "Redo") =>
  page.getByRole("button", { name, exact: true });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
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
    name: "advanced-tools.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  });
  await expect(page.getByTestId("image-size")).toHaveText("400 × 300");
  await page.getByLabel("Zoom percentage").fill("100");
  await page.getByLabel("Zoom percentage").blur();
  await expect.poll(async () => (await surfaceBox(page)).width).toBe(400);
});

for (const tool of tools) {
  test(`${tool.name}: shortcut, selected stroke, resize, property history and PNG`, async ({
    page,
  }) => {
    await page.keyboard.press(tool.key);
    await expect(
      page.getByRole("button", { name: tool.name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const before = await surfaceBox(page);
    await drag(
      page,
      tool.name === "Free draw"
        ? [
            [60, 60],
            [160, 60],
            [160, 140],
          ]
        : [
            [60, 60],
            [160, 140],
          ],
    );
    await expect(count(page)).toHaveText("1 annotation");
    await geometry(page, [60, 60, 100, 80]);
    await expect(
      page.getByRole("region", { name: "Selected annotation properties" }),
    ).toContainText(tool.name);
    await expect(
      page.getByRole("button", { name: "Select", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const after = await surfaceBox(page);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);

    // Outline shapes include half their stroke in the transformer's bounds.
    const pad = tool.name === "Spotlight" ? 0 : 2;
    await drag(page, [
      [160 + pad, 140 + pad],
      [200 + pad, 180 + pad],
    ]);
    await expect
      .poll(async () =>
        Number(await page.getByLabel("Width", { exact: true }).inputValue()),
      )
      .toBeGreaterThan(130);
    await expect
      .poll(async () =>
        Number(await page.getByLabel("Height", { exact: true }).inputValue()),
      )
      .toBeGreaterThan(110);
    await history(page, "Undo").click();
    await select(page, tool.hit);
    await geometry(page, [60, 60, 100, 80]);

    await edit(page, "Width", "160");
    await edit(page, "Height", "120");
    if (tool.name === "Spotlight") {
      await expect(
        page.getByLabel("Annotation color", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByLabel("Stroke width", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("region", { name: "Selected annotation properties" }),
      ).toContainText(/not redaction/i);
    } else {
      await edit(page, "Annotation color", "#0000ff");
      await edit(page, "Stroke width", "10");
    }
    await geometry(page, [60, 60, 160, 120]);
    const samples: Point[] =
      tool.name === "Spotlight"
        ? [
            [100, 100],
            [300, 250],
          ]
        : [
            [140, 60],
            [140, 63],
            [140, 68],
            [300, 250],
          ];
    if (tool.name === "Free draw")
      samples.push([220, 120], [220, 175], [160, 100]);
    const edited = await downloadPixels(page, samples);
    expect([edited.width, edited.height]).toEqual([400, 300]);
    if (tool.name === "Spotlight") {
      expect(edited.pixels[0]).toEqual(white);
      expectDim(edited.pixels[1]);
    } else {
      expect(edited.pixels.slice(0, 4)).toEqual([blue, blue, white, white]);
      if (tool.name === "Free draw") {
        // Both segments must scale, not just the bounding box or the endpoints.
        expect(edited.pixels.slice(4)).toEqual([blue, blue, white]);
      }
    }

    const entries = tool.name === "Spotlight" ? 3 : 5;
    for (let i = 0; i < entries; i++) await history(page, "Undo").click();
    await expect(count(page)).toHaveText("0 annotations");
    await expect(history(page, "Undo")).toBeDisabled();
    const undone = await downloadPixels(page, samples);
    expect([undone.width, undone.height]).toEqual([400, 300]);
    expect(undone.pixels).toEqual(samples.map(() => white));
    for (let i = 0; i < entries; i++) await history(page, "Redo").click();
    await expect(count(page)).toHaveText("1 annotation");
    await expect(history(page, "Redo")).toBeDisabled();
    await select(page, tool.editedHit);
    await geometry(page, [60, 60, 160, 120]);
    if (tool.name !== "Spotlight") {
      await expect(page.getByLabel("Annotation color")).toHaveValue("#0000ff");
      await expect(
        page.getByLabel("Stroke width", { exact: true }),
      ).toHaveValue("10");
    }
    expect(await downloadPixels(page, samples)).toEqual(edited);
  });

  test(`${tool.name}: panning is view-only and crop preserves annotation pixels/history`, async ({
    page,
  }) => {
    await draw(page, tool.name);
    const samples: Point[] = [
      [110, 60],
      [100, 100],
      [250, 200],
    ];
    const original = await downloadPixels(page, samples);
    const before = await surfaceBox(page);
    await page.getByRole("button", { name: "Pan", exact: true }).click();
    await drag(page, [tool.hit, [tool.hit[0] + 40, tool.hit[1] + 25]]);
    const after = await surfaceBox(page);
    expect(Math.abs(after.x - before.x - 40)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y - 25)).toBeLessThanOrEqual(1);
    await geometry(page, [60, 60, 100, 80]);
    await expect(count(page)).toHaveText("1 annotation");
    expect(await downloadPixels(page, samples)).toEqual(original);
    await history(page, "Undo").click();
    await expect(count(page)).toHaveText("0 annotations");
    await expect(history(page, "Undo")).toBeDisabled();
    await history(page, "Redo").click();
    await expect(count(page)).toHaveText("1 annotation");

    await draw(page, "Crop", [
      [20, 20],
      [300, 240],
    ]);
    await page.getByRole("button", { name: "Apply crop", exact: true }).click();
    await expect(page.getByTestId("image-size")).toHaveText("280 × 220");
    await expect(count(page)).toHaveText("1 annotation");
    await select(page, [tool.hit[0] - 20, tool.hit[1] - 20]);
    await geometry(page, [40, 40, 100, 80]);
    const cropped = await downloadPixels(
      page,
      samples.map(([x, y]) => [x - 20, y - 20] as const),
    );
    expect([cropped.width, cropped.height]).toEqual([280, 220]);
    expect(cropped.pixels).toEqual(original.pixels);
    await history(page, "Undo").click();
    await expect(page.getByTestId("image-size")).toHaveText("400 × 300");
    expect(await downloadPixels(page, samples)).toEqual(original);
    await history(page, "Redo").click();
    await expect(page.getByTestId("image-size")).toHaveText("280 × 220");
    expect(
      await downloadPixels(
        page,
        samples.map(([x, y]) => [x - 20, y - 20] as const),
      ),
    ).toEqual(cropped);
  });
}

for (const axis of ["horizontal", "vertical"] as const) {
  test(`Free draw: ${axis} multi-position stroke remains editable and exports a continuous path`, async ({
    page,
  }) => {
    const points: Point[] =
      axis === "horizontal"
        ? [
            [60, 60],
            [90, 60],
            [120, 60],
            [160, 60],
          ]
        : [
            [60, 60],
            [60, 90],
            [60, 120],
            [60, 140],
          ];
    await draw(page, "Free draw", points);
    await expect(count(page)).toHaveText("1 annotation");
    await geometry(
      page,
      axis === "horizontal" ? [60, 60, 100, 1] : [60, 60, 1, 80],
    );
    await edit(page, "Width", axis === "horizontal" ? "200" : "40");
    await edit(page, "Height", axis === "horizontal" ? "40" : "160");
    await edit(page, "Annotation color", "#0000ff");
    await edit(page, "Stroke width", "8");
    const samples: Point[] =
      axis === "horizontal"
        ? [
            [70, 60],
            [120, 60],
            [200, 60],
            [250, 60],
            [120, 80],
          ]
        : [
            [60, 70],
            [60, 120],
            [60, 180],
            [60, 210],
            [80, 120],
          ];
    const output = await downloadPixels(page, samples);
    expect([output.width, output.height]).toEqual([400, 300]);
    expect(output.pixels).toEqual([blue, blue, blue, blue, white]);
  });
}

test("Spotlight: union holes dim only the source, never annotations or opaque redaction", async ({
  page,
}) => {
  // Put annotations both before and after the masks in document order.
  await draw(page, "Free draw", [
    [240, 230],
    [280, 230],
    [320, 230],
  ]);
  await edit(page, "Annotation color", "#0000ff");
  await edit(page, "Stroke width", "10");
  await draw(page, "Redact", [
    [250, 250],
    [290, 280],
  ]);
  await draw(page, "Spotlight", [
    [40, 40],
    [160, 140],
  ]);
  await draw(page, "Spotlight", [
    [120, 100],
    [220, 180],
  ]);
  await draw(page, "Ellipse", [
    [240, 40],
    [340, 120],
  ]);
  await edit(page, "Annotation color", "#0000ff");
  await edit(page, "Stroke width", "10");
  await draw(page, "Redact", [
    [60, 80],
    [90, 110],
  ]);
  await expect(count(page)).toHaveText("6 annotations");
  const output = await downloadPixels(page, [
    [60, 60],
    [140, 120],
    [200, 160],
    [20, 20],
    [300, 200],
    [280, 230],
    [290, 40],
    [270, 265],
    [75, 95],
  ]);
  expect([output.width, output.height]).toEqual([400, 300]);
  expect(output.pixels.slice(0, 3)).toEqual([white, white, white]);
  expectDim(output.pixels[3]);
  expectDim(output.pixels[4]);
  expect(output.pixels.slice(5)).toEqual([
    blue,
    blue,
    [0, 0, 0, 255],
    [0, 0, 0, 255],
  ]);
});
