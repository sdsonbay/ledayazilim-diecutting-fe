import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linkedZones, setFoldAngle, stretchDieline, stretchStops } from './dielineEdit.ts'
import type { DielineResponse, PathCommand } from './types.ts'

const poly = (pts: [number, number][], close = true): PathCommand[] => [
  ...pts.map(([x, y], i) => ({ c: i === 0 ? 'M' : 'L', x, y }) as PathCommand),
  ...(close ? [{ c: 'Z' } as PathCommand] : []),
]

/** Açık tepsi: 100×60 taban, 20 mm duvarlar; tabanda 10 mm kare delik. */
const tray = (): DielineResponse => ({
  templateId: 'imported',
  unit: 'mm',
  params: {},
  meta: { name: { tr: 't', en: 't' }, caliper: 0.4 },
  bounds: { x: -20, y: -20, width: 140, height: 100 },
  stats: { cutLength: 0, creaseLength: 0, perfLength: 0, flatWidth: 140, flatHeight: 100, area: 0, boundingArea: 0, utilisation: 0 },
  warnings: [],
  panels: [
    { id: 'base', name: 'base', label: { tr: '', en: '' }, outline: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }], role: 'bottom', printable: true },
    { id: 'left', name: 'left', label: { tr: '', en: '' }, outline: [{ x: -20, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 60 }, { x: -20, y: 60 }], role: 'wall', printable: true },
  ],
  folds: [{ id: 'f1', parent: 'base', child: 'left', axis: [{ x: 0, y: 0 }, { x: 0, y: 60 }], angle: -90, kind: 'crease' }],
  rootPanel: 'base',
  svg: '',
  paths: [
    { id: 'c', layer: 'cut', commands: poly([[0, -20], [100, -20], [100, 0], [120, 0], [120, 60], [100, 60], [100, 80], [0, 80], [0, 60], [-20, 60], [-20, 0], [0, 0]]) },
    { id: 'h', layer: 'cut', commands: poly([[45, 25], [55, 25], [55, 35], [45, 35]]) },
    { id: 'k1', layer: 'crease', commands: poly([[0, 0], [0, 60]], false) },
    { id: 'k2', layer: 'crease', commands: poly([[100, 0], [100, 60]], false) },
    { id: 'k3', layer: 'crease', commands: poly([[0, 0], [100, 0]], false) },
    { id: 'k4', layer: 'crease', commands: poly([[0, 60], [100, 60]], false) },
  ],
})

test('esnetme bölgeleri kırım hatlarından çıkar', () => {
  assert.deepEqual(stretchStops(tray(), 'x'), [-20, 0, 100, 120])
  assert.deepEqual(stretchStops(tray(), 'y'), [-20, 0, 60, 80])
})

test('taban genişliği değişince paneller, kırımlar ve açık ölçü birlikte esner; delik bozulmaz', () => {
  const d = stretchDieline(tray(), 'x', [20, 150, 20])
  assert.equal(d.bounds.width, 190)
  assert.deepEqual(stretchStops(d, 'x'), [-20, 0, 150, 170])
  assert.deepEqual(d.panels[0]!.outline.map((p) => p.x), [0, 150, 150, 0])
  assert.deepEqual(d.folds[0]!.axis.map((p) => p.x), [0, 0])
  const hole = d.paths!.find((p) => p.id === 'h')!.commands.filter((c) => c.c !== 'Z') as { x: number }[]
  const xs = hole.map((c) => c.x)
  assert.equal(Math.max(...xs) - Math.min(...xs), 10, 'delik ölçüsü korunur')
  assert.equal((Math.max(...xs) + Math.min(...xs)) / 2, 75, 'delik orantılı kayar')
})

test('kırım açısı ve eş bölgeler', () => {
  assert.equal(setFoldAngle(tray(), 'f1', 200).folds[0]!.angle, 180)
  assert.deepEqual(linkedZones([20, 100, 50, 100, 50], 1), [1, 3])
})
