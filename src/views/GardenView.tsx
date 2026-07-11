import { useCallback, useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import { CloudSun, Coins, LockKeyhole, PackageOpen, Sprout, Trophy, X } from 'lucide-react'

import type { GameEngineSnapshot } from '../lib/gameEngine'
import { useDialogA11y } from '../hooks/use-dialog-a11y'
import {
  getGrowthPlantAccent,
  getGrowthPlantCoinRate,
  getGrowthPlantColor,
  getGrowthPlantFamilyLabel,
  getGrowthPlantName,
  getGrowthPlantStageName,
  type GrowthActionResult,
  type GrowthGameView,
  type GrowthPlacement,
  type GrowthPlant,
} from '../lib/growthGame'

type GardenViewProps = {
  growthGame: GrowthGameView
  snapshot: GameEngineSnapshot
  onCollectCoins: () => GrowthActionResult
  onMovePlant: (plantId: string, placement: GrowthPlacement) => GrowthActionResult
  onMovePlantToCell: (plantId: string, cellIndex: number) => GrowthActionResult
  onOpenSeedBox: (boxId: string) => GrowthActionResult
  onUnlockCell: () => GrowthActionResult
  onUpgradeStorage: () => GrowthActionResult
}

type GardenPanel = 'inventory' | 'codex' | 'achievements'

type MergeBurst = {
  id: number
  plantId: string
}

const panelLabels: Record<GardenPanel, string> = {
  inventory: '库存',
  codex: '图谱',
  achievements: '成就',
}

const plantDragMimeType = 'application/x-xinxiangyi-growth-plant'
const gardenBoardColumnCount = 6

const createMergeKey = (plant: Pick<GrowthPlant, 'family' | 'stage'>) => `${plant.family}-${plant.stage}`

const getGardenLineCandidateIndexes = (cellIndex: number, cellCount: number) => {
  const rowCount = Math.ceil(cellCount / gardenBoardColumnCount)
  const row = Math.floor(cellIndex / gardenBoardColumnCount)
  const column = cellIndex % gardenBoardColumnCount
  const lines: number[][] = []

  for (const startColumn of [column - 2, column - 1, column]) {
    if (startColumn < 0 || startColumn + 2 >= gardenBoardColumnCount) continue
    lines.push([
      row * gardenBoardColumnCount + startColumn,
      row * gardenBoardColumnCount + startColumn + 1,
      row * gardenBoardColumnCount + startColumn + 2,
    ])
  }

  for (const startRow of [row - 2, row - 1, row]) {
    if (startRow < 0 || startRow + 2 >= rowCount) continue
    lines.push([
      startRow * gardenBoardColumnCount + column,
      (startRow + 1) * gardenBoardColumnCount + column,
      (startRow + 2) * gardenBoardColumnCount + column,
    ].filter((index) => index < cellCount))
  }

  return lines.filter((line) => line.length === 3)
}

const canPlantMergeAtCell = (
  plantByCell: Map<number, GrowthPlant>,
  cellIndex: number,
  plant: GrowthPlant,
  cellCount: number,
) => {
  if (plant.stage >= 5) return false

  return getGardenLineCandidateIndexes(cellIndex, cellCount).some((lineIndexes) =>
    lineIndexes.every((index) => {
      const linePlant = plantByCell.get(index)

      return linePlant?.family === plant.family && linePlant.stage === plant.stage
    }),
  )
}

function PlantFigure({ plant, compact = false }: { plant: GrowthPlant; compact?: boolean }) {
  return (
    <span
      className={`garden-plant-figure garden-plant-family-${plant.family} garden-plant-stage-${plant.stage} ${compact ? 'garden-plant-compact' : ''}`}
      style={{
        '--plant-color': getGrowthPlantColor(plant.family),
        '--plant-accent': getGrowthPlantAccent(plant.family),
      } as CSSProperties}
      aria-hidden="true"
    >
      <span className="garden-plant-pixel-shadow" />
      <span className="garden-plant-pixel-stem" />
      <span className="garden-plant-pixel-leaf garden-plant-pixel-leaf-left" />
      <span className="garden-plant-pixel-leaf garden-plant-pixel-leaf-right" />
      <span className="garden-plant-pixel-bloom">
        <i className="pixel-block pixel-block-1" />
        <i className="pixel-block pixel-block-2" />
        <i className="pixel-block pixel-block-3" />
        <i className="pixel-block pixel-block-4" />
        <b className="pixel-core" />
      </span>
      <span className="garden-plant-pixel-soil" />
    </span>
  )
}

function runGardenAction(
  action: GrowthActionResult,
  setFeedback: (message: string) => void,
  setSelectedPlantId: (plantId: string) => void,
  setMergeBurst: (burst: MergeBurst | null) => void,
) {
  if (action.message.trim()) setFeedback(action.message)
  if (action.selectedPlantId) setSelectedPlantId(action.selectedPlantId)
  if (action.effect === 'merge' && action.selectedPlantId) {
    setMergeBurst({ id: Date.now(), plantId: action.selectedPlantId })
  }
}

export function GardenView({
  growthGame,
  snapshot,
  onCollectCoins,
  onMovePlant,
  onMovePlantToCell,
  onOpenSeedBox,
  onUnlockCell,
  onUpgradeStorage,
}: GardenViewProps) {
  const [selectedPlantId, setSelectedPlantId] = useState('')
  const [tapMovePlantId, setTapMovePlantId] = useState('')
  const [draggingPlantId, setDraggingPlantId] = useState('')
  const [dragOverCellIndex, setDragOverCellIndex] = useState<number | null>(null)
  const [activePanel, setActivePanel] = useState<GardenPanel | null>(null)
  const [feedback, setFeedback] = useState('写下来的日子会慢慢长成这里的森林。')
  const [mergeBurst, setMergeBurst] = useState<MergeBurst | null>(null)
  const closePanel = useCallback(() => setActivePanel(null), [])
  const panelRef = useDialogA11y<HTMLElement>(Boolean(activePanel), closePanel)
  const selectedPlant = useMemo(
    () => growthGame.save.plants.find((plant) => plant.id === selectedPlantId),
    [growthGame.save.plants, selectedPlantId],
  )
  const firstSeedBox = growthGame.seedBoxes[0]
  const mergeableGroupKeys = useMemo(
    () => new Set(growthGame.mergeGroups.map((group) => group.id)),
    [growthGame.mergeGroups],
  )
  const activeMovePlantId = draggingPlantId || tapMovePlantId
  const activeMovePlant = useMemo(
    () => growthGame.save.plants.find((plant) => plant.id === activeMovePlantId),
    [activeMovePlantId, growthGame.save.plants],
  )
  const possibleMergeTargetIndexes = useMemo(() => {
    const indexes = new Set<number>()

    if (!activeMovePlant || !mergeableGroupKeys.has(createMergeKey(activeMovePlant))) return indexes

    const sourceCellIndex = activeMovePlant.placement === 'board' ? activeMovePlant.cellIndex : undefined

    for (const targetCell of growthGame.boardCells) {
      if (!targetCell.unlocked) continue

      const plantByCell = new Map<number, GrowthPlant>()

      for (const boardCell of growthGame.boardCells) {
        const boardPlant = boardCell.plant
        if (!boardPlant || boardPlant.id === activeMovePlant.id || boardPlant.id === targetCell.plant?.id) continue
        plantByCell.set(boardCell.index, boardPlant)
      }

      if (targetCell.plant && sourceCellIndex != null) {
        plantByCell.set(sourceCellIndex, { ...targetCell.plant, cellIndex: sourceCellIndex })
      }

      const movedPlant: GrowthPlant = {
        ...activeMovePlant,
        placement: 'board',
        cellIndex: targetCell.index,
      }
      plantByCell.set(targetCell.index, movedPlant)

      if (canPlantMergeAtCell(plantByCell, targetCell.index, movedPlant, growthGame.boardCells.length)) {
        indexes.add(targetCell.index)
      }
    }

    return indexes
  }, [activeMovePlant, growthGame.boardCells, mergeableGroupKeys])

  useEffect(() => {
    if (selectedPlantId && growthGame.save.plants.some((plant) => plant.id === selectedPlantId)) return
    setSelectedPlantId('')
  }, [growthGame.save.plants, selectedPlantId])

  useEffect(() => {
    if (!tapMovePlantId || growthGame.save.plants.some((plant) => plant.id === tapMovePlantId)) return
    setTapMovePlantId('')
  }, [growthGame.save.plants, tapMovePlantId])

  const hasPrimaryAction = Boolean(firstSeedBox || growthGame.pendingCoins > 0)
  useEffect(() => {
    if (!mergeBurst) return undefined
    const timer = window.setTimeout(() => setMergeBurst(null), 780)

    return () => window.clearTimeout(timer)
  }, [mergeBurst])

  const handleAction = (action: GrowthActionResult) => runGardenAction(action, setFeedback, setSelectedPlantId, setMergeBurst)
  const handleOpenFirstSeedBox = () => {
    if (!firstSeedBox) {
      if (snapshot.garden.todayCheckedIn) {
        setFeedback('今天的心种匣已经处理完了，明天的记录会继续带来新的收获。')
        return
      }

      setFeedback('这里会等待你的每日记录长成新的心种匣。')
      return
    }

    handleAction(onOpenSeedBox(firstSeedBox.id))
  }
  const handlePrimaryAction = () => {
    if (firstSeedBox) {
      handleOpenFirstSeedBox()
      return
    }

    if (growthGame.pendingCoins > 0) {
      handleAction(onCollectCoins())
      return
    }

    setFeedback(snapshot.garden.todayCheckedIn ? '森林正在休息，金币会慢慢长出来。' : '这里会等待你的每日记录长成新的心种匣。')
  }
  const primaryActionLabel = firstSeedBox
    ? '打开心种匣'
    : `收取 ${growthGame.pendingCoins} 金币`
  const handlePlantDragStart = (event: DragEvent<HTMLButtonElement>, plantId: string) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(plantDragMimeType, plantId)
    event.dataTransfer.setData('text/plain', plantId)
    setDraggingPlantId(plantId)
    setSelectedPlantId(plantId)
    setTapMovePlantId('')
  }
  const handlePlantDragEnd = () => {
    setDraggingPlantId('')
    setDragOverCellIndex(null)
  }
  const handleCellDragOver = (event: DragEvent<HTMLDivElement>, cellIndex: number, unlocked: boolean) => {
    if (!unlocked) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverCellIndex(cellIndex)
  }
  const handleCellDrop = (event: DragEvent<HTMLDivElement>, cellIndex: number, unlocked: boolean) => {
    event.preventDefault()
    setDragOverCellIndex(null)

    if (!unlocked) return

    const plantId = event.dataTransfer.getData(plantDragMimeType) || event.dataTransfer.getData('text/plain') || draggingPlantId
    if (!plantId) return

    handleAction(onMovePlantToCell(plantId, cellIndex))
    setDraggingPlantId('')
  }
  const handleCellClick = (cellPlant: GrowthPlant | undefined, cellIndex: number, unlocked: boolean) => {
    if (!unlocked) return

    if (tapMovePlantId && tapMovePlantId !== cellPlant?.id) {
      handleAction(onMovePlantToCell(tapMovePlantId, cellIndex))
      setTapMovePlantId('')
      return
    }

    if (tapMovePlantId && tapMovePlantId === cellPlant?.id && possibleMergeTargetIndexes.has(cellIndex)) {
      handleAction(onMovePlantToCell(tapMovePlantId, cellIndex))
      setTapMovePlantId('')
      return
    }

    if (cellPlant) {
      setSelectedPlantId(cellPlant.id)
      setTapMovePlantId((current) => (current === cellPlant.id ? '' : cellPlant.id))
      return
    }

    setSelectedPlantId('')
    setTapMovePlantId('')
  }
  const handleStoragePlantDragStart = (event: DragEvent<HTMLButtonElement>, plantId: string) => {
    handlePlantDragStart(event, plantId)
    closePanel()
  }

  return (
    <section className={`garden-page garden-page-game ${growthGame.weather.className}`} aria-label="心象森林">
      <main className="garden-game-stage">
        <div className="garden-scene-sky" aria-hidden="true">
          <span className="garden-sky-tint" />
          <span className="garden-sun" />
          <span className="garden-sun-rays" />
          <span className="garden-cloud garden-cloud-one" />
          <span className="garden-cloud garden-cloud-two" />
          <span className="garden-cloud-shade garden-cloud-shade-one" />
          <span className="garden-cloud-shade garden-cloud-shade-two" />
          <span className="garden-weather-lines" />
          <span className="garden-rain-layer garden-rain-layer-back" />
          <span className="garden-rain-layer garden-rain-layer-front" />
          <span className="garden-rain-splash" />
          <span className="garden-rain-fog" />
          <span className="garden-wind-stream garden-wind-stream-one" />
          <span className="garden-wind-stream garden-wind-stream-two" />
          <span className="garden-sky-spark garden-sky-spark-one" />
          <span className="garden-sky-spark garden-sky-spark-two" />
          <span className="garden-sky-spark garden-sky-spark-three" />
        </div>

        <div className="garden-scene-land" aria-hidden="true">
          <span className="garden-distant-hill garden-distant-hill-left" />
          <span className="garden-distant-hill garden-distant-hill-right" />
          <span className="garden-tree-line" />
          <span className="garden-ground-glow" />
          <span className="garden-foreground-pixels" />
        </div>

        <header className="garden-overlay-hud" aria-label="成长页状态">
          <div className="garden-hud-pills" aria-label="成长资源">
            <span className="garden-hud-pill garden-hud-pill-coins">
              <Coins size={17} aria-hidden="true" />
              {growthGame.coins} 金币
            </span>
            <span className="garden-hud-pill">
              <CloudSun size={17} aria-hidden="true" />
              {growthGame.weather.name}
            </span>
            <button className="garden-hud-pill garden-menu-entry" type="button" onClick={() => setActivePanel('inventory')}>
              <PackageOpen size={17} aria-hidden="true" />
              菜单
            </button>
          </div>
        </header>

        <section className="garden-board-field" aria-labelledby="garden-scene-title">
          <h2 className="sr-only" id="garden-scene-title">心象森林棋盘</h2>
          <div className="garden-board" role="grid" aria-label="心象森林棋盘">
            {growthGame.boardCells.map((cell) => {
              const isMergeableMaterial = cell.plant ? mergeableGroupKeys.has(createMergeKey(cell.plant)) : false
              const isMergeTarget = possibleMergeTargetIndexes.has(cell.index)

              return (
                <div
                  className={`garden-cell ${cell.unlocked ? 'garden-cell-unlocked' : 'garden-cell-locked'} ${cell.plant ? 'garden-cell-filled' : ''} ${tapMovePlantId && cell.unlocked && cell.plant?.id !== tapMovePlantId ? 'garden-cell-tap-target' : ''} ${isMergeTarget ? 'garden-cell-merge-target' : ''} ${dragOverCellIndex === cell.index ? 'garden-cell-drag-over' : ''}`}
                  role="gridcell"
                  aria-label={cell.plant ? `${getGrowthPlantName(cell.plant)}${isMergeableMaterial ? '，可融合材料' : ''}` : cell.unlocked ? isMergeTarget ? '可融合空地' : '空地' : '未解锁空地'}
                  key={cell.index}
                  onClick={() => handleCellClick(cell.plant, cell.index, cell.unlocked)}
                  onDragEnter={(event) => handleCellDragOver(event, cell.index, cell.unlocked)}
                  onDragLeave={() => setDragOverCellIndex((current) => (current === cell.index ? null : current))}
                  onDragOver={(event) => handleCellDragOver(event, cell.index, cell.unlocked)}
                  onDrop={(event) => handleCellDrop(event, cell.index, cell.unlocked)}
                >
                  {cell.plant ? (
                    <button
                      className={`garden-cell-plant ${isMergeableMaterial ? 'garden-cell-plant-mergeable' : ''} ${cell.plant.id === selectedPlant?.id ? 'garden-cell-plant-selected' : ''} ${cell.plant.id === tapMovePlantId ? 'garden-cell-plant-picked' : ''} ${cell.plant.id === draggingPlantId ? 'garden-cell-plant-dragging' : ''} ${cell.plant.id === mergeBurst?.plantId ? 'garden-cell-plant-merged' : ''}`}
                      type="button"
                      aria-pressed={cell.plant.id === selectedPlant?.id}
                      draggable
                      onClick={(event) => {
                        event.stopPropagation()
                        handleCellClick(cell.plant, cell.index, cell.unlocked)
                      }}
                      onDragEnd={handlePlantDragEnd}
                      onDragStart={(event) => handlePlantDragStart(event, cell.plant!.id)}
                    >
                      <PlantFigure plant={cell.plant} />
                      <span className="sr-only">{getGrowthPlantName(cell.plant)}</span>
                    </button>
                  ) : cell.unlocked ? (
                    <span className="garden-cell-ground" aria-hidden="true" />
                  ) : (
                    <LockKeyhole size={16} aria-hidden="true" />
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {hasPrimaryAction && (
          <aside className="garden-action-dock" aria-label="成长操作">
            <button className="garden-pixel-button garden-pixel-button-gold" type="button" onClick={handlePrimaryAction}>
              {firstSeedBox ? <PackageOpen size={17} aria-hidden="true" /> : <Coins size={17} aria-hidden="true" />}
              {primaryActionLabel}
            </button>
          </aside>
        )}

        <div className="garden-status-line" role="status" aria-live="polite">
          {feedback}
        </div>

        {selectedPlant && (
          <aside className="garden-plant-popover" aria-label="选中植物信息">
            <PlantFigure plant={selectedPlant} compact />
            <div>
              <h3>{getGrowthPlantName(selectedPlant)}</h3>
              <p>
                {getGrowthPlantFamilyLabel(selectedPlant.family)} · {getGrowthPlantStageName(selectedPlant.stage)} · {getGrowthPlantCoinRate(selectedPlant.stage)} 金币/小时
              </p>
              <div className="garden-selected-actions">
                <button
                  className="garden-mini-button"
                  type="button"
                  onClick={() => handleAction(onMovePlant(selectedPlant.id, selectedPlant.placement === 'board' ? 'storage' : 'board'))}
                >
                  {selectedPlant.placement === 'board' ? '仓库' : '森林'}
                </button>
              </div>
            </div>
          </aside>
        )}

        <button className="garden-expand-fab" type="button" onClick={() => handleAction(onUnlockCell())}>
          {growthGame.nextUnlockCost == null ? '空地满级' : `扩地 ${growthGame.nextUnlockCost}`}
        </button>

        {activePanel && (
          <>
            <button className="garden-drawer-backdrop" type="button" tabIndex={-1} aria-label="关闭成长菜单" onClick={closePanel} />
            <section
              className="garden-drawer"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="garden-panel-title"
              tabIndex={-1}
            >
              <div className="garden-drawer-head">
                <h2 id="garden-panel-title">{panelLabels[activePanel]}</h2>
                <button className="garden-mini-button" type="button" aria-label="关闭成长面板" data-dialog-initial-focus onClick={closePanel}>
                  <X size={15} aria-hidden="true" />
                </button>
              </div>

              <div className="garden-drawer-tabs" role="tablist" aria-label="成长菜单">
                {(Object.keys(panelLabels) as GardenPanel[]).map((panel) => (
                  <button
                    className={activePanel === panel ? 'garden-drawer-tab-active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={activePanel === panel}
                    key={panel}
                    onClick={() => setActivePanel(panel)}
                  >
                    {panelLabels[panel]}
                  </button>
                ))}
              </div>

              {activePanel === 'inventory' && (
                <div className="garden-inventory-grid">
                  <article>
                    <div className="garden-card-head">
                      <strong>心种匣</strong>
                      <span>{growthGame.seedBoxes.length}</span>
                    </div>
                    {growthGame.seedBoxes.length > 0 ? (
                      <div className="garden-seed-list">
                        {growthGame.seedBoxes.slice(0, 6).map((box) => (
                          <button className="garden-seed-box" type="button" key={box.id} onClick={() => handleAction(onOpenSeedBox(box.id))}>
                            <PackageOpen size={19} aria-hidden="true" />
                            <span>
                              <strong>{box.moodLevel}心种</strong>
                              <small>{box.moodQuadrant} · {box.moodScore} 分</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="garden-muted">没有待开启的心种匣。</p>
                    )}
                  </article>

                  <article>
                    <div className="garden-card-head">
                      <strong>仓库</strong>
                      <span>{growthGame.storageUsed}/{growthGame.storageLimit}</span>
                    </div>
                    {growthGame.storagePlants.length > 0 ? (
                      <div className="garden-storage-list">
                        {growthGame.storagePlants.map((plant) => (
                          <button
                            className={`garden-storage-plant ${mergeableGroupKeys.has(createMergeKey(plant)) ? 'garden-storage-plant-mergeable' : ''}`}
                            type="button"
                            draggable
                            key={plant.id}
                            onClick={() => handleAction(onMovePlant(plant.id, 'board'))}
                            onDragEnd={handlePlantDragEnd}
                            onDragStart={(event) => handleStoragePlantDragStart(event, plant.id)}
                          >
                            <PlantFigure plant={plant} compact />
                            <span>{getGrowthPlantName(plant)}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="garden-muted">仓库植物不产金币。</p>
                    )}
                    <button className="garden-expand-button garden-storage-upgrade-button" type="button" onClick={() => handleAction(onUpgradeStorage())}>
                      {growthGame.nextStorageUpgradeCost == null ? '仓库满级' : `仓库 +6 · ${growthGame.nextStorageUpgradeCost}`}
                    </button>
                  </article>
                </div>
              )}

              {activePanel === 'codex' && (
                <div className="garden-codex-grid" role="list" aria-label="植物图谱">
                  {growthGame.codex.map((node) => (
                    <article className={`garden-codex-node ${node.discovered ? 'garden-codex-node-discovered' : ''}`} role="listitem" key={node.id}>
                      <span className="garden-codex-sprite" style={{ '--plant-color': getGrowthPlantColor(node.family) } as CSSProperties}>
                        {node.discovered ? <Sprout size={22} aria-hidden="true" /> : <LockKeyhole size={18} aria-hidden="true" />}
                      </span>
                      <strong>{node.discovered ? node.name : '未发现'}</strong>
                      <small>{getGrowthPlantFamilyLabel(node.family)} · {node.coinRate}/h</small>
                      {node.discovered && <em>持有 {node.heldCount}</em>}
                    </article>
                  ))}
                </div>
              )}

              {activePanel === 'achievements' && (
                <div className="garden-achievement-grid" role="list" aria-label="成长成就">
                  {growthGame.achievements.map((achievement) => (
                    <article className={`garden-achievement ${achievement.unlocked ? 'garden-achievement-unlocked' : ''}`} role="listitem" key={achievement.id}>
                      <span className="garden-achievement-icon">
                        {achievement.unlocked ? <Trophy size={20} aria-hidden="true" /> : <LockKeyhole size={19} aria-hidden="true" />}
                      </span>
                      <div>
                        <strong>{achievement.title}</strong>
                        <p>{achievement.description}</p>
                        <small>{achievement.unlocked ? '已获得' : `${achievement.progress}/${achievement.target}`}</small>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </section>
  )
}
