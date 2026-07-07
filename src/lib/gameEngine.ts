import type { AttachmentRecord, JournalEntry, TodoItem } from './db'

export type GameEngineSettings = {
  snapshotDays: number
}

export type GameEngineDaySample = {
  dateKey: string
  moodScore: number
  moodLevel: string
  moodQuadrant: string
  todoDone: number
  todoTotal: number
  tags: string[]
}

export type GameEngineSnapshot = {
  adapterVersion: string
  generatedAt: string
  renderMode: 'external-engine'
  contract: {
    source: 'xinxiangyi-indexeddb'
    renderer: 'external-game-engine'
    mountPointId: string
  }
  metrics: {
    entries: number
    todos: number
    completedTodos: number
    attachments: number
    averageMoodScore: number
    latestMoodScore: number
    currentStreak: number
    todoCompletionRate: number
  }
  mood: {
    latestLevel: string
    latestQuadrant: string
    latestSignals?: JournalEntry['mood']['signals']
    latestVector?: JournalEntry['mood']['vector']
  }
  progress: {
    progressScore: number
    phaseIndex: number
    phaseProgress: number
  }
  timeline: GameEngineDaySample[]
  assets: Array<{
    id: string
    entryId: string
    dateKey: string
    name: string
    type: string
    size: number
  }>
}

export const gameEngineAdapterVersion = 'xinxiang-game-engine-adapter-v1'
export const gameEngineMountPointId = 'xinxiangyi-game-engine-root'

export const defaultGameEngineSettings: GameEngineSettings = {
  snapshotDays: 30,
}

const phaseThresholds = [0, 32, 72, 128, 208, 320]

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const average = (values: number[]) => {
  if (values.length === 0) return 0

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

const addDays = (dateKey: string, amount: number) => {
  const date = new Date(`${dateKey}T00:00:00`)
  date.setDate(date.getDate() + amount)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)

  return local.toISOString().slice(0, 10)
}

const getTodayKey = () => {
  const today = new Date()
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)

  return local.toISOString().slice(0, 10)
}

const getCurrentStreak = (entries: JournalEntry[]) => {
  const entryDateKeys = new Set(entries.map((entry) => entry.dateKey))
  let cursor = getTodayKey()
  let streak = 0

  while (entryDateKeys.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }

  return streak
}

const getCompletionRate = (todos: TodoItem[]) => {
  if (todos.length === 0) return 0

  return Math.round((todos.filter((todo) => todo.done).length / todos.length) * 100)
}

const getPhaseIndex = (progressScore: number) => {
  let phaseIndex = 0

  for (const threshold of phaseThresholds) {
    if (progressScore >= threshold) {
      phaseIndex += 1
    }
  }

  return clamp(phaseIndex - 1, 0, phaseThresholds.length - 1)
}

const getPhaseProgress = (progressScore: number, phaseIndex: number) => {
  const current = phaseThresholds[phaseIndex] ?? 0
  const next = phaseThresholds[phaseIndex + 1] ?? current + 160

  return Math.round(clamp(((progressScore - current) / (next - current)) * 100, 0, 100))
}

export const createGameEngineSnapshot = (
  entries: JournalEntry[],
  todos: TodoItem[],
  attachments: AttachmentRecord[],
  settings: GameEngineSettings = defaultGameEngineSettings,
): GameEngineSnapshot => {
  const completedTodos = todos.filter((todo) => todo.done).length
  const completionRate = getCompletionRate(todos)
  const currentStreak = getCurrentStreak(entries)
  const latestEntry = entries[0]
  const averageMoodScore = average(entries.map((entry) => entry.mood.score))
  const latestMoodScore = latestEntry?.mood.score ?? 50
  const progressScore = Math.round(entries.length * 8 + completedTodos * 2 + currentStreak * 5 + averageMoodScore * 0.2)
  const phaseIndex = getPhaseIndex(progressScore)
  const todoMap = new Map<string, TodoItem[]>()

  for (const todo of todos) {
    todoMap.set(todo.dateKey, [...(todoMap.get(todo.dateKey) ?? []), todo])
  }

  return {
    adapterVersion: gameEngineAdapterVersion,
    generatedAt: new Date().toISOString(),
    renderMode: 'external-engine',
    contract: {
      source: 'xinxiangyi-indexeddb',
      renderer: 'external-game-engine',
      mountPointId: gameEngineMountPointId,
    },
    metrics: {
      entries: entries.length,
      todos: todos.length,
      completedTodos,
      attachments: attachments.length,
      averageMoodScore,
      latestMoodScore,
      currentStreak,
      todoCompletionRate: completionRate,
    },
    mood: {
      latestLevel: latestEntry?.mood.level ?? '平稳',
      latestQuadrant: latestEntry?.mood.quadrant ?? '低能修复',
      latestSignals: latestEntry?.mood.signals,
      latestVector: latestEntry?.mood.vector,
    },
    progress: {
      progressScore,
      phaseIndex,
      phaseProgress: getPhaseProgress(progressScore, phaseIndex),
    },
    timeline: entries.slice(0, settings.snapshotDays).map((entry) => {
      const dayTodos = todoMap.get(entry.dateKey) ?? []

      return {
        dateKey: entry.dateKey,
        moodScore: entry.mood.score,
        moodLevel: entry.mood.level,
        moodQuadrant: entry.mood.quadrant,
        todoDone: dayTodos.filter((todo) => todo.done).length,
        todoTotal: dayTodos.length,
        tags: entry.tags,
      }
    }),
    assets: attachments.map((attachment) => ({
      id: attachment.id,
      entryId: attachment.entryId,
      dateKey: attachment.dateKey,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
    })),
  }
}
