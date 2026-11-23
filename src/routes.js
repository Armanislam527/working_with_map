// ---------------------------------------------------------------------------
// Bangladesh Railway route boilerplate.
//
// Each route is a polyline of [lon, lat] waypoints following a real BR
// corridor. Trains travel along the segments in order at the speed defined
// for that segment (km/h). Speeds may be a single number (applies to every
// segment) or an array matching the segments. Set `loop: true` to wrap the
// train back to the start.
//
// `stations` marks named points of interest. `at` is either a waypoint index
// or a distance in km along the route.
//
// NOTE: waypoints are approximate alignments of the corridors — good enough
// for simulation. For production accuracy, snap them to real track geometry
// (e.g. from OpenStreetMap railway=rail ways or BR GIS data).
// ---------------------------------------------------------------------------

export const DEFAULT_SPEED_KMH = 80;

export const SAMPLE_ROUTES = [
  {
    id: 'dhaka-chattogram',
    name: 'Dhaka – Chattogram Main Line',
    color: '#2563eb',
    loop: false,
    // Subarna Express / Chattogram Mail corridor via Bhairab Bazar & Akhaura.
    waypoints: [
      [90.4125, 23.8103], // Dhaka (Kamlapur / Airport side)
      [90.6200, 23.9500], // Tongi – Bhairab approach
      [90.9800, 24.0600], // Bhairab Bazar
      [91.2500, 23.8400], // Akhaura
      [91.1800, 23.4600], // Comilla
      [91.4500, 22.9000], // Chauddagram – Fatikchhari
      [91.8300, 22.3600], // Chattogram
    ],
    speeds: [60, 100, 110, 90, 100, 110, 60],
    stations: [
      { name: 'Dhaka', at: 0 },
      { name: 'Bhairab Bazar', at: 2 },
      { name: 'Akhaura', at: 3 },
      { name: 'Comilla', at: 4 },
      { name: 'Chattogram', at: 6 },
    ],
  },
  {
    id: 'dhaka-rajshahi',
    name: 'Dhaka – Rajshahi Line',
    color: '#dc2626',
    loop: false,
    // Sonar Bangla Express corridor via Tarabo, Ishurdi & Natore.
    waypoints: [
      [90.4125, 23.8103], // Dhaka
      [90.3300, 23.9200], // Tongi
      [90.0700, 23.9700], // Tarabo
      [89.9000, 24.0500], // Paksey
      [89.0300, 24.1700], // Ishurdi
      [88.9800, 24.4000], // Natore
      [88.6000, 24.3700], // Rajshahi
    ],
    speeds: [50, 100, 90, 110, 100, 80, 50],
    stations: [
      { name: 'Dhaka', at: 0 },
      { name: 'Tarabo', at: 2 },
      { name: 'Ishurdi', at: 4 },
      { name: 'Natore', at: 5 },
      { name: 'Rajshahi', at: 6 },
    ],
  },
  {
    id: 'dhaka-khulna',
    name: 'Dhaka – Khulna Line',
    color: '#16a34a',
    loop: false,
    // Tungan / Padma Express corridor via Jhenaidah & Bagerhat.
    waypoints: [
      [90.4125, 23.8103], // Dhaka
      [90.2000, 23.7000], // Narsingdi side
      [89.9500, 23.6000], // Madaripur side
      [89.6700, 23.5500], // Jhenaidah
      [89.7000, 23.2000], // Dacope side
      [89.7800, 22.9000], // Bagerhat approach
      [89.5500, 22.8100], // Khulna
    ],
    speeds: [60, 100, 110, 100, 100, 90, 50],
    stations: [
      { name: 'Dhaka', at: 0 },
      { name: 'Jhenaidah', at: 3 },
      { name: 'Bagerhat', at: 5 },
      { name: 'Khulna', at: 6 },
    ],
  },
  {
    id: 'dhaka-chilahati',
    name: 'Dhaka – Chilahati (Sayedpur) Line',
    color: '#9333ea',
    loop: false,
    // Northern line via Joydebpur, Parbatipur, Sayedpur & Dinajpur.
    waypoints: [
      [90.4125, 23.8103], // Dhaka
      [90.4200, 23.9800], // Joydebpur
      [90.1000, 24.3000], // Mymensingh side
      [89.5000, 24.7000], // Baghbandi side
      [88.7500, 25.3900], // Parbatipur
      [89.0200, 25.7500], // Sayedpur
      [88.6300, 25.6200], // Dinajpur
      [88.1900, 25.9800], // Chilahati
    ],
    speeds: [50, 80, 90, 90, 100, 90, 90, 60, 40],
    stations: [
      { name: 'Dhaka', at: 0 },
      { name: 'Joydebpur', at: 1 },
      { name: 'Parbatipur', at: 4 },
      { name: 'Sayedpur', at: 5 },
      { name: 'Dinajpur', at: 6 },
      { name: 'Chilahati', at: 7 },
    ],
  },
  {
    id: 'chattogram-sylhet',
    name: 'Chattogram – Sylhet Line',
    color: '#ea580c',
    loop: false,
    // Via Feni, Kulaura, Shah Poran & Shah Bazar.
    waypoints: [
      [91.8300, 22.3600], // Chattogram
      [91.6000, 23.0000], // Feni approach
      [91.7700, 24.1600], // Kulaura
      [91.8300, 24.4000], // Shah Poran side
      [91.8600, 24.6500], // Shah Bazar approach
      [91.8700, 24.8900], // Sylhet
    ],
    speeds: [60, 100, 90, 90, 80, 50],
    stations: [
      { name: 'Chattogram', at: 0 },
      { name: 'Feni', at: 1 },
      { name: 'Kulaura', at: 2 },
      { name: 'Sylhet', at: 5 },
    ],
  },
  {
    id: 'dhaka-mymensingh',
    name: 'Dhaka – Mymensingh Line',
    color: '#0891b2',
    loop: false,
    // Via Bhawal & Gouripur.
    waypoints: [
      [90.4125, 23.8103], // Dhaka
      [90.4300, 24.0000], // Joydebpur
      [90.3800, 24.2500], // Bhawal side
      [90.3000, 24.5000], // Gouripur side
      [90.4100, 24.7500], // Mymensingh
    ],
    speeds: [60, 80, 90, 90, 50],
    stations: [
      { name: 'Dhaka', at: 0 },
      { name: 'Joydebpur', at: 1 },
      { name: 'Mymensingh', at: 4 },
    ],
  },
];
