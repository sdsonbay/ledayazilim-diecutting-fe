import { Redirect } from 'expo-router'

/** Eski bağlantılar: içe aktarma artık Stüdyo'nun "Dosyadan" modu. */
export default function ImportRedirect() {
  return <Redirect href={{ pathname: '/studio', params: { source: 'file' } }} />
}
