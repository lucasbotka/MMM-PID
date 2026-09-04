const NodeHelper = require("node_helper")

module.exports = NodeHelper.create({
  start: function () {
    console.log("Starting node helper for: " + this.name)
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "GET_DEPARTURES") {
      this.getData(payload)
    }
  },

  getData: async function (config) {
    const API_KEY = config.apiKey

    const url = new URL("https://api.golemio.cz/v2/pid/departureboards/")
    const params = new URLSearchParams({
      aswIds: config.aswIds,
      filter: "none",
      // client-side allowed_routes filtering needs the full window - 100 is the API cap, higher values silently return 100
      limit: 100,
      minutesAfter: config.minutesAfter,
    })
    params.append("skip[]", "atStop")
    params.append("skip[]", "canceled")
    url.search = params.toString()

    try {
      const response = await fetch(url, {
        headers: {
          "x-access-token": API_KEY,
        },
        signal: AbortSignal.timeout(15000),
      })

      if (!response.ok) {
        let message = `HTTP ${response.status}`
        let details = null
        try {
          const body = await response.json()
          if (body.error_message) {
            message += ` – ${body.error_message}`
          }
          // error_info names the offending query parameter - too noisy for the mirror, kept for the log
          if (body.error_info) {
            details = typeof body.error_info === "string" ? body.error_info : JSON.stringify(body.error_info)
          }
        } catch {
          // body was not JSON, status alone will do
        }
        const error = new Error(message)
        error.status = response.status
        error.details = details
        throw error
      }

      const data = await response.json()
      this.sendSocketNotification("DEPARTURES_DATA", { identifier: config.identifier, aswIds: config.aswIds, data: data })
    } catch (error) {
      console.error(`Error fetching data for ${config.aswIds}: `, error)
      this.sendSocketNotification("FETCH_ERROR", { identifier: config.identifier, aswIds: config.aswIds, error: error.message, status: error.status })
    }
  },
})
