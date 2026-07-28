"use client";

import { useEffect, useRef } from "react";
import createGlobe from "cobe";

/**
 * Animated WebGL globe (à la Google Earth) used as a sober hero backdrop.
 * Monochrome palette to stay on-brand with the premium neutral theme.
 * Auto-rotates; respects devicePixelRatio; cleans up on unmount.
 */
export function Globe({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let phi = 0;
    let width = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const measure = () => {
      // Fall back to the parent's width (or a sane default) when the canvas
      // itself hasn't been laid out yet — otherwise cobe builds an empty
      // geometry buffer ("no buffer is bound" WebGL error) and only the
      // markers render.
      const w =
        canvas.offsetWidth ||
        canvas.parentElement?.offsetWidth ||
        canvas.clientWidth ||
        600;
      width = w;
    };
    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(canvas);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener("resize", measure);

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.25,
      dark: 1,
      diffuse: 1.8,
      mapSamples: 24000,
      mapBrightness: 8,
      baseColor: [0.24, 0.44, 0.72], // ocean blue (Google-Earth blue marble)
      markerColor: [1, 0.85, 0.5], // champagne markers
      glowColor: [0.3, 0.55, 0.85], // atmospheric blue glow
      markers: [
        { location: [48.8566, 2.3522], size: 0.08 }, // Paris
      ],
      onRender: (state) => {
        // Slow, premium auto-rotation.
        phi += 0.00175;
        state.phi = phi;
        state.width = width * 2;
        state.height = width * 2;
      },
    });

    return () => {
      globe.destroy();
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%", aspectRatio: "1", contain: "layout paint size" }}
      aria-hidden
    />
  );
}
