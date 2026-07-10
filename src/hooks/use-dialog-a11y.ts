import { useEffect, useRef } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const getFocusableElements = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
  )

export const useDialogA11y = <T extends HTMLElement>(isOpen: boolean, onClose: () => void) => {
  const dialogRef = useRef<T | null>(null)
  const closeRef = useRef(onClose)
  const previousFocusRef = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const rememberExternalFocus = (event: FocusEvent) => {
      const target = event.target

      if (target instanceof HTMLElement && !dialogRef.current?.contains(target)) {
        previousFocusRef.current = target
      }
    }

    document.addEventListener('focusin', rememberExternalFocus)

    return () => document.removeEventListener('focusin', rememberExternalFocus)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const container = dialogRef.current
    if (!container) return

    const focusInitialElement = window.requestAnimationFrame(() => {
      const preferred = container.querySelector<HTMLElement>('[data-dialog-initial-focus]')
      const firstFocusable = getFocusableElements(container)[0]

      ;(preferred ?? firstFocusable ?? container).focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = getFocusableElements(container)
      if (focusable.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }

      const first = focusable[0]
      const last = focusable.at(-1) ?? first
      const active = document.activeElement

      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    const keepFocusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !container.contains(event.target)) {
        ;(getFocusableElements(container)[0] ?? container).focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusin', keepFocusInside, true)

    return () => {
      window.cancelAnimationFrame(focusInitialElement)
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusin', keepFocusInside, true)
      window.requestAnimationFrame(() => {
        if (previousFocusRef.current?.isConnected) {
          previousFocusRef.current.focus()
        }
      })
    }
  }, [isOpen])

  return dialogRef
}
