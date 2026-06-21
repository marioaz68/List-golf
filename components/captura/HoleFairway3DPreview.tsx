"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLon } from "@/lib/distances/holeBoundary";
import {
  createLocalProjector,
  pointAlongCenterline,
  type LocalPoint,
} from "@/lib/distances/fairway3DMath";

function lookTarget(locals: LocalPoint[], t: number): LocalPoint {
  return pointAlongCenterline(locals, Math.min(1, t + 0.08));
}

export function HoleFairway3DPreview({
  waypoints,
  center,
  progress,
  yardsToCenter,
}: {
  waypoints: LatLon[];
  center: LatLon;
  progress: number;
  yardsToCenter: number;
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

    void import("three").then((THREE) => {
      if (disposed || !mount) return;

      const width = mount.clientWidth || 360;
      const height = mount.clientHeight || 640;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x7eb8c9);
      scene.fog = new THREE.Fog(0x9ec4d0, 180, 650);

      const camera = new THREE.PerspectiveCamera(48, width / height, 0.5, 800);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = true;
      mount.appendChild(renderer.domElement);

      scene.add(new THREE.HemisphereLight(0xdff4ff, 0x2f4f3a, 0.95));
      const sun = new THREE.DirectionalLight(0xfff2d6, 1.1);
      sun.position.set(80, 120, 40);
      sun.castShadow = true;
      scene.add(sun);

      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(900, 900),
        new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.95 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      const curve = new THREE.CatmullRomCurve3(
        locals.map((p) => new THREE.Vector3(p.x, 0, p.z))
      );
      const fairway = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 120, 14, 8, false),
        new THREE.MeshStandardMaterial({ color: 0x40916c, roughness: 0.82 })
      );
      fairway.castShadow = true;
      fairway.receiveShadow = true;
      scene.add(fairway);

      const green = new THREE.Mesh(
        new THREE.CircleGeometry(16, 48),
        new THREE.MeshStandardMaterial({ color: 0x52b788, roughness: 0.65 })
      );
      green.rotation.x = -Math.PI / 2;
      green.position.set(centerLocal.x, 0.04, centerLocal.z);
      scene.add(green);

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
      cup.position.set(centerLocal.x, 0.06, centerLocal.z);
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
        const camY = 4 + Math.min(8, yds * 0.012);
        camera.position.set(
          player.x - (dx / dist) * back,
          camY,
          player.z - (dz / dist) * back
        );
        if (yds > 80) {
          camera.lookAt(target.x, 1.2, target.z);
        } else {
          camera.lookAt(
            centerLocal.x * 0.4 + target.x * 0.6,
            1.8,
            centerLocal.z * 0.4 + target.z * 0.6
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
  }, [waypoints, center]);

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
