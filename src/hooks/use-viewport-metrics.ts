import { useEffect } from 'react'

export const useViewportMetrics = () => {
  useEffect(() => {
    const updateViewportMetrics = () => {
      const viewport = window.visualViewport
      const width = Math.round(viewport?.width ?? window.innerWidth)
      const height = Math.round(viewport?.height ?? window.innerHeight)

      document.documentElement.style.setProperty('--app-viewport-width', `${width}px`)
      document.documentElement.style.setProperty('--app-viewport-height', `${height}px`)
    }

    updateViewportMetrics()
    window.addEventListener('resize', updateViewportMetrics)
    window.addEventListener('orientationchange', updateViewportMetrics)
    window.visualViewport?.addEventListener('resize', updateViewportMetrics)

    return () => {
      window.removeEventListener('resize', updateViewportMetrics)
      window.removeEventListener('orientationchange', updateViewportMetrics)
      window.visualViewport?.removeEventListener('resize', updateViewportMetrics)
    }
  }, [])
}
