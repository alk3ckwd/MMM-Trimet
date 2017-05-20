/* global Module */

/* Magic Mirror
 * Module: WeatherForecast
 *
 * By Michael Teeuw http://michaelteeuw.nl
 * MIT Licensed.
 */

Module.register("Trimet",{

	// Default module config.
	defaults: {
		appID: "",
		maxNumberOfBuses: 7,
		updateInterval: 60 * 1000, // every 1 minute
		animationSpeed: 1000,
		timeFormat: config.timeFormat,
		fade: true,
		fadePoint: 0.25, // Start on 1/4th of the list.

		initialLoadDelay: 2500, // 2.5 seconds delay. This delay is used to keep the OpenWeather API happy.
		retryDelay: 2500,

		apiVersion: "V1",
		apiBase: "https://developer.trimet.org/ws/",
		arrivalsEndpoint: "arrivals",

		calendarClass: "calendar"

	},

	// create a variable for the first upcoming calendaar event. Used if no location is specified.
	firstEvent: false,

	// create a variable to hold the location name based on the API result.
	fetchedLocatioName: "",

	// Define required scripts.
	getScripts: function() {
		return ["moment.js"];
	},
	// Define required scripts.
	getStyles: function() {
		return ["Trimet.css"];
	},
	// Define required translations.
	getTranslations: function() {
		// The translations for the defaut modules are defined in the core translation files.
		// Therefor we can just return false. Otherwise we should have returned a dictionairy.
		// If you're trying to build yiur own module including translations, check out the documentation.
		return false;
	},

	// Define start sequence.
	start: function() {
		Log.info("Starting module: " + this.name);

		// Set locale.
		moment.locale(this.config.language);

		this.arrival = [];
		this.loaded = false;
		this.scheduleUpdate(this.config.initialLoadDelay);

		this.updateTimer = null;

	},

	// Override dom generator.
	getDom: function() {
		var wrapper = document.createElement("div");

		if (this.config.appid === "") {
			wrapper.innerHTML = "Please set the correct Trimet <i>appid</i> in the config for module: " + this.name + ".";
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		if (!this.loaded) {
			wrapper.innerHTML = this.translate("LOADING");
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		var table = document.createElement("table");
		table.className = "small";

		for (var f in this.arrival) {
			var arrival = this.arrival[f];

			var row = document.createElement("tr");
			table.appendChild(row);

			var busCell = document.createElement("td");
			busCell.className = "bus";
			busCell.innerHTML = arrival.bus;
			row.appendChild(busCell);

			var timeCell = document.createElement("td");
			timeCell.innerHTML = arrival.time;
			timeCell.className = "timeCell";
			row.appendChild(timeCell);

			var locCell = document.createElement("td");
			locCell.className = "loc";
			locCell.innerHTML = arrival.loc;
			row.appendChild(locCell);

			if (this.config.fade && this.config.fadePoint < 1) {
				if (this.config.fadePoint < 0) {
					this.config.fadePoint = 0;
				}
				var startingPoint = this.arrival.length * this.config.fadePoint;
				var steps = this.arrival.length - startingPoint;
				if (f >= startingPoint) {
					var currentStep = f - startingPoint;
					row.style.opacity = 1 - (1 / steps * currentStep);
				}
			}

		}

		return table;
	},

	// Override getHeader method.
	getHeader: function() {
		if (this.config.appendLocationNameToHeader) {
			return this.data.header + " " + this.fetchedLocatioName;
		}

		return this.data.header;
	},

	// Override notification handler.
	notificationReceived: function(notification, payload, sender) {
		if (notification === "DOM_OBJECTS_CREATED") {
			if (this.config.appendLocationNameToHeader) {
				this.hide(0, {lockString: this.identifier});
			}
		}
		if (notification === "CALENDAR_EVENTS") {
			var senderClasses = sender.data.classes.toLowerCase().split(" ");
			if (senderClasses.indexOf(this.config.calendarClass.toLowerCase()) !== -1) {
				var lastEvent =  this.firstEvent;
				this.firstEvent = false;

				for (e in payload) {
					var event = payload[e];
					if (event.location || event.geo) {
						this.firstEvent = event;
						//Log.log("First upcoming event with location: ", event);
						break;
					}
				}
			}
		}
	},

	/* updateWeather(compliments)
	 * Requests new data from openweather.org.
	 * Calls processWeather on succesfull response.
	 */
	updateArrivals: function() {
		if (this.config.appid === "") {
			Log.error("Trimet: APPID not set!");
			return;
		}

		var url = this.config.apiBase + this.config.apiVersion + "/" + this.config.arrivalsEndpoint + this.getParams();

		Log.info(url);
		var self = this;
		var retry = true;

		var ArrivalRequest = new XMLHttpRequest();
		ArrivalRequest.open("GET", url, true);
		ArrivalRequest.onreadystatechange = function() {
			if (this.readyState === 4) {
				if (this.status === 200) {
					self.processArrivals(JSON.parse(this.response));
				} else if (this.status === 401) {
					self.updateDom(self.config.animationSpeed);

					Log.error(self.name + ": Incorrect APPID.");
					retry = true;
				} else {
					Log.error(self.name + ": Could not load arrivals.");
				}

				if (retry) {
					self.scheduleUpdate((self.loaded) ? -1 : self.config.retryDelay);
				}
			}
		};
		ArrivalRequest.send();
	},

	/* getParams(compliments)
	 * Generates an url with api parameters based on the config.
	 *
	 * return String - URL params.
	 */
	getParams: function() {
		var params = "?";
		params += "&json=" + this.config.json;
		params += "&locIDs=" + this.config.locIDs;
		params += "&appID=" + this.config.appID;
		return params;
	},

	/* processWeather(data)
	 * Uses the received data to set the various values.
	 *
	 * argument data object - Weather information received form openweather.org.
	 */
	processArrivals: function(data) {
		this.fetchedLocatioName = data.resultSet.location.desc + ", " + data.resultSet.location.dir;

		this.arrival = [];
		for (var i = 0, count = data.resultSet.arrival.length; i < count; i++) {

			var arrival = data.resultSet.arrival[i];
			this.arrival.push({
				loc: this.getStopName(arrival.locid, data.resultSet.location),
				bus: this.formatRoute(arrival.route),
				time: moment(this.setArrivalTime(arrival.scheduled, arrival.estimated)).fromNow(),
				//scheduled: moment(arrival.scheduled).fromNow(),
				//estimated: moment(arrival.estimated).fromNow()

			});
		}

		this.show(this.config.animationSpeed, {lockString:this.identifier});
		this.loaded = true;
		this.updateDom(this.config.animationSpeed);
	},
	setArrivalTime: function(shed, est){
		if (est){
			return est;
		}
			return shed;
	},

	getStopName: function(locid, locs){
			for (var i = 0, count = locs.length; i < count; i++){
				if (locid == locs[i].locid){
					return locs[i].desc;
				}
			}
	},

	formatRoute: function(route){
		if (route == 190){
			return "MAX";
		}
		return route;
	},
	/* scheduleUpdate()
	 * Schedule next update.
	 *
	 * argument delay number - Milliseconds before next update. If empty, this.config.updateInterval is used.
	 */
	scheduleUpdate: function(delay) {
		var nextLoad = this.config.updateInterval;
		if (typeof delay !== "undefined" && delay >= 0) {
			nextLoad = delay;
		}

		var self = this;
		clearTimeout(this.updateTimer);
		this.updateTimer = setTimeout(function() {
			self.updateArrivals();
		}, nextLoad);
	},

});
