import { BarChart3, BookOpen, Settings2, TrendingUp } from 'lucide-react'

import type { ActiveView, NavItem } from '../../types/app'

type BottomNavProps = {
  activeView: ActiveView
  navigationItems: NavItem[]
  onNavigate: (view: ActiveView) => void
}

export function BottomNav({ activeView, navigationItems, onNavigate }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="底部主导航">
      {navigationItems.map((item) => {
        const icon =
          item.id === 'dashboard' ? (
            <BarChart3 size={20} aria-hidden="true" />
          ) : item.id === 'journal' ? (
            <BookOpen size={20} aria-hidden="true" />
          ) : item.id === 'summary' ? (
            <TrendingUp size={20} aria-hidden="true" />
          ) : (
            <Settings2 size={20} aria-hidden="true" />
          )

        return (
          <button
            className={`bottom-nav-item ${activeView === item.id ? 'bottom-nav-item-active' : ''}`}
            type="button"
            key={item.id}
            aria-current={activeView === item.id ? 'page' : undefined}
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
