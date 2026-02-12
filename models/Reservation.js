const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema(
  {
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "parkingzones",
      required: true,
    },

    userId: {
      type: String,
      required: true,
    },

    fromTime: {
      type: Date,
      required: true,
    },

    toTime: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["expired", "cancelled", "booked", "reserved"],
      default: "booked",
      // booked: Pre-booking (future intent) → affects booked count only
      // reserved: Active parking → affects reserved count only
      // expired: Reservation/pre-booking expired (toTime < now)
      // cancelled: User cancelled the reservation/pre-booking
    },
    parkedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Model name "Reservation" maps to "reservations" collection (Mongoose pluralizes) in parkingappDB database
const Reservation = mongoose.model("Reservation", reservationSchema);

// STRICT CONSTRAINT: A user can have only ONE active action per zone at any time.
// This enforces: one active pre-booking OR reservation per zone per user.
// We use a partial unique index to enforce this at the database level.
// This prevents race conditions where two simultaneous requests could create duplicate bookings.
Reservation.collection.createIndex(
  { userId: 1, zoneId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["booked", "reserved"] }
    },
    background: true
  }
).catch(err => {
  console.warn("⚠️ Warning: Could not create unique index on Reservations. This might be because of existing duplicate data.", err.message);
});

// OPTIMIZATION INDEX: Supports the dashboard aggregation query (group by zoneId + status)
Reservation.collection.createIndex(
  { zoneId: 1, status: 1 },
  { background: true }
).catch(err => console.error("Index Error:", err));

module.exports = Reservation;
