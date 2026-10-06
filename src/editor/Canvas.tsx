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
  Ellipse,
  Line,
  Transformer,
} from "react-konva";
import Konva from "konva";
import { shapeSpecs, spotlightSpecs } from "../image/shapes";
import {
  boundsFromPoints,
  newAnnotation,
  newFreehandAnnotation,
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

const shapeComponents = { Rect, Arrow, Text, Circle, Ellipse, Line };
function AnnotationShape({
  annotation,
  draggable,
  onSelect,
  onChange,
  onPreview,
}: {
  annotation: Annotation;
  draggable: boolean;
  onSelect: () => void;
  onChange: (a: Annotation) => void;
  onPreview?: (a: Annotation | null) => void;
}) {
  return (
    <Group
      id={annotation.id}
      name="annotation"
      x={annotation.x}
      y={annotation.y}
      draggable={draggable}
      onTap={onSelect}
      onDragMove={(e) => {
        if (annotation.type === "spotlight")
          onPreview?.({ ...annotation, x: e.target.x(), y: e.target.y() });
      }}
      onDragEnd={(e) => {
        onChange({ ...annotation, x: e.target.x(), y: e.target.y() });
        onPreview?.(null);
      }}
      onTransform={(e) => {
        if (annotation.type !== "spotlight") return;
        const node = e.target;
        onPreview?.(
          resizeAnnotation(
            annotation,
            node.x(),
            node.y(),
            node.scaleX(),
            node.scaleY(),
          ),
        );
      }}
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
        onPreview?.(null);
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
  const stroke = useRef<Point[]>([]);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [spotlightPreview, setSpotlightPreview] = useState<Annotation | null>(
    null,
  );
  const { width, height } = document.crop;
  useEffect(() => {
    const node = selected && stage.current?.findOne(`#${selected}`);
    transformer.current?.nodes(node && tool === "select" ? [node] : []);
  }, [selected, tool, document.annotations]);
  const cancel = () => {
    start.current = null;
    latestPoint.current = null;
    stroke.current = [];
    setDraft(null);
    setSpotlightPreview(null);
  };
  useEffect(cancel, [tool, source, disabled]);
  const point = (event?: MouseEvent): Point | null => {
    if (event) stage.current?.setPointersPositions(event);
    const p = stage.current?.getPointerPosition();
    return p
      ? {
          x: Math.max(0, Math.min(width, p.x / zoom)),
          y: Math.max(0, Math.min(height, p.y / zoom)),
        }
      : null;
  };
  const move = (event: MouseEvent) => {
    if (!start.current || disabled) return;
    const p = point(event);
    if (
      !p ||
      (p.x === latestPoint.current?.x && p.y === latestPoint.current?.y)
    )
      return;
    latestPoint.current = p;
    if (tool === "crop") onCrop(boundsFromPoints(start.current, p));
    else if (tool === "freehand") {
      const previous = stroke.current.at(-1)!;
      if (Math.hypot(p.x - previous.x, p.y - previous.y) < 0.5) return;
      stroke.current.push(p);
      setDraft(newFreehandAnnotation(stroke.current));
    } else {
      setDraft(newAnnotation(tool, start.current, p, document.annotations));
    }
  };
  const finish = (event: MouseEvent) => {
    if (!start.current || !latestPoint.current || disabled) return;
    move(event);
    const bounds = boundsFromPoints(start.current, latestPoint.current);
    if (tool === "crop")
      onCrop(bounds.width >= 1 && bounds.height >= 1 ? bounds : null);
    else if (tool === "freehand") {
      const a = newFreehandAnnotation(stroke.current);
      if (a) add(a);
    } else if (
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
    cancel();
  };
  useEffect(() => {
    const blur = () => cancel();
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", finish);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", finish);
      window.removeEventListener("blur", blur);
    };
  });
  const maskAnnotations = document.annotations.map((a) =>
    spotlightPreview?.id === a.id ? spotlightPreview : a,
  );
  if (draft?.type === "spotlight") maskAnnotations.push(draft);
  const mask = spotlightSpecs(maskAnnotations, width, height);
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
          if (e.evt.button !== 0) return;
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
          // Prevent the canvas's native focus action from stealing text-field focus.
          e.evt.preventDefault();
          select(null);
          if (tool === "text" || tool === "marker") {
            const a = newAnnotation(tool, p, p, document.annotations);
            if (a) add(a);
            return;
          }
          start.current = p;
          latestPoint.current = p;
          stroke.current = [p];
          if (tool === "crop") onCrop(null);
        }}
        onMouseMove={(e) => move(e.evt)}
        onMouseUp={(e) => finish(e.evt)}
      >
        <Layer listening={false}>
          <CanvasImage
            image={source.image}
            x={-document.crop.x}
            y={-document.crop.y}
          />
        </Layer>
        {mask.length > 0 && (
          <Layer listening={false}>
            {mask.map((spec, i) => {
              const Shape = shapeComponents[spec.kind];
              return <Shape key={i} {...spec.props} />;
            })}
          </Layer>
        )}
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
                onPreview={setSpotlightPreview}
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
