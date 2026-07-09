import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastState = {
  id: number
  message: string
  tone: 'success' | 'error' | 'info'
  actionLabel?: string
  onAction?: () => void
}

type ToastOptions = {
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}

export const useToast = () => {
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const showToast = useCallback((message: string, tone: ToastState['tone'] = 'info', options: ToastOptions = {}) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }

    setToast({
      id: Date.now(),
      message,
      tone,
      actionLabel: options.actionLabel,
      onAction: options.onAction,
    })

    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, options.durationMs ?? 3600)
  }, [])

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }
    },
    [],
  )

  return { toast, setToast, showToast }
}
