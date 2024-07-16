const express = require("express");
const router = express.Router();
const { getHistory, addHistory } = require("../controllers/historyController");

router.get("/", getHistory);
router.post("/", addHistory);

module.exports = router;
