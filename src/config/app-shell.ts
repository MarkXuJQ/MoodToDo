import { defaultGameEngineSettings, type GameEngineSettings } from '../lib/gameEngine'
import type {
  AiConfig,
  DashboardCardConfig,
  DraftState,
  JournalModeOption,
  MetricDraftState,
  NavItem,
  SettingsSectionGroup,
  SettingsSectionOption,
  WebDavConfig,
} from '../types/app'

export const emptyDraft: DraftState = {
  title: '',
  body: '',
  moodText: '',
  tags: '',
}

export const defaultAiConfig: AiConfig = {
  endpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4o-mini',
}

export const defaultWebDavConfig: WebDavConfig = {
  url: 'https://dav.jianguoyun.com/dav/',
  username: '',
  password: '',
  remotePath: '/xinxiangyi',
}

export const aiConfigStorageKey = 'xinxiangyi-ai-config-v1'
export const webDavConfigStorageKey = 'xinxiangyi-webdav-config-v1'
export const gameEngineSettingsStorageKey = 'xinxiangyi-game-engine-settings-v1'
export const dashboardCardsStorageKey = 'xinxiangyi-dashboard-cards-v1'

export const defaultDashboardCards: DashboardCardConfig[] = [
  { id: 'latestMood', enabled: true },
  { id: 'streak', enabled: true },
  { id: 'todoCompletion', enabled: true },
  { id: 'monthCheckin', enabled: true },
  { id: 'pendingSync', enabled: true },
  { id: 'attachments', enabled: false },
]

export const metricColorOptions = ['#176f66', '#3b68ae', '#7357ad', '#c68b20', '#bd4f3d', '#4d7c0f']

export const emptyMetricDraft: MetricDraftState = {
  name: '',
  unit: '',
  color: metricColorOptions[0],
  targetValue: '',
}

export const navigationItems: NavItem[] = [
  { id: 'dashboard', label: '仪表盘', note: '记录、Todo 与心象分' },
  { id: 'journal', label: '日记浏览', note: '历史记录与 Todo 看板' },
  { id: 'summary', label: '总结', note: '热力图、周回顾与 AI 总结' },
  { id: 'settings', label: '设置', note: '系统总览、同步与接口配置' },
]

export const journalModes: JournalModeOption[] = [
  { id: 'entries', label: '记录' },
  { id: 'board', label: 'Todo 看板' },
]

export const settingsSections: SettingsSectionOption[] = [
  { id: 'overview', label: '系统总览', note: '数据规模与引擎快照' },
  { id: 'cards', label: '统计卡片', note: '决定今日台展示哪些指标' },
  { id: 'database', label: '本地数据库', note: 'SQLite 与持久化状态' },
  { id: 'ai', label: '大模型 API', note: '周总结代理与模型配置' },
  { id: 'webdav', label: 'WebDAV', note: '坚果云同步预留' },
  { id: 'engine', label: '游戏接口', note: '外部引擎消费快照' },
]

export const settingsSectionGroups: SettingsSectionGroup[] = [
  {
    id: 'workspace',
    label: '工作台',
    items: settingsSections.filter((item) => ['overview', 'cards', 'engine'].includes(item.id)),
  },
  {
    id: 'storage',
    label: '存储与同步',
    items: settingsSections.filter((item) => ['database', 'webdav'].includes(item.id)),
  },
  {
    id: 'intelligence',
    label: '智能助手',
    items: settingsSections.filter((item) => ['ai'].includes(item.id)),
  },
]

export const readAiConfig = (): AiConfig => {
  const raw = window.localStorage.getItem(aiConfigStorageKey)

  if (!raw) return defaultAiConfig

  try {
    return { ...defaultAiConfig, ...JSON.parse(raw) }
  } catch {
    return defaultAiConfig
  }
}

export const readWebDavConfig = (): WebDavConfig => {
  const raw = window.localStorage.getItem(webDavConfigStorageKey)

  if (!raw) return defaultWebDavConfig

  try {
    return { ...defaultWebDavConfig, ...JSON.parse(raw) }
  } catch {
    return defaultWebDavConfig
  }
}

export const readGameEngineSettings = (): GameEngineSettings => {
  const raw = window.localStorage.getItem(gameEngineSettingsStorageKey)

  if (!raw) return defaultGameEngineSettings

  try {
    const parsed = JSON.parse(raw) as Partial<GameEngineSettings>
    const snapshotDays = Number(parsed.snapshotDays)

    return {
      ...defaultGameEngineSettings,
      snapshotDays: Number.isFinite(snapshotDays)
        ? Math.min(365, Math.max(7, Math.round(snapshotDays)))
        : defaultGameEngineSettings.snapshotDays,
    }
  } catch {
    return defaultGameEngineSettings
  }
}

export const readDashboardCards = (): DashboardCardConfig[] => {
  const raw = window.localStorage.getItem(dashboardCardsStorageKey)

  if (!raw) return defaultDashboardCards

  try {
    const parsed = JSON.parse(raw) as DashboardCardConfig[]
    const byId = new Map(parsed.map((item) => [item.id, item.enabled]))

    return defaultDashboardCards.map((item) => ({
      ...item,
      enabled: byId.get(item.id) ?? item.enabled,
    }))
  } catch {
    return defaultDashboardCards
  }
}
