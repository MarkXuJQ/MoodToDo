import { useEffect, useRef } from 'react'

export type PaletteMode = 'light' | 'dark'

type WashShape = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  color: string
  alpha: number
}

type ContourField = {
  baseY: number
  amplitude: number
  frequency: number
  phase: number
  spacing: number
  lines: number
  color: string
  alpha: number
}

const lightPalette = ['#c9dfd4', '#d9e7cf', '#d9e6f3', '#ebdcc7', '#d9d3ea', '#d7e7e4']
const darkPalette = ['#20313c', '#26344f', '#2f3e45', '#3d3248', '#33454d', '#1f2b35']

const createSeededRandom = (seed: number) => {
  let value = seed >>> 0

  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

const buildScene = (width: number, height: number, mode: PaletteMode) => {
  const seed = Math.round(width * 31 + height * 17 + (mode === 'dark' ? 97 : 43))
  const random = createSeededRandom(seed)
  const palette = mode === 'dark' ? darkPalette : lightPalette

  const washes: WashShape[] = Array.from({ length: 5 }, (_, index) => ({
    x: width * (0.12 + random() * 0.76),
    y: height * (0.08 + random() * 0.84),
    width: width * (0.16 + random() * 0.18) + index * 22,
    height: height * (0.18 + random() * 0.24),
    rotation: -0.9 + random() * 1.8,
    color: palette[Math.floor(random() * palette.length)],
    alpha: mode === 'dark' ? 0.22 + random() * 0.08 : 0.34 + random() * 0.1,
  }))

  const contours: ContourField[] = Array.from({ length: 4 }, (_, index) => ({
    baseY: height * (0.16 + index * 0.2 + random() * 0.06),
    amplitude: 18 + random() * 26,
    frequency: 0.0034 + random() * 0.0024,
    phase: random() * Math.PI * 2,
    spacing: 14 + random() * 12,
    lines: 6 + Math.round(random() * 5),
    color: palette[(index + 2) % palette.length],
    alpha: mode === 'dark' ? 0.13 + random() * 0.06 : 0.18 + random() * 0.07,
  }))

  return { washes, contours }
}

const createNoisePattern = (ctx: CanvasRenderingContext2D, mode: PaletteMode) => {
  const tile = document.createElement('canvas')
  tile.width = 160
  tile.height = 160

  const tileCtx = tile.getContext('2d')
  if (!tileCtx) return null

  const random = createSeededRandom(mode === 'dark' ? 8803 : 4401)
  tileCtx.clearRect(0, 0, tile.width, tile.height)

  for (let index = 0; index < 1800; index += 1) {
    const x = random() * tile.width
    const y = random() * tile.height
    const alpha = mode === 'dark' ? 0.018 + random() * 0.024 : 0.02 + random() * 0.028
    tileCtx.fillStyle = mode === 'dark' ? `rgba(255,255,255,${alpha})` : `rgba(17,24,22,${alpha})`
    tileCtx.fillRect(x, y, 1, 1)
  }

  for (let line = 0; line < 40; line += 1) {
    const y = random() * tile.height
    tileCtx.strokeStyle =
      mode === 'dark' ? `rgba(255,255,255,${0.012 + random() * 0.018})` : `rgba(17,24,22,${0.01 + random() * 0.02})`
    tileCtx.beginPath()
    tileCtx.moveTo(0, y)
    tileCtx.lineTo(tile.width, y + (random() - 0.5) * 8)
    tileCtx.stroke()
  }

  return ctx.createPattern(tile, 'repeat')
}

const drawWash = (ctx: CanvasRenderingContext2D, shape: WashShape) => {
  ctx.save()
  ctx.translate(shape.x, shape.y)
  ctx.rotate(shape.rotation)
  ctx.globalAlpha = shape.alpha
  ctx.fillStyle = shape.color
  ctx.shadowColor = shape.color
  ctx.shadowBlur = Math.min(shape.width, shape.height) * 0.18

  ctx.beginPath()
  ctx.moveTo(-shape.width * 0.5, 0)
  ctx.bezierCurveTo(
    -shape.width * 0.32,
    -shape.height * 0.52,
    shape.width * 0.08,
    -shape.height * 0.54,
    shape.width * 0.38,
    -shape.height * 0.08,
  )
  ctx.bezierCurveTo(
    shape.width * 0.58,
    shape.height * 0.24,
    shape.width * 0.24,
    shape.height * 0.56,
    -shape.width * 0.16,
    shape.height * 0.42,
  )
  ctx.bezierCurveTo(
    -shape.width * 0.44,
    shape.height * 0.34,
    -shape.width * 0.68,
    shape.height * 0.12,
    -shape.width * 0.5,
    0,
  )
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

const drawContours = (ctx: CanvasRenderingContext2D, width: number, field: ContourField) => {
  ctx.save()
  ctx.strokeStyle = field.color
  ctx.globalAlpha = field.alpha
  ctx.lineWidth = 1

  for (let line = 0; line < field.lines; line += 1) {
    ctx.beginPath()

    for (let x = -40; x <= width + 40; x += 18) {
      const y =
        field.baseY +
        line * field.spacing +
        Math.sin(x * field.frequency + field.phase + line * 0.36) * field.amplitude +
        Math.cos(x * field.frequency * 0.48 + field.phase * 1.6 + line * 0.22) * (field.amplitude * 0.36)

      if (x === -40) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }

    ctx.stroke()
  }

  ctx.restore()
}

const drawBackground = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode: PaletteMode,
  pattern: CanvasPattern | null,
) => {
  ctx.clearRect(0, 0, width, height)

  const topGradient = ctx.createLinearGradient(0, 0, 0, height)
  if (mode === 'dark') {
    topGradient.addColorStop(0, 'rgba(18, 26, 34, 0.58)')
    topGradient.addColorStop(0.55, 'rgba(24, 31, 40, 0.38)')
    topGradient.addColorStop(1, 'rgba(22, 29, 36, 0.5)')
  } else {
    topGradient.addColorStop(0, 'rgba(247, 250, 247, 0.48)')
    topGradient.addColorStop(0.45, 'rgba(239, 245, 241, 0.18)')
    topGradient.addColorStop(1, 'rgba(232, 238, 235, 0.32)')
  }
  ctx.fillStyle = topGradient
  ctx.fillRect(0, 0, width, height)

  const { washes, contours } = buildScene(width, height, mode)
  washes.forEach((shape) => drawWash(ctx, shape))
  contours.forEach((field) => drawContours(ctx, width, field))

  const edgeGlow = ctx.createRadialGradient(width * 0.14, height * 0.12, 0, width * 0.14, height * 0.12, width * 0.54)
  if (mode === 'dark') {
    edgeGlow.addColorStop(0, 'rgba(71, 92, 112, 0.16)')
    edgeGlow.addColorStop(1, 'rgba(22, 30, 38, 0)')
  } else {
    edgeGlow.addColorStop(0, 'rgba(255, 255, 255, 0.38)')
    edgeGlow.addColorStop(1, 'rgba(255, 255, 255, 0)')
  }
  ctx.fillStyle = edgeGlow
  ctx.fillRect(0, 0, width, height)

  if (pattern) {
    ctx.save()
    ctx.globalAlpha = mode === 'dark' ? 0.42 : 0.36
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }
}

const DynamicBackground = ({ mode }: { mode: PaletteMode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const width = window.innerWidth
      const height = window.innerHeight

      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      context.setTransform(1, 0, 0, 1, 0, 0)
      context.scale(dpr, dpr)

      drawBackground(context, width, height, mode, createNoisePattern(context, mode))
    }

    resize()
    window.addEventListener('resize', resize)

    return () => window.removeEventListener('resize', resize)
  }, [mode])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full select-none"
      aria-hidden="true"
    />
  )
}

export default DynamicBackground
