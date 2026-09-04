/* MagicMirror²
 * Module: MMM-PID
 *
 * By Lukas Botka
 * MIT Licensed.
 */

// Floor for updateInterval - a typo like 60 (meant as seconds) would otherwise poll hundreds of times a second
const MIN_UPDATE_INTERVAL = 30000
const DEFAULT_MAX_DEPARTURES = 5

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
          const stopWrapper = document.createElement("div")
          stopWrapper.className = "pid-stop"

          const stopName = document.createElement("div")
          stopName.className = "pid-stop-name"
          // GTFS names are heavily abbreviated - customName lets the user override them, blank falls back to the API
          const customName = typeof stop.customName === "string" ? stop.customName.trim() : ""
          stopName.textContent = customName || (stopData.stops.length > 0 ? stopData.stops[0].stop_name : stop.aswIds)
          stopWrapper.appendChild(stopName)

          const departuresTable = document.createElement("table")
          departuresTable.className = "pid-departures-table"

          filteredDepartures.forEach((departure) => {
            const row = document.createElement("tr")

            // Icon
            if (this.config.showIcons) {
              const iconCell = document.createElement("td")
              iconCell.className = "pid-icon"
              const icon = document.createElement("i")
              icon.className = this.getIconForRouteType(departure.route.type)
              iconCell.appendChild(icon)
              row.appendChild(iconCell)
            }

            // Line Name
            const lineCell = document.createElement("td")
            lineCell.className = "pid-line-name"
            lineCell.textContent = departure.route.short_name
            row.appendChild(lineCell)

            // Wheelchair
            if (this.config.showWheelchairIcon) {
              const wheelchairCell = document.createElement("td")
              wheelchairCell.className = "pid-wheelchair"
              if (departure.trip.is_wheelchair_accessible) {
                const icon = document.createElement("i")
                icon.className = "fas fa-wheelchair"
                wheelchairCell.appendChild(icon)
              }
              row.appendChild(wheelchairCell)
            }

            // Air conditioning
            if (this.config.showAirConditionedIcon) {
              const acCell = document.createElement("td")
              acCell.className = "pid-air-conditioned"
              if (departure.trip.is_air_conditioned) {
                const icon = document.createElement("i")
                icon.className = "fas fa-snowflake"
                acCell.appendChild(icon)
              }
              row.appendChild(acCell)
            }

            // Minutes until departure
            const minutesCell = document.createElement("td")
            minutesCell.className = "pid-minutes"
            const departsSpan = document.createElement("span")
            departsSpan.className = "departs-in-text"
            departsSpan.textContent = `${this.translate("DEPARTS_IN")} `
            minutesCell.appendChild(departsSpan)
            minutesCell.appendChild(document.createTextNode(`${departure.departure_timestamp.minutes} ${this.translate("MINUTES")}`))
            row.appendChild(minutesCell)

            // Departure Time
            const timeCell = document.createElement("td")
            timeCell.className = "pid-departure-time"
            const departureTime = new Date(departure.departure_timestamp.scheduled).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })
            timeCell.textContent = departureTime
            row.appendChild(timeCell)

            // Delay
            const delayCell = document.createElement("td")
            delayCell.className = "pid-delay"
            if (departure.delay.is_available && departure.delay.minutes > 0) {
              delayCell.textContent = `+${departure.delay.minutes}`
            }
            row.appendChild(delayCell)

            departuresTable.appendChild(row)
          })
          stopWrapper.appendChild(departuresTable)
          wrapper.appendChild(stopWrapper)
        }
      }
    })

    if (!somethingRendered) {
      wrapper.textContent = this.translate("NO_DEPARTURES")
      wrapper.className = "dimmed light small"
    }

    return wrapper
  },
})
