import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Canvas } from "../editor/Canvas";
import { Toolbar, tools } from "../editor/Toolbar";
import { PropertiesPanel } from "../editor/PropertiesPanel";
import { Icon } from "../editor/Icon";
import {
  loadImage,
  supportedTypes,
  createLoadCoordinator,
  releaseSource,
} from "../image/loader";
import { copyPNG, downloadPNG, renderPNG } from "../image/export";
import {
  clampZoom,
  cropDocument,
  fitZoom,
  historyReducer,
  initialDocument,
  initialHistory,
} from "../state/editor-store";
import { isEditable, shortcutAction } from "../shortcuts/shortcuts";
import type { Annotation, Bounds, ImageSource, Tool } from "../types/editor";

export default function App() {
  const [source, setSource] = useState<ImageSource | null>(null);
  const [history, dispatch] = useReducer(
    historyReducer,
    initialHistory(initialDocument(0, 0)),
  );
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [crop, setCrop] = useState<Bounds | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitting, setFitting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [outputting, setOutputting] = useState(false);
  const [message, setMessage] = useState("Ready when you are.");
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<ImageSource | null>(null);
  const [focusText, setFocusText] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const coordinator = useRef(createLoadCoordinator());
  const pendingRef = useRef<ImageSource | null>(null);
  const historyRef = useRef(history);
  historyRef.current = history;
  const document = history.present;
  const annotation = document.annotations.find((a) => a.id === selected);

  useEffect(() => () => releaseSource(source), [source]);
  useEffect(() => {
    const requests = coordinator.current;
    return () => {
      requests.cancel();
      releaseSource(pendingRef.current);
    };
  }, []);
  const fit = useCallback(() => {
    const box = workspace.current?.getBoundingClientRect();
    if (!box || !document.crop.width) return;
    setZoom(
      Math.max(
        0.01,
        Math.min(
          1,
          fitZoom(
            document.crop.width,
            document.crop.height,
            box.width - 64,
            box.height - 64,
          ),
        ),
      ),
    );
    setFitting(true);
  }, [document.crop.width, document.crop.height]);
  useEffect(() => {
    if (!fitting || !workspace.current || !source) return;
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(workspace.current);
    return () => observer.disconnect();
  }, [fit, fitting, source]);

  const acceptSource = (candidate: ImageSource) => {
    setSource(candidate);
    dispatch({
      type: "reset",
      document: initialDocument(candidate.width, candidate.height),
    });
    setSelected(null);
    setCrop(null);
    setTool("select");
    setFitting(true);
    setFocusText(false);
    setMessage("Image ready. Mark what matters.");
  };
  const open = async (file: File) => {
    const request = coordinator.current.begin();
    releaseSource(pendingRef.current);
    pendingRef.current = null;
    setPending(null);
    setLoading(true);
    setMessage("Loading image…");
    try {
      const candidate = await loadImage(file);
      if (!coordinator.current.isCurrent(request)) {
        releaseSource(candidate);
        return;
      }
      if (historyRef.current.present.annotations.length) {
        pendingRef.current = candidate;
        setPending(candidate);
        setMessage("Replace the current image?");
      } else acceptSource(candidate);
    } catch (error) {
      if (coordinator.current.isCurrent(request))
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not decode this image.",
        );
    } finally {
      if (coordinator.current.isCurrent(request)) setLoading(false);
    }
  };
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (isEditable(event.target)) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      const file =
        files.find((file) => supportedTypes.includes(file.type)) ??
        files.find((file) => file.type.startsWith("image/"));
      if (file) {
        event.preventDefault();
        void open(file);
      }
    };
    window.document.addEventListener("paste", paste);
    return () => window.document.removeEventListener("paste", paste);
  });

  const selectTool = (tool: Tool) => {
    dispatch({ type: "commit" });
    setTool(tool);
    setCrop(null);
    setFocusText(false);
  };
  const undo = () => {
    dispatch({ type: "undo" });
    setSelected(null);
    setCrop(null);
    setFocusText(false);
  };
  const redo = () => {
    dispatch({ type: "redo" });
    setSelected(null);
    setCrop(null);
    setFocusText(false);
  };
  const deleteSelected = () => {
    if (selected) {
      dispatch({ type: "delete", id: selected });
      setSelected(null);
    }
  };
  const zoomTo = (value: number) => {
    setZoom(clampZoom(value));
    setFitting(false);
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!source || pending || loading) return;
      const action = shortcutAction({
        ...event,
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        editable: isEditable(event.target),
      });
      if (!action) return;
      event.preventDefault();
      if (action === "undo") undo();
      else if (action === "redo") redo();
      else if (action === "delete") deleteSelected();
      else if (action === "zoom-in") zoomTo(zoom + 0.1);
      else if (action === "zoom-out") zoomTo(zoom - 0.1);
      else if (action === "fit") fit();
      else selectTool(action);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });
  const update = (a: Annotation, preview = false) =>
    dispatch({
      type: preview ? "preview" : "edit",
      document: {
        ...document,
        annotations: document.annotations.map((existing) =>
          existing.id === a.id ? a : existing,
        ),
      },
    });
  const add = (a: Annotation) => {
    dispatch({
      type: "edit",
      document: { ...document, annotations: [...document.annotations, a] },
    });
    setSelected(a.id);
    setTool("select");
    setFocusText(a.type === "text");
  };
  const output = async (copy: boolean) => {
    if (!source || outputting) return;
    dispatch({ type: "commit" });
    setOutputting(true);
    setMessage(copy ? "Copying image…" : "Preparing PNG…");
    const bitmap = renderPNG(source, document);
    try {
      if (copy) {
        await copyPNG(bitmap);
        setMessage("Image copied. Ready to paste anywhere.");
      } else {
        downloadPNG(await bitmap);
        setMessage("PNG exported.");
      }
    } catch {
      // Consume render rejection even when clipboard support fails before awaiting it.
      void bitmap.catch(() => {});
      setMessage(
        copy
          ? "Could not copy image. Export PNG instead."
          : "Could not export image. Please try again.",
      );
    } finally {
      setOutputting(false);
    }
  };
  const disabled = !source || loading || !!pending;
  const toolLabel = tools.find((t) => t.tool === tool)?.label;

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="psnote home">
          <span className="brand-mark">
            <Icon name="arrow" size={22} />
          </span>
          psnote<span className="brand-dot">.</span>
        </a>
        <span className="header-divider" />
        <span className="header-caption">
          Make screenshots explain themselves.
        </span>
        <div className="header-actions">
          <span className="local-badge">
            <span /> Images stay local.
          </span>
          <button
            className="open-button"
            onClick={() => input.current?.click()}
          >
            <Icon name="upload" />
            <span>Open image</span>
          </button>
        </div>
      </header>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void open(file);
          e.target.value = "";
        }}
      />
      <main
        className={dragging ? "editor drag-over" : "editor"}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = Array.from(e.dataTransfer.files);
          const file =
            files.find((file) => supportedTypes.includes(file.type)) ??
            files[0];
          if (file) void open(file);
        }}
      >
        <div className="editor-heading">
          <div>
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h2>Screenshot notes</h2>
          </div>
          <span className="editor-session">
            {source ? "Unsaved session" : "A little clarity goes a long way."}
          </span>
        </div>
        <div className="editor-frame">
          <Toolbar
            activeTool={tool}
            onTool={selectTool}
            disabled={disabled}
            canUndo={
              !disabled && (history.past.length > 0 || !!history.baseline)
            }
            canRedo={!disabled && history.future.length > 0}
            onUndo={undo}
            onRedo={redo}
          />
          {annotation && !disabled && (
            <PropertiesPanel
              annotation={annotation}
              preview={(a) => update(a, true)}
              commit={() => dispatch({ type: "commit" })}
              remove={deleteSelected}
              focusText={focusText}
            />
          )}
          {tool === "crop" && source && (
            <div className="crop-controls">
              <span>Drag a region to crop. You can undo this.</span>
              <button
                disabled={!crop || crop.width < 1 || crop.height < 1}
                onClick={() => {
                  if (!crop) return;
                  dispatch({
                    type: "edit",
                    document: cropDocument(document, crop),
                  });
                  setCrop(null);
                  setSelected(null);
                  setTool("select");
                  setFitting(true);
                }}
              >
                <Icon name="check" />
                Apply crop
              </button>
              <button
                onClick={() => {
                  setCrop(null);
                  setTool("select");
                }}
              >
                Cancel crop
              </button>
            </div>
          )}
          <div
            ref={workspace}
            className={`workspace ${source ? "has-image" : ""}`}
          >
            {source ? (
              <Canvas
                source={source}
                document={document}
                tool={tool}
                zoom={zoom}
                selected={selected}
                select={(id) => {
                  setSelected(id);
                  setFocusText(false);
                }}
                add={add}
                change={(a) => update(a)}
                crop={crop}
                onCrop={setCrop}
                disabled={disabled}
              />
            ) : (
              <div className="empty-state">
                <div className="empty-illustration">
                  <div className="image-card">
                    <Icon name="image" size={50} />
                  </div>
                  <span className="illustration-arrow">
                    <Icon name="arrow" size={34} />
                  </span>
                  <span className="illustration-dot" />
                </div>
                <span className="eyebrow">LESS EDITING. MORE EXPLAINING.</span>
                <h2>Paste a screenshot to start</h2>
                <p>
                  Drop an image here, paste from your clipboard,
                  <br />
                  or pick a file. The rest is just a few marks away.
                </p>
                <button
                  className="primary-button"
                  onClick={() => input.current?.click()}
                >
                  <Icon name="upload" />
                  Open image
                </button>
                <span className="paste-hint">
                  or press <kbd>Ctrl / ⌘ + V</kbd>
                </span>
                <div className="empty-privacy">
                  <Icon name="shield" size={15} />
                  Your images never leave your browser.
                </div>
              </div>
            )}
            {dragging && (
              <div className="drop-overlay">
                <Icon name="upload" size={36} />
                <span>Drop your screenshot here</span>
              </div>
            )}
          </div>
          <div className="status-bar">
            <div className="view-controls">
              <button
                aria-label="Zoom out"
                disabled={disabled}
                onClick={() => zoomTo(zoom - 0.1)}
              >
                −
              </button>
              <label className="zoom-input">
                <input
                  aria-label="Zoom percentage"
                  type="number"
                  min="10"
                  max="400"
                  step="10"
                  value={Number((zoom * 100).toFixed(1))}
                  disabled={disabled}
                  onChange={(e) => zoomTo(Number(e.target.value) / 100)}
                />
                <span>%</span>
              </label>
              <span data-testid="zoom-value" className="sr-only">
                {Number((zoom * 100).toFixed(1))}%
              </span>
              <button
                aria-label="Zoom in"
                disabled={disabled}
                onClick={() => zoomTo(zoom + 0.1)}
              >
                +
              </button>
              <button
                className="fit-button"
                aria-label="Fit to screen"
                disabled={disabled}
                onClick={fit}
              >
                <Icon name="fit" />
              </button>
              <span data-testid="image-size" className="image-size">
                {source
                  ? `${document.crop.width} × ${document.crop.height}`
                  : "No image loaded"}
              </span>
            </div>
            <div className="output-controls">
              <button
                className="export-button"
                disabled={disabled || outputting}
                onClick={() => void output(false)}
              >
                <Icon name="download" />
                <span>Export PNG</span>
              </button>
              <button
                className="primary-button copy-button"
                disabled={disabled || outputting}
                onClick={() => void output(true)}
              >
                <Icon name="copy" />
                <span>Copy image</span>
              </button>
            </div>
          </div>
        </div>
        <div className="workspace-footer">
          <span
            className="feedback"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {message}
          </span>
          <span data-testid="annotation-count">
            {document.annotations.length}{" "}
            {document.annotations.length === 1 ? "annotation" : "annotations"}
          </span>
          {source && (
            <span className="active-tool-label">{toolLabel} tool</span>
          )}
        </div>
      </main>
      <footer className="app-footer">
        <span>
          <Icon name="shield" size={14} />
          No uploads. No accounts. Just your browser.
        </span>
        <a href="#how-it-works">How it works ↓</a>
      </footer>
      {pending && (
        <ReplaceDialog
          cancel={() => {
            releaseSource(pendingRef.current);
            pendingRef.current = null;
            setPending(null);
            setMessage("Current image kept.");
          }}
          replace={() => {
            acceptSource(pending);
            pendingRef.current = null;
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
function ReplaceDialog({
  cancel,
  replace,
}: {
  cancel: () => void;
  replace: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className="replace-dialog"
      ref={dialog}
      aria-labelledby="replace-title"
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
    >
      <span className="eyebrow">START FRESH</span>
      <h2 id="replace-title">Replace this screenshot?</h2>
      <p>
        Your current annotations will be discarded.
        <br />
        Export or copy them first if you want to keep them.
      </p>
      <div>
        <button autoFocus onClick={cancel}>
          Keep current image
        </button>
        <button className="primary-button" onClick={replace}>
          Replace image
        </button>
      </div>
    </dialog>
  );
}
