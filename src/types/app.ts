import type { JournalEntry, TodoItem } from '../lib/db'

export type ActiveView = 'dashboard' | 'journal' | 'summary' | 'settings'

export type JournalMode = 'entries' | 'board'

export type SettingsSection = 'overview' | 'cards' | 'appearance' | 'database' | 'ai' | 'webdav' | 'engine'

export type ThemeMode = 'system' | 'light' | 'dark'

export type NavItem = {
  id: ActiveView
  label: string
  note: string
}

export type JournalModeOption = {
  id: JournalMode
  label: string
}

export type SettingsSectionOption = {
  id: SettingsSection
  label: string
  note: string
}

export type SettingsSectionGroup = {
  id: string
  label: string
  items: SettingsSectionOption[]
}

export type DraftState = {
  title: string
  body: string
  moodText: string
  tags: string
}

export type AiConfig = {
  endpoint: string
  apiKey: string
  model: string
}

export type WebDavConfig = {
  url: string
  username: string
  password: string
  remotePath: string
  autoSyncDaily: boolean
}

export type WebDavTextConfigKey = 'url' | 'username' | 'password' | 'remotePath'

export type CalendarCell = {
  dateKey: string
  inMonth: boolean
  entry?: JournalEntry
  todos: TodoItem[]
}

export type DatabaseStatus = {
  origin: string
  driver: string
  databaseName: string
  databasePath: string
  syncBundleName?: string
  syncBundlePath?: string
  apiBaseUrl: string
  schemaVersion: number
  lastLoadedAt: string
}

export type DashboardCardId = 'streak' | 'monthCheckin' | 'todoCompletion' | 'pendingSync' | 'attachments'

export type DashboardCardConfig = {
  id: DashboardCardId
  enabled: boolean
}

export type WeatherState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  locationLabel: string
  weatherText: string
  error?: string
}
