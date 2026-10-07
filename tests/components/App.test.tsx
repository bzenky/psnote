import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
function deferredImage() {
  let resolve!: (value: ImageSource) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ImageSource>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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
describe("image loading UX", () => {
  it("shows an indeterminate local-processing overlay during initial decode", async () => {
    const decode = deferredImage();
    loader.loadImage.mockReturnValueOnce(decode.promise);
    const { container } = render(<App />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    upload();

    const overlay = screen.getByRole("progressbar", { name: "Loading image" });
    expect(overlay).toBeVisible();
    expect(overlay).toHaveTextContent("Loading image…");
    expect(overlay).toHaveAccessibleDescription(
      "Processing locally. Your image stays in your browser.",
    );
    expect(overlay).not.toHaveAttribute("aria-valuenow");
    expect(container.querySelector(".workspace")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Loading image…");
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();

    await act(async () => decode.resolve(source(400)));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(container.querySelector(".workspace")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    expect(screen.getByTestId("image-size")).toHaveTextContent("400 × 100");
  });

  it("covers the workspace independently of scroll and pan during replacement", async () => {
    const decode = deferredImage();
    loader.loadImage
      .mockResolvedValueOnce(source(400))
      .mockReturnValueOnce(decode.promise);
    const { container } = render(<App />);
    upload();
    fireEvent.click(
      await screen.findByRole("button", { name: "Draw test rectangle" }),
    );
    const workspace = container.querySelector<HTMLDivElement>(".workspace")!;
    workspace.scrollTop = 80;
    workspace.scrollLeft = 120;
    upload();

    const overlay = screen.getByRole("progressbar", { name: "Loading image" });
    expect(overlay).toBeVisible();
    // A sibling overlay is outside both the scrolling workspace and panned canvas.
    expect(overlay.parentElement).toBe(workspace.parentElement);
    expect(workspace).not.toContainElement(overlay);
    expect(workspace.scrollTop).toBe(80);
    expect(workspace.scrollLeft).toBe(120);
    expect(screen.getByTestId("image-size")).toHaveTextContent("400 × 100");
    expect(screen.getByRole("button", { name: /^Undo$/ })).toBeDisabled();

    await act(async () => decode.resolve(source(200)));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(workspace).toHaveAttribute("aria-busy", "false");
    expect(screen.getByTestId("annotation-count")).toHaveTextContent(
      "1 annotation",
    );
  });

  it.each([false, true])(
    "clears the overlay on decode error (replacement: %s)",
    async (replacement) => {
      const decode = deferredImage();
      if (replacement) loader.loadImage.mockResolvedValueOnce(source(400));
      loader.loadImage.mockReturnValueOnce(decode.promise);
      const { container } = render(<App />);
      if (replacement) {
        upload();
        await screen.findByRole("button", { name: "Draw test rectangle" });
      }
      upload();
      expect(screen.getByRole("progressbar")).toBeVisible();

      await act(async () =>
        decode.reject(new Error("Could not decode this image.")),
      );
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(container.querySelector(".workspace")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Could not decode this image.",
      );
      if (replacement) {
        expect(screen.getByTestId("image-size")).toHaveTextContent("400 × 100");
        expect(screen.getByRole("button", { name: "Zoom in" })).toBeEnabled();
      } else {
        expect(
          screen.getByRole("heading", { name: "Paste a screenshot to start" }),
        ).toBeVisible();
      }
    },
  );

  it.each(["success", "error"])(
    "keeps the overlay until the latest decode completes after stale %s",
    async (outcome) => {
      const stale = deferredImage();
      const latest = deferredImage();
      const staleSource = source(200);
      loader.loadImage
        .mockReturnValueOnce(stale.promise)
        .mockReturnValueOnce(latest.promise);
      render(<App />);
      upload();
      upload();

      await act(async () => {
        if (outcome === "success") stale.resolve(staleSource);
        else stale.reject(new Error("Stale decode failed."));
      });
      expect(
        screen.getByRole("progressbar", { name: "Loading image" }),
      ).toBeVisible();
      expect(screen.getByRole("status")).toHaveTextContent("Loading image…");
      if (outcome === "success")
        expect(staleSource.dispose).toHaveBeenCalledOnce();

      await act(async () => latest.resolve(source(300)));
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(screen.getByTestId("image-size")).toHaveTextContent("300 × 100");
    },
  );
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
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    resolveA(a);
    await waitFor(() => expect(a.dispose).toHaveBeenCalledOnce());
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
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
