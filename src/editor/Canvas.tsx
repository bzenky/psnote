import { useEffect, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Image as CanvasImage,
  Group,
  Rect,
  Arrow,
  Text,
  Circle,
  Transformer,
} from "react-konva";
import Konva from "konva";
import { shapeSpecs } from "../image/shapes";
import {
  boundsFromPoints,
  newAnnotation,
  resizeAnnotation,
} from "../state/editor-store";
import type {
  Annotation,
  Bounds,
  EditorDocument,
  ImageSource,
  Point,
  Tool,
} from "../types/editor";

const shapeComponents = { Rect, Arrow, Text, Circle };
function AnnotationShape({
  annotation,
  draggable,
  onSelect,
  onChange,
}: {
  annotation: Annotation;
  draggable: boolean;
  onSelect: () => void;
  onChange: (a: Annotation) => void;
}) {
  return (
    <Group
      id={annotation.id}
      name="annotation"
      x={annotation.x}
      y={annotation.y}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) =>
        onChange({ ...annotation, x: e.target.x(), y: e.target.y() })
      }
      onTransformEnd={(e) => {
        const node = e.target;
        const updated = resizeAnnotation(
          annotation,
          node.x(),
          node.y(),
          node.scaleX(),
          node.scaleY(),
        );
        node.scaleX(1);
        node.scaleY(1);
        onChange(updated);
      }}
    >
      {shapeSpecs(annotation).map((spec, i) => {
        const Shape = shapeComponents[spec.kind];
        return <Shape key={i} {...spec.props} />;
      })}
    </Group>
  );
}

export function Canvas({
  source,
  document,
  tool,
  zoom,
  selected,
  select,
  add,
  change,
  crop,
  onCrop,
  disabled,
}: {
  source: ImageSource;
  document: EditorDocument;
  tool: Tool;
  zoom: number;
  selected: string | null;
  select: (id: string | null) => void;
  add: (a: Annotation) => void;
  change: (a: Annotation) => void;
  crop: Bounds | null;
  onCrop: (bounds: Bounds | null) => void;
  disabled: boolean;
}) {
  const stage = useRef<Konva.Stage>(null);
  const transformer = useRef<Konva.Transformer>(null);
  const start = useRef<Point | null>(null);
  const latestPoint = useRef<Point | null>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const { width, height } = document.crop;
  useEffect(() => {
    const node = selected && stage.current?.findOne(`#${selected}`);
    transformer.current?.nodes(node && tool === "select" ? [node] : []);
  }, [selected, tool, document.annotations]);
  const point = (): Point | null => {
    const p = stage.current?.getPointerPosition();
    return p
      ? {
          x: Math.max(0, Math.min(width, p.x / zoom)),
          y: Math.max(0, Math.min(height, p.y / zoom)),
        }
      : null;
  };
  const finish = () => {
    if (!start.current || !latestPoint.current) return;
    const bounds = boundsFromPoints(start.current, latestPoint.current);
    if (tool === "crop")
      onCrop(bounds.width >= 1 && bounds.height >= 1 ? bounds : null);
    else if (
      tool === "arrow"
        ? Math.hypot(bounds.width, bounds.height) >= 1
        : bounds.width >= 1 && bounds.height >= 1
    ) {
      const a = newAnnotation(
        tool,
        start.current,
        latestPoint.current,
        document.annotations,
      );
      if (a) add(a);
    }
    start.current = null;
    latestPoint.current = null;
    setDraft(null);
  };
  useEffect(() => {
    window.addEventListener("mouseup", finish);
    return () => window.removeEventListener("mouseup", finish);
  });
  return (
    <div
      className={`canvas-surface tool-${tool}`}
      data-testid="canvas-surface"
      style={{ width: width * zoom, height: height * zoom }}
    >
      <Stage
        ref={stage}
        width={width * zoom}
        height={height * zoom}
        scaleX={zoom}
        scaleY={zoom}
        listening={!disabled}
        onMouseDown={(e) => {
          const p = point();
          if (!p) return;
          if (tool === "select") {
            const node = e.target.findAncestor(".annotation", true);
            if (
              e.target.getClassName() === "Transformer" ||
              e.target.getParent()?.getClassName() === "Transformer"
            )
              return;
            select(node?.id() ?? null);
            return;
          }
          select(null);
          if (tool === "text" || tool === "marker") {
            const a = newAnnotation(tool, p, p, document.annotations);
            if (a) add(a);
            return;
          }
          start.current = p;
          latestPoint.current = p;
          if (tool === "crop") onCrop(null);
        }}
        onMouseMove={() => {
          if (!start.current) return;
          const p = point();
          if (!p) return;
          latestPoint.current = p;
          if (tool === "crop") onCrop(boundsFromPoints(start.current, p));
          else
            setDraft(
              newAnnotation(tool, start.current, p, document.annotations),
            );
        }}
        onMouseUp={finish}
      >
        <Layer listening={false}>
          <CanvasImage
            image={source.image}
            x={-document.crop.x}
            y={-document.crop.y}
          />
        </Layer>
        <Layer>
          <Group clipX={0} clipY={0} clipWidth={width} clipHeight={height}>
            {document.annotations.map((annotation) => (
              <AnnotationShape
                key={annotation.id}
                annotation={annotation}
                draggable={tool === "select"}
                onSelect={() => {
                  if (tool === "select") select(annotation.id);
                }}
                onChange={change}
              />
            ))}
            {draft && (
              <AnnotationShape
                annotation={draft}
                draggable={false}
                onSelect={() => {}}
                onChange={() => {}}
              />
            )}
          </Group>
          <Transformer
            ref={transformer}
            rotateEnabled={false}
            flipEnabled={false}
            keepRatio={
              document.annotations.find((a) => a.id === selected)?.type ===
              "marker"
            }
            enabledAnchors={
              document.annotations.find((a) => a.id === selected)?.type ===
              "marker"
                ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                : [
                    "top-left",
                    "top-center",
                    "top-right",
                    "middle-left",
                    "middle-right",
                    "bottom-left",
                    "bottom-center",
                    "bottom-right",
                  ]
            }
            anchorSize={8 / zoom}
            borderStroke="#c8ee82"
            anchorStroke="#c8ee82"
            anchorFill="#15171c"
            boundBoxFunc={(old, next) =>
              Math.abs(next.width) < 1 || Math.abs(next.height) < 1 ? old : next
            }
          />
          {tool === "crop" && crop && (
            <Rect
              {...crop}
              stroke="#c8ee82"
              strokeWidth={2 / zoom}
              dash={[6 / zoom, 4 / zoom]}
              fill="rgba(200,238,130,0.08)"
              listening={false}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
