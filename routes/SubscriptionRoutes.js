const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. GET ALL SUBSCRIPTIONS
router.get('/', (req, res) => {
    const sql = `
        SELECT s.*, c.name AS customer_name 
        FROM subscriptions s
        LEFT JOIN contacts c ON s.customer_id = c.id
        ORDER BY s.next_billing_date ASC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});
// 2. CREATE SUBSCRIPTION (Updated)
router.post('/', (req, res) => {
    const { 
        customer_id, plan_name, amount, billing_cycle, 
        start_date, next_billing_date, status, description,
        quantity, currency, tax_rate, terms_conditions // <--- NEW FIELDS
    } = req.body;
    
    const sql = `
        INSERT INTO subscriptions 
        (customer_id, plan_name, amount, billing_cycle, start_date, next_billing_date, status, description, quantity, currency, tax_rate, terms_conditions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.query(sql, [
        customer_id, plan_name, amount, billing_cycle, 
        start_date, next_billing_date, status || 'Active', description,
        quantity || 1, currency || 'USD', tax_rate || 0, terms_conditions
    ], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Subscription created successfully", id: result.insertId });
    });
});

// 3. UPDATE SUBSCRIPTION (Updated)
router.put('/:id', (req, res) => {
    const { 
        plan_name, amount, billing_cycle, next_billing_date, status, description,
        quantity, currency, tax_rate, terms_conditions // <--- NEW FIELDS
    } = req.body;
    
    const sql = `
        UPDATE subscriptions 
        SET plan_name=?, amount=?, billing_cycle=?, next_billing_date=?, status=?, description=?, quantity=?, currency=?, tax_rate=?, terms_conditions=?
        WHERE id=?
    `;
    
    db.query(sql, [
        plan_name, amount, billing_cycle, next_billing_date, status, description, 
        quantity, currency, tax_rate, terms_conditions, req.params.id
    ], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Subscription updated successfully" });
    });
});

// 4. DELETE SUBSCRIPTION
router.delete('/:id', (req, res) => {
    db.query("DELETE FROM subscriptions WHERE id = ?", [req.params.id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Subscription deleted" });
    });
});

module.exports = router;