import { useEffect, useRef, useState } from 'react'
import { BarChart3, BookOpen, Flower2, ListTodo, TrendingUp } from 'lucide-react'

import type { ActiveView, NavItem } from '../../types/app'

type BottomNavProps = {
  activeView: ActiveView
  navigationItems: NavItem[]
  onNavigate: (view: ActiveView) => void
}

export function BottomNav({ activeView, navigationItems, onNavigate }: BottomNavProps) {
  const primaryItems = orderBottomNavigationItems(navigationItems)
  const [gamePressPhase, setGamePressPhaseState] = useState<'idle' | 'pressing' | 'releasing'>('idle')
  const gamePressPhaseRef = useRef(gamePressPhase)
  const releaseTimerRef = useRef<number | null>(null)

  const setGamePressPhase = (phase: 'idle' | 'pressing' | 'releasing') => {
    gamePressPhaseRef.current = phase
    setGamePressPhaseState(phase)
  }

  const clearReleaseTimer = () => {
    if (releaseTimerRef.current == null) return

    window.clearTimeout(releaseTimerRef.current)
    releaseTimerRef.current = null
  }

  const beginGamePress = () => {
    clearReleaseTimer()
    setGamePressPhase('pressing')
  }

  const releaseGamePress = () => {
    if (gamePressPhaseRef.current !== 'pressing') return

    clearReleaseTimer()
    setGamePressPhase('releasing')
    releaseTimerRef.current = window.setTimeout(() => {
      releaseTimerRef.current = null
      setGamePressPhase('idle')
    }, 280)
  }

  useEffect(() => clearReleaseTimer, [])

  return (
    <nav className="bottom-nav" aria-label="底部主导航" style={{ gridTemplateColumns: `repeat(${primaryItems.length}, minmax(0, 1fr))` }}>
      {primaryItems.map((item) => {
        const isActive = activeView === item.id
        const isGameEntry = item.id === 'garden'
        const icon =
          item.id === 'dashboard' ? (
            <BarChart3 size={20} aria-hidden="true" />
          ) : item.id === 'journal' ? (
            <BookOpen size={20} aria-hidden="true" />
          ) : item.id === 'board' ? (
            <ListTodo size={20} aria-hidden="true" />
          ) : item.id === 'garden' ? (
            <Flower2 size={24} aria-hidden="true" />
          ) : (
            <TrendingUp size={20} aria-hidden="true" />
          )

        return (
          <button
            className={`bottom-nav-item ${isGameEntry ? `bottom-nav-game-item bottom-nav-game-item-${gamePressPhase}` : ''} ${isActive ? 'bottom-nav-item-active' : ''}`}
            type="button"
            key={item.id}
            aria-current={isActive ? 'page' : undefined}
            aria-label={item.label}
            onBlur={isGameEntry ? releaseGamePress : undefined}
            onClick={() => onNavigate(item.id)}
            onKeyDown={isGameEntry ? (event) => {
              if (event.key === ' ' || event.key === 'Enter') beginGamePress()
            } : undefined}
            onKeyUp={isGameEntry ? (event) => {
              if (event.key === ' ' || event.key === 'Enter') releaseGamePress()
            } : undefined}
            onPointerCancel={isGameEntry ? releaseGamePress : undefined}
            onPointerDown={isGameEntry ? beginGamePress : undefined}
            onPointerLeave={isGameEntry ? releaseGamePress : undefined}
            onPointerUp={isGameEntry ? releaseGamePress : undefined}
          >
            {icon}
            <span>{isGameEntry ? '花园' : item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function orderBottomNavigationItems(navigationItems: NavItem[]) {
  const primaryItems = navigationItems.filter((item) => item.id !== 'settings')
  const gardenItem = primaryItems.find((item) => item.id === 'garden')

  if (!gardenItem) return primaryItems

  const otherItems = primaryItems.filter((item) => item.id !== 'garden')
  const centerIndex = Math.floor(primaryItems.length / 2)

  return [
    ...otherItems.slice(0, centerIndex),
    gardenItem,
    ...otherItems.slice(centerIndex),
  ]
}
