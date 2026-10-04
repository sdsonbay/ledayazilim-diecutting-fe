import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl'
import type * as THREE from 'three'

/** Native: expo-gl bağlamından PNG dosyası (önbellekte) alır. */
export async function snapshotCanvas(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<string | null> {
  gl.render(scene, camera)
  const context = gl.getContext() as unknown as ExpoWebGLRenderingContext
  context.endFrameEXP?.()
  const snap = await GLView.takeSnapshotAsync(context, { format: 'png' })
  return typeof snap.uri === 'string' ? snap.uri : snap.localUri
}
