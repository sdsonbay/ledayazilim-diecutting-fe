import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { countCollisions, countInsideOut, jointMatrix, jointProgress, orderViolations, outsideBody, planFold, toV } from './foldPlan.ts'

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const fixtures = readdirSync(dir).filter((f) => f.endsWith('.json'))
const load = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'))
const thicknessOf = (d: { meta: { caliper?: number } }) => Math.min(8, Math.max(0.6, d.meta.caliper || 0.4))

for (const file of fixtures) {
  test(`${file}: kapalı kutuda parçalar iç içe geçmez`, () => {
    const d = load(file)
    const t = thicknessOf(d)
    const plan = planFold(d, t)
    assert.equal(plan.residual, 0)
    assert.equal(countCollisions(d, t, plan.joints), 0)
  })

  test(`${file}: baskılı yüz dışarıda (kutu ters yüz kapanmaz)`, () => {
    const d = load(file)
    const t = thicknessOf(d)
    assert.equal(countInsideOut(d, t, planFold(d, t).joints), 0)
  })

  test(`${file}: iç/dış sırası doğru — yapıştırma payı, dil ve toz kapağı içeride, kapak dışarıda`, () => {
    const d = load(file)
    const t = thicknessOf(d)
    assert.deepEqual(orderViolations(d, t, planFold(d, t).joints), [])
  })

  test(`${file}: kapanış parçaları gövdenin dışına taşmaz`, () => {
    const d = load(file)
    const t = thicknessOf(d)
    assert.deepEqual(outsideBody(d, t, planFold(d, t).joints), [])
  })

  test(`${file}: montaj sırası gövdeyle başlar, pencereler [0,1] içinde`, () => {
    const d = load(file)
    const plan = planFold(d, thicknessOf(d))
    assert.ok(plan.steps.length >= 1)
    assert.equal(plan.steps[0]!.kind, 'body')
    for (const j of plan.joints) {
      assert.ok(j.start >= 0 && j.end <= 1 && j.start < j.end)
      // Çocuk kırım ebeveyninden önce başlamaz.
      const parent = plan.joints.find((p) => p.childId === j.parentId)
      if (parent) assert.ok(j.start >= parent.start - 1e-9)
    }
  })
}

test('katmanlama olmadan (yalnız iç menteşe) çakışma vardır — çözücü gerçekten iş yapıyor', () => {
  const d = load('ecma-a20-20.json')
  const t = thicknessOf(d)
  const plan = planFold(d, t)
  const unlayered = plan.joints.map((j) => ({ ...j, layer: 0 }))
  assert.ok(countCollisions(d, t, unlayered) > 0)
})

test('kırım ilerlemesi penceresinde 0→1 yumuşak', () => {
  const w = { start: 0.2, end: 0.6 }
  assert.equal(jointProgress(w, 0.1), 0)
  assert.equal(jointProgress(w, 0.7), 1)
  assert.ok(Math.abs(jointProgress(w, 0.4) - 0.5) < 1e-9)
})

/** Kapalı pozda panelin dünya dönüşümü. */
const closedWorld = (joints: ReturnType<typeof planFold>['joints'], id: string, t: number) => {
  const byChild = new Map(joints.map((j) => [j.childId, j]))
  const chain = []
  for (let j = byChild.get(id); j; j = byChild.get(j.parentId)) chain.unshift(j)
  const m = new THREE.Matrix4()
  for (const j of chain) m.multiply(jointMatrix(j, t, 1))
  return m
}

test('ana sayfa kutusu (ECMA A20.20): yapıştırma payı ve kapak dilleri kutunun içinde', () => {
  const d = load('ecma-a20-20.json')
  const t = thicknessOf(d)
  const plan = planFold(d, t)
  type P = { id: string; outline: { x: number; y: number }[] }
  const panel = (id: string) => d.panels.find((p: P) => p.id === id) as P
  // Gövdenin sınır kutusu (duvar orta düzlemleri); iç parçaların merkezi bunun içinde kalmalı.
  const box = new THREE.Box3()
  for (const id of ['front', 'back', 'left', 'right']) for (const q of panel(id).outline) box.expandByPoint(toV(q, t / 2).applyMatrix4(closedWorld(plan.joints, id, t)))
  for (const id of ['glue', 'top-tuck-tongue', 'bottom-tuck-tongue']) {
    const o = panel(id).outline
    const c = toV({ x: o.reduce((s, q) => s + q.x, 0) / o.length, y: o.reduce((s, q) => s + q.y, 0) / o.length }, t / 2).applyMatrix4(closedWorld(plan.joints, id, t))
    assert.ok(box.containsPoint(c), `${id} kutunun dışında: ${c.toArray().map((v) => v.toFixed(1))}`)
  }
  // Kapak ile dil arasında kırım var (tek parça kapakta dil dışarıda kalırdı).
  assert.ok(d.folds.some((f: { parent: string; child: string }) => f.parent === 'top-tuck' && f.child === 'top-tuck-tongue'))
})
