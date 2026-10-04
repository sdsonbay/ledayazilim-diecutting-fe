import { memo, useMemo } from 'react'
import { SvgXml } from 'react-native-svg'
import { ZoomSurface, type ViewBox } from './ZoomSurface'

/** Tabaka yerleşim SVG'si (API veya yerel); viewBox kökten okunur. */
export const ImposeSheet = memo(function ImposeSheet({ svg, resetKey }: { svg: string; resetKey?: string }) {
  const content = useMemo<ViewBox>(() => {
    const m = /viewBox="([-\d.\s]+)"/.exec(svg)
    const [x = 0, y = 0, w = 1000, h = 1000] = (m?.[1] ?? '').trim().split(/\s+/).map(Number)
    return { x, y, w, h }
  }, [svg])
  // Kök width/height'ı kaldır; boyutu viewBox + kapsayıcı belirler.
  // data-* öznitelikleri react-native-svg'de (web) DOM uyarısı üretir; çizime etkisi yok.
  const body = useMemo(
    () =>
      svg
        .replace(/\sdata-[\w-]+="[^"]*"/g, '')
        .replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, '<svg$1')
        .replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, '<svg$1'),
    [svg],
  )
  return (
    <ZoomSurface content={content} resetKey={resetKey}>
      {(view, size) => (
        <SvgXml
          xml={body.replace(/viewBox="[^"]*"/, `viewBox="${view.x} ${view.y} ${view.w} ${view.h}"`)}
          width={size.width}
          height={size.height}
        />
      )}
    </ZoomSurface>
  )
})
