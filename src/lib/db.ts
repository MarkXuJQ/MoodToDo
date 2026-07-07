import { analyzeMood, type MoodAnalysis } from './mood'

export const localDatabaseName = 'xinxiangyi.sqlite'
export const localDatabaseDriver = 'SQLite'

export type SyncState = 'pending' | 'synced' | 'conflict'

export type JournalEntry = {
  id: string
  dateKey: string
  title: string
  body: string
  moodText: string
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
  done: boolean
  createdAt: string
  updatedAt: string
  completedAt?: string
  syncState: SyncState
}

export type AttachmentRecord = {
  id: string
  entryId: string
  dateKey: string
  name: string
  type: string
  size: number
  blob: Blob
  createdAt: string
  updatedAt: string
  syncState: SyncState
}

export type MetricDefinition = {
  id: string
  name: string
  unit: string
  color: string
  targetValue?: number
  createdAt: string
  updatedAt: string
  syncState: SyncState
}

export type MetricRecord = {
  id: string
  metricId: string
  dateKey: string
  value: number
  createdAt: string
  updatedAt: string
  syncState: SyncState
}

export type ChangeEntity = 'entry' | 'todo' | 'attachment' | 'metricDefinition' | 'metricRecord'
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

export type LocalDatabaseMeta = {
  driver: string
  databaseName: string
  databasePath: string
  apiBaseUrl: string
  schemaVersion: number
}

export type LocalState = {
  entries: JournalEntry[]
  todos: TodoItem[]
  attachments: AttachmentRecord[]
  metricDefinitions: MetricDefinition[]
  metricRecords: MetricRecord[]
  changes: ChangeLogRecord[]
  weeklySummaries: WeeklySummary[]
  meta: LocalDatabaseMeta
}

type AttachmentPayload = Omit<AttachmentRecord, 'blob'> & {
  dataBase64: string
}

type LocalStatePayload = Omit<LocalState, 'attachments'> & {
  attachments: AttachmentPayload[]
}

type PendingFilePayload = {
  name: string
  type: string
  size: number
  dataBase64: string
}

const apiBaseUrl = import.meta.env.VITE_LOCAL_API_URL ?? ''

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
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Xinxiangyi-Device-Id': getDeviceId(),
      ...init?.headers,
    },
  })
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

const base64ToBlob = (dataBase64: string, type: string) => {
  const binary = globalThis.atob(dataBase64)
  const chunkSize = 0x8000
  const chunks: ArrayBuffer[] = []

  for (let index = 0; index < binary.length; index += chunkSize) {
    const slice = binary.slice(index, index + chunkSize)
    const bytes = new Uint8Array(slice.length)

    for (let byteIndex = 0; byteIndex < slice.length; byteIndex += 1) {
      bytes[byteIndex] = slice.charCodeAt(byteIndex)
    }

    chunks.push(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  }

  return new Blob(chunks, { type })
}

const fileToPayload = async (file: File): Promise<PendingFilePayload> => ({
  name: file.name,
  type: file.type,
  size: file.size,
  dataBase64: arrayBufferToBase64(await file.arrayBuffer()),
})

const mapAttachment = (attachment: AttachmentPayload): AttachmentRecord => ({
  ...attachment,
  blob: base64ToBlob(attachment.dataBase64, attachment.type),
})

export const getLocalState = async (): Promise<LocalState> => {
  const payload = await apiFetch<LocalStatePayload>('/api/state')

  return {
    ...payload,
    attachments: payload.attachments.map(mapAttachment),
  }
}

export const upsertJournalEntry = async (draft: EntryDraft, files: File[]) => {
  const mood = analyzeMood(draft.moodText)
  const filePayloads = await Promise.all(files.map(fileToPayload))
  const { entry } = await apiFetch<{ entry: JournalEntry }>('/api/entries/upsert', {
    method: 'POST',
    body: JSON.stringify({
      draft,
      mood,
      files: filePayloads,
    }),
  })

  return entry
}

export const addTodo = async (dateKey: string, title: string) => {
  const { todo } = await apiFetch<{ todo: TodoItem }>('/api/todos', {
    method: 'POST',
    body: JSON.stringify({ dateKey, title }),
  })

  return todo
}

export const setTodoDone = async (todo: TodoItem, done: boolean) => {
  const { todo: next } = await apiFetch<{ todo: TodoItem }>(`/api/todos/${encodeURIComponent(todo.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ done }),
  })

  return next
}

export const deleteTodo = async (todo: TodoItem) => {
  await apiFetch<{ ok: true }>(`/api/todos/${encodeURIComponent(todo.id)}`, {
    method: 'DELETE',
  })
}

export const deleteAttachment = async (attachment: AttachmentRecord) => {
  await apiFetch<{ ok: true }>(`/api/attachments/${encodeURIComponent(attachment.id)}`, {
    method: 'DELETE',
  })
}

export const upsertMetricDefinition = async (payload: {
  id?: string
  name: string
  unit: string
  color: string
  targetValue?: number
}) => {
  const { metricDefinition } = await apiFetch<{ metricDefinition: MetricDefinition }>('/api/metrics/definitions/upsert', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return metricDefinition
}

export const deleteMetricDefinition = async (metricDefinition: MetricDefinition) => {
  await apiFetch<{ ok: true }>(`/api/metrics/definitions/${encodeURIComponent(metricDefinition.id)}`, {
    method: 'DELETE',
  })
}

export const upsertMetricRecord = async (payload: {
  metricId: string
  dateKey: string
  value: number
}) => {
  const { metricRecord } = await apiFetch<{ metricRecord: MetricRecord }>('/api/metrics/records/upsert', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return metricRecord
}

export const upsertWeeklySummary = async (
  weekKey: string,
  content: string,
  model: string,
  provider = 'openai-compatible',
) => {
  const { summary } = await apiFetch<{ summary: WeeklySummary }>('/api/summaries/upsert', {
    method: 'POST',
    body: JSON.stringify({ weekKey, content, model, provider }),
  })

  return summary
}
