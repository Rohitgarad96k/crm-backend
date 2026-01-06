const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. GET ALL GROUPS (Populates the dropdown)
router.get('/', (req, res) => {
    db.query("SELECT * FROM customer_groups", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. CREATE NEW GROUP (Optional utility)
router.post('/', (req, res) => {
    const { name } = req.body;
    db.query("INSERT INTO customer_groups (name) VALUES (?)", [name], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: result.insertId, name });
    });
});

// 3. ASSIGN GROUP TO CUSTOMER (This fixes the error!)
router.post('/assign', (req, res) => {
    // Frontend sends { customer_id, group_ids }
    const { customer_id, group_ids } = req.body; 
    
    // We take the first group ID since the UI selects one
    const groupId = Array.isArray(group_ids) ? group_ids[0] : group_ids;

    if (!groupId) return res.status(400).json({ error: "No group ID provided" });

    // First, delete existing links for this customer to prevent duplicates
    const deleteSql = "DELETE FROM contact_group_links WHERE contact_id = ?";
    
    db.query(deleteSql, [customer_id], (err) => {
        if (err) {
            console.error("Error clearing old groups:", err);
            return res.status(500).json({ error: err.message });
        }

        // Now insert the new link
        const insertSql = "INSERT INTO contact_group_links (contact_id, group_id) VALUES (?, ?)";
        db.query(insertSql, [customer_id, groupId], (err, result) => {
            if (err) {
                console.error("Error assigning group:", err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: "Group assigned successfully" });
        });
    });
});

module.exports = router;