import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, getToken, setToken } from '../lib/api'
import type { Session } from '../lib/types'

interface AuthValue {
  session: Session | null
  ready: boolean
  loggedIn: boolean
  login: (email: string, password: string) => Promise<void>
  register: (input: { email: string; password: string; name?: string }) => Promise<void>
  logout: () => void
  setCredits: (credits: number) => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

const emptyGuest = (): Session => ({ user: null, credits: 3, plan: 'guest', guest: true })

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const next = await api.session()
      // Süresi dolmuş / geçersiz token: sunucu misafir döndürür; cihazdaki token'ı da bırak.
      if (!next.user && getToken()) {
        setToken(null)
        queryClient.removeQueries({ queryKey: ['me'] })
      }
      setSession(next)
    } catch {
      setSession((current) => current ?? emptyGuest())
    } finally {
      setReady(true)
    }
  }, [queryClient])

  useEffect(() => {
    // Açılışta oturumu sunucudan al (state güncellemesi istek bitince, asenkron).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  const accept = useCallback(
    (result: { token: string; session: Session }) => {
      setToken(result.token)
      setSession(result.session)
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
    [queryClient],
  )

  const login = useCallback(async (email: string, password: string) => accept(await api.login(email, password)), [accept])

  const register = useCallback(
    async (input: { email: string; password: string; name?: string }) => accept(await api.register(input)),
    [accept],
  )

  const logout = useCallback(() => {
    setToken(null)
    queryClient.removeQueries({ queryKey: ['me'] })
    void refresh()
  }, [queryClient, refresh])

  const setCredits = useCallback((credits: number) => {
    setSession((current) => (current ? { ...current, credits } : current))
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ session, ready, loggedIn: Boolean(session?.user), login, register, logout, setCredits, refresh }),
    [session, ready, login, register, logout, setCredits, refresh],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthValue => {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider gerekli')
  return value
}
