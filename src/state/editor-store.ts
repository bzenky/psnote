import type {
  Annotation,
  Bounds,
  EditorDocument,
  HistoryAction,
  HistoryState,
  Point,
  Tool,
} from "../types/editor";

export const initialDocument = (
  width: number,
  height: number,
): EditorDocument => ({ crop: { x: 0, y: 0, width, height }, annotations: [] });
export const initialHistory = (present: EditorDocument): HistoryState => ({
  past: [],
  present,
  future: [],
  baseline: null,
});
const equalDocument = (a: EditorDocument, b: EditorDocument) =>
  JSON.stringify(a) === JSON.stringify(b);

export function historyReducer(
  state: HistoryState,
  action: HistoryAction,
): HistoryState {
  if (action.type === "reset") return initialHistory(action.document);
  if (action.type === "preview")
    return {
      ...state,
      baseline: state.baseline ?? state.present,
      present: action.document,
    };
  if (action.type === "commit") {
    if (!state.baseline) return state;
    if (equalDocument(state.baseline, state.present))
      return { ...state, baseline: null };
    return {
      past: [...state.past, state.baseline],
      present: state.present,
      future: [],
      baseline: null,
    };
  }
  const current = state.baseline
    ? historyReducer(state, { type: "commit" })
    : state;
  if (action.type === "undo") {
    const previous = current.past.at(-1);
    return previous
      ? {
          past: current.past.slice(0, -1),
          present: previous,
          future: [current.present, ...current.future],
          baseline: null,
        }
      : current;
  }
  if (action.type === "redo") {
    const next = current.future[0];
    return next
      ? {
          past: [...current.past, current.present],
          present: next,
          future: current.future.slice(1),
          baseline: null,
        }
      : current;
  }
  if (action.type !== "edit" && action.type !== "delete") return current;
  const document =
    action.type === "delete"
      ? {
          ...current.present,
          annotations: current.present.annotations.filter(
            (a) => a.id !== action.id,
          ),
        }
      : action.document;
  if (equalDocument(document, current.present)) return current;
  return {
    past: [...current.past, current.present],
    present: document,
    future: [],
    baseline: null,
  };
}

export function boundsFromPoints(start: Point, end: Point): Bounds {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}
export function newAnnotation(
  tool: Tool,
  start: Point,
  end: Point,
  annotations: Annotation[],
): Annotation | null {
  const id = crypto.randomUUID();
  const color = "#ef4444";
  const bounds = boundsFromPoints(start, end);
  switch (tool) {
    case "arrow":
      return {
        id,
        type: "arrow",
        ...start,
        width: end.x - start.x,
        height: end.y - start.y,
        color,
        strokeWidth: 4,
      };
    case "rectangle":
      return { id, type: "rectangle", ...bounds, color, strokeWidth: 4 };
    case "redaction":
      return { id, type: "redaction", ...bounds };
    case "text":
      return {
        id,
        type: "text",
        ...start,
        width: 240,
        height: 64,
        text: "",
        fontSize: 24,
        color,
      };
    case "marker":
      return {
        id,
        type: "marker",
        x: start.x - 20,
        y: start.y - 20,
        width: 40,
        height: 40,
        number:
          Math.max(
            0,
            ...annotations
              .filter((a) => a.type === "marker")
              .map((a) => a.number),
          ) + 1,
        color,
      };
    default:
      return null;
  }
}
export function resizeAnnotation(
  a: Annotation,
  x: number,
  y: number,
  scaleX: number,
  scaleY: number,
): Annotation {
  const markerScale =
    Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
  const width =
    a.type === "arrow"
      ? a.width * scaleX
      : Math.max(1, a.width * (a.type === "marker" ? markerScale : scaleX));
  const height =
    a.type === "arrow" ? a.height * scaleY : Math.max(1, a.height * scaleY);
  return { ...a, x, y, width, height: a.type === "marker" ? width : height };
}
export function cropDocument(
  document: EditorDocument,
  bounds: Bounds,
): EditorDocument {
  const x = Math.max(
    0,
    Math.min(document.crop.width - 1, Math.round(bounds.x)),
  );
  const y = Math.max(
    0,
    Math.min(document.crop.height - 1, Math.round(bounds.y)),
  );
  const width = Math.max(
    1,
    Math.min(document.crop.width - x, Math.round(bounds.width)),
  );
  const height = Math.max(
    1,
    Math.min(document.crop.height - y, Math.round(bounds.height)),
  );
  const annotations = document.annotations
    .filter((a) => {
      // Arrow dimensions may be negative; include its arrowhead/stroke extent.
      const pad =
        a.type === "arrow"
          ? a.strokeWidth * 3
          : a.type === "rectangle"
            ? a.strokeWidth / 2
            : 0;
      const left = Math.min(a.x, a.x + a.width) - pad;
      const top = Math.min(a.y, a.y + a.height) - pad;
      const right = Math.max(a.x, a.x + a.width) + pad;
      const bottom = Math.max(a.y, a.y + a.height) + pad;
      return right > x && left < x + width && bottom > y && top < y + height;
    })
    .map((a) => ({ ...a, x: a.x - x, y: a.y - y }));
  return {
    crop: { x: document.crop.x + x, y: document.crop.y + y, width, height },
    annotations,
  };
}
export const clampZoom = (zoom: number) =>
  Math.max(0.1, Math.min(4, Number.isFinite(zoom) ? zoom : 1));
export const fitZoom = (
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
) => Math.min(4, availableWidth / width, availableHeight / height);
