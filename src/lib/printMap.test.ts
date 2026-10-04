import assert from 'node:assert/strict'
import { test } from 'node:test'
import { coverPrint, fitPrint, normalizeAngle, resetPrint, printBaseSize, printFrameSvg, printSize, withPrintWidth } from './printMap.ts'

const bounds = { width: 300, height: 200 }
const base = { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 }
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`)

test('oran yoksa bıçak izine gerilir (eski kayıtlar)', () => {
  assert.deepEqual(printBaseSize(bounds, base), { width: 300, height: 200 })
})

test('oran korunarak içine sığar', () => {
  const wide = printBaseSize(bounds, { ...base, aspect: 3 })
  close(wide.width, 300)
  close(wide.height, 100)
  const tall = printBaseSize(bounds, { ...base, aspect: 0.5 })
  close(tall.width, 100)
  close(tall.height, 200)
})

/** Bıçak izinin dört köşesi döndürülmüş görselin içinde mi? */
const covers = (t: Parameters<typeof printFrameSvg>[1]) => {
  const f = printFrameSvg(bounds, t, 0)
  const rad = (-t.rotation * Math.PI) / 180
  return [
    [0, 0],
    [bounds.width, 0],
    [bounds.width, bounds.height],
    [0, bounds.height],
  ].every(([x, y]) => {
    const dx = x! - f.center.x
    const dy = y! - f.center.y
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad)
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad)
    return Math.abs(lx) <= f.hw + 1e-6 && Math.abs(ly) <= f.hh + 1e-6
  })
}

test('kapla: her açıda bıçak izini tamamen örter, oran bozulmaz', () => {
  for (const rotation of [0, 30, 90, -135]) {
    const t = coverPrint(bounds, { ...base, aspect: 1.27, offsetX: 40, rotation })
    assert.ok(covers(t), `açı ${rotation}`)
    assert.equal(t.offsetX, 0)
    assert.equal(t.rotation, rotation)
    // Gereğinden büyük değil: biraz küçültünce artık örtmez.
    assert.ok(!covers({ ...t, scale: t.scale * 0.98 }))
  }
})

test('sığdır: döndürülmüş görsel bıçak izinin içinde kalır', () => {
  for (const rotation of [0, 45, 90]) {
    const t = fitPrint(bounds, { scale: 2.4, offsetX: 5, offsetY: -9, rotation, aspect: 1.5 })
    const f = printFrameSvg(bounds, t, 0)
    for (const c of f.corners) {
      assert.ok(c.x >= -1e-6 && c.x <= bounds.width + 1e-6 && c.y >= -1e-6 && c.y <= bounds.height + 1e-6)
    }
    assert.equal(t.offsetX, 0)
  }
  assert.deepEqual(resetPrint({ scale: 2, offsetX: 1, offsetY: 2, rotation: 9, aspect: 2 }), { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, aspect: 2 })
})

test('genişlik girişi ölçeğe çevrilir ve sınırlanır', () => {
  const t = withPrintWidth(bounds, { ...base, aspect: 2 }, 150)
  close(printSize(bounds, t).width, 150)
  assert.equal(withPrintWidth(bounds, { ...base, aspect: 2 }, 1e9).scale, 8)
})

test('çerçeve köşeleri dönüşle birlikte döner', () => {
  const f = printFrameSvg(bounds, { ...base, aspect: 2, rotation: 90 }, 0)
  // 300×150 görsel 90° dönünce ekranda 150 geniş, 300 yüksek kaplar.
  const xs = f.corners.map((c) => c.x)
  const ys = f.corners.map((c) => c.y)
  close(Math.max(...xs) - Math.min(...xs), 150)
  close(Math.max(...ys) - Math.min(...ys), 300)
  close(f.center.x, 150)
  close(f.center.y, 100)
})

test('açı -180..180 aralığına iner', () => {
  assert.equal(normalizeAngle(370), 10)
  assert.equal(normalizeAngle(-190), 170)
  assert.equal(normalizeAngle(180), 180)
})
