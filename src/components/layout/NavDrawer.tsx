import { BarChart3, BookOpen, Settings2, TrendingUp } from 'lucide-react'

import type { ActiveView, NavItem } from '../../types/app'

type NavDrawerProps = {
  isDesktop: boolean
  isOpen: boolean
  isCollapsed: boolean
  activeView: ActiveView
  navigationItems: NavItem[]
  onClose: () => void
  onNavigate: (view: ActiveView) => void
  onOpenJournalBoard: () => void
  onOpenSettingsOverview: () => void
  onOpenSettingsAi: () => void
}

export function NavDrawer({
  isDesktop,
  isOpen,
  isCollapsed,
  activeView,
  navigationItems,
  onClose,
  onNavigate,
  onOpenJournalBoard,
  onOpenSettingsOverview,
  onOpenSettingsAi,
}: NavDrawerProps) {
  const compact = isDesktop && isCollapsed

  return (
    <>
      {!isDesktop && isOpen && <button className="nav-backdrop" type="button" aria-label="关闭菜单" onClick={onClose} />}

      <aside className={`nav-drawer ${isOpen ? 'nav-drawer-open' : ''} ${compact ? 'nav-drawer-collapsed' : ''}`} aria-label="主菜单">
        <div className="nav-drawer-head">
          {!compact ? (
            <>
              <p className="eyebrow">Navigation</p>
              <strong className="text-lg font-black text-ink-950">切换工作区</strong>
            </>
          ) : (
            <strong className="text-sm font-black text-ink-400">导航</strong>
          )}
        </div>

        <nav className="nav-list">
          {navigationItems.map((item) => {
            const icon =
              item.id === 'dashboard' ? (
                <BarChart3 size={18} aria-hidden="true" />
              ) : item.id === 'journal' ? (
                <BookOpen size={18} aria-hidden="true" />
              ) : item.id === 'summary' ? (
                <TrendingUp size={18} aria-hidden="true" />
              ) : (
                <Settings2 size={18} aria-hidden="true" />
              )

            return (
              <button
                className={`nav-link ${activeView === item.id ? 'nav-link-active' : ''} ${compact ? 'nav-link-compact' : ''}`}
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
                    <small className="block truncate text-xs font-bold text-ink-400">{item.note}</small>
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {!compact && (
          <div className="nav-shortcuts">
            <p className="nav-shortcuts-title">常用捷径</p>
            <button className="nav-sub-link" type="button" onClick={onOpenJournalBoard}>
              直接打开 Todo 看板
            </button>
            <button className="nav-sub-link" type="button" onClick={onOpenSettingsOverview}>
              查看系统总览
            </button>
            <button className="nav-sub-link" type="button" onClick={onOpenSettingsAi}>
              配置周总结模型
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
