const express = require("express");
const mongoose = require("mongoose");
const app = express();
const cors = require("cors");
require("dotenv").config();
const Zone = require("./models/Zone");
const bookingRouter = require("./routes/book");
const { reserveRouter, startReservationCron } = require("./routes/reserve");
const Reservation = require("./models/Reservation");

// Auth Imports
const { requireAuth, requireApprovedUser } = require("./middleware/auth");
const authRouter = require("./routes/auth");
const adminRouter = require("./routes/admin");

app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`📨 [${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health Check (Public)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// MongoDB Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connected");

    // Start cron jobs
    startReservationCron();
    console.log("📅 Reservation expiry cron started");
  } catch (err) {
    console.error("❌ Mongo connection error:", err);
    process.exit(1);
  }
};

connectDB();

// --- ROUTES ---

// 1. Auth & Admin Routes (Protected by their own internal checks)
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);

// 2. Business Logic Routes (Protected + Require Approval)

// Mount booking router
app.use("/api/book", requireAuth, requireApprovedUser, bookingRouter);

// GET ZONES (Protected)
app.get("/", requireAuth, requireApprovedUser, async (req, res) => {
  try {
    // 1. Fetch Zones
    const zones = await Zone.find({ isActive: true }).sort({ name: 1 }).lean();

    // 2. Fetch ALL Active Reservations (booked = pre-bookings, reserved = active parking)
    const activeReservations = await Reservation.find({
      status: { $in: ["booked", "reserved"] },
    }).lean();

    const response = zones.map((zone) => {
      // Filter reservations for this zone
      const zoneRes = activeReservations.filter(r => r.zoneId.toString() === zone._id.toString());

      // ================= PRODUCTION AUDIT: STRICT STATE SEPARATION =================
      // 1. "booked" = Pre-booking (future intent) → affects booked count only
      // 2. "reserved" = Active parking → affects reserved count only
      // 3. Availability = capacity - reserved - booked (never negative, never exceed capacity)
      // 4. All counts are based on Reservation.status, NOT time windows
      //    (Time-based transitions are handled by cron job)

      // Count by status (strict separation)
      const reservedCount = zoneRes.filter(r => r.status === "reserved").length;
      const bookedCount = zoneRes.filter(r => r.status === "booked").length;

      // Calculate availability: capacity - reserved - booked
      // Enforce: never negative, never exceed capacity
      const available = Math.max(0, Math.min(zone.capacity || 0, (zone.capacity || 0) - reservedCount - bookedCount));

      return {
        _id: zone._id,
        name: zone.name || "Unnamed Zone",
        polygon: zone.polygon || [],

        // Return explicit counts (backend-provided, single source of truth)
        capacity: zone.capacity || 0,
        available: available,

        // Computed stats (strict state separation)
        reserved: reservedCount,  // Active parking (status === "reserved")
        prebooked: bookedCount,   // Future pre-bookings (status === "booked")
      };
    });

    res.json(response);
  } catch (err) {
    console.error("❌ GET / ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Mount reserve router (Protected)
// Note: reserveRouter likely has sub-routes. We apply middleware here.
app.use("/", requireAuth, requireApprovedUser, reserveRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend server listening on http://localhost:${PORT}`);
});
