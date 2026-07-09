import { useCallback, useEffect, useState } from 'react'

import { readThemeMode, themeModeStorageKey } from '../config/app-shell'
import type { ThemeMode } from '../types/app'

const getSystemThemeMode = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

export const useThemeMode = () => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => readThemeMode())
  const [systemThemeMode, setSystemThemeMode] = useState<'light' | 'dark'>(() => getSystemThemeMode())
  const resolvedThemeMode = themeMode === 'system' ? systemThemeMode : themeMode

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      const matches = 'matches' in event ? event.matches : mediaQuery.matches
      setSystemThemeMode(matches ? 'dark' : 'light')
    }

    handleChange(mediaQuery)

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedThemeMode
    document.documentElement.dataset.themeMode = themeMode
  }, [resolvedThemeMode, themeMode])

  const setThemeMode = useCallback((next: ThemeMode) => {
    setThemeModeState(next)
    window.localStorage.setItem(themeModeStorageKey, next)
  }, [])

  return {
    resolvedThemeMode,
    setThemeMode,
    themeMode,
  }
}
