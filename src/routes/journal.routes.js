const { Router } = require("express");
const {
  createJournal,
  getJournals,
  deleteJournalEntry,
  searchJournals,
  getHeatmapData,
  getTags
} = require("../controller/journal.controller");
const authenticateJWT = require("../middleware/auth.middleware");

const journalrouter = Router();

journalrouter.post("/journal-entry", authenticateJWT, createJournal);
journalrouter.get("/journal-entries", authenticateJWT, getJournals);
journalrouter.delete("/journal-entry", authenticateJWT, deleteJournalEntry);
journalrouter.get("/search-journals", authenticateJWT, searchJournals);
journalrouter.get("/heat-map", authenticateJWT, getHeatmapData);
journalrouter.get("/tags", authenticateJWT, getTags);

module.exports = journalrouter;
