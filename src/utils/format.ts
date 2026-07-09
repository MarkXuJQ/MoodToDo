export const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`

  return `${Math.round(size / 1024 / 102.4) / 10} MB`
}
