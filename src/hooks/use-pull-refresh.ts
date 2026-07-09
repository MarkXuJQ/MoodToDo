import { useCallback, useRef, useState, type RefObject, type TouchEvent } from 'react'

type PullRefreshOptions<T extends HTMLElement> = {
  contentShellRef: RefObject<T | null>
  isDesktopNav: boolean
  onRefresh: () => Promise<unknown> | unknown
}

export const usePullRefresh = <T extends HTMLElement>({
  contentShellRef,
  isDesktopNav,
  onRefresh,
}: PullRefreshOptions<T>) => {
  const pullStartYRef = useRef<number | null>(null)
  const pullDistanceRef = useRef(0)
  const [pullRefreshDistance, setPullRefreshDistance] = useState(0)
  const [isPullRefreshing, setIsPullRefreshing] = useState(false)

  const getActiveScrollTop = useCallback(() => {
    if (isDesktopNav) {
      return contentShellRef.current?.scrollTop ?? 0
    }

    return window.scrollY
  }, [contentShellRef, isDesktopNav])

  const handlePullRefreshStart = useCallback((event: TouchEvent<T>) => {
    if (event.touches.length !== 1 || getActiveScrollTop() > 0) {
      pullStartYRef.current = null
      return
    }

    pullStartYRef.current = event.touches[0]?.clientY ?? null
    pullDistanceRef.current = 0
  }, [getActiveScrollTop])

  const handlePullRefreshMove = useCallback((event: TouchEvent<T>) => {
    const startY = pullStartYRef.current

    if (startY == null || isPullRefreshing || getActiveScrollTop() > 0) return

    const nextY = event.touches[0]?.clientY ?? startY
    const delta = nextY - startY

    if (delta <= 0) {
      pullDistanceRef.current = 0
      setPullRefreshDistance(0)
      return
    }

    const distance = Math.min(96, delta * 0.45)
    pullDistanceRef.current = distance
    setPullRefreshDistance(distance)

    if (distance > 8) {
      event.preventDefault()
    }
  }, [getActiveScrollTop, isPullRefreshing])

  const handlePullRefreshEnd = useCallback(() => {
    const distance = pullDistanceRef.current

    pullStartYRef.current = null
    pullDistanceRef.current = 0

    if (distance < 64 || isPullRefreshing) {
      setPullRefreshDistance(0)
      return
    }

    setIsPullRefreshing(true)
    setPullRefreshDistance(72)

    void Promise.resolve(onRefresh()).finally(() => {
      setIsPullRefreshing(false)
      setPullRefreshDistance(0)
    })
  }, [isPullRefreshing, onRefresh])

  return {
    isPullRefreshing,
    pullRefreshDistance,
    pullRefreshHandlers: {
      onTouchCancel: handlePullRefreshEnd,
      onTouchEnd: handlePullRefreshEnd,
      onTouchMove: handlePullRefreshMove,
      onTouchStart: handlePullRefreshStart,
    },
  }
}
