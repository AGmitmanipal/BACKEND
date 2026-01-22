use("parkingappDB");

const ZONE_NAME = "Block 18";
const PARTS = 10;

// 🔹 Zone polygon — DIRECT coordinates (no modification)
const polygon = [
  { lat: 13.352828, lng: 74.792427 },
  { lat: 13.352828, lng: 74.792606 },
  { lat: 13.352969, lng: 74.792606 },
  { lat: 13.352969, lng: 74.792427 }
];

// 🔹 Center (already computed earlier)
const CENTER = {
  lat: 13.3528985,
  lng: 74.7925165
};

// ---------------- BOUNDS ----------------
const lats = polygon.map(p => p.lat);
const lngs = polygon.map(p => p.lng);

const minLat = Math.min(...lats);
const maxLat = Math.max(...lats);
const minLng = Math.min(...lngs);
const maxLng = Math.max(...lngs);

// ---------------- SLOT DIVISION ----------------
// Vertical strips (no resize)
const slotWidth = (maxLng - minLng) / PARTS;
const slots = [];

for (let i = 0; i < PARTS; i++) {
  const lngStart = minLng + i * slotWidth;
  const lngEnd = lngStart + slotWidth;

  slots.push({
    slotId: `slot-${i + 1}`,
    index: i,
    tag: `P${i + 1}`,

    polygon: [
      { lat: minLat, lng: lngStart },
      { lat: minLat, lng: lngEnd },
      { lat: maxLat, lng: lngEnd },
      { lat: maxLat, lng: lngStart }
    ],

    status: "free",
    occupiedBy: null,

    prebookedBy: null,
    prebookedFrom: null,
    prebookedTo: null,

    lastUpdated: new Date()
  });
}

// ---------------- INSERT ----------------
db.parkingzones.insertOne({
  name: "Block 18",
  polygon: [
    { lat: 13.346766, lng: 74.794271 }, // bottom-left
    { lat: 13.346766, lng: 74.794721 }, // bottom-right
    { lat: 13.347216, lng: 74.794721 }, // top-right
    { lat: 13.347216, lng: 74.794271 }  // top-left
  ]
  ,
  capacity: 50,
  available: 50,
  isActive: true,

  createdAt: new Date(),
  updatedAt: new Date()
});

print(`✅ Zone "${ZONE_NAME}" inserted with original coordinates and ${PARTS} slots`);
