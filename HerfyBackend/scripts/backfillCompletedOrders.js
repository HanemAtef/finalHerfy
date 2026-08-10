/**
 * Run this script to backfill completedOrders for all handymen.
 * Usage: node scripts/backfillCompletedOrders.js
 * It connects to MongoDB, calculates completed orders for each handyman,
 * updates the DB, and disconnects.
 * It is idempotent and can be safely run multiple times.
 */

require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const Handyman = require("../models/Handyman");
const Order = require("../models/Order");

async function backfill() {
  try {
    if (!process.env.MONGO_URI) {
      console.error("MONGO_URI is missing in .env");
      process.exit(1);
    }
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const handymen = await Handyman.find();
    let updatedCount = 0;

    for (const handyman of handymen) {
      const actualCompleted = await Order.countDocuments({
        handymanId: handyman.userId,
        status: "completed"
      });

      if (handyman.completedOrders !== actualCompleted) {
        handyman.completedOrders = actualCompleted;
        await handyman.save();
        updatedCount++;
        console.log(`Updated handyman ${handyman.userId} to ${actualCompleted} completed orders.`);
      }
    }

    console.log(`Backfill complete. Updated ${updatedCount} handymen.`);
    process.exit(0);
  } catch (error) {
    console.error("Backfill failed:", error);
    process.exit(1);
  }
}

backfill();
