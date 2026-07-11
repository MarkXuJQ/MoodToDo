import type { AttachmentRecord, JournalEntry, TodoItem } from './db'
import { addDays, getTodayKey } from './calendar'
import { getJournalText } from '../utils/journal'

export type GameEngineSettings = {
  snapshotDays: number
}

export type GardenPlantKind = 'moonFern' | 'windBell' | 'dewBud' | 'sunBloom'

export type GameEngineDaySample = {
  entryId: string
  dateKey: string
  moodScore: number
  moodLevel: string
  moodQuadrant: string
  todoDone: number
  todoTotal: number
  tags: string[]
  journalLength: number
  growthXp: number
  plantKind: GardenPlantKind
  growthStage: number
}

export type GardenAchievement = {
  id: string
  title: string
  description: string
  unlocked: boolean
  progress: number
  target: number
}

export type GardenPlant = {
  id: string
  entryId: string
  dateKey: string
  kind: GardenPlantKind
  name: string
  color: string
  moodScore: number
  moodLevel: string
  quadrant: string
  growthStage: number
  growthXp: number
  journalLength: number
}

export type GameEngineSnapshot = {
  adapterVersion: string
  generatedAt: string
  renderMode: 'integrated-garden'
  contract: {
    source: 'xinxiangyi-sqlite'
    renderer: 'xinxiang-garden'
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
    longestStreak: number
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
    totalXp: number
    phaseIndex: number
    phaseName: string
    phaseProgress: number
    currentThreshold: number
    nextThreshold: number
  }
  garden: {
    climate: string
    climateNote: string
    vitality: number
    todayCheckedIn: boolean
    todayRewardXp: number
    plantCount: number
    unlockedAchievementCount: number
    essence: Record<GardenPlantKind, number>
  }
  plants: GardenPlant[]
  achievements: GardenAchievement[]
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

export const gameEngineAdapterVersion = 'xinxiang-game-engine-adapter-v2'
export const gameEngineMountPointId = 'xinxiangyi-game-engine-root'

export const defaultGameEngineSettings: GameEngineSettings = {
  snapshotDays: 30,
}

const phaseThresholds = [0, 80, 190, 340, 540, 800, 1120, 1520]
const phaseNames = ['一粒心种', '初生嫩芽', '枝叶渐丰', '含苞时节', '林间盛放', '四季森林', '星光秘境', '长青之庭']

const plantProfiles: Record<
  string,
  { kind: GardenPlantKind; name: string; color: string; climate: string; climateNote: string }
> = {
  低能承压: {
    kind: 'moonFern',
    name: '守夜蕨',
    color: '#7d72c8',
    climate: '静夜细雨',
    climateNote: '低落不是失败。森林正在替你收住今天的重量。',
  },
  高能紧绷: {
    kind: 'windBell',
    name: '风铃草',
    color: '#df8057',
    climate: '有风的午后',
    climateNote: '能量正在流动，先让风替你带走一点紧绷。',
  },
  低能修复: {
    kind: 'dewBud',
    name: '晨露芽',
    color: '#4fae96',
    climate: '清晨薄雾',
    climateNote: '慢一点也在生长，修复本身就是今天的进度。',
  },
  高能舒展: {
    kind: 'sunBloom',
    name: '向阳花',
    color: '#e6ae3d',
    climate: '晴光漫游',
    climateNote: '把今天有效的条件记下来，让这束光以后还能回来。',
  },
}

const defaultPlantProfile = plantProfiles.低能修复

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const average = (values: number[]) => {
  if (values.length === 0) return 0

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

const getCurrentStreak = (entries: JournalEntry[]) => {
  const entryDateKeys = new Set(entries.map((entry) => entry.dateKey))
  const todayKey = getTodayKey()
  let cursor = entryDateKeys.has(todayKey) ? todayKey : addDays(todayKey, -1)
  let streak = 0

  while (entryDateKeys.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }

  return streak
}

const getLongestStreak = (entries: JournalEntry[]) => {
  const dateKeys = [...new Set(entries.map((entry) => entry.dateKey))].sort()
  let longest = 0
  let current = 0
  let previous = ''

  for (const dateKey of dateKeys) {
    current = previous && addDays(previous, 1) === dateKey ? current + 1 : 1
    longest = Math.max(longest, current)
    previous = dateKey
  }

  return longest
}

const getCompletionRate = (todos: TodoItem[]) => {
  if (todos.length === 0) return 0

  return Math.round((todos.filter((todo) => todo.done).length / todos.length) * 100)
}

const getPhaseIndex = (totalXp: number) => {
  let phaseIndex = 0

  for (let index = 0; index < phaseThresholds.length; index += 1) {
    if (totalXp >= phaseThresholds[index]) phaseIndex = index
  }

  return phaseIndex
}

const getPhaseProgress = (totalXp: number, phaseIndex: number) => {
  const current = phaseThresholds[phaseIndex] ?? 0
  const next = phaseThresholds[phaseIndex + 1] ?? current + 500

  return Math.round(clamp(((totalXp - current) / (next - current)) * 100, 0, 100))
}

const getGrowthXp = (entry: JournalEntry, dayTodos: TodoItem[], attachmentCount: number) => {
  const journalLength = getJournalText(entry).length
  const journalBonus = Math.min(12, Math.floor(journalLength / 50) * 2)
  const reflectionBonus = Math.min(6, Math.round((entry.mood.signals?.reflection ?? 0) / 4))
  const actionBonus = Math.min(6, dayTodos.filter((todo) => todo.done).length * 2)
  const memoryBonus = attachmentCount > 0 ? 2 : 0

  return 20 + journalBonus + reflectionBonus + actionBonus + memoryBonus
}

const getGrowthStage = (entry: JournalEntry, growthXp: number) => {
  const journalLength = getJournalText(entry).length

  if (growthXp >= 40 || journalLength >= 320) return 4
  if (growthXp >= 32 || journalLength >= 160) return 3
  if (growthXp >= 25 || journalLength >= 60) return 2
  return 1
}

const createAchievement = (
  id: string,
  title: string,
  description: string,
  progress: number,
  target: number,
): GardenAchievement => ({
  id,
  title,
  description,
  progress: Math.min(progress, target),
  target,
  unlocked: progress >= target,
})

export const createGameEngineSnapshot = (
  entries: JournalEntry[],
  todos: TodoItem[],
  attachments: AttachmentRecord[],
  settings: GameEngineSettings = defaultGameEngineSettings,
): GameEngineSnapshot => {
  const sortedEntries = [...entries].sort(
    (left, right) => right.dateKey.localeCompare(left.dateKey) || right.updatedAt.localeCompare(left.updatedAt),
  )
  const completedTodos = todos.filter((todo) => todo.done).length
  const completionRate = getCompletionRate(todos)
  const currentStreak = getCurrentStreak(entries)
  const longestStreak = getLongestStreak(entries)
  const latestEntry = sortedEntries[0]
  const averageMoodScore = average(entries.map((entry) => entry.mood.score))
  const latestMoodScore = latestEntry?.mood.score ?? 50
  const todoMap = new Map<string, TodoItem[]>()
  const attachmentCountMap = new Map<string, number>()

  for (const todo of todos) {
    todoMap.set(todo.dateKey, [...(todoMap.get(todo.dateKey) ?? []), todo])
  }
  for (const attachment of attachments) {
    attachmentCountMap.set(attachment.entryId, (attachmentCountMap.get(attachment.entryId) ?? 0) + 1)
  }

  const timeline = sortedEntries.slice(0, settings.snapshotDays).map((entry) => {
    const dayTodos = todoMap.get(entry.dateKey) ?? []
    const growthXp = getGrowthXp(entry, dayTodos, attachmentCountMap.get(entry.id) ?? 0)
    const profile = plantProfiles[entry.mood.quadrant] ?? defaultPlantProfile

    return {
      entryId: entry.id,
      dateKey: entry.dateKey,
      moodScore: entry.mood.score,
      moodLevel: entry.mood.level,
      moodQuadrant: entry.mood.quadrant,
      todoDone: dayTodos.filter((todo) => todo.done).length,
      todoTotal: dayTodos.length,
      tags: entry.tags,
      journalLength: getJournalText(entry).length,
      growthXp,
      plantKind: profile.kind,
      growthStage: getGrowthStage(entry, growthXp),
    }
  })
  const allEntryXp = sortedEntries.reduce(
    (sum, entry) =>
      sum + getGrowthXp(entry, todoMap.get(entry.dateKey) ?? [], attachmentCountMap.get(entry.id) ?? 0),
    0,
  )
  const totalXp = allEntryXp + longestStreak * 3
  const phaseIndex = getPhaseIndex(totalXp)
  const profile = latestEntry ? plantProfiles[latestEntry.mood.quadrant] ?? defaultPlantProfile : defaultPlantProfile
  const plants = timeline.map<GardenPlant>((day) => {
    const entry = sortedEntries.find((item) => item.dateKey === day.dateKey)!
    const dayProfile = plantProfiles[day.moodQuadrant] ?? defaultPlantProfile

    return {
      id: `plant-${entry.id}`,
      entryId: entry.id,
      dateKey: entry.dateKey,
      kind: dayProfile.kind,
      name: dayProfile.name,
      color: dayProfile.color,
      moodScore: entry.mood.score,
      moodLevel: entry.mood.level,
      quadrant: entry.mood.quadrant,
      growthStage: day.growthStage,
      growthXp: day.growthXp,
      journalLength: day.journalLength,
    }
  })
  const distinctQuadrants = new Set(entries.map((entry) => entry.mood.quadrant)).size
  const longestJournalLength = entries.reduce(
    (longest, entry) => Math.max(longest, getJournalText(entry).length),
    0,
  )
  const hasLowMoodCheckin = entries.some((entry) => entry.mood.score < 50)
  const achievements = [
    createAchievement('first-seed', '第一粒心种', '完成第一次日记打卡。', entries.length, 1),
    createAchievement('three-day-sprout', '三日萌芽', '连续记录 3 天。', longestStreak, 3),
    createAchievement('seven-day-bloom', '七日花期', '连续记录 7 天。', longestStreak, 7),
    createAchievement('long-journal', '写给未来的信', '有一篇日记超过 200 字。', longestJournalLength, 200),
    createAchievement('rainy-day', '风雨也有记录', '在低落的一天仍然诚实打卡。', hasLowMoodCheckin ? 1 : 0, 1),
    createAchievement('four-climates', '四象共生', '收集四种心情象限的植物。', distinctQuadrants, 4),
    createAchievement('ten-seeds', '小小园丁', '累计记录 10 天。', entries.length, 10),
    createAchievement('action-light', '行动之光', '累计完成 10 个 Todo。', completedTodos, 10),
  ]
  const essence: Record<GardenPlantKind, number> = {
    moonFern: 0,
    windBell: 0,
    dewBud: 0,
    sunBloom: 0,
  }
  for (const plant of plants) essence[plant.kind] += 1
  const recentCutoff = addDays(getTodayKey(), -13)
  const recentCheckins = entries.filter((entry) => entry.dateKey >= recentCutoff && entry.dateKey <= getTodayKey()).length
  const vitality = entries.length === 0 ? 0 : Math.round(clamp(35 + recentCheckins * 4 + currentStreak * 3, 0, 100))
  const todaySample = timeline.find((day) => day.dateKey === getTodayKey())
  const currentThreshold = phaseThresholds[phaseIndex] ?? 0
  const nextThreshold = phaseThresholds[phaseIndex + 1] ?? currentThreshold + 500

  return {
    adapterVersion: gameEngineAdapterVersion,
    generatedAt: new Date().toISOString(),
    renderMode: 'integrated-garden',
    contract: {
      source: 'xinxiangyi-sqlite',
      renderer: 'xinxiang-garden',
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
      longestStreak,
      todoCompletionRate: completionRate,
    },
    mood: {
      latestLevel: latestEntry?.mood.level ?? '平稳',
      latestQuadrant: latestEntry?.mood.quadrant ?? '低能修复',
      latestSignals: latestEntry?.mood.signals,
      latestVector: latestEntry?.mood.vector,
    },
    progress: {
      progressScore: totalXp,
      totalXp,
      phaseIndex,
      phaseName: phaseNames[phaseIndex] ?? phaseNames.at(-1)!,
      phaseProgress: getPhaseProgress(totalXp, phaseIndex),
      currentThreshold,
      nextThreshold,
    },
    garden: {
      climate: profile.climate,
      climateNote: profile.climateNote,
      vitality,
      todayCheckedIn: Boolean(todaySample),
      todayRewardXp: todaySample?.growthXp ?? 20,
      plantCount: entries.length,
      unlockedAchievementCount: achievements.filter((achievement) => achievement.unlocked).length,
      essence,
    },
    plants,
    achievements,
    timeline,
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
