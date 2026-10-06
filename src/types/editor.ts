export type Tool =
  | "select"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "freehand"
  | "spotlight"
  | "text"
  | "redaction"
  | "marker"
  | "crop";
export interface Point {
  x: number;
  y: number;
}
export interface Bounds extends Point {
  width: number;
  height: number;
}
interface BaseAnnotation extends Bounds {
  id: string;
}
export type Annotation =
  | (BaseAnnotation & {
      type: "arrow" | "rectangle" | "ellipse";
      color: string;
      strokeWidth: number;
    })
  | (BaseAnnotation & {
      type: "freehand";
      color: string;
      strokeWidth: number;
      // Local coordinates in [0, 1], scaled by width and height when rendering.
      points: Point[];
    })
  | (BaseAnnotation & { type: "spotlight" })
  | (BaseAnnotation & { type: "redaction" })
  | (BaseAnnotation & {
      type: "text";
      text: string;
      color: string;
      fontSize: number;
    })
  | (BaseAnnotation & { type: "marker"; number: number; color: string });
export interface EditorDocument {
  crop: Bounds;
  annotations: Annotation[];
}
export interface ImageSource {
  image: HTMLImageElement;
  width: number;
  height: number;
  dispose: () => void;
}
export interface HistoryState {
  past: EditorDocument[];
  present: EditorDocument;
  future: EditorDocument[];
  baseline: EditorDocument | null;
}
export type HistoryAction =
  | { type: "edit" | "preview"; document: EditorDocument }
  | { type: "delete"; id: string }
  | { type: "reset"; document: EditorDocument }
  | { type: "undo" | "redo" | "commit" };
