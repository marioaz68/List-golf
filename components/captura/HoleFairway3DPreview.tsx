"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLon } from "@/lib/distances/holeBoundary";
import {
  buildSceneryLayout,
  lateralAt,
  type TreeSpec,
} from "@/lib/distances/fairway3DScenery";
import {
  createLocalProjector,
  pointAlongCenterline,
  type LocalPoint,
} from "@/lib/distances/fairway3DMath";

function lookTarget(locals: LocalPoint[], t: number): LocalPoint {
  return pointAlongCenterline(locals, Math.min(1, t + 0.08));
}

function addTree(
  THREE: typeof import("three"),
  parent: import("three").Group,
  spec: TreeSpec,
  trunkMat: import("three").MeshStandardMaterial,
  pineMat: import("three").MeshStandardMaterial,
  broadMat: import("three").MeshStandardMaterial
) {
  const g = new THREE.Group();
  g.position.set(spec.x, 0, spec.z);
  g.rotation.y = spec.rotY;
  const s = spec.scale;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28 * s, 0.42 * s, 2.8 * s, 6),
    trunkMat
  );
  trunk.position.y = 1.4 * s;
  trunk.castShadow = true;
  g.add(trunk);

  if (spec.kind === "pine") {
    for (let i = 0; i < 3; i++) {
      const layer = new THREE.Mesh(
        new THREE.ConeGeometry((2.1 - i * 0.35) * s, (3.2 - i * 0.4) * s, 7),
        pineMat
      );
      layer.position.y = (2.8 + i * 1.7) * s;
      layer.castShadow = true;
      g.add(layer);
    }
  } else {
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(1.8 * s, 8, 7),
      broadMat
    );
    crown.position.y = 3.6 * s;
    crown.scale.set(1.15, 0.85, 1.1);
    crown.castShadow = true;
    g.add(crown);
    const crown2 = new THREE.Mesh(
      new THREE.SphereGeometry(1.2 * s, 7, 6),
      broadMat
    );
    crown2.position.set(0.9 * s, 3.1 * s, 0.2 * s);
    crown2.castShadow = true;
    g.add(crown2);
  }

  parent.add(g);
}

export function HoleFairway3DPreview({
  waypoints,
  center,
  progress,
  yardsToCenter,
  holeNo = 1,
}: {
  waypoints: LatLon[];
  center: LatLon;
  progress: number;
  yardsToCenter: number;
  holeNo?: number;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef(progress);
  const yardsRef = useRef(yardsToCenter);
  const [loadError, setLoadError] = useState<string | null>(null);

  progressRef.current = progress;
  yardsRef.current = yardsToCenter;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || waypoints.length < 2) return;

    let disposed = false;
    let frame = 0;
    let renderer: import("three").WebGLRenderer | null = null;
    let onResize: (() => void) | null = null;

    const origin = waypoints[0];
    const project = createLocalProjector(origin);
    const locals = waypoints.map(project);
    const centerLocal = project(center);
    const scenery = buildSceneryLayout(locals, holeNo);

    void import("three").then((THREE) => {
      if (disposed || !mount) return;

      const width = mount.clientWidth || 360;
      const height = mount.clientHeight || 640;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x87b8d8);
      scene.fog = new THREE.Fog(0xa8c8dc, 120, 520);

      const camera = new THREE.PerspectiveCamera(48, width / height, 0.5, 800);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = true;
      mount.appendChild(renderer.domElement);

      scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x243b2a, 1.05));
      const sun = new THREE.DirectionalLight(0xfff0cc, 1.15);
      sun.position.set(60, 110, 35);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.far = 400;
      sun.shadow.camera.left = -120;
      sun.shadow.camera.right = 120;
      sun.shadow.camera.top = 120;
      sun.shadow.camera.bottom = -120;
      scene.add(sun);

      const roughMat = new THREE.MeshStandardMaterial({
        color: 0x1a3d2e,
        roughness: 0.98,
      });
      const fairwayMat = new THREE.MeshStandardMaterial({
        color: 0x52a06a,
        roughness: 0.78,
      });
      const fringeMat = new THREE.MeshStandardMaterial({
        color: 0x40916c,
        roughness: 0.72,
      });
      const bunkerMat = new THREE.MeshStandardMaterial({
        color: 0xc9b896,
        roughness: 0.92,
      });
      const trunkMat = new THREE.MeshStandardMaterial({
        color: 0x4a3728,
        roughness: 0.9,
      });
      const pineMat = new THREE.MeshStandardMaterial({
        color: 0x1b5e3b,
        roughness: 0.88,
      });
      const broadMat = new THREE.MeshStandardMaterial({
        color: 0x2d6a4f,
        roughness: 0.86,
      });

      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(900, 900),
        roughMat
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      const curve = new THREE.CatmullRomCurve3(
        locals.map((p) => new THREE.Vector3(p.x, 0, p.z))
      );
      const fairway = new THREE.Mesh(
        new THREE.TubeGeometry(
          curve,
          140,
          scenery.fairwayRadius,
          10,
          false
        ),
        fairwayMat
      );
      fairway.castShadow = true;
      fairway.receiveShadow = true;
      scene.add(fairway);

      // Rough lateral (franjas oscuras a los lados del fairway).
      const roughGroup = new THREE.Group();
      for (let t = 0.02; t < 0.95; t += 0.06) {
        const p = pointAlongCenterline(locals, t);
        const { nx, nz, tx, tz } = lateralAt(locals, t);
        for (const side of [-1, 1] as const) {
          const strip = new THREE.Mesh(
            new THREE.PlaneGeometry(18, 28),
            new THREE.MeshStandardMaterial({
              color: side === -1 ? 0x163328 : 0x1a382c,
              roughness: 0.96,
            })
          );
          strip.rotation.x = -Math.PI / 2;
          strip.rotation.z = Math.atan2(tz, tx);
          strip.position.set(
            p.x + nx * (scenery.fairwayRadius + 12) * side,
            0.02,
            p.z + nz * (scenery.fairwayRadius + 12) * side
          );
          strip.receiveShadow = true;
          roughGroup.add(strip);
        }
      }
      scene.add(roughGroup);

      // Tee box.
      const tee0 = locals[0];
      const teeLat = lateralAt(locals, 0.01);
      const teePad = new THREE.Mesh(
        new THREE.BoxGeometry(scenery.fairwayRadius * 2.2, 0.12, 10),
        new THREE.MeshStandardMaterial({ color: 0x5cb87a, roughness: 0.7 })
      );
      teePad.position.set(tee0.x, 0.06, tee0.z);
      teePad.rotation.y = Math.atan2(teeLat.tz, teeLat.tx);
      teePad.receiveShadow = true;
      scene.add(teePad);

      for (const b of scenery.bunkers) {
        const bunker = new THREE.Mesh(
          new THREE.CircleGeometry(1, 24),
          bunkerMat
        );
        bunker.rotation.x = -Math.PI / 2;
        bunker.rotation.z = b.rotY;
        bunker.scale.set(b.rx, b.rz, 1);
        bunker.position.set(b.x, 0.05, b.z);
        bunker.receiveShadow = true;
        scene.add(bunker);
      }

      const green = new THREE.Mesh(
        new THREE.CircleGeometry(18, 48),
        new THREE.MeshStandardMaterial({ color: 0x74c69d, roughness: 0.58 })
      );
      green.rotation.x = -Math.PI / 2;
      green.position.set(centerLocal.x, 0.05, centerLocal.z);
      green.receiveShadow = true;
      scene.add(green);

      const fringe = new THREE.Mesh(
        new THREE.RingGeometry(18, 24, 48),
        fringeMat
      );
      fringe.rotation.x = -Math.PI / 2;
      fringe.position.set(centerLocal.x, 0.04, centerLocal.z);
      scene.add(fringe);

      const treesGroup = new THREE.Group();
      for (const tree of scenery.trees) {
        addTree(THREE, treesGroup, tree, trunkMat, pineMat, broadMat);
      }
      scene.add(treesGroup);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.14, 7, 8),
        new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.6 })
      );
      pole.castShadow = true;
      scene.add(pole);

      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(2.8, 1.8),
        new THREE.MeshStandardMaterial({
          color: 0xdc2626,
          side: THREE.DoubleSide,
        })
      );
      scene.add(flag);

      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16),
        new THREE.MeshStandardMaterial({ color: 0x111827 })
      );
      cup.position.set(centerLocal.x, 0.07, centerLocal.z);
      scene.add(cup);

      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 20, 20),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 })
      );
      ball.castShadow = true;
      scene.add(ball);

      onResize = () => {
        if (!mount || !renderer) return;
        const w = mount.clientWidth || width;
        const h = mount.clientHeight || height;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener("resize", onResize);
      onResize();

      const animate = () => {
        if (disposed) return;
        frame = requestAnimationFrame(animate);

        const t = Math.max(0, Math.min(1, progressRef.current * 0.96));
        const player = pointAlongCenterline(locals, t);
        const target = lookTarget(locals, t);

        ball.position.set(player.x, 0.42, player.z);

        const dx = target.x - player.x;
        const dz = target.z - player.z;
        const dist = Math.hypot(dx, dz) || 1;
        const yds = yardsRef.current;
        const back = 18 + Math.min(32, yds * 0.07);
        const camY = 4.2 + Math.min(8, yds * 0.012);
        camera.position.set(
          player.x - (dx / dist) * back,
          camY,
          player.z - (dz / dist) * back
        );
        if (yds > 80) {
          camera.lookAt(target.x, 1.4, target.z);
        } else {
          camera.lookAt(
            centerLocal.x * 0.35 + target.x * 0.65,
            1.6,
            centerLocal.z * 0.35 + target.z * 0.65
          );
        }

        const flagScale = Math.max(0.45, Math.min(1, 1 - yds / 420));
        pole.scale.set(1, flagScale, 1);
        pole.position.set(centerLocal.x, 3.5 * flagScale, centerLocal.z);
        flag.scale.set(flagScale, flagScale, 1);
        flag.position.set(
          centerLocal.x + 1.4 * flagScale,
          3.5 * flagScale + 2.7 * flagScale,
          centerLocal.z
        );

        renderer?.render(scene, camera);
      };
      animate();
    }).catch(() => {
      if (!disposed) {
        setLoadError("No se pudo iniciar la vista 3D en este dispositivo.");
      }
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (onResize) window.removeEventListener("resize", onResize);
      renderer?.dispose();
      mount.replaceChildren();
    };
  }, [waypoints, center, holeNo]);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 px-6 text-center text-sm text-red-200">
        {loadError}
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      className="h-full w-full touch-none bg-slate-900"
      aria-label="Vista previa 3D del hoyo"
    />
  );
}
