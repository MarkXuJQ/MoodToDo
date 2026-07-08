import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export type WeatherContext = {
  latitude: number
  longitude: number
  locationLabel: string
  weatherLabel: string
  temperatureC: number
  fetchedAt: string
}

const weatherCacheKey = 'xinxiangyi-weather-context-v1'

const getTodayKey = () => {
  const today = new Date()
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)

  return local.toISOString().slice(0, 10)
}

const roundCoord = (value: number) => Math.round(value * 100) / 100

const weatherCodeMap: Record<number, { day: string; night: string }> = {
  0: { day: '晴', night: '晴夜' },
  1: { day: '大致晴朗', night: '少云' },
  2: { day: '多云', night: '多云' },
  3: { day: '阴', night: '阴' },
  45: { day: '雾', night: '雾' },
  48: { day: '雾凇', night: '雾凇' },
  51: { day: '毛毛雨', night: '毛毛雨' },
  53: { day: '细雨', night: '细雨' },
  55: { day: '中雨', night: '中雨' },
  56: { day: '冻毛毛雨', night: '冻毛毛雨' },
  57: { day: '冻雨', night: '冻雨' },
  61: { day: '小雨', night: '小雨' },
  63: { day: '降雨', night: '降雨' },
  65: { day: '大雨', night: '大雨' },
  66: { day: '冻雨', night: '冻雨' },
  67: { day: '强冻雨', night: '强冻雨' },
  71: { day: '小雪', night: '小雪' },
  73: { day: '降雪', night: '降雪' },
  75: { day: '大雪', night: '大雪' },
  77: { day: '雪粒', night: '雪粒' },
  80: { day: '阵雨', night: '阵雨' },
  81: { day: '较强阵雨', night: '较强阵雨' },
  82: { day: '暴雨阵雨', night: '暴雨阵雨' },
  85: { day: '阵雪', night: '阵雪' },
  86: { day: '强阵雪', night: '强阵雪' },
  95: { day: '雷暴', night: '雷暴' },
  96: { day: '雷暴夹小冰雹', night: '雷暴夹小冰雹' },
  99: { day: '强雷暴冰雹', night: '强雷暴冰雹' },
}

const readCachedWeather = (): WeatherContext | null => {
  const raw = window.localStorage.getItem(weatherCacheKey)

  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as WeatherContext
    if (parsed.fetchedAt.slice(0, 10) !== getTodayKey()) return null
    return parsed
  } catch {
    return null
  }
}

const persistWeather = (context: WeatherContext) => {
  window.localStorage.setItem(weatherCacheKey, JSON.stringify(context))
}

type PositionLike = {
  coords: {
    latitude: number
    longitude: number
  }
}

const nativePermissionGranted = (value?: string) => value === 'granted'

const getNativePosition = async (): Promise<PositionLike> => {
  let permissions = await Geolocation.checkPermissions()

  if (!nativePermissionGranted(permissions.coarseLocation) && !nativePermissionGranted(permissions.location)) {
    permissions = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] })
  }

  if (!nativePermissionGranted(permissions.coarseLocation) && !nativePermissionGranted(permissions.location)) {
    throw new Error('定位权限未开启。')
  }

  return Geolocation.getCurrentPosition({
    enableHighAccuracy: false,
    timeout: 10000,
    maximumAge: 30 * 60 * 1000,
  })
}

const getBrowserPosition = () =>
  new Promise<PositionLike>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('当前浏览器不支持定位。'))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 30 * 60 * 1000,
    })
  })

const getCurrentPosition = async () => {
  if (Capacitor.isNativePlatform()) {
    return getNativePosition()
  }

  return getBrowserPosition()
}

const reverseGeocode = async (latitude: number, longitude: number) => {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', `${latitude}`)
  url.searchParams.set('lon', `${longitude}`)
  url.searchParams.set('accept-language', 'zh-CN')
  url.searchParams.set('zoom', '12')
  url.searchParams.set('addressdetails', '1')

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`定位解析失败：${response.status}`)
  }

  const payload = (await response.json()) as {
    address?: Record<string, string | undefined>
    name?: string
    display_name?: string
  }

  const address = payload.address ?? {}
  const locality =
    address.city ||
    address.town ||
    address.village ||
    address.county ||
    address.state ||
    payload.name ||
    payload.display_name?.split(',')[0]

  return locality?.trim() || '当前位置'
}

const fetchCurrentWeather = async (latitude: number, longitude: number) => {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', `${latitude}`)
  url.searchParams.set('longitude', `${longitude}`)
  url.searchParams.set('current', 'temperature_2m,weather_code,is_day')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_days', '1')

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`天气获取失败：${response.status}`)
  }

  const payload = (await response.json()) as {
    current?: {
      temperature_2m?: number
      weather_code?: number
      is_day?: number
    }
  }
  const current = payload.current

  if (!current || typeof current.temperature_2m !== 'number' || typeof current.weather_code !== 'number') {
    throw new Error('天气接口没有返回可用的当前天气。')
  }

  const labelGroup = weatherCodeMap[current.weather_code] ?? { day: '天气未知', night: '天气未知' }

  return {
    temperatureC: Math.round(current.temperature_2m),
    weatherLabel: current.is_day === 0 ? labelGroup.night : labelGroup.day,
  }
}

export const getCurrentWeatherContext = async (force = false): Promise<WeatherContext> => {
  const cached = !force ? readCachedWeather() : null
  if (cached) return cached

  const position = await getCurrentPosition()
  const latitude = roundCoord(position.coords.latitude)
  const longitude = roundCoord(position.coords.longitude)

  const [locationLabel, weather] = await Promise.all([
    reverseGeocode(latitude, longitude),
    fetchCurrentWeather(latitude, longitude),
  ])

  const context: WeatherContext = {
    latitude,
    longitude,
    locationLabel,
    weatherLabel: weather.weatherLabel,
    temperatureC: weather.temperatureC,
    fetchedAt: new Date().toISOString(),
  }

  persistWeather(context)
  return context
}

export const formatWeatherText = (context: WeatherContext) => `${context.weatherLabel} ${context.temperatureC}°C`
