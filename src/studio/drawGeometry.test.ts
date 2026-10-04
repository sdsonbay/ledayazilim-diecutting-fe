import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openTrayStrokes, shapePoints, snapPoint, softStraighten, strokesToSvg } from './drawGeometry.ts'

test('tepsi: kapalı kesim + 4 kırım', () => {
  const strokes = openTrayStrokes(120, 80, 40)
  assert.equal(strokes.filter((s) => s.layer === 'cut').length, 1)
  assert.equal(strokes.filter((s) => s.layer === 'crease').length, 4)
  const svg = strokesToSvg(strokes)
  assert.match(svg, /data-layer="CUT"/)
  assert.match(svg, /data-layer="CREASE"/)
})

test('köşeye yakalama ızgaradan önce gelir', () => {
  const strokes = openTrayStrokes(120, 80, 40)
  const corner = strokes[0]!.points[0]!
  const hit = snapPoint({ x: corner.x + 1.2, y: corner.y - 0.8 }, strokes, true, 4)
  assert.equal(hit.kind, 'vertex')
  assert.deepEqual(hit.point, corner)
})

test('neredeyse yatay çizgi düzleşir, eğik çizgi korunur', () => {
  const flat = softStraighten({ x: 0, y: 0 }, { x: 100, y: 5 })
  assert.ok(Math.abs(flat.y) < 1e-9)
  const free = softStraighten({ x: 0, y: 0 }, { x: 100, y: 30 })
  assert.equal(free.y, 30)
})

test('dikdörtgen 4 köşe üretir', () => {
  assert.equal(shapePoints('rect', { x: 10, y: 10 }, { x: 50, y: 30 }, 0, 6).length, 4)
})
