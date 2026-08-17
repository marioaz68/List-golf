export type CameraPose = {
  tx: number;
  ty: number;
  scale: number;
};

export const AUCTION_BRACKET_ZOOM_IN_MS = 1600;
export const AUCTION_BRACKET_HOLD_MS = 1500;
export const AUCTION_BRACKET_OPEN_HALF_MS = 1600;

export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

export function lerpPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  const u = easeOutCubic(t);
  return {
    tx: a.tx + (b.tx - a.tx) * u,
    ty: a.ty + (b.ty - a.ty) * u,
    scale: a.scale + (b.scale - a.scale) * u,
  };
}

export function identityPose(): CameraPose {
  return { tx: 0, ty: 0, scale: 1 };
}

type Rect = { left: number; top: number; width: number; height: number };

/** Convierte un rect en pantalla al espacio local del escenario (sin cámara). */
export function screenRectToLocal(
  rect: Rect,
  viewport: Rect,
  cam: CameraPose
): { x: number; y: number; w: number; h: number } {
  const s = cam.scale || 1;
  return {
    x: (rect.left - viewport.left - cam.tx) / s,
    y: (rect.top - viewport.top - cam.ty) / s,
    w: rect.width / s,
    h: rect.height / s,
  };
}

export function unionScreenRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.left + r.width);
    bottom = Math.max(bottom, r.top + r.height);
  }
  if (!Number.isFinite(left)) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Pose que centra `target` (coords locales) en el viewport, con padding.
 * padding 1.15 = 15% de aire alrededor.
 */
export function poseToFitLocal(
  viewport: { width: number; height: number },
  local: { x: number; y: number; w: number; h: number },
  padding = 1.18,
  minScale = 0.45,
  maxScale = 3.4
): CameraPose {
  const w = Math.max(40, local.w * padding);
  const h = Math.max(40, local.h * padding);
  const scale = Math.min(
    maxScale,
    Math.max(minScale, Math.min(viewport.width / w, viewport.height / h))
  );
  const cx = local.x + local.w / 2;
  const cy = local.y + local.h / 2;
  return {
    scale,
    tx: viewport.width / 2 - cx * scale,
    ty: viewport.height / 2 - cy * scale,
  };
}

export function poseToFitScreenTarget(
  viewportEl: HTMLElement,
  targetEl: HTMLElement,
  currentCam: CameraPose,
  padding?: number
): CameraPose | null {
  const vr = viewportEl.getBoundingClientRect();
  const tr = targetEl.getBoundingClientRect();
  if (tr.width < 2 || tr.height < 2) return null;
  const local = screenRectToLocal(tr, vr, currentCam);
  return poseToFitLocal(
    { width: vr.width, height: vr.height },
    local,
    padding
  );
}

export function poseToFitScreenRects(
  viewportEl: HTMLElement,
  rects: DOMRect[],
  currentCam: CameraPose,
  padding?: number
): CameraPose | null {
  const union = unionScreenRects(rects);
  if (!union) return null;
  const vr = viewportEl.getBoundingClientRect();
  const local = screenRectToLocal(union, vr, currentCam);
  return poseToFitLocal(
    { width: vr.width, height: vr.height },
    local,
    padding ?? 1.08
  );
}

export function cssTransform(pose: CameraPose): string {
  return `translate(${pose.tx}px, ${pose.ty}px) scale(${pose.scale})`;
}
