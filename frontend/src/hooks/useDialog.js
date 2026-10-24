import { useEffect, useRef } from 'react'
let originalOverflow = ''
const stack = []

// Reference-counted scroll lock and a focus trap for the topmost dialog.
export function useDialog(open, onClose) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const token = Symbol('dialog')
    const previous = document.activeElement
    if (!stack.length) { originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
    stack.push(token)
    const frame = requestAnimationFrame(() => ref.current?.querySelector('input, button, select, [tabindex="0"]')?.focus())
    const onKey = event => {
      if (stack.at(-1) !== token) return
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.(); return }
      if (event.key !== 'Tab' || !ref.current) return
      const nodes = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(node => node.getClientRects().length > 0)
      const first = nodes[0], last = nodes.at(-1)
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame); document.removeEventListener('keydown', onKey)
      const index = stack.indexOf(token)
      if (index >= 0) stack.splice(index, 1)
      if (!stack.length) document.body.style.overflow = originalOverflow
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [open])
  return ref
}
