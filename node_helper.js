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
      limit: 30,
      minutesAfter: config.minutesAfter || 160,
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
        try {
          const body = await response.json()
          if (body.error_message) {
            message += ` – ${body.error_message}`
          }
        } catch {
          // body was not JSON, status alone will do
        }
        const error = new Error(message)
        error.status = response.status
        throw error
      }

      const data = await response.json()
      this.sendSocketNotification("DEPARTURES_DATA", { aswIds: config.aswIds, data: data })
    } catch (error) {
      console.error("Error fetching data: ", error)
      this.sendSocketNotification("FETCH_ERROR", { aswIds: config.aswIds, error: error.message, status: error.status })
    }
  },
})
