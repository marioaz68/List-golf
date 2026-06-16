#!/usr/bin/env python3
"""
Pre-marca bunkers (trampas de arena) por hoyo desde la imagen satelital.

Idea: bajamos los mismos tiles satelitales que muestra la app (Google, con
respaldo Esri), recortamos al límite del hoyo (línea azul calibrada), detectamos
las zonas color arena por color (HSV) y las vectorizamos en polígonos. Esos
polígonos se guardan como borradores `kind='bunker'` en course_hole_polygons.

NO es exacto: detecta la mayoría de bunkers pero también da falsos positivos
(caminos, zonas claras secas). El usuario los ajusta/borra en Calibrar.

Uso:
  scripts/.venv-bunkers/bin/python scripts/detect_bunkers.py --holes all
  scripts/.venv-bunkers/bin/python scripts/detect_bunkers.py --holes 1 --dry-run
"""

from __future__ import annotations

import argparse
import io
import math
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TILE_CACHE = ROOT / "scripts" / ".bunker-tiles"
DEBUG_DIR = ROOT / "scripts" / ".bunker-debug"
COURSE_ID = "4bd3a144-dfe4-49f0-b11c-1d80132a7e63"

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

# ---- Parámetros de detección (ajustables) --------------------------------
ZOOM_MAX = 20            # zoom satelital máximo
MAX_TILES = 240          # tope de tiles por hoyo (baja el zoom si se excede)
MIN_AREA_M2 = 14.0       # bunker mínimo
MAX_AREA_M2 = 2000.0     # arriba de esto suele ser fairway/calle, no bunker
MAX_BUNKERS = 10         # máximo de borradores por hoyo (los más grandes)
APPROX_FRAC = 0.018      # simplificación del contorno (fracción del perímetro)
EROSION_M = 2.0          # encoge el límite del hoyo para evitar artefactos de orilla
# Filtros de forma: descartan tiras de camino y bordes irregulares.
CIRC_MIN = 0.34          # circularidad mínima (1=círculo, tira≈0)
SOLIDITY_MIN = 0.70      # área/casco-convexo (compacidad)
ELONG_MAX = 3.0          # relación largo/ancho máxima (tiras alargadas fuera)


# ============================ env / supabase ==============================
def load_env() -> dict[str, str]:
    env = {}
    f = ROOT / ".env.local"
    if f.exists():
        for line in f.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if k in os.environ:
            env[k] = os.environ[k]
    return env


def sb_headers(env: dict[str, str]) -> dict[str, str]:
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def fetch_boundary(env: dict[str, str], hole: int) -> list[tuple[float, float]] | None:
    """Anillo exterior del hoyo como lista de (lon, lat)."""
    url = f"{env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/course_holes"
    params = {
        "select": "boundary_geojson",
        "course_id": f"eq.{COURSE_ID}",
        "hole_number": f"eq.{hole}",
    }
    r = requests.get(url, headers=sb_headers(env), params=params, timeout=30)
    r.raise_for_status()
    rows = r.json()
    if not rows or not rows[0].get("boundary_geojson"):
        return None
    geo = rows[0]["boundary_geojson"]
    if geo.get("type") != "Polygon":
        return None
    ring = geo["coordinates"][0]
    return [(float(c[0]), float(c[1])) for c in ring]


def write_bunkers(env: dict[str, str], hole: int, rings: list[list[tuple[float, float]]]) -> None:
    base = f"{env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/course_hole_polygons"
    h = sb_headers(env)
    # Borra borradores previos de bunker del hoyo.
    requests.delete(
        base,
        headers=h,
        params={
            "course_id": f"eq.{COURSE_ID}",
            "hole_number": f"eq.{hole}",
            "kind": "eq.bunker",
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
                "kind": "bunker",
                "geojson": {"type": "Polygon", "coordinates": [coords]},
                "sort_order": i,
            }
        )
    r = requests.post(base, headers={**h, "Prefer": "return=minimal"}, json=payload, timeout=30)
    r.raise_for_status()


# ============================ web mercator ================================
TILE = 256


def lonlat_to_px(lon: float, lat: float, z: float) -> tuple[float, float]:
    n = TILE * (2 ** z)
    x = (lon + 180.0) / 360.0 * n
    siny = math.sin(math.radians(lat))
    siny = min(max(siny, -0.9999), 0.9999)
    y = (0.5 - math.log((1 + siny) / (1 - siny)) / (4 * math.pi)) * n
    return x, y


def px_to_lonlat(x: float, y: float, z: float) -> tuple[float, float]:
    n = TILE * (2 ** z)
    lon = x / n * 360.0 - 180.0
    k = math.pi - 2.0 * math.pi * y / n
    lat = math.degrees(math.atan(math.sinh(k)))
    return lon, lat


def ground_res_m(lat: float, z: int) -> float:
    return 156543.03392 * math.cos(math.radians(lat)) / (2 ** z)


# ============================ tile download ===============================
def download_tile(z: int, x: int, y: int) -> np.ndarray | None:
    cache = TILE_CACHE / str(z) / str(x) / f"{y}.jpg"
    if cache.exists():
        try:
            return np.array(Image.open(cache).convert("RGB"))
        except Exception:
            cache.unlink(missing_ok=True)
    urls = [
        f"https://mt{(x + y) % 4}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ]
    for u in urls:
        try:
            r = requests.get(u, headers={"User-Agent": UA}, timeout=30)
            if r.status_code == 200 and len(r.content) > 500:
                img = Image.open(io.BytesIO(r.content)).convert("RGB")
                cache.parent.mkdir(parents=True, exist_ok=True)
                img.save(cache, "JPEG", quality=92)
                return np.array(img)
        except Exception:
            continue
        time.sleep(0.05)
    return None


def pick_zoom(ring: list[tuple[float, float]]) -> int:
    lons = [c[0] for c in ring]
    lats = [c[1] for c in ring]
    for z in range(ZOOM_MAX, 15, -1):
        x0, _ = lonlat_to_px(min(lons), max(lats), z)
        x1, _ = lonlat_to_px(max(lons), min(lats), z)
        _, y0 = lonlat_to_px(min(lons), max(lats), z)
        _, y1 = lonlat_to_px(max(lons), min(lats), z)
        ntx = int(x1 // TILE) - int(x0 // TILE) + 1
        nty = int(y1 // TILE) - int(y0 // TILE) + 1
        if ntx * nty <= MAX_TILES:
            return z
    return 16


def build_mosaic(ring: list[tuple[float, float]], z: int):
    lons = [c[0] for c in ring]
    lats = [c[1] for c in ring]
    # margen del 8% alrededor del hoyo
    mlon = (max(lons) - min(lons)) * 0.08
    mlat = (max(lats) - min(lats)) * 0.08
    minlon, maxlon = min(lons) - mlon, max(lons) + mlon
    minlat, maxlat = min(lats) - mlat, max(lats) + mlat

    px_min, py_min = lonlat_to_px(minlon, maxlat, z)  # top-left
    px_max, py_max = lonlat_to_px(maxlon, minlat, z)  # bottom-right
    tx0, ty0 = int(px_min // TILE), int(py_min // TILE)
    tx1, ty1 = int(px_max // TILE), int(py_max // TILE)

    W = (tx1 - tx0 + 1) * TILE
    H = (ty1 - ty0 + 1) * TILE
    mosaic = np.zeros((H, W, 3), dtype=np.uint8)
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            t = download_tile(z, tx, ty)
            if t is None:
                continue
            ox = (tx - tx0) * TILE
            oy = (ty - ty0) * TILE
            mosaic[oy:oy + TILE, ox:ox + TILE] = t
    # offset global en px de la esquina sup-izq del mosaico
    off_x = tx0 * TILE
    off_y = ty0 * TILE
    return mosaic, off_x, off_y


# ============================ detección ===================================
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

    # máscara del interior del hoyo (en px del mosaico)
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

    # detección de arena por color (HSV) + warmth (R>=G)
    hsv = cv2.cvtColor(mosaic, cv2.COLOR_RGB2HSV)
    Hh, Ss, Vv = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    R = mosaic[:, :, 0].astype(np.int16)
    G = mosaic[:, :, 1].astype(np.int16)
    B = mosaic[:, :, 2].astype(np.int16)
    sand = (
        (Hh >= 13) & (Hh <= 38) &
        (Ss >= 15) & (Ss <= 135) &
        (Vv >= 140) &
        (R >= G) & (G >= B + 8) & (R - B <= 110)
    ).astype(np.uint8) * 255
    sand = cv2.bitwise_and(sand, hole_mask)

    # limpieza morfológica
    sand = cv2.morphologyEx(sand, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)
    sand = cv2.morphologyEx(sand, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)

    contours, _ = cv2.findContours(sand, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cands = []
    for c in contours:
        area = cv2.contourArea(c)
        area_m2 = area * res * res
        if area_m2 < MIN_AREA_M2 or area_m2 > MAX_AREA_M2:
            continue
        peri = cv2.arcLength(c, True)
        if peri <= 0:
            continue
        # Forma: los bunkers son compactos (no tiras de camino).
        circ = 4.0 * math.pi * area / (peri * peri)  # 1=círculo, ~0=tira
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
    cands = cands[:MAX_BUNKERS]

    rings_ll = []
    for _, approx in cands:
        ll = []
        for p in approx.reshape(-1, 2):
            lon, lat = px_to_lonlat(p[0] + off_x, p[1] + off_y, z)
            ll.append((lon, lat))
        rings_ll.append(ll)

    # overlay de depuración
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    dbg = cv2.cvtColor(mosaic, cv2.COLOR_RGB2BGR).copy()
    cv2.polylines(dbg, [poly_px], True, (255, 200, 0), 2)
    for _, approx in cands:
        cv2.polylines(dbg, [approx], True, (0, 0, 255), 2)
    cv2.imwrite(str(DEBUG_DIR / f"hole{hole:02d}.png"), dbg)

    print(f"  hoyo {hole}: z={z} res={res:.3f}m/px -> {len(rings_ll)} bunkers")
    if not dry_run:
        write_bunkers(env, hole, rings_ll)
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
    print(f"Listo: {total} bunkers en {len(holes)} hoyos [{mode}].")
    print(f"Overlays de depuración en {DEBUG_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
