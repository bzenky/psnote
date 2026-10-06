import type { ImageSource } from "../types/editor";
export const supportedTypes = ["image/png", "image/jpeg", "image/webp"];
export function validateFile(file: Pick<File, "type" | "size">): string | null {
  if (!supportedTypes.includes(file.type))
    return "Use a PNG, JPEG, or WebP image.";
  if (file.size > 20 * 1024 * 1024) return "Image exceeds 20 MiB.";
  return null;
}
export function validateDimensions(
  width: number,
  height: number,
): string | null {
  if (!width || !height) return "Could not decode this image.";
  if (width * height > 20_000_000) return "Image exceeds 20 million pixels.";
  return null;
}
export async function loadImage(file: File): Promise<ImageSource> {
  const error = validateFile(file);
  if (error) throw new Error(error);
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    const error = validateDimensions(image.naturalWidth, image.naturalHeight);
    if (error) throw new Error(error);
    let disposed = false;
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        URL.revokeObjectURL(url);
        image.src = "";
      },
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    image.src = "";
    if (
      error instanceof Error &&
      error.message === "Image exceeds 20 million pixels."
    )
      throw error;
    throw new Error("Could not decode this image.", { cause: error });
  }
}
export const releaseSource = (source: ImageSource | null) => source?.dispose();
export function createLoadCoordinator() {
  let request = 0;
  return {
    begin: () => ++request,
    isCurrent: (id: number) => id === request,
    cancel: () => {
      request++;
    },
  };
}
