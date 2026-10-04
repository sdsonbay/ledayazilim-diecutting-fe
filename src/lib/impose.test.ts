import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultImpose, packImposeLayout } from './impose.ts'

test('küçük kalıp + büyük tabaka anında dizilir (arayüz donmaz)', () => {
  const started = Date.now()
  const layout = packImposeLayout({ width: 95, height: 58 }, { ...defaultImpose(), sheetWidth: 2000, sheetHeight: 2000 })
  assert.ok(Date.now() - started < 2000, `${Date.now() - started} ms`)
  assert.ok(layout.copies >= 690, `${layout.copies} adet`)
})

test('B0 tabakada standart kutu aynı sonucu verir', () => {
  const layout = packImposeLayout({ width: 315, height: 248.4 }, defaultImpose())
  assert.equal(layout.copies, 15)
})
