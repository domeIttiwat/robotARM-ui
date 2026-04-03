"use client";

/**
 * SkeletonOverlay3D — polygon two-zone safety system
 * ────────────────────────────────────────────────────
 * WARN zone (outer): cool colors — cyan/blue → หุ่นช้า
 * STOP zone (inner): hot colors  — orange→red → หุ่นหยุด
 *
 * Style: solid polygon fill + wireframe edge overlay (no glow/additive)
 * Both zones are always rendered; visibility controlled via props.
 * Safety callback fires only on level change to avoid ROS flooding.
 */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { SkeletonPerson } from "@/types/skeleton";

// ─── Palette: COOL = warn (far), HOT = stop (close) ───────────────────────────
const C_WARN_IDLE   = new THREE.Color(0x0ea5e9); // sky-blue (warn idle)
const C_WARN_HIT    = new THREE.Color(0x67e8f9); // bright cyan (warn triggered)
const C_STOP_IDLE   = new THREE.Color(0xf97316); // orange (stop idle)
const C_STOP_HIT    = new THREE.Color(0xef4444); // red (stop triggered)
const C_HUMAN_SAFE  = new THREE.Color(0x4ade80); // green
const C_HUMAN_WARN  = new THREE.Color(0xfbbf24); // amber
const C_HUMAN_STOP  = new THREE.Color(0xf87171); // light-red
const _tc = new THREE.Color(); // reusable temp

// ─── Layer config (polygon: fill + wireframe) ─────────────────────────────────
type LayerDef = { rMult: number; baseOp: number; wireframe: boolean };

const WARN_LAYERS: LayerDef[] = [
  { rMult: 1.0, baseOp: 0.18, wireframe: false }, // semi-transparent fill
  { rMult: 1.0, baseOp: 0.75, wireframe: true  }, // wireframe edge
];
const STOP_LAYERS: LayerDef[] = [
  { rMult: 1.0, baseOp: 0.28, wireframe: false },
  { rMult: 1.0, baseOp: 0.85, wireframe: true  },
];
const HUMAN_LAYERS: LayerDef[] = [
  { rMult: 1.0, baseOp: 0.32, wireframe: false },
  { rMult: 1.0, baseOp: 0.60, wireframe: true  },
];
const HEAD_LAYERS: LayerDef[] = [
  { rMult: 1.0, baseOp: 0.35, wireframe: false },
  { rMult: 1.0, baseOp: 0.65, wireframe: true  },
];

// ─── Glow handle ──────────────────────────────────────────────────────────────
interface GlowLayer { cyl: THREE.Mesh; cap0: THREE.Mesh; cap1: THREE.Mesh; mat: THREE.MeshBasicMaterial; rMult: number; baseOp: number }
interface GlowHandle { group: THREE.Group; layers: GlowLayer[] }

function makeMat(opacity: number, wireframe: boolean): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    transparent: true, opacity, wireframe,
    depthWrite: false, side: THREE.DoubleSide,
  });
}

function makeGlowCapsule(defs: LayerDef[]): GlowHandle {
  const group  = new THREE.Group();
  const layers = defs.map(({ rMult, baseOp, wireframe }) => {
    const mat  = makeMat(baseOp, wireframe);
    const cyl  = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1, !wireframe), mat);
    const cap0 = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 7), mat);
    const cap1 = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 7), mat);
    group.add(cyl, cap0, cap1);
    return { cyl, cap0, cap1, mat, rMult, baseOp };
  });
  return { group, layers };
}

function makeGlowSphere(defs: LayerDef[]): GlowHandle {
  const group  = new THREE.Group();
  const layers = defs.map(({ rMult, baseOp, wireframe }) => {
    const mat = makeMat(baseOp, wireframe);
    const sph = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat);
    group.add(sph);
    return { cyl: sph, cap0: sph, cap1: sph, mat, rMult, baseOp } as GlowLayer;
  });
  return { group, layers };
}

function disposeHandle(h: GlowHandle) {
  h.layers.forEach(({ cyl, cap0, cap1, mat }) => {
    if (cyl !== cap0) cyl.geometry.dispose();
    if (cap0 !== cap1) cap0.geometry.dispose();
    cap1.geometry.dispose();
    mat.dispose();
  });
}

const _vup  = new THREE.Vector3(0, 1, 0);
const _vdir = new THREE.Vector3();

function setCapsule(h: GlowHandle, pa: THREE.Vector3, pb: THREE.Vector3, radius: number, color: THREE.Color, opFactor: number) {
  _vdir.subVectors(pb, pa);
  const len = _vdir.length();
  if (len < 0.001) { h.group.visible = false; return; }
  h.group.visible = true;
  h.group.position.copy(pa);
  h.group.quaternion.setFromUnitVectors(_vup, _vdir.divideScalar(len));
  h.layers.forEach(({ cyl, cap0, cap1, mat, rMult, baseOp }) => {
    const r = radius * rMult;
    cyl.scale.set(r, len, r); cyl.position.set(0, len * 0.5, 0);
    cap0.scale.setScalar(r); cap0.position.set(0, 0,   0);
    cap1.scale.setScalar(r); cap1.position.set(0, len, 0);
    mat.color.copy(color); mat.opacity = Math.min(1, baseOp * opFactor);
  });
}

function setSphere(h: GlowHandle, pos: THREE.Vector3, radius: number, color: THREE.Color, opFactor: number) {
  h.group.visible = true;
  h.group.position.copy(pos);
  h.layers.forEach(({ cyl: sph, mat, rMult, baseOp }) => {
    sph.scale.setScalar(radius * rMult);
    mat.color.copy(color); mat.opacity = Math.min(1, baseOp * opFactor);
  });
}

// ─── Robot arm segment config — FIXED ────────────────────────────────────────
// jPos[i] = JOINT_NAMES[i] world position
// Segments: ORIGIN→J1, J1→J2, J2→J3, J3→J4, J4→J5, J5→J6
const JOINT_NAMES = ["J1", "J2", "J3", "J4", "J5", "J6"] as const;
const SEG_FROM    = [-1, 0, 1, 2, 3, 4] as const; // −1 = world origin
const SEG_TO      = [ 0, 1, 2, 3, 4, 5] as const; // ← FIXED (was [1,2,3,4,5,5])
const NUM_SEGS    = 6;

// ─── Human body segments ──────────────────────────────────────────────────────
interface BodySeg { fromKpt: number | "mid_sh" | "mid_hip"; toKpt: number | "mid_sh" | "mid_hip"; r: number; kpts: number[] }
const BODY_SEGS: BodySeg[] = [
  { fromKpt: "mid_sh",  toKpt: "mid_hip", r: 0.15,  kpts: [11,12,23,24] },
  { fromKpt: 11, toKpt: 13, r: 0.07,  kpts: [11,13] },
  { fromKpt: 12, toKpt: 14, r: 0.07,  kpts: [12,14] },
  { fromKpt: 13, toKpt: 15, r: 0.055, kpts: [13,15] },
  { fromKpt: 14, toKpt: 16, r: 0.055, kpts: [14,16] },
  { fromKpt: 23, toKpt: 27, r: 0.09,  kpts: [23,27] },
  { fromKpt: 24, toKpt: 28, r: 0.09,  kpts: [24,28] },
];
const MAX_PERSONS = 2;

// ─── Collision math ───────────────────────────────────────────────────────────
function ptSegDist(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const abx = bx-ax, aby = by-ay, abz = bz-az;
  const apx = px-ax, apy = py-ay, apz = pz-az;
  const ab2 = abx*abx + aby*aby + abz*abz;
  if (ab2 === 0) return Math.sqrt(apx*apx + apy*apy + apz*apz);
  const t = Math.max(0, Math.min(1, (apx*abx + apy*aby + apz*abz) / ab2));
  const dx = px-(ax+abx*t), dy = py-(ay+aby*t), dz = pz-(az+abz*t);
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

// ─── Public API ───────────────────────────────────────────────────────────────
export interface SkeletonOverlay3DProps {
  persons:             SkeletonPerson[];
  capsuleRadiusWarn:   number;  // outer zone (m) → level 1
  capsuleRadiusStop:   number;  // inner zone (m) → level 2
  capsulesVisible:     boolean;
  skeletonVisible:     boolean;
  onSafetyLevelChange?: (level: 0 | 1 | 2) => void;
}

export default function SkeletonOverlay3D({
  persons, capsuleRadiusWarn, capsuleRadiusStop,
  capsulesVisible, skeletonVisible, onSafetyLevelChange,
}: SkeletonOverlay3DProps) {
  const { scene } = useThree();

  const jPos = useRef(Array.from({ length: 6 }, () => new THREE.Vector3()));
  const warnCaps = useRef<GlowHandle[]>([]);
  const stopCaps = useRef<GlowHandle[]>([]);
  const humanH   = useRef<Array<{ segs: GlowHandle[]; head: GlowHandle }>>([]);
  const prevLevel = useRef<0 | 1 | 2>(0);

  const props = useRef({ persons, capsuleRadiusWarn, capsuleRadiusStop, capsulesVisible, skeletonVisible, onSafetyLevelChange });
  props.current = { persons, capsuleRadiusWarn, capsuleRadiusStop, capsulesVisible, skeletonVisible, onSafetyLevelChange };

  // ── Create ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const warn = Array.from({ length: NUM_SEGS }, () => { const h = makeGlowCapsule(WARN_LAYERS); scene.add(h.group); return h; });
    const stop = Array.from({ length: NUM_SEGS }, () => { const h = makeGlowCapsule(STOP_LAYERS); scene.add(h.group); return h; });
    warnCaps.current = warn;
    stopCaps.current = stop;

    const humans = Array.from({ length: MAX_PERSONS }, () => {
      const segs = BODY_SEGS.map(() => { const h = makeGlowCapsule(HUMAN_LAYERS); h.group.visible = false; scene.add(h.group); return h; });
      const head = makeGlowSphere(HEAD_LAYERS); head.group.visible = false; scene.add(head.group);
      return { segs, head };
    });
    humanH.current = humans;

    return () => {
      [...warn, ...stop].forEach(h => { scene.remove(h.group); disposeHandle(h); });
      humans.forEach(({ segs, head }) => {
        segs.forEach(h => { scene.remove(h.group); disposeHandle(h); });
        scene.remove(head.group); disposeHandle(head);
      });
    };
  }, [scene]);

  // ── Per-frame ────────────────────────────────────────────────────────────────
  useFrame(({ clock }) => {
    const { persons, capsuleRadiusWarn, capsuleRadiusStop, capsulesVisible, skeletonVisible, onSafetyLevelChange } = props.current;
    const t  = clock.getElapsedTime();
    const rW = capsuleRadiusWarn;
    const rS = Math.min(capsuleRadiusStop, rW * 0.99); // inner always < outer

    // 1. Joint world positions
    JOINT_NAMES.forEach((name, i) => {
      const obj = scene.getObjectByName(name);
      if (obj) obj.getWorldPosition(jPos.current[i]);
    });

    const ORIGIN = new THREE.Vector3(0, 0, 0);
    const segPA = SEG_FROM.map(idx => idx === -1 ? ORIGIN : jPos.current[idx]);
    const segPB = SEG_TO.map(idx => jPos.current[idx]);

    // 2. Min distance per keypoint to any segment
    type KptDists = Record<number, number>;
    const allDists = persons.slice(0, MAX_PERSONS).map(person => {
      const d: KptDists = {};
      for (const [ks, kp] of Object.entries(person.keypoints)) {
        if (!kp) continue;
        let minD = Infinity;
        for (let s = 0; s < NUM_SEGS; s++)
          minD = Math.min(minD, ptSegDist(kp.x, kp.y, kp.z, segPA[s].x, segPA[s].y, segPA[s].z, segPB[s].x, segPB[s].y, segPB[s].z));
        d[parseInt(ks)] = minD;
      }
      return d;
    });

    // 3. Global safety level (correct two-stage check)
    let newLevel: 0 | 1 | 2 = 0;
    outer: for (const dists of allDists) {
      for (const d of Object.values(dists)) {
        if (d < rS) { newLevel = 2; break outer; }
        if (d < rW && newLevel < 1) newLevel = 1;
      }
    }
    if (newLevel !== prevLevel.current) {
      prevLevel.current = newLevel;
      onSafetyLevelChange?.(newLevel);
    }

    // 4. Per-segment closest distance
    const segMinDist = Array.from({ length: NUM_SEGS }, (_, s) => {
      let minD = Infinity;
      for (const person of persons)
        for (const kp of Object.values(person.keypoints))
          if (kp) minD = Math.min(minD, ptSegDist(kp.x, kp.y, kp.z, segPA[s].x, segPA[s].y, segPA[s].z, segPB[s].x, segPB[s].y, segPB[s].z));
      return minD;
    });

    // 5. Capsule visuals
    for (let s = 0; s < NUM_SEGS; s++) {
      const wh = warnCaps.current[s];
      const sh = stopCaps.current[s];
      if (!wh || !sh) continue; // useEffect not yet run
      const d  = segMinDist[s];

      wh.group.visible = capsulesVisible;
      sh.group.visible = capsulesVisible;
      if (!capsulesVisible) continue;

      const inStop = d < rS;
      const inWarn = d < rW;

      // ── WARN capsule (cool — cyan/blue) ────────────────────────────────
      // Approach factor: 0 (far) → 1 (at warn boundary) — smooth fade-in
      const approachFactor = d < rW * 2.5 ? Math.max(0, 1 - (d - rW) / (rW * 1.5)) : 0;
      let warnOp: number;
      if (inStop)      warnOp = 0.65;
      else if (inWarn) warnOp = 1.0 + 0.25 * Math.abs(Math.sin(t * 3.5));
      else             warnOp = 0.20 + approachFactor * 0.25;

      setCapsule(wh, segPA[s], segPB[s], rW, inWarn ? C_WARN_HIT : C_WARN_IDLE, warnOp);

      // ── STOP capsule (hot — orange → red) ──────────────────────────────
      let stopOp: number;
      if (inStop) {
        // Fast urgent pulse
        stopOp = 1.0 + 0.40 * Math.abs(Math.sin(t * 10));
        setCapsule(sh, segPA[s], segPB[s], rS, C_STOP_HIT, stopOp);
      } else if (inWarn) {
        // Ramp orange brighter as person closes in
        const ratio = Math.max(0, 1 - (d - rS) / Math.max(0.001, rW - rS));
        stopOp = 0.40 + ratio * 0.55;
        _tc.lerpColors(C_STOP_IDLE, C_STOP_HIT, ratio);
        setCapsule(sh, segPA[s], segPB[s], rS, _tc, stopOp);
      } else {
        stopOp = 0.15 + approachFactor * 0.15;
        setCapsule(sh, segPA[s], segPB[s], rS, C_STOP_IDLE, stopOp);
      }
    }

    // 6. Human body silhouette
    const breathe = 1.0; // no breathing anim for polygon style — keeps it clean

    humanH.current.forEach((hh, pi) => {
      const person = persons[pi];
      const dists  = allDists[pi] ?? {};

      if (!person || !skeletonVisible) {
        hh.segs.forEach(h => { h.group.visible = false; });
        hh.head.group.visible = false;
        return;
      }

      const kpts   = person.keypoints;
      const lSh    = kpts[11], rSh  = kpts[12];
      const lHip   = kpts[23], rHip = kpts[24];
      const midSh  = lSh && rSh   ? new THREE.Vector3((lSh.x+rSh.x)/2,  (lSh.y+rSh.y)/2,  (lSh.z+rSh.z)/2)  : null;
      const midHip = lHip && rHip ? new THREE.Vector3((lHip.x+rHip.x)/2,(lHip.y+rHip.y)/2,(lHip.z+rHip.z)/2) : null;

      BODY_SEGS.forEach((def, si) => {
        const h = hh.segs[si];
        const getV = (ref: typeof def.fromKpt) => {
          if (ref === "mid_sh")  return midSh?.clone()  ?? null;
          if (ref === "mid_hip") return midHip?.clone() ?? null;
          const k = kpts[ref as number]; return k ? new THREE.Vector3(k.x, k.y, k.z) : null;
        };
        const pa = getV(def.fromKpt), pb = getV(def.toKpt);
        if (!pa || !pb) { h.group.visible = false; return; }

        const maxDist = Math.min(...def.kpts.map(i => dists[i] ?? Infinity));
        let bodyCol: THREE.Color, bodyOp: number;
        if (maxDist < rS) {
          bodyCol = C_HUMAN_STOP; bodyOp = 1.0 + 0.30 * Math.abs(Math.sin(t * 10));
        } else if (maxDist < rW) {
          const ratio = Math.max(0, 1 - (maxDist - rS) / Math.max(0.001, rW - rS));
          _tc.lerpColors(C_HUMAN_WARN, C_HUMAN_STOP, ratio);
          bodyCol = _tc; bodyOp = breathe;
        } else {
          bodyCol = C_HUMAN_SAFE; bodyOp = breathe;
        }
        setCapsule(h, pa, pb, def.r, bodyCol, bodyOp);
      });

      const nose = kpts[0];
      if (nose) {
        const noseDist = dists[0] ?? Infinity;
        const hCol = noseDist < rS ? C_HUMAN_STOP : noseDist < rW ? C_HUMAN_WARN : C_HUMAN_SAFE;
        setSphere(hh.head, new THREE.Vector3(nose.x, nose.y + 0.11, nose.z), 0.12, hCol, breathe);
      } else { hh.head.group.visible = false; }
    });
  });

  return null;
}
