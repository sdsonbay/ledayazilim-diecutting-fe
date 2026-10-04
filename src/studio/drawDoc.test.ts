import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  duplicateSel,
  flipSel,
  hitShape,
  marqueeSelect,
  openTray,
  parseShapes,
  rotateSel,
  setLine,
  shapeFromDrag,
  shapesFromDieline,
  shapesToSvg,
  snapPoint,
  straighten,
  type Shape,
} from './drawDoc.ts'

const line = (id: string, ax: number, ay: number, bx: number, by: number, layer: 'cut' | 'crease' = 'cut'): Shape => ({ id, layer, closed: false, points: [{ x: ax, y: ay }, { x: bx, y: by }] })

test('tepsi: kapalı kesim + 4 kırım, SVG katmanları kırmızı/yeşil', () => {
  const shapes = openTray(120, 80, 40)
  assert.equal(shapes.filter((s) => s.layer === 'cut').length, 1)
  assert.equal(shapes.filter((s) => s.layer === 'crease').length, 4)
  const svg = shapesToSvg(shapes)
  assert.match(svg, /data-layer="CUT" fill="none" stroke="#E4002B"/)
  assert.match(svg, /data-layer="CREASE" fill="none" stroke="#00A651"/)
  assert.doesNotMatch(svg, /dasharray/)
})

test('yakalama önceliği: uç > orta > kesişim > kenar > hizalama > ızgara', () => {
  const shapes = [line('a', 0, 0, 100, 0), line('b', 50, -50, 50, 50)]
  const opts = { tol: 4, grid: 5, objects: true }
  assert.equal(snapPoint({ x: 1, y: 1 }, shapes, opts).kind, 'end')
  assert.deepEqual(snapPoint({ x: 51.5, y: 1.2 }, shapes, opts).point, { x: 50, y: 0 })
  assert.equal(snapPoint({ x: 80, y: 1 }, shapes, opts).kind, 'edge')
  const aligned = snapPoint({ x: 99, y: 30 }, shapes, opts)
  assert.equal(aligned.kind, 'align')
  assert.equal(aligned.point.x, 100)
  assert.equal(snapPoint({ x: 203, y: 207 }, shapes, opts).kind, 'grid')
  assert.equal(snapPoint({ x: 203.3, y: 207.7 }, shapes, { tol: 4, grid: 0, objects: false }).kind, 'free')
})

test('doğrultma: yumuşak (6°) ve Shift ile 15° katları', () => {
  assert.ok(Math.abs(straighten({ x: 0, y: 0 }, { x: 100, y: 5 }, false).y) < 1e-9)
  assert.equal(straighten({ x: 0, y: 0 }, { x: 100, y: 30 }, false).y, 30)
  const forced = straighten({ x: 0, y: 0 }, { x: 100, y: 30 }, true)
  assert.ok(Math.abs(Math.atan2(forced.y, forced.x) * (180 / Math.PI) - 15) < 0.1)
})

test('seçim kutusu: soldan sağa tamamen içerdekiler, sağdan sola değenler', () => {
  const shapes = [line('in', 10, 10, 20, 10), line('cross', 15, 15, 80, 15)]
  assert.deepEqual(marqueeSelect(shapes, { x: 0, y: 0 }, { x: 50, y: 50 }), ['in'])
  assert.deepEqual(marqueeSelect(shapes, { x: 50, y: 50 }, { x: 0, y: 0 }).sort(), ['cross', 'in'])
})

test('dönüşümler, çoğaltma, çizgi uzunluğu', () => {
  const shapes = [line('a', 0, 0, 10, 0)]
  const ids = new Set(['a'])
  assert.deepEqual(rotateSel(shapes, ids, { x: 0, y: 0 }, 90)[0]!.points[1], { x: 0, y: 10 })
  assert.deepEqual(flipSel(shapes, ids, { x: 5, y: 0 }, 'h')[0]!.points, [{ x: 10, y: 0 }, { x: 0, y: 0 }])
  const dup = duplicateSel(shapes, ids, 5)
  assert.equal(dup.shapes.length, 2)
  assert.deepEqual(dup.shapes[1]!.points[0], { x: 5, y: 5 })
  assert.deepEqual(setLine(shapes, 'a', 50, 90)[0]!.points[1], { x: 0, y: 50 })
  assert.equal(hitShape({ x: 5, y: 1 }, shapes, 2), 'a')
})

test('şekiller: kare kısıtı ve oval', () => {
  const sq = shapeFromDrag('rect', { x: 0, y: 0 }, { x: 40, y: 10 }, { radius: 0, sides: 6, square: true })
  assert.deepEqual(sq[2], { x: 40, y: 40 })
  assert.ok(shapeFromDrag('ellipse', { x: 0, y: 0 }, { x: 40, y: 20 }, { radius: 0, sides: 6, square: false }).length >= 32)
})

test('bıçak izinden şekiller: y çevrilir, yaylar noktalanır', () => {
  const shapes = shapesFromDieline({
    bounds: { x: 0, y: 0, width: 20, height: 10 },
    paths: [
      { id: 'c', layer: 'cut', commands: [{ c: 'M', x: 0, y: 0 }, { c: 'L', x: 20, y: 0 }, { c: 'A', rx: 5, ry: 5, rot: 0, large: false, sweep: true, x: 20, y: 10 }, { c: 'L', x: 0, y: 10 }, { c: 'Z' }] },
      { id: 'k', layer: 'crease', commands: [{ c: 'M', x: 10, y: 0 }, { c: 'L', x: 10, y: 10 }] },
      { id: 'b', layer: 'bleed', commands: [{ c: 'M', x: 0, y: 0 }, { c: 'L', x: 1, y: 1 }] },
    ],
  } as never)
  assert.equal(shapes.length, 2)
  assert.ok(shapes[0]!.closed)
  assert.ok(shapes[0]!.points.length > 5)
  assert.deepEqual(shapes[1]!.points[0], { x: 10, y: 10 })
})

test('bozuk taslak güvenle okunur', () => {
  assert.equal(parseShapes('{bad'), null)
  assert.deepEqual(parseShapes('[{"layer":"cut","points":[{"x":0,"y":0}]}]'), [])
  assert.equal(parseShapes('[{"id":"a","layer":"crease","points":[{"x":0,"y":0},{"x":1,"y":1}],"closed":false}]')!.length, 1)
})
