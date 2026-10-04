/* eslint-disable react-hooks/refs, react-hooks/purity, react/no-unknown-property --
 * Three.js sahnesi ve jest işleyicileri imperatif: ref'ler yalnızca useFrame / jest geri çağrılarında
 * okunur-yazılır (render sırasında değil); R3F JSX öğeleri (mesh, light…) DOM özelliği değildir. */
import { useEffect, useRef } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import * as THREE from 'three'
import { defaultPrintTransform } from '../../fold/printDefaults'
import { defaultPrintFinish, type DielineResponse, type PrintFinish, type PrintTransform } from '../../lib/types'
import { FoldScene, type OrbitState } from './FoldScene'
import { Canvas } from './r3f'

export interface FoldViewProps {
  dieline: DielineResponse
  fold: number
  light?: number
  background: string
  printUri?: string | null
  printTransform?: PrintTransform
  printFinish?: PrintFinish
  autoRotate?: boolean
  interactive?: boolean
}

/** 3D katlama: sürükle → döndür, sıkıştır/tekerlek → yakınlaş. Web ve native aynı sahne. */
export const FoldView = ({
  dieline,
  fold,
  light = 1.1,
  background,
  printUri,
  printTransform = defaultPrintTransform(),
  printFinish = defaultPrintFinish(),
  autoRotate = true,
  interactive = true,
}: FoldViewProps) => {
  const orbit = useRef<OrbitState>({ yaw: 0, pitch: 0, zoom: 1, touchedAt: 0 })
  const start = useRef({ yaw: 0, pitch: 0, zoom: 1 })
  const hostRef = useRef<View>(null)

  useEffect(() => {
    orbit.current = { yaw: 0, pitch: 0, zoom: 1, touchedAt: 0 }
  }, [dieline.templateId])

  const begin = () => {
    start.current = { yaw: orbit.current.yaw, pitch: orbit.current.pitch, zoom: orbit.current.zoom }
    orbit.current.touchedAt = Date.now()
  }
  const rotate = (dx: number, dy: number) => {
    orbit.current.yaw = start.current.yaw - dx * 0.008
    orbit.current.pitch = start.current.pitch + dy * 0.006
    orbit.current.touchedAt = Date.now()
  }
  const zoomTo = (scale: number) => {
    orbit.current.zoom = Math.min(2.4, Math.max(0.45, start.current.zoom / scale))
    orbit.current.touchedAt = Date.now()
  }

  // Kamera durumu JS tarafındaki ref'te; jestler JS iş parçacığında çalışır.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(interactive)
    .onStart(begin)
    .onUpdate((e) => rotate(e.translationX, e.translationY))
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .enabled(interactive)
    .onStart(begin)
    .onUpdate((e) => zoomTo(e.scale))

  useEffect(() => {
    if (Platform.OS !== 'web' || !interactive) return
    const el = hostRef.current as unknown as HTMLElement | null
    if (!el?.addEventListener) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      orbit.current.zoom = Math.min(2.4, Math.max(0.45, orbit.current.zoom * Math.exp(e.deltaY * 0.0015)))
      orbit.current.touchedAt = Date.now()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [interactive])

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
      <View ref={hostRef} style={styles.host} collapsable={false}>
        <Canvas
          shadows
          dpr={Platform.OS === 'web' ? [1, 2] : undefined}
          camera={{ fov: 32, near: 1, far: 5000, position: [180, 140, 180] }}
          gl={{ antialias: true }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.outputColorSpace = THREE.SRGBColorSpace
          }}
          style={styles.canvas}
        >
          <color attach="background" args={[background]} />
          <FoldScene
            dieline={dieline}
            fold={fold}
            light={light}
            printUri={printUri}
            printTransform={printTransform}
            printFinish={printFinish}
            orbit={orbit}
            autoRotate={autoRotate}
          />
        </Canvas>
      </View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  host: { flex: 1, overflow: 'hidden' },
  canvas: { flex: 1 },
})
