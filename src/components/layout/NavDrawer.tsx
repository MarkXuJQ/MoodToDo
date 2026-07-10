import { BarChart3, BookOpen, Flower2, ListTodo, PanelLeftClose, PanelLeftOpen, Settings, TrendingUp } from 'lucide-react'

import type { ActiveView, NavItem } from '../../types/app'

type NavDrawerProps = {
  isDesktop: boolean
  isOpen: boolean
  isCollapsed: boolean
  activeView: ActiveView
  navigationItems: NavItem[]
  onClose: () => void
  onNavigate: (view: ActiveView) => void
  onToggleCollapse: () => void
}

export function NavDrawer({
  isDesktop,
  isOpen,
  isCollapsed,
  activeView,
  navigationItems,
  onClose,
  onNavigate,
  onToggleCollapse,
}: NavDrawerProps) {
  const compact = isDesktop && isCollapsed
  const primaryItems = orderDesktopNavigationItems(navigationItems.filter((item) => item.id !== 'settings'))
  const settingsItem = navigationItems.find((item) => item.id === 'settings')

  return (
    <>
      {!isDesktop && isOpen && <button className="nav-backdrop" type="button" aria-label="关闭菜单" onClick={onClose} />}

      <aside className={`nav-drawer ${isOpen ? 'nav-drawer-open' : ''} ${compact ? 'nav-drawer-collapsed' : ''}`} aria-label="主菜单">
        <div className="nav-drawer-head">
          <div className="nav-head-copy">
            {!compact ? (
              <>
                <p className="eyebrow">Navigation</p>
                <strong className="text-lg font-black text-ink-950">切换工作区</strong>
              </>
            ) : null}
          </div>

          {isDesktop && (
            <button
              className={`nav-collapse-button ${compact ? 'nav-collapse-button-compact' : ''}`}
              type="button"
              aria-label={compact ? '展开侧栏' : '收起侧栏'}
              aria-expanded={!compact}
              onClick={onToggleCollapse}
            >
              {compact ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
            </button>
          )}
        </div>

        <nav className="nav-list">
          {primaryItems.map((item) => {
            const isGameEntry = item.id === 'garden'
            const icon =
              item.id === 'dashboard' ? (
                <BarChart3 size={18} aria-hidden="true" />
              ) : item.id === 'journal' ? (
                <BookOpen size={18} aria-hidden="true" />
              ) : item.id === 'board' ? (
                <ListTodo size={18} aria-hidden="true" />
              ) : item.id === 'garden' ? (
                <Flower2 size={18} aria-hidden="true" />
              ) : item.id === 'summary' ? (
                <TrendingUp size={18} aria-hidden="true" />
              ) : (
                <Settings size={18} aria-hidden="true" />
              )

            return (
              <button
                className={`nav-link ${isGameEntry ? 'nav-link-game' : ''} ${activeView === item.id ? 'nav-link-active' : ''} ${compact ? 'nav-link-compact' : ''}`}
                type="button"
                key={item.id}
                aria-label={item.label}
                title={compact ? item.label : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <span className="nav-link-icon">{icon}</span>
                {!compact && (
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-black text-ink-950">{item.label}</strong>
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {settingsItem && (
          <div className="nav-settings-slot">
            <button
              className={`nav-settings-button ${activeView === 'settings' ? 'nav-settings-button-active' : ''} ${compact ? 'nav-settings-button-compact' : ''}`}
              type="button"
              aria-label={settingsItem.label}
              title={compact ? settingsItem.label : undefined}
              onClick={() => onNavigate('settings')}
            >
              <span className="nav-link-icon">
                <Settings size={18} aria-hidden="true" />
              </span>
              {!compact && <span className="font-black text-ink-950">{settingsItem.label}</span>}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

function orderDesktopNavigationItems(primaryItems: NavItem[]) {
  const gardenItem = primaryItems.find((item) => item.id === 'garden')

  if (!gardenItem) return primaryItems

  return [
    gardenItem,
    ...primaryItems.filter((item) => item.id !== 'garden'),
  ]
}
