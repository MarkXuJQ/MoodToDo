import {
  CalendarDays,
  Cloud,
  RefreshCw,
  Settings,
} from 'lucide-react'

type AppHeaderProps = {
  isDesktopNav: boolean
  todayLabel: string
  activeViewLabel: string
  isWebDavSyncing: boolean
  onSyncWebDav: () => void
  onOpenSettings: () => void
}

export function AppHeader({
  isDesktopNav,
  todayLabel,
  activeViewLabel,
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
            <div className="topbar-context" aria-label="今日日期">
              <span className="context-pill">
                <CalendarDays size={16} aria-hidden="true" />
                {todayLabel}
              </span>
            </div>
            <button
              className="icon-button topbar-sync-button"
              type="button"
              aria-label={isWebDavSyncing ? '正在同步' : '同步到云端'}
              title={isWebDavSyncing ? '正在同步' : '同步到云端'}
              disabled={isWebDavSyncing}
              onClick={onSyncWebDav}
            >
              {isWebDavSyncing ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Cloud size={16} aria-hidden="true" />}
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
