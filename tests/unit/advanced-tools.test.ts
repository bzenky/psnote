import { describe, expect, it } from "vitest";
import {
  cropDocument,
  historyReducer,
  initialDocument,
  initialHistory,
  newAnnotation,
  newFreehandAnnotation,
  resizeAnnotation,
} from "../../src/state/editor-store";
import type { Annotation, Point } from "../../src/types/editor";

function freehand(points: Point[]) {
  const annotation = newFreehandAnnotation(points);
  if (annotation?.type !== "freehand") throw new Error("Expected freehand");
  return annotation;
}

function renderedPoints(annotation: Extract<Annotation, { type: "freehand" }>) {
  return annotation.points.map((point) => ({
    x: annotation.x + point.x * annotation.width,
    y: annotation.y + point.y * annotation.height,
  }));
}

describe("advanced annotation creation", () => {
  it.each(["ellipse", "spotlight"] as const)(
    "creates %s with positive bounds for forward and reversed drags",
    (tool) => {
      const start = { x: 10, y: 20 };
      const end = { x: 70, y: 50 };
      for (const [from, to] of [
        [start, end],
        [end, start],
      ]) {
        const annotation = newAnnotation(tool, from, to, []);
        expect(annotation).toEqual({
          id: expect.any(String),
          type: tool,
          x: 10,
          y: 20,
          width: 60,
          height: 30,
          ...(tool === "ellipse" ? { color: "#ef4444", strokeWidth: 4 } : {}),
        });
      }
    },
  );

  it("normalizes the whole path without mutating or retaining input points", () => {
    const points = [
      { x: 30, y: 40 },
      { x: 10, y: 60 },
      { x: 50, y: 20 },
      { x: 30, y: 40 },
    ];
    const before = structuredClone(points);
    points.forEach(Object.freeze);
    Object.freeze(points);
    const annotation = freehand(points);
    expect(annotation).toEqual({
      id: expect.any(String),
      type: "freehand",
      x: 10,
      y: 20,
      width: 40,
      height: 40,
      color: "#ef4444",
      strokeWidth: 4,
      points: [
        { x: 0.5, y: 0.5 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
        { x: 0.5, y: 0.5 },
      ],
    });
    expect(points).toEqual(before);
    expect(annotation.points).not.toBe(points);
    annotation.points.forEach((point, index) =>
      expect(point).not.toBe(points[index]),
    );
    expect(renderedPoints(annotation)).toEqual(before);
    expect(freehand(before).id).not.toBe(annotation.id);
  });

  it.each([
    {
      points: [
        { x: 40, y: 20 },
        { x: 10, y: 20 },
      ],
      width: 30,
      height: 1,
      normalized: [
        { x: 1, y: 0 },
        { x: 0, y: 0 },
      ],
    },
    {
      points: [
        { x: 10, y: 50 },
        { x: 10, y: 20 },
      ],
      width: 1,
      height: 30,
      normalized: [
        { x: 0, y: 1 },
        { x: 0, y: 0 },
      ],
    },
    {
      points: [
        { x: 10, y: 20 },
        { x: 12, y: 20.5 },
      ],
      width: 2,
      height: 1,
      normalized: [
        { x: 0, y: 0 },
        { x: 1, y: 0.5 },
      ],
    },
  ])(
    "uses final minimum dimensions for normalization: $width × $height",
    ({ points, width, height, normalized }) => {
      const annotation = freehand(points);
      expect(annotation).toMatchObject({ width, height, points: normalized });
      expect(renderedPoints(annotation)).toEqual(points);
    },
  );

  it.each([
    { points: [] },
    { points: [{ x: 10, y: 20 }] },
    {
      points: [
        { x: 10, y: 20 },
        { x: 10, y: 20 },
      ],
    },
    {
      points: [
        { x: 10, y: 20 },
        { x: 10.5, y: 20.75 },
        { x: 10, y: 20 },
      ],
    },
  ])(
    "rejects paths with fewer than two points or subpixel bounds: $points",
    ({ points }) => {
      expect(newFreehandAnnotation(points)).toBeNull();
    },
  );

  it("accepts exactly one pixel of movement and supports the two-point tool fallback", () => {
    const start = { x: 10, y: 20 };
    const end = { x: 11, y: 20 };
    expect(newAnnotation("freehand", start, end, [])).toEqual({
      ...freehand([start, end]),
      id: expect.any(String),
    });
    expect(newAnnotation("freehand", start, start, [])).toBeNull();
  });
});

describe("advanced annotation dimensions", () => {
  it("resizes freehand bounds while preserving normalized points and stroke width", () => {
    const annotation = freehand([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 20 },
    ]);
    const resized = resizeAnnotation(annotation, 100, 200, 2, 0.5);
    if (resized.type !== "freehand") throw new Error("Expected freehand");
    expect(resized).toMatchObject({
      x: 100,
      y: 200,
      width: 80,
      height: 10,
      strokeWidth: 4,
    });
    expect(resized.points).toBe(annotation.points);
    expect(renderedPoints(resized)).toEqual([
      { x: 100, y: 200 },
      { x: 140, y: 210 },
      { x: 180, y: 200 },
    ]);
    expect(annotation).toMatchObject({ x: 10, y: 20, width: 40, height: 20 });
    expect(resizeAnnotation(annotation, 0, 0, 0, 0)).toMatchObject({
      width: 1,
      height: 1,
    });
  });

  it("dimension property edits scale the path without rewriting points", () => {
    const annotation = freehand([
      { x: 10, y: 20 },
      { x: 30, y: 30 },
      { x: 50, y: 40 },
    ]);
    const edited = { ...annotation, width: 80, height: 60 };
    expect(edited.points).toBe(annotation.points);
    expect(renderedPoints(edited)).toEqual([
      { x: 10, y: 20 },
      { x: 50, y: 50 },
      { x: 90, y: 80 },
    ]);
  });

  it.each(["ellipse", "spotlight"] as const)(
    "resizes %s using rectangle-like geometry",
    (tool) => {
      const annotation = newAnnotation(
        tool,
        { x: 10, y: 20 },
        { x: 50, y: 40 },
        [],
      )!;
      expect(resizeAnnotation(annotation, 30, 40, 2, 0.5)).toEqual({
        ...annotation,
        x: 30,
        y: 40,
        width: 80,
        height: 10,
      });
    },
  );
});

describe("advanced annotation crop and history", () => {
  it.each(["ellipse", "freehand"] as const)(
    "includes %s stroke extents at each crop edge",
    (tool) => {
      const base = newAnnotation(tool, { x: 0, y: 0 }, { x: 10, y: 10 }, [])!;
      const annotations = [
        { ...base, id: "left", x: 39, y: 60 },
        { ...base, id: "right", x: 151, y: 60 },
        { ...base, id: "top", x: 60, y: 39 },
        { ...base, id: "bottom", x: 60, y: 151 },
        { ...base, id: "outside", x: 38, y: 60 },
      ];
      const cropped = cropDocument(
        { ...initialDocument(200, 200), annotations },
        { x: 50, y: 50, width: 100, height: 100 },
      );
      expect(cropped.annotations.map((a) => a.id)).toEqual([
        "left",
        "right",
        "top",
        "bottom",
      ]);
    },
  );

  it("translates retained paths and spotlight bounds without clipping, and preserves them through undo/redo", () => {
    const path = freehand([
      { x: 40, y: 40 },
      { x: 70, y: 80 },
      { x: 100, y: 60 },
    ]);
    const spotlight = newAnnotation(
      "spotlight",
      { x: 30, y: 20 },
      { x: 90, y: 100 },
      [],
    )!;
    const outside = { ...spotlight, id: "outside", x: 160 };
    const before = {
      ...initialDocument(200, 200),
      annotations: [path, spotlight, outside],
    };
    const snapshot = structuredClone(before);
    const after = cropDocument(before, {
      x: 50,
      y: 50,
      width: 100,
      height: 100,
    });
    expect(after.crop).toEqual({ x: 50, y: 50, width: 100, height: 100 });
    expect(after.annotations).toEqual([
      { ...path, x: -10, y: -10 },
      { ...spotlight, x: -20, y: -30 },
    ]);
    const croppedPath = after.annotations[0];
    if (croppedPath.type !== "freehand") throw new Error("Expected freehand");
    expect(croppedPath.points).toBe(path.points);
    expect(renderedPoints(croppedPath)).toEqual([
      { x: -10, y: -10 },
      { x: 20, y: 30 },
      { x: 50, y: 10 },
    ]);
    expect(before).toEqual(snapshot);

    const edited = historyReducer(initialHistory(before), {
      type: "edit",
      document: after,
    });
    const undone = historyReducer(edited, { type: "undo" });
    expect(undone.present).toEqual(snapshot);
    expect(historyReducer(undone, { type: "redo" }).present).toEqual(after);
  });

  it("does not add stroke padding to spotlight bounds", () => {
    const spotlight = newAnnotation(
      "spotlight",
      { x: 40, y: 60 },
      { x: 50, y: 70 },
      [],
    )!;
    const cropped = cropDocument(
      { ...initialDocument(200, 200), annotations: [spotlight] },
      { x: 50, y: 50, width: 100, height: 100 },
    );
    expect(cropped.annotations).toEqual([]);
  });

  it("keeps path previews as one undo step and restores dimension edits on redo", () => {
    const path = freehand([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    const before = { ...initialDocument(200, 200), annotations: [path] };
    let state = initialHistory(before);
    for (const width of [40, 60]) {
      state = historyReducer(state, {
        type: "preview",
        document: { ...before, annotations: [{ ...path, width }] },
      });
    }
    state = historyReducer(state, { type: "commit" });
    expect(state.past).toHaveLength(1);
    const undone = historyReducer(state, { type: "undo" });
    expect(undone.present).toEqual(before);
    expect(historyReducer(undone, { type: "redo" }).present).toEqual(
      state.present,
    );
    expect(path.width).toBe(20);
  });
});
