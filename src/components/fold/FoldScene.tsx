/* eslint-disable react-hooks/immutability, react/no-unknown-property --
 * Three.js sahnesi ve jest işleyicileri imperatif: ref'ler yalnızca useFrame / jest geri çağrılarında
 * okunur-yazılır (render sırasında değil); R3F JSX öğeleri (mesh, light…) DOM özelliği değildir. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { createPanelMaterials, materialsForMesh, type Substrate } from '../../fold/foldMaterials'
import { buildFoldGraph, layoutFold, restAt, type FoldFrame, type FoldMeshData, type FoldNode, type FoldStep } from '../../fold/foldModel'
import { jointProgress } from '../../fold/foldPlan'
import { loadPrintAssets, type LoadedPrintAssets } from '../../fold/foldPrintAssets'
import { prepareFoldGraphPrint } from '../../fold/foldPrintContext'
import { geometryFromMeshData } from '../../fold/foldThree'
import type { DielineResponse, PrintFinish, PrintTransform } from '../../lib/types'
import { useFrame, useThree } from './r3f'

export interface OrbitState {
  yaw: number
  pitch: number
  zoom: number
  /** Kullanıcı en son ne zaman dokundu (otomatik dönüş için). */
  touchedAt: number
}

/** Varsayılan bakış (izometrik); yaw/pitch bu açılara göre görelidir. */
export const BASE_YAW = 0.62
export const BASE_PITCH = 0.36
/** Kamera tam üstten / tam alttan bakmaya yakın gidebilir (kutunun altı görülebilsin). */
export const PITCH_LIMIT = 1.48

/** Katlanma sürücüsü: sahne `value`yu `target`a `speed` (birim/sn) hızla taşır. */
export interface FoldDriver {
  target: number
  speed: number
  value: number
}

const emptyAssets = (): LoadedPrintAssets => ({ texture: null, finishMaps: null, dispose: () => undefined })

const PanelMesh = ({
  data,
  assets,
  finish,
  substrate,
  uvVersion,
}: {
  data: FoldMeshData
  assets: LoadedPrintAssets
  finish: PrintFinish
  substrate: Substrate
  /** Baskı UV'leri yerinde yeniden yazılınca değişir → geometri yeniden kurulur. */
  uvVersion: object
}) => {
  const mesh = useMemo(() => {
    const materials = createPanelMaterials({
      printable: data.printable,
      layer: 0,
      printMap: data.printable ? assets.texture : null,
      finish,
      finishMaps: assets.finishMaps,
      substrate,
    })
    const m = new THREE.Mesh(geometryFromMeshData(data), materialsForMesh(materials))
    m.castShadow = true
    m.receiveShadow = true
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uvVersion: data.uvs yerinde güncellendi
  }, [data, assets, finish, substrate, uvVersion])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      for (const mat of mesh.material as THREE.Material[]) mat.dispose()
    },
    [mesh],
  )
  return <primitive object={mesh} />
}

const AXIS = new THREE.Vector3()

/** Panel ağacı: her kırım kendi zaman penceresinde (montaj sırası) döner. */
const FoldBranch = ({
  node,
  driver,
  assets,
  finish,
  substrate,
  uvVersion,
}: {
  node: FoldNode
  driver: MutableRefObject<FoldDriver>
  assets: LoadedPrintAssets
  finish: PrintFinish
  substrate: Substrate
  uvVersion: object
}) => {
  const pivotRefs = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    const time = driver.current.value
    node.joints.forEach((joint, i) => {
      const g = pivotRefs.current[i]
      if (g) g.quaternion.setFromAxisAngle(AXIS.set(...joint.axis), THREE.MathUtils.degToRad(-joint.angle * jointProgress(joint, time)))
    })
  })
  return (
    <group>
      {node.meshes.map((mesh) => (
        <PanelMesh key={mesh.id} data={mesh} assets={assets} finish={finish} substrate={substrate} uvVersion={uvVersion} />
      ))}
      {node.joints.map((joint, i) => (
        <group key={joint.id} ref={(el) => void (pivotRefs.current[i] = el)} position={joint.hinge}>
          <group position={joint.childShift}>
            <FoldBranch node={joint.node} driver={driver} assets={assets} finish={finish} substrate={substrate} uvVersion={uvVersion} />
          </group>
        </group>
      ))}
    </group>
  )
}

/** Kamera: kutuyu çerçeveler, yaw/pitch/zoom'u yumuşakça izler, boştayken yavaşça döner. */
const OrbitCamera = ({
  open,
  closed,
  span,
  driver,
  orbit,
  autoRotate,
}: {
  open: FoldFrame
  closed: FoldFrame
  span: number
  driver: MutableRefObject<FoldDriver>
  orbit: MutableRefObject<OrbitState>
  autoRotate: boolean
}) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const target = useMemo(() => new THREE.Vector3(), [])
  const smooth = useRef({ yaw: 0, pitch: 0, zoom: 1 })

  useLayoutEffect(() => {
    camera.near = Math.max(0.5, span / 200)
    camera.far = span * 40
    camera.updateProjectionMatrix()
  }, [camera, span])

  useFrame((_, dt) => {
    const o = orbit.current
    if (autoRotate && Date.now() - o.touchedAt > 2500) o.yaw += dt * 0.22
    const k = 1 - Math.exp(-dt * 9)
    const s = smooth.current
    s.yaw += (o.yaw - s.yaw) * k
    s.pitch += (o.pitch - s.pitch) * k
    s.zoom += (o.zoom - s.zoom) * k
    // Kadraj düz dieline'dan kapalı kutuya doğru yumuşakça daralır.
    const f = jointProgress({ start: 0.15, end: 1 }, driver.current.value)
    target.set(
      open.center[0] + (closed.center[0] - open.center[0]) * f,
      open.center[1] + (closed.center[1] - open.center[1]) * f,
      open.center[2] + (closed.center[2] - open.center[2]) * f,
    )
    const spanNow = open.span + (closed.span - open.span) * f
    const fit = spanNow / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const radius = (fit * 1.55) / Math.min(1, camera.aspect || 1)
    const yaw = BASE_YAW + s.yaw
    const pitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, BASE_PITCH + s.pitch))
    const r = radius * s.zoom
    camera.position.set(
      target.x + r * Math.cos(pitch) * Math.sin(yaw),
      target.y + r * Math.sin(pitch),
      target.z + r * Math.cos(pitch) * Math.cos(yaw),
    )
    camera.lookAt(target)
  })
  return null
}

const Lights = ({ light, span }: { light: number; span: number }) => {
  const gl = useThree((s) => s.gl)
  const level = Math.min(1.6, Math.max(0.35, light))
  useLayoutEffect(() => {
    gl.toneMappingExposure = 0.9 + level * 0.25
  }, [gl, level])
  const d = span * 1.6
  return (
    <>
      <hemisphereLight args={[0xffffff, 0xb9b3a9, 0.75 + level * 0.6]} />
      <directionalLight
        position={[span * 0.5, span * 2.8, span * 0.7]}
        intensity={0.6 + level * 0.9}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-d}
        shadow-camera-right={d}
        shadow-camera-top={d}
        shadow-camera-bottom={-d}
        shadow-camera-near={span * 0.1}
        shadow-camera-far={span * 8}
        shadow-bias={-0.0004}
        shadow-radius={6}
      />
      <directionalLight position={[-span * 1.6, span * 0.9, span * 1.1]} intensity={0.35 + level * 0.3} />
      {/* Alttan zayıf dolgu: kutunun tabanı alttan bakınca kapkara görünmesin. */}
      <directionalLight position={[span * 0.4, -span * 2, -span * 0.6]} intensity={0.45 + level * 0.35} />
    </>
  )
}

/** Modeli yönlendirir ve katlanma boyunca zeminde tutar. */
const RestingGroup = ({
  layout,
  driver,
  children,
}: {
  layout: ReturnType<typeof layoutFold>
  driver: MutableRefObject<FoldDriver>
  children: React.ReactNode
}) => {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    g.position.set(layout.offset[0], layout.offset[1] + restAt(layout.rest, driver.current.value), layout.offset[2])
  })
  return (
    <group ref={ref} quaternion={layout.quaternion} position={layout.offset}>
      {children}
    </group>
  )
}

export interface FoldSceneProps {
  dieline: DielineResponse
  driver: MutableRefObject<FoldDriver>
  light: number
  substrate: Substrate
  printUri?: string | null
  printTransform: PrintTransform
  printFinish: PrintFinish
  orbit: MutableRefObject<OrbitState>
  autoRotate: boolean
  /** Montaj adımları hazır olunca. */
  onSteps?: (steps: FoldStep[]) => void
  /** ~10 Hz ilerleme bildirimi (oynatma sırasında kaydırıcı ve adım göstergesi için). */
  onProgress?: (value: number) => void
}

export const FoldScene = ({
  dieline,
  driver,
  light,
  substrate,
  printUri,
  printTransform,
  printFinish,
  orbit,
  autoRotate,
  onSteps,
  onProgress,
}: FoldSceneProps) => {
  const [assets, setAssets] = useState<LoadedPrintAssets>(emptyAssets)
  const lastReport = useRef({ at: 0, value: -1 })

  // Katlama planı yalnız bıçak izine bağlı; baskı değişince yalnız UV'ler yeniden yazılır.
  const base = useMemo(() => buildFoldGraph(dieline), [dieline])
  const graph = useMemo(() => {
    prepareFoldGraphPrint(base.root, { bounds: dieline.bounds, printTransform, printFinish, printUrl: printUri })
    return { ...base }
  }, [base, dieline.bounds, printTransform, printFinish, printUri])

  const rootRole = dieline.panels.find((p) => p.id === dieline.rootPanel)?.role ?? 'wall'
  const layout = useMemo(() => layoutFold(base.root, rootRole, base.thickness), [base, rootRole])

  useEffect(() => {
    onSteps?.(base.steps)
  }, [base, onSteps])

  useEffect(() => {
    let disposed = false
    let current = emptyAssets()
    void loadPrintAssets(printUri, printFinish)
      .then((loaded) => {
        if (disposed) {
          loaded.dispose()
          return
        }
        current = loaded
        setAssets(loaded)
      })
      .catch(() => setAssets(emptyAssets()))
    return () => {
      disposed = true
      current.dispose()
    }
  }, [printUri, printFinish])

  // Sabit hızlı ilerleme: montaj adımları her kırımın kendi penceresinde yumuşatılır.
  useFrame((_, dt) => {
    const d = driver.current
    const step = Math.min(dt, 1 / 20) * d.speed
    const diff = d.target - d.value
    d.value = Math.abs(diff) <= step ? d.target : d.value + Math.sign(diff) * step
    const now = performance.now()
    const r = lastReport.current
    if (onProgress && r.value !== d.value && (now - r.at > 90 || d.value === d.target)) {
      r.at = now
      r.value = d.value
      onProgress(d.value)
    }
  })

  return (
    <>
      <Lights light={light} span={layout.frame.span} />
      <RestingGroup layout={layout} driver={driver}>
        <FoldBranch node={graph.root} driver={driver} assets={assets} finish={printFinish} substrate={substrate} uvVersion={graph} />
      </RestingGroup>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[layout.frame.span * 12, layout.frame.span * 12]} />
        <shadowMaterial transparent opacity={0.16} />
      </mesh>
      <OrbitCamera
        open={layout.openFrame}
        closed={layout.closedFrame}
        span={layout.frame.span}
        driver={driver}
        orbit={orbit}
        autoRotate={autoRotate}
      />
    </>
  )
}
