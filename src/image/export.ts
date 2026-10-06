import Konva from "konva";
import { shapeSpecs, spotlightSpecs } from "./shapes";
import type { EditorDocument, ImageSource } from "../types/editor";

export async function renderPNG(
  source: ImageSource,
  document: EditorDocument,
): Promise<Blob> {
  const { crop, annotations } = document;
  const container = window.document.createElement("div");
  const stage = new Konva.Stage({
    container,
    width: crop.width,
    height: crop.height,
  });
  try {
    const sourceLayer = new Konva.Layer();
    stage.add(sourceLayer);
    sourceLayer.add(
      new Konva.Image({ image: source.image, x: -crop.x, y: -crop.y }),
    );
    const maskSpecs = spotlightSpecs(annotations, crop.width, crop.height);
    if (maskSpecs.length) {
      const spotlightLayer = new Konva.Layer();
      stage.add(spotlightLayer);
      for (const spec of maskSpecs)
        spotlightLayer.add(new Konva[spec.kind](spec.props));
    }
    const annotationsLayer = new Konva.Layer();
    stage.add(annotationsLayer);
    for (const annotation of annotations) {
      const group = new Konva.Group({ x: annotation.x, y: annotation.y });
      for (const spec of shapeSpecs(annotation))
        group.add(new Konva[spec.kind](spec.props));
      annotationsLayer.add(group);
    }
    stage.draw();
    const canvas = stage.toCanvas({ pixelRatio: 1 });
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("PNG rendering failed")),
        "image/png",
      ),
    );
  } finally {
    stage.destroy();
  }
}
export function downloadPNG(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "psnote.png";
  document.body.append(link);
  link.click();
  link.remove();
  // Safari must begin consuming the download before its object URL is revoked.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copyPNG(blob: Promise<Blob>) {
  if (
    !navigator.clipboard?.write ||
    !window.ClipboardItem ||
    !window.isSecureContext
  )
    throw new Error("Clipboard unavailable");
  // Keep write inside the user gesture; WebKit permits promise-valued ClipboardItems.
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
