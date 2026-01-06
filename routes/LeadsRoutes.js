const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET LEADS
router.get('/', (req, res) => {
    db.query("SELECT * FROM leads ORDER BY created_at DESC", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// CREATE LEAD (Full Feature Set)
router.post('/', (req, res) => {
    const { 
        name, company, value, currency, phone, status, source, email, 
        description, owner, position, website, address, city, state, zipcode, country, tags,
        // New Fields matching screenshot
        assigned_to, default_language, is_public, contacted_today
    } = req.body;
    
    const sql = `INSERT INTO leads 
    (name, company, value, currency, phone, status, source, email, description, owner, 
    position, website, address, city, state, zipcode, country, tags,
    assigned_to, default_language, is_public, contacted_today) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
        name, 
        company, 
        value || 0, 
        currency || 'USD', 
        phone, 
        status || 'New', 
        source, 
        email, 
        description, 
        owner || 'Me', 
        position, 
        website, 
        address, 
        city, 
        state, 
        zipcode, 
        country, 
        tags,
        assigned_to, 
        default_language, 
        is_public ? 1 : 0, 
        contacted_today ? 1 : 0
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error("SQL Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: "Lead created", id: result.insertId });
    });
});

// DELETE LEAD
router.delete('/:id', (req, res) => {
    db.query("DELETE FROM leads WHERE id = ?", [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Lead deleted" });
    });
});

// UPDATE STATUS
router.put('/:id/status', (req, res) => {
    const { status } = req.body;
    db.query("UPDATE leads SET status = ? WHERE id = ?", [status, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Status updated" });
    });
});
// --- NOTES & ACTIVITY ROUTES ---

// GET NOTES
router.get('/:id/notes', (req, res) => {
    db.query("SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC", [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// ADD NOTE
router.post('/:id/notes', (req, res) => {
    const { note, contacted_status } = req.body;
    const sql = "INSERT INTO lead_notes (lead_id, note, contacted_status) VALUES (?, ?, ?)";
    db.query(sql, [req.params.id, note, contacted_status ? 1 : 0], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Note added", id: result.insertId });
    });
});

// GET ACTIVITY LOG
router.get('/:id/activity', (req, res) => {
    db.query("SELECT * FROM lead_activity_log WHERE lead_id = ? ORDER BY created_at DESC", [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});
// --- EXISTING CODE ... ---

// 1. GET SINGLE LEAD (For Edit Page)
router.get('/:id', (req, res) => {
    db.query("SELECT * FROM leads WHERE id = ?", [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ message: "Lead not found" });
        res.json(results[0]);
    });
});

// 2. UPDATE LEAD (Edit Functionality)
router.put('/:id', (req, res) => {
    const { 
        name, position, company, email, website, phone, value, 
        status, source, address, city, state, country, zipcode, 
        default_language, description, assigned_to, tags, is_public, contacted_today 
    } = req.body;

    const sql = `UPDATE leads SET 
        name=?, position=?, company=?, email=?, website=?, phone=?, value=?, 
        status=?, source=?, address=?, city=?, state=?, country=?, zipcode=?, 
        default_language=?, description=?, assigned_to=?, tags=?, is_public=?, contacted_today=?
        WHERE id=?`;

    const values = [
        name, position, company, email, website, phone, value, 
        status, source, address, city, state, country, zipcode, 
        default_language, description, assigned_to, tags, is_public, contacted_today,
        req.params.id
    ];

    db.query(sql, values, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Lead updated successfully" });
    });
});

// 3. TASKS ROUTES
router.get('/:id/tasks', (req, res) => {
    db.query("SELECT * FROM lead_tasks WHERE lead_id = ? ORDER BY due_date ASC", [req.params.id], (err, resu) => {
        if (err) return res.status(500).json(err);
        res.json(resu);
    });
});
router.post('/:id/tasks', (req, res) => {
    const { name, due_date } = req.body;
    db.query("INSERT INTO lead_tasks (lead_id, name, due_date) VALUES (?, ?, ?)", [req.params.id, name, due_date], (err, r) => {
        if (err) return res.status(500).json(err);
        res.json({ id: r.insertId, message: "Task added" });
    });
});
router.put('/tasks/:taskId/toggle', (req, res) => {
    // Toggle status between Pending and Completed
    db.query("UPDATE lead_tasks SET status = IF(status='Pending','Completed','Pending') WHERE id = ?", [req.params.taskId], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Toggled" });
    });
});

// 4. REMINDERS ROUTES
router.get('/:id/reminders', (req, res) => {
    db.query("SELECT * FROM lead_reminders WHERE lead_id = ? ORDER BY remind_date ASC", [req.params.id], (err, resu) => {
        if (err) return res.status(500).json(err);
        res.json(resu);
    });
});
router.post('/:id/reminders', (req, res) => {
    const { description, remind_date } = req.body;
    db.query("INSERT INTO lead_reminders (lead_id, description, remind_date) VALUES (?, ?, ?)", [req.params.id, description, remind_date], (err, r) => {
        if (err) return res.status(500).json(err);
        res.json({ id: r.insertId });
    });
});
// --- PROPOSALS ROUTES ---
router.get('/:id/proposals', (req, res) => {
    db.query("SELECT * FROM lead_proposals WHERE lead_id = ? ORDER BY created_at DESC", [req.params.id], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

router.post('/:id/proposals', (req, res) => {
    const { subject, total_amount, status } = req.body;
    db.query("INSERT INTO lead_proposals (lead_id, subject, total_amount, status) VALUES (?, ?, ?, ?)", 
    [req.params.id, subject, total_amount, status || 'Draft'], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ id: result.insertId, message: "Proposal added" });
    });
});

// --- ATTACHMENTS ROUTES ---
router.get('/:id/attachments', (req, res) => {
    db.query("SELECT * FROM lead_attachments WHERE lead_id = ? ORDER BY created_at DESC", [req.params.id], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

router.post('/:id/attachments', (req, res) => {
    const { file_name, file_size, file_type } = req.body;
    db.query("INSERT INTO lead_attachments (lead_id, file_name, file_size, file_type) VALUES (?, ?, ?, ?)", 
    [req.params.id, file_name, file_size, file_type], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ id: result.insertId, message: "Attachment record saved" });
    });
});

module.exports = router;