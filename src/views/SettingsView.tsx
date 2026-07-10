import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { ArrowLeft, BarChart3, ChevronDown, Cloud, Database, Monitor, Moon, RefreshCw, Settings2, SunMedium } from 'lucide-react'

import { Metric } from '../components/ui/stat-primitives'
import type { GameEngineSettings, GameEngineSnapshot } from '../lib/gameEngine'
import type { WebDavConnectionTestResult } from '../lib/db'
import type {
  AiConfig,
  CountdownTodoOption,
  DashboardCardConfig,
  DashboardCardId,
  DashboardMetricCard,
  DatabaseStatus,
  SettingsSection,
  SettingsSectionGroup,
  SettingsSectionOption,
  ThemeMode,
  WebDavConfig,
  WebDavTextConfigKey,
} from '../types/app'

type SettingsViewProps = {
  settingsSection: SettingsSection
  settingsSections: SettingsSectionOption[]
  settingsSectionGroups: SettingsSectionGroup[]
  isDesktopNav: boolean
  settingsMenuKey: number
  databaseStatus: DatabaseStatus
  entriesCount: number
  todosCount: number
  attachmentsCount: number
  weeklySummariesCount: number
  changesCount: number
  pendingChangeCount: number
  gameEngineSnapshot: GameEngineSnapshot
  gameEngineSettings: GameEngineSettings
  dashboardCards: DashboardCardConfig[]
  dashboardCardMetrics: DashboardMetricCard[]
  visibleDashboardCards: DashboardMetricCard[]
  countdownTodoOptions: CountdownTodoOption[]
  selectedCountdownTodoId: string
  aiConfig: AiConfig
  webDavConfig: WebDavConfig
  isTestingWebDav: boolean
  isWebDavSyncing: boolean
  isExportingSyncBundle: boolean
  webDavTestResult: WebDavConnectionTestResult | null
  themeMode: ThemeMode
  resolvedThemeMode: 'light' | 'dark'
  onSettingsSectionChange: (section: SettingsSection) => void
  onReload: () => void
  onToggleDashboardCard: (cardId: DashboardCardId) => void
  onAiConfigChange: (key: keyof AiConfig) => (event: ChangeEvent<HTMLInputElement>) => void
  onWebDavConfigChange: (key: WebDavTextConfigKey) => (event: ChangeEvent<HTMLInputElement>) => void
  onWebDavAutoSyncChange: (event: ChangeEvent<HTMLInputElement>) => void
  onCountdownTodoSelect: (todoId: string) => void
  onTestWebDavConnection: () => void
  onExportSyncBundle: () => void
  onRestoreWebDavSnapshot: () => void
  onReplaceWebDavSnapshot: () => void
  onThemeModeChange: (mode: ThemeMode) => void
  onSnapshotDaysChange: (event: ChangeEvent<HTMLInputElement>) => void
}

export function SettingsView({
  settingsSection,
  settingsSections,
  settingsSectionGroups,
  isDesktopNav,
  settingsMenuKey,
  databaseStatus,
  entriesCount,
  todosCount,
  attachmentsCount,
  weeklySummariesCount,
  changesCount,
  pendingChangeCount,
  gameEngineSnapshot,
  gameEngineSettings,
  dashboardCards,
  dashboardCardMetrics,
  visibleDashboardCards,
  countdownTodoOptions,
  selectedCountdownTodoId,
  aiConfig,
  webDavConfig,
  isTestingWebDav,
  isWebDavSyncing,
  isExportingSyncBundle,
  webDavTestResult,
  themeMode,
  resolvedThemeMode,
  onSettingsSectionChange,
  onReload,
  onToggleDashboardCard,
  onAiConfigChange,
  onWebDavConfigChange,
  onWebDavAutoSyncChange,
  onCountdownTodoSelect,
  onTestWebDavConnection,
  onExportSyncBundle,
  onRestoreWebDavSnapshot,
  onReplaceWebDavSnapshot,
  onThemeModeChange,
  onSnapshotDaysChange,
}: SettingsViewProps) {
  const activeSettingsItem = settingsSections.find((item) => item.id === settingsSection)
  const themeOptions: Array<{ id: ThemeMode; label: string; note: string; icon: typeof Monitor }> = [
    { id: 'system', label: '跟随系统', note: '随设备外观自动切换', icon: Monitor },
    { id: 'light', label: '日间', note: '明亮、轻量的记录环境', icon: SunMedium },
    { id: 'dark', label: '夜间', note: '低亮度，适合夜间整理', icon: Moon },
  ]
  const activeGroupId = useMemo(
    () => settingsSectionGroups.find((group) => group.items.some((item) => item.id === settingsSection))?.id ?? settingsSectionGroups[0]?.id ?? '',
    [settingsSection, settingsSectionGroups],
  )
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(settingsSectionGroups.map((group) => [group.id, group.id === activeGroupId])),
  )
  const [mobileSettingsLevel, setMobileSettingsLevel] = useState<'menu' | 'detail'>(isDesktopNav ? 'detail' : 'menu')

  useEffect(() => {
    if (!activeGroupId) return

    setExpandedGroups((current) => ({
      ...current,
      [activeGroupId]: true,
    }))
  }, [activeGroupId])

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }))
  }

  useEffect(() => {
    setMobileSettingsLevel(isDesktopNav ? 'detail' : 'menu')
  }, [isDesktopNav, settingsMenuKey])

  const handleSettingsSectionChange = (section: SettingsSection) => {
    onSettingsSectionChange(section)
    if (!isDesktopNav) {
      setMobileSettingsLevel('detail')
    }
  }

  const showMobileMenu = !isDesktopNav && mobileSettingsLevel === 'menu'
  const settingsIntro = showMobileMenu ? '选择一个设置项继续调整。' : activeSettingsItem?.note

  return (
    <section className="py-3 sm:py-5" aria-labelledby="settings-title">
      {!isDesktopNav && mobileSettingsLevel === 'detail' && (
        <button className="settings-back-button" type="button" onClick={() => setMobileSettingsLevel('menu')}>
          <ArrowLeft size={18} aria-hidden="true" />
          设置项
        </button>
      )}

      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="section-title" id="settings-title">
            设置
          </h2>
          <p className="mt-1 text-sm font-bold text-ink-400">{settingsIntro}</p>
        </div>
        {!showMobileMenu && <span className="pill">{activeSettingsItem?.label}</span>}
      </div>

      {showMobileMenu ? (
        <div className="settings-mobile-menu" aria-label="设置项">
          {settingsSectionGroups.map((group) => (
            <section className="settings-mobile-menu-group" key={group.id}>
              <h3>{group.label}</h3>
              <div className="settings-mobile-menu-items">
                {group.items.map((item) => (
                  <button className="settings-mobile-menu-item" type="button" key={item.id} onClick={() => handleSettingsSectionChange(item.id)}>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.note}</small>
                    </span>
                    <ChevronDown className="-rotate-90 text-ink-400" size={18} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (

      <div className="settings-layout">
        <aside className="settings-sidebar" aria-label="设置分组导航">
          {settingsSectionGroups.map((group) => {
            const isExpanded = expandedGroups[group.id] ?? false
            const groupHasActiveItem = group.items.some((item) => item.id === settingsSection)

            return (
              <section className={`settings-group ${groupHasActiveItem ? 'settings-group-active' : ''}`} key={group.id}>
                <button className="settings-group-trigger" type="button" onClick={() => toggleGroup(group.id)}>
                  <span>
                    <strong>{group.label}</strong>
                    <small>{group.items.length} 个子项</small>
                  </span>
                  <ChevronDown className={isExpanded ? 'settings-group-chevron settings-group-chevron-open' : 'settings-group-chevron'} size={16} aria-hidden="true" />
                </button>

                {isExpanded && (
                  <div className="settings-group-items">
                    {group.items.map((item) => (
                      <button
                        className={`settings-link ${settingsSection === item.id ? 'settings-link-active' : ''}`}
                        type="button"
                        key={item.id}
                        onClick={() => handleSettingsSectionChange(item.id)}
                      >
                        <strong className="block text-sm font-black text-ink-950">{item.label}</strong>
                        <small className="block text-xs font-bold text-ink-400">{item.note}</small>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </aside>

        <div className="grid gap-5">
          {settingsSection === 'overview' && (
            <>
              <div className="secondary-metrics md:grid-cols-5">
                <Metric label="数据库" value={databaseStatus.databaseName} />
                <Metric label="日记" value={`${entriesCount}`} />
                <Metric label="事项" value={`${todosCount}`} />
                <Metric label="附件" value={`${attachmentsCount}`} />
                <Metric label="周总结" value={`${weeklySummariesCount}`} />
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
                <section className="section" aria-labelledby="overview-db-title">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">System Snapshot</p>
                      <h2 className="section-title" id="overview-db-title">
                        本地数据库概况
                      </h2>
                    </div>
                    <span className="section-icon">
                      <Database size={22} aria-hidden="true" />
                    </span>
                  </div>

                  <div className="table-grid">
                    <span className="table-key">driver</span>
                    <strong className="table-value">{databaseStatus.driver}</strong>
                    <span className="table-key">database</span>
                    <strong className="table-value">{databaseStatus.databaseName}</strong>
                    <span className="table-key">path</span>
                    <strong className="table-value">{databaseStatus.databasePath || '等待本地 API 返回'}</strong>
                    <span className="table-key">sync bundle</span>
                    <strong className="table-value">{databaseStatus.syncBundlePath || '桌面端可生成'}</strong>
                    <span className="table-key">schema</span>
                    <strong className="table-value">v{databaseStatus.schemaVersion || '-'}</strong>
                    <span className="table-key">pending content</span>
                    <strong className="table-value">{pendingChangeCount}</strong>
                  </div>

                  <p className="note mt-3">
                    主数据固定落在本机 SQLite 文件里。浏览器、端口和 PWA 安装状态改变时，只要本地 API 仍指向同一个文件，数据就不会跟着消失。云同步只使用专用 WebDAV 目录里的跨端快照，不建议把本机 data 文件夹直接同步到坚果云。
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="button-secondary min-h-9 px-3" type="button" onClick={() => handleSettingsSectionChange('database')}>
                      看详细结构
                    </button>
                    <button className="button-secondary min-h-9 px-3" type="button" onClick={onReload}>
                      <RefreshCw size={16} aria-hidden="true" />
                      重新读取
                    </button>
                  </div>
                </section>

                <section className="section" aria-labelledby="overview-engine-title">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Game Adapter</p>
                      <h2 className="section-title" id="overview-engine-title">
                        引擎快照
                      </h2>
                    </div>
                    <span className="section-icon">
                      <Settings2 size={22} aria-hidden="true" />
                    </span>
                  </div>

                  <div className="table-grid">
                    <span className="table-key">adapter</span>
                    <strong className="table-value">{gameEngineSnapshot.adapterVersion}</strong>
                    <span className="table-key">progress score</span>
                    <strong className="table-value">{gameEngineSnapshot.progress.progressScore}</strong>
                    <span className="table-key">phase index</span>
                    <strong className="table-value">{gameEngineSnapshot.progress.phaseIndex}</strong>
                    <span className="table-key">timeline samples</span>
                    <strong className="table-value">{gameEngineSnapshot.timeline.length}</strong>
                  </div>

                  <p className="note mt-3">
                    心象花园已经在应用内消费这份稳定快照；外部引擎仍可继续读取同一份数据契约。
                  </p>

                  <button className="button-secondary mt-3 min-h-9 px-3" type="button" onClick={() => handleSettingsSectionChange('engine')}>
                    调整接口参数
                  </button>
                </section>
              </div>
            </>
          )}

          {settingsSection === 'cards' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <section className="section" aria-labelledby="card-settings-title">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">Cards</p>
                    <h2 className="section-title" id="card-settings-title">
                      仪表盘统计卡片
                    </h2>
                  </div>
                  <span className="pill">{dashboardCards.filter((card) => card.enabled).length} 已显示</span>
                </div>

                <div className="grid gap-3">
                  {dashboardCardMetrics.map((card) => {
                    const enabled = dashboardCards.find((item) => item.id === card.id)?.enabled ?? false

                    return (
                      <div className="config-row" key={card.id}>
                        <div className="grid min-w-0 gap-2">
                          <strong className="block text-sm font-black text-ink-950">{card.label}</strong>
                          <small className="block text-xs font-bold text-ink-400">当前值 {card.value}</small>
                          {card.id === 'countdown' && (
                            <label className="grid gap-1">
                              <span className="text-xs font-black text-ink-400">仪表盘展示</span>
                              <select
                                className="board-detail-select min-h-10 text-sm"
                                value={selectedCountdownTodoId}
                                onChange={(event) => onCountdownTodoSelect(event.target.value)}
                                disabled={countdownTodoOptions.length === 0}
                              >
                                {countdownTodoOptions.length === 0 ? (
                                  <option value="">先在 Todo 详情里开启倒计时</option>
                                ) : (
                                  countdownTodoOptions.map((todo) => (
                                    <option value={todo.id} key={todo.id}>
                                      {todo.label} · {todo.value}
                                    </option>
                                  ))
                                )}
                              </select>
                            </label>
                          )}
                        </div>
                        <button
                          className={`button-secondary min-h-9 px-3 ${enabled ? 'border-xin-700 bg-xin-100 text-xin-800' : ''}`}
                          type="button"
                          onClick={() => onToggleDashboardCard(card.id as DashboardCardId)}
                        >
                          {enabled ? '显示中' : '已隐藏'}
                        </button>
                      </div>
                    )
                  })}
                </div>

                <p className="note mt-3">
                  这里先保留卡片显隐。后面加拖拽排序、自定义统计块时，不需要再推翻现有结构。
                </p>
              </section>

              <section className="section" aria-labelledby="card-preview-title">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">Preview</p>
                    <h2 className="section-title" id="card-preview-title">
                      当前展示预览
                    </h2>
                  </div>
                  <span className="section-icon">
                    <BarChart3 size={22} aria-hidden="true" />
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {visibleDashboardCards.map((card) => (
                    <Metric label={card.label} value={card.value} tone={card.tone} key={`preview-${card.id}`} />
                  ))}
                </div>

                {visibleDashboardCards.length === 0 && <p className="empty-state mt-3">当前还没有开启的统计卡片。</p>}
              </section>
            </div>
          )}

          {settingsSection === 'appearance' && (
            <section className="section" aria-labelledby="appearance-settings-title">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Appearance</p>
                  <h2 className="section-title" id="appearance-settings-title">
                    外观偏好
                  </h2>
                </div>
                <span className="pill">{resolvedThemeMode === 'dark' ? '夜间生效' : '日间生效'}</span>
              </div>

              <div className="theme-choice-grid" role="group" aria-label="外观模式">
                {themeOptions.map((option) => {
                  const Icon = option.icon
                  const selected = themeMode === option.id

                  return (
                    <button
                      className={`theme-choice ${selected ? 'theme-choice-active' : ''}`}
                      type="button"
                      key={option.id}
                      aria-pressed={selected}
                      onClick={() => onThemeModeChange(option.id)}
                    >
                      <span className="theme-choice-icon">
                        <Icon size={20} aria-hidden="true" />
                      </span>
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.note}</small>
                      </span>
                    </button>
                  )
                })}
              </div>

              <p className="note mt-3">
                外观设置只保存在本机，用于调整界面和动态背景。数据内容、SQLite 文件和 WebDAV 同步不受外观模式影响。
              </p>
            </section>
          )}

          {settingsSection === 'database' && (
            <section className="section" aria-labelledby="storage-settings-title">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Local Database</p>
                  <h2 className="section-title" id="storage-settings-title">
                    本地数据库
                  </h2>
                </div>
                <span className="section-icon">
                  <Database size={22} aria-hidden="true" />
                </span>
              </div>

              <div className="grid gap-3">
                <div className="table-grid">
                  <span className="table-key">origin</span>
                  <strong className="table-value">{databaseStatus.origin}</strong>
                  <span className="table-key">driver</span>
                  <strong className="table-value">{databaseStatus.driver}</strong>
                  <span className="table-key">database</span>
                  <strong className="table-value">{databaseStatus.databaseName}</strong>
                  <span className="table-key">path</span>
                  <strong className="table-value">{databaseStatus.databasePath || '等待本地 API 返回'}</strong>
                  <span className="table-key">syncBundle</span>
                  <strong className="table-value">{databaseStatus.syncBundlePath || '-'}</strong>
                  <span className="table-key">api</span>
                  <strong className="table-value">{databaseStatus.apiBaseUrl || '/api'}</strong>
                  <span className="table-key">schema</span>
                  <strong className="table-value">v{databaseStatus.schemaVersion || '-'}</strong>
                  <span className="table-key">last loaded</span>
                  <strong className="table-value">{databaseStatus.lastLoadedAt || '-'}</strong>
                  <span className="table-key">entries</span>
                  <strong className="table-value">{entriesCount}</strong>
                  <span className="table-key">todos</span>
                  <strong className="table-value">{todosCount}</strong>
                  <span className="table-key">attachments</span>
                  <strong className="table-value">{attachmentsCount}</strong>
                  <span className="table-key">changes</span>
                  <strong className="table-value">{changesCount}</strong>
                  <span className="table-key">weeklySummaries</span>
                  <strong className="table-value">{weeklySummariesCount}</strong>
                </div>
                <p className="note">
                  当前主库是本机 SQLite 文件，不再依赖浏览器 profile 或端口隔离。WebDAV 目录只承载跨端同步快照；后续多端合并会继续使用这里的变更日志和设备信息。
                </p>
              </div>
            </section>
          )}

          {settingsSection === 'ai' && (
            <section className="section" aria-labelledby="ai-settings-title">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Weekly AI</p>
                  <h2 className="section-title" id="ai-settings-title">
                    大模型 API
                  </h2>
                </div>
                <span className="section-icon">
                  <Settings2 size={22} aria-hidden="true" />
                </span>
              </div>

              <div className="grid gap-3 rounded-lg border border-field-200 bg-field-50 p-3">
                <label className="input-label">
                  <span>Endpoint</span>
                  <input
                    className="text-input"
                    value={aiConfig.endpoint}
                    onChange={onAiConfigChange('endpoint')}
                    placeholder="https://api.openai.com/v1/chat/completions"
                  />
                </label>
                <label className="input-label">
                  <span>Model</span>
                  <input className="text-input" value={aiConfig.model} onChange={onAiConfigChange('model')} placeholder="gpt-4o-mini" />
                </label>
                <label className="input-label">
                  <span>API Key</span>
                  <input
                    className="text-input"
                    value={aiConfig.apiKey}
                    onChange={onAiConfigChange('apiKey')}
                    placeholder="只保存在本机浏览器"
                    type="password"
                  />
                </label>
              </div>

              <p className="note mt-3">
                周总结请求会先发送到本地 SQLite API，再由本地代理转发到这里填写的 Chat Completions 兼容接口，用来避开浏览器直接跨域访问时常见的 `failed to fetch`。
              </p>
            </section>
          )}

          {settingsSection === 'webdav' && (
            <section className="section" aria-labelledby="webdav-title">
              <div className="section-head">
                <div>
                  <p className="eyebrow">WebDAV</p>
                  <h2 className="section-title" id="webdav-title">
                    坚果云同步准备
                  </h2>
                </div>
                <span className="section-icon">
                  <Cloud size={22} aria-hidden="true" />
                </span>
              </div>

              {databaseStatus.webDavRecoveryRequired && (
                <p className="webdav-test-result webdav-test-result-error mb-3" role="alert">
                  <strong>云端同步保护已开启</strong>
                  <span>普通同步和云端恢复已暂停。确认本机数据无误后，请使用“用本机数据重建云端”。</span>
                </p>
              )}

              <div className="grid gap-3 rounded-lg border border-field-200 bg-field-50 p-3">
                <label className="input-label">
                  <span>Server URL</span>
                  <input
                    className="text-input"
                    value={webDavConfig.url}
                    onChange={onWebDavConfigChange('url')}
                    placeholder="https://dav.jianguoyun.com/dav/"
                  />
                </label>
                <label className="input-label">
                  <span>Username</span>
                  <input
                    className="text-input"
                    value={webDavConfig.username}
                    onChange={onWebDavConfigChange('username')}
                    placeholder="坚果云账号邮箱"
                  />
                </label>
                <label className="input-label">
                  <span>Password</span>
                  <input
                    className="text-input"
                    value={webDavConfig.password}
                    onChange={onWebDavConfigChange('password')}
                    placeholder="坚果云应用密码"
                    type="password"
                  />
                </label>
                <label className="input-label">
                  <span>Remote Path</span>
                  <input
                    className="text-input"
                    value={webDavConfig.remotePath}
                    onChange={onWebDavConfigChange('remotePath')}
                    placeholder="/xinxiangyi-sync"
                  />
                </label>
                <label className="config-row cursor-pointer">
                  <span>
                    <strong className="block text-sm font-black text-ink-950">打开后每天自动同步</strong>
                    <small className="block text-xs font-bold text-ink-400">每天首次打开应用时自动执行一次同步。</small>
                  </span>
                  <input
                    className="size-5 accent-[var(--color-xin-700)]"
                    type="checkbox"
                    checked={webDavConfig.autoSyncDaily}
                    onChange={onWebDavAutoSyncChange}
                  />
                </label>

                <div className="webdav-test-row">
                  <button className="button-secondary min-h-9 px-3" type="button" disabled={isExportingSyncBundle} onClick={onExportSyncBundle}>
                    {isExportingSyncBundle ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Database size={16} aria-hidden="true" />}
                    {isExportingSyncBundle ? '生成中' : '生成本地同步包'}
                  </button>
                  <button className="button-secondary min-h-9 px-3" type="button" disabled={isTestingWebDav} onClick={onTestWebDavConnection}>
                    {isTestingWebDav ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Cloud size={16} aria-hidden="true" />}
                    {isTestingWebDav ? '测试中' : '测试连接'}
                  </button>
                  <button className="button-secondary min-h-9 px-3" type="button" disabled={isWebDavSyncing} onClick={onRestoreWebDavSnapshot}>
                    {isWebDavSyncing ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Cloud size={16} aria-hidden="true" />}
                    从云端恢复
                  </button>
                  <button className="button-secondary todo-detail-delete-button min-h-9 px-3" type="button" disabled={isWebDavSyncing} onClick={onReplaceWebDavSnapshot}>
                    {isWebDavSyncing ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Cloud size={16} aria-hidden="true" />}
                    用本机数据重建云端
                  </button>
                  {webDavTestResult && (
                    <p className={`webdav-test-result ${webDavTestResult.ok ? 'webdav-test-result-ok' : 'webdav-test-result-error'}`}>
                      <strong>{webDavTestResult.ok ? '连接可用' : '需要检查'}</strong>
                      <span>{webDavTestResult.message}</span>
                    </p>
                  )}
                </div>
              </div>

              <p className="note mt-3">
                本地仍使用 SQLite 保持读写稳定，WebDAV 上只放跨端同步文件。点击“生成本地同步包”会把需要上传的文件整理到 {databaseStatus.syncBundlePath || 'sync/xinxiangyi-sync'}。坚果云的公开邀请链接不能作为 WebDAV Server URL；Server URL 通常填写 https://dav.jianguoyun.com/dav/。Remote Path 建议使用专用目录 /xinxiangyi-sync，不要直接指向本机 data 文件夹。当前采用自用简单同步模式：编辑后点同步上传，换设备前先点同步拉取；迁移和排查时，可以用“从云端恢复”强制拉取远端快照。
              </p>
            </section>
          )}

          {settingsSection === 'engine' && (
            <section className="section" aria-labelledby="engine-settings-title">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Game Engine Adapter</p>
                  <h2 className="section-title" id="engine-settings-title">
                    游戏引擎接口
                  </h2>
                </div>
                <span className="section-icon">
                  <Settings2 size={22} aria-hidden="true" />
                </span>
              </div>

              <div className="rounded-lg border border-field-200 bg-field-50 p-3">
                <strong>心象花园已接入应用。</strong>
                <p className="m-0 mt-1 text-sm font-bold text-ink-600">
                  当前内置花园和未来 Phaser、Pixi、Three.js 或 WebAssembly/Godot 引擎共用同一份快照。游戏进度由日记和心象数据推导，不需要维护第二份云端存档。
                </p>
              </div>

              <div className="mt-3 grid gap-3">
                <label className="input-label">
                  <span>Snapshot Days</span>
                  <input className="text-input" min={7} max={365} type="number" value={gameEngineSettings.snapshotDays} onChange={onSnapshotDaysChange} />
                </label>
              </div>

              <div className="mt-3">
                <div className="table-grid">
                  <span className="table-key">adapterVersion</span>
                  <strong className="table-value">{gameEngineSnapshot.adapterVersion}</strong>
                  <span className="table-key">renderMode</span>
                  <strong className="table-value">{gameEngineSnapshot.renderMode}</strong>
                  <span className="table-key">mountPointId</span>
                  <strong className="table-value">{gameEngineSnapshot.contract.mountPointId}</strong>
                  <span className="table-key">entries</span>
                  <strong className="table-value">{gameEngineSnapshot.metrics.entries}</strong>
                  <span className="table-key">averageMoodScore</span>
                  <strong className="table-value">{gameEngineSnapshot.metrics.averageMoodScore}</strong>
                  <span className="table-key">progressScore</span>
                  <strong className="table-value">{gameEngineSnapshot.progress.progressScore}</strong>
                  <span className="table-key">phaseProgress</span>
                  <strong className="table-value">{gameEngineSnapshot.progress.phaseProgress}%</strong>
                  <span className="table-key">timeline</span>
                  <strong className="table-value">{gameEngineSnapshot.timeline.length}</strong>
                  <span className="table-key">assets</span>
                  <strong className="table-value">{gameEngineSnapshot.assets.length}</strong>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
      )}
    </section>
  )
}
