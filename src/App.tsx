import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'

import './App.css'
import { AppHeader } from './components/layout/AppHeader'
import { NavDrawer } from './components/layout/NavDrawer'
import DynamicBackground from './components/ui/dynamic-background'
import {
  aiConfigStorageKey,
  dashboardCardsStorageKey,
  defaultAiConfig,
  defaultDashboardCards,
  defaultWebDavConfig,
  emptyDraft,
  emptyMetricDraft,
  gameEngineSettingsStorageKey,
  journalModes,
  navigationItems,
  readAiConfig,
  readDashboardCards,
  readGameEngineSettings,
  readWebDavConfig,
  settingsSectionGroups,
  settingsSections,
  webDavConfigStorageKey,
} from './config/app-shell'
import {
  addTodo,
  deleteAttachment,
  deleteJournalEntries,
  deleteJournalEntry,
  deleteMetricDefinition,
  deleteTodo,
  getLocalState,
  localDatabaseDriver,
  localDatabaseName,
  setTodoDone,
  upsertMetricDefinition,
  upsertMetricRecord,
  upsertWeeklySummary,
  upsertJournalEntry,
  type AttachmentRecord,
  type ChangeLogRecord,
  type JournalEntry,
  type MetricDefinition,
  type MetricRecord,
  type TodoItem,
  type WeeklySummary,
} from './lib/db'
import { createGameEngineSnapshot, defaultGameEngineSettings, type GameEngineSettings } from './lib/gameEngine'
import { formatWeatherText, getCurrentWeatherContext } from './lib/weather'
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
  formatMetricValue,
  getCheckinRate,
  getCompletionRate,
  getCurrentStreak,
  getHeatLevel,
  getLongestStreak,
  getMetricScaleMax,
  getSignalValue,
  parseTags,
} from './lib/insights'
import type {
  ActiveView,
  AiConfig,
  DashboardCardConfig,
  DashboardCardId,
  DatabaseStatus,
  DraftState,
  JournalMode,
  MetricDraftState,
  SettingsSection,
  WeatherState,
  WebDavConfig,
} from './types/app'
import { DashboardView } from './views/DashboardView'
import { JournalView } from './views/JournalView'
import { SettingsView } from './views/SettingsView'
import { SummaryView } from './views/SummaryView'
import type { TrendPoint } from './components/ui/data-viz'

const navCollapseStorageKey = 'xinxiangyi-nav-collapsed-v1'

function App() {
  const [activeView, setActiveView] = useState<ActiveView>('dashboard')
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [isNavCollapsed, setIsNavCollapsed] = useState(() => window.localStorage.getItem(navCollapseStorageKey) === '1')
  const [isDesktopNav, setIsDesktopNav] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  const [journalMode, setJournalMode] = useState<JournalMode>('entries')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('overview')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([])
  const [metricDefinitions, setMetricDefinitions] = useState<MetricDefinition[]>([])
  const [metricRecords, setMetricRecords] = useState<MetricRecord[]>([])
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
  const [gameEngineSettings, setGameEngineSettings] = useState<GameEngineSettings>(defaultGameEngineSettings)
  const [dashboardCards, setDashboardCards] = useState<DashboardCardConfig[]>(defaultDashboardCards)
  const [metricDraft, setMetricDraft] = useState<MetricDraftState>(emptyMetricDraft)
  const [metricValueDrafts, setMetricValueDrafts] = useState<Record<string, string>>({})
  const [selectedMetricId, setSelectedMetricId] = useState('')
  const [journalSearch, setJournalSearch] = useState('')
  const [journalFilterMonth, setJournalFilterMonth] = useState('all')
  const [journalFilterMood, setJournalFilterMood] = useState('all')
  const [journalFilterTag, setJournalFilterTag] = useState('all')
  const [selectedJournalEntryIds, setSelectedJournalEntryIds] = useState<string[]>([])
  const [summaryDraft, setSummaryDraft] = useState('')
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [writeError, setWriteError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [weatherState, setWeatherState] = useState<WeatherState>({
    status: 'idle',
    locationLabel: '定位中',
    weatherText: '天气获取中',
  })
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>({
    origin: window.location.origin,
    driver: localDatabaseDriver,
    databaseName: localDatabaseName,
    databasePath: '',
    apiBaseUrl: '',
    schemaVersion: 0,
    lastLoadedAt: '',
  })

  const reload = async () => {
    try {
      const nextState = await getLocalState()

      setEntries(nextState.entries)
      setTodos(nextState.todos)
      setAttachments(nextState.attachments)
      setMetricDefinitions(nextState.metricDefinitions)
      setMetricRecords(nextState.metricRecords)
      setChanges(nextState.changes)
      setWeeklySummaries(nextState.weeklySummaries)
      setDatabaseStatus({
        origin: window.location.origin,
        driver: nextState.meta.driver,
        databaseName: nextState.meta.databaseName,
        databasePath: nextState.meta.databasePath,
        apiBaseUrl: nextState.meta.apiBaseUrl,
        schemaVersion: nextState.meta.schemaVersion,
        lastLoadedAt: new Date().toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      })
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '读取本地 SQLite 数据库失败。')
    }
  }

  useEffect(() => {
    setAiConfig(readAiConfig())
    setWebDavConfig(readWebDavConfig())
    setGameEngineSettings(readGameEngineSettings())
    setDashboardCards(readDashboardCards())
    void reload()
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)')
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

  useEffect(() => {
    let isMounted = true

    const loadWeather = async () => {
      setWeatherState({
        status: 'loading',
        locationLabel: '定位中',
        weatherText: '天气获取中',
      })

      try {
        const context = await getCurrentWeatherContext()

        if (!isMounted) return

        setWeatherState({
          status: 'ready',
          locationLabel: context.locationLabel,
          weatherText: formatWeatherText(context),
        })
      } catch (error) {
        if (!isMounted) return

        setWeatherState({
          status: 'error',
          locationLabel: '未定位',
          weatherText: '天气不可用',
          error: error instanceof Error ? error.message : '天气获取失败。',
        })
      }
    }

    void loadWeather()

    return () => {
      isMounted = false
    }
  }, [])

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

  useEffect(() => {
    if (metricDefinitions.length === 0) {
      setSelectedMetricId('')
      return
    }

    if (!metricDefinitions.some((metricDefinition) => metricDefinition.id === selectedMetricId)) {
      setSelectedMetricId(metricDefinitions[0].id)
    }
  }, [metricDefinitions, selectedMetricId])

  useEffect(() => {
    setMetricValueDrafts(
      Object.fromEntries(
        metricDefinitions.map((metricDefinition) => {
          const metricRecord = metricRecords.find(
            (record) => record.metricId === metricDefinition.id && record.dateKey === selectedDate,
          )

          return [metricDefinition.id, metricRecord ? `${metricRecord.value}` : '']
        }),
      ),
    )
  }, [metricDefinitions, metricRecords, selectedDate])

  useEffect(() => {
    setSelectedJournalEntryIds((current) => current.filter((id) => entries.some((entry) => entry.id === id)))
  }, [entries])

  const todayKey = getTodayKey()
  const latestEntry = entries[0]

  const entryByDate = useMemo(() => new Map(entries.map((entry) => [entry.dateKey, entry])), [entries])

  const metricRecordsByMetricId = useMemo(() => {
    const groups = new Map<string, MetricRecord[]>()

    for (const metricRecord of metricRecords) {
      groups.set(metricRecord.metricId, [...(groups.get(metricRecord.metricId) ?? []), metricRecord])
    }

    return new Map(
      [...groups.entries()].map(([metricId, records]) => [
        metricId,
        records.sort((left, right) => left.dateKey.localeCompare(right.dateKey)),
      ]),
    )
  }, [metricRecords])

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
        .sort((left, right) => Number(left.done) - Number(right.done) || right.createdAt.localeCompare(left.createdAt)),
    [selectedDate, todos],
  )

  const selectedAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.entryId === selectedEntry?.id),
    [attachments, selectedEntry],
  )

  const lastSevenEntries = entries.slice(0, 7)
  const allEntryTodos = todos.filter((todo) => entries.some((entry) => entry.dateKey === todo.dateKey))
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

  const filteredEntries = useMemo(() => {
    const keyword = journalSearch.trim().toLowerCase()

    return entries.filter((entry) => {
      const matchesKeyword = !keyword
        ? true
        : [
            entry.title,
            entry.body,
            entry.moodText,
            entry.tags.join(' '),
            entry.mood.quadrant,
            entry.locationText,
            entry.weatherText,
          ]
            .join(' ')
            .toLowerCase()
            .includes(keyword)

      const matchesMonth = journalFilterMonth === 'all' ? true : entry.dateKey.startsWith(journalFilterMonth)
      const matchesMood = journalFilterMood === 'all' ? true : entry.mood.level === journalFilterMood
      const matchesTag = journalFilterTag === 'all' ? true : entry.tags.includes(journalFilterTag)

      return matchesKeyword && matchesMonth && matchesMood && matchesTag
    })
  }, [entries, journalFilterMonth, journalFilterMood, journalFilterTag, journalSearch])

  const filteredBoardTodos = useMemo(() => {
    const keyword = journalSearch.trim().toLowerCase()
    const items = keyword
      ? todos.filter((todo) => {
          const entry = entryByDate.get(todo.dateKey)

          return [
            todo.title,
            todo.dateKey,
            entry?.title ?? '',
            entry?.body ?? '',
            entry?.moodText ?? '',
            entry?.tags.join(' ') ?? '',
            entry?.mood.quadrant ?? '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(keyword)
        })
      : todos

    return [...items].sort((left, right) => {
      if (left.done !== right.done) return Number(left.done) - Number(right.done)
      if (!left.done && left.dateKey !== right.dateKey) return left.dateKey.localeCompare(right.dateKey)

      return (right.completedAt ?? right.updatedAt).localeCompare(left.completedAt ?? left.updatedAt)
    })
  }, [entryByDate, journalSearch, todos])

  const pendingChangeCount = changes.filter((change) => change.syncState === 'pending').length
  const journalMonthOptions = useMemo(
    () => [...new Set(entries.map((entry) => entry.dateKey.slice(0, 7)))].sort((left, right) => right.localeCompare(left)),
    [entries],
  )
  const journalMoodOptions = useMemo(
    () => [...new Set(entries.map((entry) => entry.mood.level))],
    [entries],
  )
  const journalTagOptions = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.tags))].sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [entries],
  )
  const completionRate = getCompletionRate(allEntryTodos)
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

  const todayScore = selectedEntry?.mood.score ?? 50
  const canSave = Boolean(draft.body.trim() || draft.moodText.trim() || draft.title.trim() || pendingFiles.length > 0)
  const canGenerateSummary = Boolean(aiConfig.endpoint.trim() && aiConfig.apiKey.trim() && selectedWeekEntries.length > 0)

  const dashboardCardMetrics = [
    {
      id: 'latestMood' as const,
      label: '最近心象',
      value: `${latestEntry?.mood.score ?? todayScore}`,
      tone: latestEntry ? `score-${latestEntry.mood.level}` : undefined,
    },
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
      label: '待同步',
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

  const boardColumns = useMemo(
    () => [
      {
        id: 'overdue',
        label: '待推进',
        note: '早于今天且尚未完成',
        items: filteredBoardTodos.filter((todo) => !todo.done && todo.dateKey < todayKey),
      },
      {
        id: 'today',
        label: '今天',
        note: '今天要收口的事项',
        items: filteredBoardTodos.filter((todo) => !todo.done && todo.dateKey === todayKey),
      },
      {
        id: 'upcoming',
        label: '稍后',
        note: '未来日期或预排事项',
        items: filteredBoardTodos.filter((todo) => !todo.done && todo.dateKey > todayKey),
      },
      {
        id: 'done',
        label: '已完成',
        note: '已经落地的推进',
        items: filteredBoardTodos.filter((todo) => todo.done),
      },
    ],
    [filteredBoardTodos, todayKey],
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
  const ringEntry = selectedEntry ?? latestEntry
  const selectedMetricDefinition = metricDefinitions.find((metricDefinition) => metricDefinition.id === selectedMetricId)
  const selectedMetricRecords = selectedMetricDefinition
    ? (metricRecordsByMetricId.get(selectedMetricDefinition.id) ?? [])
    : []
  const selectedMetricCurrentRecord = selectedMetricRecords.find((metricRecord) => metricRecord.dateKey === selectedDate)
  const selectedMetricLatestRecord = selectedMetricRecords[selectedMetricRecords.length - 1]
  const selectedMetricScaleMax = selectedMetricDefinition
    ? getMetricScaleMax(selectedMetricDefinition, selectedMetricRecords)
    : 100
  const metricRows = useMemo(
    () =>
      metricDefinitions.map((metricDefinition) => {
        const records = metricRecordsByMetricId.get(metricDefinition.id) ?? []
        const latestRecord = records[records.length - 1]
        const selectedDateRecord = records.find((metricRecord) => metricRecord.dateKey === selectedDate)
        const scaleMax = getMetricScaleMax(metricDefinition, records)
        const points: TrendPoint[] = trendDateKeys.map((dateKey) => ({
          label: formatShortDateLabel(dateKey),
          value: records.find((metricRecord) => metricRecord.dateKey === dateKey)?.value ?? null,
        }))

        return {
          metricDefinition,
          latestRecord,
          selectedDateRecord,
          scaleMax,
          points,
        }
      }),
    [metricDefinitions, metricRecordsByMetricId, selectedDate, trendDateKeys],
  )

  const lastSevenAverage = average(lastSevenEntries.map((entry) => entry.mood.score))
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

  const resolveWeatherForSave = async () => {
    if (selectedDate !== todayKey) {
      return {
        weatherText: selectedEntry?.weatherText,
        locationText: selectedEntry?.locationText,
      }
    }

    if (weatherState.status === 'ready') {
      return {
        weatherText: weatherState.weatherText,
        locationText: weatherState.locationLabel,
      }
    }

    try {
      const context = await getCurrentWeatherContext(weatherState.status === 'error')
      const nextWeatherText = formatWeatherText(context)

      setWeatherState({
        status: 'ready',
        locationLabel: context.locationLabel,
        weatherText: nextWeatherText,
      })

      return {
        weatherText: nextWeatherText,
        locationText: context.locationLabel,
      }
    } catch {
      return {
        weatherText: selectedEntry?.weatherText,
        locationText: selectedEntry?.locationText,
      }
    }
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSave || isSaving) return

    setIsSaving(true)
    setWriteError('')

    try {
      const weatherContext = await resolveWeatherForSave()

      await upsertJournalEntry(
        {
          dateKey: selectedDate,
          title: draft.title.trim() || formatDateLabel(selectedDate),
          body: draft.body.trim(),
          moodText: draft.moodText.trim(),
          weatherText: weatherContext.weatherText,
          locationText: weatherContext.locationText,
          tags: parseTags(draft.tags),
        },
        pendingFiles,
      )
      setPendingFiles([])
      await reload()
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '保存日记失败。')
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
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '新增事项失败。')
    }
  }

  const handleToggleTodo = async (todo: TodoItem) => {
    setWriteError('')

    try {
      await setTodoDone(todo, !todo.done)
      await reload()
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '更新事项失败。')
    }
  }

  const handleDeleteTodo = async (todo: TodoItem) => {
    setWriteError('')

    try {
      await deleteTodo(todo)
      await reload()
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '删除事项失败。')
    }
  }

  const handleDeleteAttachment = async (attachment: AttachmentRecord) => {
    setWriteError('')

    try {
      await deleteAttachment(attachment)
      await reload()
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '删除附件失败。')
    }
  }

  const handleToggleJournalEntrySelection = (entryId: string) => {
    setSelectedJournalEntryIds((current) =>
      current.includes(entryId) ? current.filter((item) => item !== entryId) : [...current, entryId],
    )
  }

  const handleSelectAllFilteredEntries = () => {
    setSelectedJournalEntryIds(filteredEntries.map((entry) => entry.id))
  }

  const handleClearSelectedEntries = () => {
    setSelectedJournalEntryIds([])
  }

  const handleDeleteJournalEntry = async (entry: JournalEntry) => {
    const confirmed = window.confirm(`确认删除 ${entry.dateKey} 的日记记录吗？这会同时删除关联图片。`)
    if (!confirmed) return

    setWriteError('')

    try {
      await deleteJournalEntry(entry)
      setSelectedJournalEntryIds((current) => current.filter((id) => id !== entry.id))
      await reload()
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '删除日记失败。')
    }
  }

  const handleDeleteSelectedJournalEntries = async () => {
    if (selectedJournalEntryIds.length === 0) return

    const confirmed = window.confirm(`确认删除已选的 ${selectedJournalEntryIds.length} 条日记吗？这会同时删除关联图片。`)
    if (!confirmed) return

    setWriteError('')

    try {
      await deleteJournalEntries(selectedJournalEntryIds)
      setSelectedJournalEntryIds([])
      await reload()
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '批量删除日记失败。')
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

  const openJournalMode = (mode: JournalMode) => {
    setJournalMode(mode)
    navigateTo('journal')
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
    (key: keyof WebDavConfig) => (event: ChangeEvent<HTMLInputElement>) => {
      const next = { ...webDavConfig, [key]: event.target.value }
      setWebDavConfig(next)
      window.localStorage.setItem(webDavConfigStorageKey, JSON.stringify(next))
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

  const handleMetricDraftChange =
    (key: keyof MetricDraftState) => (event: ChangeEvent<HTMLInputElement>) => {
      setMetricDraft((current) => ({ ...current, [key]: event.target.value }))
    }

  const resetMetricDraft = () => setMetricDraft(emptyMetricDraft)

  const handleEditMetricDefinition = (metricDefinition: MetricDefinition) => {
    setMetricDraft({
      id: metricDefinition.id,
      name: metricDefinition.name,
      unit: metricDefinition.unit,
      color: metricDefinition.color,
      targetValue: metricDefinition.targetValue != null ? `${metricDefinition.targetValue}` : '',
    })
    setSelectedMetricId(metricDefinition.id)
  }

  const handleSaveMetricDefinition = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = metricDraft.name.trim()
    if (!name) return

    setWriteError('')

    try {
      const targetValue = metricDraft.targetValue.trim()
      const metricDefinition = await upsertMetricDefinition({
        id: metricDraft.id,
        name,
        unit: metricDraft.unit.trim(),
        color: metricDraft.color,
        targetValue: targetValue ? Number(targetValue) : undefined,
      })
      setSelectedMetricId(metricDefinition.id)
      resetMetricDraft()
      await reload()
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '保存指标失败。')
    }
  }

  const handleDeleteMetricDefinition = async (metricDefinition: MetricDefinition) => {
    setWriteError('')

    try {
      await deleteMetricDefinition(metricDefinition)
      if (metricDraft.id === metricDefinition.id) {
        resetMetricDraft()
      }
      await reload()
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '删除指标失败。')
    }
  }

  const handleMetricValueDraftChange =
    (metricId: string) => (event: ChangeEvent<HTMLInputElement>) => {
      setMetricValueDrafts((current) => ({ ...current, [metricId]: event.target.value }))
    }

  const handleSaveMetricRecord = async (metricDefinition: MetricDefinition) => {
    const rawValue = metricValueDrafts[metricDefinition.id]?.trim() ?? ''
    if (!rawValue) return

    setWriteError('')

    try {
      await upsertMetricRecord({
        metricId: metricDefinition.id,
        dateKey: selectedDate,
        value: Number(rawValue),
      })
      setSelectedMetricId(metricDefinition.id)
      await reload()
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : '保存指标数值失败。')
    }
  }

  const handleGenerateSummary = async () => {
    if (!canGenerateSummary || isGeneratingSummary) return

    setIsGeneratingSummary(true)
    setSummaryError('')

    try {
      const response = await fetch('/api/ai/weekly-summary', {
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
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : '生成周总结失败。')
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
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : '保存周总结失败。')
    }
  }

  useEffect(() => {
    setSummaryDraft(selectedWeekSummary?.content ?? '')
  }, [selectedWeekSummary])

  const activeNavItem = navigationItems.find((item) => item.id === activeView)
  const todayHeaderLabel = formatDateLabel(todayKey)
  const topbarWeatherText = `${weatherState.locationLabel} · ${weatherState.weatherText}`
  const selectedEntryContextText =
    selectedEntry?.weatherText || selectedEntry?.locationText
      ? `${selectedEntry.locationText || '位置未记录'} · ${selectedEntry.weatherText || '天气未记录'}`
      : selectedDate === todayKey
        ? topbarWeatherText
        : '这一天还没有记录天气与定位'

  return (
    <main className="shell">
      <DynamicBackground />
      <div className="app-shell" style={{ ['--nav-width' as string]: isNavCollapsed ? '88px' : '296px' }}>
        <NavDrawer
          isDesktop={isDesktopNav}
          isOpen={isNavOpen}
          isCollapsed={isNavCollapsed}
          activeView={activeView}
          navigationItems={navigationItems}
          onClose={() => setIsNavOpen(false)}
          onNavigate={navigateTo}
          onOpenJournalBoard={() => openJournalMode('board')}
          onOpenSettingsOverview={() => openSettingsSection('overview')}
          onOpenSettingsAi={() => openSettingsSection('ai')}
        />

        <div className="content-shell">
          <div className="page">
            <AppHeader
              isDesktopNav={isDesktopNav}
              isNavOpen={isNavOpen}
              isNavCollapsed={isNavCollapsed}
              todayLabel={todayHeaderLabel}
              activeViewLabel={activeNavItem?.label ?? '仪表盘'}
              locationLabel={weatherState.locationLabel}
              weatherText={weatherState.weatherText}
              onToggleNav={() => {
                if (isDesktopNav) {
                  setIsNavCollapsed((current) => !current)
                } else {
                  setIsNavOpen((current) => !current)
                }
              }}
            />

            {activeView === 'dashboard' ? (
          <DashboardView
            selectedDate={selectedDate}
            selectedDateLabel={formatDateLabel(selectedDate)}
            todayKey={todayKey}
            visibleDashboardCards={visibleDashboardCards}
            writeError={writeError}
            selectedEntry={selectedEntry}
            selectedEntryContextText={selectedEntryContextText}
            draft={draft}
            pendingFiles={pendingFiles}
            selectedAttachments={selectedAttachments}
            canSave={canSave}
            isSaving={isSaving}
            dayTodos={dayTodos}
            todoTitle={todoTitle}
            ringEntry={ringEntry}
            lastSevenAverage={lastSevenAverage}
            completionRate={completionRate}
            entryCount={entries.length}
            moodTrendPoints={moodTrendPoints}
            selectedMoodTrendIndex={selectedMoodTrendIndex}
            trendStartLabel={trendDateKeys[0]}
            trendEndLabel={trendDateKeys[trendDateKeys.length - 1]}
            moodWindowAverage={moodWindowAverage}
            metricDraft={metricDraft}
            metricRows={metricRows}
            metricValueDrafts={metricValueDrafts}
            selectedMetricId={selectedMetricId}
            selectedMetricDefinition={selectedMetricDefinition}
            selectedMetricCurrentRecord={selectedMetricCurrentRecord}
            selectedMetricLatestRecord={selectedMetricLatestRecord}
            selectedMetricScaleMax={selectedMetricScaleMax}
            onDateChange={(dateKey) => focusDate(dateKey, 'dashboard')}
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
            getSignalValue={getSignalValue}
            onMetricDraftChange={handleMetricDraftChange}
            onSaveMetricDefinition={handleSaveMetricDefinition}
            onResetMetricDraft={resetMetricDraft}
            onEditMetricDefinition={handleEditMetricDefinition}
            onDeleteMetricDefinition={(metricDefinition) => void handleDeleteMetricDefinition(metricDefinition)}
            onMetricValueDraftChange={handleMetricValueDraftChange}
            onSaveMetricRecord={(metricDefinition) => void handleSaveMetricRecord(metricDefinition)}
            onSelectMetricId={setSelectedMetricId}
            formatMetricValue={formatMetricValue}
          />
            ) : activeView === 'journal' ? (
          <JournalView
            journalMode={journalMode}
            journalModes={journalModes}
            journalSearch={journalSearch}
            journalFilterMonth={journalFilterMonth}
            journalFilterMood={journalFilterMood}
            journalFilterTag={journalFilterTag}
            journalMonthOptions={journalMonthOptions}
            journalMoodOptions={journalMoodOptions}
            journalTagOptions={journalTagOptions}
            selectedEntryIds={selectedJournalEntryIds}
            entries={entries}
            filteredEntries={filteredEntries}
            todos={todos}
            filteredBoardTodos={filteredBoardTodos}
            latestEntry={latestEntry}
            currentStreak={currentStreak}
            pendingChangeCount={pendingChangeCount}
            boardColumns={boardColumns}
            entryByDate={entryByDate}
            attachmentCountByEntryId={attachmentCountByEntryId}
            selectedDate={selectedDate}
            todoTitle={todoTitle}
            onJournalModeChange={setJournalMode}
            onJournalSearchChange={setJournalSearch}
            onJournalFilterMonthChange={setJournalFilterMonth}
            onJournalFilterMoodChange={setJournalFilterMood}
            onJournalFilterTagChange={setJournalFilterTag}
            onFocusDate={focusDate}
            onToggleEntrySelection={handleToggleJournalEntrySelection}
            onSelectAllFilteredEntries={handleSelectAllFilteredEntries}
            onClearSelectedEntries={handleClearSelectedEntries}
            onDeleteEntry={(entry) => void handleDeleteJournalEntry(entry)}
            onDeleteSelectedEntries={() => void handleDeleteSelectedJournalEntries()}
            onTodoTitleChange={setTodoTitle}
            onAddTodo={handleAddTodo}
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
            onPreviousMonth={() => setVisibleMonth(shiftMonth(visibleMonth, -1))}
            onNextMonth={() => setVisibleMonth(shiftMonth(visibleMonth, 1))}
            onFocusDate={(dateKey) => focusDate(dateKey, 'dashboard')}
            onSelectedWeekChange={(dateKey) => setSelectedWeek(getWeekKey(dateKey))}
            onOpenAiSettings={() => openSettingsSection('ai')}
            onGenerateSummary={() => void handleGenerateSummary()}
            onSummaryDraftChange={setSummaryDraft}
            onSaveSummary={() => void handleSaveSummaryDraft()}
            getCompletionRate={getCompletionRate}
            getHeatLevel={getHeatLevel}
          />
            ) : (
          <SettingsView
            settingsSection={settingsSection}
            settingsSections={settingsSections}
            settingsSectionGroups={settingsSectionGroups}
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
            onSettingsSectionChange={setSettingsSection}
            onReload={() => void reload()}
            onToggleDashboardCard={toggleDashboardCard}
            onAiConfigChange={handleAiConfigChange}
            onWebDavConfigChange={handleWebDavConfigChange}
            onSnapshotDaysChange={handleSnapshotDaysChange}
          />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export default App
