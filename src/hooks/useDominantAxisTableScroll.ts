import { useCallback, useEffect, useRef, type RefCallback } from "react";

type ScrollElement = HTMLDivElement;

/**
 * Keeps a two-axis table gesture on one axis at a time. The outer element owns
 * horizontal movement; an optional nested element owns vertical movement.
 * Callback refs are used so conditionally rendered modal tables are supported.
 */
export function useDominantAxisTableScroll() {
  const verticalNodeRef = useRef<ScrollElement | null>(null);
  const detachHorizontalListenersRef = useRef<(() => void) | null>(null);

  const setVerticalRef = useCallback<RefCallback<ScrollElement>>((node) => {
    verticalNodeRef.current = node;
  }, []);

  const setHorizontalRef = useCallback<RefCallback<ScrollElement>>((node) => {
    detachHorizontalListenersRef.current?.();
    detachHorizontalListenersRef.current = null;
    if (!node) return;

    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let axis: "x" | "y" | null = null;

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      startX = lastX = touch.clientX;
      startY = lastY = touch.clientY;
      axis = null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (!axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 6) {
        axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
      }

      if (axis === "x") {
        event.preventDefault();
        node.scrollLeft += lastX - touch.clientX;
      } else if (axis === "y") {
        const verticalNode = verticalNodeRef.current || node;
        if (verticalNode.scrollHeight > verticalNode.clientHeight) {
          event.preventDefault();
          verticalNode.scrollTop += lastY - touch.clientY;
        }
      }

      lastX = touch.clientX;
      lastY = touch.clientY;
    };

    const resetAxis = () => {
      axis = null;
    };

    node.addEventListener("touchstart", handleTouchStart, { passive: true });
    node.addEventListener("touchmove", handleTouchMove, { passive: false });
    node.addEventListener("touchend", resetAxis, { passive: true });
    node.addEventListener("touchcancel", resetAxis, { passive: true });

    detachHorizontalListenersRef.current = () => {
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchmove", handleTouchMove);
      node.removeEventListener("touchend", resetAxis);
      node.removeEventListener("touchcancel", resetAxis);
    };
  }, []);

  useEffect(() => () => {
    detachHorizontalListenersRef.current?.();
  }, []);

  return { horizontalRef: setHorizontalRef, verticalRef: setVerticalRef };
}
