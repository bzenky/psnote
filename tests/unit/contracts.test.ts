import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import {
  initialDocument,
  historyReducer,
  initialHistory,
  cropDocument,
  newAnnotation,
  resizeAnnotation,
  clampZoom,
  fitZoom,
} from "../../src/state/editor-store";
import {
  validateFile,
  validateDimensions,
  createLoadCoordinator,
  releaseSource,
} from "../../src/image/loader";
import { shortcutAction } from "../../src/shortcuts/shortcuts";
import type { Annotation } from "../../src/types/editor";

const rect: Annotation = {
  id: "r",
  type: "rectangle",
  x: 10,
  y: 20,
  width: 100,
  height: 80,
  color: "#ef4444",
  strokeWidth: 4,
};
const document = () => ({ ...initialDocument(400, 300), annotations: [rect] });
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

describe("foundation", () => {
  it("C1 locked install", () => {
    const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
    expect(lock.packages[""].dependencies).toEqual(pkg.dependencies);
    expect(lock.packages[""].devDependencies).toEqual(pkg.devDependencies);
    for (const version of Object.values(pkg.dependencies))
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it("C2 local development command", () =>
    expect(pkg.scripts.dev).toBe("vite --host 127.0.0.1"));
  it("C3 static build command", () =>
    expect(pkg.scripts.build).toBe("tsc --noEmit && vite build"));
  it("C4 verification stops on failed gates", () =>
    expect(pkg.scripts.verify).toBe(
      "npm run typecheck && npm run lint && npm test && npm run build",
    ));
  it("C5 three engine browser configuration", async () => {
    const { default: config } = await import("../../playwright.config");
    expect(config.projects?.map((p) => p.name)).toEqual([
      "chromium",
      "firefox",
      "webkit",
    ]);
  });
});

describe("input contracts", () => {
  it("C11 rejects every invalid input and exact limits", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(validateFile({ type, size: 20 * 1024 * 1024 })).toBeNull();
    }
    expect(validateFile({ type: "image/svg+xml", size: 100 })).toBe(
      "Use a PNG, JPEG, or WebP image.",
    );
    expect(
      validateFile({ type: "image/png", size: 20 * 1024 * 1024 + 1 }),
    ).toBe("Image exceeds 20 MiB.");
    expect(validateDimensions(5000, 4000)).toBeNull();
    expect(validateDimensions(5000, 4001)).toBe(
      "Image exceeds 20 million pixels.",
    );
    expect(validateDimensions(0, 1)).toBe("Could not decode this image.");
  });
  it("C13 overlapping loads accept latest only", async () => {
    const coordinator = createLoadCoordinator();
    const a = coordinator.begin();
    const b = coordinator.begin();
    expect(coordinator.isCurrent(a)).toBe(false);
    expect(coordinator.isCurrent(b)).toBe(true);
    coordinator.cancel();
    expect(coordinator.isCurrent(b)).toBe(false);
  });
  it("C15 replacement initializes zero annotations and history", () => {
    const state = initialHistory(initialDocument(640, 480));
    expect(state.present).toEqual({
      crop: { x: 0, y: 0, width: 640, height: 480 },
      annotations: [],
    });
    expect(state.past).toEqual([]);
    expect(state.future).toEqual([]);
  });
  it("C48 releases discarded image source exactly once", () => {
    const dispose = vi.fn();
    const source = {
      width: 400,
      height: 300,
      image: {} as HTMLImageElement,
      dispose,
    };
    releaseSource(source);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe("document editing", () => {
  it("C22 numbers markers without renumbering survivors", () => {
    const doc = initialDocument(400, 300);
    const first = newAnnotation(
      "marker",
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      doc.annotations,
    );
    expect(first?.type === "marker" && first.number).toBe(1);
    const next = newAnnotation("marker", { x: 20, y: 20 }, { x: 20, y: 20 }, [
      first!,
    ]);
    expect(next?.type === "marker" && next.number).toBe(2);
    const third = newAnnotation("marker", { x: 30, y: 30 }, { x: 30, y: 30 }, [
      next!,
    ]);
    expect(third?.type === "marker" && third.number).toBe(3);
    expect(next?.type === "marker" && next.number).toBe(2);
  });
  it("C24 resized geometry is expressed in image coordinates", () => {
    const changed = resizeAnnotation(rect, 25, 30, 2, 0.5);
    expect(changed).toMatchObject({ x: 25, y: 30, width: 200, height: 40 });
    const text: Annotation = {
      id: "t",
      type: "text",
      x: 0,
      y: 0,
      width: 200,
      height: 50,
      text: "Hello",
      fontSize: 24,
      color: "#ef4444",
    };
    expect(resizeAnnotation(text, 0, 0, 2, 2)).toMatchObject({
      width: 400,
      height: 100,
      fontSize: 24,
    });
  });
  it("C25 deletes only requested annotation", () => {
    const doc = {
      ...document(),
      annotations: [rect, { ...rect, id: "other" }],
    };
    const result = historyReducer(initialHistory(doc), {
      type: "delete",
      id: "r",
    });
    expect(result.present.annotations.map((a) => a.id)).toEqual(["other"]);
  });
  it("C27 edits preserve source-independent document and old snapshots", () => {
    const doc = document();
    const result = historyReducer(initialHistory(doc), {
      type: "edit",
      document: { ...doc, annotations: [] },
    });
    expect(doc.annotations).toEqual([rect]);
    expect(result.past[0]).toBe(doc);
    expect(Object.keys(result.present).sort()).toEqual(["annotations", "crop"]);
  });
  it("C28 undo restores preceding document including crop", () => {
    const before = document();
    const after = cropDocument(before, {
      x: 20,
      y: 30,
      width: 200,
      height: 100,
    });
    const result = historyReducer(
      historyReducer(initialHistory(before), { type: "edit", document: after }),
      { type: "undo" },
    );
    expect(result.present).toEqual(before);
  });
  it("C29 redo restores undone document", () => {
    const before = document();
    const after = { ...before, annotations: [] };
    const edited = historyReducer(initialHistory(before), {
      type: "edit",
      document: after,
    });
    expect(
      historyReducer(historyReducer(edited, { type: "undo" }), { type: "redo" })
        .present,
    ).toEqual(after);
  });
  it("C30 new edit invalidates redo branch", () => {
    const state = historyReducer(
      historyReducer(initialHistory(document()), { type: "delete", id: "r" }),
      { type: "undo" },
    );
    const result = historyReducer(state, {
      type: "edit",
      document: { ...state.present, annotations: [{ ...rect, x: 99 }] },
    });
    expect(result.future).toEqual([]);
    expect(
      historyReducer(result, { type: "redo" }).present.annotations[0].x,
    ).toBe(99);
  });
  it("C31 interaction previews produce one undo step", () => {
    let state = initialHistory(document());
    for (const x of [20, 30, 40])
      state = historyReducer(state, {
        type: "preview",
        document: { ...state.present, annotations: [{ ...rect, x }] },
      });
    expect(state.past).toHaveLength(0);
    state = historyReducer(state, { type: "commit" });
    expect(state.past).toHaveLength(1);
    expect(
      historyReducer(state, { type: "undo" }).present.annotations[0].x,
    ).toBe(10);
  });
  it("C32 crop sets exact output bounds", () => {
    expect(
      cropDocument(document(), { x: 30, y: 40, width: 120, height: 90 }).crop,
    ).toEqual({ x: 30, y: 40, width: 120, height: 90 });
  });
  it("C33 crop retains inside and partial intersections and removes outside", () => {
    const doc = {
      ...document(),
      annotations: [
        rect,
        { ...rect, id: "inside", x: 60, y: 60, width: 20, height: 20 },
        { ...rect, id: "outside", x: 300 },
      ],
    };
    const cropped = cropDocument(doc, {
      x: 50,
      y: 50,
      width: 100,
      height: 100,
    });
    expect(cropped.annotations.map((a) => a.id)).toEqual(["r", "inside"]);
    expect(cropped.annotations[0]).toMatchObject({
      x: -40,
      y: -30,
      width: 100,
      height: 80,
    });
    expect(cropped.annotations[1]).toMatchObject({ x: 10, y: 10 });
    const twice = cropDocument(cropped, {
      x: 10,
      y: 10,
      width: 50,
      height: 50,
    });
    expect(twice.crop).toEqual({ x: 60, y: 60, width: 50, height: 50 });
  });
  it("C34 cancelling crop keeps document and history unchanged", () => {
    const state = initialHistory(document());
    expect(historyReducer(state, { type: "commit" })).toBe(state);
  });
  it("C35 zoom clamps all four boundaries", () => {
    expect([0, 0.1, 4, 5].map(clampZoom)).toEqual([0.1, 0.1, 4, 4]);
  });
  it("C36 fit uses both viewport dimensions", () => {
    expect(fitZoom(1000, 500, 500, 500)).toBe(0.5);
    expect(fitZoom(500, 1000, 500, 500)).toBe(0.5);
  });
});

describe("keyboard mapping", () => {
  it("C37 maps all ten annotation tool letters", () => {
    expect(
      ["v", "a", "r", "e", "p", "s", "t", "b", "n", "c"].map((key) =>
        shortcutAction({ key }),
      ),
    ).toEqual([
      "select",
      "arrow",
      "rectangle",
      "ellipse",
      "freehand",
      "spotlight",
      "text",
      "redaction",
      "marker",
      "crop",
    ]);
  });
  it("C38 leaves editable field shortcuts and Delete native", () => {
    for (const key of [
      "v",
      "a",
      "r",
      "e",
      "p",
      "s",
      "t",
      "b",
      "n",
      "c",
      "Delete",
      "z",
    ])
      expect(shortcutAction({ key, editable: true, ctrlKey: true })).toBeNull();
  });
  it("C39 maps history deletion and view keys on both platforms", () => {
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
      expect(shortcutAction({ key: "z", ...modifier })).toBe("undo");
      expect(shortcutAction({ key: "z", shiftKey: true, ...modifier })).toBe(
        "redo",
      );
    }
    expect(
      ["Delete", "+", "-", "0"].map((key) => shortcutAction({ key })),
    ).toEqual(["delete", "zoom-in", "zoom-out", "fit"]);
  });
});

it("marker vertical scaling keeps uniform resized dimensions", () => {
  const marker: Annotation = {
    id: "m",
    type: "marker",
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    color: "#ef4444",
    number: 1,
  };
  expect(resizeAnnotation(marker, 10, 20, 1, 2)).toMatchObject({
    x: 10,
    y: 20,
    width: 80,
    height: 80,
  });
});
