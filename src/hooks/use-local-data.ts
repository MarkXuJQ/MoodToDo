import { useCallback, useEffect, useState } from 'react'

import {
  getAttachmentsPage,
  getEntriesPage,
  getLocalCoreState,
  getLocalState,
  getTodosPage,
  localDatabaseDriver,
  localDatabaseName,
  type AttachmentRecord,
  type BoardLaneRecord,
  type ChangeLogRecord,
  type JournalEntry,
  type LocalDatabaseMeta,
  type LocalStateCounts,
  type LocalStatePagination,
  type PageResult,
  type TodoItem,
  type WeeklySummary,
} from '../lib/db'
import { syncTodoReminders } from '../lib/local-notifications'
import type { DatabaseStatus } from '../types/app'
import { getErrorMessage } from '../utils/errors'

type LocalDataOptions = {
  onLoadError: (message: string) => void
}

type LoadingMoreState = {
  entries: boolean
  todos: boolean
  attachments: boolean
}

const createInitialDatabaseStatus = (): DatabaseStatus => ({
  origin: window.location.origin,
  driver: localDatabaseDriver,
  databaseName: localDatabaseName,
  databasePath: '',
  syncBundleName: '',
  syncBundlePath: '',
  apiBaseUrl: '',
  schemaVersion: 0,
  webDavRecoveryRequired: false,
  lastLoadedAt: '',
})

const initialCounts: LocalStateCounts = {
  entries: 0,
  todos: 0,
  archivedTodos: 0,
  attachments: 0,
}

const createEmptyPageMeta = () => ({ total: 0, limit: 0, offset: 0, hasMore: false })

const initialPagination: LocalStatePagination = {
  entries: createEmptyPageMeta(),
  todos: createEmptyPageMeta(),
  attachments: createEmptyPageMeta(),
}

const mergeUnique = <T extends { id: string }>(current: T[], incoming: T[]) => {
  const byId = new Map(current.map((item) => [item.id, item]))

  for (const item of incoming) {
    byId.set(item.id, item)
  }

  return [...byId.values()]
}

const getNextPageMeta = <T,>(page: PageResult<T>) => ({
  total: page.total,
  limit: page.limit,
  offset: page.offset + page.items.length,
  hasMore: page.hasMore,
})

const toDatabaseStatus = (meta: LocalDatabaseMeta): DatabaseStatus => ({
  origin: window.location.origin,
  driver: meta.driver,
  databaseName: meta.databaseName,
  databasePath: meta.databasePath,
  syncBundleName: meta.syncBundleName ?? '',
  syncBundlePath: meta.syncBundlePath ?? '',
  apiBaseUrl: meta.apiBaseUrl,
  schemaVersion: meta.schemaVersion,
  webDavRecoveryRequired: Boolean(meta.webDavRecoveryRequired),
  lastLoadedAt: new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }),
})

const reconcilePageMeta = (
  current: LocalStatePagination[keyof LocalStatePagination],
  total: number,
) => {
  const deletedSinceRefresh = Math.max(0, current.total - total)
  const offset = Math.min(total, Math.max(0, current.offset - deletedSinceRefresh))

  return {
    ...current,
    total,
    offset,
    hasMore: offset < total,
  }
}

export const useLocalData = ({ onLoadError }: LocalDataOptions) => {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [boardLanes, setBoardLanes] = useState<BoardLaneRecord[]>([])
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([])
  const [changes, setChanges] = useState<ChangeLogRecord[]>([])
  const [weeklySummaries, setWeeklySummaries] = useState<WeeklySummary[]>([])
  const [counts, setCounts] = useState<LocalStateCounts>(initialCounts)
  const [pagination, setPagination] = useState<LocalStatePagination>(initialPagination)
  const [loadingMore, setLoadingMore] = useState<LoadingMoreState>({
    entries: false,
    todos: false,
    attachments: false,
  })
  const [hasLoadedLocalState, setHasLoadedLocalState] = useState(false)
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>(() => createInitialDatabaseStatus())

  useEffect(() => {
    void syncTodoReminders(todos)
  }, [todos])

  const refreshCore = useCallback(async () => {
    try {
      const core = await getLocalCoreState()

      setBoardLanes(core.boardLanes)
      setChanges(core.changes)
      setWeeklySummaries(core.weeklySummaries)
      setCounts(core.counts)
      setPagination((current) => ({
        entries: reconcilePageMeta(current.entries, core.counts.entries),
        todos: reconcilePageMeta(current.todos, core.counts.todos),
        attachments: reconcilePageMeta(current.attachments, core.counts.attachments),
      }))
      setDatabaseStatus(toDatabaseStatus(core.meta))

      return core
    } catch (error) {
      onLoadError(getErrorMessage(error, '刷新本地 SQLite 状态失败。'))
      return undefined
    }
  }, [onLoadError])

  const reload = useCallback(async () => {
    try {
      const nextState = await getLocalState()

      setEntries(nextState.entries)
      setTodos(nextState.todos)
      setBoardLanes(nextState.boardLanes)
      setAttachments(nextState.attachments)
      setChanges(nextState.changes)
      setWeeklySummaries(nextState.weeklySummaries)
      setCounts(nextState.counts)
      setPagination(nextState.pagination)
      setDatabaseStatus(toDatabaseStatus(nextState.meta))
      setHasLoadedLocalState(true)
    } catch (error) {
      onLoadError(getErrorMessage(error, '读取本地 SQLite 数据库失败。'))
    }
  }, [onLoadError])

  const loadMoreEntries = useCallback(async () => {
    if (loadingMore.entries || !pagination.entries.hasMore) return
    setLoadingMore((current) => ({ ...current, entries: true }))

    try {
      const page = await getEntriesPage(pagination.entries.offset, pagination.entries.limit || 366)

      setEntries((current) =>
        mergeUnique(current, page.items).sort((left, right) => right.dateKey.localeCompare(left.dateKey)),
      )
      setPagination((current) => ({ ...current, entries: getNextPageMeta(page) }))
    } catch (error) {
      onLoadError(getErrorMessage(error, '加载更多日记失败。'))
    } finally {
      setLoadingMore((current) => ({ ...current, entries: false }))
    }
  }, [loadingMore.entries, onLoadError, pagination.entries])

  const loadMoreTodos = useCallback(async () => {
    if (loadingMore.todos || !pagination.todos.hasMore) return
    setLoadingMore((current) => ({ ...current, todos: true }))

    try {
      const page = await getTodosPage(pagination.todos.offset, pagination.todos.limit || 500)

      setTodos((current) =>
        mergeUnique(current, page.items).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      )
      setPagination((current) => ({ ...current, todos: getNextPageMeta(page) }))
    } catch (error) {
      onLoadError(getErrorMessage(error, '加载更多 Todo 失败。'))
    } finally {
      setLoadingMore((current) => ({ ...current, todos: false }))
    }
  }, [loadingMore.todos, onLoadError, pagination.todos])

  const loadMoreAttachments = useCallback(async () => {
    if (loadingMore.attachments || !pagination.attachments.hasMore) return
    setLoadingMore((current) => ({ ...current, attachments: true }))

    try {
      const page = await getAttachmentsPage(
        pagination.attachments.offset,
        pagination.attachments.limit || 500,
      )

      setAttachments((current) =>
        mergeUnique(current, page.items).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      )
      setPagination((current) => ({ ...current, attachments: getNextPageMeta(page) }))
    } catch (error) {
      onLoadError(getErrorMessage(error, '加载更多附件索引失败。'))
    } finally {
      setLoadingMore((current) => ({ ...current, attachments: false }))
    }
  }, [loadingMore.attachments, onLoadError, pagination.attachments])

  const loadAttachmentsForEntry = useCallback(
    async (entryId: string) => {
      if (!entryId) return

      try {
        const page = await getAttachmentsPage(0, 500, entryId)

        setAttachments((current) =>
          mergeUnique(current, page.items).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        )
      } catch (error) {
        onLoadError(getErrorMessage(error, '读取日记附件索引失败。'))
      }
    },
    [onLoadError],
  )

  return {
    attachments,
    boardLanes,
    changes,
    counts,
    databaseStatus,
    entries,
    hasLoadedLocalState,
    loadAttachmentsForEntry,
    loadMoreAttachments,
    loadMoreEntries,
    loadMoreTodos,
    loadingMore,
    pagination,
    refreshCore,
    reload,
    setAttachments,
    setBoardLanes,
    setEntries,
    setTodos,
    setWeeklySummaries,
    todos,
    weeklySummaries,
  }
}
