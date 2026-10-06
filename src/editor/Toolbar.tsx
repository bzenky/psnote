import { Icon } from "./Icon";
import type { Tool } from "../types/editor";
export const tools: { tool: Tool; label: string; key: string }[] = [
  { tool: "select", label: "Select", key: "V" },
  { tool: "arrow", label: "Arrow", key: "A" },
  { tool: "rectangle", label: "Rectangle", key: "R" },
  { tool: "ellipse", label: "Ellipse", key: "E" },
  { tool: "freehand", label: "Free draw", key: "P" },
  { tool: "spotlight", label: "Spotlight", key: "S" },
  { tool: "text", label: "Text", key: "T" },
  { tool: "redaction", label: "Redact", key: "B" },
  { tool: "marker", label: "Number", key: "N" },
  { tool: "crop", label: "Crop", key: "C" },
];
export function Toolbar({
  activeTool,
  panActive,
  onPan,
  onTool,
  disabled,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  activeTool: Tool;
  panActive: boolean;
  onPan: () => void;
  onTool: (tool: Tool) => void;
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Annotation tools">
      <div className="tool-group">
        <button
          type="button"
          className={`tool-button ${panActive ? "active" : ""}`}
          aria-label="Pan"
          aria-pressed={panActive}
          title="Pan (H), hold Space, or drag with the middle mouse button"
          disabled={disabled}
          onClick={onPan}
        >
          <Icon name="pan" />
          <span>Pan</span>
          <kbd>H</kbd>
        </button>
        {tools.map(({ tool, label, key }) => (
          <button
            key={tool}
            type="button"
            className={`tool-button ${tool === activeTool && !panActive ? "active" : ""}`}
            aria-label={label}
            aria-pressed={tool === activeTool && !panActive}
            title={`${label} (${key})`}
            disabled={disabled}
            onClick={() => onTool(tool)}
          >
            <Icon name={tool === "redaction" ? "redaction" : tool} />
            <span>{label}</span>
            <kbd>{key}</kbd>
          </button>
        ))}
      </div>
      <div className="history-buttons">
        <button
          aria-label="Undo"
          title="Undo (Ctrl/⌘ + Z)"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Icon name="undo" />
        </button>
        <button
          aria-label="Redo"
          title="Redo (Ctrl/⌘ + Shift + Z)"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Icon name="redo" />
        </button>
      </div>
    </div>
  );
}
