import { CalendarDays, LocateFixed, MapPin, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'

type AppHeaderProps = {
  isDesktopNav: boolean
  isNavOpen: boolean
  isNavCollapsed: boolean
  todayLabel: string
  activeViewLabel: string
  locationLabel: string
  weatherText: string
  onToggleNav: () => void
}

export function AppHeader({
  isDesktopNav,
  isNavOpen,
  isNavCollapsed,
  todayLabel,
  activeViewLabel,
  locationLabel,
  weatherText,
  onToggleNav,
}: AppHeaderProps) {
  const toggleLabel = isDesktopNav ? (isNavCollapsed ? '展开侧栏' : '收起侧栏') : isNavOpen ? '关闭菜单' : '打开菜单'

  return (
    <header className="topbar">
      <div className="topbar-main">
        <div className="topbar-brand">
          <button
            className="icon-button"
            type="button"
            aria-label={toggleLabel}
            aria-expanded={isDesktopNav ? !isNavCollapsed : isNavOpen}
            onClick={onToggleNav}
          >
            {isDesktopNav ? (
              isNavCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />
            ) : isNavOpen ? (
              <X size={18} aria-hidden="true" />
            ) : (
              <Menu size={18} aria-hidden="true" />
            )}
          </button>
          <div className="topbar-copy">
            <strong className="topbar-appname">{activeViewLabel}</strong>
          </div>
        </div>

        <div className="topbar-context" aria-label="今日环境">
          <span className="context-pill">
            <CalendarDays size={16} aria-hidden="true" />
            {todayLabel}
          </span>
          <span className="context-pill">
            <MapPin size={16} aria-hidden="true" />
            {locationLabel}
          </span>
          <span className="context-pill">
            <LocateFixed size={16} aria-hidden="true" />
            {weatherText}
          </span>
        </div>
      </div>
    </header>
  )
}
