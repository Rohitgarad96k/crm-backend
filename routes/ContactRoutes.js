const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET ALL CONTACTS (With Group Name)
router.get('/', (req, res) => {
    // We join 'contacts' -> 'contact_group_links' -> 'customer_groups'
    const sql = `
        SELECT c.*, g.name as group_name 
        FROM contacts c
        LEFT JOIN contact_group_links cgl ON c.id = cgl.contact_id
        LEFT JOIN customer_groups g ON cgl.group_id = g.id
        ORDER BY c.created_at DESC
    `;
    
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// CREATE CONTACT (Updated with Billing & Shipping)
router.post('/', (req, res) => {
    const { 
        name, email, phone, company, GST, website, 
        address, city, state, zipcode, country, currency, language,
        // New Fields
        billing_address, billing_city, billing_state, billing_zip, billing_country,
        shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country
    } = req.body;

    const sql = `INSERT INTO contacts 
    (name, email, phone, company, gst_number, website, 
    address, city, state, zipcode, country, currency, language,
    billing_address, billing_city, billing_state, billing_zip, billing_country,
    shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
        name, email, phone, company, GST, website, 
        address, city, state, zipcode, country, currency, language,
        billing_address, billing_city, billing_state, billing_zip, billing_country,
        shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error("SQL Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: "Contact added", id: result.insertId });
    });
});

// TOGGLE STATUS
router.put('/:id/status', (req, res) => {
    const { is_active } = req.body;
    const sql = "UPDATE contacts SET is_active = ? WHERE id = ?";
    db.query(sql, [is_active, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Status updated" });
    });
});

// DELETE CONTACT
router.delete('/:id', (req, res) => {
    const sql = "DELETE FROM contacts WHERE id = ?";
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Contact deleted" });
    });
});
// GET SINGLE CONTACT (For Edit Page)
router.get('/:id', (req, res) => {
    const sql = `
        SELECT c.*, cgl.group_id 
        FROM contacts c
        LEFT JOIN contact_group_links cgl ON c.id = cgl.contact_id
        WHERE c.id = ?
    `;
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ message: "Contact not found" });
        
        // Return the customer data
        // Note: The frontend expects 'GST' but DB has 'gst_number'. We handle mapping in frontend or here.
        // Let's send raw DB columns and map in frontend for consistency.
        res.json(results[0]);
    });
});

// UPDATE CONTACT
router.put('/:id', (req, res) => {
    const { 
        name, email, phone, company, GST, website, 
        address, city, state, zipcode, country, currency, language,
        billing_address, billing_city, billing_state, billing_zip, billing_country,
        shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country
    } = req.body;

    const sql = `UPDATE contacts SET 
        name=?, email=?, phone=?, company=?, gst_number=?, website=?, 
        address=?, city=?, state=?, zipcode=?, country=?, currency=?, language=?,
        billing_address=?, billing_city=?, billing_state=?, billing_zip=?, billing_country=?,
        shipping_address=?, shipping_city=?, shipping_state=?, shipping_zip=?, shipping_country=?
        WHERE id=?`;

    const values = [
        name, email, phone, company, GST, website, 
        address, city, state, zipcode, country, currency, language,
        billing_address, billing_city, billing_state, billing_zip, billing_country,
        shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country,
        req.params.id
    ];

    db.query(sql, values, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Contact updated successfully" });
    });
});
// GET ALL CUSTOMERS
router.get('/', (req, res) => {
    db.query("SELECT * FROM customers ORDER BY name ASC", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

module.exports = router;