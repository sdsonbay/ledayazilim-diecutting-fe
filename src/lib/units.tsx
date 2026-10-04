import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { storage } from './storage'

export type LengthUnit = 'mm' | 'in'

const MM_PER_IN = 25.4

interface UnitValue {
  unit: LengthUnit
  setUnit: (unit: LengthUnit) => void
  /** mm → gösterim birimi (sayı). */
  toDisplay: (mm: number) => number
  /** gösterim birimi → mm. */
  fromDisplay: (value: number) => number
  /** Biçimli uzunluk: "315.0 mm" / "12.40 in". */
  format: (mm: number, digits?: number) => string
  label: string
}

const UnitContext = createContext<UnitValue | null>(null)

/** Ölçü birimi tercihi (mm / inç). Motor her zaman mm ile çalışır; yalnızca gösterim değişir. */
export const UnitProvider = ({ children }: { children: ReactNode }) => {
  const [unit, setUnitState] = useState<LengthUnit>(() => (storage.get('diecut.unit') === 'in' ? 'in' : 'mm'))
  const setUnit = useCallback((next: LengthUnit) => {
    setUnitState(next)
    storage.set('diecut.unit', next === 'mm' ? null : next)
  }, [])
  const value = useMemo<UnitValue>(() => {
    const toDisplay = (mm: number) => (unit === 'in' ? mm / MM_PER_IN : mm)
    return {
      unit,
      setUnit,
      toDisplay,
      fromDisplay: (v: number) => (unit === 'in' ? v * MM_PER_IN : v),
      format: (mm: number, digits?: number) => `${toDisplay(mm).toFixed(digits ?? (unit === 'in' ? 2 : 1))} ${unit}`,
      label: unit,
    }
  }, [unit, setUnit])
  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>
}

export const useUnit = (): UnitValue => {
  const value = useContext(UnitContext)
  if (!value) throw new Error('UnitProvider gerekli')
  return value
}
