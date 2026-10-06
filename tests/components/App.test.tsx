import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation, ImageSource, Bounds } from "../../src/types/editor";

const loader = vi.hoisted(() => ({ loadImage: vi.fn() }));
vi.mock("../../src/image/loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/image/loader")>()),
  loadImage: loader.loadImage,
}));
vi.mock("../../src/editor/Canvas", () => ({
  Canvas: ({
    add,
    onCrop,
  }: {
    add: (a: Annotation) => void;
    onCrop: (bounds: Bounds) => void;
  }) => (
    <>
      {" "}
      <button onClick={() => onCrop({ x: 10, y: 10, width: 50, height: 50 })}>
        Select test crop
      </button>
      <button
        onClick={() =>
          add({
            id: "rectangle",
            type: "rectangle",
            x: 10,
            y: 20,
            width: 100,
            height: 80,
            strokeWidth: 4,
            color: "#ef4444",
          })
        }
      >
        Draw test rectangle
      </button>
    </>
  ),
}));
import App from "../../src/app/App";

function source(width: number): ImageSource {
  return { width, height: 100, image: new Image(), dispose: vi.fn() };
}
const upload = (file = new File(["png"], "image.png", { type: "image/png" })) =>
  fireEvent.change(document.querySelector("input[type=file]")!, {
    target: { files: [file] },
  });
beforeEach(() => {
  loader.loadImage.mockReset();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
describe("session boundaries", () => {
  it("latest decode wins across the real input boundary", async () => {
    const a = source(200);
    const b = source(300);
    let resolveA!: (value: ImageSource) => void;
    loader.loadImage
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          }),
      )
      .mockResolvedValueOnce(b);
    render(<App />);
    upload();
    upload();
    await waitFor(() =>
      expect(screen.getByTestId("image-size")).toHaveTextContent("300 × 100"),
    );
    resolveA(a);
    await waitFor(() => expect(a.dispose).toHaveBeenCalledOnce());
    expect(screen.getByTestId("image-size")).toHaveTextContent("300 × 100");
  });
  it("invalid replacement preserves the active document", async () => {
    loader.loadImage
      .mockResolvedValueOnce(source(400))
      .mockRejectedValueOnce(new Error("Image exceeds 20 MiB."));
    render(<App />);
    upload();
    await screen.findByRole("button", { name: "Draw test rectangle" });
    fireEvent.click(
      screen.getByRole("button", { name: "Draw test rectangle" }),
    );
    upload();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Image exceeds 20 MiB.",
      ),
    );
    expect(screen.getByTestId("annotation-count")).toHaveTextContent(
      "1 annotation",
    );
    expect(screen.getByTestId("image-size")).toHaveTextContent("400 × 100");
  });
  it("confirming replacement resets history and releases old image", async () => {
    const a = source(400);
    const b = source(200);
    loader.loadImage.mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    render(<App />);
    upload();
    fireEvent.click(
      await screen.findByRole("button", { name: "Draw test rectangle" }),
    );
    upload();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Replace image" }));
    expect(screen.getByTestId("image-size")).toHaveTextContent("200 × 100");
    expect(screen.getByTestId("annotation-count")).toHaveTextContent(
      "0 annotations",
    );
    expect(screen.getByRole("button", { name: /^Undo$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Redo$/ })).toBeDisabled();
    expect(a.dispose).toHaveBeenCalledOnce();
  });
  it("property interaction groups keystrokes into one undo step", async () => {
    loader.loadImage.mockResolvedValue(source(400));
    const user = userEvent.setup();
    render(<App />);
    upload();
    await user.click(
      await screen.findByRole("button", { name: "Draw test rectangle" }),
    );
    const x = screen.getByLabelText("X position");
    await user.clear(x);
    await user.type(x, "123");
    await user.tab();
    expect(x).toHaveValue(123);
    await user.click(screen.getByRole("button", { name: /^Undo$/ }));
    expect(screen.getByTestId("annotation-count")).toHaveTextContent(
      "1 annotation",
    );
    await user.click(screen.getByRole("button", { name: /^Undo$/ }));
    expect(screen.getByTestId("annotation-count")).toHaveTextContent(
      "0 annotations",
    );
  });
});

it("crop cancellation preserves dimensions annotations and history through UI", async () => {
  loader.loadImage.mockResolvedValue(source(400));
  render(<App />);
  upload();
  fireEvent.click(
    await screen.findByRole("button", { name: "Draw test rectangle" }),
  );
  fireEvent.click(screen.getByRole("button", { name: /^Crop$/ }));
  fireEvent.click(screen.getByRole("button", { name: "Select test crop" }));
  expect(screen.getByRole("button", { name: "Apply crop" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel crop" }));
  expect(screen.getByTestId("image-size")).toHaveTextContent("400 × 100");
  expect(screen.getByTestId("annotation-count")).toHaveTextContent(
    "1 annotation",
  );
  expect(screen.getByRole("button", { name: /^Redo$/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /^Undo$/ }));
  expect(screen.getByTestId("annotation-count")).toHaveTextContent(
    "0 annotations",
  );
});
it("marker height control resizes both dimensions", async () => {
  loader.loadImage.mockResolvedValue(source(400));
  // Direct component boundary checks the marker property, independent of pointer input.
  const { PropertiesPanel } = await import("../../src/editor/PropertiesPanel");
  const preview = vi.fn();
  render(
    <PropertiesPanel
      annotation={{
        id: "m",
        type: "marker",
        x: 0,
        y: 0,
        width: 40,
        height: 40,
        color: "#ef4444",
        number: 1,
      }}
      preview={preview}
      commit={() => {}}
      remove={() => {}}
      focusText={false}
    />,
  );
  fireEvent.change(screen.getByLabelText("Height"), {
    target: { value: "80" },
  });
  expect(preview).toHaveBeenCalledWith(
    expect.objectContaining({ width: 80, height: 80 }),
  );
});
