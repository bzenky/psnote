import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { isEditable } from "../shortcuts/shortcuts";
import type { Point } from "../types/editor";

interface PanGesture {
  pointerId: number;
  start: Point;
  offset: Point;
}

export function usePan(enabled: boolean, onStart: () => void) {
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [handTool, setHandTool] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<PanGesture | null>(null);
  const active = enabled && (handTool || spaceHeld || dragging);

  const end = useCallback(() => {
    gesture.current = null;
    setDragging(false);
  }, []);
  const reset = useCallback(() => {
    gesture.current = null;
    setDragging(false);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!enabled) {
      end();
      setSpaceHeld(false);
      return;
    }
    const keydown = (event: KeyboardEvent) => {
      if (
        isEditable(event.target) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (event.code === "Space") {
        event.preventDefault();
        setSpaceHeld(true);
      } else if (event.key.toLowerCase() === "h" && !event.repeat) {
        event.preventDefault();
        setHandTool((current) => !current);
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceHeld(false);
    };
    const clearTemporaryPan = () => {
      setSpaceHeld(false);
      end();
    };
    const visibility = () => {
      if (document.hidden) clearTemporaryPan();
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", clearTemporaryPan);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", clearTemporaryPan);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled, end]);

  const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled || gesture.current || !event.isPrimary) return;
    if (event.button !== 1 && !(event.button === 0 && active)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      offset,
    };
    setDragging(true);
    onStart();
  };
  const onPointerMoveCapture = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setOffset({
      x: current.offset.x + event.clientX - current.start.x,
      y: current.offset.y + event.clientY - current.start.y,
    });
  };
  const onPointerUpCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    end();
  };
  // Konva listens to mouse events independently of React's pointer handlers.
  const onMouseDownCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (enabled && (active || event.button === 1)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const onAuxClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (enabled && event.button === 1) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return {
    offset,
    handTool,
    setHandTool,
    active,
    dragging,
    reset,
    handlers: {
      onPointerDownCapture,
      onPointerMoveCapture,
      onPointerUpCapture,
      onPointerCancel: end,
      onLostPointerCapture: end,
      onMouseDownCapture,
      onAuxClickCapture,
    },
  };
}
