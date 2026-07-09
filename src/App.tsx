import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type TouchEvent } from 'react'
import { RefreshCw } from 'lucide-react'

import './App.css'
import { AppHeader } from './components/layout/AppHeader'
import { BottomNav } from './components/layout/BottomNav'
import { NavDrawer } from './components/layout/NavDrawer'
import DynamicBackground from './components/ui/dynamic-background'
import {
  aiConfigStorageKey,
  dashboardCardsStorageKey,
  defaultAiConfig,
  defaultDashboardCards,
  defaultWebDavConfig,
  emptyDraft,
  gameEngineSettingsStorageKey,
  navigationItems,
  readAiConfig,
  readDashboardCards,
  readGameEngineSettings,
  readThemeMode,
  readWebDavConfig,
  settingsSectionGroups,
  settingsSections,
  themeModeStorageKey,
  webDavLastAutoSyncStorageKey,
  webDavConfigStorageKey,
} from './config/app-shell'
import {
  addBoardLane,
  addTodo,
  deleteBoardLane,
  deleteAttachment,
  deleteJournalEntry,
  deleteTodo,
  exportSyncBundle,
  getApiUrl,
  getLocalState,
  localDatabaseDriver,
  localDatabaseName,
  pullWebDavSnapshot,
  pushWebDavSnapshot,
  setTodoDone,
  testWebDavConnection,
  updateTodoDetails,
  upsertWeeklySummary,
  upsertJournalEntry,
  type AttachmentRecord,
  type BoardLaneRecord,
  type ChangeLogRecord,
  type JournalEntry,
  type TodoDetailUpdate,
  type TodoItem,
  type WebDavConnectionTestResult,
  type WebDavSyncResult,
  type WeeklySummary,
} from './lib/db'
import { createGameEngineSnapshot, defaultGameEngineSettings, type GameEngineSettings } from './lib/gameEngine'
import {
  formatDateLabel,
  formatMonthLabel,
  formatShortDateLabel,
  getDateWindow,
  getTodayKey,
  getWeekDays,
  getWeekKey,
  shiftMonth,
} from './lib/calendar'
import {
  average,
  buildWeeklyPrompt,
  createCalendarCells,
  getCheckinRate,
  getCompletionRate,
  getCurrentStreak,
  getHeatLevel,
  getSignalValue,
  getLongestStreak,
  parseTags,
} from './lib/insights'
import type {
  ActiveView,
  AiConfig,
  DashboardCardConfig,
  DashboardCardId,
  DatabaseStatus,
  DraftState,
  SettingsSection,
  ThemeMode,
  WebDavConfig,
  WebDavTextConfigKey,
} from './types/app'
import { BoardView } from './views/BoardView'
import { DashboardView } from './views/DashboardView'
import { JournalView } from './views/JournalView'
import { SettingsView } from './views/SettingsView'
import { SummaryView } from './views/SummaryView'
import type { TrendPoint } from './components/ui/data-viz'

const navCollapseStorageKey = 'xinxiangyi-nav-collapsed-v1'
const desktopNavMediaQuery = '(min-width: 1024px), (orientation: landscape) and (min-width: 900px) and (min-height: 560px)'
const getSystemThemeMode = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
const getDesktopNavMode = () => window.matchMedia(desktopNavMediaQuery).matches

type DiagnosticDialogState = {
  title: string
  message: string
  details: string
  copied?: boolean
}

type ToastState = {
  id: number
  message: string
  tone: 'success' | 'error' | 'info'
  actionLabel?: string
  onAction?: () => void
}

const getErrorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`
  return `${Math.round(size / 1024 / 102.4) / 10} MB`
}

const formatWebDavSyncMessage = (result: WebDavSyncResult) => {
  const action = result.direction === 'pull' ? '已从云端拉取' : '已上传本机快照'
  const migration = result.migratedFile ? `；旧库已迁移为 ${result.migratedFile}` : ''

  return `${action} ${result.file} · ${formatBytes(result.size)}${migration}`
}

const isMissingRemoteSnapshotMessage = (message: string) =>
  /远端目录|同步快照不存在|远端同步快照不存在|ObjectNotFound|AncestorsNotFound|404|409|not found/i.test(message)

const formatDiagnosticDetails = (scope: string, error: unknown, extra: Record<string, unknown> = {}) => {
  const diagnostic = typeof error === 'object' && error && 'diagnostic' in error ? (error as { diagnostic?: unknown }).diagnostic : undefined

  return JSON.stringify(
    {
      scope,
      at: new Date().toISOString(),
      location: window.location.href,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      },
      extra,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
      diagnostic,
    },
    null,
    2,
  )
}

const completedTodoRetentionMs = 14 * 24 * 60 * 60 * 1000

const getTodoCompletedAt = (todo: TodoItem) => {
  const timestamp = new Date(todo.completedAt ?? todo.updatedAt).getTime()

  return Number.isFinite(timestamp) ? timestamp : null
}

function App() {
  const [activeView, setActiveView] = useState<ActiveView>('dashboard')
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [isNavCollapsed, setIsNavCollapsed] = useState(() => window.localStorage.getItem(navCollapseStorageKey) === '1')
  const [isDesktopNav, setIsDesktopNav] = useState(getDesktopNavMode)
  const [settingsMenuKey, setSettingsMenuKey] = useState(0)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('overview')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [boardLanes, setBoardLanes] = useState<BoardLaneRecord[]>([])
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([])
  const [changes, setChanges] = useState<ChangeLogRecord[]>([])
  const [weeklySummaries, setWeeklySummaries] = useState<WeeklySummary[]>([])
  const [selectedDate, setSelectedDate] = useState(getTodayKey)
  const [visibleMonth, setVisibleMonth] = useState(getTodayKey().slice(0, 7))
  const [selectedWeek, setSelectedWeek] = useState(getWeekKey(getTodayKey()))
  const [draft, setDraft] = useState<DraftState>(emptyDraft)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [todoTitle, setTodoTitle] = useState('')
  const [aiConfig, setAiConfig] = useState<AiConfig>(defaultAiConfig)
  const [webDavConfig, setWebDavConfig] = useState<WebDavConfig>(defaultWebDavConfig)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readThemeMode())
  const [systemThemeMode, setSystemThemeMode] = useState<'light' | 'dark'>(() => getSystemThemeMode())
  const [gameEngineSettings, setGameEngineSettings] = useState<GameEngineSettings>(defaultGameEngineSettings)
  const [dashboardCards, setDashboardCards] = useState<DashboardCardConfig[]>(defaultDashboardCards)
  const [summaryDraft, setSummaryDraft] = useState('')
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [, setWriteError] = useState('')
  const [toast, setToast] = useState<ToastState | null>(null)
  const [diagnosticDialog, setDiagnosticDialog] = useState<DiagnosticDialogState | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [hasLoadedLocalState, setHasLoadedLocalState] = useState(false)
  const [isWebDavSyncing, setIsWebDavSyncing] = useState(false)
  const [isTestingWebDav, setIsTestingWebDav] = useState(false)
  const [isExportingSyncBundle, setIsExportingSyncBundle] = useState(false)
  const [webDavTestResult, setWebDavTestResult] = useState<WebDavConnectionTestResult | null>(null)
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>({
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
  const contentShellRef = useRef<HTMLDivElement | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const pendingTodoDeleteTimersRef = useRef<Map<string, number>>(new Map())
  const completedTodoCleanupRef = useRef<Set<string>>(new Set())
  const pullStartYRef = useRef<number | null>(null)
  const pullDistanceRef = useRef(0)
  const [pullRefreshDistance, setPullRefreshDistance] = useState(0)
  const [isPullRefreshing, setIsPullRefreshing] = useState(false)

  useEffect(() => {
    const updateViewportMetrics = () => {
      const viewport = window.visualViewport
      const width = Math.round(viewport?.width ?? window.innerWidth)
      const height = Math.round(viewport?.height ?? window.innerHeight)

      document.documentElement.style.setProperty('--app-viewport-width', `${width}px`)
      document.documentElement.style.setProperty('--app-viewport-height', `${height}px`)
    }

    updateViewportMetrics()
    window.addEventListener('resize', updateViewportMetrics)
    window.addEventListener('orientationchange', updateViewportMetrics)
    window.visualViewport?.addEventListener('resize', updateViewportMetrics)

    return () => {
      window.removeEventListener('resize', updateViewportMetrics)
      window.removeEventListener('orientationchange', updateViewportMetrics)
      window.visualViewport?.removeEventListener('resize', updateViewportMetrics)
    }
  }, [])

  const showToast = useCallback((
    message: string,
    tone: ToastState['tone'] = 'info',
    options: { actionLabel?: string; onAction?: () => void; durationMs?: number } = {},
  ) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }

    setToast({
      id: Date.now(),
      message,
      tone,
      actionLabel: options.actionLabel,
      onAction: options.onAction,
    })

    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, options.durationMs ?? 3600)
  }, [])

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }

      for (const timer of pendingTodoDeleteTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
    },
    [],
  )

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
      const message = getErrorMessage(error, '读取本地 SQLite 数据库失败。')
      setWriteError(message)
      showToast(message, 'error')
    }
  }, [showToast])

  useEffect(() => {
    if (!hasLoadedLocalState) return

    const cutoff = Date.now() - completedTodoRetentionMs
    const staleTodos = todos.filter((todo) => {
      if (!todo.done || pendingTodoDeleteTimersRef.current.has(todo.id) || completedTodoCleanupRef.current.has(todo.id)) {
        return false
      }

      const completedAt = getTodoCompletedAt(todo)

      return completedAt != null && completedAt < cutoff
    })

    if (staleTodos.length === 0) return

    for (const todo of staleTodos) {
      completedTodoCleanupRef.current.add(todo.id)
    }

    void (async () => {
      try {
        await Promise.all(staleTodos.map((todo) => deleteTodo(todo)))
        await reload()
        showToast(`已自动清理 ${staleTodos.length} 个 14 天前完成的事项`, 'info')
      } catch (error) {
        for (const todo of staleTodos) {
          completedTodoCleanupRef.current.delete(todo.id)
        }

        const message = getErrorMessage(error, '自动清理已完成事项失败。')
        setWriteError(message)
        showToast(message, 'error')
      }
    })()
  }, [hasLoadedLocalState, reload, showToast, todos])

  const getActiveScrollTop = useCallback(() => {
    if (isDesktopNav) {
      return contentShellRef.current?.scrollTop ?? 0
    }

    return window.scrollY
  }, [isDesktopNav])

  const handlePullRefreshStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1 || getActiveScrollTop() > 0) {
      pullStartYRef.current = null
      return
    }

    pullStartYRef.current = event.touches[0]?.clientY ?? null
    pullDistanceRef.current = 0
  }, [getActiveScrollTop])

  const handlePullRefreshMove = useCallback((event: TouchEvent<HTMLDivElement>) => {
    const startY = pullStartYRef.current

    if (startY == null || isPullRefreshing || getActiveScrollTop() > 0) return

    const nextY = event.touches[0]?.clientY ?? startY
    const delta = nextY - startY

    if (delta <= 0) {
      pullDistanceRef.current = 0
      setPullRefreshDistance(0)
      return
    }

    const distance = Math.min(96, delta * 0.45)
    pullDistanceRef.current = distance
    setPullRefreshDistance(distance)

    if (distance > 8) {
      event.preventDefault()
    }
  }, [getActiveScrollTop, isPullRefreshing])

  const handlePullRefreshEnd = useCallback(() => {
    const distance = pullDistanceRef.current

    pullStartYRef.current = null
    pullDistanceRef.current = 0

    if (distance < 64 || isPullRefreshing) {
      setPullRefreshDistance(0)
      return
    }

    setIsPullRefreshing(true)
    setPullRefreshDistance(72)

    void reload().finally(() => {
      setIsPullRefreshing(false)
      setPullRefreshDistance(0)
    })
  }, [isPullRefreshing, reload])

  useEffect(() => {
    setAiConfig(readAiConfig())
    setWebDavConfig(readWebDavConfig())
    setThemeMode(readThemeMode())
    setGameEngineSettings(readGameEngineSettings())
    setDashboardCards(readDashboardCards())
    void reload()
  }, [reload])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      const matches = 'matches' in event ? event.matches : mediaQuery.matches
      setSystemThemeMode(matches ? 'dark' : 'light')
    }

    handleChange(mediaQuery)

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [])

  const resolvedThemeMode = themeMode === 'system' ? systemThemeMode : themeMode

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedThemeMode
    document.documentElement.dataset.themeMode = themeMode
  }, [resolvedThemeMode, themeMode])

  useEffect(() => {
    const mediaQuery = window.matchMedia(desktopNavMediaQuery)
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      const matches = 'matches' in event ? event.matches : mediaQuery.matches
      setIsDesktopNav(matches)

      if (matches) {
        setIsNavOpen(false)
      }
    }

    handleChange(mediaQuery)

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(navCollapseStorageKey, isNavCollapsed ? '1' : '0')
  }, [isNavCollapsed])

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.dateKey === selectedDate),
    [entries, selectedDate],
  )

  useEffect(() => {
    if (selectedEntry) {
      setDraft({
        title: selectedEntry.title,
        body: selectedEntry.body,
        moodText: selectedEntry.moodText,
        tags: selectedEntry.tags.join(' '),
      })
      return
    }

    setDraft(emptyDraft)
  }, [selectedEntry])

  const todayKey = getTodayKey()
  const entryByDate = useMemo(() => new Map(entries.map((entry) => [entry.dateKey, entry])), [entries])

  const attachmentCountByEntryId = useMemo(() => {
    const counts = new Map<string, number>()

    for (const attachment of attachments) {
      counts.set(attachment.entryId, (counts.get(attachment.entryId) ?? 0) + 1)
    }

    return counts
  }, [attachments])

  const dayTodos = useMemo(
    () =>
      todos
        .filter((todo) => todo.dateKey === selectedDate)
        .sort(
          (left, right) =>
            Number(left.done) - Number(right.done) ||
            right.createdAt.localeCompare(left.createdAt),
        ),
    [selectedDate, todos],
  )

  const selectedAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.entryId === selectedEntry?.id),
    [attachments, selectedEntry],
  )

  const lastSevenEntries = entries.slice(0, 7)
  const calendarCells = useMemo(() => createCalendarCells(visibleMonth, entries, todos), [entries, todos, visibleMonth])
  const selectedWeekDays = useMemo(() => getWeekDays(selectedWeek), [selectedWeek])
  const selectedWeekEntries = useMemo(
    () => entries.filter((entry) => selectedWeekDays.includes(entry.dateKey)),
    [entries, selectedWeekDays],
  )
  const selectedWeekTodos = useMemo(
    () => todos.filter((todo) => selectedWeekDays.includes(todo.dateKey)),
    [selectedWeekDays, todos],
  )
  const selectedWeekSummary = useMemo(
    () => weeklySummaries.find((summary) => summary.weekKey === selectedWeek),
    [selectedWeek, weeklySummaries],
  )

  const filteredBoardTodos = useMemo(() => {
    return [...todos].sort((left, right) => {
      if (left.done !== right.done) return Number(left.done) - Number(right.done)
      if (!left.done && left.dateKey !== right.dateKey) return left.dateKey.localeCompare(right.dateKey)

      return (right.completedAt ?? right.updatedAt).localeCompare(left.completedAt ?? left.updatedAt)
    })
  }, [todos])

  const pendingChangeCount = useMemo(
    () =>
      [...entries, ...todos, ...boardLanes, ...attachments, ...changes].filter((item) => item.syncState === 'pending').length,
    [attachments, boardLanes, changes, entries, todos],
  )
  const monthEntries = entries.filter((entry) => entry.dateKey.startsWith(visibleMonth))
  const monthTodos = todos.filter((todo) => todo.dateKey.startsWith(visibleMonth))
  const monthScore = average(monthEntries.map((entry) => entry.mood.score))
  const monthCompletionRate = getCompletionRate(monthTodos)
  const monthCheckinRate = getCheckinRate(entries, visibleMonth)
  const currentStreak = getCurrentStreak(entries)
  const longestStreak = getLongestStreak(entries)
  const selectedWeekScore = average(selectedWeekEntries.map((entry) => entry.mood.score))
  const selectedWeekCompletionRate = getCompletionRate(selectedWeekTodos)

  const gameEngineSnapshot = useMemo(
    () => createGameEngineSnapshot(entries, todos, attachments, gameEngineSettings),
    [attachments, entries, gameEngineSettings, todos],
  )

  const canSave = Boolean(draft.body.trim() || draft.moodText.trim() || draft.title.trim() || pendingFiles.length > 0)
  const canGenerateSummary = Boolean(aiConfig.endpoint.trim() && aiConfig.apiKey.trim() && selectedWeekEntries.length > 0)
  const isWebDavConfigured = Boolean(
    webDavConfig.url.trim() &&
      webDavConfig.username.trim() &&
      webDavConfig.password.trim() &&
      webDavConfig.remotePath.trim(),
  )

  const dashboardCardMetrics = [
    {
      id: 'streak' as const,
      label: '连续打卡',
      value: `${currentStreak} 天`,
    },
    {
      id: 'todoCompletion' as const,
      label: '事项完成',
      value: `${dayTodos.filter((todo) => todo.done).length}/${dayTodos.length}`,
    },
    {
      id: 'monthCheckin' as const,
      label: '本月打卡率',
      value: `${monthCheckinRate}%`,
    },
    {
      id: 'pendingSync' as const,
      label: '未同步内容',
      value: `${pendingChangeCount}`,
    },
    {
      id: 'attachments' as const,
      label: '图片',
      value: `${selectedAttachments.length + pendingFiles.length}`,
    },
  ]

  const visibleDashboardCards = dashboardCardMetrics.filter((card) =>
    dashboardCards.find((item) => item.id === card.id)?.enabled,
  )

  const trendDateKeys = useMemo(() => getDateWindow(selectedDate, 14), [selectedDate])
  const moodTrendPoints = useMemo<TrendPoint[]>(
    () =>
      trendDateKeys.map((dateKey) => ({
        label: formatShortDateLabel(dateKey),
        value: entryByDate.get(dateKey)?.mood.score ?? null,
      })),
    [entryByDate, trendDateKeys],
  )
  const selectedMoodTrendIndex = moodTrendPoints.length > 0 ? moodTrendPoints.length - 1 : undefined

  const lastSevenAverage = average(lastSevenEntries.map((entry) => entry.mood.score))
  const moodBreakdownItems = useMemo(() => {
    const sourceEntries = entries.slice(0, 7)
    const averageSignal = (key: keyof JournalEntry['mood']['signals']) =>
      average(sourceEntries.map((entry) => getSignalValue(entry.mood.signals, key)))

    return [
      { id: 'clarity', label: '清晰度', value: averageSignal('clarity'), note: '清楚、踏实、积极的表达' },
      { id: 'load', label: '负荷度', value: averageSignal('load'), note: '压力、疲惫与紧张的强度' },
      { id: 'energy', label: '能量感', value: averageSignal('energy'), note: '推进、专注与行动信号' },
      { id: 'recovery', label: '修复感', value: averageSignal('recovery'), note: '休息、恢复与被照顾感' },
      { id: 'reflection', label: '反思度', value: averageSignal('reflection'), note: '复盘、计划与自我观察' },
    ]
  }, [entries])
  const moodWindowAverage = average(moodTrendPoints.flatMap((point) => (point.value == null ? [] : [point.value])))

  const handleDraftChange =
    (key: keyof DraftState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft((current) => ({ ...current, [key]: event.target.value }))
    }

  const handleFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? [])

    if (nextFiles.length > 0) {
      setPendingFiles((current) => [...current, ...nextFiles])
    }

    event.target.value = ''
  }

  const handleRemovePendingFile = (index: number) => {
    setPendingFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSave || isSaving) return

    setIsSaving(true)
    setWriteError('')

    try {
      await upsertJournalEntry(
        {
          dateKey: selectedDate,
          title: draft.title.trim() || formatDateLabel(selectedDate),
          body: draft.body.trim(),
          moodText: draft.moodText.trim(),
          tags: parseTags(draft.tags),
        },
        pendingFiles,
      )
      setPendingFiles([])
      await reload()
      showToast('日记已保存', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '保存日记失败。')
      setWriteError(message)
      showToast(message, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddTodo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = todoTitle.trim()
    if (!title) return

    setWriteError('')

    try {
      await addTodo(selectedDate, title)
      setTodoTitle('')
      await reload()
      showToast('事项已添加', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '新增事项失败。')
      setWriteError(message)
      showToast(message, 'error')
    }
  }

  const handleAddTodoWithDetails = async (dateKey: string, title: string, details: TodoDetailUpdate) => {
    const nextTitle = title.trim()
    if (!nextTitle) return

    setWriteError('')

    try {
      await addTodo(dateKey, nextTitle, details)
      setTodoTitle('')
      await reload()
      showToast('事项已添加', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '新增事项失败。')
      setWriteError(message)
      showToast(message, 'error')
    }
  }

  const handleUpdateTodoDetails = async (todo: TodoItem, details: TodoDetailUpdate) => {
    setWriteError('')

    try {
      await updateTodoDetails(todo, details)
      await reload()
    } catch (error) {
      const message = getErrorMessage(error, '更新事项详情失败。')
      setWriteError(message)
      showToast(message, 'error')
    }
  }

  const handleAddBoardLane = async (label: string, colorId: string) => {
    setWriteError('')

    try {
      await addBoardLane(label, colorId)
      await reload()
      showToast('栏目已添加', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '新增栏目失败。')
      setWriteError(message)
      showToast(message, 'error')
    }
  }

  const handleDeleteBoardLane = async (lane: BoardLaneRecord) => {
    const confirmed = window.confirm(`确认删除栏目「${lane.label}」吗？该栏目下的待做事项会回到「待做」。`)
    if (!confirmed) return

    setWriteError('')

    try {
      await deleteBoardLane(lane)
      await reload()
      showToast('栏目已删除，相关事项已回到待做', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '删除栏目失败。')
      setWriteError(message)
      showToast(message, 'error')
    }
  }

  const handleToggleTodo = async (todo: TodoItem) => {
    setWriteError('')

    try {
      await setTodoDone(todo, !todo.done)
      await reload()
      showToast(todo.done ? '事项已标记未完成' : '事项已完成', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '更新事项失败。')
      setWriteError(message)
      showToast(message, 'error')
    }
  }

  const handleDeleteTodo = async (todo: TodoItem) => {
    setWriteError('')
    if (pendingTodoDeleteTimersRef.current.has(todo.id)) return

    setTodos((current) => current.filter((item) => item.id !== todo.id))

    const undoDelete = () => {
      const timer = pendingTodoDeleteTimersRef.current.get(todo.id)
      if (timer) window.clearTimeout(timer)
      pendingTodoDeleteTimersRef.current.delete(todo.id)
      setTodos((current) =>
        current.some((item) => item.id === todo.id)
          ? current
          : [...current, todo].sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.createdAt.localeCompare(right.createdAt)),
      )
      showToast('已撤回删除', 'info')
    }

    const timer = window.setTimeout(() => {
      pendingTodoDeleteTimersRef.current.delete(todo.id)
      void (async () => {
        try {
          await deleteTodo(todo)
          await reload()
          showToast('事项已删除', 'success')
        } catch (error) {
          const message = getErrorMessage(error, '删除事项失败。')
          setWriteError(message)
          setTodos((current) => (current.some((item) => item.id === todo.id) ? current : [...current, todo]))
          showToast(message, 'error')
        }
      })()
    }, 5200)

    pendingTodoDeleteTimersRef.current.set(todo.id, timer)
    showToast('事项已移除', 'info', {
      actionLabel: '撤回',
      onAction: undoDelete,
      durationMs: 5200,
    })
  }

  const handleDeleteAttachment = async (attachment: AttachmentRecord) => {
    setWriteError('')

    try {
      await deleteAttachment(attachment)
      await reload()
      showToast('图片已删除', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '删除附件失败。')
      setWriteError(message)
      showToast(message, 'error')
    }
  }

  const handleDeleteJournalEntry = async (entry: JournalEntry) => {
    const confirmed = window.confirm(`确认删除 ${entry.dateKey} 的日记记录吗？这会同时删除关联图片。`)
    if (!confirmed) return

    setWriteError('')

    try {
      await deleteJournalEntry(entry)
      await reload()
      showToast('日记已删除', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '删除日记失败。')
      setWriteError(message)
      showToast(message, 'error')
    }
  }

  const navigateTo = (view: ActiveView) => {
    setActiveView(view)
    if (!isDesktopNav) {
      setIsNavOpen(false)
    }
  }

  const openSettingsSection = (section: SettingsSection) => {
    setSettingsSection(section)
    navigateTo('settings')
  }

  const openSettingsMenu = () => {
    setSettingsSection('overview')
    setSettingsMenuKey((current) => current + 1)
    navigateTo('settings')
  }

  const focusDate = (dateKey: string, nextView: ActiveView = activeView) => {
    setSelectedDate(dateKey)
    setSelectedWeek(getWeekKey(dateKey))
    setVisibleMonth(dateKey.slice(0, 7))
    navigateTo(nextView)
  }

  const handleAiConfigChange =
    (key: keyof AiConfig) => (event: ChangeEvent<HTMLInputElement>) => {
      const next = { ...aiConfig, [key]: event.target.value }
      setAiConfig(next)
      window.localStorage.setItem(aiConfigStorageKey, JSON.stringify(next))
    }

  const handleWebDavConfigChange =
    (key: WebDavTextConfigKey) => (event: ChangeEvent<HTMLInputElement>) => {
      const next = { ...webDavConfig, [key]: event.target.value }
      setWebDavConfig(next)
      window.localStorage.setItem(webDavConfigStorageKey, JSON.stringify(next))
    }

  const handleWebDavAutoSyncChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = { ...webDavConfig, autoSyncDaily: event.target.checked }
    setWebDavConfig(next)
    window.localStorage.setItem(webDavConfigStorageKey, JSON.stringify(next))
  }

  const handleTestWebDavConnection = async () => {
    if (isTestingWebDav) return

    if (!isWebDavConfigured) {
      const message = '请先填写 WebDAV Server URL、用户名、应用密码和远端目录。'
      setWebDavTestResult({
        ok: false,
        pathExists: false,
        writable: false,
        status: 0,
        remotePath: webDavConfig.remotePath,
        checkedAt: new Date().toISOString(),
        message,
      })
      showToast(message, 'error')
      return
    }

    setIsTestingWebDav(true)
    setWebDavTestResult(null)

    try {
      const result = await testWebDavConnection(webDavConfig)
      setWebDavTestResult(result)
      showToast(result.message, result.ok ? 'success' : 'error')
    } catch (error) {
      const message = getErrorMessage(error, 'WebDAV 连接测试失败。')
      const actionableMessage =
        message === 'API route not found.'
          ? '本地 SQLite API 还没有重启到支持 WebDAV 测试的新版本。请重启 npm run dev 后再测试。'
          : message

      setWebDavTestResult({
        ok: false,
        pathExists: false,
        writable: false,
        status: 0,
        remotePath: webDavConfig.remotePath,
        checkedAt: new Date().toISOString(),
        message: actionableMessage,
      })
      showToast(actionableMessage, 'error')
      setDiagnosticDialog({
        title: 'WebDAV 测试诊断',
        message: actionableMessage,
        details: formatDiagnosticDetails('webdav.test', error, {
          url: webDavConfig.url,
          remotePath: webDavConfig.remotePath,
          usernameLength: webDavConfig.username.length,
        }),
      })
    } finally {
      setIsTestingWebDav(false)
    }
  }

  const handleExportSyncBundle = async () => {
    if (isExportingSyncBundle) return

    setIsExportingSyncBundle(true)
    setWriteError('')

    try {
      const result = await exportSyncBundle()
      const files = result.files.map((file) => file.name).join('、')

      showToast(`本地同步包已生成：${result.path}；包含 ${files}`, 'success')
      await reload()
    } catch (error) {
      const message = getErrorMessage(error, '生成本地同步包失败。')

      setWriteError(message)
      showToast(message, 'error')
      setDiagnosticDialog({
        title: '本地同步包诊断',
        message,
        details: formatDiagnosticDetails('sync-bundle.export', error),
      })
    } finally {
      setIsExportingSyncBundle(false)
    }
  }

  const handleThemeModeChange = (next: ThemeMode) => {
    setThemeMode(next)
    window.localStorage.setItem(themeModeStorageKey, next)
  }

  const persistGameEngineSettings = (next: GameEngineSettings) => {
    setGameEngineSettings(next)
    window.localStorage.setItem(gameEngineSettingsStorageKey, JSON.stringify(next))
  }

  const handleSnapshotDaysChange = (event: ChangeEvent<HTMLInputElement>) => {
    const snapshotDays = Math.min(365, Math.max(7, Number(event.target.value) || defaultGameEngineSettings.snapshotDays))

    persistGameEngineSettings({ ...gameEngineSettings, snapshotDays })
  }

  const persistDashboardCards = (next: DashboardCardConfig[]) => {
    setDashboardCards(next)
    window.localStorage.setItem(dashboardCardsStorageKey, JSON.stringify(next))
  }

  const toggleDashboardCard = (cardId: DashboardCardId) => {
    persistDashboardCards(
      dashboardCards.map((card) => (card.id === cardId ? { ...card, enabled: !card.enabled } : card)),
    )
  }

  const handleWebDavSync = useCallback(async (source: 'manual' | 'startup' = 'manual') => {
    if (isWebDavSyncing) return

    if (!isWebDavConfigured) {
      if (source === 'manual') {
        const message = '请先配置 WebDAV'
        setWriteError(message)
        showToast(message, 'error')
        setSettingsSection('webdav')
        setActiveView('settings')
        if (!isDesktopNav) {
          setIsNavOpen(false)
        }
      }
      return
    }

    setIsWebDavSyncing(true)
    setWriteError('')

    try {
      const shouldPush = pendingChangeCount > 0
      const result = await (shouldPush ? pushWebDavSnapshot(webDavConfig) : pullWebDavSnapshot(webDavConfig))

      window.localStorage.setItem(webDavLastAutoSyncStorageKey, todayKey)
      showToast(formatWebDavSyncMessage(result), 'success')
      await reload()
    } catch (error) {
      const message = getErrorMessage(error, '同步失败。')

      if (source === 'manual' && pendingChangeCount === 0 && isMissingRemoteSnapshotMessage(message)) {
        try {
          const result = await pushWebDavSnapshot(webDavConfig)

          window.localStorage.setItem(webDavLastAutoSyncStorageKey, todayKey)
          showToast(`远端目录已初始化；${formatWebDavSyncMessage(result)}`, 'success')
          await reload()
          return
        } catch (fallbackError) {
          const fallbackMessage = getErrorMessage(fallbackError, '初始化远端同步目录失败。')

          setWriteError(fallbackMessage)
          showToast(fallbackMessage, 'error')
          setDiagnosticDialog({
            title: 'WebDAV 初始化诊断',
            message: fallbackMessage,
            details: formatDiagnosticDetails('webdav.sync.initialize', fallbackError, {
              url: webDavConfig.url,
              remotePath: webDavConfig.remotePath,
              usernameLength: webDavConfig.username.length,
              pendingChangeCount,
              originalPullError: message,
            }),
          })
          return
        }
      }

      if (source === 'manual') {
        setWriteError(message)
        showToast(message, 'error')
        setDiagnosticDialog({
          title: 'WebDAV 同步诊断',
          message,
          details: formatDiagnosticDetails('webdav.sync', error, {
            url: webDavConfig.url,
            remotePath: webDavConfig.remotePath,
            usernameLength: webDavConfig.username.length,
            pendingChangeCount,
            intendedDirection: pendingChangeCount > 0 ? 'push' : 'pull',
          }),
        })
      }
    } finally {
      setIsWebDavSyncing(false)
    }
  }, [
    isDesktopNav,
    isWebDavConfigured,
    isWebDavSyncing,
    pendingChangeCount,
    reload,
    showToast,
    todayKey,
    webDavConfig,
  ])

  const handleWebDavRestoreFromCloud = useCallback(async () => {
    if (isWebDavSyncing) return

    if (!isWebDavConfigured) {
      const message = '请先配置 WebDAV'
      setWriteError(message)
      showToast(message, 'error')
      setSettingsSection('webdav')
      setActiveView('settings')
      return
    }

    const confirmed = window.confirm('从云端恢复会用远端快照替换本机数据。本机尚未同步的记录可能丢失，确定继续吗？')
    if (!confirmed) return

    setIsWebDavSyncing(true)
    setWriteError('')

    try {
      const result = await pullWebDavSnapshot(webDavConfig)

      window.localStorage.setItem(webDavLastAutoSyncStorageKey, todayKey)
      showToast(formatWebDavSyncMessage(result), 'success')
      await reload()
    } catch (error) {
      const message = getErrorMessage(error, '从云端恢复失败。')
      setWriteError(message)
      showToast(message, 'error')
      setDiagnosticDialog({
        title: 'WebDAV 恢复诊断',
        message,
        details: formatDiagnosticDetails('webdav.restore', error, {
          url: webDavConfig.url,
          remotePath: webDavConfig.remotePath,
          usernameLength: webDavConfig.username.length,
          pendingChangeCount,
        }),
      })
    } finally {
      setIsWebDavSyncing(false)
    }
  }, [
    isWebDavConfigured,
    isWebDavSyncing,
    pendingChangeCount,
    reload,
    showToast,
    todayKey,
    webDavConfig,
  ])

  useEffect(() => {
    if (!hasLoadedLocalState || !webDavConfig.autoSyncDaily || !isWebDavConfigured || isWebDavSyncing) return
    if (window.localStorage.getItem(webDavLastAutoSyncStorageKey) === todayKey) return

    void handleWebDavSync('startup')
  }, [handleWebDavSync, hasLoadedLocalState, isWebDavConfigured, isWebDavSyncing, todayKey, webDavConfig.autoSyncDaily])

  const handleGenerateSummary = async () => {
    if (!canGenerateSummary || isGeneratingSummary) return

    setIsGeneratingSummary(true)
    setSummaryError('')

    try {
      const response = await fetch(getApiUrl('/api/ai/weekly-summary'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: aiConfig.endpoint.trim(),
          apiKey: aiConfig.apiKey.trim(),
          model: aiConfig.model.trim(),
          messages: [
            {
              role: 'system',
              content: '你是一个克制、温和、具体的个人复盘助手。只根据用户给出的本地记录总结，不臆测。',
            },
            {
              role: 'user',
              content: buildWeeklyPrompt(selectedWeek, selectedWeekEntries, selectedWeekTodos),
            },
          ],
          temperature: 0.4,
        }),
      })
      const payload = (await response.json()) as { content?: string; error?: string }
      const content = payload.content?.trim() ?? ''

      if (!response.ok) {
        throw new Error(payload.error || `请求失败：${response.status}`)
      }

      if (!content) {
        throw new Error('模型没有返回可用内容。')
      }

      const summary = await upsertWeeklySummary(selectedWeek, content, aiConfig.model.trim())
      setSummaryDraft(summary.content)
      await reload()
      showToast('周总结已生成', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '生成周总结失败。')
      setSummaryError(message)
      showToast(message, 'error')
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  const handleSaveSummaryDraft = async () => {
    const content = summaryDraft.trim()
    if (!content) return

    setSummaryError('')

    try {
      await upsertWeeklySummary(selectedWeek, content, 'manual', 'local')
      await reload()
      showToast('周总结已保存', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '保存周总结失败。')
      setSummaryError(message)
      showToast(message, 'error')
    }
  }

  const handleCopyDiagnosticDetails = async () => {
    if (!diagnosticDialog) return

    try {
      await navigator.clipboard.writeText(diagnosticDialog.details)
      setDiagnosticDialog({ ...diagnosticDialog, copied: true })
    } catch {
      setDiagnosticDialog({ ...diagnosticDialog, copied: false })
    }
  }

  useEffect(() => {
    setSummaryDraft(selectedWeekSummary?.content ?? '')
  }, [selectedWeekSummary])

  const activeNavItem = navigationItems.find((item) => item.id === activeView)
  const todayHeaderLabel = formatDateLabel(todayKey)

  return (
    <main className="shell">
      <DynamicBackground mode={resolvedThemeMode} />
      <div
        className={`app-shell ${isDesktopNav ? 'app-shell-desktop-nav' : 'app-shell-bottom-nav'}`}
        style={{ ['--nav-width' as string]: isNavCollapsed ? '88px' : '296px' }}
      >
        {isDesktopNav && (
          <NavDrawer
            isDesktop={isDesktopNav}
            isOpen={isNavOpen}
            isCollapsed={isNavCollapsed}
            activeView={activeView}
            navigationItems={navigationItems}
            onClose={() => setIsNavOpen(false)}
            onNavigate={navigateTo}
            onToggleCollapse={() => setIsNavCollapsed((current) => !current)}
          />
        )}

        <div
          className="content-shell"
          ref={contentShellRef}
          onTouchStart={handlePullRefreshStart}
          onTouchMove={handlePullRefreshMove}
          onTouchEnd={handlePullRefreshEnd}
          onTouchCancel={handlePullRefreshEnd}
        >
          <div
            className={`pull-refresh-indicator ${pullRefreshDistance > 0 || isPullRefreshing ? 'pull-refresh-indicator-visible' : ''}`}
            style={{ transform: `translate(-50%, ${Math.round(pullRefreshDistance * 0.36)}px)` }}
            aria-hidden={pullRefreshDistance === 0 && !isPullRefreshing}
          >
            <RefreshCw className={isPullRefreshing ? 'animate-spin' : ''} size={15} aria-hidden="true" />
            <span>{isPullRefreshing ? '刷新中' : pullRefreshDistance >= 64 ? '松开刷新' : '下拉刷新'}</span>
          </div>
          <div className="page">
            <AppHeader
              isDesktopNav={isDesktopNav}
              todayLabel={todayHeaderLabel}
              activeViewLabel={activeNavItem?.label ?? '仪表盘'}
              isWebDavSyncing={isWebDavSyncing}
              onSyncWebDav={() => void handleWebDavSync('manual')}
              onOpenSettings={openSettingsMenu}
            />

            {activeView === 'dashboard' ? (
          <DashboardView
            selectedDate={selectedDate}
            selectedDateLabel={formatDateLabel(selectedDate)}
            isToday={selectedDate === todayKey}
            visibleDashboardCards={visibleDashboardCards}
            selectedEntry={selectedEntry}
            draft={draft}
            pendingFiles={pendingFiles}
            selectedAttachments={selectedAttachments}
            canSave={canSave}
            isSaving={isSaving}
            dayTodos={dayTodos}
            todoTitle={todoTitle}
            lastSevenAverage={lastSevenAverage}
            lastSevenEntryCount={lastSevenEntries.length}
            moodBreakdownItems={moodBreakdownItems}
            moodTrendPoints={moodTrendPoints}
            selectedMoodTrendIndex={selectedMoodTrendIndex}
            trendStartLabel={trendDateKeys[0]}
            trendEndLabel={trendDateKeys[trendDateKeys.length - 1]}
            moodWindowAverage={moodWindowAverage}
            onDateChange={(dateKey) => focusDate(dateKey, 'dashboard')}
            onGoToday={() => focusDate(todayKey, 'dashboard')}
            onDraftChange={handleDraftChange}
            onFilesChange={handleFilesChange}
            onSave={handleSave}
            onTodoTitleChange={setTodoTitle}
            onAddTodo={handleAddTodo}
            onToggleTodo={(todo) => void handleToggleTodo(todo)}
            onDeleteTodo={(todo) => void handleDeleteTodo(todo)}
            onDeleteAttachment={(attachment) => void handleDeleteAttachment(attachment)}
            onRemovePendingFile={handleRemovePendingFile}
            getCompletionRate={getCompletionRate}
          />
            ) : activeView === 'journal' ? (
          <JournalView
            entries={entries}
            todos={todos}
            currentStreak={currentStreak}
            pendingChangeCount={pendingChangeCount}
            attachmentCountByEntryId={attachmentCountByEntryId}
            onFocusDate={focusDate}
            onDeleteEntry={(entry) => void handleDeleteJournalEntry(entry)}
          />
            ) : activeView === 'board' ? (
          <BoardView
            todos={todos}
            filteredBoardTodos={filteredBoardTodos}
            boardLanes={boardLanes}
            entryByDate={entryByDate}
            selectedDate={selectedDate}
            todoTitle={todoTitle}
            onFocusDate={focusDate}
            onTodoTitleChange={setTodoTitle}
            onAddTodoWithDetails={(dateKey, title, details) => void handleAddTodoWithDetails(dateKey, title, details)}
            onUpdateTodoDetails={(todo, details) => void handleUpdateTodoDetails(todo, details)}
            onAddBoardLane={(label, colorId) => void handleAddBoardLane(label, colorId)}
            onDeleteBoardLane={(lane) => void handleDeleteBoardLane(lane)}
            onToggleTodo={(todo) => void handleToggleTodo(todo)}
            onDeleteTodo={(todo) => void handleDeleteTodo(todo)}
          />
            ) : activeView === 'summary' ? (
          <SummaryView
            visibleMonthLabel={formatMonthLabel(visibleMonth)}
            monthScore={monthScore}
            monthCheckinRate={monthCheckinRate}
            monthCompletionRate={monthCompletionRate}
            currentStreak={currentStreak}
            longestStreak={longestStreak}
            monthEntriesCount={monthEntries.length}
            calendarCells={calendarCells}
            selectedDate={selectedDate}
            selectedWeek={selectedWeek}
            selectedWeekScore={selectedWeekScore}
            selectedWeekEntryCount={selectedWeekEntries.length}
            selectedWeekCompletionRate={selectedWeekCompletionRate}
            selectedWeekDays={selectedWeekDays}
            entries={entries}
            todos={todos}
            aiConfigured={Boolean(aiConfig.apiKey)}
            aiModel={aiConfig.model}
            canGenerateSummary={canGenerateSummary}
            isGeneratingSummary={isGeneratingSummary}
            summaryDraft={summaryDraft}
            summaryError={summaryError}
            todoTitle={todoTitle}
            onPreviousMonth={() => setVisibleMonth(shiftMonth(visibleMonth, -1))}
            onNextMonth={() => setVisibleMonth(shiftMonth(visibleMonth, 1))}
            onFocusDate={(dateKey) => focusDate(dateKey, 'summary')}
            onSelectedWeekChange={(dateKey) => setSelectedWeek(getWeekKey(dateKey))}
            onOpenAiSettings={() => openSettingsSection('ai')}
            onGenerateSummary={() => void handleGenerateSummary()}
            onSummaryDraftChange={setSummaryDraft}
            onSaveSummary={() => void handleSaveSummaryDraft()}
            onTodoTitleChange={setTodoTitle}
            onAddTodo={handleAddTodo}
            onToggleTodo={(todo) => void handleToggleTodo(todo)}
            onDeleteTodo={(todo) => void handleDeleteTodo(todo)}
            getCompletionRate={getCompletionRate}
            getHeatLevel={getHeatLevel}
          />
            ) : (
          <SettingsView
            settingsSection={settingsSection}
            settingsSections={settingsSections}
            settingsSectionGroups={settingsSectionGroups}
            isDesktopNav={isDesktopNav}
            settingsMenuKey={settingsMenuKey}
            databaseStatus={databaseStatus}
            entriesCount={entries.length}
            todosCount={todos.length}
            attachmentsCount={attachments.length}
            weeklySummariesCount={weeklySummaries.length}
            changesCount={changes.length}
            pendingChangeCount={pendingChangeCount}
            gameEngineSnapshot={gameEngineSnapshot}
            gameEngineSettings={gameEngineSettings}
            dashboardCards={dashboardCards}
            dashboardCardMetrics={dashboardCardMetrics}
            visibleDashboardCards={visibleDashboardCards}
            aiConfig={aiConfig}
            webDavConfig={webDavConfig}
            isTestingWebDav={isTestingWebDav}
            isWebDavSyncing={isWebDavSyncing}
            isExportingSyncBundle={isExportingSyncBundle}
            webDavTestResult={webDavTestResult}
            themeMode={themeMode}
            resolvedThemeMode={resolvedThemeMode}
            onSettingsSectionChange={setSettingsSection}
            onReload={() => void reload()}
            onToggleDashboardCard={toggleDashboardCard}
            onAiConfigChange={handleAiConfigChange}
            onWebDavConfigChange={handleWebDavConfigChange}
            onWebDavAutoSyncChange={handleWebDavAutoSyncChange}
            onTestWebDavConnection={() => void handleTestWebDavConnection()}
            onExportSyncBundle={() => void handleExportSyncBundle()}
            onRestoreWebDavSnapshot={() => void handleWebDavRestoreFromCloud()}
            onThemeModeChange={handleThemeModeChange}
            onSnapshotDaysChange={handleSnapshotDaysChange}
          />
            )}
          </div>
        </div>
      </div>
      {toast && (
        <div className="toast-region" role="status" aria-live="polite">
          <div className={`app-toast app-toast-${toast.tone}`} key={toast.id}>
            <span className="toast-dot" aria-hidden="true" />
            <p>{toast.message}</p>
            <button className="toast-close" type="button" aria-label="关闭提示" onClick={() => setToast(null)}>
              X
            </button>
            {toast.actionLabel && toast.onAction && (
              <button className="toast-action" type="button" onClick={toast.onAction}>
                {toast.actionLabel}
              </button>
            )}
          </div>
        </div>
      )}
      {diagnosticDialog && (
        <div className="diagnostic-backdrop" role="presentation">
          <section className="diagnostic-dialog" role="dialog" aria-modal="true" aria-labelledby="diagnostic-title">
            <div className="section-head mb-3">
              <div>
                <p className="eyebrow">Diagnostics</p>
                <h2 className="section-title text-lg" id="diagnostic-title">
                  {diagnosticDialog.title}
                </h2>
              </div>
              <button className="icon-button" type="button" aria-label="关闭诊断" onClick={() => setDiagnosticDialog(null)}>
                X
              </button>
            </div>
            <p className="diagnostic-message">{diagnosticDialog.message}</p>
            <textarea className="diagnostic-details" readOnly value={diagnosticDialog.details} />
            <div className="diagnostic-actions">
              <button className="button-secondary min-h-10 px-3" type="button" onClick={() => void handleCopyDiagnosticDetails()}>
                {diagnosticDialog.copied ? '已复制' : '复制详情'}
              </button>
              <button className="button-primary min-h-10 px-3" type="button" onClick={() => setDiagnosticDialog(null)}>
                关闭
              </button>
            </div>
          </section>
        </div>
      )}
      {!isDesktopNav && <BottomNav activeView={activeView} navigationItems={navigationItems} onNavigate={navigateTo} />}
    </main>
  )
}

export default App
