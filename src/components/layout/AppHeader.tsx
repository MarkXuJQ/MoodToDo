import {
  CalendarDays,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  MapPin,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  type LucideIcon,
} from 'lucide-react'

type AppHeaderProps = {
  isDesktopNav: boolean
  todayLabel: string
  activeViewLabel: string
  locationLabel: string
  weatherText: string
  isWeatherLoading: boolean
  isWebDavSyncing: boolean
  onRefreshWeather: () => void
  onSyncWebDav: () => void
  onOpenSettings: () => void
}

const getWeatherIcon = (weatherText: string): LucideIcon => {
  if (/雷/.test(weatherText)) return CloudLightning
  if (/雪|冰|冻/.test(weatherText)) return CloudSnow
  if (/雨|毛毛|阵雨/.test(weatherText)) return CloudRain
  if (/雾|霾/.test(weatherText)) return CloudFog
  if (/阴|云/.test(weatherText)) return Cloud
  if (/夜/.test(weatherText)) return Moon
  if (/晴/.test(weatherText)) return Sun

  return CloudSun
}

export function AppHeader({
  isDesktopNav,
  todayLabel,
  activeViewLabel,
  locationLabel,
  weatherText,
  isWeatherLoading,
  isWebDavSyncing,
  onRefreshWeather,
  onSyncWebDav,
  onOpenSettings,
}: AppHeaderProps) {
  const WeatherIcon = getWeatherIcon(weatherText)

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
              <button
                className="context-pill context-action-pill"
                type="button"
                disabled={isWeatherLoading}
                aria-label="刷新定位和天气"
                title="刷新定位和天气"
                onClick={onRefreshWeather}
              >
                {isWeatherLoading ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <MapPin size={16} aria-hidden="true" />}
                {locationLabel}
              </button>
              <button
                className="context-pill context-action-pill"
                type="button"
                disabled={isWeatherLoading}
                aria-label="刷新天气"
                title="刷新天气"
                onClick={onRefreshWeather}
              >
                {isWeatherLoading ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <WeatherIcon size={16} aria-hidden="true" />}
                {weatherText}
              </button>
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
