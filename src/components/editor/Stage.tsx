import { router } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useAuth } from '../../auth/AuthContext'
import type { ImposeState } from '../../hooks/useImpose'
import { useI18n } from '../../i18n/LocaleContext'
import type { DielineResponse, PrintFinish, PrintTransform } from '../../lib/types'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'
import { DielineCanvas, DielineLegend } from '../dieline/DielineCanvas'
import { ImposeSheet } from '../dieline/ImposeSheet'
import { exportFoldGlb } from '../../fold/exportGlb'
import type { Substrate } from '../../fold/foldMaterials'
import type { FoldStep } from '../../fold/foldModel'
import { saveFile } from '../../lib/saveFile'
import { useUnit } from '../../lib/units'
import { shareImage } from '../../lib/shareImage'
import { FoldControls } from '../fold/FoldControls'
import { FoldView, type FoldCapture } from '../fold/FoldView'
import { Button, Icon, ScalePressable, Segmented, Text, useFeedback } from '../ui'

export type StageMode = '2d' | '3d' | 'impose'

export interface StageProps {
  dieline: DielineResponse | null
  mode: StageMode
  onMode: (mode: StageMode) => void
  busy?: boolean
  printUri?: string | null
  printTransform?: PrintTransform
  printFinish?: PrintFinish
  impose: ImposeState
  onExport: () => void
  /** Sahneyi çevreleyen kartın stili (yükseklik vb.). */
  style?: object
  empty?: React.ReactNode
  /** 3D'de başlangıç malzemesi (oluklu şablonlar için oluklu mukavva). */
  defaultSubstrate?: Substrate
}

/** Bıçak izi sahnesi: 2D / 3D / tabaka; üstte mod ve indirme, altta ölçüler ve katlama. */
export const Stage = ({ dieline, mode, onMode, busy, printUri, printTransform, printFinish, impose, onExport, style, empty, defaultSubstrate = 'white' }: StageProps) => {
  const { colors } = useTheme()
  const { t } = useI18n()
  const { loggedIn } = useAuth()
  const { toast } = useFeedback()
  const units = useUnit()
  const [showDims, setShowDims] = useState(true)
  const [fold, setFold] = useState(1)
  const [speed, setSpeed] = useState(0.24)
  const [progress, setProgress] = useState(0)
  const [steps, setSteps] = useState<FoldStep[]>([])
  const [substrate, setSubstrate] = useState<Substrate>(defaultSubstrate)
  const [light, setLight] = useState(1.1)
  const capture = useRef<FoldCapture | null>(null)
  const onSteps = useCallback((next: FoldStep[]) => setSteps(next), [])
  const onProgress = useCallback((v: number) => setProgress(v), [])
  const playing = speed < 1 && Math.abs(fold - progress) > 0.002

  const play = (target: number) => {
    setSpeed(0.24)
    setFold(target)
  }
  const scrub = (v: number) => {
    setSpeed(6)
    setFold(v)
  }
  const snapshot = async () => {
    const uri = await capture.current?.()
    if (!uri || !dieline) return
    await shareImage(uri, `${dieline.templateId}-3d.png`)
    toast(t('fold.snapshotDone'), 'success')
  }
  const glb = async () => {
    if (!dieline) return
    try {
      const bytes = await exportFoldGlb(dieline, substrate, 1)
      await saveFile(bytes, `${dieline.templateId}.glb`, 'model/gltf-binary')
      toast(t('fold.glbDone'), 'success')
    } catch {
      toast(t('editor.exportFail'), 'error')
    }
  }

  const showFold = mode === '3d' && loggedIn && dieline
  const stats = dieline?.stats

  return (
    <View style={[styles.stage, { backgroundColor: colors.stage, borderColor: colors.line }, style]}>
      <View style={styles.toolbar}>
        <View style={{ flex: 1, maxWidth: 360 }}>
          <Segmented<StageMode>
            size="sm"
            value={mode}
            onChange={onMode}
            options={[
              { value: '2d', label: t('editor.diecut'), icon: 'scissors' },
              { value: '3d', label: '3D', icon: 'box', badge: loggedIn ? undefined : '•' },
              { value: 'impose', label: t('editor.tabImpose'), icon: 'layout' },
            ]}
          />
        </View>
        <Button label={t('editor.export')} icon="download" size="sm" onPress={onExport} disabled={!dieline} />
      </View>

      <View style={styles.viewport}>
        {!dieline ? (
          empty ?? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.muted} />
            </View>
          )
        ) : mode === '2d' ? (
          <Animated.View key="2d" entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)} style={StyleSheet.absoluteFill}>
            <DielineCanvas dieline={dieline} printUri={printUri} printTransform={printTransform} formatLength={showDims ? units.format : undefined} />
          </Animated.View>
        ) : mode === '3d' ? (
          showFold ? (
            <Animated.View key="3d" entering={FadeIn.duration(260)} style={StyleSheet.absoluteFill}>
              <FoldView
                dieline={dieline}
                fold={fold}
                speed={speed}
                substrate={substrate}
                onSteps={onSteps}
                onProgress={onProgress}
                captureRef={capture}
                light={light}
                background={colors.scene}
                printUri={printUri}
                printTransform={printTransform}
                printFinish={printFinish}
              />
            </Animated.View>
          ) : (
            <Animated.View key="gate" entering={FadeIn.duration(220)} style={styles.center}>
              <View style={[styles.gate, { backgroundColor: colors.surface }]}>
                <Text variant="title" align="center">
                  {t('editor.gateTitle')}
                </Text>
                <Text variant="body" tone="muted" align="center">
                  {t('editor.gateBody')}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                  <Button label={t('editor.register')} onPress={() => router.push('/auth/register')} />
                  <Button label={t('editor.login')} variant="outline" onPress={() => router.push('/auth/login')} />
                </View>
              </View>
            </Animated.View>
          )
        ) : impose.result ? (
          <Animated.View key="impose" entering={FadeIn.duration(220)} style={StyleSheet.absoluteFill}>
            <ImposeSheet svg={impose.result.svg} resetKey={`${impose.cfg.sheetId}-${impose.cfg.sheetWidth}`} />
          </Animated.View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={colors.muted} />
          </View>
        )}
        {busy || (mode === 'impose' && impose.busy) ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.busy, { backgroundColor: colors.glass }]}>
            <ActivityIndicator size="small" color={colors.ink} />
            <Text variant="small" tone="soft">
              {t('editor.updating')}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      <View style={[styles.footer, { borderColor: colors.line }]}>
        {showFold ? (
          <FoldControls
            steps={steps}
            progress={progress}
            playing={playing}
            onPlay={() => play(playing ? progress : 1)}
            onOpen={() => play(0)}
            onScrub={scrub}
            onStep={(i) => play(steps[i]?.end ?? 1)}
            substrate={substrate}
            onSubstrate={setSubstrate}
            light={light}
            onLight={setLight}
            onSnapshot={() => void snapshot()}
            onGlb={Platform.OS === 'web' ? () => void glb() : undefined}
          />
        ) : mode === 'impose' && impose.result ? (
          <View style={styles.stats}>
            <Stat label={`${impose.result.layout.cols}×${impose.result.layout.rows}${impose.result.layout.mixedCopies ? `+${impose.result.layout.mixedCopies}` : ''}`} />
            <Stat label={t('editor.upOnSheet', { n: impose.result.layout.copies })} />
            <Stat label={t('editor.cut', { n: impose.result.layout.cutLength.toFixed(0) })} />
          </View>
        ) : stats ? (
          <View style={styles.stats}>
            <Stat label={`${t('editor.flatLabel')} ${units.toDisplay(stats.flatWidth).toFixed(units.unit === 'in' ? 2 : 1)} × ${units.format(stats.flatHeight)}`} />
            <Stat label={`${t('editor.legendCut')} ${units.format(stats.cutLength, 0)}`} />
            <Stat label={`${t('editor.legendCrease')} ${units.format(stats.creaseLength, 0)}`} />
            {mode === '2d' ? <DielineLegend labels={{ cut: t('editor.legendCut'), crease: t('editor.legendCrease') }} /> : null}
            {mode === '2d' ? (
              <ScalePressable accessibilityRole="switch" accessibilityState={{ checked: showDims }} onPress={() => setShowDims((v) => !v)} style={styles.dimToggle}>
                <Icon name="maximize-2" size={13} color={showDims ? colors.accent : colors.muted} />
                <Text variant="smallStrong" color={showDims ? colors.accent : colors.muted}>
                  {t('editor.dims')}
                </Text>
              </ScalePressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  )
}

const Stat = ({ label }: { label: string }) => (
  <Text variant="mono" tone="soft">
    {label}
  </Text>
)

const styles = StyleSheet.create({
  stage: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, justifyContent: 'space-between' },
  viewport: { flex: 1, minHeight: 200 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  gate: { padding: 24, borderRadius: radius.xl, gap: 8, alignItems: 'center', maxWidth: 420 },
  busy: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  footer: { borderTopWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: 14, paddingVertical: 10, minHeight: 48, justifyContent: 'center' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 6 },
  dimToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
})
