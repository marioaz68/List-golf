#!/usr/bin/env python3
"""
Pre-marca lagos / agua por hoyo desde la imagen satelital.

Reutiliza la infraestructura del detector de bunkers (descarga de tiles, límite
del hoyo, mosaico y proyección) pero con detección de color AGUA (azul/turquesa)
y filtros de forma más flexibles: los lagos suelen ser grandes e irregulares.

Guarda los polígonos como borradores `kind='water'` en course_hole_polygons.
NO es exacto (puede marcar albercas/techos azules); el usuario ajusta/borra en
Calibrar.

Uso:
  scripts/.venv-bunkers/bin/python scripts/detect_water.py --holes all
  scripts/.venv-bunkers/bin/python scripts/detect_water.py --holes 1 --dry-run
"""

from __future__ import annotations

import argparse
import sys

import cv2
import numpy as np
import requests

from detect_bunkers import (
    COURSE_ID,
    DEBUG_DIR,
    build_mosaic,
    fetch_boundary,
    ground_res_m,
    load_env,
    lonlat_to_px,
    pick_zoom,
    px_to_lonlat,
    sb_headers,
)

# ---- Parámetros de detección de agua (ajustables) ------------------------
MIN_AREA_M2 = 80.0       # lago mínimo (más grande que un bunker)
MAX_AREA_M2 = 120000.0   # lagos pueden ser muy grandes
MAX_POLYS = 6            # máximo de borradores por hoyo (los más grandes)
APPROX_FRAC = 0.012      # simplificación del contorno (más detalle que bunker)
EROSION_M = 1.0          # apenas encoge el límite del hoyo
# Filtros de forma flexibles: el agua puede ser alargada/irregular.
CIRC_MIN = 0.10
SOLIDITY_MIN = 0.42
ELONG_MAX = 7.0


def write_water(env: dict[str, str], hole: int, rings: list[list[tuple[float, float]]]) -> None:
    base = f"{env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/course_hole_polygons"
    h = sb_headers(env)
    requests.delete(
        base,
        headers=h,
        params={
            "course_id": f"eq.{COURSE_ID}",
            "hole_number": f"eq.{hole}",
            "kind": "eq.water",
        },
        timeout=30,
    ).raise_for_status()
    if not rings:
        return
    payload = []
    for i, ring in enumerate(rings):
        coords = [[round(lon, 7), round(lat, 7)] for lon, lat in ring]
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        payload.append(
            {
                "course_id": COURSE_ID,
                "hole_number": hole,
                "kind": "water",
                "geojson": {"type": "Polygon", "coordinates": [coords]},
                "sort_order": i,
            }
        )
    r = requests.post(base, headers={**h, "Prefer": "return=minimal"}, json=payload, timeout=30)
    r.raise_for_status()


def water_mask(mosaic: np.ndarray) -> np.ndarray:
    """Máscara de agua: azul/turquesa por HSV + canal B dominante."""
    hsv = cv2.cvtColor(mosaic, cv2.COLOR_RGB2HSV)
    Hh, Ss, Vv = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    R = mosaic[:, :, 0].astype(np.int16)
    G = mosaic[:, :, 1].astype(np.int16)
    B = mosaic[:, :, 2].astype(np.int16)
    # Hue OpenCV 0-180: turquesa/azul ≈ 85-135. Agua: B manda sobre R.
    mask = (
        (Hh >= 80) & (Hh <= 138) &
        (Ss >= 28) &
        (Vv >= 35) & (Vv <= 235) &
        (B >= R + 4) & (B >= G - 25)
    ).astype(np.uint8) * 255
    return mask


def detect(hole: int, env: dict[str, str], dry_run: bool) -> int:
    ring = fetch_boundary(env, hole)
    if not ring or len(ring) < 4:
        print(f"  hoyo {hole}: sin límite calibrado, lo salto.")
        return 0
    z = pick_zoom(ring)
    lat_c = sum(c[1] for c in ring) / len(ring)
    res = ground_res_m(lat_c, z)
    mosaic, off_x, off_y = build_mosaic(ring, z)
    H, W = mosaic.shape[:2]

    poly_px = np.array(
        [
            [int(round(lonlat_to_px(lon, lat, z)[0] - off_x)),
             int(round(lonlat_to_px(lon, lat, z)[1] - off_y))]
            for lon, lat in ring
        ],
        dtype=np.int32,
    )
    hole_mask = np.zeros((H, W), dtype=np.uint8)
    cv2.fillPoly(hole_mask, [poly_px], 255)
    er = max(1, int(EROSION_M / res))
    hole_mask = cv2.erode(hole_mask, np.ones((er, er), np.uint8), iterations=1)

    water = water_mask(mosaic)
    water = cv2.bitwise_and(water, hole_mask)
    # Cierra huecos (fuentes/reflejos blancos dentro del lago) y limpia ruido.
    water = cv2.morphologyEx(water, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8), iterations=3)
    water = cv2.morphologyEx(water, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(water, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cands = []
    for c in contours:
        area = cv2.contourArea(c)
        area_m2 = area * res * res
        if area_m2 < MIN_AREA_M2 or area_m2 > MAX_AREA_M2:
            continue
        peri = cv2.arcLength(c, True)
        if peri <= 0:
            continue
        circ = 4.0 * np.pi * area / (peri * peri)
        hull = cv2.convexHull(c)
        hull_area = cv2.contourArea(hull)
        solidity = area / hull_area if hull_area > 0 else 0.0
        rect = cv2.minAreaRect(c)
        (rw, rh) = rect[1]
        elong = (max(rw, rh) / min(rw, rh)) if min(rw, rh) > 0 else 99.0
        if circ < CIRC_MIN or solidity < SOLIDITY_MIN or elong > ELONG_MAX:
            continue
        approx = cv2.approxPolyDP(c, APPROX_FRAC * peri, True)
        if len(approx) < 3:
            continue
        cands.append((area_m2, approx))

    cands.sort(key=lambda t: t[0], reverse=True)
    cands = cands[:MAX_POLYS]

    rings_ll = []
    for _, approx in cands:
        ll = []
        for p in approx.reshape(-1, 2):
            lon, lat = px_to_lonlat(p[0] + off_x, p[1] + off_y, z)
            ll.append((lon, lat))
        rings_ll.append(ll)

    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    dbg = cv2.cvtColor(mosaic, cv2.COLOR_RGB2BGR).copy()
    cv2.polylines(dbg, [poly_px], True, (255, 200, 0), 2)
    for _, approx in cands:
        cv2.polylines(dbg, [approx], True, (255, 0, 0), 2)
    cv2.imwrite(str(DEBUG_DIR / f"hole{hole:02d}_water.png"), dbg)

    print(f"  hoyo {hole}: z={z} res={res:.3f}m/px -> {len(rings_ll)} lagos")
    if not dry_run:
        write_water(env, hole, rings_ll)
    return len(rings_ll)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--holes", default="all", help='"all" o "1" o "1,2,3"')
    ap.add_argument("--dry-run", action="store_true", help="no escribe en la BD")
    args = ap.parse_args()

    env = load_env()
    if "NEXT_PUBLIC_SUPABASE_URL" not in env or "SUPABASE_SERVICE_ROLE_KEY" not in env:
        print("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
        return 1

    if args.holes == "all":
        holes = list(range(1, 19))
    else:
        holes = [int(x) for x in args.holes.split(",") if x.strip()]

    total = 0
    for h in holes:
        try:
            total += detect(h, env, args.dry_run)
        except Exception as e:
            print(f"  hoyo {h}: ERROR {e}")
    mode = "DRY-RUN (no se guardó)" if args.dry_run else "guardado en BD"
    print(f"Listo: {total} lagos en {len(holes)} hoyos [{mode}].")
    print(f"Overlays de depuración en {DEBUG_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
