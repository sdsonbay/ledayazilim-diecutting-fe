import { Component, type ReactNode } from 'react'

/**
 * 3D sahne hatası (ör. cihazın GL sürücüsü / expo-gl desteklemediği bir çağrı) tüm
 * uygulamayı düşürmesin: hata yakalanır, yerine `fallback` gösterilir.
 */
export class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onError?: (error: Error) => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.warn('[3d] sahne hatası', error)
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
