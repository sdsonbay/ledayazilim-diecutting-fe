import { Image } from 'expo-image'
import { router } from 'expo-router'
import { memo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { useI18n } from '../i18n/LocaleContext'
import type { MessageKey } from '../i18n/messages'
import { previewUrl } from '../lib/api'
import type { TemplateSummary } from '../lib/types'
import { useTheme } from '../theme/ThemeContext'
import { fonts, motion, radius } from '../theme/tokens'
import { Badge, Icon, ScalePressable, Text } from './ui'

export const materialKey = (id: string): MessageKey | null =>
  id === 'carton' ? 'material.carton' : id === 'corrugated' ? 'material.corrugated' : id === 'hardboard' ? 'material.hardboard' : id === 'plastic' ? 'material.plastic' : null

export const TemplateCard = memo(function TemplateCard({
  item,
  favorited,
  onFavorite,
}: {
  item: TemplateSummary
  favorited: boolean
  onFavorite: (id: string) => void
}) {
  const { colors, scheme } = useTheme()
  const { t, label } = useI18n()
  const [hovered, setHovered] = useState(false)
  const zoom = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(hovered ? 1.06 : 1, motion.springSoft) }] }))
  const materials = item.materials.map((m) => (materialKey(m) ? t(materialKey(m) as MessageKey) : m)).join(' · ')
  const open = () => router.push({ pathname: '/template/[id]', params: { id: item.id } })

  return (
    <ScalePressable
      accessibilityRole="link"
      accessibilityLabel={label(item.name)}
      onPress={open}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      hoverLift
      scaleTo={0.98}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: hovered ? colors.lineStrong : colors.line }]}
    >
      <View style={[styles.preview, { backgroundColor: scheme === 'dark' ? '#0b0b0b' : '#ffffff' }]}>
        <Animated.View style={[StyleSheet.absoluteFill, zoom]}>
          <Image
            source={{ uri: previewUrl(item.id, scheme) }}
            style={styles.previewImage}
            contentFit="contain"
            transition={220}
            recyclingKey={`${item.id}-${scheme}`}
            accessibilityLabel={t('catalog.previewAlt', { name: label(item.name) })}
          />
        </Animated.View>
        <ScalePressable
          accessibilityRole="button"
          accessibilityLabel={favorited ? t('catalog.favRemove') : t('catalog.favAdd')}
          onPress={(e) => {
            e.stopPropagation?.()
            onFavorite(item.id)
          }}
          haptic
          scaleTo={0.8}
          hitSlop={8}
          style={[styles.fav, { backgroundColor: favorited ? colors.accent : colors.glass }]}
        >
          <Icon name="heart" size={14} color={favorited ? colors.onAccent : colors.inkSoft} />
        </ScalePressable>
        {(item.variations ?? 0) > 0 ? (
          <View style={styles.variations}>
            <Badge label={t('catalog.variations', { n: item.variations ?? 0 })} />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {label(item.categoryLabel)}
          {item.code ? ` · ${item.code}` : ''}
        </Text>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 16, letterSpacing: -0.3, lineHeight: 21 }} numberOfLines={2}>
          {label(item.name)}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={2}>
          {label(item.description)}
        </Text>
        <View style={styles.footer}>
          <Text variant="small" tone="soft" numberOfLines={1} style={{ flex: 1 }}>
            {materials}
          </Text>
          <Icon name="arrow-up-right" size={16} color={hovered ? colors.accent : colors.faint} />
        </View>
      </View>
    </ScalePressable>
  )
})

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden' },
  preview: { aspectRatio: 4 / 3, overflow: 'hidden' },
  previewImage: { position: 'absolute', top: 18, left: 18, right: 18, bottom: 18 },
  fav: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  variations: { position: 'absolute', left: 10, bottom: 10 },
  body: { padding: 14, gap: 5 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
})
