/**
 * Web: tekerlek olayı yakınlaştırmaya mı, sayfa kaydırmaya mı ait?
 * Kaydırılabilir bir sayfanın içindeki tuval tekerleği yalnız Ctrl/⌘ (ve trackpad
 * sıkıştırması, tarayıcı bunu ctrlKey ile gönderir) ile yakalar; aksi halde sayfa kayar.
 */
export const hasScrollableAncestor = (el: HTMLElement): boolean => {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight + 1) return true
  }
  return false
}

export const wheelZooms = (e: WheelEvent, el: HTMLElement): boolean => e.ctrlKey || e.metaKey || !hasScrollableAncestor(el)
