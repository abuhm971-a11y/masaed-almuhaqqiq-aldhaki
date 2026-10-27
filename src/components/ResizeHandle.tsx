import { useRef } from "react";

/** Drag handle between the center text panel and a side panel. Only ever
 * resizes the side panel's width, so the center panel's minimum is never
 * violated. Uses Pointer Events (not mouse-only events) with pointer
 * capture, so dragging works on touch/mobile as well as with a mouse —
 * plain mousemove/mouseup listeners never fire on touch input at all. */
export function ResizeHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragging.current = true;
    lastX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const delta = e.clientX - lastX.current;
    lastX.current = e.clientX;
    onDrag(delta);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    document.body.style.cursor = "";
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="group flex w-4 shrink-0 touch-none cursor-col-resize items-center justify-center"
    >
      <div className="h-16 w-1 rounded-full bg-border transition-colors group-hover:bg-bronze" />
    </div>
  );
}
