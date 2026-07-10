import { BarChart3, BookOpen, Flower2, ListTodo, TrendingUp } from 'lucide-react'

import type { ActiveView, NavItem } from '../../types/app'

type BottomNavProps = {
  activeView: ActiveView
  navigationItems: NavItem[]
  onNavigate: (view: ActiveView) => void
}

export function BottomNav({ activeView, navigationItems, onNavigate }: BottomNavProps) {
  const primaryItems = navigationItems.filter((item) => item.id !== 'settings')

  return (
    <nav className="bottom-nav" aria-label="底部主导航" style={{ gridTemplateColumns: `repeat(${primaryItems.length}, minmax(0, 1fr))` }}>
      {primaryItems.map((item) => {
        const isActive = activeView === item.id
        const icon =
          item.id === 'dashboard' ? (
            <BarChart3 size={20} aria-hidden="true" />
          ) : item.id === 'journal' ? (
            <BookOpen size={20} aria-hidden="true" />
          ) : item.id === 'board' ? (
            <ListTodo size={20} aria-hidden="true" />
          ) : item.id === 'garden' ? (
            <Flower2 size={20} aria-hidden="true" />
          ) : (
            <TrendingUp size={20} aria-hidden="true" />
          )

        return (
          <button
            className={`bottom-nav-item ${isActive ? 'bottom-nav-item-active' : ''}`}
            style={{
              backgroundColor: isActive ? 'var(--color-xin-100)' : 'transparent',
              color: isActive ? 'var(--color-xin-800)' : 'var(--color-ink-400)',
            }}
            type="button"
            key={item.id}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {icon}
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
