import { useEffect, useRef, useState } from 'react';

type ViewportSize = { width: number; height: number };

const visualViewportSize = (): ViewportSize => ({
  width: window.visualViewport?.width ?? window.innerWidth,
  height: window.visualViewport?.height ?? window.innerHeight,
});

export function useIsVisualKeyboardOpen(): boolean {
  const baseline = useRef(visualViewportSize());
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const measure = () => {
      const current = visualViewportSize();
      const didChangeOrientation =
        Math.abs(current.width - baseline.current.width) > 48;

      if (didChangeOrientation) {
        baseline.current = current;
        setIsKeyboardOpen(false);
        return;
      }

      baseline.current = {
        ...baseline.current,
        height: Math.max(baseline.current.height, current.height),
      };
      const keyboardThreshold = Math.max(140, baseline.current.height * 0.2);
      setIsKeyboardOpen(
        baseline.current.height - current.height > keyboardThreshold,
      );
    };

    viewport.addEventListener('resize', measure);
    return () => viewport.removeEventListener('resize', measure);
  }, []);

  return isKeyboardOpen;
}
