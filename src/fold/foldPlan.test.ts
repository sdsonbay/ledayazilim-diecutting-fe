import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { countCollisions, countInsideOut, jointProgress, planFold } from './foldPlan.ts'

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
