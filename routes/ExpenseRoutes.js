const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');

// --- MULTER CONFIGURATION ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'uploads/'); },
    filename: (req, file, cb) => { cb(null, 'Receipt_' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage }).single('receipt'); 

// 1. GET ALL EXPENSES
router.get('/', (req, res) => {
    const sql = `
        SELECT e.*, c.name AS customer_name 
        FROM expenses e
        LEFT JOIN contacts c ON e.customer_id = c.id
        ORDER BY e.entry_date DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// 2. GET SINGLE EXPENSE
router.get('/:id', (req, res) => {
    db.query("SELECT * FROM expenses WHERE id = ?", [req.params.id], (err, result) => {
        if (err) return res.status(500).json(err);
        if (result.length === 0) return res.status(404).json({ message: "Expense not found" });
        res.json(result[0]);
    });
});

// 3. CREATE EXPENSE (Updated for Recurring)
router.post('/', upload, (req, res) => {
    const { 
        entry_date, category, amount, customer_id, reference_no, 
        payment_mode, note, expense_name, billable, 
        is_recurring, frequency // <--- NEW FIELDS
    } = req.body;
    
    const receipt_path = req.file ? req.file.path : null;
    const custId = (customer_id === 'null' || customer_id === '') ? null : customer_id;

    const sql = `
        INSERT INTO expenses 
        (entry_date, category, amount, customer_id, reference_no, payment_mode, note, expense_name, billable, receipt_path, is_recurring, frequency) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [
        entry_date, category, amount, custId, reference_no, payment_mode, note, expense_name, 
        billable === 'true' ? 1 : 0, 
        receipt_path,
        is_recurring === 'true' ? 1 : 0, // Handle boolean from FormData
        frequency
    ], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Expense recorded successfully", id: result.insertId });
    });
});

// 4. BULK IMPORT EXPENSES
router.post('/import', (req, res) => {
    const expenses = req.body; 
    if (!Array.isArray(expenses) || expenses.length === 0) return res.status(400).json({ error: "Invalid data" });

    const sql = "INSERT INTO expenses (entry_date, category, amount, expense_name, customer_id, reference_no, payment_mode, billable, note) VALUES ?";
    const values = expenses.map(e => [
        e.entry_date || new Date().toISOString().split('T')[0], e.category, e.amount || 0, e.expense_name || '',
        e.customer_id || null, e.reference_no || '', e.payment_mode || 'Cash', e.billable ? 1 : 0, e.note || ''
    ]);

    db.query(sql, [values], (err, result) => {
        if (err) return res.status(500).json({ error: "Failed to import expenses" });
        res.json({ message: `Successfully imported ${result.affectedRows} expenses` });
    });
});

// 5. UPDATE EXPENSE (Updated for Recurring)
router.put('/:id', upload, (req, res) => {
    const { 
        entry_date, category, amount, customer_id, reference_no, 
        payment_mode, note, expense_name, billable,
        is_recurring, frequency // <--- NEW FIELDS
    } = req.body;

    let sql = `UPDATE expenses SET entry_date=?, category=?, amount=?, customer_id=?, reference_no=?, payment_mode=?, note=?, expense_name=?, billable=?, is_recurring=?, frequency=?`;
    const custId = (customer_id === 'null' || customer_id === '') ? null : customer_id;
    
    let params = [
        entry_date, category, amount, custId, reference_no, payment_mode, note, expense_name, 
        billable === 'true' ? 1 : 0,
        is_recurring === 'true' ? 1 : 0,
        frequency
    ];

    if (req.file) {
        sql += `, receipt_path=?`;
        params.push(req.file.path);
    }
    sql += ` WHERE id=?`;
    params.push(req.params.id);
    
    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Expense updated successfully" });
    });
});

// 6. DELETE EXPENSE
router.delete('/:id', (req, res) => {
    db.query("DELETE FROM expenses WHERE id = ?", [req.params.id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Expense deleted successfully" });
    });
});

// 7. CONVERT EXPENSE TO INVOICE
router.post('/:id/convert', (req, res) => {
    const expenseId = req.params.id;
    db.query("SELECT * FROM expenses WHERE id = ?", [expenseId], (err, results) => {
        if (err) return res.status(500).json({ message: "DB Error", error: err.sqlMessage });
        if (results.length === 0) return res.status(404).json({ message: "Expense not found" });

        const expense = results[0];
        if (expense.invoice_id) return res.status(400).json({ message: "Already converted." });
        if (!expense.customer_id) return res.status(400).json({ message: "No Customer linked." });

        const invoiceNumber = `INV-EXP-${Date.now()}`; 
        const today = new Date().toISOString().split('T')[0];
        
        const createInvoiceSql = `INSERT INTO invoices (customer_id, invoice_number, invoice_date, due_date, status, total_amount) VALUES (?, ?, ?, ?, 'Draft', ?)`;

        db.query(createInvoiceSql, [expense.customer_id, invoiceNumber, today, today, expense.amount], (err, invResult) => {
            if (err) return res.status(500).json({ message: "Invoice Creation Failed", error: err.sqlMessage });

            const newInvoiceId = invResult.insertId;
            const createItemSql = `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total) VALUES (?, ?, 1, ?, ?)`;
            const description = expense.expense_name || expense.category || "Expense";

            db.query(createItemSql, [newInvoiceId, description, expense.amount, expense.amount], (err, itemResult) => {
                if (err) return res.status(500).json({ message: "Item Creation Failed", error: err.sqlMessage });

                db.query("UPDATE expenses SET invoice_id = ? WHERE id = ?", [newInvoiceId, expenseId], (err) => {
                    if (err) return res.status(500).json({ message: "Update Failed", error: err.sqlMessage });
                    res.json({ message: "Success", invoice_id: newInvoiceId });
                });
            });
        });
    });
});

module.exports = router;