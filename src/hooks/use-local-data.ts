import { useCallback, useState } from 'react'

import {
  getLocalState,
  localDatabaseDriver,
  localDatabaseName,
  type AttachmentRecord,
  type BoardLaneRecord,
  type ChangeLogRecord,
  type JournalEntry,
  type TodoItem,
  type WeeklySummary,
} from '../lib/db'
import type { DatabaseStatus } from '../types/app'
import { getErrorMessage } from '../utils/errors'

type LocalDataOptions = {
  onLoadError: (message: string) => void
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
  lastLoadedAt: '',
})

export const useLocalData = ({ onLoadError }: LocalDataOptions) => {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [boardLanes, setBoardLanes] = useState<BoardLaneRecord[]>([])
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([])
  const [changes, setChanges] = useState<ChangeLogRecord[]>([])
  const [weeklySummaries, setWeeklySummaries] = useState<WeeklySummary[]>([])
  const [hasLoadedLocalState, setHasLoadedLocalState] = useState(false)
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>(() => createInitialDatabaseStatus())

  const reload = useCallback(async () => {
    try {
      const nextState = await getLocalState()

      setEntries(nextState.entries)
      setTodos(nextState.todos)
      setBoardLanes(nextState.boardLanes)
      setAttachments(nextState.attachments)
      setChanges(nextState.changes)
      setWeeklySummaries(nextState.weeklySummaries)
      setDatabaseStatus({
        origin: window.location.origin,
        driver: nextState.meta.driver,
        databaseName: nextState.meta.databaseName,
        databasePath: nextState.meta.databasePath,
        syncBundleName: nextState.meta.syncBundleName,
        syncBundlePath: nextState.meta.syncBundlePath,
        apiBaseUrl: nextState.meta.apiBaseUrl,
        schemaVersion: nextState.meta.schemaVersion,
        lastLoadedAt: new Date().toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      })
      setHasLoadedLocalState(true)
    } catch (error) {
      onLoadError(getErrorMessage(error, '读取本地 SQLite 数据库失败。'))
    }
  }, [onLoadError])

  return {
    attachments,
    boardLanes,
    changes,
    databaseStatus,
    entries,
    hasLoadedLocalState,
    reload,
    setTodos,
    todos,
    weeklySummaries,
  }
}
