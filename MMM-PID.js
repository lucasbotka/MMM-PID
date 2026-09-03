/* MagicMirror²
 * Module: MMM-PID
 *
 * By Lukas Botka
 * MIT Licensed.
 */

// Floor for updateInterval - a typo like 60 (meant as seconds) would otherwise poll hundreds of times a second
const MIN_UPDATE_INTERVAL = 30000

Module.register("MMM-PID", {
  defaults: {
    apiKey: "YOUR_GOLEMIO_API_KEY",
    stops: [
      {
        aswIds: "1973_2",
        allowed_routes: [],
        maxDepartures: 5,
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
      this.configError = true
      return
    }
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
      delete this.errors[payload.aswIds]
      this.departures[payload.aswIds] = payload.data
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
      wrapper.textContent = this.translate("NO_API_KEY")
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
        if (stop.allowed_routes && stop.allowed_routes.length > 0) {
          filteredDepartures = filteredDepartures.filter(dep => stop.allowed_routes.includes(dep.route.short_name))
        }

        filteredDepartures = filteredDepartures.slice(0, stop.maxDepartures ?? 5)

        if (filteredDepartures.length > 0) {
          somethingRendered = true
          const stopWrapper = document.createElement("div")
          stopWrapper.className = "pid-stop"

          const stopName = document.createElement("div")
          stopName.className = "pid-stop-name"
          stopName.textContent = (stopData.stops && stopData.stops.length > 0) ? stopData.stops[0].stop_name : stop.aswIds
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
