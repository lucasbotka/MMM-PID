const NodeHelper = require("node_helper");
const fetch = require("node-fetch");

module.exports = NodeHelper.create({
  start: function() {
    console.log("Starting node helper for: " + this.name);
  },

  socketNotificationReceived: function(notification, payload) {
    if (notification === "GET_DEPARTURES") {
      this.getData(payload);
    }
  },

  getData: async function(config) {

    const API_KEY = config.apiKey;
    
    const query_params = {
      aswIds: config.aswIds,
      filter: 'none',
      limit: 10, 
      skip: 'atStop',
      minutesAfter: config.minutesAfter || 160
    };

    const url = new URL("https://api.golemio.cz/v2/pid/departureboards/");
    Object.keys(query_params).forEach(key => url.searchParams.append(key, query_params[key]));

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'x-access-token': API_KEY,
          'Content-Type': 'application/json; charset=utf-8'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.sendSocketNotification("DEPARTURES_DATA", { aswIds: config.aswIds, data: data });
    } catch (error) {
      console.error("Error fetching data: ", error);
      this.sendSocketNotification("FETCH_ERROR", { error: error.message });
    }
  }
});
