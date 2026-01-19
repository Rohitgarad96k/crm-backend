const express = require("express");
const router = express.Router();
const db = require("../config/db");

/* ===============================
   GET ALL USERS
================================ */
router.get("/", async (req, res) => {
  try {
    const [users] = await db.promise().query(
      "SELECT id, name FROM users ORDER BY name"
    );
    res.json(users);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;
