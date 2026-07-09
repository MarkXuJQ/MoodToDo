import { useMemo } from 'react'

import type { TrendPoint } from '../components/ui/data-viz'
import type { GameEngineSettings } from '../lib/gameEngine'
import { createGameEngineSnapshot } from '../lib/gameEngine'
import {
  formatShortDateLabel,
  getDateWindow,
  getWeekDays,
} from '../lib/calendar'
import type {
  AttachmentRecord,
  BoardLaneRecord,
  ChangeLogRecord,
  JournalEntry,
  TodoItem,
  WeeklySummary,
} from '../lib/db'
import {
  average,
  createCalendarCells,
  getCheckinRate,
  getCompletionRate,
  getCurrentStreak,
  getLongestStreak,
  getSignalValue,
} from '../lib/insights'
import type {
  CountdownTodoOption,
  DashboardCardConfig,
  DashboardMetricCard,
  MoodBreakdownItem,
} from '../types/app'
import { formatCountdownDays, getCountdownDaysRemaining, getCountdownTone, sortCountdownTodos } from '../utils/countdown'

type UseAppDerivedStateInput = {
  attachments: AttachmentRecord[]
  boardLanes: BoardLaneRecord[]
  changes: ChangeLogRecord[]
  dashboardCards: DashboardCardConfig[]
  entries: JournalEntry[]
  gameEngineSettings: GameEngineSettings
  pendingFileCount: number
  selectedCountdownTodoId: string
  selectedDate: string
  selectedEntry?: JournalEntry
  selectedWeek: string
  todos: TodoItem[]
  visibleMonth: string
  weeklySummaries: WeeklySummary[]
}

export const useAppDerivedState = ({
  attachments,
  boardLanes,
  changes,
  dashboardCards,
  entries,
  gameEngineSettings,
  pendingFileCount,
  selectedCountdownTodoId,
  selectedDate,
  selectedEntry,
  selectedWeek,
  todos,
  visibleMonth,
  weeklySummaries,
}: UseAppDerivedStateInput) => {
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

  const lastSevenEntries = useMemo(() => entries.slice(0, 7), [entries])
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

  const monthEntries = useMemo(() => entries.filter((entry) => entry.dateKey.startsWith(visibleMonth)), [entries, visibleMonth])
  const monthTodos = useMemo(() => todos.filter((todo) => todo.dateKey.startsWith(visibleMonth)), [todos, visibleMonth])
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

  const dashboardCardMetrics = useMemo<DashboardMetricCard[]>(
    () => [
      {
        id: 'streak',
        label: '连续打卡',
        value: `${currentStreak} 天`,
      },
      {
        id: 'todoCompletion',
        label: '事项完成',
        value: `${dayTodos.filter((todo) => todo.done).length}/${dayTodos.length}`,
      },
      {
        id: 'monthCheckin',
        label: '本月打卡率',
        value: `${monthCheckinRate}%`,
      },
      {
        id: 'countdown',
        label: selectedCountdownTodo ? `倒计时 · ${selectedCountdownTodo.title}` : '倒计时',
        value: selectedCountdownTodo ? selectedCountdownTodo.value : '未开启',
        tone: selectedCountdownTodo ? getCountdownTone(selectedCountdownTodo.daysRemaining) : undefined,
      },
      {
        id: 'pendingSync',
        label: '未同步内容',
        value: `${pendingChangeCount}`,
      },
      {
        id: 'attachments',
        label: '图片',
        value: `${selectedAttachments.length + pendingFileCount}`,
      },
    ],
    [currentStreak, dayTodos, monthCheckinRate, pendingChangeCount, pendingFileCount, selectedAttachments.length, selectedCountdownTodo],
  )

  const visibleDashboardCards = useMemo(
    () => dashboardCardMetrics.filter((card) => dashboardCards.find((item) => item.id === card.id)?.enabled),
    [dashboardCardMetrics, dashboardCards],
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
  const moodBreakdownItems = useMemo<MoodBreakdownItem[]>(() => {
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

  return {
    attachmentCountByEntryId,
    calendarCells,
    countdownTodoOptions,
    currentStreak,
    dashboardCardMetrics,
    dayTodos,
    entryByDate,
    filteredBoardTodos,
    gameEngineSnapshot,
    lastSevenAverage,
    lastSevenEntries,
    longestStreak,
    monthCheckinRate,
    monthCompletionRate,
    monthEntries,
    monthScore,
    moodBreakdownItems,
    moodTrendPoints,
    moodWindowAverage,
    pendingChangeCount,
    selectedAttachments,
    selectedCountdownTodo,
    selectedEntry,
    selectedMoodTrendIndex,
    selectedWeekCompletionRate,
    selectedWeekDays,
    selectedWeekEntries,
    selectedWeekScore,
    selectedWeekSummary,
    selectedWeekTodos,
    trendDateKeys,
    visibleDashboardCards,
  }
}
