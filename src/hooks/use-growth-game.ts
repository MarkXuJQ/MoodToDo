import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { GameEngineSnapshot } from '../lib/gameEngine'
import {
  collectGrowthCoins,
  createGrowthGameView,
  grantGrowthSeedBoxes,
  mergeGrowthPlants,
  moveGrowthPlant,
  openGrowthSeedBox,
  readGrowthGameSave,
  unlockGrowthCell,
  upgradeGrowthStorage,
  writeGrowthGameSave,
  type GrowthActionResult,
  type GrowthGameSave,
  type GrowthPlacement,
  type GrowthPlantFamily,
  type GrowthPlantStage,
} from '../lib/growthGame'

const fallbackResult: GrowthActionResult = {
  ok: false,
  message: '成长存档还在准备中，请稍后再试。',
}

export const useGrowthGame = (snapshot: GameEngineSnapshot) => {
  const [save, setSave] = useState<GrowthGameSave>(() => readGrowthGameSave())
  const saveRef = useRef(save)

  useEffect(() => {
    saveRef.current = save
  }, [save])

  useEffect(() => {
    setSave((current) => {
      const next = grantGrowthSeedBoxes(current, snapshot).save

      saveRef.current = next
      return next
    })
  }, [snapshot])

  useEffect(() => {
    writeGrowthGameSave(save)
  }, [save])

  const runMutation = useCallback((mutation: (current: GrowthGameSave) => { save: GrowthGameSave; result: GrowthActionResult }) => {
    const next = mutation(saveRef.current)

    saveRef.current = next.save
    setSave(next.save)

    return next.result ?? fallbackResult
  }, [])

  const collectCoins = useCallback(
    () => runMutation((current) => collectGrowthCoins(current)),
    [runMutation],
  )

  const openSeedBox = useCallback(
    (boxId: string) => runMutation((current) => openGrowthSeedBox(current, boxId)),
    [runMutation],
  )

  const mergePlants = useCallback(
    (family: GrowthPlantFamily, stage: GrowthPlantStage) =>
      runMutation((current) => mergeGrowthPlants(current, family, stage)),
    [runMutation],
  )

  const movePlant = useCallback(
    (plantId: string, placement: GrowthPlacement) =>
      runMutation((current) => moveGrowthPlant(current, plantId, placement)),
    [runMutation],
  )

  const unlockCell = useCallback(
    () => runMutation((current) => unlockGrowthCell(current)),
    [runMutation],
  )

  const upgradeStorage = useCallback(
    () => runMutation((current) => upgradeGrowthStorage(current)),
    [runMutation],
  )

  const view = useMemo(() => createGrowthGameView(save, snapshot), [save, snapshot])

  return {
    growthGame: view,
    collectCoins,
    mergePlants,
    movePlant,
    openSeedBox,
    unlockCell,
    upgradeStorage,
  }
}
