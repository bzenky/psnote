import { beforeAll, afterAll, expect, it } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import {
  createCanvas,
  loadImage,
  type Canvas as NativeCanvas,
} from "@napi-rs/canvas";
import { renderPNG } from "../../src/image/export";
import { initialDocument, cropDocument } from "../../src/state/editor-store";
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
