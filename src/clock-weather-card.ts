import { LitElement, html, type TemplateResult, type PropertyValues, type CSSResultGroup } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import {
  type HomeAssistant,
  hasConfigOrEntityChanged,
  hasAction,
  type ActionHandlerEvent,
  handleAction,
  TimeFormat,
  type ActionConfig
} from 'custom-card-helpers' // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers

import {
  type ClockWeatherCardConfig,
  type ForecastType,
  type MergedClockWeatherCardConfig,
  type MergedWeatherForecast,
  Rgb,
  type TemperatureSensor,
  type TemperatureUnit,
  type HumiditySensor,
  type Weather,
  WeatherEntityFeature,
  type WeatherForecast,
  type WeatherForecastEvent
} from './types'
import styles from './styles'
import { actionHandler } from './action-handler-directive'
import { localize } from './localize/localize'
import { type HassEntity, type HassEntityBase } from 'home-assistant-js-websocket'
import { extractMostOccuring, max, min, roundIfNotNull, roundUp } from './utils'
import { animatedIcons, staticIcons } from './images'
import { version } from '../package.json'
import { safeRender } from './helpers'
import { DateTime } from 'luxon'

console.info(
  `%c  CLOCK-WEATHER-CARD \n%c Version: ${version}`,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray'
);

// This puts your card into the UI card picker dialog
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).customCards = (window as any).customCards || [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).customCards.push({
  type: 'clock-weather-card',
  name: 'Clock Weather Card',
  description: 'Shows the current date/time in combination with the current weather and an iOS insipired weather forecast.'
})

const gradientMap: Map<number, Rgb> = new Map()
  .set(-20, new Rgb(0, 60, 98)) // dark blue
  .set(-10, new Rgb(120, 162, 204)) // darker blue
  .set(0, new Rgb(164, 195, 210)) // light blue
  .set(10, new Rgb(121, 210, 179)) // turquoise
  .set(20, new Rgb(252, 245, 112)) // yellow
  .set(30, new Rgb(255, 150, 79)) // orange
  .set(40, new Rgb(255, 192, 159)) // red

@customElement('clock-weather-card')
export class ClockWeatherCard extends LitElement {
  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistant

  @state() private config!: MergedClockWeatherCardConfig
  @state() private currentDate!: DateTime
  @state() private forecasts?: WeatherForecast[]
  @state() private error?: TemplateResult
  private forecastSubscriber?: () => Promise<void>
  private forecastSubscriberLock = false

  constructor () {
    super()
    this.currentDate = DateTime.now()
    const msToNextSecond = (1000 - this.currentDate.millisecond)
    setTimeout(() => setInterval(() => { this.currentDate = DateTime.now() }, 1000), msToNextSecond)
    setTimeout(() => { this.currentDate = DateTime.now() }, msToNextSecond)
  }

  public static getStubConfig (_hass: HomeAssistant, entities: string[], entitiesFallback: string[]): Record<string, unknown> {
    const entity = entities.find(e => e.startsWith('weather.') ?? entitiesFallback.find(() => true))
    if (entity) {
      return { entity }
    }

    return {}
  }

  public getCardSize (): number {
    return 3 + roundUp(this.config.forecast_rows / 2)
  }

  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig (config?: ClockWeatherCardConfig): void {
    if (!config) {
      throw this.createError('Invalid configuration.')
    }

    if (!config.entity) {
      throw this.createError('Attribute "entity" must be present.')
    }

    if (config.forecast_rows && config.forecast_rows < 1) {
      throw this.createError('Attribute "forecast_rows" must be greater than 0.')
    }

    if (config.time_format && config.time_format.toString() !== '24' && config.time_format.toString() !== '12') {
      throw this.createError('Attribute "time_format" must either be "12" or "24".')
    }

    if (config.hide_today_section && config.hide_forecast_section) {
      throw this.createError('Attributes "hide_today_section" and "hide_forecast_section" must not enabled at the same time.')
    }

    this.config = this.mergeConfig(config)
  }

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate (changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false
    }

    if (changedProps.has('forecasts')) {
      return true
    }

    const oldHass = changedProps.get('hass') as HomeAssistant | undefined
    if (oldHass) {
      const oldSun = oldHass.states[this.config.sun_entity]
      const newSun = this.hass.states[this.config.sun_entity]
      if (oldSun !== newSun) {
        return true
      }

      if (this.config.forecast_type === 'uv_daily' && this.config.uv_sensor_prefix) {
        for (let i = 0; i < this.config.forecast_rows; i++) {
          for (const suffix of ['category_', 'max_index_', 'start_time_', 'end_time_', 'forecast_']) {
            const id = `${this.config.uv_sensor_prefix}${suffix}${i}`
            if (oldHass.states[id] !== this.hass.states[id]) return true
          }
        }
      }

      if (this.config.forecast_type === 'bushfire_daily' && this.config.bushfire_sensor_prefix) {
        for (let i = 0; i < this.config.forecast_rows; i++) {
          const id = `${this.config.bushfire_sensor_prefix}${i}`
          if (oldHass.states[id] !== this.hass.states[id]) return true
        }
      }

      if (this.config.bushfire_alerts_sensor && oldHass.states[this.config.bushfire_alerts_sensor] !== this.hass.states[this.config.bushfire_alerts_sensor]) {
        return true
      }

      if (this.config.forecast_type === 'rain_daily') {
        if (this.config.rain_sensor && oldHass.states[this.config.rain_sensor] !== this.hass.states[this.config.rain_sensor]) {
          return true
        }
        if (this.config.rain_sensor_prefix) {
          for (let i = 0; i < this.config.forecast_rows; i++) {
            for (const suffix of ['amount_min_', 'amount_max_', 'chance_']) {
              const id = `${this.config.rain_sensor_prefix}${suffix}${i}`
              if (oldHass.states[id] !== this.hass.states[id]) return true
            }
          }
        }
      }
    }

    if (this.config.today_description_sensor && oldHass) {
      if (oldHass.states[this.config.today_description_sensor] !== this.hass.states[this.config.today_description_sensor]) return true
    }

    return hasConfigOrEntityChanged(this, changedProps, false)
  }

  protected updated (changedProps: PropertyValues): void {
    super.updated(changedProps)
    if (changedProps.has('config')) {
      void this.subscribeForecastEvents()
    }
  }

  // https://lit.dev/docs/components/rendering/
  protected render (): TemplateResult {
    if (this.error) {
      return this.error
    }

    const showToday = !this.config.hide_today_section
    const showForecast = !this.config.hide_forecast_section
    const { minTemp, maxTemp } = this.getGlobalTempRange()
    const tempColSize = this.getMaxTempChars(minTemp, maxTemp) * 0.5
    const todayRightPad = tempColSize + 1
    return html`
      <ha-card
        @action=${(e: ActionHandlerEvent) => { this.handleAction(e) }}
        .actionHandler=${actionHandler({
      hasHold: hasAction(this.config.hold_action as ActionConfig | undefined),
      hasDoubleClick: hasAction(this.config.double_tap_action as ActionConfig | undefined)
    })}
        tabindex="0"
        .label=${`Clock Weather Card: ${this.config.entity || 'No Entity Defined'}`}
      >
        ${this.config.title
        ? html`
          <div class="card-header">
            ${this.config.title}
          </div>`
        : ''}
        <div class="card-content">
          ${showToday
        ? html`
            <clock-weather-card-today>
              ${safeRender(() => this.renderToday(todayRightPad))}
            </clock-weather-card-today>`
        : ''}
          ${showForecast && this.config.forecast_type !== 'rain_daily' && this.config.forecast_type !== 'uv_daily' && this.config.forecast_type !== 'bushfire_daily'
        ? html`
            <clock-weather-card-forecast>
              ${safeRender(() => this.renderForecast())}
            </clock-weather-card-forecast>`
        : ''}
          ${this.config.forecast_type === 'rain_daily' && this.config.rain_sensor_prefix
        ? html`
            <clock-weather-card-forecast>
              ${safeRender(() => this.renderRainForecast())}
            </clock-weather-card-forecast>`
        : ''}
          ${this.config.forecast_type === 'uv_daily' && this.config.uv_sensor_prefix
        ? html`
            <clock-weather-card-forecast>
              ${safeRender(() => this.renderUvForecast())}
            </clock-weather-card-forecast>`
        : ''}
          ${this.config.forecast_type === 'bushfire_daily' && this.config.bushfire_sensor_prefix
        ? html`
            <clock-weather-card-forecast>
              ${safeRender(() => this.renderBushfireForecast())}
            </clock-weather-card-forecast>`
        : ''}
          ${this.config.forecast_type === 'bushfire_daily' && this.config.bushfire_alerts_sensor
        ? safeRender(() => this.renderBushfireAlerts(todayRightPad))
        : ''}
        </div>
      </ha-card>
    `
  }

  public connectedCallback (): void {
    super.connectedCallback()
    if (this.hasUpdated) {
      void this.subscribeForecastEvents()
    }
  }

  public disconnectedCallback (): void {
    super.disconnectedCallback()
    void this.unsubscribeForecastEvents()
  }

  protected willUpdate (changedProps: PropertyValues): void {
    super.willUpdate(changedProps)
    if (!this.forecastSubscriber) {
      void this.subscribeForecastEvents()
    }
  }

  private renderToday (todayRightPad: number): TemplateResult {
    if (this.config.forecast_type === 'rain_daily') {
      return this.renderTodayRain(todayRightPad)
    }
    if (this.config.forecast_type === 'uv_daily') {
      return this.renderTodayUv(todayRightPad)
    }
    if (this.config.forecast_type === 'bushfire_daily') {
      return this.renderTodayBushfire(todayRightPad)
    }
    return this.renderTodayTemp(todayRightPad)
  }

  private renderTodayTemp (todayRightPad: number): TemplateResult {
    const weather = this.getWeather()
    const state = weather.state
    const temp = this.config.show_decimal ? this.getCurrentTemperature() : roundIfNotNull(this.getCurrentTemperature())
    const tempUnit = weather.attributes.temperature_unit
    const apparentTemp = this.config.show_decimal ? this.getApparentTemperature() : roundIfNotNull(this.getApparentTemperature())
    const aqi = this.getAqi()
    const aqiBackgroundColor = this.getAqiBackgroundColor(aqi)
    const aqiTextColor = this.getAqiTextColor(aqi)
    const humidity = roundIfNotNull(this.getCurrentHumidity())
    const iconType = this.config.weather_icon_type
    const icon = this.toIcon(state, iconType, undefined, this.getIconAnimationKind())
    const weatherString = this.localize(`weather.${state}`)
    const localizedTemp = temp !== null ? this.toConfiguredTempWithUnit(tempUnit, temp) : null
    const localizedHumidity = humidity !== null ? `${humidity}% ${this.localize('misc.humidity')}` : null
    const localizedApparent = apparentTemp !== null ? this.toConfiguredTempWithUnit(tempUnit, apparentTemp) : null
    const apparentString = this.localize('misc.feels-like')
    const aqiString = this.localize('misc.aqi')

    return html`
      <clock-weather-card-today-left>
        <img class="grow-img" src=${icon} />
      </clock-weather-card-today-left>
      <clock-weather-card-today-right>
        <clock-weather-card-today-right-wrap style="width: 100%; padding-right: ${todayRightPad}rem; box-sizing: border-box;">
          <clock-weather-card-today-right-wrap-top>
            ${this.getTodayDescription(this.config.hide_clock ? weatherString : localizedTemp ? `${weatherString}, ${localizedTemp}` : weatherString)}
            ${this.config.show_humidity && localizedHumidity ? html`<br>${localizedHumidity}` : ''}
            ${this.config.apparent_sensor && apparentTemp ? html`<br>${apparentString}: ${localizedApparent}` : ''}
            ${this.config.aqi_sensor && aqi !== null ? html`<br><aqi style="background-color: ${aqiBackgroundColor}; color: ${aqiTextColor};">${aqi} ${aqiString}</aqi>` : ''}
          </clock-weather-card-today-right-wrap-top>
          <clock-weather-card-today-right-wrap-center style="justify-content: end;">
            ${this.config.hide_clock ? localizedTemp ?? 'n/a' : this.time()}
          </clock-weather-card-today-right-wrap-center>
          <clock-weather-card-today-right-wrap-bottom>
            ${this.config.hide_date ? '' : this.date()}
          </clock-weather-card-today-right-wrap-bottom>
        </clock-weather-card-today-right-wrap>
      </clock-weather-card-today-right>`
  }

  private renderTodayRain (todayRightPad: number): TemplateResult {
    const weather = this.getWeather()
    const state = weather.state
    const iconType = this.config.weather_icon_type
    const icon = this.toIcon(state, iconType, undefined, this.getIconAnimationKind())
    const chance = this.config.rain_sensor_prefix ? this.getNumericState(`${this.config.rain_sensor_prefix}chance_0`) ?? 0 : 0
    const rainDescription = this.getRainDescription(chance)
    const currentRain = this.getCurrentRainValue()

    return html`
      <clock-weather-card-today-left>
        <img class="grow-img" src=${icon} />
      </clock-weather-card-today-left>
      <clock-weather-card-today-right>
        <clock-weather-card-today-right-wrap style="width: 100%; padding-right: ${todayRightPad}rem; box-sizing: border-box;">
          <clock-weather-card-today-right-wrap-top>
            ${this.getTodayDescription(rainDescription)}
          </clock-weather-card-today-right-wrap-top>
          <clock-weather-card-today-right-wrap-center style="justify-content: end;">
            ${currentRain !== null && currentRain > 0
              ? html`${currentRain} <span class="value-unit-large">mm</span>`
              : 'Nil'}
          </clock-weather-card-today-right-wrap-center>
          <clock-weather-card-today-right-wrap-bottom>
            ${this.config.hide_date ? '' : this.date()}
          </clock-weather-card-today-right-wrap-bottom>
        </clock-weather-card-today-right-wrap>
      </clock-weather-card-today-right>`
  }

  private getRainDescription (chance: number): string {
    if (chance === 0) return 'No chance of rain,\ndon\'t worry about the brolly!'
    if (chance <= 30) return 'Low chance of rain,\nmaybe pack that brolly!'
    if (chance <= 60) return 'Medium chance of rain,\nmaybe pack that brolly!'
    return 'High chance of rain,\nif you don\'t pack that brolly you will be sorry!'
  }

  private renderForecast (): TemplateResult[] {
    const weather = this.getWeather()
    const currentTemp = roundIfNotNull(this.getCurrentTemperature())
    const maxRowsCount = this.config.forecast_rows
    const hourly = this.config.forecast_type === 'temp_hourly'
    const temperatureUnit = weather.attributes.temperature_unit

    const forecasts = this.mergeForecasts(maxRowsCount, hourly)

    const { minTemp, maxTemp } = this.getGlobalTempRange(currentTemp)

    const displayTexts = forecasts
      .map(f => f.datetime)
      .map(d => hourly ? this.time(d) : this.localize(`day.${d.weekday}`))
    const maxColOneChars = this.getMaxColOneChars()
    const maxTempChars = this.getMaxTempChars(minTemp, maxTemp)

    return forecasts.map((forecast, i) => safeRender(() => this.renderForecastItem(forecast, minTemp, maxTemp, currentTemp, temperatureUnit, hourly, displayTexts[i], maxColOneChars, maxTempChars)))
  }

  private renderForecastItem (forecast: MergedWeatherForecast, minTemp: number, maxTemp: number, currentTemp: number | null, temperatureUnit: TemperatureUnit, hourly: boolean, displayText: string, maxColOneChars: number, maxTempChars: number): TemplateResult {
    const weatherState = forecast.condition === 'pouring' ? 'raindrops' : forecast.condition === 'rainy' ? 'raindrop' : forecast.condition
    const daytime: 'day' | 'night' | undefined = hourly ? (this.isHourDaytime(forecast.datetime.hour) ? 'day' : 'night') : 'day'
    const weatherIcon = this.toIcon(weatherState, 'fill', daytime, 'static')
    const tempUnit = this.getWeather().attributes.temperature_unit
    const isNow = hourly ? DateTime.now().hour === forecast.datetime.hour : DateTime.now().day === forecast.datetime.day
    const showDot = isNow && !hourly
    const minTempDayRaw = Math.round(isNow && currentTemp !== null ? Math.min(currentTemp, forecast.templow) : forecast.templow)
    const maxTempDayRaw = Math.round(isNow && currentTemp !== null ? Math.max(currentTemp, forecast.temperature) : forecast.temperature)
    const minTempDay = Math.max(minTemp, Math.min(maxTemp, minTempDayRaw))
    const maxTempDay = Math.max(minTemp, Math.min(maxTemp, maxTempDayRaw))
    const clampedCurrentTemp = currentTemp !== null ? Math.max(minTemp, Math.min(maxTemp, Math.round(currentTemp))) : null

    return html`
      <clock-weather-card-forecast-row style="--col-one-size: ${(maxColOneChars * 0.5)}rem; --temp-col-size: ${(maxTempChars * 0.5)}rem;">
        ${this.renderText(displayText)}
        ${this.renderIcon(weatherIcon)}
        ${this.renderText(this.toConfiguredTempWithUnit(tempUnit, hourly ? maxTempDay : minTempDay), 'right')}
        ${this.renderForecastTemperatureBar(minTemp, maxTemp, hourly ? maxTempDay : minTempDay, maxTempDay, showDot, clampedCurrentTemp, temperatureUnit)}
        ${this.renderText(this.toConfiguredTempWithUnit(tempUnit, maxTempDay))}
      </clock-weather-card-forecast-row>
    `
  }

  private renderText (text: string, textAlign: 'left' | 'center' | 'right' = 'left'): TemplateResult {
    return html`
      <forecast-text style="--text-align: ${textAlign};">
        ${text}
      </forecast-text>
    `
  }

  private renderIcon (src: string): TemplateResult {
    return html`
      <forecast-icon>
        <img class="grow-img" src=${src} />
      </forecast-icon>
    `
  }

  private renderForecastTemperatureBar (minTemp: number, maxTemp: number, minTempDay: number, maxTempDay: number, isNow: boolean, currentTemp: number | null, temperatureUnit: TemperatureUnit): TemplateResult {
    const { startPercent, endPercent } = this.calculateBarRangePercents(minTemp, maxTemp, minTempDay, maxTempDay)
    const moveRight = maxTemp === minTemp ? 0 : (minTempDay - minTemp) / (maxTemp - minTemp)
    return html`
      <forecast-temperature-bar>
        <forecast-temperature-bar-background> </forecast-temperature-bar-background>
        <forecast-temperature-bar-range
          style="--move-right: ${moveRight.toFixed(2)}; --start-percent: ${startPercent.toFixed(2)}%; --end-percent: ${endPercent.toFixed(2)}%; --gradient: ${this.createGradientString(
            minTempDay,
            maxTempDay,
            temperatureUnit
          )};"
        >
          ${isNow ? this.renderForecastCurrentTemp(minTempDay, maxTempDay, currentTemp) : ''}
        </forecast-temperature-bar-range>
      </forecast-temperature-bar>
    `
  }

  private renderForecastCurrentTemp (minTempDay: number, maxTempDay: number, currentTemp: number | null): TemplateResult {
    if (currentTemp == null) {
      return html``
    }
    const indicatorPosition = minTempDay === maxTempDay ? 0 : (100 / (maxTempDay - minTempDay)) * (currentTemp - minTempDay)
    const steps = maxTempDay - minTempDay
    const moveRight = maxTempDay === minTempDay ? 0 : (currentTemp - minTempDay) / steps
    return html`
      <forecast-temperature-bar-current-indicator style="--position: ${indicatorPosition}%;">
        <forecast-temperature-bar-current-indicator-dot style="--move-right: ${moveRight}">
        </forecast-temperature-bar-current-indicator-dot>
      </forecast-temperature-bar-current-indicator>
    `
  }

  private getCurrentRainValue (): number | null {
    let val: number | undefined
    if (this.config.rain_sensor) {
      const sensor = this.hass.states[this.config.rain_sensor]
      val = sensor?.state ? parseFloat(sensor.state) : undefined
    }
    if (val === undefined && this.config.rain_sensor_prefix) {
      const sensor = this.hass.states[`${this.config.rain_sensor_prefix}amount_max_0`]
      val = sensor?.state ? parseFloat(sensor.state) : undefined
    }
    if (val !== undefined && !isNaN(val)) return val
    return null
  }

  private renderRainForecast (): TemplateResult[] {
    const prefix = this.config.rain_sensor_prefix
    if (!prefix) return []

    const maxRowsCount = this.config.forecast_rows

    const currentRain = this.config.rain_sensor ? this.getNumericState(this.config.rain_sensor) : null

    const rainDays: Array<{ min: number, max: number, chance: number }> = []
    for (let i = 0; i < maxRowsCount; i++) {
      const minVal = this.getNumericState(`${prefix}amount_min_${i}`)
      const maxVal = this.getNumericState(`${prefix}amount_max_${i}`)
      const chanceVal = this.getNumericState(`${prefix}chance_${i}`)
      rainDays.push({ min: minVal ?? 0, max: maxVal ?? 0, chance: chanceVal ?? 0 })
    }

    const globalMax = Math.max(...rainDays.map(d => d.max), currentRain ?? 0, 1)

    const forecasts = this.mergeForecasts(maxRowsCount, false)
    const displayTexts = forecasts
      .map(f => f.datetime)
      .map(d => this.localize(`day.${d.weekday}`))
    const maxColOneChars = this.getMaxColOneChars()
    const { minTemp, maxTemp } = this.getGlobalTempRange()
    const maxValueChars = this.getMaxTempChars(minTemp, maxTemp)

    return rainDays.map((day, i) => safeRender(() =>
      this.renderRainForecastItem(day, globalMax, forecasts[i], displayTexts[i] ?? '', maxColOneChars, maxValueChars, i === 0, currentRain)
    ))
  }

  private renderRainForecastItem (
    day: { min: number, max: number, chance: number },
    globalMax: number,
    forecast: MergedWeatherForecast | undefined,
    displayText: string,
    maxColOneChars: number,
    maxRainChars: number,
    isToday: boolean,
    currentRain: number | null
  ): TemplateResult {
    const weatherState = forecast ? (forecast.condition === 'pouring' ? 'raindrops' : forecast.condition === 'rainy' ? 'raindrop' : forecast.condition) : 'rainy'
    const weatherIcon = this.toIcon(weatherState, 'fill', 'day', 'static')
    const chanceText = `${Math.round(day.chance)}%`

    return html`
      <clock-weather-card-forecast-row style="--col-one-size: ${(maxColOneChars * 0.5)}rem; --temp-col-size: ${(maxRainChars * 0.5)}rem;">
        ${this.renderText(displayText)}
        ${this.renderIcon(weatherIcon)}
        ${this.renderText(chanceText, 'right')}
        ${this.renderRainBar(globalMax, day.min, day.max, isToday, currentRain, day.chance)}
        <forecast-text>${day.max} <span class="value-unit">mm</span></forecast-text>
      </clock-weather-card-forecast-row>
    `
  }

  private renderRainBar (globalMax: number, dayMin: number, dayMax: number, isToday: boolean, currentRain: number | null, chance: number): TemplateResult {
    const showBar = chance > 0 && dayMax > 0
    const { startPercent, endPercent } = this.calculateBarRangePercents(0, globalMax, dayMin, dayMax)
    const moveRight = globalMax === 0 ? 0 : dayMin / globalMax
    const gradient = this.createRainGradientString(dayMin, dayMax, globalMax)
    const clampedRain = currentRain !== null ? Math.max(dayMin, Math.min(dayMax, currentRain)) : null
    const showDot = isToday && clampedRain !== null

    return html`
      <forecast-temperature-bar>
        <forecast-temperature-bar-background> </forecast-temperature-bar-background>
        ${showBar
          ? html`<forecast-temperature-bar-range
              style="--move-right: ${moveRight.toFixed(2)}; --start-percent: ${startPercent.toFixed(2)}%; --end-percent: ${endPercent.toFixed(2)}%; --gradient: ${gradient};"
            >
              ${showDot ? this.renderForecastCurrentTemp(dayMin, dayMax, clampedRain) : ''}
            </forecast-temperature-bar-range>`
          : html`${showDot ? this.renderForecastCurrentTemp(0, globalMax, clampedRain) : ''}`}
      </forecast-temperature-bar>
    `
  }

  private createRainGradientString (dayMin: number, dayMax: number, globalMax: number): string {
    const lightBlue = new Rgb(174, 210, 230)
    const darkBlue = new Rgb(40, 120, 180)

    function interpolate (ratio: number): Rgb {
      return new Rgb(
        Math.round(lightBlue.r + ratio * (darkBlue.r - lightBlue.r)),
        Math.round(lightBlue.g + ratio * (darkBlue.g - lightBlue.g)),
        Math.round(lightBlue.b + ratio * (darkBlue.b - lightBlue.b))
      )
    }

    if (dayMin === dayMax) {
      const color = interpolate(globalMax > 0 ? dayMin / globalMax : 0)
      return `${color.toRgbString()} 0%, ${color.toRgbString()} 100%`
    }

    const colorMin = interpolate(globalMax > 0 ? dayMin / globalMax : 0)
    const colorMax = interpolate(globalMax > 0 ? dayMax / globalMax : 0)
    return `${colorMin.toRgbString()} 0%, ${colorMax.toRgbString()} 100%`
  }

  private getNumericState (entityId: string): number | null {
    const sensor = this.hass.states[entityId]
    const val = sensor?.state ? parseFloat(sensor.state) : undefined
    if (val !== undefined && !isNaN(val)) return val
    return null
  }

  private getTodayDescription (fallback: string): TemplateResult {
    let text = fallback
    if (this.config.today_description_sensor) {
      text = this.getStringState(this.config.today_description_sensor) ?? fallback
    }
    text = text.trim().replace(/^\.+|\.+$/g, '').trim()
    if (text.length > 50) {
      text = text.split(',')[0].trim().replace(/^\.+|\.+$/g, '').trim()
    }
    if (text.length > 50) {
      text = text.substring(0, 47).trim().replace(/^\.+|\.+$/g, '').trim().replace(/[^a-zA-Z0-9]+$/, '') + ' ...'
    }
    const parts = text.split('\n')
    if (parts.length > 1) {
      return html`${parts[0]}<br>${parts.slice(1).join(' ')}`
    }
    return html`${text}`
  }

  private getStringState (entityId: string): string | null {
    const sensor = this.hass.states[entityId]
    if (sensor?.state && sensor.state !== 'unknown' && sensor.state !== 'unavailable') return sensor.state
    return null
  }

  private renderTodayUv (todayRightPad: number): TemplateResult {
    const weather = this.getWeather()
    const state = weather.state
    const iconType = this.config.weather_icon_type
    const icon = this.toIcon(state, iconType, undefined, this.getIconAnimationKind())
    const prefix = this.config.uv_sensor_prefix ?? ''
    const category = this.getStringState(`${prefix}category_0`) ?? 'n/a'
    const weatherString = this.localize(`weather.${state}`)

    return html`
      <clock-weather-card-today-left>
        <img class="grow-img" src=${icon} />
      </clock-weather-card-today-left>
      <clock-weather-card-today-right>
        <clock-weather-card-today-right-wrap style="width: 100%; padding-right: ${todayRightPad}rem; box-sizing: border-box;">
          <clock-weather-card-today-right-wrap-top>
            ${this.getTodayDescription(weatherString)}
          </clock-weather-card-today-right-wrap-top>
          <clock-weather-card-today-right-wrap-center style="justify-content: end;">
            ${category}
          </clock-weather-card-today-right-wrap-center>
          <clock-weather-card-today-right-wrap-bottom>
            ${this.config.hide_date ? '' : this.date()}
          </clock-weather-card-today-right-wrap-bottom>
        </clock-weather-card-today-right-wrap>
      </clock-weather-card-today-right>`
  }

  private renderUvForecast (): TemplateResult[] {
    const prefix = this.config.uv_sensor_prefix
    if (!prefix) return []

    const maxRowsCount = this.config.forecast_rows

    const uvDays: Array<{ maxIndex: number, startHour: number, endHour: number, category: string }> = []
    for (let i = 0; i < maxRowsCount; i++) {
      const maxIndex = this.getNumericState(`${prefix}max_index_${i}`) ?? 0
      const startTimeStr = this.getStringState(`${prefix}start_time_${i}`)
      const endTimeStr = this.getStringState(`${prefix}end_time_${i}`)
      const category = this.getStringState(`${prefix}category_${i}`) ?? ''
      const startHour = startTimeStr ? DateTime.fromISO(startTimeStr).toLocal().hour : 6
      const endHour = endTimeStr ? Math.ceil(DateTime.fromISO(endTimeStr).toLocal().hour + DateTime.fromISO(endTimeStr).toLocal().minute / 60) : 18
      uvDays.push({ maxIndex, startHour: Math.max(6, startHour), endHour: Math.min(18, endHour), category })
    }

    const forecasts = this.mergeForecasts(maxRowsCount, false)
    const displayTexts = forecasts
      .map(f => f.datetime)
      .map(d => this.localize(`day.${d.weekday}`))
    const maxColOneChars = this.getMaxColOneChars()
    const { minTemp, maxTemp } = this.getGlobalTempRange()
    const maxValueChars = this.getMaxTempChars(minTemp, maxTemp)

    return uvDays.map((day, i) => safeRender(() =>
      this.renderUvForecastItem(day, forecasts[i], displayTexts[i] ?? '', maxColOneChars, maxValueChars)
    ))
  }

  private renderUvForecastItem (
    day: { maxIndex: number, startHour: number, endHour: number, category: string },
    forecast: MergedWeatherForecast | undefined,
    displayText: string,
    maxColOneChars: number,
    maxValueChars: number
  ): TemplateResult {
    const weatherState = forecast ? (forecast.condition === 'pouring' ? 'raindrops' : forecast.condition === 'rainy' ? 'raindrop' : forecast.condition) : 'sunny'
    const weatherIcon = this.toIcon(weatherState, 'fill', 'day', 'static')
    const timeRange = `${day.startHour}–${day.endHour}`

    return html`
      <clock-weather-card-forecast-row style="--col-one-size: ${(maxColOneChars * 0.5)}rem; --temp-col-size: ${(maxValueChars * 0.5)}rem;">
        ${this.renderText(displayText)}
        ${this.renderIcon(weatherIcon)}
        ${this.renderText(timeRange, 'right')}
        ${this.renderUvBar(day.startHour, day.endHour, day.maxIndex)}
        <forecast-text>${day.maxIndex} UV</forecast-text>
      </clock-weather-card-forecast-row>
    `
  }

  private renderUvBar (startHour: number, endHour: number, maxIndex: number): TemplateResult {
    const showBar = maxIndex > 0 && endHour > startHour
    const startPercent = ((startHour - 6) / 12) * 100
    const endPercent = ((endHour - 6) / 12) * 100
    const moveRight = (startHour - 6) / 12
    const gradient = this.createUvGradientString(maxIndex)

    return html`
      <forecast-temperature-bar>
        <forecast-temperature-bar-background> </forecast-temperature-bar-background>
        ${showBar
          ? html`<forecast-temperature-bar-range
              style="--move-right: ${moveRight.toFixed(2)}; --start-percent: ${startPercent.toFixed(2)}%; --end-percent: ${endPercent.toFixed(2)}%; --gradient: ${gradient};"
            >
            </forecast-temperature-bar-range>`
          : ''}
      </forecast-temperature-bar>
    `
  }

  private createUvGradientString (maxIndex: number): string {
    const color = this.getUvColor(maxIndex)
    return `${color.toRgbString()} 0%, ${color.toRgbString()} 100%`
  }

  private getUvColor (index: number): Rgb {
    if (index <= 2) return new Rgb(255, 255, 255)
    if (index <= 5) return new Rgb(78, 166, 56)
    if (index <= 7) return new Rgb(247, 186, 31)
    if (index <= 10) return new Rgb(232, 110, 28)
    return new Rgb(209, 47, 41)
  }

  private renderTodayBushfire (todayRightPad: number): TemplateResult {
    const weather = this.getWeather()
    const state = weather.state
    const iconType = this.config.weather_icon_type
    const icon = this.toIcon(state, iconType, undefined, this.getIconAnimationKind())
    const prefix = this.config.bushfire_sensor_prefix ?? ''
    const rating = this.getStringState(`${prefix}0`) ?? 'n/a'
    const description = this.getBushfireDescription(rating)

    return html`
      <clock-weather-card-today-left>
        <img class="grow-img" src=${icon} />
      </clock-weather-card-today-left>
      <clock-weather-card-today-right>
        <clock-weather-card-today-right-wrap style="width: 100%; padding-right: ${todayRightPad}rem; box-sizing: border-box;">
          <clock-weather-card-today-right-wrap-top>
            Bush fire risk is ${rating} today,<br>${description}
          </clock-weather-card-today-right-wrap-top>
          <clock-weather-card-today-right-wrap-center style="justify-content: end;">
            ${rating}
          </clock-weather-card-today-right-wrap-center>
          <clock-weather-card-today-right-wrap-bottom>
            ${this.config.hide_date ? '' : this.date()}
          </clock-weather-card-today-right-wrap-bottom>
        </clock-weather-card-today-right-wrap>
      </clock-weather-card-today-right>`
  }

  private getBushfireDescription (rating: string): string {
    const r = rating.toLowerCase()
    if (r === 'no rating') return 'nothing to worry about!'
    if (r === 'moderate') return 'plan and prepare'
    if (r === 'high') return 'be ready to act'
    if (r === 'extreme') return 'high vigilance, be ready to act'
    if (r === 'catastrophic') return 'high vigilance, consider leaving home'
    return ''
  }

  private renderBushfireForecast (): TemplateResult[] {
    const prefix = this.config.bushfire_sensor_prefix
    if (!prefix) return []

    const maxRowsCount = this.config.forecast_rows

    const bushfireDays: Array<{ rating: string }> = []
    for (let i = 0; i < maxRowsCount; i++) {
      const rating = this.getStringState(`${prefix}${i}`) ?? ''
      bushfireDays.push({ rating })
    }

    const forecasts = this.mergeForecasts(maxRowsCount, false)
    const displayTexts = forecasts
      .map(f => f.datetime)
      .map(d => this.localize(`day.${d.weekday}`))
    const maxColOneChars = this.getMaxColOneChars()
    const { minTemp, maxTemp } = this.getGlobalTempRange()
    const maxValueChars = this.getMaxTempChars(minTemp, maxTemp)

    return bushfireDays.map((day, i) => safeRender(() =>
      this.renderBushfireForecastItem(day, forecasts[i], displayTexts[i] ?? '', maxColOneChars, maxValueChars)
    ))
  }

  private renderBushfireForecastItem (
    day: { rating: string },
    forecast: MergedWeatherForecast | undefined,
    displayText: string,
    maxColOneChars: number,
    maxValueChars: number
  ): TemplateResult {
    const weatherState = forecast ? (forecast.condition === 'pouring' ? 'raindrops' : forecast.condition === 'rainy' ? 'raindrop' : forecast.condition) : 'sunny'
    const weatherIcon = this.toIcon(weatherState, 'fill', 'day', 'static')

    return html`
      <clock-weather-card-forecast-row style="--col-one-size: ${(maxColOneChars * 0.5)}rem; --temp-col-size: ${(maxValueChars * 0.5)}rem;">
        ${this.renderText(displayText)}
        ${this.renderIcon(weatherIcon)}
        ${this.renderText('0–24', 'right')}
        ${this.renderBushfireBar(day.rating)}
        <forecast-text>${this.getBushfireAbbreviation(day.rating)}</forecast-text>
      </clock-weather-card-forecast-row>
    `
  }

  private renderBushfireBar (rating: string): TemplateResult {
    const color = this.getBushfireColor(rating)
    const showBar = rating.toLowerCase() !== 'no rating' && rating !== ''
    const gradient = `${color.toRgbString()} 0%, ${color.toRgbString()} 100%`

    return html`
      <forecast-temperature-bar>
        <forecast-temperature-bar-background> </forecast-temperature-bar-background>
        ${showBar
          ? html`<forecast-temperature-bar-range
              style="--move-right: 0.00; --start-percent: 0.00%; --end-percent: 100.00%; --gradient: ${gradient};"
            >
            </forecast-temperature-bar-range>`
          : ''}
      </forecast-temperature-bar>
    `
  }

  private getBushfireColor (rating: string): Rgb {
    const r = rating.toLowerCase()
    if (r === 'no rating') return new Rgb(255, 255, 255)
    if (r === 'moderate') return new Rgb(78, 166, 56)
    if (r === 'high') return new Rgb(247, 186, 31)
    if (r === 'extreme') return new Rgb(232, 110, 28)
    if (r === 'catastrophic') return new Rgb(209, 47, 41)
    return new Rgb(255, 255, 255)
  }

  private getBushfireAbbreviation (rating: string): string {
    const r = rating.toLowerCase()
    if (r === 'no rating') return 'NONE'
    if (r === 'moderate') return 'MOD'
    if (r === 'high') return 'HIGH'
    if (r === 'extreme') return 'EXT'
    if (r === 'catastrophic') return 'CAT'
    return ''
  }

  private renderBushfireAlerts (todayRightPad: number): TemplateResult {
    const entityId = this.config.bushfire_alerts_sensor
    if (!entityId) return html``
    const sensor = this.hass.states[entityId]
    if (!sensor) return html``
    const attrs = sensor.attributes
    const alertEntries: Array<{ incident: string, detailLines: string[], distance: string }> = []
    for (const [key, value] of Object.entries(attrs)) {
      if (['friendly_name', 'icon', 'unit_of_measurement'].includes(key)) continue
      const parts = key.split('(')
      const incident = parts[0].trim()
      if (incident.toLowerCase() !== 'bushfire') continue
      const rawDetails = parts.length > 1 ? parts[1].replace(/\)$/, '').trim() : ''
      const commaSegments = rawDetails.split(',')
      const detailLines = commaSegments.length > 2
        ? [commaSegments.slice(0, 2).join(',').trim(), commaSegments.slice(2).join(',').trim()]
        : [rawDetails]
      alertEntries.push({ incident, detailLines, distance: String(value) })
    }
    if (alertEntries.length === 0) return html``
    return html`
      <clock-weather-card-today style="margin-top: 0.5rem;">
        <clock-weather-card-today-left>
          <ha-icon icon="mdi:alert" style="--mdc-icon-size: 100%; width: 100%; height: 100%; color: red;"></ha-icon>
        </clock-weather-card-today-left>
        <clock-weather-card-today-right>
          <clock-weather-card-today-right-wrap style="width: 100%; padding-right: ${todayRightPad}rem; box-sizing: border-box;">
            <clock-weather-card-today-right-wrap-top>
              <a href="https://www.emergency.wa.gov.au/?view=both" style="color: var(--primary-text-color);" @click=${(e: Event) => { e.preventDefault(); e.stopPropagation(); window.open('https://www.emergency.wa.gov.au/?view=both', '_blank') }}>DFES Emergency Warnings</a><br>Bushfire within 30km of home
            </clock-weather-card-today-right-wrap-top>
            <clock-weather-card-today-right-wrap-center style="justify-content: end;">
              Bushfire Alert
            </clock-weather-card-today-right-wrap-center>
          </clock-weather-card-today-right-wrap>
        </clock-weather-card-today-right>
      </clock-weather-card-today>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; padding: 0 1rem;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 0.25rem 0.5rem;">Bushfire</th>
            <th style="text-align: right; padding: 0.25rem 0.5rem;">Distance</th>
          </tr>
        </thead>
        <tbody>
          ${alertEntries.map(e => html`
            <tr>
              <td style="padding: 0.25rem 0.5rem;">${e.detailLines.map((line, i) => i > 0 ? html`<br>${line}` : html`${line}`)}</td>
              <td style="text-align: right; padding: 0.25rem 0.5rem;">${e.distance}</td>
            </tr>
          `)}
        </tbody>
      </table>
    `
  }

  // https://lit.dev/docs/components/styles/
  static get styles (): CSSResultGroup {
    return styles
  }

  private createGradientString (minTempDay: number, maxTempDay: number, temperatureUnit: TemperatureUnit): string {
    function linearizeColor (temp: number, [tempLeft, colorLeft]: [number, Rgb], [tempRight, colorRight]: [number, Rgb]): Rgb {
      const ratio = Math.max(Math.min((temp - tempLeft) / (tempRight - tempLeft), 1.0), 0.0)
      return new Rgb(
        Math.round(colorLeft.r + ratio * (colorRight.r - colorLeft.r)),
        Math.round(colorLeft.g + ratio * (colorRight.g - colorLeft.g)),
        Math.round(colorLeft.b + ratio * (colorRight.b - colorLeft.b))
      )
    }

    const minTempDayCelsius = this.toCelsius(temperatureUnit, minTempDay)
    const maxTempDayCelsius = this.toCelsius(temperatureUnit, maxTempDay)

    if (minTempDayCelsius === maxTempDayCelsius) {
      const entries = [...gradientMap.entries()]
      let color: Rgb
      if (minTempDayCelsius <= entries[0][0]) {
        color = entries[0][1]
      } else if (minTempDayCelsius >= entries[entries.length - 1][0]) {
        color = entries[entries.length - 1][1]
      } else {
        const upperIndex = entries.findIndex(([temp]) => temp >= minTempDayCelsius)
        color = linearizeColor(minTempDayCelsius, entries[upperIndex - 1], entries[upperIndex])
      }
      return `${color.toRgbString()} 0%, ${color.toRgbString()} 100%`
    }

    const outputGradient = ([...gradientMap.entries()]
      .reduce((gradient, [temp, color], index, arr) => {
        if (index === 0) {
          // First color
          // Remark: This if-level can't be optimized away as in the unlikely event
          // that the daily low would be exactly same floating point value than
          // the first color temperature, we would hit negative index on the lower branches.
          if (temp > minTempDayCelsius) {
            // Daily low is lower than lowest color temperature
            // so we have to duplicate.
            gradient.set(0.0, color)
            gradient.set((temp - minTempDayCelsius) / (maxTempDayCelsius - minTempDayCelsius), color)
          } else {
            // Temp is smaller or equal than daily low so we'll skip the color until we know what we need to linearize.
          }
        } else if (temp < minTempDayCelsius) {
          // Still haven't found a color that would be the first one

        } else if (!gradient.has(0.0)) {
          // This is the first color usable color, we need to linearize the color with the previous one
          gradient.set(0.0, linearizeColor(minTempDayCelsius, arr[index - 1], [temp, color]))

          // and then add this color to the right position
          if (temp > maxTempDayCelsius) {
            // This color is also higher than the daily max so we need to linearize it as well
            gradient.set(1.0, linearizeColor(maxTempDayCelsius, arr[index - 1], [temp, color]))
          } else {
            // In other cases (> 0.0 and <= 1.0) we calculate the position
            gradient.set((temp - minTempDayCelsius) / (maxTempDayCelsius - minTempDayCelsius), color)
          }
        } else if (temp < maxTempDayCelsius) {
          // color is on the gradient
          gradient.set((temp - minTempDayCelsius) / (maxTempDayCelsius - minTempDayCelsius), color)
        } else if (!gradient.has(1.0)) {
          // Last color of the gradient
          if (temp > maxTempDayCelsius) {
            // Linearize the last color
            gradient.set(1.0, linearizeColor(maxTempDayCelsius, arr[index - 1], [temp, color]))
          } else {
            // Get last color from the color temperature
            gradient.set(1.0, color)
          }
        } else {
          // We don't care for intermediate colors that are not on the daily gradient
        }

        return gradient
      }, new Map<number, Rgb>())
    )

    // Gradient endpoint check
    if (!outputGradient.has(1.0)) {
      // Gradient is missing the final color. This means that the daily max is higher
      // than highest color temperature so we have to duplicate.
      outputGradient.set(1.0, Array.from(outputGradient.values()).slice(-1)[0])
    }

    // Make the gradient string
    return ([...outputGradient.entries()]
      .map(([pos, color]) => `${color.toRgbString()} ${Math.round(pos * 100.0)}%`)
      .join(', ')
    )
  }

  private handleAction (ev: ActionHandlerEvent): void {
    if (this.hass && this.config && ev.detail.action) {
      handleAction(this, this.hass, this.config, ev.detail.action)
    }
  }

  private mergeConfig (config: ClockWeatherCardConfig): MergedClockWeatherCardConfig {
    return {
      ...config,
      sun_entity: config.sun_entity ?? 'sun.sun',
      temperature_sensor: config.temperature_sensor,
      humidity_sensor: config.humidity_sensor,
      weather_icon_type: config.weather_icon_type ?? 'line',
      forecast_rows: config.forecast_rows ?? 5,
      forecast_type: this.resolveForecastType(config),
      hide_current_hourly_forecast: config.hide_current_hourly_forecast ?? false,
      animated_icon: config.animated_icon ?? true,
      time_format: config.time_format?.toString() as '12' | '24' | undefined,
      time_pattern: config.time_pattern ?? undefined,
      show_humidity: config.show_humidity ?? false,
      hide_forecast_section: config.hide_forecast_section ?? false,
      hide_today_section: config.hide_today_section ?? false,
      hide_clock: config.hide_clock ?? false,
      hide_date: config.hide_date ?? false,
      date_pattern: config.date_pattern ?? 'D',
      use_browser_time: config.use_browser_time ?? false,
      time_zone: config.time_zone ?? undefined,
      show_decimal: config.show_decimal ?? false,
      apparent_sensor: config.apparent_sensor ?? undefined,
      aqi_sensor: config.aqi_sensor ?? undefined,
      temperature_sensor_min: config.temperature_sensor_min ?? undefined,
      temperature_sensor_max: config.temperature_sensor_max ?? undefined,
      rain_sensor: config.rain_sensor ?? undefined,
      rain_sensor_prefix: config.rain_sensor_prefix ? (config.rain_sensor_prefix.endsWith('_') ? config.rain_sensor_prefix : `${config.rain_sensor_prefix}_`) : undefined,
      uv_sensor_prefix: config.uv_sensor_prefix ? (config.uv_sensor_prefix.endsWith('_') ? config.uv_sensor_prefix : `${config.uv_sensor_prefix}_`) : undefined,
      bushfire_sensor_prefix: config.bushfire_sensor_prefix ? (config.bushfire_sensor_prefix.endsWith('_') ? config.bushfire_sensor_prefix : `${config.bushfire_sensor_prefix}_`) : undefined,
      bushfire_alerts_sensor: config.bushfire_alerts_sensor ?? undefined
    }
  }

  private resolveForecastType (config: ClockWeatherCardConfig): ForecastType {
    if (config.forecast_type) return config.forecast_type
    if (config.hourly_forecast) return 'temp_hourly'
    return 'temp_daily'
  }

  private toIcon (weatherState: string, type: 'fill' | 'line', daytimeOverride: 'day' | 'night' | undefined, kind: 'static' | 'animated'): string {
    const daytime = daytimeOverride ?? (this.getSun()?.state === 'below_horizon' ? 'night' : 'day')
    const iconMap = kind === 'animated' ? animatedIcons : staticIcons
    const icon = iconMap[type][weatherState]
    return icon?.[daytime] || icon
  }

  private getWeather (): Weather {
    const weather = this.hass.states[this.config.entity] as unknown as Weather | undefined
    if (!weather) {
      throw this.createError(`Weather entity "${this.config.entity}" could not be found.`)
    }
    return weather
  }

  private getCurrentTemperature (): number | null {
    if (this.config.temperature_sensor) {
      const temperatureSensor = this.hass.states[this.config.temperature_sensor] as TemperatureSensor | undefined
      const temp = temperatureSensor?.state ? parseFloat(temperatureSensor.state) : undefined
      const unit = temperatureSensor?.attributes.unit_of_measurement ?? this.getConfiguredTemperatureUnit()
      if (temp !== undefined && !isNaN(temp)) {
        return this.toConfiguredTempWithoutUnit(unit, temp)
      }
    }

    // return weather temperature if above code could not extract temperature from temperature_sensor
    return this.getWeather().attributes.temperature ?? null
  }

  private getSensorTemp (value: string | number | undefined): number | null {
    if (value == null) return null
    if (typeof value === 'number') return value
    const sensor = this.hass.states[value] as TemperatureSensor | undefined
    const temp = sensor?.state ? parseFloat(sensor.state) : undefined
    const unit = sensor?.attributes.unit_of_measurement ?? this.getConfiguredTemperatureUnit()
    if (temp !== undefined && !isNaN(temp)) {
      return this.toConfiguredTempWithoutUnit(unit, temp)
    }
    return null
  }

  private getCurrentHumidity (): number | null {
    if (this.config.humidity_sensor) {
      const humiditySensor = this.hass.states[this.config.humidity_sensor] as HumiditySensor | undefined
      const humid = humiditySensor?.state ? parseFloat(humiditySensor.state) : undefined
      if (humid !== undefined && !isNaN(humid)) {
        return humid
      }
    }

    // Return weather humidity if the code could not extract humidity from the humidity_sensor
    return this.getWeather().attributes.humidity ?? null
  }

  private getApparentTemperature (): number | null {
    if (this.config.apparent_sensor) {
      const apparentSensor = this.hass.states[this.config.apparent_sensor] as TemperatureSensor | undefined
      const temp = apparentSensor?.state ? parseFloat(apparentSensor.state) : undefined
      const unit = apparentSensor?.attributes.unit_of_measurement ?? this.getConfiguredTemperatureUnit()
      if (temp !== undefined && !isNaN(temp)) {
        return this.toConfiguredTempWithoutUnit(unit, temp)
      }
    }
    return null
  }

  private getAqi (): number | null {
    if (this.config.aqi_sensor) {
      const aqiSensor = this.hass.states[this.config.aqi_sensor] as HassEntity | undefined
      const aqi = aqiSensor?.state ? parseInt(aqiSensor.state) : undefined
      if (aqi !== undefined && !isNaN(aqi)) {
        return aqi
      }
    }
    return null
  }

  private getAqiBackgroundColor (aqi: number | null): string | null {
    if (aqi == null) {
      return null
    }
    if (aqi <= 50) return '#00FF00'
    if (aqi <= 100) return '#FFFF00'
    if (aqi <= 150) return '#FF8C00'
    if (aqi <= 200) return '#FF0000'
    if (aqi <= 300) return '#9400D3'
    return '#8B0000'
  }

  private getAqiTextColor (aqi: number | null): string {
    // Use black text for light backgrounds (green, yellow, orange) for better readability.
    if (aqi !== null && aqi <= 150) {
      return '#000000'
    }
    // Use white text for dark backgrounds (red, purple, maroon).
    return '#FFFFFF'
  }

  private getSun (): HassEntityBase | undefined {
    return this.hass.states[this.config.sun_entity]
  }

  private isHourDaytime (hour: number): boolean {
    let sunriseHour = 6
    let sunsetHour = 18
    const sun = this.getSun()
    if (sun) {
      const attrs = sun.attributes as Record<string, unknown>
      const risingStr = attrs.next_rising as string | undefined
      const settingStr = attrs.next_setting as string | undefined
      if (risingStr && settingStr) {
        const rising = DateTime.fromISO(risingStr).toLocal()
        const setting = DateTime.fromISO(settingStr).toLocal()
        if (rising.isValid && setting.isValid && rising.hour < (setting.minute > 0 || setting.second > 0 ? setting.hour + 1 : setting.hour)) {
          sunriseHour = rising.hour
          sunsetHour = setting.minute > 0 || setting.second > 0 ? setting.hour + 1 : setting.hour
        }
      }
    }
    return hour >= sunriseHour && hour < sunsetHour
  }

  private getLocale (): string {
    return this.config.locale ?? this.hass.locale.language ?? 'en-GB'
  }

  private date (): string {
    return this.toZonedDate(this.currentDate).toFormat(this.config.date_pattern)
  }

  private time (date: DateTime = this.currentDate): string {
    if (this.config.time_pattern) {
      return this.toZonedDate(date).toFormat(this.config.time_pattern)
    }

    if (this.config.time_format) {
      return this.toZonedDate(date)
        .toFormat(this.config.time_format === '24' ? 'HH:mm' : 'h:mm a')
    }
    if (this.hass.locale.time_format === TimeFormat.am_pm) {
      return this.toZonedDate(date).toFormat('h:mm a')
    }

    if (this.hass.locale.time_format === TimeFormat.twenty_four) {
      return this.toZonedDate(date).toFormat('HH:mm')
    }

    return this.toZonedDate(date).toFormat('t')
  }

  private getGlobalTempRange (currentTemp: number | null = null): { minTemp: number, maxTemp: number } {
    const sensorMin = this.getSensorTemp(this.config.temperature_sensor_min)
    const sensorMax = this.getSensorTemp(this.config.temperature_sensor_max)

    const allForecasts = this.isLegacyWeather() ? this.getWeather().attributes.forecast ?? [] : this.forecasts ?? []
    const allMinTemps = allForecasts.map((f) => f.templow ?? f.temperature ?? 0)
    const allMaxTemps = allForecasts.map((f) => f.temperature ?? 0)
    if (currentTemp !== null) {
      allMinTemps.push(currentTemp)
      allMaxTemps.push(currentTemp)
    }
    const computedMin = Math.round(min(allMinTemps))
    const computedMax = Math.round(max(allMaxTemps))
    const minTemp = Math.min(sensorMin !== null ? Math.round(sensorMin) : computedMin, computedMin)
    const maxTemp = Math.max(sensorMax !== null ? Math.round(sensorMax) : computedMax, computedMax)
    return { minTemp, maxTemp }
  }

  private getMaxColOneChars (): number {
    const dayLengths = [1, 2, 3, 4, 5, 6, 7].map(d => this.localize(`day.${d}`).length)
    const sampleTime = this.time(DateTime.now())
    return Math.max(...dayLengths, sampleTime.length)
  }

  private getMaxTempChars (minTemp: number, maxTemp: number): number {
    const forecastType = this.config.forecast_type

    if (forecastType === 'rain_daily' && this.config.rain_sensor_prefix) {
      const rainSamples: number[] = []
      for (let i = 0; i < this.config.forecast_rows; i++) {
        const maxVal = this.getNumericState(`${this.config.rain_sensor_prefix}amount_max_${i}`) ?? 0
        const chanceVal = this.getNumericState(`${this.config.rain_sensor_prefix}chance_${i}`) ?? 0
        rainSamples.push(`${maxVal} mm`.length, `${Math.round(chanceVal)}%`.length)
      }
      return Math.max(...rainSamples)
    }

    if (forecastType === 'uv_daily' && this.config.uv_sensor_prefix) {
      const uvSamples: number[] = []
      for (let i = 0; i < this.config.forecast_rows; i++) {
        const maxIndex = this.getNumericState(`${this.config.uv_sensor_prefix}max_index_${i}`) ?? 0
        const startTimeStr = this.getStringState(`${this.config.uv_sensor_prefix}start_time_${i}`)
        const endTimeStr = this.getStringState(`${this.config.uv_sensor_prefix}end_time_${i}`)
        const startHour = startTimeStr ? DateTime.fromISO(startTimeStr).toLocal().hour : 6
        const endHour = endTimeStr ? Math.ceil(DateTime.fromISO(endTimeStr).toLocal().hour + DateTime.fromISO(endTimeStr).toLocal().minute / 60) : 18
        const timeRange = `${Math.max(6, startHour)}–${Math.min(18, endHour)}`
        uvSamples.push(`${maxIndex} UV`.length, timeRange.length)
      }
      return Math.max(...uvSamples)
    }

    if (forecastType === 'bushfire_daily' && this.config.bushfire_sensor_prefix) {
      const bushfireSamples: number[] = ['NONE', 'MOD', 'HIGH', 'EXT', 'CAT'].map(s => s.length)
      bushfireSamples.push('0–24'.length)
      return Math.max(...bushfireSamples)
    }

    const unit = this.getConfiguredTemperatureUnit()
    const tempSamples = [minTemp, maxTemp, -minTemp, -maxTemp].map(t => `${t}${unit}`.length)
    return Math.max(...tempSamples)
  }

  private getIconAnimationKind (): 'static' | 'animated' {
    return this.config.animated_icon ? 'animated' : 'static'
  }

  private toCelsius (temperatueUnit: TemperatureUnit, temperature: number): number {
    return temperatueUnit === '°C' ? temperature : Math.round((temperature - 32) * (5 / 9))
  }

  private toFahrenheit (temperatueUnit: TemperatureUnit, temperature: number): number {
    return temperatueUnit === '°F' ? temperature : Math.round((temperature * 9 / 5) + 32)
  }

  private getConfiguredTemperatureUnit (): TemperatureUnit {
    return this.hass.config.unit_system.temperature as TemperatureUnit
  }

  private toConfiguredTempWithUnit (unit: TemperatureUnit, temp: number): string {
    const convertedTemp = this.toConfiguredTempWithoutUnit(unit, temp)
    return convertedTemp + this.getConfiguredTemperatureUnit()
  }

  private toConfiguredTempWithoutUnit (unit: TemperatureUnit, temp: number): number {
    const configuredUnit = this.getConfiguredTemperatureUnit()
    if (configuredUnit === unit) {
      return temp
    }

    return unit === '°C'
      ? this.toFahrenheit(unit, temp)
      : this.toCelsius(unit, temp)
  }

  private calculateBarRangePercents (minTemp: number, maxTemp: number, minTempDay: number, maxTempDay: number): { startPercent: number, endPercent: number } {
    if (maxTemp === minTemp) {
      // avoid division by 0
      return { startPercent: 0, endPercent: 100 }
    }
    const startPercent = (100 / (maxTemp - minTemp)) * (minTempDay - minTemp)
    const endPercent = (100 / (maxTemp - minTemp)) * (maxTempDay - minTemp)
    // fix floating point issue
    // (100 / (19 - 8)) * (19 - 8) = 100.00000000000001
    return {
      startPercent: Math.max(0, startPercent),
      endPercent: Math.min(100, endPercent)
    }
  }

  private localize (key: string): string {
    return localize(key, this.getLocale())
  }

  private mergeForecasts (maxRowsCount: number, hourly: boolean): MergedWeatherForecast[] {
    const forecasts = this.isLegacyWeather() ? this.getWeather().attributes.forecast ?? [] : this.forecasts ?? []
    const agg = forecasts.reduce<Record<number, WeatherForecast[]>>((forecasts, forecast) => {
      const d = new Date(forecast.datetime)
      const unit = hourly ? `${d.getMonth()}-${d.getDate()}-${+d.getHours()}` : d.getDate()
      forecasts[unit] = forecasts[unit] || []
      forecasts[unit].push(forecast)
      return forecasts
    }, {})

    const merged = Object.values(agg)
      .reduce((agg: Array<{ forecast: MergedWeatherForecast, hadTemplow: boolean }>, forecasts) => {
        if (forecasts.length === 0) return agg
        const avg = this.calculateAverageForecast(forecasts)
        const hadTemplow = forecasts.some((f) => f.templow !== null && f.templow !== undefined)
        agg.push({ forecast: avg, hadTemplow })
        return agg
      }, [])
      .sort((a, b) => a.forecast.datetime.toMillis() - b.forecast.datetime.toMillis())

    if (!hourly && merged.length >= 2 && !merged[0].hadTemplow) {
      merged[0].forecast.templow = merged[1].forecast.templow
    }

    const results = merged.map((m) => m.forecast)

    if (hourly && this.config.hide_current_hourly_forecast) {
      const nextHour = DateTime.now().plus({ hours: 1 }).startOf('hour')
      return results.filter((f) => f.datetime >= nextHour).slice(0, maxRowsCount)
    }

    return results.slice(0, maxRowsCount)
  }

  private toZonedDate (date: DateTime): DateTime {
    const localizedDate = date.setLocale(this.getLocale())
    if (this.config.use_browser_time) return localizedDate
    const timeZone = this.config.time_zone ?? this.hass?.config?.time_zone
    const withTimeZone = localizedDate.setZone(timeZone)
    if (withTimeZone.isValid) {
      return withTimeZone
    }
    console.error(`clock-weather-card - Time Zone [${timeZone}] not supported. Falling back to browser time.`)
    return localizedDate
  }

  private calculateAverageForecast (forecasts: WeatherForecast[]): MergedWeatherForecast {
    const minTemps = forecasts.map((f) => f.templow ?? f.temperature ?? this.getCurrentTemperature() ?? 0)
    const minTemp = min(minTemps)

    const maxTemps = forecasts.map((f) => f.temperature ?? this.getCurrentTemperature() ?? 0)
    const maxTemp = max(maxTemps)

    const precipitationProbabilities = forecasts.map((f) => f.precipitation_probability ?? 0)
    const precipitationProbability = max(precipitationProbabilities)

    const precipitations = forecasts.map((f) => f.precipitation ?? 0)
    const precipitation = max(precipitations)

    const conditions = forecasts.map((f) => f.condition)
    const condition = extractMostOccuring(conditions)

    return {
      temperature: maxTemp,
      templow: minTemp,
      datetime: this.parseDateTime(forecasts[0].datetime),
      condition,
      precipitation_probability: precipitationProbability,
      precipitation
    }
  }

  private async subscribeForecastEvents (): Promise<void> {
    if (this.forecastSubscriberLock) {
      return
    }
    this.forecastSubscriberLock = true
    await this.unsubscribeForecastEvents()
    if (this.isLegacyWeather()) {
      this.forecastSubscriber = async () => {}
      this.forecastSubscriberLock = false
      return
    }

    if (!this.isConnected || !this.config || !this.hass) {
      this.forecastSubscriberLock = false
      return
    }

    const forecastType = this.determineForecastType()
    if (forecastType === 'hourly_not_supported') {
      this.forecastSubscriber = async () => {}
      this.forecastSubscriberLock = false
      throw this.createError(`Weather entity [${this.config.entity}] does not support hourly forecast.`)
    }
    try {
      const callback = (event: WeatherForecastEvent): void => {
        this.forecasts = event.forecast
      }
      const options = { resubscribe: false }
      const message = {
        type: 'weather/subscribe_forecast',
        forecast_type: forecastType,
        entity_id: this.config.entity
      }
      this.forecastSubscriber = await this.hass.connection.subscribeMessage<WeatherForecastEvent>(callback, message, options)
    } catch (e: unknown) {
      console.error('clock-weather-card - Error when subscribing to weather forecast', e)
    } finally {
      this.forecastSubscriberLock = false
    }
  }

  private async unsubscribeForecastEvents (): Promise<void> {
    if (this.forecastSubscriber) {
      try {
        await this.forecastSubscriber()
      } catch (e: unknown) {
        // swallow error, as this means that connection was closed already
      } finally {
        this.forecastSubscriber = undefined
      }
    }
  }

  private isLegacyWeather (): boolean {
    return !this.supportsFeature(WeatherEntityFeature.FORECAST_DAILY) && !this.supportsFeature(WeatherEntityFeature.FORECAST_HOURLY)
  }

  private supportsFeature (feature: WeatherEntityFeature): boolean {
    try {
      return (this.getWeather().attributes.supported_features & feature) !== 0
    } catch (e) {
      // might be that weather entity was not found
      return false
    }
  }

  private createError (errorString: string): Error {
    const error = new Error(errorString)
    const errorCard = document.createElement('hui-error-card')
    errorCard.setConfig({
      type: 'error',
      error,
      origConfig: this.config
    })
    this.error = html`${errorCard}`
    return error
  }

  private determineForecastType (): 'hourly' | 'daily' | 'hourly_not_supported' {
    const supportsDaily = this.supportsFeature(WeatherEntityFeature.FORECAST_DAILY)
    const supportsHourly = this.supportsFeature(WeatherEntityFeature.FORECAST_HOURLY)
    const hourly = this.config.forecast_type === 'temp_hourly'
    if (supportsDaily && supportsHourly) {
      return hourly ? 'hourly' : 'daily'
    } else if (hourly && supportsHourly) {
      return 'hourly'
    } else if (!hourly && supportsDaily) {
      return 'daily'
    } else if (hourly && !supportsHourly) {
      return 'hourly_not_supported'
    } else {
      // !hourly && !supportsDaily
      console.warn(`clock-weather-card - Weather entity [${this.config.entity}] does not support daily forecast. Falling back to hourly forecast.`)
      return 'hourly'
    }
  }

  private parseDateTime (date: string): DateTime {
    const fromIso = DateTime.fromISO(date)
    if (fromIso.isValid) {
      return fromIso
    }
    return DateTime.fromJSDate(new Date(date))
  }
}
