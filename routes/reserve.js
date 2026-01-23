const express = require("express");
const mongoose = require("mongoose");
const cron = require("node-cron");
const Reservation = require("../models/Reservation");
const Zone = require("../models/Zone");

const router = express.Router();
let cronStarted = false;

function startReservationCron() {
  if (cronStarted) return;
  cronStarted = true;

  // ================= CRON JOB =================
  // Runs every minute to:
  // 1. Expire "reserved" (active) reservations when time window ends
  // 2. Expire "booked" (future) reservations when time window ends
  cron.schedule("* * * * *", async () => {
    const now = new Date();
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      // (Transition logic removed: bookings no longer auto-convert to active reservations)

      // ================= EXPIRE: reserved → expired =================
      // When reservation time window ends, mark as expired
      const expiredReservations = await Reservation.find({
        status: "reserved",
        toTime: { $lt: now }
      }).session(session);

      if (expiredReservations.length > 0) {
        console.log(`♻️ Expiring ${expiredReservations.length} reservations...`);
        await Reservation.updateMany(
          {
            _id: { $in: expiredReservations.map(r => r._id) },
            status: "reserved",
            toTime: { $lt: now }
          },
          { $set: { status: "expired" } },
          { session }
        );
      }

      // ================= EXPIRE: booked → expired =================
      // Pre-bookings that never activated (expired before fromTime was reached)
      const expiredBookings = await Reservation.find({
        status: "booked",
        toTime: { $lt: now }
      }).session(session);

      if (expiredBookings.length > 0) {
        console.log(`♻️ Expiring ${expiredBookings.length} pre-bookings that never activated...`);
        await Reservation.updateMany(
          {
            _id: { $in: expiredBookings.map(r => r._id) },
            status: "booked",
            toTime: { $lt: now }
          },
          { $set: { status: "expired" } },
          { session }
        );
      }

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      console.error("❌ Cron error:", err);
    } finally {
      session.endSession();
    }
  });
}

// ================= GET USER BOOKINGS =================
router.get("/reserve/book", async (req, res) => {
  const userId = req.query.userId || req.query.email;
  if (!userId) {
    return res.status(400).json({ message: "userId required" });
  }

  try {
    const bookings = await Reservation.find({ userId }).sort({ toTime: -1 });
    const detailed = await Promise.all(bookings.map(async b => {
      const z = await Zone.findById(b.zoneId).select("name");
      return {
        ...b.toObject(),
        zoneName: z ? z.name : "Unknown Zone"
      };
    }));
    res.json(detailed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load bookings" });
  }
});

// ================= CREATE PRE-BOOKING =================
// Pre-bookings are future intent, marked as "booked" status, count as "prebooked"
router.post("/prebook", async (req, res) => {
  const { userId, zoneId, fromTime, toTime } = req.body;

  if (!userId || !zoneId || !fromTime || !toTime) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const start = new Date(fromTime);
  const end = new Date(toTime);
  const now = new Date();

  if (start >= end) {
    return res.status(400).json({ message: "Invalid time range" });
  }

  // Pre-bookings must be for future time
  if (start.getTime() <= now.getTime()) {
    return res.status(400).json({
      message: "Pre-bookings must be for future time. Use /reserve for immediate reservations."
    });
  }

  // Use MongoDB session for atomic transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const zone = await Zone.findById(zoneId).session(session);
    if (!zone) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Zone not found" });
    }

    // ================= ENFORCE ONE ACTIVE ACTION PER ZONE =================
    const existing = await Reservation.findOne({
      userId,
      zoneId,
      status: { $in: ["booked", "reserved"] }
    }).session(session);

    if (existing) {
      await session.abortTransaction();
      return res.status(409).json({
        message: "You already have an active pre-booking or reservation in this zone."
      });
    }

    // ================= CAPACITY CHECK =================
    const overlappingReservations = await Reservation.countDocuments({
      zoneId: zoneId,
      status: { $in: ["reserved", "booked"] },
      $and: [
        { fromTime: { $lt: end } },
        { toTime: { $gt: start } }
      ]
    }).session(session);

    const totalReserved = await Reservation.countDocuments({
      zoneId: zoneId,
      status: "reserved"
    }).session(session);

    const totalBooked = await Reservation.countDocuments({
      zoneId: zoneId,
      status: "booked"
    }).session(session);

    const overallAvailable = Math.max(0, zone.capacity - totalReserved - totalBooked);

    if (overlappingReservations >= zone.capacity) {
      await session.abortTransaction();
      return res.status(409).json({
        message: "Zone is fully booked for this time range."
      });
    }

    if (overallAvailable <= 0) {
      await session.abortTransaction();
      return res.status(409).json({
        message: "Zone is fully booked. No available spots."
      });
    }

    // ================= CREATE PRE-BOOKING =================
    // Pre-bookings are marked as "booked" status, count as "prebooked"
    const newPreBooking = new Reservation({
      userId,
      zoneId,
      fromTime: start,
      toTime: end,
      status: "booked", // Pre-booking status
      parkedAt: undefined // No parkedAt for pre-bookings
    });

    await newPreBooking.save({ session });
    await session.commitTransaction();

    res.json({
      message: "Pre-booking confirmed. Your reservation will activate at the scheduled time.",
      reservationId: newPreBooking._id,
      status: newPreBooking.status
    });

  } catch (err) {
    await session.abortTransaction();

    if (err.code === 11000) {
      return res.status(409).json({
        message: "You already have an active pre-booking or reservation in this zone."
      });
    }

    console.error("❌ Pre-booking Error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  } finally {
    session.endSession();
  }
});

// ================= MAKE RESERVATION =================
// Reservations are active parking, marked as "reserved" status, count as "reserved"
router.post("/reserve", async (req, res) => {
  const { userId, zoneId, fromTime, toTime } = req.body;

  if (!userId || !zoneId || !fromTime || !toTime) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const start = new Date(fromTime);
  const end = new Date(toTime);
  const now = new Date();

  if (start >= end) {
    return res.status(400).json({ message: "Invalid time range" });
  }

  // Reservations represent "check-in now" only (no future reservations).
  if (start.getTime() > now.getTime()) {
    return res.status(400).json({
      message: "Reservations must start now (or earlier). For future time windows, use /prebook."
    });
  }

  const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const zone = await Zone.findById(zoneId).session(session);
    if (!zone) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Zone not found" });
    }

    // One active action per user per zone (booked OR reserved)
    const existing = await Reservation.findOne({
      userId,
      zoneId,
      status: { $in: ["booked", "reserved"] }
    }).session(session);

    if (existing) {
      // If user has a pre-booking, only convert when requested reservation window overlaps it
      if (existing.status === "booked") {
        const overlapsOwnPrebooking = overlaps(existing.fromTime, existing.toTime, start, end);
        const isActiveReservationWindow = start <= now && now <= end;

        if (!isActiveReservationWindow) {
          await session.abortTransaction();
          return res.status(409).json({
            message: "Reservations are only allowed for present time (check-in now)."
          });
        }

        if (!overlapsOwnPrebooking) {
          await session.abortTransaction();
          return res.status(409).json({
            message: "Your reservation time must overlap your pre-booking time window."
          });
        }

        // Capacity check for the requested window (exclude this record since it will be updated)
        const overlappingForRequestedWindow = await Reservation.countDocuments({
          _id: { $ne: existing._id },
          zoneId: zoneId,
          status: { $in: ["reserved", "booked"] },
          $and: [{ fromTime: { $lt: end } }, { toTime: { $gt: start } }]
        }).session(session);

        if (overlappingForRequestedWindow >= zone.capacity) {
          await session.abortTransaction();
          return res.status(409).json({
            message: "Zone is fully booked for this time range."
          });
        }

        existing.status = "reserved";
        existing.parkedAt = now;
        // IMPORTANT: take reservation timings, not pre-booking timings
        existing.fromTime = start;
        existing.toTime = end;

        await existing.save({ session });
        await session.commitTransaction();
        return res.json({
          message: "Pre-booking converted to active reservation.",
          reservationId: existing._id,
          status: "reserved"
        });
      }

      // Already reserved in this zone
      if (existing.status === "reserved") {
        const isSameSlot =
          existing.fromTime.getTime() === start.getTime() &&
          existing.toTime.getTime() === end.getTime();

        await session.abortTransaction();
        if (isSameSlot) {
          return res.json({
            message: "You already have an active reservation for this time slot.",
            reservationId: existing._id,
            status: "reserved"
          });
        }
        return res.status(409).json({
          message: "You already have an active reservation in this zone. Only one active action per zone allowed."
        });
      }
    }

    // No prebooking: directly reserve (subject to capacity checks)
    const overlappingReservations = await Reservation.countDocuments({
      zoneId: zoneId,
      status: { $in: ["reserved", "booked"] },
      $and: [{ fromTime: { $lt: end } }, { toTime: { $gt: start } }]
    }).session(session);

    if (overlappingReservations >= zone.capacity) {
      await session.abortTransaction();
      return res.status(409).json({
        message: "Zone is fully booked for this time range."
      });
    }

    const newReservation = new Reservation({
      userId,
      zoneId,
      fromTime: start,
      toTime: end,
      status: "reserved",
      parkedAt: now
    });

    await newReservation.save({ session });
    await session.commitTransaction();

    return res.json({
      message: "Reservation confirmed. Parking is active and counted as reserved.",
      reservationId: newReservation._id,
      status: newReservation.status
    });
  } catch (err) {
    await session.abortTransaction();

    if (err.code === 11000) {
      return res.status(409).json({
        message: "You already have an active reservation or pre-booking in this zone."
      });
    }

    console.error("❌ Reservation Error:", err);
    return res.status(500).json({ message: "Server Error", error: err.message });
  } finally {
    session.endSession();
  }
});

// ================= CANCEL RESERVATION =================
router.delete("/reserve/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const r = await Reservation.findById(req.params.id).session(session);
    if (!r) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Reservation not found" });
    }

    // Only allow cancellation of active bookings/reservations
    if (!["booked", "reserved"].includes(r.status)) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `Cannot cancel reservation with status: ${r.status}`
      });
    }

    // Atomic cancellation: update status to cancelled
    r.status = "cancelled";
    await r.save({ session });
    await session.commitTransaction();

    res.json({
      message: "Cancelled successfully",
      reservationId: r._id
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("❌ Cancel Error:", err);
    res.status(500).json({ message: "Cancel failed", error: err.message });
  } finally {
    session.endSession();
  }
});

module.exports = { reserveRouter: router, startReservationCron };
