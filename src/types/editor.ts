export type Tool =
  "select" | "arrow" | "rectangle" | "text" | "redaction" | "marker" | "crop";
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
      type: "arrow" | "rectangle";
      color: string;
      strokeWidth: number;
    })
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
