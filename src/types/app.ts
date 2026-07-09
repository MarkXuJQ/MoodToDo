import type { JournalEntry, TodoItem } from '../lib/db'

export type ActiveView = 'dashboard' | 'journal' | 'board' | 'summary' | 'settings'

export type SettingsSection = 'overview' | 'cards' | 'appearance' | 'database' | 'ai' | 'webdav' | 'engine'

export type ThemeMode = 'system' | 'light' | 'dark'

export type NavItem = {
  id: ActiveView
  label: string
  note: string
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

export type DashboardCardId = 'streak' | 'monthCheckin' | 'todoCompletion' | 'pendingSync' | 'attachments' | 'countdown'

export type DashboardCardConfig = {
  id: DashboardCardId
  enabled: boolean
}

export type DashboardMetricCard = {
  id: DashboardCardId
  label: string
  value: string
  tone?: string
}

export type CountdownTodoOption = {
  id: string
  title: string
  dateKey: string
  daysRemaining: number
  label: string
  value: string
}

export type MoodBreakdownItem = {
  id: string
  label: string
  value: number
  note: string
}
