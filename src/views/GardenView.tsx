import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { BookOpenText, Check, CloudSun, LockKeyhole, Sparkles, Sprout, Trophy } from 'lucide-react'

import type { GardenPlant, GameEngineSnapshot } from '../lib/gameEngine'

type GardenViewProps = {
  snapshot: GameEngineSnapshot
  todayKey: string
  onCheckIn: () => void
  onOpenJournalDate: (dateKey: string) => void
}

const formatPlantDate = (dateKey: string) => `${Number(dateKey.slice(5, 7))}月${Number(dateKey.slice(8, 10))}日`

const plantKindClassName: Record<GardenPlant['kind'], string> = {
  moonFern: 'garden-plant-moon-fern',
  windBell: 'garden-plant-wind-bell',
  dewBud: 'garden-plant-dew-bud',
  sunBloom: 'garden-plant-sun-bloom',
}

function PlantFigure({ plant, compact = false }: { plant: GardenPlant; compact?: boolean }) {
  return (
    <span
      className={`garden-plant-figure ${plantKindClassName[plant.kind]} garden-plant-stage-${plant.growthStage} ${compact ? 'garden-plant-compact' : ''}`}
      style={{ '--plant-color': plant.color } as CSSProperties}
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

export function GardenView({ snapshot, todayKey, onCheckIn, onOpenJournalDate }: GardenViewProps) {
  const [selectedPlantId, setSelectedPlantId] = useState(snapshot.plants[0]?.id ?? '')
  const selectedPlant = useMemo(
    () => snapshot.plants.find((plant) => plant.id === selectedPlantId) ?? snapshot.plants[0],
    [selectedPlantId, snapshot.plants],
  )
  const nextAchievement = snapshot.achievements.find((achievement) => !achievement.unlocked)
  const xpToNextPhase = Math.max(0, snapshot.progress.nextThreshold - snapshot.progress.totalXp)

  useEffect(() => {
    if (selectedPlantId && snapshot.plants.some((plant) => plant.id === selectedPlantId)) return
    setSelectedPlantId(snapshot.plants[0]?.id ?? '')
  }, [selectedPlantId, snapshot.plants])

  return (
    <section className="garden-page py-3 sm:py-5" aria-labelledby="garden-title">
      <section className="garden-hero" aria-labelledby="garden-title">
        <div className="garden-hero-copy">
          <p className="eyebrow">Mind Garden</p>
          <h1 id="garden-title">心象花园</h1>
          <p>{snapshot.garden.climateNote}</p>

          <div className="garden-hero-actions">
            <button className="button-primary" type="button" onClick={onCheckIn}>
              {snapshot.garden.todayCheckedIn ? <Check size={18} aria-hidden="true" /> : <BookOpenText size={18} aria-hidden="true" />}
              {snapshot.garden.todayCheckedIn ? '查看今日日记' : `写日记，种下心种 +${snapshot.garden.todayRewardXp} XP`}
            </button>
            <span className="garden-climate-pill">
              <CloudSun size={16} aria-hidden="true" />
              {snapshot.garden.climate}
            </span>
          </div>
        </div>

        <div className="garden-level-card" role="group" aria-label={`花园阶段 ${snapshot.progress.phaseName}`}>
          <span className="garden-level-orbit">
            <Sprout size={30} aria-hidden="true" />
          </span>
          <div>
            <small>花园阶段 {snapshot.progress.phaseIndex + 1}</small>
            <strong>{snapshot.progress.phaseName}</strong>
            <span>{snapshot.progress.totalXp} XP · 距下阶段 {xpToNextPhase} XP</span>
          </div>
          <div
            className="garden-progress-track"
            role="progressbar"
            aria-label="花园阶段进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={snapshot.progress.phaseProgress}
          >
            <i style={{ width: `${snapshot.progress.phaseProgress}%` }} />
          </div>
        </div>
      </section>

      <div className="garden-stat-grid" role="list" aria-label="花园统计">
        <article role="listitem">
          <span>花园生命力</span>
          <strong>{snapshot.garden.vitality}</strong>
          <small>最近打卡和连续记录共同滋养</small>
        </article>
        <article role="listitem">
          <span>已种心花</span>
          <strong>{snapshot.garden.plantCount}</strong>
          <small>每篇日记都会留下一株植物</small>
        </article>
        <article role="listitem">
          <span>连续打卡</span>
          <strong>{snapshot.metrics.currentStreak} 天</strong>
          <small>最长 {snapshot.metrics.longestStreak} 天</small>
        </article>
        <article role="listitem">
          <span>已获成就</span>
          <strong>{snapshot.garden.unlockedAchievementCount}</strong>
          <small>{nextAchievement ? `下一项：${nextAchievement.title}` : '成就已全部点亮'}</small>
        </article>
      </div>

      <section className="garden-world" aria-labelledby="garden-world-title">
        <div className="garden-world-sky" aria-hidden="true">
          <span className="garden-sun" />
          <span className="garden-cloud garden-cloud-one" />
          <span className="garden-cloud garden-cloud-two" />
          <span className="garden-hill garden-hill-back" />
          <span className="garden-hill garden-hill-front" />
        </div>

        <div className="garden-world-head">
          <div>
            <p className="eyebrow">Your Days</p>
            <h2 className="section-title" id="garden-world-title">每一天，都有一种生长方式</h2>
          </div>
          <span>{snapshot.plants.length} 株可见</span>
        </div>

        {snapshot.plants.length > 0 ? (
          <div className="garden-plot" role="group" aria-label="日记长成的植物">
            {snapshot.plants.map((plant) => {
              const selected = plant.id === selectedPlant?.id

              return (
                <button
                  className={`garden-plant-button ${selected ? 'garden-plant-button-selected' : ''}`}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${formatPlantDate(plant.dateKey)}，${plant.name}，心象分 ${plant.moodScore}`}
                  key={plant.id}
                  onClick={() => setSelectedPlantId(plant.id)}
                >
                  <PlantFigure plant={plant} />
                  <span className="garden-plant-label">
                    <strong>{plant.name}</strong>
                    <small>{plant.moodScore} 分</small>
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="garden-empty">
            <Sprout size={42} aria-hidden="true" />
            <h3>花园还在等待第一粒心种</h3>
            <p>不需要写得完美，记录今天发生的事就可以开始。</p>
            <button className="button-primary" type="button" onClick={onCheckIn}>写第一篇日记</button>
          </div>
        )}
      </section>

      {selectedPlant && (
        <section className="garden-detail-grid" aria-label="选中植物信息">
          <article className="section garden-selected-plant">
            <PlantFigure plant={selectedPlant} compact />
            <div>
              <p className="eyebrow">{formatPlantDate(selectedPlant.dateKey)}</p>
              <h2>{selectedPlant.name}</h2>
              <p>{selectedPlant.quadrant} · {selectedPlant.moodLevel} · 心象分 {selectedPlant.moodScore}</p>
              <div className="garden-detail-tags">
                <span>成长 {selectedPlant.growthXp} XP</span>
                <span>日记 {selectedPlant.journalLength} 字</span>
                <span>阶段 {selectedPlant.growthStage}/4</span>
              </div>
              <button className="button-secondary mt-3" type="button" onClick={() => onOpenJournalDate(selectedPlant.dateKey)}>
                <BookOpenText size={16} aria-hidden="true" />
                查看这一天
              </button>
            </div>
          </article>

          <article className="section garden-rule-card">
            <Sparkles size={22} aria-hidden="true" />
            <div>
              <h2>心情不决定你是否值得奖励</h2>
              <p>每次诚实记录都获得基础成长。心象分只改变植物与天气：低落会长出守夜蕨，修复会长出晨露芽，紧绷与舒展也各有自己的花。</p>
            </div>
          </article>
        </section>
      )}

      <section className="garden-achievements" aria-labelledby="garden-achievements-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">Achievements</p>
            <h2 className="section-title" id="garden-achievements-title">花园成就</h2>
          </div>
          <Trophy size={22} aria-hidden="true" />
        </div>

        <div className="garden-achievement-grid">
          {snapshot.achievements.map((achievement) => (
            <article className={`garden-achievement ${achievement.unlocked ? 'garden-achievement-unlocked' : ''}`} key={achievement.id}>
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
      </section>

      <p className="garden-today-note">
        {snapshot.garden.todayCheckedIn
          ? `${todayKey} 的心种已经在花园中。继续修改日记会重新计算心象，但不会重复种植。`
          : `今天是 ${todayKey}。写下日记后，今天会只生成一株属于这一天的植物。`}
      </p>
    </section>
  )
}
