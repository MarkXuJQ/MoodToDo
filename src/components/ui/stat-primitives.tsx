import type { CSSProperties } from 'react'

export const Metric = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="metric-line">
    <span className="metric-label">{label}</span>
    <strong className={`metric-value ${tone ?? ''}`}>{value}</strong>
  </div>
)

export const ProgressBar = ({ value, tone }: { value: number; tone?: string }) => (
  <span className="progress-track">
    <span
      className={`progress-fill ${tone ?? ''}`}
      style={{ '--value': `${Math.min(100, Math.max(0, value))}%` } as CSSProperties}
    />
  </span>
)
