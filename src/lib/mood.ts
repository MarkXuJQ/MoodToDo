export type MoodLevel = '低谷' | '承压' | '平稳' | '舒展' | '高亮'

export type MoodSignals = {
  clarity: number
  load: number
  energy: number
  recovery: number
  reflection: number
}

export type MoodAnalysis = {
  score: number
  level: MoodLevel
  confidence: number
  signals: MoodSignals
  keywords: string[]
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
  { word: '烦', weight: 6 },
  { word: '崩溃', weight: 12 },
  { word: '紧张', weight: 7 },
  { word: '难受', weight: 8 },
  { word: '委屈', weight: 7 },
  { word: '失落', weight: 7 },
  { word: '疲惫', weight: 8 },
  { word: '累', weight: 6 },
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
  { word: '整理', weight: 5 },
  { word: '放下', weight: 7 },
  { word: '恢复', weight: 8 },
  { word: '调整', weight: 6 },
  { word: '陪伴', weight: 6 },
  { word: '治愈', weight: 8 },
  { word: 'reset', weight: 7 },
  { word: 'walk', weight: 5 },
]

const negationWords = ['不', '没', '没有', '无', '别', 'not', 'no']

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const countMatches = (text: string, words: WeightedWord[]) => {
  const hits: string[] = []
  const total = words.reduce((sum, item) => {
    const count = text.split(item.word).length - 1
    if (count > 0) {
      hits.push(item.word)
    }
    return sum + count * item.weight
  }, 0)

  return { hits, total }
}

const getReflectionScore = (text: string) => {
  const lengthScore = clamp(text.trim().length / 8, 0, 12)
  const hasCause = /因为|所以|但是|不过|虽然|如果|原因|发现|意识到|想/.test(text)
    ? 8
    : 0
  const hasAction = /准备|决定|计划|明天|下次|先|继续|调整/.test(text) ? 8 : 0

  return clamp(lengthScore + hasCause + hasAction, 0, 24)
}

const getNegationPenalty = (text: string) =>
  negationWords.reduce((sum, word) => sum + (text.includes(word) ? 3 : 0), 0)

const getLevel = (score: number): MoodLevel => {
  if (score < 35) return '低谷'
  if (score < 50) return '承压'
  if (score < 66) return '平稳'
  if (score < 82) return '舒展'
  return '高亮'
}

export const analyzeMood = (sourceText: string): MoodAnalysis => {
  const text = sourceText.trim().toLowerCase()

  if (!text) {
    return {
      score: 50,
      level: '平稳',
      confidence: 0,
      signals: {
        clarity: 0,
        load: 0,
        energy: 0,
        recovery: 0,
        reflection: 0,
      },
      keywords: [],
    }
  }

  const clarity = countMatches(text, clarityWords)
  const load = countMatches(text, loadWords)
  const energy = countMatches(text, energyWords)
  const recovery = countMatches(text, recoveryWords)
  const reflection = getReflectionScore(text)
  const negationPenalty = getNegationPenalty(text)
  const punctuationLift = clamp((text.match(/[!！]/g)?.length ?? 0) * 2, 0, 6)

  const clarityScore = clamp(clarity.total - negationPenalty, 0, 35)
  const loadScore = clamp(load.total + negationPenalty, 0, 40)
  const energyScore = clamp(energy.total + punctuationLift, 0, 28)
  const recoveryScore = clamp(recovery.total, 0, 28)

  const rawScore =
    50 + clarityScore * 0.8 + energyScore * 0.55 + recoveryScore * 0.45 + reflection * 0.35 - loadScore * 0.9

  const score = Math.round(clamp(rawScore, 0, 100))
  const confidence = Math.round(clamp(text.length / 60, 0.2, 1) * 100)

  return {
    score,
    level: getLevel(score),
    confidence,
    signals: {
      clarity: Math.round(clarityScore),
      load: Math.round(loadScore),
      energy: Math.round(energyScore),
      recovery: Math.round(recoveryScore),
      reflection: Math.round(reflection),
    },
    keywords: [...new Set([...clarity.hits, ...load.hits, ...energy.hits, ...recovery.hits])],
  }
}
