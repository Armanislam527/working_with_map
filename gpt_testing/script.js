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
				userMarker = L.marker(userLatLng)
					.addTo(map)
					.bindPopup("You are here")
					.openPopup();
				map.setView(userLatLng, 15); // Zoom in on first update
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
