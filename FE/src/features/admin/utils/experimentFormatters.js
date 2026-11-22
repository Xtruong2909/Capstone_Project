function numericValue(value) {
  if (value == null || !['string', 'number'].includes(typeof value) || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function formatExperimentMetric(value, language = 'vi') {
  const number = numericValue(value)
  if (number == null) return '—'
  return new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(number)
}

export function formatAggregationInterval(seconds, language = 'vi') {
  const number = numericValue(seconds)
  if (number == null || number <= 0) return '—'
  const minutes = number % 60 === 0
  const value = minutes ? number / 60 : number
  const unit = language === 'vi' ? (minutes ? 'phút' : 'giây') : (minutes ? 'min' : 'sec')
  return `${value.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')} ${unit}`
}

export function formatExperimentDate(value, language = 'vi') {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US')
}
