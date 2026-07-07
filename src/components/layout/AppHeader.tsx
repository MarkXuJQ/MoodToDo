import { CalendarDays, Cloud, LocateFixed, MapPin, RefreshCw, Settings } from 'lucide-react'

type AppHeaderProps = {
  isDesktopNav: boolean
  todayLabel: string
  activeViewLabel: string
  locationLabel: string
  weatherText: string
  isWebDavSyncing: boolean
  onSyncWebDav: () => void
  onOpenSettings: () => void
}

export function AppHeader({
  isDesktopNav,
  todayLabel,
  activeViewLabel,
  locationLabel,
  weatherText,
  isWebDavSyncing,
  onSyncWebDav,
  onOpenSettings,
}: AppHeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar-main">
        <div className="topbar-brand">
          <div className="topbar-copy">
            <strong className="topbar-appname">{activeViewLabel}</strong>
          </div>
        </div>

        {!isDesktopNav && (
          <div className="mobile-topbar-actions">
            <button className="icon-button mobile-cloud-button" type="button" aria-label="同步到云端" disabled={isWebDavSyncing} onClick={onSyncWebDav}>
              <Cloud size={18} aria-hidden="true" />
            </button>
            <button className="icon-button mobile-settings-button" type="button" aria-label="打开设置" onClick={onOpenSettings}>
              <Settings size={18} aria-hidden="true" />
            </button>
          </div>
        )}

        {isDesktopNav && (
          <div className="topbar-context-group">
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
            <button className="button-secondary topbar-sync-button" type="button" disabled={isWebDavSyncing} onClick={onSyncWebDav}>
              {isWebDavSyncing ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Cloud size={16} aria-hidden="true" />}
              同步
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
