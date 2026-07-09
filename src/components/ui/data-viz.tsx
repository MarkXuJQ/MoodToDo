import { useId, useState } from 'react'

export type TrendPoint = {
  label: string
  value: number | null
}

type TrendChartProps = {
  points: TrendPoint[]
  stroke: string
  fill?: string
  min?: number
  max?: number
  height?: number
  compact?: boolean
  showArea?: boolean
  emphasisIndex?: number
  valueSuffix?: string
}

type ProgressRingProps = {
  value: number
  max: number
  color: string
  label?: string
  valueText: string
  caption?: string
  size?: number
}

const pad = 18

const buildSegments = (points: Array<{ x: number; y: number; value: number | null }>) => {
  const segments: Array<Array<{ x: number; y: number }>> = []
  let current: Array<{ x: number; y: number }> = []

  for (const point of points) {
    if (point.value == null) {
      if (current.length > 0) segments.push(current)
      current = []
      continue
    }

    current.push({ x: point.x, y: point.y })
  }

  if (current.length > 0) segments.push(current)

  return segments
}

const linePath = (segment: Array<{ x: number; y: number }>) =>
  segment.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')

const areaPath = (segment: Array<{ x: number; y: number }>, baseline: number) => {
  if (segment.length === 0) return ''

  const first = segment[0]
  const last = segment[segment.length - 1]

  return [
    `M ${first.x.toFixed(2)} ${baseline.toFixed(2)}`,
    ...segment.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
    `L ${last.x.toFixed(2)} ${baseline.toFixed(2)}`,
    'Z',
  ].join(' ')
}

export const TrendChart = ({
  points,
  stroke,
  fill,
  min,
  max,
  height = 220,
  compact = false,
  showArea = true,
  emphasisIndex,
  valueSuffix = '',
}: TrendChartProps) => {
  const gradientId = useId()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const width = compact ? 240 : 720
  const chartHeight = compact ? 72 : height
  const innerWidth = width - pad * 2
  const innerHeight = chartHeight - pad * 2
  const validValues = points.flatMap((point) => (point.value == null ? [] : [point.value]))
  const fallbackMin = validValues.length > 0 ? Math.min(...validValues) : 0
  const fallbackMax = validValues.length > 0 ? Math.max(...validValues) : 100
  const domainMin = min ?? (compact ? 0 : Math.min(0, fallbackMin))
  const domainMax = max ?? Math.max(domainMin + 1, fallbackMax)
  const baseline = chartHeight - pad

  const chartPoints = points.map((point, index) => {
    const ratio = points.length <= 1 ? 0.5 : index / (points.length - 1)
    const x = pad + innerWidth * ratio
    const normalized =
      point.value == null ? 0 : (point.value - domainMin) / Math.max(1, domainMax - domainMin)
    const y = baseline - normalized * innerHeight

    return { ...point, x, y, sourceIndex: index }
  })

  const segments = buildSegments(chartPoints)
  const emphasisPoint =
    typeof emphasisIndex === 'number' && emphasisIndex >= 0 && emphasisIndex < chartPoints.length
      ? chartPoints[emphasisIndex]
      : null
  const hoveredPoint =
    typeof hoveredIndex === 'number' && chartPoints[hoveredIndex]?.value != null
      ? chartPoints[hoveredIndex]
      : null
  const activePoint = hoveredPoint ?? emphasisPoint
  const tooltipPoint = hoveredPoint
  const tooltipWidth = compact ? 92 : 122
  const tooltipHeight = compact ? 36 : 44
  const tooltipX = tooltipPoint
    ? Math.min(width - pad - tooltipWidth, Math.max(pad, tooltipPoint.x - tooltipWidth / 2))
    : pad
  const tooltipY = tooltipPoint ? Math.max(6, tooltipPoint.y - tooltipHeight - 14) : pad

  if (validValues.length === 0 && compact) {
    return <div className="trend-empty-inline">还没有足够的数据生成折线。</div>
  }

  if (validValues.length === 0) {
    return <div className="empty-state">还没有足够的数据生成折线。</div>
  }

  return (
    <svg className="trend-chart" viewBox={`0 0 ${width} ${chartHeight}`} role="img" aria-label="趋势折线图">
      {!compact && (
        <>
          {[0, 0.5, 1].map((marker) => {
            const y = pad + innerHeight * marker
            return <line className="trend-grid" key={marker} x1={pad} x2={width - pad} y1={y} y2={y} />
          })}
        </>
      )}

      {fill && showArea && (
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={fill} stopOpacity="0.28" />
            <stop offset="100%" stopColor={fill} stopOpacity="0.02" />
          </linearGradient>
        </defs>
      )}

      {segments.map((segment, index) => (
        <g key={index}>
          {fill && showArea && <path d={areaPath(segment, baseline)} fill={`url(#${gradientId})`} />}
          <path d={linePath(segment)} fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth={compact ? 2.4 : 3} />
        </g>
      ))}

      {chartPoints
        .filter((point) => point.value != null)
        .map((point) => (
          <g key={`${point.label}-${point.sourceIndex}`}>
            <circle
              className={activePoint?.sourceIndex === point.sourceIndex ? 'trend-dot trend-dot-active' : 'trend-dot'}
              cx={point.x}
              cy={point.y}
              r={compact ? 2.8 : activePoint?.sourceIndex === point.sourceIndex ? 5 : 4}
              fill={stroke}
            />
            <circle
              className="trend-hit"
              cx={point.x}
              cy={point.y}
              r={compact ? 12 : 16}
              tabIndex={0}
              aria-label={`${point.label}，心情数值 ${point.value}${valueSuffix}`}
              onPointerEnter={() => setHoveredIndex(point.sourceIndex)}
              onPointerLeave={() => setHoveredIndex(null)}
              onFocus={() => setHoveredIndex(point.sourceIndex)}
              onBlur={() => setHoveredIndex(null)}
            />
            {!compact && activePoint?.sourceIndex === point.sourceIndex && !hoveredPoint && point.value != null && (
              <text className="trend-value" x={point.x} y={point.y - 12} textAnchor="middle">
                {`${point.value}${valueSuffix}`}
              </text>
            )}
          </g>
        ))}

      {tooltipPoint && tooltipPoint.value != null && (
        <g className="trend-tooltip" pointerEvents="none">
          <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="8" />
          <text className="trend-tooltip-label" x={tooltipX + 12} y={tooltipY + 17}>
            {tooltipPoint.label}
          </text>
          <text className="trend-tooltip-value" x={tooltipX + 12} y={tooltipY + (compact ? 30 : 34)}>
            {`心情 ${tooltipPoint.value}${valueSuffix}`}
          </text>
        </g>
      )}

      {!compact && (
        <>
          <text className="trend-axis-value" x={pad} y={14}>
            {`${Math.round(domainMax)}${valueSuffix}`}
          </text>
          <text className="trend-axis-value trend-axis-value-min" x={pad} y={chartHeight - 18}>
            {`${Math.round(domainMin)}${valueSuffix}`}
          </text>
          {points.map((point, index) => {
            if (index !== 0 && index !== points.length - 1 && index !== Math.floor(points.length / 2)) return null
            const isFirst = index === 0
            const isLast = index === points.length - 1
            const x = isFirst ? pad + 2 : isLast ? width - pad - 2 : chartPoints[index]?.x ?? pad
            const textAnchor = isFirst ? 'start' : isLast ? 'end' : 'middle'

            return (
              <text className="trend-axis-label" key={point.label} x={x} y={chartHeight - 2} textAnchor={textAnchor}>
                {point.label}
              </text>
            )
          })}
        </>
      )}
    </svg>
  )
}

export const ProgressRing = ({ value, max, color, label, valueText, caption, size = 132 }: ProgressRingProps) => {
  const clampedMax = Math.max(1, max)
  const normalized = Math.min(1, Math.max(0, value / clampedMax))
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = Math.PI * 2 * radius
  const offset = circumference * (1 - normalized)

  return (
    <div className="ring-shell" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} fill="none" />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-content">
        <strong className="ring-value">{valueText}</strong>
        {label && <span className="ring-label">{label}</span>}
        {caption && <small className="ring-caption">{caption}</small>}
      </div>
    </div>
  )
}
