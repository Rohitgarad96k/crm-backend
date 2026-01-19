const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. GET ALL ITEMS
router.get('/', (req, res) => {
    db.query("SELECT * FROM items ORDER BY id DESC", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// 2. CREATE ITEM (Added group_name)
router.post('/', (req, res) => {
    const { name, description, rate, unit, tax_rate, group_name } = req.body;
    const sql = "INSERT INTO items (name, description, rate, unit, tax_rate, group_name) VALUES (?, ?, ?, ?, ?, ?)";
    
    db.query(sql, [name, description, rate, unit, tax_rate, group_name || 'General'], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Item created successfully", id: result.insertId });
    });
});

// 3. UPDATE ITEM (Added group_name)
router.put('/:id', (req, res) => {
    const { name, description, rate, unit, tax_rate, group_name } = req.body;
    const sql = "UPDATE items SET name=?, description=?, rate=?, unit=?, tax_rate=?, group_name=? WHERE id=?";
    
    db.query(sql, [name, description, rate, unit, tax_rate, group_name, req.params.id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Item updated successfully" });
    });
});

// 4. DELETE ITEM
router.delete('/:id', (req, res) => {
    db.query("DELETE FROM items WHERE id = ?", [req.params.id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Item deleted successfully" });
    });
});

// 5. BULK IMPORT ITEMS (New Route)
router.post('/import', (req, res) => {
    const items = req.body; // Expecting an array of objects
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Invalid data format" });
    }

    // Prepare Bulk Insert Query
    const sql = "INSERT INTO items (name, description, rate, unit, tax_rate, group_name) VALUES ?";
    const values = items.map(i => [
        i.name, 
        i.description || '', 
        i.rate || 0, 
        i.unit || 'qty', 
        i.tax_rate || 0, 
        i.group_name || 'General'
    ]);

    db.query(sql, [values], (err, result) => {
        if (err) {
            console.error("Import Error:", err);
            return res.status(500).json({ error: "Failed to import items" });
        }
        res.json({ message: `Successfully imported ${result.affectedRows} items` });
    });
});

module.exports = router;