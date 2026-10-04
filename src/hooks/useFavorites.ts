import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useFeedback } from '../components/ui'
import { apiErrorMessage } from '../i18n/errors'
import { useI18n } from '../i18n/LocaleContext'
import { api } from '../lib/api'

/** Favoriler: iyimser güncelleme; misafir dokunursa girişe yönlenir. */
export function useFavorites() {
  const { loggedIn, session } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useFeedback()
  const { t, locale } = useI18n()
  const key = ['me', 'favorites', session?.user?.id]

  const query = useQuery({ queryKey: key, queryFn: api.favorites, enabled: loggedIn })
  const ids = useMemo(() => new Set(query.data ?? []), [query.data])

  const mutation = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => (on ? api.addFavorite(id) : api.removeFavorite(id)),
    onMutate: async ({ id, on }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<string[]>(key) ?? []
      queryClient.setQueryData<string[]>(key, on ? [id, ...previous.filter((x) => x !== id)] : previous.filter((x) => x !== id))
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx) queryClient.setQueryData(key, ctx.previous)
      toast(apiErrorMessage(err, locale, 'editor.favFail', t), 'error')
    },
    onSuccess: (items) => queryClient.setQueryData(key, items),
  })

  const toggle = (id: string) => {
    if (!loggedIn) {
      router.push('/auth/login')
      return
    }
    mutation.mutate({ id, on: !ids.has(id) })
  }

  return { ids, list: query.data ?? [], toggle, loading: query.isLoading }
}
