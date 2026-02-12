import { useRef, useState } from 'react';

export interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

export interface SwipeOptions {
  threshold?: number; // Minimum distance for swipe (default: 50)
  restrain?: number; // Maximum distance for perpendicular axis (default: 100)
  allowedTime?: number; // Maximum time for swipe (default: 300)
}

export function useSwipe(handlers: SwipeHandlers, options: SwipeOptions = {}) {
  const { threshold = 50, restrain = 100, allowedTime = 300 } = options;
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);
  const startTimeRef = useRef<number>(0);

  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setTouchEnd({ x: touch.clientX, y: touch.clientY });
    startTimeRef.current = Date.now();
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    setTouchEnd({ x: touch.clientX, y: touch.clientY });
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const elapsedTime = Date.now() - startTimeRef.current;
    const distanceX = touchEnd.x - touchStart.x;
    const distanceY = touchEnd.y - touchStart.y;

    if (elapsedTime <= allowedTime) {
      // Horizontal swipe
      if (Math.abs(distanceX) >= threshold && Math.abs(distanceY) <= restrain) {
        if (distanceX > 0) {
          handlers.onSwipeRight?.();
        } else {
          handlers.onSwipeLeft?.();
        }
      }
      // Vertical swipe
      else if (Math.abs(distanceY) >= threshold && Math.abs(distanceX) <= restrain) {
        if (distanceY > 0) {
          handlers.onSwipeDown?.();
        } else {
          handlers.onSwipeUp?.();
        }
      }
    }

    setTouchStart(null);
    setTouchEnd(null);
  };

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
