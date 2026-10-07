import { afterEach, describe, expect, it, vi } from "vitest";
import {
  newAnnotation,
  newFreehandAnnotation,
} from "../../src/state/editor-store";

const start = { x: 10, y: 20 };
const end = { x: 100, y: 80 };
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function withoutRandomUUID() {
  vi.stubGlobal("crypto", {
    getRandomValues: crypto.getRandomValues.bind(crypto),
  });
}

describe("annotation IDs", () => {
  it("uses randomUUID when the browser exposes it", () => {
    const id = "12345678-1234-4567-89ab-123456789abc";
    const randomUUID = vi.spyOn(crypto, "randomUUID").mockReturnValue(id);
    expect(newAnnotation("rectangle", start, end, [])?.id).toBe(id);
    expect(newFreehandAnnotation([start, end])?.id).toBe(id);
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it.each([
    "arrow",
    "rectangle",
    "ellipse",
    "spotlight",
    "redaction",
    "text",
    "marker",
    "freehand",
  ] as const)("creates %s without randomUUID on HTTP LAN origins", (tool) => {
    withoutRandomUUID();
    expect(newAnnotation(tool, start, end, [])?.id).toMatch(uuidPattern);
  });

  it("creates unique UUIDs across regular annotations and freehand strokes", () => {
    withoutRandomUUID();
    const ids = Array.from({ length: 500 }, (_, index) =>
      index % 2 === 0
        ? newAnnotation("rectangle", start, end, [])!.id
        : newFreehandAnnotation([start, end])!.id,
    );
    ids.forEach((id) => expect(id).toMatch(uuidPattern));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
