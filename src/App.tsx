import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { RefreshCw } from 'lucide-react'

import './App.css'
import { AppHeader } from './components/layout/AppHeader'
import { BottomNav } from './components/layout/BottomNav'
import { NavDrawer } from './components/layout/NavDrawer'
import DynamicBackground from './components/ui/dynamic-background'
import {
  emptyDraft,
  navigationItems,
  settingsSectionGroups,
  settingsSections,
  webDavLastAutoSyncStorageKey,
} from './config/app-shell'
import { useAppPreferences } from './hooks/use-app-preferences'
import { useLocalData } from './hooks/use-local-data'
import { usePullRefresh } from './hooks/use-pull-refresh'
import { useResponsiveNav } from './hooks/use-responsive-nav'
import { useThemeMode } from './hooks/use-theme-mode'
import { useToast } from './hooks/use-toast'
import { useViewportMetrics } from './hooks/use-viewport-metrics'
import {
  addBoardLane,
  addTodo,
  deleteBoardLane,
  deleteAttachment,
  deleteJournalEntry,
  deleteTodo,
  exportSyncBundle,
  getApiUrl,
  pullWebDavSnapshot,
  pushWebDavSnapshot,
  setTodoDone,
  testWebDavConnection,
  updateTodoDetails,
  upsertWeeklySummary,
  upsertJournalEntry,
  type AttachmentRecord,
  type BoardLaneRecord,
  type JournalEntry,
  type TodoDetailUpdate,
  type TodoItem,
  type WebDavConnectionTestResult,
} from './lib/db'
import { createGameEngineSnapshot } from './lib/gameEngine'
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
  CountdownTodoOption,
  DraftState,
  SettingsSection,
} from './types/app'
import { formatCountdownDays, getCountdownDaysRemaining, getCountdownTone, sortCountdownTodos } from './utils/countdown'
import { formatDiagnosticDetails, type DiagnosticDialogState } from './utils/diagnostics'
import { getErrorMessage } from './utils/errors'
import { completedTodoRetentionMs, getTodoCompletedAt, sortTodosByDateThenCreatedAt } from './utils/todo'
import { formatWebDavSyncMessage, isMissingRemoteSnapshotMessage } from './utils/webdav'
import { BoardView } from './views/BoardView'
import { DashboardView } from './views/DashboardView'
import { JournalView } from './views/JournalView'
import { SettingsView } from './views/SettingsView'
import { SummaryView } from './views/SummaryView'
import type { TrendPoint } from './components/ui/data-viz'

const getInitialDateState = () => {
  const dateKey = getTodayKey()

  return {
    dateKey,
    monthKey: dateKey.slice(0, 7),
    weekKey: getWeekKey(dateKey),
  }
}

function App() {
  useViewportMetrics()

  const { toast, setToast, showToast } = useToast()
  const handleLocalDataError = useCallback((message: string) => showToast(message, 'error'), [showToast])
  const {
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
  } = useLocalData({ onLoadError: handleLocalDataError })
  const {
    aiConfig,
    dashboardCards,
    gameEngineSettings,
    handleAiConfigChange,
    handleSnapshotDaysChange,
    handleWebDavAutoSyncChange,
    handleWebDavConfigChange,
    isWebDavConfigured,
    selectedCountdownTodoId,
    setSelectedCountdownTodoId,
    toggleDashboardCard,
    webDavConfig,
  } = useAppPreferences()
  const { resolvedThemeMode, setThemeMode: handleThemeModeChange, themeMode } = useThemeMode()
  const { isDesktopNav, isNavCollapsed, isNavOpen, setIsNavCollapsed, setIsNavOpen } = useResponsiveNav()
  const initialDateState = useMemo(() => getInitialDateState(), [])
  const [activeView, setActiveView] = useState<ActiveView>('dashboard')
  const [settingsMenuKey, setSettingsMenuKey] = useState(0)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('overview')
  const [selectedDate, setSelectedDate] = useState(initialDateState.dateKey)
  const [visibleMonth, setVisibleMonth] = useState(initialDateState.monthKey)
  const [selectedWeek, setSelectedWeek] = useState(initialDateState.weekKey)
  const [draft, setDraft] = useState<DraftState>(emptyDraft)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [todoTitle, setTodoTitle] = useState('')
  const [summaryDraft, setSummaryDraft] = useState('')
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [diagnosticDialog, setDiagnosticDialog] = useState<DiagnosticDialogState | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isWebDavSyncing, setIsWebDavSyncing] = useState(false)
  const [isTestingWebDav, setIsTestingWebDav] = useState(false)
  const [isExportingSyncBundle, setIsExportingSyncBundle] = useState(false)
  const [webDavTestResult, setWebDavTestResult] = useState<WebDavConnectionTestResult | null>(null)
  const contentShellRef = useRef<HTMLDivElement | null>(null)
  const pendingTodoDeleteTimersRef = useRef<Map<string, number>>(new Map())
  const completedTodoCleanupRef = useRef<Set<string>>(new Set())
  const { isPullRefreshing, pullRefreshDistance, pullRefreshHandlers } = usePullRefresh({
    contentShellRef,
    isDesktopNav,
    onRefresh: reload,
  })

  useEffect(
    () => () => {
      for (const timer of pendingTodoDeleteTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
    },
    [],
  )

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
        showToast(message, 'error')
      }
    })()
  }, [hasLoadedLocalState, reload, showToast, todos])

  useEffect(() => {
    void reload()
  }, [reload])

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
  const countdownTodoOptions = useMemo<CountdownTodoOption[]>(
    () =>
      todos
        .filter((todo) => todo.countdownEnabled && !todo.done)
        .sort(sortCountdownTodos)
        .map((todo) => {
          const daysRemaining = getCountdownDaysRemaining(todo.dateKey)

          return {
            id: todo.id,
            title: todo.title,
            dateKey: todo.dateKey,
            daysRemaining,
            label: `${todo.title} · ${todo.dateKey}`,
            value: formatCountdownDays(daysRemaining),
          }
        }),
    [todos],
  )
  const selectedCountdownTodo = useMemo(
    () =>
      countdownTodoOptions.find((todo) => todo.id === selectedCountdownTodoId) ??
      countdownTodoOptions[0],
    [countdownTodoOptions, selectedCountdownTodoId],
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
      id: 'countdown' as const,
      label: selectedCountdownTodo ? `倒计时 · ${selectedCountdownTodo.title}` : '倒计时',
      value: selectedCountdownTodo ? selectedCountdownTodo.value : '未开启',
      tone: selectedCountdownTodo ? getCountdownTone(selectedCountdownTodo.daysRemaining) : undefined,
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
      showToast(message, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddTodo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = todoTitle.trim()
    if (!title) return

    try {
      await addTodo(selectedDate, title)
      setTodoTitle('')
      await reload()
      showToast('事项已添加', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '新增事项失败。')
      showToast(message, 'error')
    }
  }

  const handleAddTodoWithDetails = async (dateKey: string, title: string, details: TodoDetailUpdate) => {
    const nextTitle = title.trim()
    if (!nextTitle) return

    try {
      await addTodo(dateKey, nextTitle, details)
      setTodoTitle('')
      await reload()
      showToast('事项已添加', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '新增事项失败。')
      showToast(message, 'error')
    }
  }

  const handleUpdateTodoDetails = async (todo: TodoItem, details: TodoDetailUpdate) => {
    try {
      await updateTodoDetails(todo, details)
      await reload()
    } catch (error) {
      const message = getErrorMessage(error, '更新事项详情失败。')
      showToast(message, 'error')
    }
  }

  const handleAddBoardLane = async (label: string, colorId: string) => {
    try {
      await addBoardLane(label, colorId)
      await reload()
      showToast('栏目已添加', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '新增栏目失败。')
      showToast(message, 'error')
    }
  }

  const handleDeleteBoardLane = async (lane: BoardLaneRecord) => {
    const confirmed = window.confirm(`确认删除栏目「${lane.label}」吗？该栏目下的待做事项会回到「待做」。`)
    if (!confirmed) return

    try {
      await deleteBoardLane(lane)
      await reload()
      showToast('栏目已删除，相关事项已回到待做', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '删除栏目失败。')
      showToast(message, 'error')
    }
  }

  const handleToggleTodo = async (todo: TodoItem) => {
    try {
      await setTodoDone(todo, !todo.done)
      await reload()
      showToast(todo.done ? '事项已标记未完成' : '事项已完成', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '更新事项失败。')
      showToast(message, 'error')
    }
  }

  const handleDeleteTodo = async (todo: TodoItem) => {
    if (pendingTodoDeleteTimersRef.current.has(todo.id)) return

    setTodos((current) => current.filter((item) => item.id !== todo.id))

    const undoDelete = () => {
      const timer = pendingTodoDeleteTimersRef.current.get(todo.id)
      if (timer) window.clearTimeout(timer)
      pendingTodoDeleteTimersRef.current.delete(todo.id)
      setTodos((current) =>
        current.some((item) => item.id === todo.id)
          ? current
          : [...current, todo].sort(sortTodosByDateThenCreatedAt),
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
    try {
      await deleteAttachment(attachment)
      await reload()
      showToast('图片已删除', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '删除附件失败。')
      showToast(message, 'error')
    }
  }

  const handleDeleteJournalEntry = async (entry: JournalEntry) => {
    const confirmed = window.confirm(`确认删除 ${entry.dateKey} 的日记记录吗？这会同时删除关联图片。`)
    if (!confirmed) return

    try {
      await deleteJournalEntry(entry)
      await reload()
      showToast('日记已删除', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '删除日记失败。')
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

    try {
      const result = await exportSyncBundle()
      const files = result.files.map((file) => file.name).join('、')

      showToast(`本地同步包已生成：${result.path}；包含 ${files}`, 'success')
      await reload()
    } catch (error) {
      const message = getErrorMessage(error, '生成本地同步包失败。')

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

  const handleWebDavSync = useCallback(async (source: 'manual' | 'startup' = 'manual') => {
    if (isWebDavSyncing) return

    if (!isWebDavConfigured) {
      if (source === 'manual') {
        const message = '请先配置 WebDAV'
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
    setIsNavOpen,
    showToast,
    todayKey,
    webDavConfig,
  ])

  const handleWebDavRestoreFromCloud = useCallback(async () => {
    if (isWebDavSyncing) return

    if (!isWebDavConfigured) {
      const message = '请先配置 WebDAV'
      showToast(message, 'error')
      setSettingsSection('webdav')
      setActiveView('settings')
      return
    }

    const confirmed = window.confirm('从云端恢复会用远端快照替换本机数据。本机尚未同步的记录可能丢失，确定继续吗？')
    if (!confirmed) return

    setIsWebDavSyncing(true)

    try {
      const result = await pullWebDavSnapshot(webDavConfig)

      window.localStorage.setItem(webDavLastAutoSyncStorageKey, todayKey)
      showToast(formatWebDavSyncMessage(result), 'success')
      await reload()
    } catch (error) {
      const message = getErrorMessage(error, '从云端恢复失败。')
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
          {...pullRefreshHandlers}
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
                countdownTodoOptions={countdownTodoOptions}
                selectedCountdownTodoId={selectedCountdownTodo?.id ?? ''}
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
                onCountdownTodoSelect={setSelectedCountdownTodoId}
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
