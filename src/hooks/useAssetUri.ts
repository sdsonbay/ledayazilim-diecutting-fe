import { Asset } from 'expo-asset'
import { useEffect, useState } from 'react'

/** Paketlenmiş bir görseli (require) yüklenebilir URI'ye çevirir — 3D doku için (native'de yerel dosya). */
export function useAssetUri(module: number): string | null {
  const [uri, setUri] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const asset = Asset.fromModule(module)
    void asset
      .downloadAsync()
      .then((a) => {
        if (alive) setUri(a.localUri ?? a.uri)
      })
      .catch(() => {
        if (alive) setUri(asset.uri)
      })
    return () => {
      alive = false
    }
  }, [module])
  return uri
}
