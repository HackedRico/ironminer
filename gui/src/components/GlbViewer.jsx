import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF, OrbitControls, Environment, Center } from '@react-three/drei'

function Model({ url }) {
  const { scene } = useGLTF(url)
  return (
    <Center>
      <primitive object={scene} />
    </Center>
  )
}

function LoadingBox() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#F97316" wireframe />
    </mesh>
  )
}

export default function GlbViewer({ url, height = 320 }) {
  return (
    <div style={{
      width: '100%',
      height,
      borderRadius: 10,
      overflow: 'hidden',
      background: '#080C11',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <Canvas
        camera={{ position: [5, 3, 5], fov: 50, near: 0.01, far: 1000 }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={1.2} />
        <Environment preset="city" />
        <Suspense fallback={<LoadingBox />}>
          <Model url={url} />
        </Suspense>
        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          autoRotate={false}
          minDistance={0.5}
          maxDistance={100}
        />
      </Canvas>
    </div>
  )
}
