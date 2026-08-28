"use client";

import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

THREE.Cache.enabled = true;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uImage;
  uniform sampler2D uDepth;
  uniform vec2 uOffset;
  uniform float uStrength;
  varying vec2 vUv;

  void main() {
    float d = texture2D(uDepth, vUv).r;
    vec2 parallax = uOffset * (d - 0.5) * uStrength;
    vec2 uv = clamp(vUv + parallax, 0.001, 0.999);
    gl_FragColor = texture2D(uImage, uv);
  }
`;

function ParallaxPlane({
  imageUrl,
  depthUrl,
}: {
  imageUrl: string;
  depthUrl: string;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const [colorMap, depthMap] = useLoader(THREE.TextureLoader, [imageUrl, depthUrl]);

  colorMap.colorSpace = THREE.SRGBColorSpace;
  depthMap.colorSpace = THREE.NoColorSpace;
  colorMap.minFilter = THREE.LinearFilter;
  depthMap.minFilter = THREE.LinearFilter;

  const uniforms = useMemo(
    () => ({
      uImage: { value: colorMap },
      uDepth: { value: depthMap },
      uOffset: { value: new THREE.Vector2(0, 0) },
      uStrength: { value: 0.05 },
    }),
    [colorMap, depthMap],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    uniforms.uOffset.value.set(Math.sin(t * 0.22) * 0.55, Math.cos(t * 0.18) * 0.35);
  });

  const img = colorMap.image as HTMLImageElement | undefined;
  const aspect = img?.width && img?.height ? img.width / img.height : 16 / 9;
  const planeH = 4.2;
  const planeW = planeH * aspect;

  return (
    <mesh ref={mesh} position={[0, 0.15, 0]}>
      <planeGeometry args={[planeW, planeH]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  );
}

type Props = {
  imageUrl: string;
  depthMapUrl: string;
  className?: string;
};

export function DepthParallax({ imageUrl, depthMapUrl, className = "" }: Props) {
  return (
    <div className={`h-full w-full ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 6.5], fov: 42, near: 0.1, far: 100 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          <ParallaxPlane key={`${imageUrl}|${depthMapUrl}`} imageUrl={imageUrl} depthUrl={depthMapUrl} />
        </Suspense>
      </Canvas>
    </div>
  );
}
