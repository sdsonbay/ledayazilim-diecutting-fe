/** Web: data URI'yi dosya olarak indirir. */
export async function shareImage(uri: string, filename: string): Promise<void> {
  const a = document.createElement('a')
  a.href = uri
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
