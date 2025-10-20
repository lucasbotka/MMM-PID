/* Magic Mirror
 * Module: MMM-PID
 *
 * By Lukas Botka
 * MIT Licensed.
 */

Module.register("MMM-PID", {
  defaults: {
    apiKey: "YOUR_GOLEMIO_API_KEY",
    stops: [
      {
        aswIds: '1973_2',
        allowed_routes: [],
        maxDepartures: 5
      }
    ],
    minutesAfter: 160,
    updateInterval: 60000 // 1 minute
  },

  start: function() {
    this.departures = {};
    this.error = null;
    this.getDepartures();
    setInterval(() => {
      this.getDepartures();
    }, this.config.updateInterval);
  },

  getStyles: function() {
    return ["pid.css", "font-awesome.css"]; // Add font-awesome
  },

  getDepartures: function() {
    this.config.stops.forEach(stop => {
      this.sendSocketNotification("GET_DEPARTURES", {
        apiKey: this.config.apiKey,
        aswIds: stop.aswIds,
        minutesAfter: this.config.minutesAfter
      });
    });
  },

  socketNotificationReceived: function(notification, payload) {
    if (notification === "DEPARTURES_DATA") {
      this.error = null;
      this.departures[payload.aswIds] = payload.data;
      this.updateDom();
    } else if (notification === "FETCH_ERROR") {
      this.error = `API Error: ${payload.error}`;
      this.updateDom();
    }
  },

  getDom: function() {
    const wrapper = document.createElement("div");
    wrapper.className = "pid-departures";

    if (this.error) {
      wrapper.innerHTML = this.error;
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    if (Object.keys(this.departures).length === 0) {
      wrapper.innerHTML = "Loading departures...";
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    let departuresRendered = false;

    const getIconForRouteType = (routeType) => {
        switch (routeType) {
            case 0:
                return "fas fa-train-tram"; // Tram
            case 1:
                return "fas fa-train-subway"; // Metro
            case 2:
                return "fas fa-train"; // Train
            case 3:
                return "fas fa-bus-simple"; // Bus
            default:
                return "fas fa-question-circle"; // Unknown
        }
    };

    this.config.stops.forEach(stop => {
      const stopData = this.departures[stop.aswIds];
      if (stopData && stopData.departures) {

        let filteredDepartures = stopData.departures;
        if (stop.allowed_routes && stop.allowed_routes.length > 0) {
          filteredDepartures = filteredDepartures.filter(dep => stop.allowed_routes.includes(dep.route.short_name));
        }
        
        filteredDepartures = filteredDepartures.slice(0, stop.maxDepartures || 5);

        if (filteredDepartures.length > 0) {
          departuresRendered = true;
          const stopWrapper = document.createElement("div");
          stopWrapper.className = "pid-stop";

          const stopName = document.createElement("div");
          stopName.className = "pid-stop-name";
          stopName.innerHTML = (stopData.stops && stopData.stops.length > 0) ? stopData.stops[0].stop_name : stop.aswIds;
          stopWrapper.appendChild(stopName);

          const departuresList = document.createElement("ul");
          departuresList.className = "pid-departures-list";

          filteredDepartures.forEach(departure => {
            const listItem = document.createElement("li");
            const minutes = departure.departure_timestamp.minutes;
            const departureTime = new Date(departure.departure_timestamp.estimated || departure.departure_timestamp.scheduled).toLocaleTimeString("cs-CZ", { hour: '2-digit', minute: '2-digit' });
            const delay = departure.delay.seconds > 0 ? `<span class="pid-delay">+${Math.round(departure.delay.seconds / 60)}&nbsp;min</span>` : "";
            
            const iconClass = getIconForRouteType(departure.route.type);

            // Add the Font Awesome icon here
            listItem.innerHTML = `<i class="${iconClass}"></i> <span class="pid-line-name">Line ${departure.route.short_name}</span> in <span class="pid-minutes">${minutes}</span> min (at ${departureTime}) ${delay}`;
            departuresList.appendChild(listItem);
          });
          stopWrapper.appendChild(departuresList);
          wrapper.appendChild(stopWrapper);
        }
      }
    });

    if (!departuresRendered) {
      wrapper.innerHTML = "No departures matching your criteria.";
      wrapper.className = "dimmed light small";
    }

    return wrapper;
  }
});