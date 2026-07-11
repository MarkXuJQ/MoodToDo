import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { BookOpenText, CloudSun, Coins, LockKeyhole, PackageOpen, Sprout, Trophy } from 'lucide-react'

import type { GameEngineSnapshot } from '../lib/gameEngine'
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
  type GrowthPlantFamily,
  type GrowthPlantStage,
} from '../lib/growthGame'

type GardenViewProps = {
  growthGame: GrowthGameView
  snapshot: GameEngineSnapshot
  onCheckIn: () => void
  onCollectCoins: () => GrowthActionResult
  onMergePlants: (family: GrowthPlantFamily, stage: GrowthPlantStage) => GrowthActionResult
  onMovePlant: (plantId: string, placement: GrowthPlacement) => GrowthActionResult
  onOpenJournalDate: (dateKey: string) => void
  onOpenSeedBox: (boxId: string) => GrowthActionResult
  onUnlockCell: () => GrowthActionResult
  onUpgradeStorage: () => GrowthActionResult
}

type GardenPanel = 'inventory' | 'codex' | 'achievements'

const panelLabels: Record<GardenPanel, string> = {
  inventory: '库存',
  codex: '图谱',
  achievements: '成就',
}

const formatPlantDate = (dateKey: string) => `${Number(dateKey.slice(5, 7))}月${Number(dateKey.slice(8, 10))}日`

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
      <span className="garden-plant-glow" />
      <span className="garden-plant-stem" />
      <span className="garden-plant-leaf garden-plant-leaf-left" />
      <span className="garden-plant-leaf garden-plant-leaf-right" />
      <span className="garden-plant-bloom">
        <i />
        <i />
        <i />
        <i />
        <b />
      </span>
      <span className="garden-plant-soil" />
    </span>
  )
}

function runGardenAction(
  action: GrowthActionResult,
  setFeedback: (message: string) => void,
  setSelectedPlantId: (plantId: string) => void,
) {
  setFeedback(action.message)
  if (action.selectedPlantId) setSelectedPlantId(action.selectedPlantId)
}

export function GardenView({
  growthGame,
  snapshot,
  onCheckIn,
  onCollectCoins,
  onMergePlants,
  onMovePlant,
  onOpenJournalDate,
  onOpenSeedBox,
  onUnlockCell,
  onUpgradeStorage,
}: GardenViewProps) {
  const [selectedPlantId, setSelectedPlantId] = useState(growthGame.save.plants[0]?.id ?? '')
  const [activePanel, setActivePanel] = useState<GardenPanel>('inventory')
  const [feedback, setFeedback] = useState('写下来的日子会慢慢长成这里的森林。')
  const selectedPlant = useMemo(
    () => growthGame.save.plants.find((plant) => plant.id === selectedPlantId) ?? growthGame.save.plants[0],
    [growthGame.save.plants, selectedPlantId],
  )
  const firstSeedBox = growthGame.seedBoxes[0]
  const unlockedAchievementCount = growthGame.achievements.filter((achievement) => achievement.unlocked).length

  useEffect(() => {
    if (selectedPlantId && growthGame.save.plants.some((plant) => plant.id === selectedPlantId)) return
    setSelectedPlantId(growthGame.save.plants[0]?.id ?? '')
  }, [growthGame.save.plants, selectedPlantId])

  const handleAction = (action: GrowthActionResult) => runGardenAction(action, setFeedback, setSelectedPlantId)
  const handleOpenFirstSeedBox = () => {
    if (!firstSeedBox) {
      if (snapshot.garden.todayCheckedIn) {
        setFeedback('今天的心种匣已经处理完了，明天的记录会继续带来新的收获。')
        return
      }

      onCheckIn()
      return
    }

    handleAction(onOpenSeedBox(firstSeedBox.id))
  }

  return (
    <section className={`garden-page garden-page-game ${growthGame.weather.className}`} aria-labelledby="garden-title">
      <header className="garden-hud" aria-label="成长页状态">
        <div className="garden-title-block">
          <p className="eyebrow">Mind Growth</p>
          <h1 id="garden-title">心象森林</h1>
          <span>{growthGame.weather.description}</span>
        </div>

        <div className="garden-hud-pills" aria-label="成长资源">
          <span className="garden-hud-pill garden-hud-pill-coins">
            <Coins size={17} aria-hidden="true" />
            {growthGame.coins} 金币
          </span>
          <span className="garden-hud-pill">
            <PackageOpen size={17} aria-hidden="true" />
            {growthGame.seedBoxes.length} 心种匣
          </span>
          <span className="garden-hud-pill">
            <CloudSun size={17} aria-hidden="true" />
            {growthGame.weather.name}
          </span>
          <button className="garden-hud-pill garden-achievement-entry" type="button" onClick={() => setActivePanel('achievements')}>
            <Trophy size={17} aria-hidden="true" />
            成就 {unlockedAchievementCount}/{growthGame.achievements.length}
          </button>
        </div>
      </header>

      <main className="garden-game-layout">
        <section className="garden-scene-card" aria-labelledby="garden-scene-title">
          <div className="garden-scene-sky" aria-hidden="true">
            <span className="garden-sun" />
            <span className="garden-cloud garden-cloud-one" />
            <span className="garden-cloud garden-cloud-two" />
            <span className="garden-weather-lines" />
          </div>

          <div className="garden-scene-head">
            <div>
              <p className="eyebrow">Pixel Forest</p>
              <h2 className="section-title" id="garden-scene-title">今天的收获会留在这里</h2>
            </div>
            <span>{growthGame.unlockedCells}/{growthGame.boardCapacity} 空地</span>
          </div>

          <div className="garden-board" role="grid" aria-label="心象森林棋盘">
            {growthGame.boardCells.map((cell) => (
              <div
                className={`garden-cell ${cell.unlocked ? 'garden-cell-unlocked' : 'garden-cell-locked'} ${cell.plant ? 'garden-cell-filled' : ''}`}
                role="gridcell"
                aria-label={cell.plant ? getGrowthPlantName(cell.plant) : cell.unlocked ? '空地' : '未解锁空地'}
                key={cell.index}
              >
                {cell.plant ? (
                  <button
                    className={`garden-cell-plant ${cell.plant.id === selectedPlant?.id ? 'garden-cell-plant-selected' : ''}`}
                    type="button"
                    aria-pressed={cell.plant.id === selectedPlant?.id}
                    onClick={() => setSelectedPlantId(cell.plant!.id)}
                  >
                    <PlantFigure plant={cell.plant} />
                    <span>{getGrowthPlantName(cell.plant)}</span>
                  </button>
                ) : cell.unlocked ? (
                  <span className="garden-cell-ground" aria-hidden="true" />
                ) : (
                  <LockKeyhole size={16} aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </section>

        <aside className="garden-command-card" aria-label="成长操作">
          <div className="garden-command-primary">
            <button className="garden-pixel-button garden-pixel-button-gold" type="button" onClick={() => handleAction(onCollectCoins())}>
              <Coins size={17} aria-hidden="true" />
              {growthGame.pendingCoins > 0 ? `收取 ${growthGame.pendingCoins} 金币` : '收取金币'}
            </button>
            <small>{growthGame.coinRate} 金币/小时 · 离线最多 {growthGame.maxOfflineHours} 小时</small>
          </div>

          <div className="garden-command-primary">
            <button className="garden-pixel-button" type="button" onClick={handleOpenFirstSeedBox}>
              <PackageOpen size={17} aria-hidden="true" />
              {firstSeedBox ? `打开 ${formatPlantDate(firstSeedBox.dateKey)} 心种匣` : snapshot.garden.todayCheckedIn ? '暂无心种匣' : '写日记获得心种匣'}
            </button>
            <small>{firstSeedBox ? '打开后会进入森林或仓库' : '写日记后会自动生成新的心种匣'}</small>
          </div>

          <div className="garden-feedback" role="status" aria-live="polite">
            {feedback}
          </div>

          <div className="garden-merge-list">
            <div className="garden-card-head">
              <strong>可融合</strong>
              <span>{growthGame.mergeGroups.length}</span>
            </div>
            {growthGame.mergeGroups.length > 0 ? (
              growthGame.mergeGroups.map((group) => (
                <button
                  className="garden-merge-button"
                  type="button"
                  key={group.id}
                  onClick={() => handleAction(onMergePlants(group.family, group.stage))}
                >
                  <span>{group.name} × 3</span>
                  <strong>→ {group.resultName}</strong>
                </button>
              ))
            ) : (
              <p className="garden-muted">三株同系同阶植物会在这里提示融合。</p>
            )}
          </div>

          <div className="garden-selected-card">
            {selectedPlant ? (
              <>
                <PlantFigure plant={selectedPlant} compact />
                <div>
                  <p className="eyebrow">{formatPlantDate(selectedPlant.sourceDateKey)}</p>
                  <h3>{getGrowthPlantName(selectedPlant)}</h3>
                  <p>
                    {getGrowthPlantFamilyLabel(selectedPlant.family)} · {getGrowthPlantStageName(selectedPlant.stage)} · {getGrowthPlantCoinRate(selectedPlant.stage)} 金币/小时
                  </p>
                  <div className="garden-selected-actions">
                    <button className="button-secondary min-h-9 px-3" type="button" onClick={() => onOpenJournalDate(selectedPlant.sourceDateKey)}>
                      <BookOpenText size={15} aria-hidden="true" />
                      看这一天
                    </button>
                    <button
                      className="button-secondary min-h-9 px-3"
                      type="button"
                      onClick={() => handleAction(onMovePlant(selectedPlant.id, selectedPlant.placement === 'board' ? 'storage' : 'board'))}
                    >
                      {selectedPlant.placement === 'board' ? '收入仓库' : '放回森林'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="garden-selected-empty">
                <Sprout size={34} aria-hidden="true" />
                <strong>还没有植物</strong>
                <span>写一篇日记，领取第一枚心种匣。</span>
              </div>
            )}
          </div>

          <button className="garden-expand-button" type="button" onClick={() => handleAction(onUnlockCell())}>
            {growthGame.nextUnlockCost == null ? '空地已全部开放' : `扩建一格 · ${growthGame.nextUnlockCost} 金币`}
          </button>
        </aside>
      </main>

      <section className="garden-panel-card" aria-labelledby="garden-panel-title">
        <div className="garden-panel-tabs" role="tablist" aria-label="成长面板">
          {(Object.keys(panelLabels) as GardenPanel[]).map((panel) => (
            <button
              className={activePanel === panel ? 'garden-panel-tab-active' : ''}
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

        <div className="garden-panel-body">
          <h2 className="sr-only" id="garden-panel-title">成长内容</h2>
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
                          <strong>{formatPlantDate(box.dateKey)}</strong>
                          <small>{box.moodQuadrant} · {box.moodScore} 分</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="garden-muted">没有待开启的心种匣。保存日记后会自动补到这里。</p>
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
                      <button className="garden-storage-plant" type="button" key={plant.id} onClick={() => handleAction(onMovePlant(plant.id, 'board'))}>
                        <PlantFigure plant={plant} compact />
                        <span>{getGrowthPlantName(plant)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="garden-muted">仓库用于暂存植物；放在仓库里的植物不产金币。</p>
                )}
                <button className="garden-expand-button garden-storage-upgrade-button" type="button" onClick={() => handleAction(onUpgradeStorage())}>
                  {growthGame.nextStorageUpgradeCost == null ? '仓库已扩到上限' : `扩容仓库 · ${growthGame.nextStorageUpgradeCost} 金币`}
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
                  <small>{getGrowthPlantFamilyLabel(node.family)} · {node.coinRate} 金币/小时</small>
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
        </div>
      </section>

      <footer className="garden-footer-note">
        <Trophy size={16} aria-hidden="true" />
        已点亮 {unlockedAchievementCount}/{growthGame.achievements.length} 个成就。成长数据只保存在独立本地存档中，日记和 Todo 保持原样。
      </footer>
    </section>
  )
}
