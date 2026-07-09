import { useEffect, useState } from 'react'

const navCollapseStorageKey = 'xinxiangyi-nav-collapsed-v1'
const desktopNavMediaQuery = '(min-width: 1024px), (orientation: landscape) and (min-width: 900px) and (min-height: 560px)'

const getDesktopNavMode = () => window.matchMedia(desktopNavMediaQuery).matches

export const useResponsiveNav = () => {
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [isNavCollapsed, setIsNavCollapsed] = useState(() => window.localStorage.getItem(navCollapseStorageKey) === '1')
  const [isDesktopNav, setIsDesktopNav] = useState(getDesktopNavMode)

  useEffect(() => {
    const mediaQuery = window.matchMedia(desktopNavMediaQuery)
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      const matches = 'matches' in event ? event.matches : mediaQuery.matches
      setIsDesktopNav(matches)

      if (matches) {
        setIsNavOpen(false)
      }
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
    window.localStorage.setItem(navCollapseStorageKey, isNavCollapsed ? '1' : '0')
  }, [isNavCollapsed])

  return {
    isDesktopNav,
    isNavCollapsed,
    isNavOpen,
    setIsNavCollapsed,
    setIsNavOpen,
  }
}
