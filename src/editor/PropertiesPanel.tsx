import { useEffect, useRef } from "react";
import type { Annotation } from "../types/editor";
import { Icon } from "./Icon";

export function PropertiesPanel({
  annotation,
  preview,
  commit,
  remove,
  focusText,
}: {
  annotation: Annotation;
  preview: (a: Annotation) => void;
  commit: () => void;
  remove: () => void;
  focusText: boolean;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusText) textRef.current?.focus();
  }, [focusText, annotation.id]);
  const number = (
    label: string,
    value: number,
    field: string,
    min?: number,
  ) => (
    <label className="property-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0}
        min={min}
        step="1"
        onChange={(e) => {
          const value = Number(e.target.value);
          if (!Number.isFinite(value)) return;
          const bounded = min === undefined ? value : Math.max(min, value);
          preview({
            ...annotation,
            [field]: bounded,
            ...(annotation.type === "marker" &&
            (field === "width" || field === "height")
              ? { width: bounded, height: bounded }
              : {}),
          });
        }}
        onBlur={commit}
      />
    </label>
  );
  return (
    <section className="properties" aria-label="Selected annotation properties">
      <span className="properties-title">
        {annotation.type === "freehand"
          ? "Free draw"
          : annotation.type === "redaction"
            ? "Redaction"
            : annotation.type === "marker"
              ? `Marker ${annotation.number}`
              : annotation.type.charAt(0).toUpperCase() +
                annotation.type.slice(1)}
      </span>
      {annotation.type === "spotlight" && (
        <span className="property-note">Emphasis only, not redaction.</span>
      )}
      {"color" in annotation && (
        <label className="color-field">
          <span>Color</span>
          <input
            type="color"
            aria-label="Annotation color"
            value={annotation.color}
            onChange={(e) => preview({ ...annotation, color: e.target.value })}
            onBlur={commit}
          />
        </label>
      )}
      {"strokeWidth" in annotation &&
        number("Stroke width", annotation.strokeWidth, "strokeWidth", 1)}
      {annotation.type === "text" &&
        number("Font size", annotation.fontSize, "fontSize", 1)}
      {annotation.type === "marker" &&
        number("Marker size", annotation.width, "width", 1)}
      {number("X position", annotation.x, "x")}
      {number("Y position", annotation.y, "y")}
      {number(
        "Width",
        annotation.width,
        "width",
        annotation.type === "arrow" ? undefined : 1,
      )}
      {number(
        "Height",
        annotation.height,
        "height",
        annotation.type === "arrow" ? undefined : 1,
      )}
      {annotation.type === "text" && (
        <label className="text-field">
          <span>Text</span>
          <textarea
            ref={textRef}
            aria-label="Annotation text"
            value={annotation.text}
            rows={1}
            placeholder="Type a note…"
            onChange={(e) => preview({ ...annotation, text: e.target.value })}
            onBlur={commit}
          />
        </label>
      )}
      <button
        className="delete-button"
        aria-label="Delete selected annotation"
        onClick={remove}
      >
        <Icon name="trash" />
      </button>
    </section>
  );
}
