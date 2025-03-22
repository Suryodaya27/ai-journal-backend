const { Router } = require("express");
const {
  getGoalsAndSuggestionsAndreminders,
} = require("../controller/goalsAndSuggestionsAndReminders.controller");
const authenticateJWT = require("../middleware/auth.middleware");

const airouter = Router();

airouter.get("/goals-and-suggestions-and-reminders", authenticateJWT, getGoalsAndSuggestionsAndreminders);

module.exports = airouter;
