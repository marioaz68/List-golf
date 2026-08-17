export type CameraPose = {
  tx: number;
  ty: number;
  scale: number;
};

export const AUCTION_BRACKET_ZOOM_IN_MS = 1600;
export const AUCTION_BRACKET_SLOT_HOLD_MS = 800;
export const AUCTION_BRACKET_OPEN_CLUSTER_MS = 1400;
export const AUCTION_BRACKET_CLUSTER_HOLD_MS = 5000;
export const AUCTION_BRACKET_OPEN_HALF_MS = 1600;
export const AUCTION_BRACKET_PAN_PX_PER_SEC = 22;
export const AUCTION_BRACKET_PAN_TOP_HOLD_MS = 900;
export const AUCTION_BRACKET_PAN_END_HOLD_MS = 1400;
export const AUCTION_BRACKET_PAN_RESET_MS = 1200;

export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

export function lerpPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  return mixPose(a, b, easeOutCubic(t));
}

export function mixPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  const u = Math.min(1, Math.max(0, t));
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
  minScale = 0.18,
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
  padding?: number,
  minScale = 0.18
): CameraPose | null {
  const union = unionScreenRects(rects);
  if (!union) return null;
  const vr = viewportEl.getBoundingClientRect();
  const local = screenRectToLocal(union, vr, currentCam);
  return poseToFitLocal(
    { width: vr.width, height: vr.height },
    local,
    padding ?? 1.08,
    minScale
  );
}

export function cssTransform(pose: CameraPose): string {
  return `translate(${pose.tx}px, ${pose.ty}px) scale(${pose.scale})`;
}

/** 4 partidos de R1 (8 seeds) cuya llave manda 4 ganadores a la siguiente ronda. */
export function r1AdvanceCluster(
  round: number,
  positionIdx: number
): number | null {
  if (round < 1 || round > 3) return null;
  const r1Start = positionIdx * Math.pow(2, round - 1);
  return Math.floor(r1Start / 4);
}

/** Encuadre a lo ancho y rango vertical para recorrer el cuadro de arriba a abajo. */
export function widthFitPanRange(
  viewport: { width: number; height: number },
  local: { x: number; y: number; w: number; h: number },
  padding = 1.04
): { top: CameraPose; bottom: CameraPose; overflow: number } {
  const w = Math.max(40, local.w * padding);
  const scale = Math.min(
    3.4,
    Math.max(0.18, viewport.width / w)
  );
  const cx = local.x + local.w / 2;
  const tx = viewport.width / 2 - cx * scale;
  const pad = 12;
  const top: CameraPose = {
    scale,
    tx,
    ty: pad - local.y * scale,
  };
  const bottom: CameraPose = {
    scale,
    tx,
    ty: viewport.height - pad - (local.y + local.h) * scale,
  };
  const overflow = Math.max(0, local.h * scale - (viewport.height - pad * 2));
  return { top, bottom, overflow };
}
