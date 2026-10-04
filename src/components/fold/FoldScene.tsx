/* eslint-disable react-hooks/refs, react-hooks/immutability, react/no-unknown-property --
 * Three.js sahnesi ve jest işleyicileri imperatif: ref'ler yalnızca useFrame / jest geri çağrılarında
 * okunur-yazılır (render sırasında değil); R3F JSX öğeleri (mesh, light…) DOM özelliği değildir. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { createPanelMaterials, materialsForMesh } from '../../fold/foldMaterials'
import { buildFoldGraph, cameraFromFrame, lightRig, measureFold, type FoldMeshData, type FoldNode } from '../../fold/foldModel'
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

const emptyAssets = (): LoadedPrintAssets => ({ texture: null, finishMaps: null, dispose: () => undefined })

const PanelMesh = ({ data, layer, assets, finish }: { data: FoldMeshData; layer: number; assets: LoadedPrintAssets; finish: PrintFinish }) => {
  const mesh = useMemo(() => {
    const materials = createPanelMaterials({
      printable: data.printable,
      layer,
      printMap: data.printable ? assets.texture : null,
      finish,
      finishMaps: assets.finishMaps,
    })
    const m = new THREE.Mesh(geometryFromMeshData(data), materialsForMesh(materials))
    m.castShadow = true
    m.receiveShadow = true
    return m
  }, [data, layer, assets, finish])
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

const FoldBranch = ({
  node,
  foldRef,
  assets,
  finish,
  layerRef,
}: {
  node: FoldNode
  foldRef: MutableRefObject<number>
  assets: LoadedPrintAssets
  finish: PrintFinish
  layerRef: MutableRefObject<number>
}) => {
  const liftRefs = useRef<(THREE.Group | null)[]>([])
  const pivotRefs = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    const t = Math.min(1, Math.max(0, foldRef.current))
    node.meshes.forEach((mesh, i) => {
      const g = liftRefs.current[i]
      if (g) g.position.y = mesh.lift * t
    })
    node.joints.forEach((joint, i) => {
      const g = pivotRefs.current[i]
      if (g) g.quaternion.setFromAxisAngle(AXIS.set(...joint.axis), THREE.MathUtils.degToRad(-joint.angle * t))
    })
  })
  return (
    <group>
      {node.meshes.map((mesh, i) => {
        const layer = layerRef.current++
        return (
          <group key={mesh.id} ref={(el) => void (liftRefs.current[i] = el)}>
            <PanelMesh data={mesh} layer={layer} assets={assets} finish={finish} />
          </group>
        )
      })}
      {node.joints.map((joint, i) => (
        <group key={joint.id} ref={(el) => void (pivotRefs.current[i] = el)} position={joint.hinge}>
          <group position={joint.childShift}>
            <FoldBranch node={joint.node} foldRef={foldRef} assets={assets} finish={finish} layerRef={layerRef} />
          </group>
        </group>
      ))}
    </group>
  )
}

/** Kamera: kutuyu çerçeveler, yaw/pitch/zoom'u yumuşakça izler, boştayken yavaşça döner. */
const OrbitCamera = ({ root, orbit, autoRotate }: { root: FoldNode; orbit: MutableRefObject<OrbitState>; autoRotate: boolean }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const frame = useMemo(() => cameraFromFrame(measureFold(root)), [root])
  const base = useMemo(() => {
    const target = new THREE.Vector3(...frame.target)
    const offset = new THREE.Vector3(...frame.position).sub(target)
    return { target, radius: offset.length(), yaw: Math.atan2(offset.x, offset.z), pitch: Math.asin(offset.y / offset.length()) }
  }, [frame])
  const smooth = useRef({ yaw: 0, pitch: 0, zoom: 1 })

  useLayoutEffect(() => {
    camera.near = frame.near
    camera.far = frame.far
    camera.updateProjectionMatrix()
  }, [camera, frame])

  useFrame((_, dt) => {
    const o = orbit.current
    if (autoRotate && Date.now() - o.touchedAt > 2500) o.yaw += dt * 0.25
    const k = 1 - Math.exp(-dt * 9)
    const s = smooth.current
    s.yaw += (o.yaw - s.yaw) * k
    s.pitch += (o.pitch - s.pitch) * k
    s.zoom += (o.zoom - s.zoom) * k
    const yaw = base.yaw + s.yaw
    const pitch = Math.min(1.45, Math.max(-0.2, base.pitch + s.pitch))
    const r = base.radius * s.zoom
    camera.position.set(
      base.target.x + r * Math.cos(pitch) * Math.sin(yaw),
      base.target.y + r * Math.sin(pitch),
      base.target.z + r * Math.cos(pitch) * Math.cos(yaw),
    )
    camera.lookAt(base.target)
  })
  return null
}

const Lights = ({ light }: { light: number }) => {
  const gl = useThree((s) => s.gl)
  const rig = lightRig(light)
  useLayoutEffect(() => {
    gl.toneMappingExposure = rig.exposure
  }, [gl, rig.exposure])
  return (
    <>
      <hemisphereLight args={[0xfff8f0, 0x7a7068, rig.hemi]} />
      <directionalLight position={[80, 160, 40]} intensity={rig.key} castShadow />
      <directionalLight position={[-60, 40, -80]} intensity={rig.fill} />
    </>
  )
}

export interface FoldSceneProps {
  dieline: DielineResponse
  /** Hedef katlanma (0 açık, 1 kapalı) — sahne yaya benzer bir hızla yaklaşır. */
  fold: number
  light: number
  printUri?: string | null
  printTransform: PrintTransform
  printFinish: PrintFinish
  orbit: MutableRefObject<OrbitState>
  autoRotate: boolean
}

export const FoldScene = ({ dieline, fold, light, printUri, printTransform, printFinish, orbit, autoRotate }: FoldSceneProps) => {
  const target = useRef(fold)
  target.current = fold
  const foldRef = useRef(fold)
  const velocity = useRef(0)
  const layerRef = useRef(0)
  layerRef.current = 0
  const [assets, setAssets] = useState<LoadedPrintAssets>(emptyAssets)

  const graph = useMemo(() => {
    const g = buildFoldGraph(dieline)
    prepareFoldGraphPrint(g.root, { bounds: dieline.bounds, printTransform, printFinish, printUrl: printUri })
    return g
  }, [dieline, printTransform, printFinish, printUri])

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

  // Kritik sönümlü yay: katlanma hedefe yumuşak yaklaşır.
  useFrame((_, dt) => {
    const step = Math.min(dt, 1 / 30)
    const stiffness = 60
    const damping = 2 * Math.sqrt(stiffness)
    const accel = stiffness * (target.current - foldRef.current) - damping * velocity.current
    velocity.current += accel * step
    foldRef.current += velocity.current * step
  })

  return (
    <>
      <Lights light={light} />
      <FoldBranch node={graph.root} foldRef={foldRef} assets={assets} finish={printFinish} layerRef={layerRef} />
      <OrbitCamera root={graph.root} orbit={orbit} autoRotate={autoRotate} />
    </>
  )
}
