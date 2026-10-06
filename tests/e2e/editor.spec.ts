import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";

async function imageFile(
  page: Page,
  type = "image/png",
  width = 400,
  height = 300,
) {
  const bytes = await page.evaluate(
    ({ type, width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#33aaff";
      ctx.fillRect(0, 0, 25, 25);
      return Array.from(
        Uint8Array.from(atob(canvas.toDataURL(type).split(",")[1]), (c) =>
          c.charCodeAt(0),
        ),
      );
    },
    { type, width, height },
  );
  return {
    name: `fixture.${type.split("/")[1]}`,
    mimeType: type,
    buffer: Buffer.from(bytes),
  };
}
async function load(page: Page) {
  await page.locator("input[type=file]").setInputFiles(await imageFile(page));
  await expect(page.getByTestId("image-size")).toHaveText("400 × 300");
}
async function draw(
  page: Page,
  tool: string,
  start = [60, 60],
  end = [160, 140],
) {
  await page.getByRole("button", { name: tool, exact: true }).click();
  const box = (await page.getByTestId("canvas-surface").boundingBox())!;
  const scale =
    Number(
      (await page.getByTestId("zoom-value").textContent())!.replace("%", ""),
    ) / 100;
  await page.mouse.move(box.x + start[0] * scale, box.y + start[1] * scale);
  await page.mouse.down();
  await page.mouse.move(box.x + end[0] * scale, box.y + end[1] * scale, {
    steps: 5,
  });
  await page.mouse.up();
}
async function downloadPixels(page: Page) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("psnote.png");
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const base64 = Buffer.concat(chunks).toString("base64");
  return page.evaluate(async (b64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return {
      width: image.width,
      height: image.height,
      pixel: Array.from(ctx.getImageData(100, 100, 1, 1).data),
      outside: Array.from(ctx.getImageData(250, 200, 1, 1).data),
    };
  }, base64);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("C7 empty screenshot guidance and privacy", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: "Paste a screenshot to start" }),
  ).toBeVisible();
  await expect(page.getByText("Ctrl / ⌘ + V")).toBeVisible();
  await expect(
    page
      .getByText("Your images never leave your browser.", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open image", exact: true }).first(),
  ).toBeVisible();
});
test("C8 paste loads PNG JPEG and WebP at decoded dimensions", async ({
  page,
}) => {
  for (const type of ["image/png", "image/jpeg", "image/webp"]) {
    const file = await imageFile(page, type);
    await page.evaluate(
      ({ bytes, type }) => {
        const file = new File([new Uint8Array(bytes)], "fixture", { type });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        document.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: transfer,
            bubbles: true,
          }),
        );
      },
      { bytes: [...file.buffer], type },
    );
    await expect(page.getByTestId("image-size")).toHaveText("400 × 300");
  }
});
test("C9 drop loads a screenshot", async ({ page }) => {
  const file = await imageFile(page);
  await page.evaluate(
    (bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(bytes)], "image.png", { type: "image/png" }),
      );
      document.querySelector("main")!.dispatchEvent(
        new DragEvent("drop", {
          dataTransfer: transfer,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    [...file.buffer],
  );
  await expect(page.getByTestId("image-size")).toHaveText("400 × 300");
});
test("C10 file picker loads a screenshot", async ({ page }) => {
  await load(page);
});
test("C12 loading state is announced during decode", async ({ page }) => {
  await page.evaluate(() => {
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return decode.call(this);
    };
  });
  await page.locator("input[type=file]").setInputFiles(await imageFile(page));
  await expect(page.getByRole("status")).toContainText("Loading image");
  await expect(page.getByTestId("image-size")).toHaveText("400 × 300");
});
test("C14 cancelling replacement preserves annotations", async ({ page }) => {
  await load(page);
  await draw(page, "Rectangle");
  await page
    .locator("input[type=file]")
    .setInputFiles(await imageFile(page, "image/png", 100, 100));
  await page
    .getByRole("button", { name: "Keep current image", exact: true })
    .click();
  await expect(page.getByTestId("image-size")).toHaveText("400 × 300");
  await expect(page.getByTestId("annotation-count")).toHaveText("1 annotation");
});
test("C16 empty editor disables editing and output", async ({ page }) => {
  for (const name of [
    "Select",
    "Arrow",
    "Rectangle",
    "Text",
    "Redact",
    "Number",
    "Crop",
    "Copy image",
    "Export PNG",
  ])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
});
test("C17 arrow endpoints follow image coordinate drag", async ({ page }) => {
  await load(page);
  await draw(page, "Arrow");
  await expect(page.getByTestId("annotation-count")).toHaveText("1 annotation");
  await expect(page.getByLabel("X position")).toHaveValue("60");
  await expect(page.getByLabel("Width")).toHaveValue("100");
  await expect(page.getByLabel("Height")).toHaveValue("80");
});
test("C18 rectangle spans image coordinate drag", async ({ page }) => {
  await load(page);
  await draw(page, "Rectangle");
  await expect(page.getByLabel("X position")).toHaveValue("60");
  await expect(page.getByLabel("Y position")).toHaveValue("60");
  await expect(page.getByLabel("Width")).toHaveValue("100");
  await expect(page.getByLabel("Height")).toHaveValue("80");
});
test("C19 text creation immediately focuses entry", async ({ page }) => {
  await load(page);
  await draw(page, "Text", [60, 60], [60, 60]);
  await expect(page.getByLabel("Annotation text")).toBeFocused();
});
test("C20 plain text edits update annotation", async ({ page }) => {
  await load(page);
  await draw(page, "Text", [60, 60], [60, 60]);
  await page.getByLabel("Annotation text").fill("<b>Bug here</b>");
  await page.getByLabel("Annotation text").blur();
  await expect(page.getByLabel("Annotation text")).toHaveValue(
    "<b>Bug here</b>",
  );
  await expect(page.locator("b")).toHaveCount(0);
});
test("C21 redaction creates opaque black area", async ({ page }) => {
  await load(page);
  await draw(page, "Redact");
  expect((await downloadPixels(page)).pixel).toEqual([0, 0, 0, 255]);
});
test("C23 select enables movement and resize controls", async ({ page }) => {
  await load(page);
  await draw(page, "Rectangle");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  for (const label of ["X position", "Y position", "Width", "Height"])
    await expect(page.getByLabel(label)).toBeVisible();
  await page.getByLabel("X position").fill("80");
  await page.getByLabel("X position").blur();
  await page.getByLabel("Width").fill("150");
  await page.getByLabel("Width").blur();
  await expect(page.getByLabel("X position")).toHaveValue("80");
  await expect(page.getByLabel("Width")).toHaveValue("150");
});
test("C26 each annotation property set updates selected object", async ({
  page,
}) => {
  await load(page);
  for (const tool of ["Arrow", "Rectangle", "Text", "Number"]) {
    await draw(page, tool);
    if (tool === "Text") await page.getByLabel("Annotation text").blur();
    await page.getByLabel("Annotation color").fill("#22c55e");
    await page.getByLabel("Annotation color").blur();
    const label =
      tool === "Text"
        ? "Font size"
        : tool === "Number"
          ? "Marker size"
          : "Stroke width";
    await page.getByLabel(label).fill("12");
    await page.getByLabel(label).blur();
    await expect(page.getByLabel("Annotation color")).toHaveValue("#22c55e");
    await expect(page.getByLabel(label)).toHaveValue("12");
  }
});
test("C40 PNG export retains dimensions at different zooms", async ({
  page,
}) => {
  await load(page);
  for (const value of ["50", "200"]) {
    await page.getByLabel("Zoom percentage").fill(value);
    await page.getByLabel("Zoom percentage").blur();
    const result = await downloadPixels(page);
    expect([result.width, result.height]).toEqual([400, 300]);
  }
});
test("C41 compositor respects annotation order and excludes editor overlays", async ({
  page,
}) => {
  await load(page);
  await draw(page, "Redact");
  await draw(page, "Text", [80, 80], [80, 80]);
  await page.getByLabel("Annotation text").fill("");
  await page.getByLabel("Annotation text").blur();
  const result = await downloadPixels(page);
  expect(result.pixel).toEqual([0, 0, 0, 255]);
  expect(result.outside).toEqual([255, 255, 255, 255]);
});
test("C42 output replaces sensitive pixels with opaque black", async ({
  page,
}) => {
  await load(page);
  await draw(page, "Redact");
  const result = await downloadPixels(page);
  expect(result.pixel).toEqual([0, 0, 0, 255]);
  expect(result.outside).toEqual([255, 255, 255, 255]);
});
test("C43 clipboard writes PNG and reports success only after resolution", async ({
  page,
}) => {
  await load(page);
  await page.evaluate(() => {
    Object.defineProperty(window, "ClipboardItem", {
      configurable: true,
      value: class {
        constructor(public items: Record<string, unknown>) {}
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: (items: { items: Record<string, unknown> }[]) => {
          (window as unknown as Record<string, unknown>).clipboardTypes =
            Object.keys(items[0].items);
          return new Promise((resolve) => setTimeout(resolve, 500));
        },
      },
    });
  });
  await page.getByRole("button", { name: "Copy image", exact: true }).click();
  await expect(page.getByRole("status")).not.toContainText("Image copied");
  await expect(page.getByRole("status")).toContainText("Image copied");
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>).clipboardTypes,
    ),
  ).toEqual(["image/png"]);
});
test("C44 unavailable and rejected clipboard retain PNG fallback", async ({
  page,
}) => {
  await load(page);
  for (const mode of ["absent", "reject"]) {
    await page.evaluate(
      (mode) =>
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value:
            mode === "absent"
              ? undefined
              : { write: () => Promise.reject(new Error("Denied")) },
        }),
      mode,
    );
    await page.getByRole("button", { name: "Copy image", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Could not copy image. Export PNG instead.",
    );
    expect((await downloadPixels(page)).width).toBe(400);
  }
});
test("C45 render failure preserves session and offers retry", async ({
  page,
}) => {
  await load(page);
  await draw(page, "Rectangle");
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      callback(null);
    };
  });
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Could not export image. Please try again.",
  );
  await expect(page.getByTestId("annotation-count")).toHaveText("1 annotation");
  await expect(
    page.getByRole("button", { name: "Export PNG", exact: true }),
  ).toBeEnabled();
});
test("C46 screenshot content never enters network requests", async ({
  page,
}) => {
  await load(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("blob:")) requests.push(request.url());
  });
  await draw(page, "Rectangle");
  await downloadPixels(page);
  expect(requests).toEqual([]);
});
test("C47 reload discards session and browser stores stay empty", async ({
  page,
}) => {
  await load(page);
  await draw(page, "Rectangle");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Paste a screenshot to start" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).length),
  ).toBe(0);
});
test("C49 controls are named focusable DOM buttons", async ({ page }) => {
  await load(page);
  for (const name of [
    "Select",
    "Arrow",
    "Rectangle",
    "Text",
    "Redact",
    "Number",
    "Crop",
    "Copy image",
    "Export PNG",
  ]) {
    const button = page.getByRole("button", { name, exact: true });
    await button.focus();
    await expect(button).toBeFocused();
    expect(
      await button.evaluate((node) => getComputedStyle(node).outlineStyle),
    ).not.toBe("none");
  }
});
test("C50 active tool selected state is exposed", async ({ page }) => {
  await load(page);
  await page.getByRole("button", { name: "Arrow", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Arrow", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Select", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});
test("C51 feedback is a live region", async ({ page }) => {
  await expect(page.getByRole("status")).toHaveAttribute("aria-live", "polite");
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.getByRole("status")).toHaveText(
    "Could not decode this image.",
  );
});
test("C52 controls reachable at desktop and tablet widths without page overflow", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await load(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    for (const name of [
      "Undo",
      "Redo",
      "Fit to screen",
      "Copy image",
      "Export PNG",
    ])
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
  }
});
test("C53 file annotation undo redo PNG flow across engines", async ({
  page,
}) => {
  await load(page);
  await draw(page, "Rectangle");
  await expect(page.getByTestId("annotation-count")).toHaveText("1 annotation");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("annotation-count")).toHaveText(
    "0 annotations",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("annotation-count")).toHaveText("1 annotation");
  const result = await downloadPixels(page);
  expect([result.width, result.height]).toEqual([400, 300]);
});

test("C24 pointer resize retains image-space geometry after zoom change", async ({
  page,
}) => {
  await load(page);
  await draw(page, "Rectangle");
  const box = (await page.getByTestId("canvas-surface").boundingBox())!;
  await page.mouse.move(box.x + 162, box.y + 142);
  await page.mouse.down();
  await page.mouse.move(box.x + 202, box.y + 182, { steps: 5 });
  await page.mouse.up();
  const width = Number(await page.getByLabel("Width").inputValue());
  const height = Number(await page.getByLabel("Height").inputValue());
  expect(width).toBeGreaterThan(100);
  expect(height).toBeGreaterThan(80);
  await page.getByLabel("Zoom percentage").fill("50");
  await page.getByLabel("Zoom percentage").blur();
  expect(Number(await page.getByLabel("Width").inputValue())).toBe(width);
  expect(Number(await page.getByLabel("Height").inputValue())).toBe(height);
});
test("C34 crop cancel preserves exported document and annotation history", async ({
  page,
}) => {
  await load(page);
  await draw(page, "Rectangle");
  await draw(page, "Crop", [20, 20], [250, 200]);
  await page.getByRole("button", { name: "Cancel crop", exact: true }).click();
  await expect(page.getByTestId("image-size")).toHaveText("400 × 300");
  expect((await downloadPixels(page)).width).toBe(400);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("annotation-count")).toHaveText(
    "0 annotations",
  );
});
test("crop apply clips document output and undo restores original dimensions", async ({
  page,
}) => {
  await load(page);
  await draw(page, "Rectangle");
  await draw(page, "Crop", [20, 20], [250, 200]);
  await page.getByRole("button", { name: "Apply crop", exact: true }).click();
  await expect(page.getByTestId("image-size")).toHaveText("230 × 180");
  const cropped = await downloadPixels(page);
  expect([cropped.width, cropped.height]).toEqual([230, 180]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("image-size")).toHaveText("400 × 300");
});
