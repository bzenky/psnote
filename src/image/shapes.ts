import type { Annotation } from "../types/editor";
export type ShapeSpec = {
  kind: "Rect" | "Arrow" | "Text" | "Circle";
  props: Record<string, string | number | boolean | number[]>;
};
// The interactive editor and export compositor consume the same shape descriptions.
export function shapeSpecs(a: Annotation): ShapeSpec[] {
  switch (a.type) {
    case "rectangle":
      return [
        {
          kind: "Rect",
          props: {
            width: a.width,
            height: a.height,
            stroke: a.color,
            strokeWidth: a.strokeWidth,
          },
        },
      ];
    case "arrow":
      return [
        {
          kind: "Arrow",
          props: {
            points: [0, 0, a.width, a.height],
            stroke: a.color,
            fill: a.color,
            strokeWidth: a.strokeWidth,
            pointerLength: a.strokeWidth * 3,
            pointerWidth: a.strokeWidth * 3,
          },
        },
      ];
    case "redaction": {
      const x = Math.floor(a.x) - a.x;
      const y = Math.floor(a.y) - a.y;
      return [
        {
          kind: "Rect",
          props: {
            x,
            y,
            width: Math.ceil(a.x + a.width) - Math.floor(a.x),
            height: Math.ceil(a.y + a.height) - Math.floor(a.y),
            fill: "#000000",
          },
        },
      ];
    }
    case "text":
      return [
        {
          kind: "Rect",
          props: { width: a.width, height: a.height, fill: "transparent" },
        },
        {
          kind: "Text",
          props: {
            text: a.text,
            width: a.width,
            height: a.height,
            fontSize: a.fontSize,
            fontFamily: "Arial",
            fill: a.color,
            lineHeight: 1.2,
          },
        },
      ];
    case "marker":
      return [
        {
          kind: "Circle",
          props: {
            x: a.width / 2,
            y: a.width / 2,
            radius: a.width / 2,
            fill: a.color,
          },
        },
        {
          kind: "Text",
          props: {
            text: String(a.number),
            width: a.width,
            height: a.width,
            fontSize: a.width * 0.55,
            fontFamily: "Arial",
            fontStyle: "bold",
            align: "center",
            verticalAlign: "middle",
            fill: "#ffffff",
          },
        },
      ];
  }
}
