"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, useCursor, useTexture } from "@react-three/drei";
import { MutableRefObject, Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export type EnvelopePhase = "sealed" | "opening" | "open";

type Envelope3DProps = {
  phase: EnvelopePhase;
  onOpen: () => void;
  onReady?: () => void;
};

type Point2 = [number, number];

function triangleGeometry(points: [Point2, Point2, Point2], uvs: [Point2, Point2, Point2]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points.flatMap(([x, y]) => [x, y, 0]), 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(uvs.flatMap(([u, v]) => [u, v]), 2),
  );
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  return geometry;
}

function bottomFoldGeometry(halfW: number, halfH: number, sideY: number) {
  const geometry = new THREE.BufferGeometry();
  const sideV = (sideY + halfH) / (halfH * 2);
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([
      -halfW, -halfH, 0,
      halfW, -halfH, 0,
      halfW, sideY, 0,
      0, 0, 0,
      -halfW, sideY, 0,
    ], 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([
      0, 0,
      1, 0,
      1, sideV,
      0.5, 0.5,
      0, sideV,
    ], 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4]);
  geometry.computeVertexNormals();
  return geometry;
}

function topFoldGeometry(
  halfW: number,
  halfH: number,
  sideY: number,
  tipY: number,
  tipV: number,
) {
  const geometry = new THREE.BufferGeometry();
  const sideV = 1 + sideY / (halfH * 2);
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([
      -halfW, 0, 0,
      halfW, 0, 0,
      halfW, sideY, 0,
      0, tipY, 0,
      -halfW, sideY, 0,
    ], 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([
      0, 1,
      1, 1,
      1, sideV,
      0.5, tipV,
      0, sideV,
    ], 2),
  );
  // Reverse the fan winding so the photo-mapped face points toward the camera.
  geometry.setIndex([0, 2, 1, 0, 3, 2, 0, 4, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function makePaperBump() {
  const size = 160;
  const data = new Uint8Array(size * size);
  let seed = 18;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fiber = Math.sin(y * 0.76 + random() * 2.4) * 13;
      data[y * size + x] = Math.max(0, Math.min(255, 128 + fiber + (random() - 0.5) * 34));
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(7, 12);
  texture.needsUpdate = true;
  return texture;
}

function smoothRange(value: number, start: number, end: number) {
  return THREE.MathUtils.smoothstep(value, start, end);
}


function CallaMark({ z = 0.08 }: { z?: number }) {
  const gold = "#b99757";
  return (
    <group position={[0, 0, z]}>
      {/* A single calla lily: curved stem, wrapped spathe and central spadix. */}
      <Line points={[[0.015, -0.25, 0], [0.005, -0.14, 0], [-0.005, -0.02, 0], [0.005, 0.08, 0]]} color={gold} lineWidth={1.55} />
      <Line
        points={[
          [0.005, 0.075, 0], [-0.105, 0.13, 0], [-0.145, 0.225, 0], [-0.08, 0.31, 0],
          [0.035, 0.335, 0], [0.15, 0.275, 0], [0.135, 0.16, 0], [0.055, 0.085, 0], [0.005, 0.075, 0],
        ]}
        color={gold}
        lineWidth={1.55}
      />
      <Line points={[[0.005, 0.075, 0], [0.055, 0.15, 0], [0.07, 0.255, 0]]} color={gold} lineWidth={1.25} />
      <Line points={[[0.038, 0.11, 0], [0.05, 0.235, 0]]} color="#c6a667" lineWidth={2.15} />
      <Line
        points={[[0.005, -0.1, 0], [-0.075, -0.07, 0], [-0.145, -0.105, 0], [-0.075, -0.17, 0], [0.005, -0.1, 0]]}
        color={gold}
        lineWidth={1.25}
      />
    </group>
  );
}

// Key light sits top-left ([-4.2, 6.5, 9]) so a real shadow MUST fall
// bottom-right (+x, -y). This texture bakes that direction: a tight dark
// contact core under the wax + a soft lobe offset toward bottom-right.
function makeSealShadowTexture() {
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, S, S);
    // Soft directional lobe (bottom-right of the seal, canvas +x/+y).
    const lobe = context.createRadialGradient(S * 0.58, S * 0.6, 8, S * 0.58, S * 0.6, S * 0.42);
    lobe.addColorStop(0, "rgba(30,17,8,0.34)");
    lobe.addColorStop(0.5, "rgba(30,17,8,0.16)");
    lobe.addColorStop(1, "rgba(30,17,8,0)");
    context.fillStyle = lobe;
    context.fillRect(0, 0, S, S);
    // Tight contact core directly under the wax edge.
    const core = context.createRadialGradient(S * 0.5, S * 0.5, 10, S * 0.5, S * 0.5, S * 0.34);
    core.addColorStop(0, "rgba(26,14,6,0.55)");
    core.addColorStop(0.55, "rgba(26,14,6,0.32)");
    core.addColorStop(0.85, "rgba(26,14,6,0.10)");
    core.addColorStop(1, "rgba(26,14,6,0)");
    context.fillStyle = core;
    context.fillRect(0, 0, S, S);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Warm breath of light living inside the envelope mouth: hot white core
// melting into gold, fully transparent at the rim.
function makeMouthGlowTexture() {
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, S, S);
    const gradient = context.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.35, "rgba(255,240,205,0.55)");
    gradient.addColorStop(0.65, "rgba(255,210,140,0.22)");
    gradient.addColorStop(1, "rgba(255,200,130,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, S, S);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Linear AO gradient used along paper folds: dark on the crease line,
// fading to transparent on both sides. Drawn once, reused everywhere.
function makeCreaseAOTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const g = context.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, "rgba(22,28,24,0)");
    g.addColorStop(0.32, "rgba(22,28,24,0.28)");
    g.addColorStop(0.5, "rgba(22,28,24,0.42)");
    g.addColorStop(0.68, "rgba(22,28,24,0.28)");
    g.addColorStop(1, "rgba(22,28,24,0)");
    context.fillStyle = g;
    context.fillRect(0, 0, 4, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

let cachedCreaseAO: THREE.CanvasTexture | null = null;
function getCreaseAO() {
  if (typeof document === "undefined") return null;
  if (!cachedCreaseAO) cachedCreaseAO = makeCreaseAOTexture();
  return cachedCreaseAO;
}

// One soft AO strip along a straight crease segment (p1 -> p2).
// The gradient runs ACROSS the fold, darkest exactly on the crease line,
// which is how real paper occlusion behaves.
function CreaseSegment({
  from,
  to,
  z,
  aoWidth = 0.16,
  opacity = 0.55,
}: {
  from: [number, number];
  to: [number, number];
  z: number;
  aoWidth?: number;
  opacity?: number;
}) {
  const texture = getCreaseAO();
    const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const midX = (from[0] + to[0]) / 2;
  const midY = (from[1] + to[1]) / 2;
  if (!texture) return null;
  return (
    <mesh position={[midX, midY, z]} rotation={[0, 0, angle - Math.PI / 2]} renderOrder={2}>
      <planeGeometry args={[aoWidth, length]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function WaxSeal({
  progress,
  onOpen,
}: {
  progress: MutableRefObject<number>;
  onOpen: () => void;
}) {
  const sealRef = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const shadowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const lowerWaxRef = useRef<THREE.Mesh>(null);
  const upperWaxRef = useRef<THREE.Mesh>(null);
  const sealFaceRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const radius = 0.43;
  const baseZ = 0.24;
  const loadedSeal = useTexture("/wedding-invitation/gold-heart-wax-seal.webp");
  const sealTexture = useMemo(() => {
    const texture = loadedSeal.clone();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  }, [loadedSeal]);
  const shadowTexture = useMemo(() => makeSealShadowTexture(), []);

  useEffect(() => () => {
    sealTexture.dispose();
    shadowTexture.dispose();
  }, [sealTexture, shadowTexture]);

  useFrame(() => {
    if (!sealRef.current) return;
    const p = progress.current;
    const pressCycle = Math.min(p / 0.19, 1);
    const press = 1 - Math.sin(pressCycle * Math.PI) * 0.055;
    // No hover scaling and no idle breathing: the HTML seal button owns all
    // hover feedback (drop-shadow), so the 3D wax never jumps between two
    // competing hover zones. `hovered` now only drives the cursor.
    void hovered;
    const tactileLift = Math.sin(smoothRange(p, 0.04, 0.32) * Math.PI) * 0.11;
    const shadowLift = smoothRange(p, 0.025, 0.26);
    sealRef.current.scale.setScalar(press);
    sealRef.current.position.z = baseZ + tactileLift;
    sealRef.current.rotation.z = -Math.sin(smoothRange(p, 0.08, 0.32) * Math.PI) * 0.025;

    // Physically correct: the higher the seal lifts, the larger, softer and
    // further bottom-right the shadow drifts (away from the top-left key).
    if (shadowRef.current && shadowMaterialRef.current) {
      shadowRef.current.visible = shadowLift < 0.99;
      const spread = 1 + shadowLift * 0.45 + tactileLift * 1.4;
      shadowRef.current.scale.set(spread * 1.06, spread, 1);
      shadowRef.current.position.x = 0.05 + shadowLift * 0.16 + tactileLift * 0.35;
      shadowRef.current.position.y = -0.055 - shadowLift * 0.17 - tactileLift * 0.38;
      shadowMaterialRef.current.opacity = 0.45 * (1 - shadowLift * 0.92);
    }
    // Keep real shadow-map casting for the whole life of the seal so the
    // flap motion never pops; the baked contact texture handles the soft look.
    if (lowerWaxRef.current) lowerWaxRef.current.castShadow = true;
    if (upperWaxRef.current) upperWaxRef.current.castShadow = true;
    if (sealFaceRef.current) sealFaceRef.current.castShadow = false;
  });

  return (
    <group ref={sealRef} position={[0, 0, baseZ]}>
      {/* Directional contact shadow: tight core + soft lobe toward bottom-right. */}
      <mesh ref={shadowRef} position={[0.05, -0.055, -0.074]} renderOrder={1}>
        <planeGeometry args={[1.3, 1.3]} />
        <meshBasicMaterial
          ref={shadowMaterialRef}
          map={shadowTexture}
          transparent
          opacity={0.45}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Stacked wax volumes create a raised edge and a convincing embossed profile. */}
      <mesh ref={lowerWaxRef} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.012]} castShadow receiveShadow>
        <cylinderGeometry args={[radius * 1.01, radius * 1.09, 0.12, 64]} />
        <meshPhysicalMaterial
          color="#85512f"
          roughness={0.48}
          metalness={0.14}
          clearcoat={0.2}
          clearcoatRoughness={0.58}
          envMapIntensity={0.6}
        />
      </mesh>
      <mesh
        ref={upperWaxRef}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, 0.035]}
        castShadow
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onPointerDown={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        <cylinderGeometry args={[radius * 0.98, radius * 1.025, 0.075, 64]} />
        <meshPhysicalMaterial
          color="#b77b48"
          roughness={0.34}
          metalness={0.22}
          clearcoat={0.38}
          clearcoatRoughness={0.38}
          envMapIntensity={0.6}
        />
      </mesh>
      <mesh ref={sealFaceRef} position={[0, 0, 0.092]} castShadow renderOrder={3}>
        <planeGeometry args={[1.06, 1.06]} />
        <meshPhysicalMaterial
          map={sealTexture}
          transparent
          alphaTest={0.025}
          roughness={0.4}
          metalness={0.1}
          clearcoat={0.22}
          clearcoatRoughness={0.5}
          envMapIntensity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function makeInstructionTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 210;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.direction = "rtl";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "600 62px Vazirmatn, Tahoma, Arial, sans-serif";
    context.shadowColor = "rgba(7, 19, 15, 0.5)";
    context.shadowBlur = 10;
    context.shadowOffsetY = 3;
    context.fillStyle = "#f7eedb";
    context.fillText("برای باز شدن پاکت کلیک کنید", 600, 104);

    context.shadowColor = "transparent";
    const lineGradientLeft = context.createLinearGradient(64, 0, 292, 0);
    lineGradientLeft.addColorStop(0, "rgba(215,188,134,0)");
    lineGradientLeft.addColorStop(1, "rgba(215,188,134,0.9)");
    context.fillStyle = lineGradientLeft;
    context.fillRect(64, 102, 228, 2);
    const lineGradientRight = context.createLinearGradient(908, 0, 1136, 0);
    lineGradientRight.addColorStop(0, "rgba(215,188,134,0.9)");
    lineGradientRight.addColorStop(1, "rgba(215,188,134,0)");
    context.fillStyle = lineGradientRight;
    context.fillRect(908, 102, 228, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function OpenInstruction({
  progress,
  width,
  halfH,
  z,
  onOpen,
}: {
  progress: MutableRefObject<number>;
  width: number;
  halfH: number;
  z: number;
  onOpen: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const plateRef = useRef<THREE.Mesh>(null);
  const plateMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const plateTex = useMemo(() => makeSealShadowTexture(), []);
  const labelWidth = width * 0.6;

  useEffect(() => {
    let active = true;
    let createdTexture: THREE.CanvasTexture | null = null;
    const loadVazir = async () => {
      try {
        await document.fonts.load("600 62px Vazirmatn", "برای باز شدن پاکت کلیک کنید");
      } finally {
        if (active) {
          createdTexture = makeInstructionTexture();
          setTexture(createdTexture);
        }
      }
    };
    void loadVazir();
    return () => {
      active = false;
      createdTexture?.dispose();
    };
  }, []);

  useEffect(() => () => {
    plateTex.dispose();
  }, [plateTex]);

  useFrame(() => {
    if (!meshRef.current || !materialRef.current) return;
    if (!texture) {
      meshRef.current.visible = false;
      if (plateRef.current) plateRef.current.visible = false;
      return;
    }
    const fade = smoothRange(progress.current, 0.025, 0.22);
    meshRef.current.visible = fade < 0.995;
    meshRef.current.position.z = fade * 0.025;
    materialRef.current.opacity = 1 - fade;
    // Soft dark bed under the label so white Persian text reads on the
    // bright photo; melts away together with the text.
    if (plateRef.current) plateRef.current.visible = fade < 0.995;
    if (plateMatRef.current) plateMatRef.current.opacity = 0.3 * (1 - fade);
  });

  const labelHeight = labelWidth * (210 / 1200);
  return (
    <group position={[0, -halfH * 0.8, z]}>
      {/* Soft dark bed so the white label reads on the bright photo. */}
      <mesh ref={plateRef} position={[0, 0, -0.006]} renderOrder={4}>
        <planeGeometry args={[labelWidth * 1.15, labelHeight * 2.3]} />
        <meshBasicMaterial
          ref={plateMatRef}
          map={plateTex}
          transparent
          opacity={0.3}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh
        ref={meshRef}
        renderOrder={5}
        onPointerDown={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        <planeGeometry args={[labelWidth, labelHeight]} />
        <meshBasicMaterial
          ref={materialRef}
          map={texture ?? undefined}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function EnvelopeModel({ phase, onOpen, onReady }: Envelope3DProps) {
  const { viewport } = useThree();
  // Generous bleed so every paper edge sits safely off-screen on any aspect
  // ratio or rounding — the envelope always reads flush to the viewport.
  const width = viewport.width * 1.06;
  const height = viewport.height * 1.06;
  const halfW = width / 2;
  const halfH = height / 2;
  const centerY = 0;
  // The upper point extends deep over the lower pocket for an unmistakable overlap.
  const flapOverlap = height * 0.18;
  // Both fold creases begin midway along the side walls, away from the 90° corners.
  const bottomFoldSideY = -halfH * 0.52;
  const topFoldSideY = -halfH * 0.48;
  const topFoldTipY = -halfH - flapOverlap;
  // Deliberate Z separation creates a true pocket: sides recessed, bottom raised,
  // and the top flap floats clearly above the pocket so its volume reads
  // even before opening.
  const leftSideZ = 0.025;
  const rightSideZ = 0.035;
  const bottomFoldZ = 0.165;
  const flapClosedZ = 0.56;

  const loadedPhoto = useTexture("/wedding-invitation/calla-hand-envelope.webp");
  const photo = useMemo(() => {
    const texture = loadedPhoto.clone();
    const canvasAspect = width / height;
    const imageAspect = 682 / 1024;
    texture.colorSpace = THREE.SRGBColorSpace;
    // High anisotropy keeps the photo crisp at grazing angles so paper
    // reads like print, not a blurry projection, on every screen.
    texture.anisotropy = 8;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    if (canvasAspect < imageAspect) {
      const visibleX = canvasAspect / imageAspect;
      texture.repeat.set(visibleX, 1);
      texture.offset.set((1 - visibleX) / 2, 0);
    } else {
      const visibleY = imageAspect / canvasAspect;
      texture.repeat.set(1, visibleY);
      texture.offset.set(0, (1 - visibleY) / 2);
    }
    texture.needsUpdate = true;
    return texture;
  }, [loadedPhoto, width, height]);

  const bump = useMemo(() => makePaperBump(), []);
  // Soft directional blob the floating flap throws onto the pocket.
  const flapShadeTex = useMemo(() => makeSealShadowTexture(), []);
  // Light living inside the mouth: revealed only as the flap lifts.
  const mouthTex = useMemo(() => makeMouthGlowTexture(), []);
  const mouthMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const mouthLightRef = useRef<THREE.PointLight>(null);
  // One shared material so both V-edge bands fade in perfect sync.
  const flapShadeMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      map: flapShadeTex,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      toneMapped: false,
    }),
    [flapShadeTex],
  );
  useEffect(() => () => {
    photo.dispose();
    bump.dispose();
    flapShadeTex.dispose();
    flapShadeMat.dispose();
    mouthTex.dispose();
  }, [photo, bump, flapShadeTex, flapShadeMat, mouthTex]);

  const leftGeometry = useMemo(
    () => triangleGeometry(
      [[-halfW, -halfH], [0, centerY], [-halfW, halfH]],
      [[0, 0], [0.5, 0.5], [0, 1]],
    ),
    [halfW, halfH],
  );
  const rightGeometry = useMemo(
    () => triangleGeometry(
      [[0, centerY], [halfW, -halfH], [halfW, halfH]],
      [[0.5, 0.5], [1, 0], [1, 1]],
    ),
    [halfW, halfH],
  );
  const bottomGeometry = useMemo(
    () => bottomFoldGeometry(halfW, halfH, bottomFoldSideY),
    [halfW, halfH, bottomFoldSideY],
  );
  const flapGeometry = useMemo(
    () => topFoldGeometry(
      halfW,
      halfH,
      topFoldSideY,
      topFoldTipY,
      0.5 - flapOverlap / height,
    ),
    [halfW, halfH, topFoldSideY, topFoldTipY, flapOverlap, height],
  );

  const flapRef = useRef<THREE.Group>(null);
  const flapFaceRef = useRef<THREE.Mesh>(null);
  const flapShadeRef = useRef<THREE.Group>(null);
  const progress = useRef(phase === "sealed" ? 0 : 1);
  const readyFired = useRef(false);
  const frameCount = useRef(0);

  useFrame((_, delta) => {
    // Textures are resolved by Suspense before this mounts, so after 3
    // rendered frames the first real envelope pixels are on screen.
    if (onReady && !readyFired.current) {
      frameCount.current += 1;
      if (frameCount.current >= 3) {
        readyFired.current = true;
        onReady();
      }
    }
    const target = phase === "sealed" ? 0 : 1;
    progress.current = THREE.MathUtils.damp(progress.current, target, 1.35, delta);
    const p = progress.current;

    if (flapRef.current) {
      const flapAmount = smoothRange(p, 0.18, 0.88);
      const liftArc = Math.sin(flapAmount * Math.PI) * 0.34;
      flapRef.current.rotation.x = -Math.PI * flapAmount;
      flapRef.current.position.z = THREE.MathUtils.lerp(flapClosedZ, 0.08, flapAmount) + liftArc;
    }
    // The flap keeps casting the whole time: with tight shadow camera bounds
    // and tuned bias there is no stretch or flicker, and the pocket receives
    // a correct moving shadow while opening — like a real envelope.
    if (flapFaceRef.current) flapFaceRef.current.castShadow = true;
    // Baked contact shadow under the floating flap: strongest while sealed,
    // melting away as the flap lifts so the pocket is clean when open.
    const flapShade = 1 - smoothRange(p, 0.1, 0.42);
    if (flapShadeRef.current) flapShadeRef.current.visible = flapShade > 0.02;
    flapShadeMat.opacity = 0.3 * flapShade;
    // Mouth light: stone dark until the flap truly lifts, breathes in from
    // under it to wash the pocket + flap underside, rests before handover.
    const glow = smoothRange(p, 0.34, 0.55) * (1 - smoothRange(p, 0.62, 0.92));
    if (mouthMatRef.current) mouthMatRef.current.opacity = 0.95 * glow;
    if (mouthLightRef.current) mouthLightRef.current.intensity = 26 * glow;
    // Envelope stays perfectly still: no mouse parallax, no float, no camera
    // drift. Only the flap itself animates.
  });

  // Single continuous photo texture: NO color tints. All folds share the same
  // neutral base so the image sits seamlessly across edges; depth comes only
  // from real lights + narrow AO in the valleys. Roughness alone varies
  // slightly per fold so each paper plane catches light a touch differently.
  const commonMaterial = {
    map: photo,
    bumpMap: bump,
    bumpScale: 0.012,
    roughness: 0.78,
    metalness: 0,
    // Dense photographic grade: pulls the print back from the wash so ink
    // and petal color read, while staying warm and creamy.
    color: "#e9e2d2",
    envMapIntensity: 0,
  };

  return (
    <group>
      {/* Physical body thickness so the envelope reads as a solid volume, not a flat card. */}
      <mesh position={[0, 0, -0.16]} castShadow receiveShadow>
        <boxGeometry args={[width, height, 0.24]} />
        <meshStandardMaterial color="#9a9486" roughness={0.92} metalness={0}  />
      </mesh>
      {/* Ground catcher far behind: catches the body's soft drop shadow so the
          envelope floats in space instead of blending into the background. */}
      <mesh position={[0.35, -0.45, -0.6]} receiveShadow>
        <planeGeometry args={[width * 1.6, height * 1.6]} />
        <shadowMaterial transparent opacity={0.18} color="#1a241f" />
      </mesh>
      {/* Thin ivory edge lining to catch rim light on the sides. */}
      <mesh position={[0, 0, -0.035]} receiveShadow>
        <boxGeometry args={[width * 0.998, height * 0.998, 0.03]} />
        <meshStandardMaterial color="#efe9dc" roughness={0.85} metalness={0}  />
      </mesh>
      {/* The envelope interior is ivory paper, revealed only after the photo flap lifts. */}
      <mesh position={[0, 0, -0.02]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshPhysicalMaterial
          color="#fffdf8"
          emissive="#ece8df"
          emissiveIntensity={0.16}
          roughness={0.93}
          metalness={0}
          clearcoat={0.04}
          bumpMap={bump}
          bumpScale={0.018}
          
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Light living INSIDE the envelope mouth: it blooms from beneath the
          lifting flap and kisses the pocket + flap underside — the flap's
          outer face never gets washed. */}
      <mesh position={[0, halfH * 0.42, 0.3]} renderOrder={6}>
        <planeGeometry args={[width * 0.85, 1.5]} />
        <meshBasicMaterial
          ref={mouthMatRef}
          map={mouthTex}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <pointLight ref={mouthLightRef} position={[0, halfH * 0.42, 1.1]} intensity={0} distance={9} decay={2} color="#ffe9c0" />

      <mesh geometry={leftGeometry} position={[0, 0, leftSideZ]} receiveShadow>
        <meshStandardMaterial {...commonMaterial} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={rightGeometry} position={[0, 0, rightSideZ]} receiveShadow>
        <meshStandardMaterial {...commonMaterial} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>

      {/* Pocket-lip thickness in warm shadowed paper — same family as the face,
          just a step darker, never green-gray. */}
      <mesh
        geometry={bottomGeometry}
        position={[0, -0.014, bottomFoldZ - 0.052]}
        scale={[1.006, 1.006, 1]}
      >
        <meshStandardMaterial color="#b3ac9c" roughness={0.94} side={THREE.DoubleSide}  />
      </mesh>
      <mesh geometry={bottomGeometry} position={[0, 0, bottomFoldZ]} castShadow receiveShadow>
        <meshPhysicalMaterial
          {...commonMaterial}
          roughness={0.84}
          clearcoat={0.08}
          clearcoatRoughness={0.82}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Contact shadow hugging the flap's lower V edge on the pocket —
          this is what sells the flap's lift while sealed. */}
      <group ref={flapShadeRef} renderOrder={2}>
        {(() => {
          const ey = halfH + topFoldSideY;
          const ty = -flapOverlap;
          const armLen = Math.hypot(halfW, ty - ey);
          const angL = Math.atan2(ty - ey, halfW);
          const angR = Math.atan2(ey - ty, halfW);
          const mx = halfW / 2;
          const my = (ey + ty) / 2 - 0.24;
          const z = bottomFoldZ + 0.012;
          const arms = [
            { x: -mx + 0.06, rot: angL },
            { x: mx + 0.06, rot: angR },
          ];
          return arms.map((a, i) => (
            <mesh key={i} position={[a.x, my, z]} rotation={[0, 0, a.rot]} material={flapShadeMat}>
              <planeGeometry args={[armLen * 0.96, 0.55]} />
            </mesh>
          ));
        })()}</group>
      {/* Real fold logic: soft AO sits in the valley, crisp line on the ridge,
          hairline highlight just above where light catches the paper lip. */}
      <CreaseSegment from={[-halfW, bottomFoldSideY]} to={[0, centerY]} z={bottomFoldZ + 0.006} aoWidth={0.07} opacity={0.3} />
      <CreaseSegment from={[0, centerY]} to={[halfW, bottomFoldSideY]} z={bottomFoldZ + 0.006} aoWidth={0.07} opacity={0.3} />
      <Line
        points={[[-halfW, bottomFoldSideY, bottomFoldZ + 0.012], [0, centerY, bottomFoldZ + 0.012], [halfW, bottomFoldSideY, bottomFoldZ + 0.012]]}
        color="#2c332f"
        transparent
        opacity={0.3}
        lineWidth={1}
      />
      <Line
        points={[
          [-halfW, bottomFoldSideY + 0.016, bottomFoldZ + 0.016],
          [0, centerY + 0.016, bottomFoldZ + 0.016],
          [halfW, bottomFoldSideY + 0.016, bottomFoldZ + 0.016],
        ]}
        color="#fffdf7"
        transparent
        opacity={0.35}
        lineWidth={0.7}
      />

      <OpenInstruction
        progress={progress}
        width={width}
        halfH={halfH}
        z={bottomFoldZ + 0.035}
        onOpen={onOpen}
      />

      <group ref={flapRef} position={[0, halfH, flapClosedZ]}>
        {/* Flap thickness, same warm paper family as the pocket lip. */}
        <mesh
          geometry={flapGeometry}
          position={[0, -0.014, -0.055]}
          scale={[1.008, 1.008, 1]}
        >
          <meshStandardMaterial color="#bab3a3" roughness={0.95} side={THREE.DoubleSide}  />
        </mesh>
        <mesh ref={flapFaceRef} geometry={flapGeometry} castShadow receiveShadow>
          <meshPhysicalMaterial
            {...commonMaterial}
            bumpScale={0.022}
            roughness={0.58}
            clearcoat={0.15}
            clearcoatRoughness={0.6}
            side={THREE.FrontSide}
          />
        </mesh>
        <mesh geometry={flapGeometry}>
          <meshStandardMaterial
            color="#faf7f0"
            emissive="#e7e2d8"
            emissiveIntensity={0.1}
            roughness={0.92}
            bumpMap={bump}
            bumpScale={0.022}
            
            side={THREE.BackSide}
          />
        </mesh>
        {/* Same physical logic on the flap, pushed a touch deeper so its raised
            rim reads against the pocket: AO in the valley, edge + highlight. */}
        <CreaseSegment from={[-halfW, topFoldSideY]} to={[0, topFoldTipY]} z={0.006} aoWidth={0.07} opacity={0.32} />
        <CreaseSegment from={[0, topFoldTipY]} to={[halfW, topFoldSideY]} z={0.006} aoWidth={0.07} opacity={0.32} />
        <Line
          points={[
            [-halfW, topFoldSideY, 0.012],
            [0, topFoldTipY, 0.012],
            [halfW, topFoldSideY, 0.012],
          ]}
          color="#2c332f"
          transparent
          opacity={0.38}
          lineWidth={1}
        />
        <Line
          points={[
            [-halfW, topFoldSideY + 0.016, 0.016],
            [0, topFoldTipY + 0.016, 0.016],
            [halfW, topFoldSideY + 0.016, 0.016],
          ]}
          color="#fffdf7"
          transparent
          opacity={0.35}
          lineWidth={0.7}
        />
        {/* The intact seal follows the extended lowest point of the five-sided flap. */}
        <group position={[0, topFoldTipY, 0.02]}>
          <WaxSeal progress={progress} onOpen={onOpen} />
        </group>
      </group>
    </group>
  );
}

export default function Envelope3D({ phase, onOpen, onReady }: Envelope3DProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Kick off texture fetches immediately so Suspense resolves faster.
    try {
      useTexture.preload("/wedding-invitation/calla-hand-envelope.webp");
      useTexture.preload("/wedding-invitation/gold-heart-wax-seal.webp");
    } catch {
      /* preload is best-effort */
    }
  }, []);

  const handleReady = () => {
    setReady(true);
    onReady?.();
  };

  return (
    <div className={`envelope-canvas${ready ? " is-ready" : ""}`} aria-hidden="true">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 10], fov: 35, near: 0.1, far: 50 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl, scene }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          // No image-based ambient: it veiled the print in white haze.
          // Paper is lit purely by placed lights; wax keeps its depth via
          // clearcoat + key/rim highlights. scene.environment stays empty.
          void scene;
        }}
      >
        <color attach="background" args={["#e9e3d8"]} />
        <ambientLight intensity={0.22} />
        <hemisphereLight args={["#fffaf0", "#443f34", 0.2]} />
        {/* Gentle frontal bounce: lifts shadow floors (seal/pocket) from pure
            black to soft brown without touching the print's richness. */}
        <directionalLight position={[0.5, -1, 10]} intensity={0.32} color="#fff2df" />
        <directionalLight
          castShadow
          position={[-4.2, 6.5, 9]}
          intensity={0.95}
          color="#ffedd6"
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-5.5}
          shadow-camera-right={5.5}
          shadow-camera-top={6.5}
          shadow-camera-bottom={-6.5}
          shadow-camera-near={2}
          shadow-camera-far={24}
          shadow-bias={-0.00015}
          shadow-normalBias={0.02}
        />
        <pointLight position={[4, -2.5, 5]} intensity={1.5} distance={16} decay={2} color="#f3dfbb" />
        {/* Rim + fill lights carve the edges out of the background for a true 3D read. */}
        <directionalLight position={[6, 2.5, -3]} intensity={0.65} color="#ffe9c4" />
        <directionalLight position={[-6, -1.5, 2]} intensity={0.28} color="#bcd2ff" />
        <spotLight
          position={[0, 7, 7]}
          angle={0.5}
          penumbra={0.8}
          intensity={18}
          distance={30}
          decay={2}
          color="#fff4de"
        />
        <Suspense fallback={null}>
          <EnvelopeModel phase={phase} onOpen={onOpen} onReady={handleReady} />
        </Suspense>
      </Canvas>
      <div className="cinematic-vignette" />
    </div>
  );
}
