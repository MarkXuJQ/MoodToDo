export type MoodLevel = '低谷' | '承压' | '平稳' | '舒展' | '高亮'
export type MoodQuadrant = '低能承压' | '高能紧绷' | '低能修复' | '高能舒展'

export type MoodSignals = {
  clarity: number
  load: number
  energy: number
  recovery: number
  reflection: number
}

export type MoodVector = {
  valence: number
  arousal: number
  resilience: number
  clarity: number
}

export type MoodAnalysis = {
  score: number
  level: MoodLevel
  quadrant: MoodQuadrant
  confidence: number
  algorithm: string
  signals: MoodSignals
  vector: MoodVector
  keywords: string[]
  reviewHint: string
}

type WeightedWord = {
  word: string
  weight: number
}

const clarityWords: WeightedWord[] = [
  { word: '开心', weight: 8 },
  { word: '高兴', weight: 8 },
  { word: '满足', weight: 7 },
  { word: '踏实', weight: 7 },
  { word: '安心', weight: 7 },
  { word: '舒服', weight: 6 },
  { word: '顺利', weight: 6 },
  { word: '期待', weight: 5 },
  { word: '平静', weight: 5 },
  { word: '轻松', weight: 6 },
  { word: '感恩', weight: 7 },
  { word: '不错', weight: 5 },
  { word: 'happy', weight: 8 },
  { word: 'good', weight: 5 },
]

const loadWords: WeightedWord[] = [
  { word: '焦虑', weight: 9 },
  { word: '压力', weight: 8 },
  { word: '心烦', weight: 6 },
  { word: '烦躁', weight: 7 },
  { word: '烦恼', weight: 6 },
  { word: '很烦', weight: 6 },
  { word: '太烦', weight: 6 },
  { word: '有点烦', weight: 5 },
  { word: '崩溃', weight: 12 },
  { word: '紧张', weight: 7 },
  { word: '难受', weight: 8 },
  { word: '委屈', weight: 7 },
  { word: '失落', weight: 7 },
  { word: '疲惫', weight: 8 },
  { word: '很累', weight: 6 },
  { word: '好累', weight: 6 },
  { word: '太累', weight: 6 },
  { word: '累了', weight: 6 },
  { word: '累到', weight: 7 },
  { word: '有点累', weight: 5 },
  { word: '混乱', weight: 7 },
  { word: '糟糕', weight: 9 },
  { word: '孤独', weight: 8 },
  { word: 'stress', weight: 8 },
  { word: 'tired', weight: 7 },
]

const energyWords: WeightedWord[] = [
  { word: '专注', weight: 7 },
  { word: '推进', weight: 6 },
  { word: '完成', weight: 6 },
  { word: '清醒', weight: 6 },
  { word: '有劲', weight: 7 },
  { word: '主动', weight: 6 },
  { word: '运动', weight: 6 },
  { word: '学习', weight: 5 },
  { word: '效率', weight: 6 },
  { word: 'productive', weight: 7 },
  { word: 'focus', weight: 7 },
]

const recoveryWords: WeightedWord[] = [
  { word: '休息', weight: 7 },
  { word: '散步', weight: 6 },
  { word: '睡', weight: 6 },
  { word: '呼吸', weight: 5 },
  { word: '整理思绪', weight: 6 },
  { word: '整理心情', weight: 6 },
  { word: '整理状态', weight: 6 },
  { word: '放下', weight: 7 },
  { word: '恢复', weight: 8 },
  { word: '调整', weight: 6 },
  { word: '陪伴', weight: 6 },
  { word: '治愈', weight: 8 },
  { word: 'reset', weight: 7 },
  { word: 'walk', weight: 5 },
]

const algorithmVersion = 'xinxiang-v0.3-journal-vector'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const sigmoid = (value: number, slope = 1) => 1 / (1 + Math.exp(-value * slope))

const scaleToUnit = (value: number, max: number) => clamp(value / max, 0, 1)

const isNegated = (text: string, matchIndex: number) => {
  const prefix = text.slice(Math.max(0, matchIndex - 10), matchIndex)

  return /(?:并没有|并不|没有|不再|不太|不怎么|没|不|not|no)\s*$/.test(prefix)
}

const isEmbeddedFalsePositive = (text: string, matchIndex: number, word: string) =>
  word.startsWith('累') && text[matchIndex - 1] === '积'

const countMatches = (text: string, words: WeightedWord[]) => {
  const hits: string[] = []
  const total = words.reduce((sum, item) => {
    let count = 0
    let cursor = 0

    while (count < 3) {
      const matchIndex = text.indexOf(item.word, cursor)
      if (matchIndex < 0) break
      if (!isNegated(text, matchIndex) && !isEmbeddedFalsePositive(text, matchIndex, item.word)) count += 1
      cursor = matchIndex + item.word.length
    }

    if (count > 0) {
      hits.push(item.word)
    }
    return sum + count * item.weight
  }, 0)

  return { hits, total }
}

const getReflectionScore = (text: string) => {
  const hasCause = /因为|所以|但是|不过|虽然|如果|原因|发现|意识到/.test(text) ? 7 : 0
  const hasAction = /准备|决定|计划|明天|下次|先|继续|调整/.test(text) ? 7 : 0
  const hasObservation = /我觉得|我想|我需要|我注意到|对我来说|回头看|复盘/.test(text) ? 6 : 0

  return clamp(hasCause + hasAction + hasObservation, 0, 20)
}

const getLevel = (score: number): MoodLevel => {
  if (score < 35) return '低谷'
  if (score < 50) return '承压'
  if (score < 66) return '平稳'
  if (score < 82) return '舒展'
  return '高亮'
}

const getQuadrant = (vector: MoodVector): MoodQuadrant => {
  const isHighEnergy = vector.arousal >= 0.12
  const isUnderPressure = vector.valence <= -0.08

  if (!isHighEnergy && isUnderPressure) return '低能承压'
  if (isHighEnergy && isUnderPressure) return '高能紧绷'
  if (!isHighEnergy) return '低能修复'
  return '高能舒展'
}

const getReviewHint = (quadrant: MoodQuadrant, score: number) => {
  if (quadrant === '高能紧绷') return '适合回看近期压力源，把高能量导向一个可完成的小动作。'
  if (quadrant === '低能承压') return '适合关联睡眠、运动和未完成事项，先寻找可恢复的入口。'
  if (quadrant === '低能修复') return '适合保留当日有效的修复方式，作为下次低能量时的参考。'
  if (score >= 82) return '适合标记触发高亮状态的场景，沉淀成个人正反馈样本。'

  return '适合观察今日行动和心情之间的关联，记录一个可重复的小条件。'
}

export const analyzeMood = (sourceText: string): MoodAnalysis => {
  const text = sourceText.trim().toLowerCase()

  if (!text) {
    return {
      score: 50,
      level: '平稳',
      quadrant: '低能修复',
      confidence: 0,
      algorithm: algorithmVersion,
      signals: {
        clarity: 0,
        load: 0,
        energy: 0,
        recovery: 0,
        reflection: 0,
      },
      vector: {
        valence: 0,
        arousal: -0.1,
        resilience: 0,
        clarity: 0,
      },
      keywords: [],
      reviewHint: '写下几句心情后，心象仪会给出模糊量化和回顾线索。',
    }
  }

  const clarity = countMatches(text, clarityWords)
  const load = countMatches(text, loadWords)
  const energy = countMatches(text, energyWords)
  const recovery = countMatches(text, recoveryWords)
  const reflection = getReflectionScore(text)
  const punctuationLift = clamp((text.match(/[!！]/g)?.length ?? 0) * 2, 0, 6)

  const clarityScore = clamp(clarity.total, 0, 35)
  const loadScore = clamp(load.total, 0, 40)
  const energyScore = clamp(energy.total + punctuationLift, 0, 28)
  const recoveryScore = clamp(recovery.total, 0, 28)
  const reflectionScore = Math.round((reflection / 20) * 24)

  const valence =
    scaleToUnit(clarityScore, 35) * 1.25 +
    scaleToUnit(recoveryScore, 28) * 0.45 -
    scaleToUnit(loadScore, 40) * 1.45
  const arousal = scaleToUnit(energyScore, 28) * 1.35 - scaleToUnit(recoveryScore, 28) * 0.7 - scaleToUnit(loadScore, 40) * 0.25
  const resilience =
    scaleToUnit(recoveryScore, 28) * 1.2 +
    scaleToUnit(reflection, 20) * 0.45 -
    scaleToUnit(loadScore, 40) * 0.65
  const clarityAxis = scaleToUnit(clarityScore, 35) * 1.1 + scaleToUnit(reflection, 20) * 0.3

  const vector: MoodVector = {
    valence: Number(clamp(valence, -1, 1).toFixed(3)),
    arousal: Number(clamp(arousal, -1, 1).toFixed(3)),
    resilience: Number(clamp(resilience, -1, 1).toFixed(3)),
    clarity: Number(clamp(clarityAxis, -1, 1).toFixed(3)),
  }

  const curvedScore =
    100 *
    sigmoid(
      vector.valence * 1.35 +
        vector.resilience * 0.85 +
        vector.clarity * 0.35 +
        vector.arousal * 0.16,
      1.15,
    )

  const score = Math.round(clamp(curvedScore, 0, 100))
  const quadrant = getQuadrant(vector)
  const relevantSignalTotal = clarityScore + loadScore + energyScore + recoveryScore + reflection
  const hasMoodEvidence = relevantSignalTotal > 0
  const lengthConfidence = hasMoodEvidence ? clamp(text.length / 480, 0.15, 0.3) : 0.15
  const signalConfidence = clamp(relevantSignalTotal / 55, 0, 0.7)
  const confidence = Math.round(clamp(lengthConfidence + signalConfidence, 0.15, 1) * 100)

  return {
    score,
    level: getLevel(score),
    quadrant,
    confidence,
    algorithm: algorithmVersion,
    signals: {
      clarity: Math.round(clarityScore),
      load: Math.round(loadScore),
      energy: Math.round(energyScore),
      recovery: Math.round(recoveryScore),
      reflection: reflectionScore,
    },
    vector,
    keywords: [...new Set([...clarity.hits, ...load.hits, ...energy.hits, ...recovery.hits])],
    reviewHint: getReviewHint(quadrant, score),
  }
}
