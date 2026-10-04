import type * as THREE from 'three'

/** Web: aynı kareyi yeniden çizip canvas'tan PNG data URI alır. */
export async function snapshotCanvas(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<string | null> {
  gl.render(scene, camera)
  return gl.domElement.toDataURL('image/png')
}
