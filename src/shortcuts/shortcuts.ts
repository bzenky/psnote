import type { Tool } from "../types/editor";
export type ShortcutAction =
  Tool | "undo" | "redo" | "delete" | "zoom-in" | "zoom-out" | "fit";
const toolKeys: Record<string, Tool> = {
  v: "select",
  a: "arrow",
  r: "rectangle",
  e: "ellipse",
  p: "freehand",
  s: "spotlight",
  t: "text",
  b: "redaction",
  n: "marker",
  c: "crop",
};
export function shortcutAction({
  key,
  ctrlKey = false,
  metaKey = false,
  shiftKey = false,
  editable = false,
  altKey = false,
}: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  editable?: boolean;
  altKey?: boolean;
}): ShortcutAction | null {
  if (editable || altKey) return null;
  if (ctrlKey || metaKey)
    return key.toLowerCase() === "z" ? (shiftKey ? "redo" : "undo") : null;
  if (key === "Delete" || key === "Backspace") return "delete";
  if (key === "+" || key === "=") return "zoom-in";
  if (key === "-") return "zoom-out";
  if (key === "0") return "fit";
  return toolKeys[key.toLowerCase()] ?? null;
}
export function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}
