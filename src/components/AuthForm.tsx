import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type TextInput } from 'react-native'
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../auth/AuthContext'
import { apiErrorMessage } from '../i18n/errors'
import { useI18n } from '../i18n/LocaleContext'
import { useTheme } from '../theme/ThemeContext'
import { radius } from '../theme/tokens'
import { DielineHero } from './DielineHero'
import { LogoMark } from './Logo'
import { Button, Icon, IconButton, Input, Text, useFeedback, useIsWide, type IconName } from './ui'

const close = () => (router.canGoBack() ? router.back() : router.replace('/'))

/** Giriş ve kayıt — geniş ekranda solda marka paneli, sağda form. */
export const AuthForm = ({ kind }: { kind: 'login' | 'register' }) => {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const { login, register } = useAuth()
  const { toast } = useFeedback()
  const insets = useSafeAreaInsets()
  const wide = useIsWide()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const passwordRef = useRef<TextInput>(null)
  const isRegister = kind === 'register'

  const submit = async () => {
    setError(null)
    if (isRegister && password !== password2) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setBusy(true)
    try {
      if (isRegister) await register({ email: email.trim(), password, name: name.trim() || undefined })
      else await login(email.trim(), password)
      toast(isRegister ? t('auth.gift') : t('auth.welcomeBack'), 'success')
      close()
    } catch (err) {
      setError(apiErrorMessage(err, locale, isRegister ? 'auth.registerFail' : 'auth.loginFail', t))
    } finally {
      setBusy(false)
    }
  }

  const perks: { icon: IconName; title: string; body: string }[] = [
    { icon: 'grid', title: t('auth.perk1Title'), body: t('auth.perk1Body') },
    { icon: 'download', title: t('auth.perk2Title'), body: t('auth.perk2Body') },
    { icon: 'gift', title: t('auth.perk3Title'), body: t('auth.perk3Body') },
  ]

  const form = (
    <Animated.View entering={FadeInUp.springify().damping(20)} style={[styles.form, wide ? styles.formWide : null]}>
      <View style={{ gap: 8, marginBottom: 8 }}>
        <LogoMark size={40} />
        <Text variant="display" style={{ marginTop: 12 }}>
          {isRegister ? t('auth.create') : t('auth.welcomeBack')}
        </Text>
        <Text variant="body" tone="muted">
          {isRegister ? t('auth.registerLead') : t('auth.loginLead')}
        </Text>
      </View>
      {isRegister ? (
        <Input label={t('auth.name')} value={name} onChangeText={setName} autoComplete="name" textContentType="name" icon="user" returnKeyType="next" />
      ) : null}
      <Input
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        icon="mail"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Input
        ref={passwordRef}
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={isRegister ? 'new-password' : 'current-password'}
        textContentType={isRegister ? 'newPassword' : 'password'}
        icon="lock"
        hint={isRegister ? t('error.password_too_short') : undefined}
        returnKeyType={isRegister ? 'next' : 'go'}
        onSubmitEditing={isRegister ? undefined : () => void submit()}
      />
      {isRegister ? (
        <Input
          label={t('auth.passwordAgain')}
          value={password2}
          onChangeText={setPassword2}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          icon="lock"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
      ) : null}
      {error ? (
        <Animated.View entering={FadeInDown} style={[styles.error, { backgroundColor: colors.dangerSoft }]}>
          <Icon name="alert-circle" size={16} color={colors.danger} />
          <Text variant="smallStrong" tone="danger" style={{ flex: 1 }}>
            {error}
          </Text>
        </Animated.View>
      ) : null}
      <Button
        label={busy ? (isRegister ? t('auth.registering') : t('auth.loggingIn')) : isRegister ? t('auth.submitRegister') : t('auth.submitLogin')}
        size="lg"
        full
        loading={busy}
        onPress={() => void submit()}
        style={{ marginTop: 6 }}
      />
      <View style={styles.switch}>
        <Text variant="small" tone="muted">
          {isRegister ? t('auth.hasAccount') : t('auth.noAccount')}
        </Text>
        <Button
          label={isRegister ? t('auth.submitLogin') : t('auth.gift')}
          variant="ghost"
          size="sm"
          onPress={() => router.replace(isRegister ? '/auth/login' : '/auth/register')}
        />
      </View>
    </Animated.View>
  )

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <View style={[styles.closeBtn, { top: insets.top + 10 }]}>
        <IconButton icon="x" label={t('common.close')} onPress={close} />
      </View>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {wide ? (
          <View style={[styles.fill, { flexDirection: 'row' }]}>
            <View style={[styles.brand, { backgroundColor: colors.primary }]}>
              <Animated.View entering={FadeInDown.springify().damping(20)} style={{ gap: 20, maxWidth: 460 }}>
                <Text variant="hero" tone="onPrimary">
                  {t('auth.headline')}
                </Text>
                <View style={{ opacity: 0.95 }}>
                  <DielineHero height={240} />
                </View>
                {perks.map((p, i) => (
                  <Animated.View key={p.title} entering={FadeInDown.delay(120 + i * 80).springify()} style={styles.perk}>
                    <View style={[styles.perkIcon, { backgroundColor: colors.accent }]}>
                      <Icon name={p.icon} size={16} color={colors.onAccent} />
                    </View>
                    <View>
                      <Text variant="bodyStrong" tone="onPrimary">
                        {p.title}
                      </Text>
                      <Text variant="small" color={colors.faint}>
                        {p.body}
                      </Text>
                    </View>
                  </Animated.View>
                ))}
              </Animated.View>
            </View>
            <ScrollView contentContainerStyle={styles.wideForm} keyboardShouldPersistTaps="handled">
              {form}
            </ScrollView>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 64, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
            {form}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  closeBtn: { position: 'absolute', right: 16, zIndex: 5 },
  form: { gap: 14, width: '100%' },
  formWide: { maxWidth: 420 },
  wideForm: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  brand: { flex: 1, padding: 56, justifyContent: 'center' },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  perkIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  error: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: radius.md },
  switch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, flexWrap: 'wrap' },
})
