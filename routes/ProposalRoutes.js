const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ==========================
// Create Proposal + Items
// Matches frontend URL: /api/proposal/create
// ==========================
router.post('/create', (req, res) => {
    console.log("Received Proposal Data:", req.body); // Debugging

    const { 
        lead_id, subject, assigned_to, proposal_date, open_till, currency, status,
        to_name, address, city, state, country, zip, email, phone,
        items, sub_total, discount_val, adjustment, total_amount
    } = req.body;

    // 1. Insert into Master Table (lead_proposals)
    const sqlProposal = `INSERT INTO lead_proposals 
    (lead_id, subject, assigned_to, proposal_date, open_till, currency, status, 
    to_name, address, city, state, country, zip, email, phone, 
    sub_total, discount_val, adjustment, total_amount) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
        lead_id, subject, assigned_to, proposal_date, open_till, currency, status,
        to_name, address, city, state, country, zip, email, phone,
        sub_total, discount_val || 0, adjustment || 0, total_amount
    ];

    db.query(sqlProposal, values, (err, result) => {
        if (err) {
            console.error("❌ SQL Error (Insert Proposal):", err.message);
            return res.status(500).json({ error: err.message });
        }
        
        const proposalId = result.insertId;

        // 2. Insert Items (if any)
        if (items && items.length > 0) {
            const sqlItems = `INSERT INTO proposal_items 
            (proposal_id, description, long_description, qty, rate, tax, amount) 
            VALUES ?`;

            const itemValues = items.map(item => [
                proposalId, 
                item.description, 
                item.long_description, 
                item.qty || 1, 
                item.rate || 0, 
                item.tax || 0, 
                item.amount || 0
            ]);

            db.query(sqlItems, [itemValues], (errItems) => {
                if (errItems) {
                    console.error("❌ SQL Error (Insert Items):", errItems.message);
                    return res.status(500).json({ error: "Proposal created but items failed" });
                }
                res.json({ message: "Proposal created successfully", id: proposalId });
            });
        } else {
            res.json({ message: "Proposal created successfully", id: proposalId });
        }
    });
});

// ==========================
// Get All Proposals (Optional, for list view)
// ==========================
router.get('/', (req, res) => {
    const sql = "SELECT * FROM lead_proposals ORDER BY id DESC";
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

module.exports = router;