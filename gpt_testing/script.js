// Initialize map
const map = L.map("map").setView([0, 0], 2); // Default center

// Add OpenStreetMap tiles
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
	attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// User location marker
let userMarker = null;

// Watch user's location
if ("geolocation" in navigator) {
	navigator.geolocation.watchPosition(
		(position) => {
			const { latitude, longitude } = position.coords;
			const userLatLng = [latitude, longitude];

			if (!userMarker) {
				var leafletIcon = L.icon({
					iconUrl:
						"https://cv-of-arman.netlify.app/arman_office.jpeg",
					shadowUrl:
						"https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
					iconSize: [25, 41], // size of the icon
					shadowSize: [41, 41], // size of the shadow
					iconAnchor: [12, 41], // point of the icon which will correspond to marker's location
					shadowAnchor: [12, 41], // the same for the shadow
					popupAnchor: [1, -34], // point from which the popup should open relative to the iconAnchor
					tooltipAnchor: [16, -28], // point from which the tooltip should open relative to the iconAnchor
				});
				let bounds = L.latLngBounds(
					L.latLng(-90, -180),
					L.latLng(90, 180)
				);
				userMarker = L.marker(userLatLng, { icon: leafletIcon })
					.addTo(map)
					.bindPopup("You are here")
					.openPopup();
				map.setView(userLatLng, 15);

				// Zoom in on first update
				var circle = L.circle(userLatLng, {
					color: "red",
					fillColor: "#f03",
					fillOpacity: 0.5,
					radius: 10, // 1 km radius
				}).addTo(map);
				// var polygon = L.polygon([
				// 	userLatLng,
				// 	[userLatLng[0] + 0.01, userLatLng[1]],
				// 	[userLatLng[0], userLatLng[1] + 0.01],
				// 	[userLatLng[0] - 0.01, userLatLng[1]],
				// ]).addTo(map);
				// polygon.bindPopup("You are here");
			} else {
				userMarker.setLatLng(userLatLng);
			}
		},
		(error) => {
			console.error("Error getting location", error);
			alert("Location access denied or unavailable.");
		},
		{
			enableHighAccuracy: true,
		}
	);
} else {
	alert("Geolocation is not supported by your browser.");
}
