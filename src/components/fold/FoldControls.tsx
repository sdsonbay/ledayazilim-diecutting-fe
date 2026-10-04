import { Platform, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { SUBSTRATES, type Substrate } from '../../fold/foldMaterials'
import type { FoldStep } from '../../fold/foldModel'
import { useI18n } from '../../i18n/LocaleContext'
import type { MessageKey } from '../../i18n/messages'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'
import { Icon, IconButton, ScalePressable, Slider, Text } from '../ui'

const STEP_LABEL: Record<FoldStep['kind'], MessageKey> = {
  body: 'fold.step.body',
  glue: 'fold.step.glue',
  dust: 'fold.step.dust',
  closure: 'fold.step.closure',
  lock: 'fold.step.lock',
}

export const stepLabel = (step: FoldStep, t: (k: MessageKey) => string): string =>
  step.side === 'none' ? t(STEP_LABEL[step.kind]) : `${t(step.side === 'a' ? 'fold.side.bottom' : 'fold.side.top')} ${t(STEP_LABEL[step.kind]).toLocaleLowerCase()}`

export const stepIndexAt = (steps: FoldStep[], value: number): number => {
  if (steps.length === 0) return -1
  if (value >= 0.999) return steps.length - 1
  let idx = 0
  for (let i = 0; i < steps.length; i += 1) if (value >= steps[i]!.start) idx = i
  return idx
}

/** 3D alt çubuğu: oynat / aç, montaj adımları, kaydırıcı, malzeme ve dışa aktarma. */
export const FoldControls = ({
  steps,
  progress,
  playing,
  onPlay,
  onOpen,
  onScrub,
  onStep,
  substrate,
  onSubstrate,
  light,
  onLight,
  onSnapshot,
  onGlb,
  autoRotate,
  onAutoRotate,
}: {
  steps: FoldStep[]
  progress: number
  playing: boolean
  onPlay: () => void
  onOpen: () => void
  onScrub: (value: number) => void
  onStep: (index: number) => void
  substrate: Substrate
  onSubstrate: (s: Substrate) => void
  light: number
  onLight: (v: number) => void
  onSnapshot: () => void
  onGlb?: () => void
  autoRotate: boolean
  onAutoRotate: (v: boolean) => void
}) => {
  const { colors } = useTheme()
  const { t } = useI18n()
  const current = stepIndexAt(steps, progress)
  const label = current >= 0 ? stepLabel(steps[current]!, t) : ''
  const closed = progress >= 0.999

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.row}>
        <IconButton
          icon={playing ? 'pause' : closed ? 'rotate-ccw' : 'play'}
          label={closed ? t('fold.unfold') : t('fold.play')}
          variant="primary"
          onPress={closed ? onOpen : onPlay}
          size={38}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.labelRow}>
            <Text variant="smallStrong" numberOfLines={1}>
              {progress <= 0.001 ? t('fold.flat') : closed ? t('fold.closed') : label}
            </Text>
            <Text variant="mono" tone="muted">
              {current >= 0 ? t('fold.stepOf', { n: progress <= 0.001 ? 0 : current + 1, total: steps.length }) : ''}
            </Text>
          </View>
          <Slider value={progress} min={0} max={1} step={0.001} onChange={onScrub} accessibilityLabel={t('editor.fold')} />
        </View>
      </View>
      {steps.length > 1 ? (
        <View style={styles.steps}>
          {steps.map((s, i) => (
            <StepPill key={i} active={i === current && progress > 0.001} done={progress >= s.end - 1e-3} label={stepLabel(s, t)} onPress={() => onStep(i)} />
          ))}
        </View>
      ) : null}
      <View style={styles.row}>
        <View style={styles.swatches}>
          {(Object.keys(SUBSTRATES) as Substrate[]).map((s) => (
            <ScalePressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={t(`fold.substrate.${s}` as MessageKey)}
              accessibilityState={{ selected: substrate === s }}
              onPress={() => onSubstrate(s)}
              haptic
              scaleTo={0.85}
              style={[styles.swatch, { backgroundColor: SUBSTRATES[s].swatch, borderColor: substrate === s ? colors.accent : colors.line }]}
            />
          ))}
          <Text variant="small" tone="muted" style={{ marginLeft: 4 }}>
            {t(`fold.substrate.${substrate}` as MessageKey)}
          </Text>
        </View>
        <Checkbox label={t('fold.autoRotate')} value={autoRotate} onChange={onAutoRotate} />
        {Platform.OS === 'web' ? (
          <View style={{ width: 96 }}>
            <Slider value={light} min={0.35} max={1.6} step={0.01} onChange={onLight} accessibilityLabel={t('editor.light')} />
          </View>
        ) : null}
        <IconButton icon="camera" label={t('fold.snapshot')} onPress={onSnapshot} size={34} />
        {onGlb ? <IconButton icon="box" label={t('fold.glb')} onPress={onGlb} size={34} /> : null}
      </View>
    </View>
  )
}

const Checkbox = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => {
  const { colors } = useTheme()
  return (
    <ScalePressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      haptic
      scaleTo={0.95}
      style={styles.check}
    >
      <View style={[styles.box, { borderColor: value ? colors.accent : colors.lineStrong, backgroundColor: value ? colors.accent : 'transparent' }]}>
        {value ? <Icon name="check" size={12} color="#FFFFFF" /> : null}
      </View>
      <Text variant="small" tone="soft" numberOfLines={1}>
        {label}
      </Text>
    </ScalePressable>
  )
}

const StepPill = ({ active, done, label, onPress }: { active: boolean; done: boolean; label: string; onPress: () => void }) => {
  const { colors } = useTheme()
  const fill = useAnimatedStyle(() => ({
    backgroundColor: withTiming(active ? colors.accent : done ? colors.ink : colors.lineStrong, { duration: 220 }),
  }))
  return (
    <ScalePressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={0.94} style={styles.pill}>
      <Animated.View style={[styles.bar, fill]} />
      <Text variant="small" tone={active ? 'ink' : 'muted'} numberOfLines={1} style={{ fontSize: 11 }}>
        {label}
      </Text>
    </ScalePressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  steps: { flexDirection: 'row', gap: 6 },
  pill: { flex: 1, gap: 4, minWidth: 0 },
  bar: { height: 3, borderRadius: radius.pill },
  swatches: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  box: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
})
