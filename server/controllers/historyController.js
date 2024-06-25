const History = require('../models/History');

const getHistory = async (req, res) => {
  try {
    const history = await History.find();
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const addHistory = async (req, res) => {
  const { userId, topic, url, visitedAt } = req.body;

  try {
    const newHistory = new History({ userId, topic, url, visitedAt });
    await newHistory.save();
    res.json(newHistory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getHistory, addHistory };
