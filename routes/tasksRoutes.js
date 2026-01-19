const express = require("express");
const router = express.Router();
const db = require("../config/db");
const multer = require("multer");
const fs = require("fs");
const csv = require("csv-parser");

/* ===============================
   MULTER CONFIG
================================ */
const upload = multer({ dest: "uploads/tasks/" });

/* ===============================
   AUTO FETCH RELATED CODE
================================ */
async function getRelatedCode(type) {
  const map = {
    invoice:  { table: "invoice", column: "inv_no" },
    estimate: { table: "estimates", column: "estimate_no" },
    proposal: { table: "proposal", column: "prop_id" },
    customer: { table: "contact", column: "customer_code" },
    lead:     { table: "leads", column: "lead_code" }
  };

  if (!map[type]) return null;

  const { table, column } = map[type];
  const [rows] = await db.promise().query(
    `SELECT ${column} FROM ${table} ORDER BY id DESC LIMIT 1`
  );

  return rows.length ? rows[0][column] : null;
}

/* ===============================
   BULK INSERT (ASSIGNEES / FOLLOWERS)
================================ */
async function bulkInsert(table, taskId, users = []) {
  if (!users.length) return;
  const values = users.map(u => [taskId, u]);
  await db.promise().query(
    `INSERT INTO ${table} (task_id, user_id) VALUES ?`,
    [values]
  );
}

/* ===============================
   CREATE TASK (AUTO RELATED ID)
================================ */
/* ===============================
   CREATE TASK (RETURN FULL DATA)
================================ */
router.post("/", async (req, res) => {
  try {
    const {
      subject,
      hourly_rate,
      start_date,
      due_date,
      priority,
      description,
      related_type,
      repeat_every,
      repeat_unit,
      total_cycles,
      is_infinite,
      is_public,
      is_billable,
      assignees = [],
      followers = []
    } = req.body;

    if (!subject || !start_date) {
      return res.status(400).json({ message: "Subject & Start Date required" });
    }

    const related_id = related_type
      ? await getRelatedCode(related_type)
      : null;

    const [result] = await db.promise().query(
      `INSERT INTO tasks
       (subject,hourly_rate,start_date,due_date,priority,description,
        related_type,related_id,repeat_every,repeat_unit,total_cycles,is_infinite,
        is_public,is_billable)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        subject,
        hourly_rate || 0,
        start_date,
        due_date || null,
        priority || "Low",
        description || null,
        related_type || null,
        related_id,
        repeat_every || 0,
        repeat_unit || null,
        total_cycles || 0,
        is_infinite || 0,
        is_public ?? 1,
        is_billable ?? 0
      ]
    );

    const taskId = result.insertId;

    await bulkInsert("task_assignees", taskId, assignees);
    await bulkInsert("task_followers", taskId, followers);

    /* FETCH FULL TASK WITH NAMES */
    const [[task]] = await db.promise().query(`
      SELECT 
        t.*,
        GROUP_CONCAT(DISTINCT ua.name SEPARATOR ', ') AS assignees,
        GROUP_CONCAT(DISTINCT uf.name SEPARATOR ', ') AS followers
      FROM tasks t
      LEFT JOIN task_assignees ta ON ta.task_id = t.id
      LEFT JOIN users ua ON ua.id = ta.user_id
      LEFT JOIN task_followers tf ON tf.task_id = t.id
      LEFT JOIN users uf ON uf.id = tf.user_id
      WHERE t.id = ?
      GROUP BY t.id
    `, [taskId]);

    res.status(201).json(task);

  } catch (err) {
    res.status(500).json(err);
  }
});


/* ===============================
   GET ALL TASKS
================================ */
/* ===============================
   GET ALL TASKS (WITH USER NAMES)
================================ */
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT 
        t.*,

        GROUP_CONCAT(DISTINCT ua.name SEPARATOR ', ') AS assignees,
        GROUP_CONCAT(DISTINCT uf.name SEPARATOR ', ') AS followers

      FROM tasks t

      LEFT JOIN task_assignees ta ON ta.task_id = t.id
      LEFT JOIN users ua ON ua.id = ta.user_id

      LEFT JOIN task_followers tf ON tf.task_id = t.id
      LEFT JOIN users uf ON uf.id = tf.user_id

      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
});
/* ===============================
   GET SINGLE TASK (FULL + NAMES)
================================ */
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT 
        t.*,
        GROUP_CONCAT(DISTINCT ua.name SEPARATOR ', ') AS assignees,
        GROUP_CONCAT(DISTINCT uf.name SEPARATOR ', ') AS followers
      FROM tasks t
      LEFT JOIN task_assignees ta ON ta.task_id = t.id
      LEFT JOIN users ua ON ua.id = ta.user_id
      LEFT JOIN task_followers tf ON tf.task_id = t.id
      LEFT JOIN users uf ON uf.id = tf.user_id
      WHERE t.id = ?
      GROUP BY t.id
    `, [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json(err);
  }
});



/* ===============================
   UPDATE TASK
================================ */
router.put("/:id", async (req, res) => {
  try {
    const fields = [
      "subject","hourly_rate","start_date","due_date","priority","description",
      "related_type","repeat_every","repeat_unit","total_cycles","is_infinite",
      "is_public","is_billable"
    ];

    const updates = {};
    fields.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    if (updates.related_type) {
      updates.related_id = await getRelatedCode(updates.related_type);
    }

    const sql = `
      UPDATE tasks SET ${Object.keys(updates).map(k => `${k}=?`).join(", ")}
      WHERE id=?
    `;

    await db.promise().query(sql, [...Object.values(updates), req.params.id]);

    res.json({ message: "Task updated" });
  } catch (err) {
    res.status(500).json(err);
  }
});

/* ===============================
   DELETE TASK
================================ */
router.delete("/:id", async (req, res) => {
  try {
    await db.promise().query("DELETE FROM task_assignees WHERE task_id=?", [req.params.id]);
    await db.promise().query("DELETE FROM task_followers WHERE task_id=?", [req.params.id]);
    await db.promise().query("DELETE FROM tasks WHERE id=?", [req.params.id]);
    res.json({ message: "Task deleted" });
  } catch (err) {
    res.status(500).json(err);
  }
});

/* ===============================
   IMPORT TASKS (CSV)
================================ */
router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "CSV file required" });

  const rows = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", row => rows.push(row))
    .on("end", async () => {
      for (const r of rows) {
        const related_id = r.related_type
          ? await getRelatedCode(r.related_type)
          : null;

        await db.promise().query(
          `INSERT INTO tasks
           (subject,start_date,priority,related_type,related_id)
           VALUES (?,?,?,?,?)`,
          [
            r.subject,
            r.start_date,
            r.priority || "Low",
            r.related_type || null,
            related_id
          ]
        );
      }

      fs.unlinkSync(req.file.path);
      res.json({ message: "Tasks imported", count: rows.length });
    });
});

module.exports = router;
