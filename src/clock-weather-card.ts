import { LitElement, html, type TemplateResult, type PropertyValues, type CSSResultGroup } from 'lit'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
import { animatedIcons, staticIcons, bushfireIcons, uvIcons } from './images'
import { version } from '../package.json'
import { safeRender } from './helpers'
import { DateTime } from 'luxon'

const ICON_DESCRIPTOR_CATEGORY_DESCRIPTIONS: Record<string, string[]> = {
  sunny: [
    'It\s so sunny (quiet)!',
    'Great Scott, it\'s sunny!"',
    'Suns out, guns out',
    'Blessed by the sun',
    'Here comes the sun, and it\'s alright',
    'All you need is sun',
    'Sunny! Amaze! Amaze! Amaze!',
    '"It\'s lobster thermidor hot" -Batman',
    '"It\'s gorgeous out. Just gorgeous" -Rhys',
    'Everything is awesome(ly) sunny',
    'This sun\'s gonna get stuck in your head',
    '17 days? We wont\'t last 17 hours in this sun',
    'Hasta la vista, clouds',
    'You\'re gonna need a bigger hat',
    'You know why (it\'s sunny)',
    'Houston, we have sunshine',
    'My knees hurt. Also, it\'s sunny',
    'The dogs are barking. Also, it\'s sunny',
    'Sun-bum is doing his happy dance!',
    'Perfect day, if Dad fixed the pool',
    'Just like 99% of Perth days, sunny!',
    'Zero clouds, no notes',
    'Skip the Vitamin D tablet today!',
    '"It\'s my time to shine" -Sun',
    'Get our squint on',
    'Its like a Windows background out there',
    'Engage sunshine. Sunshine engaged',
    'If atop did weather, it would say Sunny',
    'Solar panels will be happy today!',
    'I am walking on sunshine, yeah, yeah',
    'Sunshine inventory full, Tamagotchi mad',
    'Honey, where\'s my sunglasses (pants)?',
    'Marsupalami, it\'s Graham for sunshine',
    'To infinity and sunny beyond',
    'That\'s not sunshine. THAT\'S sunshine',
    'Nobody puts sunshine in a corner',
    '"I\'m kind of a big deal" -Sun',
    'You can\'t handle the sun',
    'Yippee-ki-yay, it\'s sunny out',
    'Sun. James Sun.',
    'Game over, man, it\'s gorgeous out',
    'Stay frosty, it\'s too sunny for that',
    'Never go full sun',
    'I\'m Ron Burgundy and it\'s sunny today?',
    '60% of the time, it\'s sunny every time',
    'I\'m in a glass case of sunshine',
    'Sunny? Baxter, ya know I don\'t speak Spanish',
    'It\'s so damn hot, milk was a bad choice',
    'It\'s weapons grade sun out there!',
    'You had me at sunshine',
    'Sunshine, shaken not stirred',
    'Skyfall? No, just sunshine falling',
    'May the rays be with you',
    'To be or not to be… outside',
    'Life is like a box of sunshine',
    'I\'m a sunny island! I\'m sunny Ibiza!',
    'Stay classy, sunshine',
    'This weather belongs in a museum',
    'Only the penitent man brought his hat',
    'Come with me if you want to tan',
    'Take the red pill, see how sunny it really is',
    'You are The ONE (who checked the forecast)',
    'There is no spoon, there is only sunshine',
    'It\'s not personal, it\'s just sunny',
    'Keep your friends close, you\'re hat closer',
    'Life is pain, sunshine is not',
    'I am trapped in a glass case of sunshine',
    'Creeper? Aww man, too sunny to care',
    'This is fine, said Steve, squinting',
    'Diamonds are forever, sunshine is better',
    'Open the pod bay doors HAL, it\'s sunny out',
    'Steve has left the mine, it\'s sunny out',
    'Eve scanned for clouds, found none',
    'As you wish, it\'s sunny',
    'Life is pain, sunshine is not',
    'Open those solar panels Wall-E, its sunny!',
    'Inconceivable! Not a cloud in sight',
    'Punch it Chewie, it\'s sunny',
    '"Anyone can cook in this sun" -Gusteau',
    'The sky is Ada-Edudance level happy',
    'I feel the need, the need for sun'
  ],
  clear: [
    'It\s so clear (quiet)!',
    'Great Scott, it\'s a clear night!"',
    'Do not go gentle into that good night',
    'The Cosmos says - "Look up"',
    'Stars out! Amaze! Amaze! Amaze!',
    'Sweet Caroline, look at those stars',
    'Ziggy played guitar, under these stars',
    'Heroes, just for one clear night',
    'Life on Mars, nope, just stars on Earth',
    'Modern love, ancient stars tonight',
    'Young Americans, old stars tonight',
    'Is this the real sky, or just fantasy',
    'Eve scanned for clouds, found none',
    'Clear night, "My God, it\'s full of stars"',
    'The stars are out, the universe says hi!',
    'Galileo would be smiling tonight',
    'The cosmos is in 4K tonight',
    'The universe is showing off tonight',
    'Hubble is jealous of our view tonight',
    'The Milky Way is clocking in tonight',
    'The night shift is stunning tonight',
    'Best seat in the universe, look up',
    'Ziggy Stardust would approve tonight',
    'The truth is out there, so are the stars',
    'Interstellar, no wormhole required tonight',
    'Phone home tonight, skies are clear ET',
    'We\'re gonna need a bigger telescope',
    'Starman waiting in the sky, Bowie spot on',
    'Space oddity? Not tonight, just stars',
    'This is ground control, skies are clear',
    'It\'s a van Gogh "Stary Night" out there',
    'Star gazing night, Dad needs a telescope',
    'Twinkle twinkle 200 sextillion stars',
    '2 trillion (10¹²) galaxies to see tonight',
    '200 sextillion (10²³) stars to see tonight',
    '700 quintillion (10¹⁸) systems to see tonight'
  ],
  partly_cloudy: [
    'It\s so cloudy (quiet)!',
    'Great Scott, it\'s (partly) cloudy!"',
    'Honey, who shrunk the sun?',
    'Where we\'re going, we don\'t need clouds',
    'Clouds ... not Amaze! Amaze! Amaze!',
    'Houston, we have a bit of cloud problem',
    'You\'ve got mail, I mean clouds',
    'You know why (it\'s cloudy)',
    'Every barn, every outhouse, find that sun',
    'Eve scanned for clouds, found some',
    'Have fun storming the clouds',
    'It\'s not personal Kathleen, just cloudy',
    'Say hello to my little sun patch',
    '60% of the time, it\'s cloudy every time',
    'In space, no one can hear the sky shrug',
    'To cloud or not to cloud, that is the forecast',
    'Houston, we have a cloud problem',
    'You talking to me, cloud?',
    'Just a girl, standing under some clouds',
    'Clear skies winning, clouds are trying',
    'The sky is vacillating',
    'Punch it Chewie, it\'s sunny ... ish',
    'Half time: Clear Skies 2, Clouds 1',
    'Sky at Edwin/Ada movie indecision levels',
    'The force is not so strong with this sun',
    'Is it mostly clear or partly cloudy?'
  ],
  cloudy: [
    'It\s so cloudy (quiet)!',
    'Great Scott, it\'s cloudy!"',
    'Honey, who shrunk the sun?',
    'Where we\'re going, we don\'t need clouds',
    'Honey, where\'s my sun (pants)?',
    'Clouds ... not Amaze! Amaze! Amaze!',
    'Yesterday, the clouds seemed so far away',
    'I\'m (Lego) Batman, I don\'t need sunshine',
    '"I only work in black/grey skies" -Batman',
    '"Iron Man sucks. So does this weather" -Batman',
    'These cloud\'s gonna get stuck in your head',
    'You know why (it\'s cloudy)',
    'Grumpier sky than Edwin on a photo shoot',
    'The force is strong with these clouds',
    'The one armed man took the sunshine',
    'Sorry Dave, clouds are staying',
    'Keep the change ya filthy clouds',
    'Skynet predicted these clouds',
    'Eve scanned for clouds, found many!',
    'These are not the clouds you\'re looking for',
    '60% of the time, it\'s cloudy every time',
    'I\'ll make these clouds an offer',
    'Game over man, bring a jacket',
    'Snakes. Why did it have to be clouds?',
    'Roads? Where we\'re going, need sun',
    'I say nuke the clouds from orbit',
    'Never go full cloudy',
    'It could be London out there',
    'Half time: Clear skies 0, Cloud 1',
    'Just keep swimming, it\'s grey out',
    'Cloud committee: block sky, carried',
    'To infinity and cloudy beyond!'
  ],
  drizzle: [
    'It\s so drizzly (quiet)!',
    'Great Scott, it\'s drizzly!"',
    'Where\'s my umbrella (pants)?',
    'TARS, what\'s your rain setting? 90%',
    'Drizzle ... not Amaze! Amaze! Amaze!',
    'This drizzle\'s gonna get stuck in your head',
    'Houston, we have a bit of drizzle problem',
    'You know why (it\'s drizzly)',
    'Punch it Chewie, it\'s drizzly',
    'Skynet predicted this drizzle',
    'Survival mode: drizzle makes it wetter',
    'Eve scanned for rain, found a little',
    'Chance of rain would be a fine thing',
    'Only penitent man avoids the drizzle',
    'Yippee-ki-yay, sort of raining',
    '60% of the time, it drizzles every time',
    'Come on rain, we need you!',
    'A brief sprinkle, your hair will survive',
    'Just enough rain to bring the cookatoos out',
    'Too shy to be real rain, counts though',
    'Dad wouldn\'t stress, but would Nanny?'
  ],
  rain: [
    'It\s so rainy (quiet)!',
    'Great Scott, it\'s rainy!"',
    'Where\'s my umbrella (pants)?',
    'Time is relative, so is rain',
    'You\'ve got to leave something behind in this rain',
    'TARS, what\'s your rain setting? 90%',
    '"I won\'t leave you in the rain..." -TARS',
    '"Slaves for my rainy robot colony" -TARS',
    'Take the red pill, see how rainy it really is',
    'Blessed by the rain',
    'Help me if you can I am feelin rainy',
    'Rain ... not Amaze! Amaze! Amaze!',
    'Blame it on the rain, yeah, yeah',
    'This rain\'s gonna get stuck in your head',
    'Houston, we have a rain problem',
    'With this rain about, count me out',
    'You know why (it\'s rainy)',
    'Punch it Chewie, it\'s rainy',
    'Skynet predicted this rain',
    'Merry Christmas ya filthy weather',
    'It\'s weapons grade rain today!',
    'Directive: find rain, found plenty!',
    'Mr Anderson, prepare to get wet',
    'By the beard of Zeus, it\'s wet!',
    'In space, no one hears you drenching',
    'You\'re gonna need a bigger umbrella',
    'I hope Dad cleaned the gutters out',
    'Cockatoos screeching, rain\'s coming!',
    'Grandma\'s favourite, bring on the rain!',
    'Raining cats and dogs, pet-free zone violated',
    'Keep your friends close, brolly closer',
    'I feel the need, the need for rain'
  ],
  thunderstorm: [
    'Zeus is booked in today, Mum\'s favourite!',
    'Red Alert! Thunderstorm, not gaming time!',
    'I\'ve got a bad feeling about this weather'
  ],
  windy: [
    'I\'ll have what the wind is having',
    'You are the wind beneath my wings',
    'Leave the wind, take the cannoli',
    'It\'s not personal, it\'s just windy',
    'Frankly my dear, I don\'t give a gust',
    'Great Scott, it\'s windy!"',
    'I\'ll be back ... once the wind dies down'
  ],
  hazy: [
    'As hazy as a Coopers Pale Ale out there'
  ],
  fog: [
    'It\'s as foggy as Toowoomba out there!'
  ],
  dust: [
    'The Pilbara called, it wants its dust back!'
  ],
  frost: [
    'Frosty the snowman was a jolly happy soul'
  ],
  snow: [
    'Snow! In Darlington? This has to be a bug!'
  ],
  tropical_cyclone: [
    'Its going to get crazy, take cover'
  ]
}

const ICON_DESCRIPTOR_TO_CATEGORY: Record<string, string> = {
  sunny: 'sunny',
  clear: 'clear',
  mostly_sunny: 'partly_cloudy',
  partly_cloudy: 'partly_cloudy',
  cloudy: 'cloudy',
  overcast: 'cloudy',
  hazy: 'hazy',
  fog: 'fog',
  dust: 'dust',
  chance_shower: 'drizzle',
  light_shower: 'drizzle',
  shower: 'drizzle',
  drizzle: 'drizzle',
  light_rain: 'drizzle',
  showers: 'drizzle',
  rain: 'drizzle',
  heavy_shower: 'rain',
  heavy_rain: 'rain',
  chance_thunderstorm: 'thunderstorm',
  thunderstorm: 'thunderstorm',
  windy: 'windy',
  frost: 'frost',
  snow: 'snow',
  tropical_cyclone: 'tropical_cyclone'
}

const RAIN_CHANCE_DESCRIPTIONS: Array<[number, string, string]> = [
  [0, 'No chance of rain', "Don't worry about the brolly!"],
  [30, 'Low chance of rain', 'Pack your hope, not the brolly!'],
  [60, 'Medium chance of rain', 'I would risk no brolly, would Nanny?'],
  [100, 'High chance of rain', "The clouds aren't bluffing, brolly time!"]
]

const ICON_DESCRIPTOR_TO_WEATHER_STATE: Record<string, string> = {
  sunny: 'sunny',
  clear: 'clear-night',
  mostly_sunny: 'sunny',
  partly_cloudy: 'partlycloudy',
  cloudy: 'cloudy',
  overcast: 'cloudy',
  hazy: 'fog',
  fog: 'fog',
  dust: 'exceptional',
  chance_shower: 'rainy',
  light_shower: 'rainy',
  shower: 'rainy',
  showers: 'rainy',
  heavy_shower: 'pouring',
  drizzle: 'rainy',
  light_rain: 'rainy',
  rain: 'rainy',
  heavy_rain: 'pouring',
  chance_thunderstorm: 'lightning',
  thunderstorm: 'lightning-rainy',
  windy: 'windy',
  frost: 'snowy',
  snow: 'snowy',
  tropical_cyclone: 'exceptional'
}

console.info(
  `%c  CLOCK-WEATHER-CARD \n%c Version: ${version}`,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray'
);

// This puts your card into the UI card picker dialog
// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
(window as any).customCards = (window as any).customCards || [];
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
  private readonly _descriptionIndexCache = new Map<string, number>()

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

      if (this.config.today_value_sensor && oldHass.states[this.config.today_value_sensor] !== this.hass.states[this.config.today_value_sensor]) {
        return true
      }

      if (this.config.today_value_secondary_sensor && oldHass.states[this.config.today_value_secondary_sensor] !== this.hass.states[this.config.today_value_secondary_sensor]) {
        return true
      }

      if (this.config.forecast_secondary_sensor_prefix && oldHass.states[this.config.forecast_secondary_sensor_prefix] !== this.hass.states[this.config.forecast_secondary_sensor_prefix]) {
        return true
      }

      if (this.config.forecast_sensor_prefix) {
        const suffixes = this.getForecastSuffixes()
        for (let i = 0; i < this.config.forecast_rows; i++) {
          for (const suffix of suffixes) {
            const id = `${this.config.forecast_sensor_prefix}${suffix}${i}`
            if (oldHass.states[id] !== this.hass.states[id]) return true
          }
        }
      }
    }

    const descriptionSensor = this.config.today_description_sensor ?? (this.config.forecast_type === 'uv_daily' && this.config.forecast_sensor_prefix ? `${this.config.forecast_sensor_prefix}forecast_0` : undefined)
    if (descriptionSensor && oldHass) {
      if (oldHass.states[descriptionSensor] !== this.hass.states[descriptionSensor]) return true
      const fallbackSensor = descriptionSensor.endsWith('_0') ? descriptionSensor.replace(/_0$/, '_1') : undefined
      if (fallbackSensor && oldHass.states[fallbackSensor] !== this.hass.states[fallbackSensor]) return true
    }

    const iconDescriptorSensor = this.config.icon_descriptor_sensor
    if (iconDescriptorSensor && oldHass) {
      if (oldHass.states[iconDescriptorSensor] !== this.hass.states[iconDescriptorSensor]) return true
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
              ${safeRender(() => this.renderToday())}
            </clock-weather-card-today>`
        : ''}
          ${this.shouldShowForecast(showForecast)
        ? html`
            <clock-weather-card-forecast>
              ${safeRender(() => this.renderForecastByType())}
            </clock-weather-card-forecast>`
        : ''}
          ${this.config.forecast_type === 'bushfire_daily' && this.config.forecast_secondary_sensor_prefix
        ? safeRender(() => this.renderBushfireAlerts())
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

  private renderToday (): TemplateResult {
    if (this.config.forecast_type === 'rain_daily') {
      return this.renderTodayRain()
    }
    if (this.config.forecast_type === 'uv_daily') {
      return this.renderTodayUv()
    }
    if (this.config.forecast_type === 'bushfire_daily') {
      return this.renderTodayBushfire()
    }
    if (this.config.forecast_type === 'wind_daily') {
      return this.renderTodayWind()
    }
    return this.renderTodayTemp()
  }

  private renderTodayLayout (icon: string, topContent: TemplateResult | string, centerContent: TemplateResult | string): TemplateResult {
    return html`
      <clock-weather-card-today-left>
        <img class="grow-img" src=${icon} />
      </clock-weather-card-today-left>
      <clock-weather-card-today-right>
        <clock-weather-card-today-right-wrap>
          <clock-weather-card-today-right-wrap-top>
            ${topContent}
          </clock-weather-card-today-right-wrap-top>
          <clock-weather-card-today-right-wrap-center>
            ${centerContent}
          </clock-weather-card-today-right-wrap-center>
        </clock-weather-card-today-right-wrap>
      </clock-weather-card-today-right>`
  }

  private shouldShowForecast (showForecast: boolean): boolean {
    const type = this.config.forecast_type
    const prefix = this.config.forecast_sensor_prefix
    if (['rain_daily', 'uv_daily', 'bushfire_daily', 'wind_daily'].includes(type)) {
      return !!prefix
    }
    return showForecast
  }

  private renderForecastByType (): TemplateResult[] {
    switch (this.config.forecast_type) {
      case 'rain_daily': return this.renderRainForecast()
      case 'uv_daily': return this.renderUvForecast()
      case 'bushfire_daily': return this.renderBushfireForecast()
      case 'wind_daily': return this.renderWindForecast()
      default: return this.renderForecast()
    }
  }

  private getForecastWeatherState (forecast: MergedWeatherForecast | undefined, useIconState: boolean, fallback: string): string {
    const defaultState = forecast
      ? (forecast.precipitation > 10 ? 'raindrops' : forecast.precipitation > 0 ? 'raindrop' : forecast.condition === 'pouring' ? 'raindrops' : forecast.condition === 'rainy' ? 'raindrop' : forecast.condition)
      : fallback
    return useIconState ? this.getIconState(forecast?.condition ?? fallback) : defaultState
  }

  private getForecastLayout (maxRowsCount: number, hourly: boolean = false): {
    forecasts: MergedWeatherForecast[]
    displayTexts: string[]
    maxColOneChars: number
    minColChars: number
    maxColChars: number
  } {
    const forecasts = this.mergeForecasts(maxRowsCount, hourly)
    const displayTexts = forecasts
      .map(f => f.datetime)
      .map(d => hourly ? this.time(d) : this.localize(`day.${d.weekday}`))
    const maxColOneChars = this.getMaxColOneChars()
    const { minTemp, maxTemp } = this.getGlobalTempRange()
    const { minColChars, maxColChars } = this.getMaxTempChars(minTemp, maxTemp)
    return { forecasts, displayTexts, maxColOneChars, minColChars, maxColChars }
  }

  private renderBar (
    showBar: boolean,
    startPercent: number,
    endPercent: number,
    moveRight: number,
    gradient: string,
    dotValue: number | null,
    dotMin: number = 0,
    dotMax: number = 0
  ): TemplateResult {
    return html`
      <forecast-temperature-bar>
        <forecast-temperature-bar-background> </forecast-temperature-bar-background>
        ${showBar
          ? html`<forecast-temperature-bar-range
              style="--move-right: ${moveRight.toFixed(2)}; --start-percent: ${startPercent.toFixed(2)}%; --end-percent: ${endPercent.toFixed(2)}%; --gradient: ${gradient};"
            >
            </forecast-temperature-bar-range>`
          : ''}
        ${dotValue != null ? this.renderForecastCurrentTemp(dotMin, dotMax, dotValue) : ''}
      </forecast-temperature-bar>
    `
  }

  private enforceMinBarWidth (startPercent: number, endPercent: number, minPercent: number = 10): { startPercent: number, endPercent: number } {
    if (endPercent - startPercent < minPercent) {
      const mid = (startPercent + endPercent) / 2
      startPercent = Math.max(0, mid - minPercent / 2)
      endPercent = Math.min(100, startPercent + minPercent)
    }
    return { startPercent, endPercent }
  }

  private getForecastSuffixes (): string[] {
    switch (this.config.forecast_type) {
      case 'uv_daily': return ['category_', 'max_index_', 'start_time_', 'end_time_', 'forecast_']
      case 'bushfire_daily': return ['']
      case 'rain_daily': return ['amount_min_', 'amount_max_', 'chance_']
      case 'wind_daily': return ['speed_min_', 'speed_max_', 'dominant_direction_text_', 'dominant_direction_abbreviation_']
      default: return []
    }
  }

  private renderTodayTemp (): TemplateResult {
    const weather = this.getWeather()
    const state = weather.state
    const temp = this.config.show_decimal ? this.getCurrentTemperature() : roundIfNotNull(this.getCurrentTemperature())
    const tempUnit = weather.attributes.temperature_unit
    const apparentTemp = this.config.show_decimal ? this.getApparentTemperature() : roundIfNotNull(this.getApparentTemperature())
    const aqi = this.getAqi()
    const aqiBackgroundColor = this.getAqiBackgroundColor(aqi)
    const aqiTextColor = this.getAqiTextColor(aqi)
    const iconType = this.config.weather_icon_type
    const iconState = this.getIconState(state)
    const icon = this.toIcon(iconState, iconType, undefined, this.getIconAnimationKind())
    const weatherString = this.localize(`weather.${state}`)
    const localizedApparent = apparentTemp !== null ? this.toConfiguredTempWithUnit(tempUnit, apparentTemp) : null
    const apparentString = this.localize('misc.feels-like')
    const aqiString = this.localize('misc.aqi')

    const topContent = html`
      ${this.getTodayDescription(weatherString)}
      ${this.config.apparent_sensor && apparentTemp ? html`<br>${apparentString}: ${localizedApparent}` : ''}
      ${this.config.aqi_sensor && aqi !== null ? html`<br><aqi style="background-color: ${aqiBackgroundColor}; color: ${aqiTextColor};">${aqi} ${aqiString}</aqi>` : ''}
    `
    const centerContent = temp !== null
      ? html`<span class="today-value-wrap">${this.toConfiguredTempWithoutUnit(tempUnit, temp)}<span class="value-unit-large">${this.getConfiguredTemperatureUnit()}</span></span>`
      : 'n/a'

    return this.renderTodayLayout(icon, topContent, centerContent)
  }

  private renderTodayRain (): TemplateResult {
    const weather = this.getWeather()
    const state = weather.state
    const iconType = this.config.weather_icon_type
    const prefix = this.config.forecast_sensor_prefix
    const chance = prefix ? this.getNumericState(`${prefix}chance_0`) ?? 0 : 0
    const rainIconState = chance > 80 ? 'raindrops' : chance > 0 ? 'raindrop' : this.getIconState(state)
    const icon = this.toIcon(rainIconState, iconType, undefined, this.getIconAnimationKind())
    const currentRain = this.getCurrentValue('amount_max_0')

    const centerContent = currentRain !== null && currentRain > 0
      ? html`<span class="today-value-wrap">${currentRain} <span class="value-unit-large">mm</span></span>${this.config.today_value_secondary_sensor
          ? html`&nbsp; <span class="today-value-wrap">${this.getNumericState(this.config.today_value_secondary_sensor) ?? 0} <span class="value-unit-large">mm/h</span></span>`
          : ''}`
      : 'Nil'

    return this.renderTodayLayout(icon, this.getTodayDescription(this.getRainDescription(chance)), centerContent)
  }

  private getRainDescription (chance: number): string {
    const entry = RAIN_CHANCE_DESCRIPTIONS.find(([threshold]) => chance <= threshold) ?? RAIN_CHANCE_DESCRIPTIONS[RAIN_CHANCE_DESCRIPTIONS.length - 1]
    return `${entry[1]}\n${entry[2]}`
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
    const maxColOneChars = this.getMaxColOneChars(hourly)
    const { minColChars, maxColChars } = this.getMaxTempChars(minTemp, maxTemp)

    return forecasts.map((forecast, i) => safeRender(() => this.renderForecastItem(forecast, minTemp, maxTemp, currentTemp, temperatureUnit, hourly, displayTexts[i], maxColOneChars, minColChars, maxColChars)))
  }

  private renderForecastItem (forecast: MergedWeatherForecast, minTemp: number, maxTemp: number, currentTemp: number | null, temperatureUnit: TemperatureUnit, hourly: boolean, displayText: string, maxColOneChars: number, minColChars: number, maxColChars: number): TemplateResult {
    const isToday = DateTime.now().day === forecast.datetime.day
    const weatherState = this.getForecastWeatherState(forecast, isToday && !hourly, forecast.condition)
    const daytime: 'day' | 'night' | undefined = hourly ? (this.isHourDaytime(forecast.datetime.hour) ? 'day' : 'night') : 'day'
    const weatherIcon = this.toIcon(weatherState, 'fill', daytime, 'static')
    const tempUnit = this.getWeather().attributes.temperature_unit
    const isNow = hourly ? DateTime.now().hasSame(forecast.datetime, 'hour') : DateTime.now().day === forecast.datetime.day
    const showDot = isNow && !hourly
    const minTempDayRaw = Math.round(isNow && currentTemp !== null ? Math.min(currentTemp, forecast.templow) : forecast.templow)
    const maxTempDayRaw = Math.round(isNow && currentTemp !== null ? Math.max(currentTemp, forecast.temperature) : forecast.temperature)
    const minTempDay = Math.max(minTemp, Math.min(maxTemp, minTempDayRaw))
    const maxTempDay = Math.max(minTemp, Math.min(maxTemp, maxTempDayRaw))
    const clampedCurrentTemp = currentTemp !== null ? Math.max(minTemp, Math.min(maxTemp, Math.round(currentTemp))) : null

    return html`
      <clock-weather-card-forecast-row style="--col-one-size: ${(maxColOneChars * 0.5)}rem; --temp-col-size-min: ${(minColChars * 0.5)}rem; --temp-col-size-max: ${(maxColChars * 0.5)}rem;">
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
    const barRange = this.calculateBarRangePercents(minTemp, maxTemp, minTempDay, maxTempDay)
    const { startPercent, endPercent } = this.enforceMinBarWidth(barRange.startPercent, barRange.endPercent)
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

  private getCurrentValue (forecastSuffix?: string): number | null {
    if (this.config.today_value_sensor) {
      const val = this.getNumericState(this.config.today_value_sensor)
      if (val !== null) return val
    }
    if (forecastSuffix && this.config.forecast_sensor_prefix) {
      return this.getNumericState(`${this.config.forecast_sensor_prefix}${forecastSuffix}`)
    }
    return null
  }

  private renderRainForecast (): TemplateResult[] {
    const prefix = this.config.forecast_sensor_prefix
    if (!prefix) return []

    const maxRowsCount = this.config.forecast_rows

    const currentRain = this.config.today_value_sensor ? this.getNumericState(this.config.today_value_sensor) : null

    const rainDays: Array<{ min: number, max: number, chance: number }> = []
    for (let i = 0; i < maxRowsCount; i++) {
      const minVal = this.getNumericState(`${prefix}amount_min_${i}`)
      const maxVal = this.getNumericState(`${prefix}amount_max_${i}`)
      const chanceVal = this.getNumericState(`${prefix}chance_${i}`)
      rainDays.push({ min: minVal ?? 0, max: maxVal ?? 0, chance: chanceVal ?? 0 })
    }

    const globalMax = Math.max(...rainDays.map(d => d.max), currentRain ?? 0, 1)
    const { forecasts, displayTexts, maxColOneChars, minColChars, maxColChars } = this.getForecastLayout(maxRowsCount)

    return rainDays.map((day, i) => safeRender(() =>
      this.renderRainForecastItem(day, globalMax, forecasts[i], displayTexts[i] ?? '', maxColOneChars, minColChars, maxColChars, i === 0, currentRain)
    ))
  }

  private renderRainForecastItem (
    day: { min: number, max: number, chance: number },
    globalMax: number,
    forecast: MergedWeatherForecast | undefined,
    displayText: string,
    maxColOneChars: number,
    minColChars: number,
    maxColChars: number,
    isToday: boolean,
    currentRain: number | null
  ): TemplateResult {
    const weatherIcon = this.toIcon(this.getForecastWeatherState(forecast, isToday, 'rainy'), 'fill', 'day', 'static')
    const chanceText = `${Math.round(day.chance)}%`

    return html`
      <clock-weather-card-forecast-row style="--col-one-size: ${(maxColOneChars * 0.5)}rem; --temp-col-size-min: ${(minColChars * 0.5)}rem; --temp-col-size-max: ${(maxColChars * 0.5)}rem;">
        ${this.renderText(displayText)}
        ${this.renderIcon(weatherIcon)}
        ${this.renderText(chanceText, 'right')}
        ${this.renderRainBar(globalMax, day, isToday, currentRain)}
        <forecast-text>${day.max} <span class="value-unit">mm</span></forecast-text>
      </clock-weather-card-forecast-row>
    `
  }

  private renderRainBar (globalMax: number, day: { min: number, max: number, chance: number }, isToday: boolean, currentRain: number | null): TemplateResult {
    const showBar = day.chance > 0 && day.max > 0
    let { startPercent, endPercent } = this.calculateBarRangePercents(0, globalMax, day.min, day.max)
    if (showBar) ({ startPercent, endPercent } = this.enforceMinBarWidth(startPercent, endPercent))
    const moveRight = globalMax === 0 ? 0 : day.min / globalMax
    const gradient = this.createTwoColorGradientString(day.min, day.max, globalMax, new Rgb(174, 210, 230), new Rgb(40, 120, 180))
    return this.renderBar(showBar, startPercent, endPercent, moveRight, gradient, isToday ? currentRain : null, 0, globalMax)
  }

  private createTwoColorGradientString (dayMin: number, dayMax: number, globalMax: number, lightColor: Rgb, darkColor: Rgb): string {
    function interpolate (ratio: number): Rgb {
      return new Rgb(
        Math.round(lightColor.r + ratio * (darkColor.r - lightColor.r)),
        Math.round(lightColor.g + ratio * (darkColor.g - lightColor.g)),
        Math.round(lightColor.b + ratio * (darkColor.b - lightColor.b))
      )
    }

    const ratioMin = globalMax > 0 ? dayMin / globalMax : 0
    const ratioMax = globalMax > 0 ? dayMax / globalMax : 0
    const colorMin = interpolate(ratioMin)
    const colorMax = dayMin === dayMax ? colorMin : interpolate(ratioMax)
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
    const descriptionSensor = this.config.today_description_sensor ?? (this.config.forecast_type === 'uv_daily' && this.config.forecast_sensor_prefix ? `${this.config.forecast_sensor_prefix}forecast_0` : undefined)
    if (descriptionSensor) {
      text = this.getStringState(descriptionSensor) ?? (descriptionSensor.endsWith('_0') ? this.getStringState(descriptionSensor.replace(/_0$/, '_1')) : null) ?? fallback
    }
    text = text.trim().replace(/^\.+|\.+$/g, '').trim()
    if (this.config.forecast_type === 'uv_daily') {
      text = text.replace(/([Rr]ecommended)\s*/i, '$1\n')
    }
    if (text.length > 75) {
      text = text.split(',')[0].trim().replace(/^\.+|\.+$/g, '').trim()
    }
    if (text.length > 75) {
      text = text.substring(0, 72).trim().replace(/^\.+|\.+$/g, '').trim().replace(/[^a-zA-Z0-9]+$/, '') + ' ...'
    }
    if (text.length < 30 && !text.includes('\n')) {
      if (this.config.forecast_type === 'temp_daily') {
        const iconDescriptor = this.config.icon_descriptor_sensor ? this.getStringState(this.config.icon_descriptor_sensor) : null
        const descriptorKey = iconDescriptor ? iconDescriptor.trim().toLowerCase().replace(/\s+/g, '_') : text.split(',')[0].trim().toLowerCase().replace(/\s+/g, '_')
        const category = ICON_DESCRIPTOR_TO_CATEGORY[descriptorKey]
        const descriptorDescriptions = category ? ICON_DESCRIPTOR_CATEGORY_DESCRIPTIONS[category] : null
        const descriptorDescription = descriptorDescriptions ? descriptorDescriptions[this.getDescriptionIndex(category, descriptorDescriptions.length)] : null
        text = text.replace(/\.+$/, '')
        text += `\n${descriptorDescription ?? 'This weather is inscrutable, so do as Marsupalami would!'}`
      } else {
        text = text.replace(/\.+$/, '')
        if (this.config.forecast_type === 'rain_daily' && text.toLowerCase().includes('rain')) {
          text += "\nRain, rain, don't go away, we need you!"
        } else {
          text += '\nLooks good, have fun!'
        }
      }
    }
    const parts = text.split('\n')
    if (parts.length > 1) {
      return html`${parts[0]}<br>${parts.slice(1).join(' ')}`
    }
    return html`${text}`
  }

  private getDescriptionIndex (category: string, count: number): number {
    if (!this._descriptionIndexCache.has(category)) {
      const now = new Date()
      const daySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
      const sessionSalt = Math.floor(performance.timeOrigin)
      this._descriptionIndexCache.set(category, Math.abs(daySeed + sessionSalt) % count)
    }
    return this._descriptionIndexCache.get(category)!
  }

  private getStringState (entityId: string): string | null {
    const sensor = this.hass.states[entityId]
    if (sensor?.state && sensor.state !== 'unknown' && sensor.state !== 'unavailable') return sensor.state
    return null
  }

  private getNumericWithFallback (prefix: string, suffix: string, index: number): number | null {
    const val = this.getNumericState(`${prefix}${suffix}${index}`)
    if (val !== null) return val
    return index === 0 ? this.getNumericState(`${prefix}${suffix}1`) : null
  }

  private getStringWithFallback (prefix: string, suffix: string, index: number): string | null {
    const val = this.getStringState(`${prefix}${suffix}${index}`)
    if (val !== null) return val
    return index === 0 ? this.getStringState(`${prefix}${suffix}1`) : null
  }

  private renderTodayUv (): TemplateResult {
    const weather = this.getWeather()
    const state = weather.state
    const iconType = this.config.weather_icon_type
    const prefix = this.config.forecast_sensor_prefix ?? ''
    const category = this.getStringWithFallback(prefix, 'category_', 0) ?? 'n/a'
    const kind = this.getIconAnimationKind()
    const uvIconMap = kind === 'animated' ? uvIcons.animated : uvIcons.static
    const icon: string = uvIconMap[iconType]?.[category.toLowerCase()] ?? this.toIcon(this.getIconState(state), iconType, undefined, kind)

    return this.renderTodayLayout(icon, this.getTodayDescription(this.localize(`weather.${state}`)), category)
  }

  private renderUvForecast (): TemplateResult[] {
    const prefix = this.config.forecast_sensor_prefix
    if (!prefix) return []

    const maxRowsCount = this.config.forecast_rows

    const uvDays: Array<{ maxIndex: number, startHour: number, endHour: number, category: string }> = []
    for (let i = 0; i < maxRowsCount; i++) {
      const maxIndex = this.getNumericWithFallback(prefix, 'max_index_', i) ?? 0
      const startTimeStr = this.getStringWithFallback(prefix, 'start_time_', i)
      const endTimeStr = this.getStringWithFallback(prefix, 'end_time_', i)
      const category = this.getStringWithFallback(prefix, 'category_', i) ?? ''
      const startHour = startTimeStr ? DateTime.fromISO(startTimeStr).toLocal().hour : 6
      const endHour = endTimeStr ? Math.ceil(DateTime.fromISO(endTimeStr).toLocal().hour + DateTime.fromISO(endTimeStr).toLocal().minute / 60) : 18
      uvDays.push({ maxIndex, startHour: Math.max(6, startHour), endHour: Math.min(18, endHour), category })
    }

    const { forecasts, displayTexts, maxColOneChars, minColChars, maxColChars } = this.getForecastLayout(maxRowsCount)

    return uvDays.map((day, i) => safeRender(() =>
      this.renderUvForecastItem(day, forecasts[i], displayTexts[i] ?? '', maxColOneChars, minColChars, maxColChars, i === 0)
    ))
  }

  private renderUvForecastItem (
    day: { maxIndex: number, startHour: number, endHour: number, category: string },
    forecast: MergedWeatherForecast | undefined,
    displayText: string,
    maxColOneChars: number,
    minColChars: number,
    maxColChars: number,
    isToday: boolean
  ): TemplateResult {
    const weatherIcon = this.toIcon(this.getForecastWeatherState(forecast, isToday, 'sunny'), 'fill', 'day', 'static')
    const timeRange = `${day.startHour}–${day.endHour}`

    return html`
      <clock-weather-card-forecast-row style="--col-one-size: ${(maxColOneChars * 0.5)}rem; --temp-col-size-min: ${(minColChars * 0.5)}rem; --temp-col-size-max: ${(maxColChars * 0.5)}rem;">
        ${this.renderText(displayText)}
        ${this.renderIcon(weatherIcon)}
        ${this.renderText(timeRange, 'right')}
        ${this.renderUvBar(day.startHour, day.endHour, day.maxIndex, isToday)}
        <forecast-text>${day.maxIndex} UV</forecast-text>
      </clock-weather-card-forecast-row>
    `
  }

  private renderUvBar (startHour: number, endHour: number, maxIndex: number, isToday: boolean): TemplateResult {
    // UV < 3 (Low) shows just the empty base-blue track, like the rain bar at 0,
    // rather than a washed-out coloured fill.
    const showBar = maxIndex >= 3 && endHour > startHour
    const dotValue = isToday ? DateTime.now().hour + DateTime.now().minute / 60 : null
    const uvLevel = maxIndex <= 5 ? 2 : maxIndex <= 7 ? 3 : maxIndex <= 10 ? 4 : 5
    return this.renderBar(showBar, (startHour / 24) * 100, (endHour / 24) * 100, startHour / 24, this.solidGradient(this.getSeverityColor(uvLevel)), dotValue, 0, 24)
  }

  private getSeverityColor (level: number): Rgb {
    if (level <= 1) return new Rgb(255, 255, 255)
    if (level <= 2) return new Rgb(81, 207, 102)
    if (level <= 3) return new Rgb(255, 224, 102)
    if (level <= 4) return new Rgb(255, 192, 120)
    return new Rgb(248, 113, 113)
  }

  private solidGradient (color: Rgb): string {
    return `${color.toRgbString()} 0%, ${color.toRgbString()} 100%`
  }

  private renderTodayBushfire (): TemplateResult {
    const iconType = this.config.weather_icon_type
    const prefix = this.config.forecast_sensor_prefix ?? ''
    const rating = this.getStringState(`${prefix}0`) ?? 'n/a'
    const kind = this.getIconAnimationKind()
    const bushfireIconMap = kind === 'animated' ? bushfireIcons.animated : bushfireIcons.static
    const icon: string = bushfireIconMap[iconType]?.[rating.toLowerCase()] ?? this.toIcon(this.getIconState(this.getWeather().state), iconType, undefined, kind)

    return this.renderTodayLayout(
      icon,
      html`Bush fire risk is ${rating.toLowerCase()} today<br>${this.getBushfireInfo(rating).description}`,
      rating
    )
  }

  private getBushfireInfo (rating: string): { description: string, abbreviation: string, severityLevel: number } {
    const map: Record<string, { description: string, abbreviation: string, severityLevel: number }> = {
      'no rating': { description: 'Nothing to worry about!', abbreviation: 'NONE', severityLevel: 1 },
      moderate: { description: 'Plan and prepare', abbreviation: 'MOD', severityLevel: 2 },
      high: { description: 'Be ready to act', abbreviation: 'HIGH', severityLevel: 3 },
      extreme: { description: 'High vigilance, be ready to act', abbreviation: 'EXT', severityLevel: 4 },
      catastrophic: { description: 'High vigilance, consider leaving home', abbreviation: 'CAT', severityLevel: 5 }
    }
    return map[rating.toLowerCase()] ?? { description: '', abbreviation: '', severityLevel: 1 }
  }

  private renderBushfireForecast (): TemplateResult[] {
    const prefix = this.config.forecast_sensor_prefix
    if (!prefix) return []

    const maxRowsCount = this.config.forecast_rows

    const bushfireDays: Array<{ rating: string }> = []
    for (let i = 0; i < maxRowsCount; i++) {
      const rating = this.getStringState(`${prefix}${i}`) ?? ''
      bushfireDays.push({ rating })
    }

    const { forecasts, displayTexts, maxColOneChars, minColChars, maxColChars } = this.getForecastLayout(maxRowsCount)

    return bushfireDays.map((day, i) => safeRender(() =>
      this.renderBushfireForecastItem(day, forecasts[i], displayTexts[i] ?? '', maxColOneChars, minColChars, maxColChars, i === 0)
    ))
  }

  private renderBushfireForecastItem (
    day: { rating: string },
    forecast: MergedWeatherForecast | undefined,
    displayText: string,
    maxColOneChars: number,
    minColChars: number,
    maxColChars: number,
    isToday: boolean
  ): TemplateResult {
    const weatherIcon = this.toIcon(this.getForecastWeatherState(forecast, isToday, 'sunny'), 'fill', 'day', 'static')

    return html`
      <clock-weather-card-forecast-row style="--col-one-size: ${(maxColOneChars * 0.5)}rem; --temp-col-size-min: ${(minColChars * 0.5)}rem; --temp-col-size-max: ${(maxColChars * 0.5)}rem;">
        ${this.renderText(displayText)}
        ${this.renderIcon(weatherIcon)}
        ${this.renderText('∀ hrs', 'right')}
        ${this.renderBushfireBar(day.rating, isToday)}
        <forecast-text>${this.getBushfireInfo(day.rating).abbreviation}</forecast-text>
      </clock-weather-card-forecast-row>
    `
  }

  private renderBushfireBar (rating: string, isToday: boolean): TemplateResult {
    const info = this.getBushfireInfo(rating)
    const color = this.getSeverityColor(info.severityLevel)
    const showBar = rating.toLowerCase() !== 'no rating' && rating !== ''
    const dotValue = isToday ? DateTime.now().hour + DateTime.now().minute / 60 : null
    return this.renderBar(showBar, 0, 100, 0, this.solidGradient(color), dotValue, 0, 24)
  }

  private renderTodayWind (): TemplateResult {
    const weather = this.getWeather()
    const state = weather.state
    const iconType = this.config.weather_icon_type
    const prefix = this.config.forecast_sensor_prefix ?? ''
    const directionText = (this.getStringWithFallback(prefix, 'dominant_direction_text_', 0) ?? '').toLowerCase()
    const speedMax = this.getNumericWithFallback(prefix, 'speed_max_', 0) ?? 0
    const windIconState = speedMax >= 10 ? 'windy' : this.getIconState(state)
    const icon = this.toIcon(windIconState, iconType, undefined, this.getIconAnimationKind())
    const speedMin = this.getNumericWithFallback(prefix, 'speed_min_', 0) ?? 0
    const windDescription = `Winds ${directionText} today\nfrom ${Math.round(speedMin)} km/h to ${Math.round(speedMax)} km/h`
    const currentWind = this.getCurrentValue('speed_max_0')

    const centerContent = currentWind !== null
      ? html`<span class="today-value-wrap">${Math.round(currentWind)} <span class="value-unit-large">km/h</span></span>`
      : 'Nil'

    return this.renderTodayLayout(icon, this.getTodayDescription(windDescription), centerContent)
  }

  private renderWindForecast (): TemplateResult[] {
    const prefix = this.config.forecast_sensor_prefix
    if (!prefix) return []

    const maxRowsCount = this.config.forecast_rows

    const currentWind = this.config.today_value_sensor ? this.getNumericState(this.config.today_value_sensor) : null

    const windDays: Array<{ min: number, max: number, direction: string }> = []
    for (let i = 0; i < maxRowsCount; i++) {
      const minVal = this.getNumericWithFallback(prefix, 'speed_min_', i)
      const maxVal = this.getNumericWithFallback(prefix, 'speed_max_', i)
      const direction = this.getStringWithFallback(prefix, 'dominant_direction_abbreviation_', i) ?? ''
      windDays.push({ min: minVal ?? 0, max: maxVal ?? 0, direction })
    }

    const globalMax = Math.max(...windDays.map(d => d.max), currentWind ?? 0, 1)
    const { forecasts, displayTexts, maxColOneChars, minColChars, maxColChars } = this.getForecastLayout(maxRowsCount)

    return windDays.map((day, i) => safeRender(() =>
      this.renderWindForecastItem(day, globalMax, forecasts[i], displayTexts[i] ?? '', maxColOneChars, minColChars, maxColChars, i === 0, currentWind)
    ))
  }

  private renderWindForecastItem (
    day: { min: number, max: number, direction: string },
    globalMax: number,
    forecast: MergedWeatherForecast | undefined,
    displayText: string,
    maxColOneChars: number,
    minColChars: number,
    maxColChars: number,
    isToday: boolean,
    currentWind: number | null
  ): TemplateResult {
    const weatherIcon = this.toIcon(this.getForecastWeatherState(forecast, isToday, 'sunny'), 'fill', 'day', 'static')
    return html`
      <clock-weather-card-forecast-row style="--col-one-size: ${(maxColOneChars * 0.5)}rem; --temp-col-size-min: ${(minColChars * 0.5)}rem; --temp-col-size-max: ${(maxColChars * 0.5)}rem;">
        ${this.renderText(displayText)}
        ${this.renderIcon(weatherIcon)}
        <forecast-text style="text-align: right;">${Math.round(day.max)} <span class="value-unit">km/h</span></forecast-text>
        ${this.renderWindBar(globalMax, day.min, day.max, isToday, currentWind)}
        ${this.renderText(day.direction)}
      </clock-weather-card-forecast-row>
    `
  }

  private renderWindBar (globalMax: number, dayMin: number, dayMax: number, isToday: boolean, currentWind: number | null): TemplateResult {
    const showBar = dayMax > 0
    let { startPercent, endPercent } = this.calculateBarRangePercents(0, globalMax, dayMin, dayMax)
    if (showBar) ({ startPercent, endPercent } = this.enforceMinBarWidth(startPercent, endPercent))
    const moveRight = globalMax === 0 ? 0 : dayMin / globalMax
    const gradient = this.createTwoColorGradientString(dayMin, dayMax, globalMax, new Rgb(174, 230, 190), new Rgb(40, 140, 60))
    return this.renderBar(showBar, startPercent, endPercent, moveRight, gradient, isToday ? currentWind : null, 0, globalMax)
  }

  private renderBushfireAlerts (): TemplateResult {
    const entityId = this.config.forecast_secondary_sensor_prefix
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
          <clock-weather-card-today-right-wrap>
            <clock-weather-card-today-right-wrap-top>
              <a href="https://www.emergency.wa.gov.au/?view=both" style="color: var(--primary-text-color);" @click=${(e: Event) => { e.preventDefault(); e.stopPropagation(); window.open('https://www.emergency.wa.gov.au/?view=both', '_blank') }}>DFES Emergency Warnings</a><br>Bushfire within 30km of home
            </clock-weather-card-today-right-wrap-top>
            <clock-weather-card-today-right-wrap-center>
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
      today_value_sensor: config.today_value_sensor ?? undefined,
      weather_icon_type: config.weather_icon_type ?? 'line',
      forecast_rows: config.forecast_rows ?? 5,
      forecast_type: this.resolveForecastType(config),
      hide_current_hourly_forecast: config.hide_current_hourly_forecast ?? false,
      animated_icon: config.animated_icon ?? true,
      time_format: config.time_format?.toString() as '12' | '24' | undefined,
      time_pattern: config.time_pattern ?? undefined,
      hide_forecast_section: config.hide_forecast_section ?? false,
      hide_today_section: config.hide_today_section ?? false,
      use_browser_time: config.use_browser_time ?? false,
      time_zone: config.time_zone ?? undefined,
      show_decimal: config.show_decimal ?? false,
      apparent_sensor: config.apparent_sensor ?? undefined,
      aqi_sensor: config.aqi_sensor ?? undefined,
      temperature_sensor_min: config.temperature_sensor_min ?? undefined,
      temperature_sensor_max: config.temperature_sensor_max ?? undefined,
      today_value_secondary_sensor: config.today_value_secondary_sensor ?? undefined,
      forecast_sensor_prefix: config.forecast_sensor_prefix ? (config.forecast_sensor_prefix.endsWith('_') ? config.forecast_sensor_prefix : `${config.forecast_sensor_prefix}_`) : undefined,
      forecast_secondary_sensor_prefix: config.forecast_secondary_sensor_prefix ?? undefined,
      icon_descriptor_sensor: config.icon_descriptor_sensor ?? undefined
    }
  }

  private resolveForecastType (config: ClockWeatherCardConfig): ForecastType {
    if (config.forecast_type) return config.forecast_type
    if (config.hourly_forecast) return 'temp_hourly'
    return 'temp_daily'
  }

  private getIconState (state: string): string {
    const iconDescriptor = this.config.icon_descriptor_sensor ? this.getStringState(this.config.icon_descriptor_sensor) : null
    const iconDescriptorKey = iconDescriptor ? iconDescriptor.trim().toLowerCase().replace(/\s+/g, '_') : null
    if (iconDescriptorKey && ICON_DESCRIPTOR_TO_WEATHER_STATE[iconDescriptorKey]) {
      return ICON_DESCRIPTOR_TO_WEATHER_STATE[iconDescriptorKey]
    }
    return this.getWeatherStateWithRainOverride(state)
  }

  private getWeatherStateWithRainOverride (state: string): string {
    const forecasts = this.mergeForecasts(1, false)
    const todayForecast = forecasts[0]
    if (todayForecast && todayForecast.precipitation > 10) {
      return 'raindrops'
    }
    if (todayForecast && todayForecast.precipitation > 0) {
      return 'raindrop'
    }
    return state
  }

  private toIcon (weatherState: string, type: 'fill' | 'line', daytimeOverride: 'day' | 'night' | undefined, kind: 'static' | 'animated'): string {
    const daytime = daytimeOverride ?? (this.getSun()?.state === 'below_horizon' ? 'night' : 'day')
    const iconMap = kind === 'animated' ? animatedIcons : staticIcons
    const icon = iconMap[type][weatherState]
    return icon?.[daytime] || icon
  }

  private getWeather (): Weather {
    const weather = this.hass.states[this.config.entity] as Weather | undefined
    if (!weather) {
      throw this.createError(`Weather entity "${this.config.entity}" could not be found.`)
    }
    return weather
  }

  private getCurrentTemperature (): number | null {
    if (this.config.today_value_sensor) {
      const temperatureSensor = this.hass.states[this.config.today_value_sensor] as TemperatureSensor | undefined
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

  private getMaxColOneChars (hourly = false): number {
    if (hourly) {
      return this.time(DateTime.now()).length
    }
    const dayLengths = [1, 2, 3, 4, 5, 6, 7].map(d => this.localize(`day.${d}`).length)
    const baseTimeLength = DateTime.now().toFormat('HH:mm').length
    return Math.max(...dayLengths, baseTimeLength)
  }

  private getMaxTempChars (minTemp: number, maxTemp: number): { minColChars: number, maxColChars: number } {
    const forecastType = this.config.forecast_type

    const prefix = this.config.forecast_sensor_prefix

    if (forecastType === 'rain_daily' && prefix) {
      const maxSamples: number[] = []
      for (let i = 0; i < this.config.forecast_rows; i++) {
        const maxVal = this.getNumericState(`${prefix}amount_max_${i}`) ?? 0
        maxSamples.push(`${maxVal} mm`.length)
      }
      const unit = this.getConfiguredTemperatureUnit()
      const tempSamples = [minTemp, maxTemp, -minTemp, -maxTemp].map(t => `${t}${unit}`.length)
      const tempChars = Math.max(...tempSamples)
      return { minColChars: Math.max('100%'.length, tempChars), maxColChars: Math.max(...maxSamples) }
    }

    if (forecastType === 'uv_daily' && prefix) {
      const minSamples: number[] = []
      const maxSamples: number[] = []
      for (let i = 0; i < this.config.forecast_rows; i++) {
        const maxIndex = this.getNumericState(`${prefix}max_index_${i}`) ?? 0
        const startTimeStr = this.getStringState(`${prefix}start_time_${i}`)
        const endTimeStr = this.getStringState(`${prefix}end_time_${i}`)
        const startHour = startTimeStr ? DateTime.fromISO(startTimeStr).toLocal().hour : 6
        const endHour = endTimeStr ? Math.ceil(DateTime.fromISO(endTimeStr).toLocal().hour + DateTime.fromISO(endTimeStr).toLocal().minute / 60) : 18
        const timeRange = `${Math.max(6, startHour)}–${Math.min(18, endHour)}`
        minSamples.push(timeRange.length)
        maxSamples.push(`${maxIndex} UV`.length)
      }
      return { minColChars: Math.max(...minSamples), maxColChars: Math.max(...maxSamples) }
    }

    if (forecastType === 'bushfire_daily' && prefix) {
      const maxSamples: number[] = ['NONE', 'MOD', 'HIGH', 'EXT', 'CAT'].map(s => s.length)
      return { minColChars: '∀ hrs'.length, maxColChars: Math.max(...maxSamples) }
    }

    if (forecastType === 'wind_daily' && prefix) {
      const minSamples: number[] = []
      const maxSamples: number[] = []
      for (let i = 0; i < this.config.forecast_rows; i++) {
        const maxVal = this.getNumericWithFallback(prefix, 'speed_max_', i) ?? 0
        const direction = this.getStringWithFallback(prefix, 'dominant_direction_abbreviation_', i) ?? ''
        minSamples.push(`${Math.round(maxVal)} km/h`.length)
        maxSamples.push(direction.length)
      }
      return { minColChars: Math.max(...minSamples), maxColChars: Math.max(...maxSamples) }
    }

    const unit = this.getConfiguredTemperatureUnit()
    const tempSamples = [minTemp, maxTemp, -minTemp, -maxTemp].map(t => `${t}${unit}`.length)
    const chars = Math.max(...tempSamples)
    return { minColChars: chars, maxColChars: chars }
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
