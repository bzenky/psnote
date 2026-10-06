import { beforeAll, afterAll, expect, it } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import {
  createCanvas,
  loadImage,
  type Canvas as NativeCanvas,
} from "@napi-rs/canvas";
import { renderPNG } from "../../src/image/export";
import {
  initialDocument,
  cropDocument,
  initialHistory,
  historyReducer,
  resizeAnnotation,
} from "../../src/state/editor-store";
import { shapeSpecs, spotlightSpecs } from "../../src/image/shapes";
import type { Annotation, ImageSource } from "../../src/types/editor";

const surfaces = new WeakMap<HTMLCanvasElement, NativeCanvas>();
const width = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  "width",
)!;
const height = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  "height",
)!;
const context = HTMLCanvasElement.prototype.getContext;
const toBlob = HTMLCanvasElement.prototype.toBlob;
function surface(element: HTMLCanvasElement) {
  let canvas = surfaces.get(element);
  if (!canvas) {
    canvas = createCanvas(element.width || 1, element.height || 1);
    surfaces.set(element, canvas);
  }
  return canvas;
}
beforeAll(() => {
  for (const [name, descriptor] of [
    ["width", width],
    ["height", height],
  ] as const) {
    Object.defineProperty(HTMLCanvasElement.prototype, name, {
      ...descriptor,
      set(value: number) {
        descriptor.set!.call(this, value);
        const canvas = surfaces.get(this);
        if (canvas) canvas[name] = Math.max(1, value);
      },
    });
  }
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    const native = surface(this).getContext("2d");
    // Konva copies its DOM canvas between layers; translate only those draw sources.
    return new Proxy(native, {
      get(target, key) {
        if (key === "drawImage")
          return (image: unknown, ...args: number[]) =>
            Reflect.apply(target.drawImage, target, [
              image instanceof HTMLCanvasElement ? surface(image) : image,
              ...args,
            ]);
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set(target, key, value) {
        return Reflect.set(target, key, value, target);
      },
    });
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = function (callback) {
    const bytes = surface(this).toBuffer("image/png");
    callback(
      new NodeBlob([new Uint8Array(bytes)], {
        type: "image/png",
      }) as unknown as Blob,
    );
  };
});
afterAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "width", width);
  Object.defineProperty(HTMLCanvasElement.prototype, "height", height);
  HTMLCanvasElement.prototype.getContext = context;
  HTMLCanvasElement.prototype.toBlob = toBlob;
});
async function source(): Promise<ImageSource> {
  const canvas = createCanvas(400, 300);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 400, 300);
  ctx.fillStyle = "#33aaff";
  ctx.fillRect(50, 50, 100, 100);
  return {
    image: (await loadImage(
      canvas.toBuffer("image/png"),
    )) as unknown as HTMLImageElement,
    width: 400,
    height: 300,
    dispose: () => {},
  };
}
async function pixels(blob: Blob) {
  const image = await loadImage(
    Buffer.from(await (blob as unknown as NodeBlob).arrayBuffer()),
  );
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    pixel: (x: number, y: number) =>
      Array.from(ctx.getImageData(x, y, 1, 1).data),
  };
}
const redaction: Annotation = {
  id: "black",
  type: "redaction",
  x: 60,
  y: 60,
  width: 100,
  height: 80,
};

it("redaction replaces sensitive source pixels with opaque black in PNG", async () => {
  const doc = { ...initialDocument(400, 300), annotations: [redaction] };
  const output = await pixels(await renderPNG(await source(), doc));
  expect(output.pixel(100, 100)).toEqual([0, 0, 0, 255]);
  expect(output.pixel(55, 55)).toEqual([51, 170, 255, 255]);
  expect(output.pixel(250, 200)).toEqual([255, 255, 255, 255]);
});
it("PNG uses document dimensions and omits selection crop and toolbar UI", async () => {
  const doc = cropDocument(
    { ...initialDocument(400, 300), annotations: [redaction] },
    { x: 50, y: 50, width: 150, height: 100 },
  );
  const output = await pixels(await renderPNG(await source(), doc));
  expect([output.width, output.height]).toEqual([150, 100]);
  expect(output.pixel(50, 50)).toEqual([0, 0, 0, 255]);
  expect(output.pixel(0, 0)).toEqual([51, 170, 255, 255]);
});
it("PNG composites newer annotations above redaction and never restores source pixels", async () => {
  const marker: Annotation = {
    id: "marker",
    type: "marker",
    x: 70,
    y: 70,
    width: 60,
    height: 60,
    color: "#22c55e",
    number: 1,
  };
  const doc = {
    ...initialDocument(400, 300),
    annotations: [redaction, marker],
  };
  const output = await pixels(await renderPNG(await source(), doc));
  expect(output.pixel(100, 80)).toEqual([34, 197, 94, 255]);
  const reverse = await pixels(
    await renderPNG(await source(), {
      ...doc,
      annotations: [marker, redaction],
    }),
  );
  expect(reverse.pixel(100, 80)).toEqual([0, 0, 0, 255]);
});
const ellipse: Annotation = {
  id: "ellipse",
  type: "ellipse",
  x: 180,
  y: 40,
  width: 100,
  height: 60,
  color: "#ff0000",
  strokeWidth: 6,
};
const freehand: Annotation = {
  id: "freehand",
  type: "freehand",
  x: 180,
  y: 140,
  width: 100,
  height: 80,
  color: "#ff0000",
  strokeWidth: 6,
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
  ],
};
const spotlight: Annotation = {
  id: "spotlight",
  type: "spotlight",
  x: 50,
  y: 50,
  width: 100,
  height: 100,
};

it("shared specs keep ellipse and freehand geometry local and spotlight masks separate", () => {
  expect(shapeSpecs(ellipse)).toEqual([
    {
      kind: "Ellipse",
      props: {
        x: 50,
        y: 30,
        radiusX: 50,
        radiusY: 30,
        stroke: "#ff0000",
        strokeWidth: 6,
      },
    },
  ]);
  expect(shapeSpecs(freehand)).toEqual([
    {
      kind: "Line",
      props: {
        points: [0, 0, 100, 0, 100, 80],
        stroke: "#ff0000",
        strokeWidth: 6,
        lineCap: "round",
        lineJoin: "round",
      },
    },
  ]);
  expect(shapeSpecs(spotlight)).toEqual([
    { kind: "Rect", props: { width: 100, height: 100, fill: "transparent" } },
  ]);
  expect(spotlightSpecs([ellipse, freehand], 400, 300)).toEqual([]);
  expect(spotlightSpecs([ellipse, spotlight], 400, 300)).toEqual([
    {
      kind: "Rect",
      props: {
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        fill: "#000000",
        opacity: 0.6,
      },
    },
    {
      kind: "Rect",
      props: {
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        fill: "#000000",
        globalCompositeOperation: "destination-out",
      },
    },
  ]);
});
it("PNG draws an ellipse outline without filling its center or bounding-box corners", async () => {
  const output = await pixels(
    await renderPNG(await source(), {
      ...initialDocument(400, 300),
      annotations: [ellipse],
    }),
  );
  expect(output.pixel(230, 40)).toEqual([255, 0, 0, 255]);
  expect(output.pixel(180, 70)).toEqual([255, 0, 0, 255]);
  expect(output.pixel(230, 70)).toEqual([255, 255, 255, 255]);
  expect(output.pixel(182, 42)).toEqual([255, 255, 255, 255]);
});
it("PNG scales normalized freehand points with resized bounds and keeps rounded strokes", async () => {
  const image = await source();
  const doc = { ...initialDocument(400, 300), annotations: [freehand] };
  const output = await pixels(await renderPNG(image, doc));
  expect(output.pixel(230, 140)).toEqual([255, 0, 0, 255]);
  expect(output.pixel(280, 180)).toEqual([255, 0, 0, 255]);
  expect(output.pixel(178, 140)).toEqual([255, 0, 0, 255]);
  expect(output.pixel(230, 180)).toEqual([255, 255, 255, 255]);
  const scaled = resizeAnnotation(freehand, 180, 140, 0.5, 0.5);
  const resized = await pixels(
    await renderPNG(image, { ...doc, annotations: [scaled] }),
  );
  expect(resized.pixel(205, 140)).toEqual([255, 0, 0, 255]);
  expect(resized.pixel(230, 160)).toEqual([255, 0, 0, 255]);
  expect(resized.pixel(280, 180)).toEqual([255, 255, 255, 255]);
});
it("spotlight preserves source pixels inside its hole and dims outside without changing source", async () => {
  const image = await source();
  const doc = { ...initialDocument(400, 300), annotations: [spotlight] };
  const output = await pixels(await renderPNG(image, doc));
  expect(output.pixel(100, 100)).toEqual([51, 170, 255, 255]);
  expect(output.pixel(250, 200)).toEqual([102, 102, 102, 255]);
  const unmasked = await pixels(
    await renderPNG(image, { ...doc, annotations: [] }),
  );
  expect(unmasked.pixel(100, 100)).toEqual([51, 170, 255, 255]);
  expect(unmasked.pixel(250, 200)).toEqual([255, 255, 255, 255]);
});
it("multiple spotlight holes form a clear union including their overlap", async () => {
  const output = await pixels(
    await renderPNG(await source(), {
      ...initialDocument(400, 300),
      annotations: [spotlight, { ...spotlight, id: "second", x: 100, y: 100 }],
    }),
  );
  expect(output.pixel(75, 75)).toEqual([51, 170, 255, 255]);
  expect(output.pixel(125, 125)).toEqual([51, 170, 255, 255]);
  expect(output.pixel(175, 175)).toEqual([255, 255, 255, 255]);
  expect(output.pixel(250, 200)).toEqual([102, 102, 102, 255]);
});
it("annotations and redaction stay above the mask regardless of spotlight order", async () => {
  const image = await source();
  for (const annotations of [
    [spotlight, redaction, ellipse, freehand],
    [redaction, ellipse, freehand, spotlight],
  ]) {
    const output = await pixels(
      await renderPNG(image, {
        ...initialDocument(400, 300),
        annotations,
      }),
    );
    expect(output.pixel(100, 100)).toEqual([0, 0, 0, 255]);
    expect(output.pixel(155, 100)).toEqual([0, 0, 0, 255]);
    expect(output.pixel(230, 40)).toEqual([255, 0, 0, 255]);
    expect(output.pixel(230, 140)).toEqual([255, 0, 0, 255]);
  }
});
it("crop, undo and redo export correct dimensions and translated Phase 3 geometry", async () => {
  const image = await source();
  const doc = {
    ...initialDocument(400, 300),
    annotations: [spotlight, ellipse, freehand],
  };
  const cropped = cropDocument(doc, { x: 50, y: 30, width: 250, height: 200 });
  const edited = historyReducer(initialHistory(doc), {
    type: "edit",
    document: cropped,
  });
  const undone = historyReducer(edited, { type: "undo" });
  const redone = historyReducer(undone, { type: "redo" });
  for (const state of [edited, redone]) {
    const output = await pixels(await renderPNG(image, state.present));
    expect([output.width, output.height]).toEqual([250, 200]);
    expect(output.pixel(50, 70)).toEqual([51, 170, 255, 255]);
    expect(output.pixel(190, 160)).toEqual([102, 102, 102, 255]);
    expect(output.pixel(180, 10)).toEqual([255, 0, 0, 255]);
    expect(output.pixel(180, 110)).toEqual([255, 0, 0, 255]);
  }
  const restored = await pixels(await renderPNG(image, undone.present));
  expect([restored.width, restored.height]).toEqual([400, 300]);
  expect(restored.pixel(100, 100)).toEqual([51, 170, 255, 255]);
  expect(restored.pixel(230, 40)).toEqual([255, 0, 0, 255]);
  expect(restored.pixel(230, 140)).toEqual([255, 0, 0, 255]);
});

it("fractional redaction bounds replace every touched source pixel", async () => {
  const output = await pixels(
    await renderPNG(await source(), {
      ...initialDocument(400, 300),
      annotations: [{ ...redaction, x: 60.5, y: 60.5, width: 10, height: 10 }],
    }),
  );
  expect(output.pixel(60, 60)).toEqual([0, 0, 0, 255]);
  expect(output.pixel(70, 70)).toEqual([0, 0, 0, 255]);
});
