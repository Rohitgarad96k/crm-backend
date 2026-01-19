const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ... (GET stats and GET next-number routes stay the same) ...
// 1. GET STATS
router.get('/stats', (req, res) => {
    const sql = `
        SELECT 
            SUM(CASE WHEN status = 'Draft' THEN 1 ELSE 0 END) as draft_count,
            SUM(CASE WHEN status = 'Unpaid' THEN 1 ELSE 0 END) as unpaid_count,
            SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) as paid_count,
            SUM(CASE WHEN status = 'Partially Paid' THEN 1 ELSE 0 END) as partial_count,
            SUM(CASE WHEN status = 'Overdue' THEN 1 ELSE 0 END) as overdue_count,
            COUNT(*) as total_count,
            SUM(CASE WHEN status = 'Paid' THEN total_amount ELSE 0 END) as total_paid_amount,
            SUM(CASE WHEN status = 'Overdue' THEN total_amount ELSE 0 END) as total_overdue_amount,
            SUM(CASE WHEN status != 'Paid' AND status != 'Draft' THEN (total_amount - amount_paid) ELSE 0 END) as total_outstanding_amount
        FROM invoices
    `;
    db.query(sql, (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result[0]);
    });
});

// 2. GET LIST
router.get('/', (req, res) => {
    const sql = `SELECT i.*, c.name AS customer_name FROM invoices i LEFT JOIN contacts c ON i.lead_id = c.id ORDER BY i.id DESC`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 3. GET NEXT NUMBER
router.get('/next-number', (req, res) => {
    const sql = "SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 1";
    db.query(sql, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        let nextNumber = 'INV-000001';
        if (result.length > 0 && result[0].invoice_number) {
            const lastNum = result[0].invoice_number; 
            const parts = lastNum.split('-'); 
            if (parts.length === 2) {
                const numPart = parseInt(parts[1]); 
                if (!isNaN(numPart)) nextNumber = `INV-${String(numPart + 1).padStart(6, '0')}`;
            }
        }
        res.json({ nextNumber });
    });
});

// 4. CREATE INVOICE (UPDATED TO SAVE TAX)
router.post('/create', (req, res) => {
    console.log("📥 Received Invoice Data:", req.body);

    const { 
        lead_id, invoice_number, issue_date, due_date, 
        sale_agent, recurring, discount_type, discount_calc,
        admin_note, client_note, terms, prevent_overdue_reminders, payment_modes,
        sub_total, discount_val, adjustment, total_amount, total_tax, // <--- ADDED total_tax
        items 
    } = req.body;

    const sqlInvoice = `
        INSERT INTO invoices (
            lead_id, invoice_number, issue_date, due_date, 
            sale_agent, recurring, discount_type, discount_calc,
            admin_note, client_note, terms, prevent_overdue_reminders, payment_modes,
            sub_total, discount_val, adjustment, total_amount, total_tax, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Unpaid')
    `;

    const values = [
        parseInt(lead_id) || 0,
        invoice_number,
        issue_date,
        due_date,
        sale_agent,
        recurring,
        discount_type,
        discount_calc,
        admin_note,
        client_note,
        terms,
        prevent_overdue_reminders ? 1 : 0,
        payment_modes,
        parseFloat(sub_total) || 0,
        parseFloat(discount_val) || 0,
        parseFloat(adjustment) || 0,
        parseFloat(total_amount) || 0,
        parseFloat(total_tax) || 0 // <--- ADDED VALUE
    ];

    db.query(sqlInvoice, values, (err, result) => {
        if (err) {
            console.error("❌ SQL Error:", err.sqlMessage || err);
            return res.status(500).json({ error: err.sqlMessage || "Database Error" });
        }

        const newInvoiceId = result.insertId;

        if (items && items.length > 0) {
            const sqlItems = `INSERT INTO invoice_items (invoice_id, description, long_description, qty, rate, tax, amount) VALUES ?`;
            const itemValues = items.map(item => [
                newInvoiceId, item.description, item.long_description || '', item.qty, item.rate, item.tax || 0, item.amount
            ]);
            db.query(sqlItems, [itemValues], (errItems) => {
                if (errItems) console.error("❌ Error saving items:", errItems);
            });
        }
        res.json({ message: "Invoice created successfully", id: newInvoiceId });
    });
});
// 5. GET SINGLE INVOICE BY ID
router.get('/:id', (req, res) => {
    const invoiceId = req.params.id;

    // Get Invoice Details
    const sqlInvoice = `
        SELECT i.*, c.name AS customer_name, c.email, c.address, c.billing_address, c.shipping_address
        FROM invoices i
        LEFT JOIN contacts c ON i.lead_id = c.id
        WHERE i.id = ?
    `;

    db.query(sqlInvoice, [invoiceId], (err, result) => {
        if (err) return res.status(500).json(err);
        if (result.length === 0) return res.status(404).json({ message: 'Invoice not found' });

        const invoice = result[0];

        // Get Invoice Items
        const sqlItems = `SELECT * FROM invoice_items WHERE invoice_id = ?`;
        db.query(sqlItems, [invoiceId], (errItems, itemsResult) => {
            if (errItems) return res.status(500).json(errItems);
            
            invoice.items = itemsResult;
            res.json(invoice);
        });
    });
});

// 6. UPDATE INVOICE
router.put('/:id', (req, res) => {
    const invoiceId = req.params.id;
    const { 
        lead_id, issue_date, due_date, sale_agent, recurring, discount_type, discount_calc,
        admin_note, client_note, terms, prevent_overdue_reminders, payment_modes,
        sub_total, discount_val, adjustment, total_amount, total_tax, status, items 
    } = req.body;

    const sqlUpdate = `
        UPDATE invoices SET 
        lead_id=?, issue_date=?, due_date=?, sale_agent=?, recurring=?, discount_type=?, discount_calc=?,
        admin_note=?, client_note=?, terms=?, prevent_overdue_reminders=?, payment_modes=?,
        sub_total=?, discount_val=?, adjustment=?, total_amount=?, total_tax=?, status=?
        WHERE id=?
    `;

    const values = [
        lead_id, issue_date, due_date, sale_agent, recurring, discount_type, discount_calc,
        admin_note, client_note, terms, prevent_overdue_reminders ? 1 : 0, payment_modes,
        sub_total, discount_val, adjustment, total_amount, total_tax, status, invoiceId
    ];

    db.query(sqlUpdate, values, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        // Update Items: Delete old ones and re-insert new ones (simplest approach)
        const sqlDeleteItems = `DELETE FROM invoice_items WHERE invoice_id = ?`;
        db.query(sqlDeleteItems, [invoiceId], () => {
            if (items && items.length > 0) {
                const sqlInsertItems = `INSERT INTO invoice_items (invoice_id, description, long_description, qty, rate, tax, amount) VALUES ?`;
                const itemValues = items.map(item => [
                    invoiceId, item.description, item.long_description || '', item.qty, item.rate, item.tax || 0, item.amount
                ]);
                db.query(sqlInsertItems, [itemValues]);
            }
            res.json({ message: "Invoice updated successfully" });
        });
    });
});
// DELETE INVOICE
router.delete('/:id', (req, res) => {
    const sql = "DELETE FROM invoices WHERE id = ?";
    db.query(sql, [req.params.id], (err, result) => {
        if(err) return res.status(500).json(err);
        res.json({ message: "Deleted successfully" });
    });
});
module.exports = router;