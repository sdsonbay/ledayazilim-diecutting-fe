/* eslint-disable react-hooks/refs, react-hooks/purity, react/no-unknown-property --
 * Kamera ve katlanma durumu ref'lerde; jest geri çağrıları (render dışında) okur-yazar.
 * R3F JSX öğeleri DOM özelliği değildir. */
import { useEffect, useRef, type MutableRefObject } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { useI18n } from '../../i18n/LocaleContext'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'
import { Icon, ScalePressable, Text } from '../ui'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import * as THREE from 'three'
import type { Substrate } from '../../fold/foldMaterials'
import type { FoldStep } from '../../fold/foldModel'
import { defaultPrintTransform } from '../../fold/printDefaults'
import { defaultPrintFinish, type DielineResponse, type PrintFinish, type PrintTransform } from '../../lib/types'
import { BASE_PITCH, BASE_YAW, FoldScene, PITCH_LIMIT, type FoldDriver, type OrbitState } from './FoldScene'
import { Canvas } from './r3f'
import { snapshotCanvas } from './snapshot'

/** Sahnenin o anki görüntüsünü PNG olarak alan fonksiyon (paylaş / indir). */
export type FoldCapture = () => Promise<string | null>

export interface FoldViewProps {
  dieline: DielineResponse
  /** Hedef katlanma: 0 açık (düz), 1 kapalı. */
  fold: number
  /** Hedefe ilerleme hızı (birim/sn): oynatmada yavaş, kaydırmada hızlı. */
  speed?: number
  light?: number
  substrate?: Substrate
  background: string
  printUri?: string | null
  printTransform?: PrintTransform
  printFinish?: PrintFinish
  autoRotate?: boolean
  interactive?: boolean
  onSteps?: (steps: FoldStep[]) => void
  onProgress?: (value: number) => void
  captureRef?: MutableRefObject<FoldCapture | null>
  /** Ön / arka / üst / alt hazır bakış düğmeleri. */
  viewControls?: boolean
}

// Sabit varsayılanlar: her render'da yeni nesne sahneyi (katlama grafiğini) baştan kurdururdu.
const DEFAULT_TRANSFORM = defaultPrintTransform()
const DEFAULT_FINISH = defaultPrintFinish()

type ViewPreset = 'front' | 'back' | 'top' | 'bottom'

/** Hazır bakışlar (mutlak yaw/pitch, radyan). */
const PRESETS: Record<ViewPreset, { yaw: number; pitch: number }> = {
  front: { yaw: 0, pitch: 0.12 },
  back: { yaw: Math.PI, pitch: 0.12 },
  top: { yaw: 0, pitch: PITCH_LIMIT },
  bottom: { yaw: 0, pitch: -PITCH_LIMIT },
}

const PITCH_MIN = -PITCH_LIMIT - BASE_PITCH
const PITCH_MAX = PITCH_LIMIT - BASE_PITCH
const clampPitch = (p: number) => Math.min(PITCH_MAX, Math.max(PITCH_MIN, p))

/** 3D katlama: sürükle → döndür, sıkıştır/tekerlek → yakınlaş. Web ve native aynı sahne. */
export const FoldView = ({
  dieline,
  fold,
  speed = 0.24,
  light = 1.1,
  substrate = 'white',
  background,
  printUri,
  printTransform = DEFAULT_TRANSFORM,
  printFinish = DEFAULT_FINISH,
  autoRotate = true,
  interactive = true,
  onSteps,
  onProgress,
  captureRef,
  viewControls = false,
}: FoldViewProps) => {
  const { colors } = useTheme()
  const { t } = useI18n()
  const orbit = useRef<OrbitState>({ yaw: 0, pitch: 0, zoom: 1, touchedAt: 0 })
  // Düz dieline halinden başlar; açılışta hedefe doğru adım adım katlanır.
  const driver = useRef<FoldDriver>({ target: fold, speed, value: 0 })
  const start = useRef({ yaw: 0, pitch: 0, zoom: 1 })
  const hostRef = useRef<View>(null)

  driver.current.target = fold
  driver.current.speed = speed

  useEffect(() => {
    orbit.current = { yaw: 0, pitch: 0, zoom: 1, touchedAt: 0 }
  }, [dieline.templateId])

  const begin = () => {
    start.current = { yaw: orbit.current.yaw, pitch: orbit.current.pitch, zoom: orbit.current.zoom }
    orbit.current.touchedAt = Date.now()
  }
  const rotate = (dx: number, dy: number) => {
    orbit.current.yaw = start.current.yaw - dx * 0.008
    orbit.current.pitch = clampPitch(start.current.pitch + dy * 0.006)
    orbit.current.touchedAt = Date.now()
  }
  const zoomTo = (scale: number) => {
    orbit.current.zoom = Math.min(2.4, Math.max(0.4, start.current.zoom / scale))
    orbit.current.touchedAt = Date.now()
  }

  /** Hazır bakışa geç: yaw en kısa yoldan döner (otomatik dönüşle biriken turlar atlanır). */
  const goTo = (preset: ViewPreset | 'reset') => {
    const o = orbit.current
    const target = preset === 'reset' ? { yaw: 0, pitch: 0 } : { yaw: PRESETS[preset].yaw - BASE_YAW, pitch: PRESETS[preset].pitch - BASE_PITCH }
    const turns = Math.round((o.yaw - target.yaw) / (Math.PI * 2))
    o.yaw = target.yaw + turns * Math.PI * 2
    o.pitch = clampPitch(target.pitch)
    if (preset === 'reset') o.zoom = 1
    o.touchedAt = Date.now()
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
      orbit.current.zoom = Math.min(2.4, Math.max(0.4, orbit.current.zoom * Math.exp(e.deltaY * 0.0015)))
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
          camera={{ fov: 30, near: 1, far: 5000, position: [180, 140, 180] }}
          gl={{ antialias: true, preserveDrawingBuffer: Platform.OS === 'web' }}
          onCreated={({ gl, scene, camera }) => {
            // Nötr ton eşleme: beyaz karton beyaz kalır (ACES sarı-griye çeker).
            gl.toneMapping = THREE.NeutralToneMapping
            gl.outputColorSpace = THREE.SRGBColorSpace
            gl.shadowMap.type = THREE.PCFSoftShadowMap
            if (captureRef) captureRef.current = () => snapshotCanvas(gl, scene, camera)
          }}
          style={styles.canvas}
        >
          <color attach="background" args={[background]} />
          <FoldScene
            dieline={dieline}
            driver={driver}
            light={light}
            substrate={substrate}
            printUri={printUri}
            printTransform={printTransform}
            printFinish={printFinish}
            orbit={orbit}
            autoRotate={autoRotate}
            onSteps={onSteps}
            onProgress={onProgress}
          />
        </Canvas>
        {viewControls && interactive ? (
          <View style={[styles.views, { backgroundColor: colors.glass, borderColor: colors.line }]}>
            {(['front', 'back', 'top', 'bottom'] as const).map((v) => (
              <ScalePressable key={v} accessibilityRole="button" accessibilityLabel={t(`fold.view.${v}`)} onPress={() => goTo(v)} scaleTo={0.92} style={styles.viewBtn}>
                <Text variant="smallStrong" tone="soft" style={{ fontSize: 12 }}>
                  {t(`fold.view.${v}`)}
                </Text>
              </ScalePressable>
            ))}
            <ScalePressable accessibilityRole="button" accessibilityLabel={t('fold.view.reset')} onPress={() => goTo('reset')} scaleTo={0.92} style={styles.viewBtn}>
              <Icon name="maximize" size={13} color={colors.inkSoft} />
            </ScalePressable>
          </View>
        ) : null}
      </View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  host: { flex: 1, overflow: 'hidden' },
  canvas: { flex: 1 },
  views: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  viewBtn: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill },
})
