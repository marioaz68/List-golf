"use client";

import { useEffect, useRef } from "react";

/**
 * Pad de firma dibujada (PNG data URL). Reutilizable en captura cercanos, etc.
 */
export default function DrawnSignaturePad({
  value,
  onChange,
  heightPx = 160,
  className = "",
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  heightPx?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const hasStrokeRef = useRef(false);

  function resizeCanvas() {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = wrapper.getBoundingClientRect();
    const oldData = canvas.toDataURL("image/png");

    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(heightPx * ratio);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${heightPx}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#111827";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, heightPx);

    const src = value ?? (oldData && oldData !== "data:," ? oldData : null);
    if (src) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, heightPx);
      };
      img.src = src;
    }
  }

  useEffect(() => {
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, heightPx]);

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const point = getPoint(event);
    if (!canvas || !point) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    hasStrokeRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const point = getPoint(event);
    if (!canvas || !point) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function endDrawing() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = false;
    if (hasStrokeRef.current) {
      onChange(canvas.toDataURL("image/png"));
    }
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = wrapper.getBoundingClientRect();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, heightPx);
    hasStrokeRef.current = false;
    onChange(null);
  }

  return (
    <div className={className}>
      <div
        ref={wrapperRef}
        className="overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white"
      >
        <canvas
          ref={canvasRef}
          className="block touch-none"
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={endDrawing}
          onPointerLeave={endDrawing}
          onPointerCancel={endDrawing}
        />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={clearSignature}
          className="h-10 flex-1 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800"
        >
          Limpiar firma
        </button>
      </div>
    </div>
  );
}
