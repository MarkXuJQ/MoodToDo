import type { GameEngineDaySample, GameEngineSnapshot } from './gameEngine'
import { getTodayKey } from './calendar'

export const growthGameStorageKey = 'xinxiangyi-growth-game-v1'

export type GrowthPlantFamily = 'dew' | 'moon' | 'sun'
export type GrowthPlantStage = 1 | 2 | 3 | 4 | 5
export type GrowthPlacement = 'board' | 'storage'

export type GrowthPlant = {
  id: string
  family: GrowthPlantFamily
  stage: GrowthPlantStage
  placement: GrowthPlacement
  cellIndex?: number
  sourceDateKey: string
  sourceMoodScore: number
  sourceQuadrant: string
  createdAt: string
}

export type GrowthSeedBox = {
  id: string
  rewardKey: string
  entryId: string
  dateKey: string
  family: GrowthPlantFamily
  moodScore: number
  moodLevel: string
  moodQuadrant: string
  journalLength: number
  todoDone: number
  createdAt: string
}

export type GrowthGameSave = {
  version: 1
  coins: number
  seedBoxes: GrowthSeedBox[]
  plants: GrowthPlant[]
  grantedRewardKeys: string[]
  discoveredCodexIds: string[]
  unlockedCells: number
  storageLimit: number
  lastCollectedAt: string
  lifetimeCoins: number
  mergeCount: number
  nextPlantSerial: number
  createdAt: string
  updatedAt: string
}

export type GrowthBoardCell = {
  index: number
  unlocked: boolean
  plant?: GrowthPlant
}

export type GrowthMergeGroup = {
  id: string
  family: GrowthPlantFamily
  stage: GrowthPlantStage
  count: number
  name: string
  resultName: string
}

export type GrowthCodexNode = {
  id: string
  family: GrowthPlantFamily
  stage: GrowthPlantStage
  name: string
  coinRate: number
  discovered: boolean
  heldCount: number
}

export type GrowthAchievement = {
  id: string
  title: string
  description: string
  unlocked: boolean
  progress: number
  target: number
}

export type GrowthWeather = {
  name: string
  tone: string
  description: string
  className: string
}

export type GrowthGameView = {
  save: GrowthGameSave
  boardCells: GrowthBoardCell[]
  storagePlants: GrowthPlant[]
  seedBoxes: GrowthSeedBox[]
  coins: number
  coinRate: number
  pendingCoins: number
  maxOfflineHours: number
  weather: GrowthWeather
  mergeGroups: GrowthMergeGroup[]
  codex: GrowthCodexNode[]
  achievements: GrowthAchievement[]
  unlockedCells: number
  boardCapacity: number
  storageUsed: number
  storageLimit: number
  nextUnlockCost: number | null
  nextStorageUpgradeCost: number | null
}

export type GrowthActionResult = {
  ok: boolean
  message: string
  selectedPlantId?: string
}

type GrowthMutationResult = {
  save: GrowthGameSave
  result: GrowthActionResult
}

type FamilyMeta = {
  label: string
  shortLabel: string
  color: string
  accent: string
}

type StageMeta = {
  name: string
  coinRate: number
}

const boardCellCount = 36
const initialUnlockedCells = 24
const initialStorageLimit = 12
const maxOfflineHours = 12

const familyMeta: Record<GrowthPlantFamily, FamilyMeta> = {
  dew: {
    label: '晨露系',
    shortLabel: '晨露',
    color: '#58caa7',
    accent: '#d9fff4',
  },
  moon: {
    label: '月影系',
    shortLabel: '月影',
    color: '#7d72d6',
    accent: '#e8e4ff',
  },
  sun: {
    label: '向阳系',
    shortLabel: '向阳',
    color: '#e5af42',
    accent: '#fff0b8',
  },
}

const stageMeta: Record<GrowthPlantStage, StageMeta> = {
  1: { name: '苔藓', coinRate: 1 },
  2: { name: '蕨类', coinRate: 4 },
  3: { name: '灌木', coinRate: 14 },
  4: { name: '乔木', coinRate: 45 },
  5: { name: '古树', coinRate: 140 },
}

const familyOrder: GrowthPlantFamily[] = ['dew', 'moon', 'sun']
const stageOrder: GrowthPlantStage[] = [1, 2, 3, 4, 5]

const familyWeightsByQuadrant: Record<string, Array<[GrowthPlantFamily, number]>> = {
  低能修复: [['dew', 0.62], ['moon', 0.26], ['sun', 0.12]],
  低能承压: [['moon', 0.62], ['dew', 0.28], ['sun', 0.1]],
  高能舒展: [['sun', 0.62], ['dew', 0.25], ['moon', 0.13]],
  高能紧绷: [['sun', 0.42], ['moon', 0.34], ['dew', 0.24]],
}

const weatherByQuadrant: Record<string, GrowthWeather> = {
  低能承压: {
    name: '雾雨',
    tone: '低能承压',
    description: '森林压低了颜色，替这一天收住重量。',
    className: 'garden-weather-rain',
  },
  低能修复: {
    name: '晨露',
    tone: '低能修复',
    description: '水珠停在叶尖，慢慢恢复也是进度。',
    className: 'garden-weather-dew',
  },
  高能紧绷: {
    name: '风影',
    tone: '高能紧绷',
    description: '风线掠过树冠，能量正在寻找出口。',
    className: 'garden-weather-wind',
  },
  高能舒展: {
    name: '晴光',
    tone: '高能舒展',
    description: '光落在林间，今天的舒展被好好留下。',
    className: 'garden-weather-sun',
  },
}

const defaultWeather: GrowthWeather = {
  name: '多云',
  tone: '平稳',
  description: '天气平稳，森林保持自己的节奏。',
  className: 'garden-weather-cloud',
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const unique = (values: string[]) => [...new Set(values)]

const hashString = (value: string) => {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

const getRoll = (seed: string) => (hashString(seed) % 10000) / 10000

const selectFamily = (day: GameEngineDaySample): GrowthPlantFamily => {
  const weights = familyWeightsByQuadrant[day.moodQuadrant] ?? familyWeightsByQuadrant.低能修复
  const roll = getRoll(`${day.dateKey}:${day.entryId}:${day.moodQuadrant}:${day.moodScore}`)
  let cursor = 0

  for (const [family, weight] of weights) {
    cursor += weight
    if (roll <= cursor) return family
  }

  return weights[weights.length - 1][0]
}

const createRewardKey = (day: GameEngineDaySample) => `${day.dateKey}:${day.entryId}:daily_seed_box`

const getTodoCoinBonus = (todoDone: number) => {
  if (todoDone >= 3) return 15
  if (todoDone === 2) return 10
  if (todoDone === 1) return 5
  return 0
}

const createSeedBox = (day: GameEngineDaySample, nowIso: string): GrowthSeedBox => ({
  id: `seed-${createRewardKey(day)}`,
  rewardKey: createRewardKey(day),
  entryId: day.entryId,
  dateKey: day.dateKey,
  family: selectFamily(day),
  moodScore: day.moodScore,
  moodLevel: day.moodLevel,
  moodQuadrant: day.moodQuadrant,
  journalLength: day.journalLength,
  todoDone: day.todoDone,
  createdAt: nowIso,
})

const getCodexId = (family: GrowthPlantFamily, stage: GrowthPlantStage) => `${family}-${stage}`

const getPlantCodexId = (plant: Pick<GrowthPlant, 'family' | 'stage'>) => getCodexId(plant.family, plant.stage)

const getNextStage = (stage: GrowthPlantStage): GrowthPlantStage => {
  const next = Math.min(5, stage + 1)

  return next as GrowthPlantStage
}

const getPlantName = (family: GrowthPlantFamily, stage: GrowthPlantStage) =>
  `${familyMeta[family].shortLabel}${stageMeta[stage].name}`

export const getGrowthPlantName = (plant: Pick<GrowthPlant, 'family' | 'stage'>) =>
  getPlantName(plant.family, plant.stage)

export const getGrowthPlantFamilyLabel = (family: GrowthPlantFamily) => familyMeta[family].label

export const getGrowthPlantStageName = (stage: GrowthPlantStage) => stageMeta[stage].name

export const getGrowthPlantColor = (family: GrowthPlantFamily) => familyMeta[family].color

export const getGrowthPlantAccent = (family: GrowthPlantFamily) => familyMeta[family].accent

export const getGrowthPlantCoinRate = (stage: GrowthPlantStage) => stageMeta[stage].coinRate

const touchSave = (save: GrowthGameSave, nowIso: string): GrowthGameSave => ({
  ...save,
  updatedAt: nowIso,
})

export const createInitialGrowthGameSave = (nowIso = new Date().toISOString()): GrowthGameSave => ({
  version: 1,
  coins: 0,
  seedBoxes: [],
  plants: [],
  grantedRewardKeys: [],
  discoveredCodexIds: [],
  unlockedCells: initialUnlockedCells,
  storageLimit: initialStorageLimit,
  lastCollectedAt: nowIso,
  lifetimeCoins: 0,
  mergeCount: 0,
  nextPlantSerial: 1,
  createdAt: nowIso,
  updatedAt: nowIso,
})

const normalizeStage = (value: unknown): GrowthPlantStage => {
  const stage = Number(value)

  if (stageOrder.includes(stage as GrowthPlantStage)) return stage as GrowthPlantStage
  return 1
}

const normalizeFamily = (value: unknown): GrowthPlantFamily => {
  if (value === 'dew' || value === 'moon' || value === 'sun') return value
  return 'dew'
}

const normalizePlacement = (value: unknown): GrowthPlacement => {
  if (value === 'storage') return 'storage'
  return 'board'
}

export const normalizeGrowthGameSave = (value: Partial<GrowthGameSave> | null | undefined): GrowthGameSave => {
  const initial = createInitialGrowthGameSave()
  if (!value) return initial

  const seedBoxes = Array.isArray(value.seedBoxes) ? value.seedBoxes.map((box) => ({
    ...box,
    family: normalizeFamily(box.family),
  })) : []
  const plants = Array.isArray(value.plants) ? value.plants.map((plant) => ({
    ...plant,
    family: normalizeFamily(plant.family),
    stage: normalizeStage(plant.stage),
    placement: normalizePlacement(plant.placement),
    cellIndex: typeof plant.cellIndex === 'number' ? plant.cellIndex : undefined,
  })) : []
  const discoveredFromPlants = plants.map(getPlantCodexId)

  return {
    version: 1,
    coins: Math.max(0, Math.floor(Number(value.coins) || 0)),
    seedBoxes,
    plants,
    grantedRewardKeys: Array.isArray(value.grantedRewardKeys) ? unique(value.grantedRewardKeys) : [],
    discoveredCodexIds: unique([
      ...(Array.isArray(value.discoveredCodexIds) ? value.discoveredCodexIds : []),
      ...discoveredFromPlants,
    ]),
    unlockedCells: clamp(Number(value.unlockedCells) || initialUnlockedCells, initialUnlockedCells, boardCellCount),
    storageLimit: clamp(Number(value.storageLimit) || initialStorageLimit, initialStorageLimit, 99),
    lastCollectedAt: value.lastCollectedAt || initial.lastCollectedAt,
    lifetimeCoins: Math.max(0, Math.floor(Number(value.lifetimeCoins) || 0)),
    mergeCount: Math.max(0, Math.floor(Number(value.mergeCount) || 0)),
    nextPlantSerial: Math.max(1, Math.floor(Number(value.nextPlantSerial) || plants.length + 1)),
    createdAt: value.createdAt || initial.createdAt,
    updatedAt: value.updatedAt || initial.updatedAt,
  }
}

export const readGrowthGameSave = (): GrowthGameSave => {
  if (typeof window === 'undefined') return createInitialGrowthGameSave()

  try {
    const raw = window.localStorage.getItem(growthGameStorageKey)

    if (!raw) return createInitialGrowthGameSave()
    return normalizeGrowthGameSave(JSON.parse(raw) as Partial<GrowthGameSave>)
  } catch {
    return createInitialGrowthGameSave()
  }
}

export const writeGrowthGameSave = (save: GrowthGameSave) => {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(growthGameStorageKey, JSON.stringify(save))
}

export const grantGrowthSeedBoxes = (
  save: GrowthGameSave,
  snapshot: GameEngineSnapshot,
  nowIso = new Date().toISOString(),
) => {
  const grantedSet = new Set(save.grantedRewardKeys)
  const todayKey = getTodayKey()
  const newBoxes: GrowthSeedBox[] = []
  let todoCoins = 0

  for (const day of [...snapshot.timeline].sort((left, right) => left.dateKey.localeCompare(right.dateKey))) {
    if (day.dateKey > todayKey || day.journalLength <= 0) continue

    const rewardKey = createRewardKey(day)
    if (grantedSet.has(rewardKey)) continue

    grantedSet.add(rewardKey)
    newBoxes.push(createSeedBox(day, nowIso))
    todoCoins += getTodoCoinBonus(day.todoDone)
  }

  if (newBoxes.length === 0 && todoCoins === 0) {
    return { save, grantedCount: 0, todoCoins: 0 }
  }

  return {
    save: touchSave({
      ...save,
      seedBoxes: [...save.seedBoxes, ...newBoxes],
      grantedRewardKeys: [...grantedSet],
      coins: save.coins + todoCoins,
      lifetimeCoins: save.lifetimeCoins + todoCoins,
    }, nowIso),
    grantedCount: newBoxes.length,
    todoCoins,
  }
}

const getBoardPlants = (save: GrowthGameSave) =>
  save.plants.filter((plant) => plant.placement === 'board' && typeof plant.cellIndex === 'number')

const getCoinRate = (save: GrowthGameSave) =>
  getBoardPlants(save).reduce((sum, plant) => sum + getGrowthPlantCoinRate(plant.stage), 0)

const getElapsedHours = (save: GrowthGameSave, now: Date) => {
  const lastCollected = new Date(save.lastCollectedAt).getTime()
  const nowTime = now.getTime()
  if (!Number.isFinite(lastCollected) || nowTime <= lastCollected) return 0

  return Math.min(maxOfflineHours, (nowTime - lastCollected) / 3_600_000)
}

export const getPendingGrowthCoins = (save: GrowthGameSave, now = new Date()) =>
  Math.floor(getCoinRate(save) * getElapsedHours(save, now))

const settleCoins = (save: GrowthGameSave, nowIso: string) => {
  const pendingCoins = getPendingGrowthCoins(save, new Date(nowIso))

  return touchSave({
    ...save,
    coins: save.coins + pendingCoins,
    lifetimeCoins: save.lifetimeCoins + pendingCoins,
    lastCollectedAt: nowIso,
  }, nowIso)
}

const findEmptyBoardCell = (save: GrowthGameSave) => {
  const occupied = new Set(getBoardPlants(save).map((plant) => plant.cellIndex))

  for (let index = 0; index < save.unlockedCells; index += 1) {
    if (!occupied.has(index)) return index
  }

  return undefined
}

const getStorageUsed = (save: GrowthGameSave) =>
  save.plants.filter((plant) => plant.placement === 'storage').length

const rememberPlant = (save: GrowthGameSave, plant: GrowthPlant) => ({
  ...save,
  discoveredCodexIds: unique([...save.discoveredCodexIds, getPlantCodexId(plant)]),
})

const createPlantFromSeedBox = (
  save: GrowthGameSave,
  box: GrowthSeedBox,
  placement: GrowthPlacement,
  nowIso: string,
  cellIndex?: number,
): GrowthPlant => ({
  id: `growth-plant-${save.nextPlantSerial}`,
  family: box.family,
  stage: 1,
  placement,
  cellIndex,
  sourceDateKey: box.dateKey,
  sourceMoodScore: box.moodScore,
  sourceQuadrant: box.moodQuadrant,
  createdAt: nowIso,
})

export const collectGrowthCoins = (
  save: GrowthGameSave,
  nowIso = new Date().toISOString(),
): GrowthMutationResult => {
  const pendingCoins = getPendingGrowthCoins(save, new Date(nowIso))

  if (pendingCoins <= 0) {
    return {
      save,
      result: {
        ok: false,
        message: getCoinRate(save) > 0 ? '金币还在路上，稍后再来收取。' : '先把植物放进森林，才会开始产出金币。',
      },
    }
  }

  return {
    save: settleCoins(save, nowIso),
    result: {
      ok: true,
      message: `收取了 ${pendingCoins} 枚金币。`,
    },
  }
}

export const openGrowthSeedBox = (
  save: GrowthGameSave,
  boxId: string,
  nowIso = new Date().toISOString(),
): GrowthMutationResult => {
  const box = save.seedBoxes.find((item) => item.id === boxId)

  if (!box) {
    return {
      save,
      result: { ok: false, message: '没有找到这个心种匣。' },
    }
  }

  const boardCell = findEmptyBoardCell(save)
  const canUseStorage = getStorageUsed(save) < save.storageLimit

  if (boardCell == null && !canUseStorage) {
    return {
      save,
      result: { ok: false, message: '森林和仓库都满了，先融合或扩建一格。' },
    }
  }

  const settled = settleCoins(save, nowIso)
  const placement: GrowthPlacement = boardCell == null ? 'storage' : 'board'
  const plant = createPlantFromSeedBox(settled, box, placement, nowIso, boardCell)
  const nextSave = rememberPlant({
    ...settled,
    seedBoxes: settled.seedBoxes.filter((item) => item.id !== boxId),
    plants: [...settled.plants, plant],
    nextPlantSerial: settled.nextPlantSerial + 1,
  }, plant)

  return {
    save: touchSave(nextSave, nowIso),
    result: {
      ok: true,
      message: `打开了心种匣，获得 ${getGrowthPlantName(plant)}。`,
      selectedPlantId: plant.id,
    },
  }
}

export const mergeGrowthPlants = (
  save: GrowthGameSave,
  family: GrowthPlantFamily,
  stage: GrowthPlantStage,
  nowIso = new Date().toISOString(),
): GrowthMutationResult => {
  if (stage >= 5) {
    return {
      save,
      result: { ok: false, message: '古树已经是当前最高阶段。' },
    }
  }

  const candidates = save.plants
    .filter((plant) => plant.family === family && plant.stage === stage)
    .sort((left, right) =>
      Number(left.placement === 'storage') - Number(right.placement === 'storage') ||
      (left.cellIndex ?? 999) - (right.cellIndex ?? 999) ||
      left.createdAt.localeCompare(right.createdAt),
    )

  if (candidates.length < 3) {
    return {
      save,
      result: { ok: false, message: `还需要 ${3 - candidates.length} 株${getPlantName(family, stage)}才能融合。` },
    }
  }

  const consumed = candidates.slice(0, 3)
  const consumedIds = new Set(consumed.map((plant) => plant.id))
  const boardAnchor = consumed.find((plant) => plant.placement === 'board' && typeof plant.cellIndex === 'number')
  const nextStage = getNextStage(stage)
  const settled = settleCoins(save, nowIso)
  const resultPlant: GrowthPlant = {
    id: `growth-plant-${settled.nextPlantSerial}`,
    family,
    stage: nextStage,
    placement: boardAnchor ? 'board' : 'storage',
    cellIndex: boardAnchor?.cellIndex,
    sourceDateKey: consumed[0].sourceDateKey,
    sourceMoodScore: consumed[0].sourceMoodScore,
    sourceQuadrant: consumed[0].sourceQuadrant,
    createdAt: nowIso,
  }
  const nextSave = rememberPlant({
    ...settled,
    plants: [...settled.plants.filter((plant) => !consumedIds.has(plant.id)), resultPlant],
    mergeCount: settled.mergeCount + 1,
    nextPlantSerial: settled.nextPlantSerial + 1,
  }, resultPlant)

  return {
    save: touchSave(nextSave, nowIso),
    result: {
      ok: true,
      message: `融合成功，生成 ${getGrowthPlantName(resultPlant)}。`,
      selectedPlantId: resultPlant.id,
    },
  }
}

export const moveGrowthPlant = (
  save: GrowthGameSave,
  plantId: string,
  placement: GrowthPlacement,
  nowIso = new Date().toISOString(),
): GrowthMutationResult => {
  const plant = save.plants.find((item) => item.id === plantId)

  if (!plant) {
    return {
      save,
      result: { ok: false, message: '没有找到这株植物。' },
    }
  }

  if (plant.placement === placement) {
    return {
      save,
      result: { ok: false, message: placement === 'board' ? '它已经在森林里了。' : '它已经在仓库里了。' },
    }
  }

  const settled = settleCoins(save, nowIso)

  if (placement === 'board') {
    const cellIndex = findEmptyBoardCell(settled)

    if (cellIndex == null) {
      return {
        save,
        result: { ok: false, message: '森林空地已满，先融合或扩建。' },
      }
    }

    return {
      save: touchSave({
        ...settled,
        plants: settled.plants.map((item) =>
          item.id === plantId ? { ...item, placement: 'board', cellIndex } : item,
        ),
      }, nowIso),
      result: { ok: true, message: '已经放回森林。', selectedPlantId: plantId },
    }
  }

  if (getStorageUsed(settled) >= settled.storageLimit) {
    return {
      save,
      result: { ok: false, message: '仓库已满，先整理出一个空位。' },
    }
  }

  return {
    save: touchSave({
      ...settled,
      plants: settled.plants.map((item) =>
        item.id === plantId ? { ...item, placement: 'storage', cellIndex: undefined } : item,
      ),
    }, nowIso),
    result: { ok: true, message: '已经收入仓库。', selectedPlantId: plantId },
  }
}

export const getNextGrowthUnlockCost = (unlockedCells: number) => {
  if (unlockedCells >= boardCellCount) return null

  return 80 + Math.max(0, unlockedCells - initialUnlockedCells) * 40
}

export const getNextGrowthStorageUpgradeCost = (storageLimit: number) => {
  if (storageLimit >= 36) return null

  return 120 + Math.max(0, storageLimit - initialStorageLimit) * 20
}

export const unlockGrowthCell = (
  save: GrowthGameSave,
  nowIso = new Date().toISOString(),
): GrowthMutationResult => {
  const cost = getNextGrowthUnlockCost(save.unlockedCells)

  if (cost == null) {
    return {
      save,
      result: { ok: false, message: '森林空地已经全部开放。' },
    }
  }

  if (save.coins < cost) {
    return {
      save,
      result: { ok: false, message: `还需要 ${cost - save.coins} 枚金币才能扩建。` },
    }
  }

  return {
    save: touchSave({
      ...save,
      coins: save.coins - cost,
      unlockedCells: save.unlockedCells + 1,
    }, nowIso),
    result: { ok: true, message: '扩建了一格森林空地。' },
  }
}

export const upgradeGrowthStorage = (
  save: GrowthGameSave,
  nowIso = new Date().toISOString(),
): GrowthMutationResult => {
  const cost = getNextGrowthStorageUpgradeCost(save.storageLimit)

  if (cost == null) {
    return {
      save,
      result: { ok: false, message: '仓库已经扩到当前上限。' },
    }
  }

  if (save.coins < cost) {
    return {
      save,
      result: { ok: false, message: `还需要 ${cost - save.coins} 枚金币才能扩容仓库。` },
    }
  }

  return {
    save: touchSave({
      ...save,
      coins: save.coins - cost,
      storageLimit: Math.min(36, save.storageLimit + 6),
    }, nowIso),
    result: { ok: true, message: '仓库扩容了 6 格。' },
  }
}

const createAchievement = (
  id: string,
  title: string,
  description: string,
  progress: number,
  target: number,
): GrowthAchievement => ({
  id,
  title,
  description,
  progress: Math.min(progress, target),
  target,
  unlocked: progress >= target,
})

const createGrowthCodex = (save: GrowthGameSave): GrowthCodexNode[] => {
  const heldCounts = new Map<string, number>()

  for (const plant of save.plants) {
    const id = getPlantCodexId(plant)
    heldCounts.set(id, (heldCounts.get(id) ?? 0) + 1)
  }

  return familyOrder.flatMap((family) =>
    stageOrder.map((stage) => {
      const id = getCodexId(family, stage)

      return {
        id,
        family,
        stage,
        name: getPlantName(family, stage),
        coinRate: getGrowthPlantCoinRate(stage),
        discovered: save.discoveredCodexIds.includes(id),
        heldCount: heldCounts.get(id) ?? 0,
      }
    }),
  )
}

const createGrowthAchievements = (
  save: GrowthGameSave,
  snapshot: GameEngineSnapshot,
  codex: GrowthCodexNode[],
): GrowthAchievement[] => {
  const hasStage = (stage: GrowthPlantStage) => codex.some((node) => node.stage === stage && node.discovered)
  const discoveredCount = codex.filter((node) => node.discovered).length

  return [
    createAchievement('first-box', '第一枚心种匣', '日记第一次变成可领取的成长内容。', save.grantedRewardKeys.length, 1),
    createAchievement('first-moss', '第一株苔藓', '打开一枚心种匣，森林开始有了落点。', save.plants.length + (hasStage(1) ? 1 : 0), 1),
    createAchievement('first-merge', '第一次融合', '三株同系同阶植物融合成更高阶段。', save.mergeCount, 1),
    createAchievement('first-fern', '第一株蕨类', '见到第二阶段的植物。', hasStage(2) ? 1 : 0, 1),
    createAchievement('first-shrub', '第一株灌木', '森林开始出现清楚的层次。', hasStage(3) ? 1 : 0, 1),
    createAchievement('first-tree', '第一株乔木', '一棵树真正站进了森林。', hasStage(4) ? 1 : 0, 1),
    createAchievement('first-ancient', '第一株古树', '长期记录长成了可以停留的地方。', hasStage(5) ? 1 : 0, 1),
    createAchievement('first-coins', '第一次收取金币', '植物开始产生可用于扩建的资源。', save.lifetimeCoins, 1),
    createAchievement('first-expand', '第一次扩建', '用金币打开新的森林空地。', save.unlockedCells - initialUnlockedCells, 1),
    createAchievement('codex-eight', '图谱成林', '图谱发现 8 个植物节点。', discoveredCount, 8),
    createAchievement('seven-records', '七日记录', '连续记录 7 天。', snapshot.metrics.longestStreak, 7),
    createAchievement('fourteen-records', '十四日记录', '连续记录 14 天。', snapshot.metrics.longestStreak, 14),
  ]
}

const getGrowthWeather = (snapshot: GameEngineSnapshot) => {
  const sourceDay = snapshot.timeline[1] ?? snapshot.timeline[0]

  return sourceDay ? weatherByQuadrant[sourceDay.moodQuadrant] ?? defaultWeather : defaultWeather
}

export const createGrowthGameView = (
  save: GrowthGameSave,
  snapshot: GameEngineSnapshot,
  now = new Date(),
): GrowthGameView => {
  const normalizedSave = normalizeGrowthGameSave(save)
  const plantByCell = new Map<number, GrowthPlant>()

  for (const plant of getBoardPlants(normalizedSave)) {
    if (plant.cellIndex != null) plantByCell.set(plant.cellIndex, plant)
  }

  const boardCells = Array.from({ length: boardCellCount }, (_, index) => ({
    index,
    unlocked: index < normalizedSave.unlockedCells,
    plant: plantByCell.get(index),
  }))
  const mergeGroups = familyOrder.flatMap((family) =>
    stageOrder.flatMap((stage) => {
      if (stage >= 5) return []

      const count = normalizedSave.plants.filter((plant) => plant.family === family && plant.stage === stage).length

      if (count < 3) return []

      return [{
        id: `${family}-${stage}`,
        family,
        stage,
        count,
        name: getPlantName(family, stage),
        resultName: getPlantName(family, getNextStage(stage)),
      }]
    }),
  )
  const codex = createGrowthCodex(normalizedSave)

  return {
    save: normalizedSave,
    boardCells,
    storagePlants: normalizedSave.plants.filter((plant) => plant.placement === 'storage'),
    seedBoxes: normalizedSave.seedBoxes,
    coins: normalizedSave.coins,
    coinRate: getCoinRate(normalizedSave),
    pendingCoins: getPendingGrowthCoins(normalizedSave, now),
    maxOfflineHours,
    weather: getGrowthWeather(snapshot),
    mergeGroups,
    codex,
    achievements: createGrowthAchievements(normalizedSave, snapshot, codex),
    unlockedCells: normalizedSave.unlockedCells,
    boardCapacity: boardCellCount,
    storageUsed: getStorageUsed(normalizedSave),
    storageLimit: normalizedSave.storageLimit,
    nextUnlockCost: getNextGrowthUnlockCost(normalizedSave.unlockedCells),
    nextStorageUpgradeCost: getNextGrowthStorageUpgradeCost(normalizedSave.storageLimit),
  }
}
