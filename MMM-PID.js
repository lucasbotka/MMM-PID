/* MagicMirror²
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
    updateInterval: 60000, // 1 minute
    showIcons: true
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
    return ["pid.css", "font-awesome.css"];
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
                return "fas fa-bus"; // Unknown
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

          const departuresTable = document.createElement("table");
          departuresTable.className = "pid-departures-table";

          filteredDepartures.forEach(departure => {
            const row = document.createElement("tr");

            // Icon
            const iconCell = document.createElement("td");
            iconCell.className = "pid-icon";
            if (this.config.showIcons) {
              const icon = document.createElement("i");
              icon.className = getIconForRouteType(departure.route.type);
              iconCell.appendChild(icon);
            }
            row.appendChild(iconCell);

            // Line Name
            const lineCell = document.createElement("td");
            lineCell.className = "pid-line-name";
            lineCell.innerHTML = departure.route.short_name;
            row.appendChild(lineCell);

            // Minutes until departure
            const minutesCell = document.createElement("td");
            minutesCell.className = "pid-minutes";
            minutesCell.innerHTML = `<span class="departs-in-text">departs in </span>${departure.departure_timestamp.minutes}&nbsp;min`;
            row.appendChild(minutesCell);

            // Departure Time
            const timeCell = document.createElement("td");
            timeCell.className = "pid-departure-time";
            const departureTime = new Date(departure.departure_timestamp.estimated || departure.departure_timestamp.scheduled).toLocaleTimeString("cs-CZ", { hour: '2-digit', minute: '2-digit' });
            timeCell.innerHTML = departureTime;
            row.appendChild(timeCell);

            // Delay
            const delayCell = document.createElement("td");
            delayCell.className = "pid-delay";
            const delayInMinutes = Math.round(departure.delay.seconds / 60);
            if (delayInMinutes > 0) {
              delayCell.innerHTML = `+${delayInMinutes}`;
            }
            row.appendChild(delayCell);

            departuresTable.appendChild(row);
          });
          stopWrapper.appendChild(departuresTable);
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