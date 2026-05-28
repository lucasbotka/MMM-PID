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
    url.search = new URLSearchParams({
      aswIds: config.aswIds,
      filter: "none",
      limit: 20,
      skip: "atStop",
      minutesAfter: config.minutesAfter || 160,
    }).toString()

    try {
      const response = await fetch(url, {
        headers: {
          "x-access-token": API_KEY,
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      this.sendSocketNotification("DEPARTURES_DATA", { aswIds: config.aswIds, data: data })
    } catch (error) {
      console.error("Error fetching data: ", error)
      this.sendSocketNotification("FETCH_ERROR", { aswIds: config.aswIds, error: error.message })
    }
  },
})
