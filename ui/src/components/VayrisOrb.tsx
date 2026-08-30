import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, Float } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

type OrbState = 'IDLE' | 'LISTENING' | 'THINKING' | 'EXECUTING' | 'WAITING' | 'VERIFYING' | 'COMPLETED' | 'SPEAKING' | 'ERROR';

/* Debug probe — logs once to confirm WebGL is running */
const WebGLProbe: React.FC = () => {
  const { gl, camera } = useThree();
  useEffect(() => {
    console.log('[VAYRIS-3D] WebGL initialized');
    console.log('[VAYRIS-3D] Camera position:', camera.position.toArray());
  }, [gl, camera]);
  return null;
};

/* ─── Core 3D Group ─── */
const CoreGroup: React.FC<{ state: OrbState; isIdle: boolean }> = ({ state, isIdle }) => {
  const groupRef = useRef<THREE.Group>(null);
  const baseScale = isIdle ? 1.0 : 0.32;
  const targetPos = useMemo(
    () => (isIdle ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(0, 2.8, -2)),
    [isIdle]
  );

  useFrame((ctx, delta) => {
    if (!groupRef.current) return;
    const t = ctx.clock.elapsedTime;
    // Organic multi-frequency breathing
    const breath = isIdle ? Math.sin(t * 1.2) * 0.03 + Math.sin(t * 0.7) * 0.015 : 0;
    const s = THREE.MathUtils.lerp(groupRef.current.scale.x, baseScale + breath, delta * 2);
    groupRef.current.scale.setScalar(s);
    // Smooth position lerp
    groupRef.current.position.lerp(targetPos, delta * 2);
    // Pointer parallax
    const rx = (ctx.pointer.y * Math.PI) / 14;
    const ry = (ctx.pointer.x * Math.PI) / 14;
    groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, rx, delta * 1.5);
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, ry, delta * 1.5);
  });

  /* State → color palette. IDLE is cyan/blue. */
  const C = useMemo(() => {
    switch (state) {
      case 'LISTENING':  return { shell: '#0ea5e9', p1: '#22d3ee', p2: '#6366f1', p3: '#a855f7', p4: '#f59e0b', glow: 2.5, spd: 2.2 };
      case 'THINKING':   return { shell: '#7c3aed', p1: '#a855f7', p2: '#c084fc', p3: '#e879f9', p4: '#f59e0b', glow: 3.0, spd: 3.0 };
      case 'EXECUTING':  return { shell: '#0891b2', p1: '#22d3ee', p2: '#38bdf8', p3: '#818cf8', p4: '#fbbf24', glow: 3.5, spd: 2.8 };
      case 'WAITING':    return { shell: '#d97706', p1: '#fbbf24', p2: '#f97316', p3: '#fb7185', p4: '#818cf8', glow: 2.0, spd: 1.5 };
      case 'VERIFYING':  return { shell: '#059669', p1: '#34d399', p2: '#14b8a6', p3: '#22d3ee', p4: '#818cf8', glow: 2.2, spd: 2.0 };
      case 'SPEAKING':   return { shell: '#4f46e5', p1: '#818cf8', p2: '#a855f7', p3: '#c084fc', p4: '#f472b6', glow: 2.8, spd: 2.5 };
      case 'COMPLETED':  return { shell: '#059669', p1: '#34d399', p2: '#6ee7b7', p3: '#22d3ee', p4: '#fbbf24', glow: 2.0, spd: 1.0 };
      case 'ERROR':      return { shell: '#9f1239', p1: '#f43f5e', p2: '#fb7185', p3: '#fda4af', p4: '#f97316', glow: 2.5, spd: 1.5 };
      case 'IDLE':
      default:           return { shell: '#1e40af', p1: '#22d3ee', p2: '#818cf8', p3: '#e879f9', p4: '#f59e0b', glow: 1.8, spd: 1.5 };
    }
  }, [state]);

  return (
    <group ref={groupRef}>
      <Float speed={isIdle ? 1.0 : 2.0} rotationIntensity={0.4} floatIntensity={0.3}>
        {/* Glass Shell */}
        <Sphere args={[1.55, 64, 64]}>
          <meshPhysicalMaterial
            color={C.shell}
            transparent
            opacity={0.12}
            roughness={0.05}
            metalness={0.1}
            clearcoat={1}
            clearcoatRoughness={0.03}
            side={THREE.DoubleSide}
            envMapIntensity={0}
          />
        </Sphere>

        {/* Thin luminous rim ring */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.56, 0.008, 16, 128]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.7} />
        </mesh>

        {/* Primary Plasma — Cyan/Blue */}
        <Sphere args={[1.15, 48, 48]} position={[-0.1, 0.15, 0.1]}>
          <MeshDistortMaterial
            color={C.p1} emissive={C.p1} emissiveIntensity={C.glow}
            distort={0.4} speed={C.spd} transparent opacity={0.7}
          />
        </Sphere>

        {/* Secondary Plasma — Violet/Indigo */}
        <Sphere args={[0.95, 48, 48]} position={[0.15, -0.15, -0.15]}>
          <MeshDistortMaterial
            color={C.p2} emissive={C.p2} emissiveIntensity={C.glow * 0.8}
            distort={0.5} speed={C.spd * 0.75} transparent opacity={0.6}
          />
        </Sphere>

        {/* Tertiary Plasma — Magenta/Pink */}
        <Sphere args={[0.75, 48, 48]} position={[0.08, 0.05, -0.3]}>
          <MeshDistortMaterial
            color={C.p3} emissive={C.p3} emissiveIntensity={C.glow * 0.6}
            distort={0.35} speed={C.spd * 0.6} transparent opacity={0.5}
          />
        </Sphere>

        {/* Warm Gold accent */}
        <Sphere args={[0.55, 32, 32]} position={[-0.2, -0.2, 0.2]}>
          <MeshDistortMaterial
            color={C.p4} emissive={C.p4} emissiveIntensity={C.glow * 0.3}
            distort={0.3} speed={C.spd * 0.5} transparent opacity={0.25}
          />
        </Sphere>

        {/* Central Intelligence Source */}
        <Sphere args={[0.22, 32, 32]}>
          <meshBasicMaterial color="#e0f2fe" transparent opacity={0.95} />
        </Sphere>
        <Sphere args={[0.4, 32, 32]}>
          <meshBasicMaterial color={C.p1} transparent opacity={0.12} />
        </Sphere>
      </Float>
    </group>
  );
};

/* ─── Exported VayrisOrb — full-screen 3D world ─── */
export const VayrisOrb: React.FC<{ state: OrbState; isIdle: boolean }> = ({ state, isIdle }) => {
  useEffect(() => {
    console.log('[VAYRIS-3D] VayrisOrb component mounted');
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 0 }}>
      {/* ── ATMOSPHERIC LAYERS ── */}
      <div style={{
        position: 'absolute', top: '5%', left: '0%', width: '100vw', height: '80vh',
        background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(88,28,135,0.35) 0%, transparent 70%)',
        filter: 'blur(80px)', mixBlendMode: 'screen' as const,
        opacity: isIdle ? 0.4 : 0.85, transition: 'opacity 1.5s ease',
      }} />
      <div style={{
        position: 'absolute', top: '15%', left: '10%', width: '80vw', height: '70vh',
        background: 'radial-gradient(ellipse 70% 50% at 55% 45%, rgba(30,64,175,0.3) 0%, transparent 65%)',
        filter: 'blur(100px)', mixBlendMode: 'screen' as const,
        opacity: isIdle ? 0.3 : 0.75, transition: 'opacity 1.5s ease',
      }} />
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: isIdle ? '50vw' : '95vw', height: isIdle ? '50vh' : '95vh',
        background: 'radial-gradient(ellipse at center, rgba(126,34,206,0.25) 0%, transparent 60%)',
        filter: 'blur(120px)', mixBlendMode: 'screen' as const,
        transition: 'all 1.5s ease',
      }} />
      <div style={{
        position: 'absolute', bottom: '10%', left: '15%', width: '60vw', height: '50vh',
        background: 'radial-gradient(ellipse at center, rgba(190,24,93,0.15) 0%, transparent 65%)',
        filter: 'blur(90px)', mixBlendMode: 'screen' as const,
        opacity: isIdle ? 0.2 : 0.55, transition: 'opacity 1.5s ease',
      }} />

      {/* ── 3D WebGL Canvas ── */}
      <Canvas
        camera={{ position: [0, 0, 5.5], fov: 40, near: 0.1, far: 100 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.2} />
        <pointLight position={[3, 3, 3]} intensity={1.5} color="#7dd3fc" />
        <pointLight position={[-3, -2, -3]} intensity={0.8} color="#a855f7" />
        <pointLight position={[0, 2, 1]} intensity={0.6} color="#ffffff" />

        <WebGLProbe />
        <CoreGroup state={state} isIdle={isIdle} />

        <EffectComposer disableNormalPass>
          <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={1.2} mipmapBlur />
        </EffectComposer>
      </Canvas>
    </div>
  );
};
