const mongoose = require("mongoose");

const ZoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    polygon: {
      type: [
        {
          lat: { type: Number, required: true },
          lng: { type: Number, required: true },
        },
      ],
      required: true,
    },
    capacity: {
      type: Number,
      required: true,
    },
    available: {
      type: Number,
      required: true, // Stores the current count of available spots
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("parkingzones", ZoneSchema);
