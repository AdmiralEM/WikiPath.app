const mongoose = require("mongoose");

const historySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  topic: { type: String, required: true },
  url: { type: String, required: true },
  visitedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("History", historySchema);
