import { Capacitor } from '@capacitor/core'

import { analyzeMood, type MoodAnalysis } from './mood'
import {
  addNativeTodo,
  addNativeBoardLane,
  deleteNativeBoardLane,
  deleteNativeAttachment,
  deleteNativeJournalEntries,
  deleteNativeJournalEntry,
  deleteNativeTodo,
  getNativeAttachmentContent,
  getNativeAttachmentsPage,
  getNativeEntriesPage,
  getNativeLocalCoreState,
  getNativeTodosPage,
  pullNativeWebDavSnapshot,
  pushNativeWebDavSnapshot,
  replaceNativeWebDavSnapshot,
  setNativeTodoDone,
  testNativeWebDavConnection,
  updateNativeTodoDetails,
  upsertNativeJournalEntry,
  upsertNativeWeeklySummary,
} from './native-db'

export const localDatabaseName = 'xinxiangyi.sqlite'
export const localDatabaseDriver = 'SQLite'

export type SyncState = 'pending' | 'synced' | 'conflict'

export type JournalEntry = {
  id: string
  dateKey: string
  title: string
  body: string
  moodText: string
  weatherText: string
  locationText: string
  mood: MoodAnalysis
  tags: string[]
  createdAt: string
  updatedAt: string
  syncState: SyncState
}

export type TodoItem = {
  id: string
  dateKey: string
  title: string
  description: string
  priority: TodoPriority
  laneId: string
  countdownEnabled: boolean
  repeatFrequency: TodoRepeatFrequency
  repeatGroupId: string
  boardVisible: boolean
  reminderEnabled: boolean
  reminderTime: string
  done: boolean
  createdAt: string
  updatedAt: string
  completedAt?: string
  archivedAt?: string
  syncState: SyncState
}

export type TodoPriority = 'normal' | 'important' | 'urgent'
export type TodoRepeatFrequency = 'none' | 'daily' | 'weekly' | 'monthly'

export type TodoDetailUpdate = {
  description?: string
  priority?: TodoPriority
  laneId?: string
  countdownEnabled?: boolean
  repeatFrequency?: TodoRepeatFrequency
  boardVisible?: boolean
  reminderEnabled?: boolean
  reminderTime?: string
  archived?: boolean
}

export type AttachmentRecord = {
  id: string
  entryId: string
  dateKey: string
  name: string
  type: string
  size: number
  blob?: Blob
  createdAt: string
  updatedAt: string
  syncState: SyncState
}

export type BoardLaneRecord = {
  id: string
  label: string
  colorId: string
  createdAt: string
  updatedAt: string
  syncState: SyncState
}

export type ChangeEntity = 'entry' | 'todo' | 'attachment' | 'boardLane' | 'metricDefinition' | 'metricRecord'
export type ChangeOperation = 'upsert' | 'delete'

export type ChangeLogRecord = {
  seq?: number
  entity: ChangeEntity
  entityId: string
  operation: ChangeOperation
  changedAt: string
  deviceId: string
  syncState: SyncState
  payload: unknown
}

export type EntryDraft = {
  dateKey: string
  title: string
  body: string
  moodText: string
  weatherText?: string
  locationText?: string
  tags: string[]
}

export type WeeklySummary = {
  weekKey: string
  content: string
  model: string
  provider: string
  createdAt: string
  updatedAt: string
}

export type WebDavSyncConfig = {
  url: string
  username: string
  password: string
  remotePath: string
}

export type WebDavSyncResult = {
  ok: true
  direction: 'push' | 'pull'
  remotePath: string
  file: string
  size: number
  syncedAt: string
  backupPath?: string
  migratedFile?: string
  migratedSize?: number
}

export type WebDavConnectionTestResult = {
  ok: boolean
  pathExists: boolean
  writable: boolean
  status: number
  remotePath: string
  checkedAt: string
  message: string
}

export type SyncBundleFile = {
  name: string
  role: string
  size?: number
}

export type SyncBundleExportResult = {
  ok: true
  path: string
  remotePath: string
  exportedAt: string
  files: SyncBundleFile[]
  message: string
}

export type LocalDatabaseMeta = {
  driver: string
  databaseName: string
  databasePath: string
  syncBundleName?: string
  syncBundlePath?: string
  apiBaseUrl: string
  schemaVersion: number
  webDavRecoveryRequired?: boolean
}

export type LocalState = {
  entries: JournalEntry[]
  todos: TodoItem[]
  attachments: AttachmentRecord[]
  boardLanes: BoardLaneRecord[]
  changes: ChangeLogRecord[]
  weeklySummaries: WeeklySummary[]
  meta: LocalDatabaseMeta
  counts: LocalStateCounts
  pagination: LocalStatePagination
}

export type LocalStateCounts = {
  entries: number
  todos: number
  archivedTodos: number
  attachments: number
}

export type PageResult<T> = {
  items: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export type LocalStatePagination = {
  entries: Omit<PageResult<JournalEntry>, 'items'>
  todos: Omit<PageResult<TodoItem>, 'items'>
  attachments: Omit<PageResult<AttachmentRecord>, 'items'>
}

export type JournalEntryMutationResult = {
  entry: JournalEntry
  attachments: AttachmentRecord[]
}

export type TodoDoneMutationResult = {
  todo: TodoItem
  createdTodos: TodoItem[]
}

type LocalCorePayload = Pick<LocalState, 'boardLanes' | 'changes' | 'weeklySummaries' | 'meta' | 'counts'>

type PendingFilePayload = {
  name: string
  type: string
  size: number
  dataBase64: string
}

type RuntimeWindow = Window & {
  xinxiangyiDesktop?: {
    apiBaseUrl?: string
    apiToken?: string
  }
}

const getRuntimeApiBaseUrl = () => {
  if (typeof window === 'undefined') return ''

  return (window as RuntimeWindow).xinxiangyiDesktop?.apiBaseUrl ?? ''
}

const normalizeApiBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, '')

const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_LOCAL_API_URL || getRuntimeApiBaseUrl())
export const getApiUrl = (path: string) => `${apiBaseUrl}${path}`
const getRuntimeApiToken = () => {
  if (typeof window === 'undefined') return ''

  return (window as RuntimeWindow).xinxiangyiDesktop?.apiToken ?? ''
}

export const getApiRequestHeaders = (): Record<string, string> => {
  const token = getRuntimeApiToken()

  return {
    'Content-Type': 'application/json',
    ...(token ? { 'X-Xinxiangyi-API-Token': token } : {}),
  }
}
const shouldUseNativeDatabase = () => Capacitor.isNativePlatform()

const createId = (prefix: string) => {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

  return `${prefix}_${random}`
}

const getDeviceId = () => {
  const key = 'xinxiangyi-device-id'
  const existing = globalThis.localStorage?.getItem(key)

  if (existing) {
    return existing
  }

  const id = createId('device')
  globalThis.localStorage?.setItem(key, id)
  return id
}

const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(getApiUrl(path), {
    ...init,
    headers: {
      ...getApiRequestHeaders(),
      'X-Xinxiangyi-Device-Id': getDeviceId(),
      ...init?.headers,
    },
  })
  const contentType = response.headers.get('content-type') ?? ''

  if (!contentType.includes('application/json')) {
    throw new Error('本地 SQLite API 没有响应。若正在 Android APK 中运行，当前版本还需要接入移动端本地数据库后才能直接读写数据。')
  }

  const payload = (await response.json().catch(() => ({}))) as { error?: string }

  if (!response.ok) {
    throw new Error(payload.error ?? `本地 SQLite API 请求失败：${response.status}`)
  }

  return payload as T
}

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  const chunks: string[] = []

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    chunks.push(String.fromCharCode(...chunk))
  }

  return globalThis.btoa(chunks.join(''))
}

const fileToPayload = async (file: File): Promise<PendingFilePayload> => ({
  name: file.name,
  type: file.type,
  size: file.size,
  dataBase64: arrayBufferToBase64(await file.arrayBuffer()),
})

const ensureArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value : [])

const normalizeTodos = (items: Array<Partial<TodoItem>>) =>
  items.map((todo) => ({
    ...todo,
    countdownEnabled: Boolean(todo.countdownEnabled),
    repeatFrequency: todo.repeatFrequency ?? 'none',
    repeatGroupId: todo.repeatGroupId ?? '',
    boardVisible: todo.boardVisible ?? true,
    reminderEnabled: Boolean(todo.reminderEnabled),
    reminderTime: todo.reminderTime ?? '09:00',
  })) as TodoItem[]

const normalizeCorePayload = (payload: Partial<LocalCorePayload>): LocalCorePayload => ({
  boardLanes: ensureArray<BoardLaneRecord>(payload.boardLanes),
  changes: ensureArray<ChangeLogRecord>(payload.changes),
  weeklySummaries: ensureArray<WeeklySummary>(payload.weeklySummaries),
  meta: {
    driver: payload.meta?.driver ?? localDatabaseDriver,
    databaseName: payload.meta?.databaseName ?? localDatabaseName,
    databasePath: payload.meta?.databasePath ?? '',
    syncBundleName: payload.meta?.syncBundleName ?? '',
    syncBundlePath: payload.meta?.syncBundlePath ?? '',
    apiBaseUrl: payload.meta?.apiBaseUrl ?? apiBaseUrl,
    schemaVersion: payload.meta?.schemaVersion ?? 0,
    webDavRecoveryRequired: Boolean(payload.meta?.webDavRecoveryRequired),
  },
  counts: {
    entries: payload.counts?.entries ?? 0,
    todos: payload.counts?.todos ?? 0,
    archivedTodos: payload.counts?.archivedTodos ?? 0,
    attachments: payload.counts?.attachments ?? 0,
  },
})

const getPageMeta = <T>(page: PageResult<T>): Omit<PageResult<T>, 'items'> => ({
  total: page.total,
  limit: page.limit,
  offset: page.offset + page.items.length,
  hasMore: page.hasMore,
})

export const getLocalCoreState = async (): Promise<LocalCorePayload> => {
  if (shouldUseNativeDatabase()) {
    return getNativeLocalCoreState()
  }

  return normalizeCorePayload(await apiFetch<LocalCorePayload>('/api/state'))
}

export const getEntriesPage = async (offset = 0, limit = 366): Promise<PageResult<JournalEntry>> => {
  if (shouldUseNativeDatabase()) {
    return getNativeEntriesPage(offset, limit)
  }

  return apiFetch<PageResult<JournalEntry>>(`/api/entries?offset=${offset}&limit=${limit}`)
}

export const getTodosPage = async (offset = 0, limit = 500): Promise<PageResult<TodoItem>> => {
  if (shouldUseNativeDatabase()) {
    return getNativeTodosPage(offset, limit)
  }

  const page = await apiFetch<PageResult<Partial<TodoItem>>>(`/api/todos?offset=${offset}&limit=${limit}`)

  return { ...page, items: normalizeTodos(page.items) }
}

export const getAttachmentsPage = async (
  offset = 0,
  limit = 500,
  entryId = '',
): Promise<PageResult<AttachmentRecord>> => {
  if (shouldUseNativeDatabase()) {
    return getNativeAttachmentsPage(offset, limit, entryId)
  }

  const entryQuery = entryId ? `&entryId=${encodeURIComponent(entryId)}` : ''

  return apiFetch<PageResult<AttachmentRecord>>(`/api/attachments?offset=${offset}&limit=${limit}${entryQuery}`)
}

export const getLocalState = async (): Promise<LocalState> => {
  const [core, entriesPage, todosPage, attachmentsPage] = await Promise.all([
    getLocalCoreState(),
    getEntriesPage(),
    getTodosPage(),
    getAttachmentsPage(),
  ])

  return {
    ...core,
    counts: {
      ...core.counts,
      entries: entriesPage.total,
      todos: todosPage.total,
      attachments: attachmentsPage.total,
    },
    entries: entriesPage.items,
    todos: todosPage.items,
    attachments: attachmentsPage.items,
    pagination: {
      entries: getPageMeta(entriesPage),
      todos: getPageMeta(todosPage),
      attachments: getPageMeta(attachmentsPage),
    },
  }
}

export const getAttachmentContent = async (attachment: AttachmentRecord) => {
  if (attachment.blob) return attachment.blob
  if (shouldUseNativeDatabase()) return getNativeAttachmentContent(attachment)

  const response = await fetch(getApiUrl(`/api/attachments/${encodeURIComponent(attachment.id)}/content`), {
    headers: {
      ...getApiRequestHeaders(),
      'X-Xinxiangyi-Device-Id': getDeviceId(),
    },
  })

  if (!response.ok) {
    throw new Error(`读取附件失败：${response.status}`)
  }

  return response.blob()
}

export const upsertJournalEntry = async (draft: EntryDraft, files: File[]) => {
  if (shouldUseNativeDatabase()) {
    return upsertNativeJournalEntry(draft, files)
  }

  const mood = analyzeMood(draft.body)
  const filePayloads = await Promise.all(files.map(fileToPayload))
  const result = await apiFetch<JournalEntryMutationResult>('/api/entries/upsert', {
    method: 'POST',
    body: JSON.stringify({
      draft,
      mood,
      files: filePayloads,
    }),
  })

  return result
}

export const deleteJournalEntry = async (entry: JournalEntry) => {
  if (shouldUseNativeDatabase()) {
    await deleteNativeJournalEntry(entry)
    return
  }

  await apiFetch<{ ok: true }>(`/api/entries/${encodeURIComponent(entry.id)}`, {
    method: 'DELETE',
  })
}

export const deleteJournalEntries = async (entryIds: string[]) => {
  if (shouldUseNativeDatabase()) {
    await deleteNativeJournalEntries(entryIds)
    return
  }

  await apiFetch<{ ok: true; deletedCount: number }>('/api/entries/batch-delete', {
    method: 'POST',
    body: JSON.stringify({ ids: entryIds }),
  })
}

export const addTodo = async (dateKey: string, title: string, details: TodoDetailUpdate = {}) => {
  if (shouldUseNativeDatabase()) {
    return addNativeTodo(dateKey, title, details)
  }

  const { todo } = await apiFetch<{ todo: TodoItem }>('/api/todos', {
    method: 'POST',
    body: JSON.stringify({ dateKey, title, ...details }),
  })

  return todo
}

export const addBoardLane = async (label: string, colorId: string) => {
  if (shouldUseNativeDatabase()) {
    return addNativeBoardLane(label, colorId)
  }

  const { lane } = await apiFetch<{ lane: BoardLaneRecord }>('/api/board-lanes', {
    method: 'POST',
    body: JSON.stringify({ label, colorId }),
  })

  return lane
}

export const deleteBoardLane = async (lane: BoardLaneRecord) => {
  if (shouldUseNativeDatabase()) {
    return deleteNativeBoardLane(lane)
  }

  const { movedTodos } = await apiFetch<{ ok: true; movedTodos: TodoItem[] }>(
    `/api/board-lanes/${encodeURIComponent(lane.id)}`,
    {
      method: 'DELETE',
    },
  )

  return movedTodos
}

export const setTodoDone = async (todo: TodoItem, done: boolean) => {
  if (shouldUseNativeDatabase()) {
    return setNativeTodoDone(todo, done)
  }

  const result = await apiFetch<TodoDoneMutationResult>(`/api/todos/${encodeURIComponent(todo.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ done }),
  })

  return { ...result, createdTodos: normalizeTodos(result.createdTodos ?? []) }
}

export const updateTodoDetails = async (todo: TodoItem, details: TodoDetailUpdate) => {
  if (shouldUseNativeDatabase()) {
    return updateNativeTodoDetails(todo, details)
  }

  const { todo: next } = await apiFetch<{ todo: TodoItem }>(`/api/todos/${encodeURIComponent(todo.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(details),
  })

  return next
}

export const deleteTodo = async (todo: TodoItem) => {
  if (shouldUseNativeDatabase()) {
    await deleteNativeTodo(todo)
    return
  }

  await apiFetch<{ ok: true }>(`/api/todos/${encodeURIComponent(todo.id)}`, {
    method: 'DELETE',
  })
}

export const deleteAttachment = async (attachment: AttachmentRecord) => {
  if (shouldUseNativeDatabase()) {
    await deleteNativeAttachment(attachment)
    return
  }

  await apiFetch<{ ok: true }>(`/api/attachments/${encodeURIComponent(attachment.id)}`, {
    method: 'DELETE',
  })
}

export const pushWebDavSnapshot = async (config: WebDavSyncConfig) => {
  if (shouldUseNativeDatabase()) {
    return pushNativeWebDavSnapshot(config)
  }

  return apiFetch<WebDavSyncResult>('/api/webdav/push', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export const replaceWebDavSnapshot = async (config: WebDavSyncConfig) => {
  if (shouldUseNativeDatabase()) {
    return replaceNativeWebDavSnapshot(config)
  }

  return apiFetch<WebDavSyncResult>('/api/webdav/replace', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export const pullWebDavSnapshot = async (config: WebDavSyncConfig) => {
  if (shouldUseNativeDatabase()) {
    return pullNativeWebDavSnapshot(config)
  }

  return apiFetch<WebDavSyncResult>('/api/webdav/pull', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export const testWebDavConnection = async (config: WebDavSyncConfig) => {
  if (shouldUseNativeDatabase()) {
    return testNativeWebDavConnection(config)
  }

  return apiFetch<WebDavConnectionTestResult>('/api/webdav/test', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export const exportSyncBundle = async () => {
  if (shouldUseNativeDatabase()) {
    throw new Error('Android 端暂无本地文件夹导出能力。请使用 WebDAV 同步，或在桌面端生成本地同步包。')
  }

  return apiFetch<SyncBundleExportResult>('/api/sync-bundle/export', {
    method: 'POST',
  })
}

export const upsertWeeklySummary = async (
  weekKey: string,
  content: string,
  model: string,
  provider = 'openai-compatible',
) => {
  if (shouldUseNativeDatabase()) {
    return upsertNativeWeeklySummary(weekKey, content, model, provider)
  }

  const { summary } = await apiFetch<{ summary: WeeklySummary }>('/api/summaries/upsert', {
    method: 'POST',
    body: JSON.stringify({ weekKey, content, model, provider }),
  })

  return summary
}
