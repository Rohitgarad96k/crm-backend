const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');

// --- MULTER CONFIG (File Upload) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'uploads/'); },
    filename: (req, file, cb) => { cb(null, 'Ticket_' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage }).single('attachment');

// 1. GET ALL TICKETS
router.get('/', (req, res) => {
    const sql = `
        SELECT t.*, c.name as contact_name 
        FROM tickets t
        LEFT JOIN contacts c ON t.contact_id = c.id
        ORDER BY t.created_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// 2. CREATE TICKET
router.post('/', upload, (req, res) => {
    const { 
        subject, contact_id, department, service, tags, priority, 
        status, body, cc, assigned_to, name, email 
    } = req.body;
    
    const attachment_path = req.file ? req.file.path : null;

    const sql = `
        INSERT INTO tickets 
        (subject, contact_id, department, service, tags, priority, status, body, cc, assigned_to, name, email, attachment_path) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.query(sql, [
        subject, contact_id, department, service, tags, priority, 
        status || 'Open', body, cc, assigned_to, name, email, attachment_path
    ], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Ticket created successfully", id: result.insertId });
    });
});

// 3. UPDATE TICKET
router.put('/:id', upload, (req, res) => {
    const { 
        subject, contact_id, department, service, tags, priority, 
        status, body, cc, assigned_to, name, email 
    } = req.body;

    let sql = `
        UPDATE tickets 
        SET subject=?, contact_id=?, department=?, service=?, tags=?, priority=?, 
            status=?, body=?, cc=?, assigned_to=?, name=?, email=?
    `;
    
    const params = [
        subject, contact_id, department, service, tags, priority, 
        status, body, cc, assigned_to, name, email
    ];

    // Only update attachment if a new file is uploaded
    if (req.file) {
        sql += `, attachment_path=?`;
        params.push(req.file.path);
    }

    sql += ` WHERE id=?`;
    params.push(req.params.id);
    
    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Ticket updated successfully" });
    });
});

// 4. DELETE TICKET
router.delete('/:id', (req, res) => {
    db.query("DELETE FROM tickets WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Ticket deleted" });
    });
});

// 5. GET SINGLE TICKET (Required for Edit/View pages)
router.get('/:id', (req, res) => {
    const sql = `
        SELECT t.*, c.name as contact_name, c.email as contact_email 
        FROM tickets t
        LEFT JOIN contacts c ON t.contact_id = c.id
        WHERE t.id = ?
    `;
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json(err);
        if (result.length === 0) return res.status(404).json({ message: "Ticket not found" });
        res.json(result[0]);
    });
});

module.exports = router;