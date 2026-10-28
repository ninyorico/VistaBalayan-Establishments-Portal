import { useEffect, useRef } from "react";

/**
 * Keeps a two-axis table gesture on one axis at a time. The outer element owns
 * horizontal movement; an optional nested element owns vertical movement.
 */
export function useDominantAxisTableScroll() {
  const horizontalRef = useRef<HTMLDivElement>(null);
  const verticalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const horizontalContainer = horizontalRef.current;
    if (!horizontalContainer) return;

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
        horizontalContainer.scrollLeft += lastX - touch.clientX;
      } else if (axis === "y") {
        const verticalContainer = verticalRef.current || horizontalContainer;
        if (verticalContainer.scrollHeight > verticalContainer.clientHeight) {
          event.preventDefault();
          verticalContainer.scrollTop += lastY - touch.clientY;
        }
      }

      lastX = touch.clientX;
      lastY = touch.clientY;
    };

    const resetAxis = () => {
      axis = null;
    };

    horizontalContainer.addEventListener("touchstart", handleTouchStart, { passive: true });
    horizontalContainer.addEventListener("touchmove", handleTouchMove, { passive: false });
    horizontalContainer.addEventListener("touchend", resetAxis, { passive: true });
    horizontalContainer.addEventListener("touchcancel", resetAxis, { passive: true });

    return () => {
      horizontalContainer.removeEventListener("touchstart", handleTouchStart);
      horizontalContainer.removeEventListener("touchmove", handleTouchMove);
      horizontalContainer.removeEventListener("touchend", resetAxis);
      horizontalContainer.removeEventListener("touchcancel", resetAxis);
    };
  }, []);

  return { horizontalRef, verticalRef };
}
