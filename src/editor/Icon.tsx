import type { CSSProperties } from "react";
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  const paths: Record<string, string> = {
    select: "M5 3l14 9-7 1-3 7-4-17z",
    pan: "M8 13V6a2 2 0 014 0v6-8a2 2 0 014 0v8-6a2 2 0 014 0v9c0 4-2 7-6 7h-2c-2 0-3-1-4-3l-4-6a2 2 0 013-2l3 3",
    arrow: "M5 19L19 5M9 5h10v10",
    rectangle: "M4 5h16v14H4z",
    ellipse: "M21 12a9 7 0 11-18 0 9 7 0 0118 0z",
    freehand: "M4 20l4-1L20 7l-3-3L5 16l-1 4zM14 7l3 3",
    spotlight:
      "M3 3h5M3 3v5M21 3h-5M21 3v5M3 21h5M3 21v-5M21 21h-5M21 21v-5M8 8h8v8H8z",
    text: "M4 5h16M12 5v15M8 20h8",
    redaction: "M4 7h16v10H4zM7 10h10M7 14h10",
    marker: "M12 3a9 9 0 100 18 9 9 0 000-18M10 9l2-1v8M10 16h4",
    crop: "M6 3v15h15M3 6h15v15",
    undo: "M8 5L3 10l5 5M3 10h10a7 7 0 017 7",
    redo: "M16 5l5 5-5 5M21 10H11a7 7 0 00-7 7",
    upload: "M12 16V3M7 8l5-5 5 5M4 15v6h16v-6",
    download: "M12 3v13M7 11l5 5 5-5M4 17v4h16v-4",
    copy: "M9 8h12v13H9zM15 8V3H3v13h6",
    shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3zM8 12l3 3 5-6",
    fit: "M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5",
    close: "M6 6l12 12M18 6L6 18",
    image: "M3 4h18v16H3zM3 16l6-6 5 5 3-3 4 4M15 8h.01",
    check: "M5 12l4 4L19 6",
    trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name] ?? paths.image} />
    </svg>
  );
}
