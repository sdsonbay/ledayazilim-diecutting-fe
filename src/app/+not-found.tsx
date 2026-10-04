import { router } from 'expo-router'
import { View } from 'react-native'
import { Button, EmptyState } from '../components/ui'
import { useI18n } from '../i18n/LocaleContext'
import { useTheme } from '../theme/ThemeContext'

export default function NotFound() {
  const { colors } = useTheme()
  const { t } = useI18n()
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24 }}>
      <EmptyState icon="compass" title={t('notFound.title')} body={t('notFound.body')} action={<Button label={t('notFound.home')} onPress={() => router.replace('/')} />} />
    </View>
  )
}
