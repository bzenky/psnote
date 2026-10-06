import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadImage } from "../../src/image/loader";
const OriginalURL = URL;
const decodeDescriptor = Object.getOwnPropertyDescriptor(
  HTMLImageElement.prototype,
  "decode",
);
const revoke = vi.fn();
let decode: ReturnType<typeof vi.fn>;
beforeEach(() => {
  revoke.mockClear();
  vi.stubGlobal(
    "URL",
    class extends OriginalURL {
      static createObjectURL = vi.fn(() => "blob:local-image");
      static revokeObjectURL = revoke;
    },
  );
  decode = vi.fn(async function (this: HTMLImageElement) {
    Object.defineProperties(this, {
      naturalWidth: { value: 400 },
      naturalHeight: { value: 300 },
    });
  });
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: decode,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (decodeDescriptor)
    Object.defineProperty(
      HTMLImageElement.prototype,
      "decode",
      decodeDescriptor,
    );
  else Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
});
it("real loader releases URL and image reference only once when discarded", async () => {
  const source = await loadImage(
    new File(["image"], "source.png", { type: "image/png" }),
  );
  expect([source.width, source.height]).toEqual([400, 300]);
  source.dispose();
  source.dispose();
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:local-image");
  expect(source.image.getAttribute("src")).toBe("");
});
it("real loader releases URLs on decoder and pixel-bound failures", async () => {
  decode.mockRejectedValueOnce(new Error("bad decoder"));
  await expect(
    loadImage(new File(["image"], "bad.png", { type: "image/png" })),
  ).rejects.toThrow("Could not decode this image.");
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:local-image");
  revoke.mockClear();
  decode.mockImplementationOnce(async function (this: HTMLImageElement) {
    Object.defineProperties(this, {
      naturalWidth: { value: 5000 },
      naturalHeight: { value: 4001 },
    });
  });
  await expect(
    loadImage(new File(["image"], "large.png", { type: "image/png" })),
  ).rejects.toThrow("Image exceeds 20 million pixels.");
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:local-image");
});
