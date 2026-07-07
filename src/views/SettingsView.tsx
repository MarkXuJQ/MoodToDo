import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { BarChart3, ChevronDown, Cloud, Database, RefreshCw, Settings2 } from 'lucide-react'

import { Metric } from '../components/ui/stat-primitives'
import type { GameEngineSettings, GameEngineSnapshot } from '../lib/gameEngine'
import type {
  AiConfig,
  DashboardCardConfig,
  DashboardCardId,
  DatabaseStatus,
  SettingsSection,
  SettingsSectionGroup,
  SettingsSectionOption,
  WebDavConfig,
} from '../types/app'

type DashboardMetricCard = {
  id: string
  label: string
  value: string
  tone?: string
}

type SettingsViewProps = {
  settingsSection: SettingsSection
  settingsSections: SettingsSectionOption[]
  settingsSectionGroups: SettingsSectionGroup[]
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
  aiConfig: AiConfig
  webDavConfig: WebDavConfig
  onSettingsSectionChange: (section: SettingsSection) => void
  onReload: () => void
  onToggleDashboardCard: (cardId: DashboardCardId) => void
  onAiConfigChange: (key: keyof AiConfig) => (event: ChangeEvent<HTMLInputElement>) => void
  onWebDavConfigChange: (key: keyof WebDavConfig) => (event: ChangeEvent<HTMLInputElement>) => void
  onSnapshotDaysChange: (event: ChangeEvent<HTMLInputElement>) => void
}

export function SettingsView({
  settingsSection,
  settingsSections,
  settingsSectionGroups,
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
  aiConfig,
  webDavConfig,
  onSettingsSectionChange,
  onReload,
  onToggleDashboardCard,
  onAiConfigChange,
  onWebDavConfigChange,
  onSnapshotDaysChange,
}: SettingsViewProps) {
  const activeSettingsItem = settingsSections.find((item) => item.id === settingsSection)
  const activeGroupId = useMemo(
    () => settingsSectionGroups.find((group) => group.items.some((item) => item.id === settingsSection))?.id ?? settingsSectionGroups[0]?.id ?? '',
    [settingsSection, settingsSectionGroups],
  )
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(settingsSectionGroups.map((group) => [group.id, group.id === activeGroupId])),
  )

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

  return (
    <section className="py-5" aria-labelledby="settings-title">
      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Preferences</p>
          <h2 className="section-title" id="settings-title">
            设置
          </h2>
          <p className="mt-1 text-sm font-bold text-ink-400">{activeSettingsItem?.note}</p>
        </div>
        <span className="pill">{activeSettingsItem?.label}</span>
      </div>

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
                        onClick={() => onSettingsSectionChange(item.id)}
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
              <div className="grid gap-3 md:grid-cols-5">
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
                    <span className="table-key">schema</span>
                    <strong className="table-value">v{databaseStatus.schemaVersion || '-'}</strong>
                    <span className="table-key">pending changes</span>
                    <strong className="table-value">{pendingChangeCount}</strong>
                  </div>

                  <p className="note mt-3">
                    主数据已经固定落在项目目录下的 SQLite 文件里。浏览器、端口和 PWA 安装状态改变时，只要本地 API 仍指向同一个文件，数据就不会跟着消失。
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="button-secondary min-h-9 px-3" type="button" onClick={() => onSettingsSectionChange('database')}>
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
                    这里暴露的是给后续游戏引擎消费的稳定快照，网页本身不渲染世界场景，只负责把情绪与行动数据整理好。
                  </p>

                  <button className="button-secondary mt-3 min-h-9 px-3" type="button" onClick={() => onSettingsSectionChange('engine')}>
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
                        <div>
                          <strong className="block text-sm font-black text-ink-950">{card.label}</strong>
                          <small className="block text-xs font-bold text-ink-400">当前值 {card.value}</small>
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
                  当前主库是项目目录下的 SQLite 文件，不再依赖浏览器 profile 或端口隔离。后续 WebDAV 同步会基于这个文件中的变更日志生成可恢复备份。
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
                    className="text-input bg-white"
                    value={aiConfig.endpoint}
                    onChange={onAiConfigChange('endpoint')}
                    placeholder="https://api.openai.com/v1/chat/completions"
                  />
                </label>
                <label className="input-label">
                  <span>Model</span>
                  <input className="text-input bg-white" value={aiConfig.model} onChange={onAiConfigChange('model')} placeholder="gpt-4o-mini" />
                </label>
                <label className="input-label">
                  <span>API Key</span>
                  <input
                    className="text-input bg-white"
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

              <div className="grid gap-3 rounded-lg border border-field-200 bg-field-50 p-3">
                <label className="input-label">
                  <span>Server URL</span>
                  <input
                    className="text-input bg-white"
                    value={webDavConfig.url}
                    onChange={onWebDavConfigChange('url')}
                    placeholder="https://dav.jianguoyun.com/dav/"
                  />
                </label>
                <label className="input-label">
                  <span>Username</span>
                  <input
                    className="text-input bg-white"
                    value={webDavConfig.username}
                    onChange={onWebDavConfigChange('username')}
                    placeholder="坚果云账号邮箱"
                  />
                </label>
                <label className="input-label">
                  <span>Password</span>
                  <input
                    className="text-input bg-white"
                    value={webDavConfig.password}
                    onChange={onWebDavConfigChange('password')}
                    placeholder="坚果云应用密码"
                    type="password"
                  />
                </label>
                <label className="input-label">
                  <span>Remote Path</span>
                  <input
                    className="text-input bg-white"
                    value={webDavConfig.remotePath}
                    onChange={onWebDavConfigChange('remotePath')}
                    placeholder="/xinxiangyi"
                  />
                </label>
              </div>

              <p className="note mt-3">
                当前版本只保存同步配置和本地变更日志。下一步会把 `changes` 打包成 JSON 增量文件，并把图片附件按 `attachments/` 上传到 WebDAV。
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
                <strong>网页端不渲染游戏场景。</strong>
                <p className="m-0 mt-1 text-sm font-bold text-ink-600">
                  当前只维护一个稳定快照接口。后续接入 Phaser、Pixi、Three.js 或 WebAssembly/Godot 导出时，引擎层读取该快照并自行决定如何呈现成长关系。
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
    </section>
  )
}
