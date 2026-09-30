/* MagicMirror²
 * Module: MMM-PID
 *
 * By Lukas Botka
 * MIT Licensed.
 */

// Floor for updateInterval - a typo like 60 (meant as seconds) would otherwise poll hundreds of times a second
const MIN_UPDATE_INTERVAL = 30000
const DEFAULT_MAX_DEPARTURES = 5
// Pinned to Prague - a mirror running in UTC (e.g. Docker) would otherwise shift every departure time
const TIME_FORMAT = new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" })

Module.register("MMM-PID", {
  defaults: {
    apiKey: "YOUR_GOLEMIO_API_KEY",
    stops: [
      {
        aswIds: "1973_2",
        allowed_routes: [],
        maxDepartures: DEFAULT_MAX_DEPARTURES,
      },
    ],
    minutesAfter: 160,
    updateInterval: 60000, // 1 minute
    showIcons: true,
    showWheelchairIcon: false,
    showAirConditionedIcon: false,
  },

  start: function () {
    this.departures = {}
    this.errors = {}
    this.authError = null
    this.lastFetch = 0
    this.config.updateInterval = this.sanitizedUpdateInterval()
    if (!this.config.apiKey || this.config.apiKey === "YOUR_GOLEMIO_API_KEY") {
      this.configError = "NO_API_KEY"
      return
    }
    const stops = this.sanitizedStops()
    if (stops.length === 0) {
      this.configError = "NO_STOPS"
      return
    }
    this.config.stops = stops
    this.getDepartures()
    this.scheduleUpdates()
  },

  sanitizedUpdateInterval: function () {
    const interval = Number(this.config.updateInterval)
    if (!Number.isFinite(interval)) {
      Log.warn(`${this.name}: updateInterval is not a number, falling back to ${this.defaults.updateInterval} ms`)
      return this.defaults.updateInterval
    }
    if (interval < MIN_UPDATE_INTERVAL) {
      Log.warn(`${this.name}: updateInterval ${this.config.updateInterval} is below the ${MIN_UPDATE_INTERVAL} ms minimum, clamping`)
      return MIN_UPDATE_INTERVAL
    }
    return interval
  },

  // Poll-ready copies of the configured stops - getDom() runs often, so normalize once here
  sanitizedStops: function () {
    const raw = Array.isArray(this.config.stops) ? this.config.stops : []
    const stops = raw
      .filter(s => s && typeof s === "object" && String(s.aswIds ?? "").trim())
      .map(s => ({ ...s, aswIds: String(s.aswIds).trim(), maxDepartures: this.sanitizedMaxDepartures(s) }))
    if (stops.length < raw.length) {
      Log.warn(`${this.name}: dropped ${raw.length - stops.length} stops without a usable aswIds`)
    }
    return stops
  },

  // Guards the slice() in getDom() - 0 hides the stop on purpose, anything below it is a config mistake
  sanitizedMaxDepartures: function (stop) {
    if (stop.maxDepartures === undefined || stop.maxDepartures === null) {
      return DEFAULT_MAX_DEPARTURES
    }
    const max = Math.floor(Number(stop.maxDepartures))
    if (!Number.isFinite(max) || max < 0) {
      Log.warn(`${this.name}: maxDepartures for ${stop.aswIds} is not a positive number, using ${DEFAULT_MAX_DEPARTURES}`)
      return DEFAULT_MAX_DEPARTURES
    }
    return max
  },

  scheduleUpdates: function (delay) {
    this.updateTimer = setTimeout(() => {
      this.getDepartures()
      this.scheduleUpdates()
    }, delay ?? this.config.updateInterval)
  },

  stopUpdates: function () {
    clearTimeout(this.updateTimer)
    this.updateTimer = null
  },

  suspend: function () {
    this.stopUpdates()
  },

  resume: function () {
    if (this.configError || this.authError) {
      return
    }
    this.stopUpdates()
    // show() fires resume() even on a module that was never hidden - refetch only stale data
    const age = Date.now() - this.lastFetch
    if (age >= this.config.updateInterval) {
      this.getDepartures()
      this.scheduleUpdates()
    } else {
      this.scheduleUpdates(this.config.updateInterval - age)
    }
  },

  getStyles: function () {
    return ["pid.css", "font-awesome.css"]
  },

  getTranslations: function () {
    return {
      cs: "translations/cs.json",
      en: "translations/en.json"
    }
  },

  getDepartures: function () {
    this.lastFetch = Date.now()
    this.config.stops.forEach((stop) => {
      this.sendSocketNotification("GET_DEPARTURES", {
        identifier: this.identifier,
        apiKey: this.config.apiKey,
        aswIds: stop.aswIds,
        minutesAfter: this.config.minutesAfter,
      })
    })
  },

  socketNotificationReceived: function (notification, payload) {
    // The node helper broadcasts to every instance of this module, so drop
    // anything that was not requested by this one.
    if (!payload || payload.identifier !== this.identifier) {
      return
    }

    if (notification === "DEPARTURES_DATA") {
      const board = this.sanitizeBoard(payload.data)
      if (board) {
        delete this.errors[payload.aswIds]
        this.departures[payload.aswIds] = board
      } else {
        this.errors[payload.aswIds] = this.translate("BAD_RESPONSE")
      }
      this.updateDom()
    } else if (notification === "FETCH_ERROR") {
      if (payload.status === 401 || payload.status === 403) {
        // The key is shared by every stop, so retrying cannot help - stop polling.
        this.authError = this.translate("AUTH_ERROR", { status: payload.status })
        this.stopUpdates()
      } else if (payload.status === 404) {
        this.errors[payload.aswIds] = this.translate("STOP_NOT_FOUND", { aswIds: payload.aswIds })
      } else {
        this.errors[payload.aswIds] = this.translate("API_ERROR") + payload.error
      }
      this.updateDom()
    }
  },

  // Third-party input: keep only departures carrying every object getDom() dereferences
  sanitizeBoard: function (data) {
    const raw = Array.isArray(data?.departures) ? data.departures : null
    if (!raw) {
      return null
    }
    const departures = raw.filter(d => d && d.route && d.trip && d.delay && d.departure_timestamp)
    if (raw.length > 0 && departures.length === 0) {
      return null
    }
    if (departures.length < raw.length) {
      Log.warn(`${this.name}: dropped ${raw.length - departures.length} malformed departures`)
    }
    return { stops: Array.isArray(data.stops) ? data.stops.filter(s => s && s.stop_name) : [], departures }
  },

  getIconForRouteType: function (routeType) {
    switch (routeType) {
      case 0:
        return "fas fa-train-tram" // Tram
      case 1:
        return "fas fa-train-subway" // Metro
      case 2:
        return "fas fa-train" // Train
      case 3:
        return "fas fa-bus-simple" // Bus
      case 4:
        return "fas fa-ferry" // Ferry
      case 7:
        return "fas fa-cable-car" // Funicular
      case 11:
        // Font Awesome has no trolleybus glyph - the detailed bus stands in for the plain one used by buses
        return "fas fa-bus" // Trolleybus
      default:
        return "fas fa-bus" // Unknown
    }
  },

  getDom: function () {
    const wrapper = document.createElement("div")
    wrapper.className = "pid-departures"

    if (this.configError) {
      wrapper.textContent = this.translate(this.configError)
      wrapper.className = "dimmed light small"
      return wrapper
    }

    if (this.authError) {
      wrapper.textContent = this.authError
      wrapper.className = "dimmed light small"
      return wrapper
    }

    if (Object.keys(this.departures).length === 0 && Object.keys(this.errors).length === 0) {
      wrapper.textContent = this.translate("LOADING")
      wrapper.className = "dimmed light small"
      return wrapper
    }

    let somethingRendered = false

    this.config.stops.forEach((stop) => {
      if (this.errors[stop.aswIds]) {
        const errorDiv = document.createElement("div")
        errorDiv.className = "dimmed light small"
        errorDiv.textContent = this.errors[stop.aswIds]
        wrapper.appendChild(errorDiv)
        somethingRendered = true
        return
      }

      const stopData = this.departures[stop.aswIds]
      if (stopData && stopData.departures) {
        let filteredDepartures = stopData.departures
        // Config may hold numbers, a bare string or stray whitespace - compare as normalized text
        const routes = [].concat(stop.allowed_routes ?? []).map(r => String(r).trim().toUpperCase()).filter(Boolean)
        if (routes.length > 0) {
          filteredDepartures = filteredDepartures.filter(dep => routes.includes(String(dep.route.short_name).toUpperCase()))
        }

        filteredDepartures = filteredDepartures.slice(0, stop.maxDepartures)

        if (filteredDepartures.length > 0) {
          somethingRendered = true
          wrapper.appendChild(this.renderStop(stop, stopData, filteredDepartures))
        }
      }
    })

    if (!somethingRendered) {
      wrapper.textContent = this.translate("NO_DEPARTURES")
      wrapper.className = "dimmed light small"
    }

    return wrapper
  },

  renderStop: function (stop, stopData, departures) {
    const stopWrapper = document.createElement("div")
    stopWrapper.className = "pid-stop"

    const stopName = document.createElement("div")
    stopName.className = "pid-stop-name"
    // One mode icon per stop - on a single platform every departure shares it
    if (this.config.showIcons) {
      const icon = document.createElement("i")
      icon.className = this.getIconForRouteType(departures[0].route.type)
      stopName.appendChild(icon)
    }
    // GTFS names are heavily abbreviated - customName lets the user override them, blank falls back to the API
    const customName = typeof stop.customName === "string" ? stop.customName.trim() : ""
    stopName.appendChild(document.createTextNode(customName || (stopData.stops.length > 0 ? stopData.stops[0].stop_name : stop.aswIds)))
    stopWrapper.appendChild(stopName)

    departures.forEach((departure) => {
      stopWrapper.appendChild(this.renderDeparture(departure))
    })
    return stopWrapper
  },

  renderDeparture: function (departure) {
    const row = document.createElement("div")
    row.className = "pid-departure"

    const lineCell = document.createElement("div")
    lineCell.className = "pid-line-name"
    lineCell.textContent = departure.route.short_name
    row.appendChild(lineCell)

    const destinationCell = document.createElement("div")
    destinationCell.className = "pid-destination-cell"
    const destination = document.createElement("span")
    destination.className = "pid-destination"
    destination.textContent = departure.trip.headsign ?? ""
    destinationCell.appendChild(destination)

    if (this.config.showWheelchairIcon && departure.trip.is_wheelchair_accessible) {
      destinationCell.appendChild(this.createIcon("fas fa-wheelchair"))
    }
    if (this.config.showAirConditionedIcon && departure.trip.is_air_conditioned) {
      destinationCell.appendChild(this.createIcon("fas fa-snowflake"))
    }

    const delayMinutes = departure.delay.is_available ? Math.round(departure.delay.minutes) : 0
    if (delayMinutes > 0) {
      const delayBadge = document.createElement("span")
      delayBadge.className = "pid-delay"
      delayBadge.textContent = this.translate("DELAY", { minutes: delayMinutes })
      destinationCell.appendChild(delayBadge)
    }
    row.appendChild(destinationCell)

    // Time and countdown share one timestamp, otherwise a delayed row would contradict itself
    const timestamp = departure.departure_timestamp
    const departsAt = new Date(timestamp.predicted || timestamp.scheduled)

    const timeCell = document.createElement("div")
    timeCell.className = "pid-time"
    timeCell.textContent = Number.isNaN(departsAt.getTime()) ? "" : TIME_FORMAT.format(departsAt)
    row.appendChild(timeCell)

    const minutesCell = document.createElement("div")
    minutesCell.className = "pid-minutes"
    const minutesValue = document.createElement("span")
    minutesValue.className = "pid-minutes-value"
    minutesValue.textContent = Number.isNaN(departsAt.getTime()) ? timestamp.minutes : Math.max(0, Math.round((departsAt.getTime() - Date.now()) / 60000))
    minutesCell.appendChild(minutesValue)
    const minutesUnit = document.createElement("span")
    minutesUnit.className = "pid-minutes-unit"
    minutesUnit.textContent = this.translate("MINUTES")
    minutesCell.appendChild(minutesUnit)
    row.appendChild(minutesCell)

    return row
  },

  createIcon: function (className) {
    const icon = document.createElement("i")
    icon.className = className
    return icon
  },
})
