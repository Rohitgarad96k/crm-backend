const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. GET ALL CREDIT NOTES
router.get('/', (req, res) => {
    const sql = `
        SELECT cn.*, c.name AS customer_name 
        FROM credit_notes cn 
        LEFT JOIN contacts c ON cn.lead_id = c.id 
        ORDER BY cn.id DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// 2. GET STATS
router.get('/stats', (req, res) => {
    const sql = `
        SELECT 
            SUM(CASE WHEN status = 'Open' THEN 1 ELSE 0 END) as open_count,
            SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) as closed_count,
            SUM(CASE WHEN status = 'Void' THEN 1 ELSE 0 END) as void_count,
            COUNT(*) as total_count,
            SUM(total_amount) as total_amount
        FROM credit_notes
    `;
    db.query(sql, (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result[0]);
    });
});

// 3. GET NEXT NUMBER
router.get('/next-number', (req, res) => {
    db.query("SELECT credit_note_number FROM credit_notes ORDER BY id DESC LIMIT 1", (err, result) => {
        let nextNum = 'CN-000001';
        if (result.length > 0 && result[0].credit_note_number) {
            const parts = result[0].credit_note_number.split('-');
            if (parts.length === 2) nextNum = `CN-${String(parseInt(parts[1]) + 1).padStart(6, '0')}`;
        }
        res.json({ nextNumber: nextNum });
    });
});

// 4. CREATE CREDIT NOTE (Updated with Full Financials)
router.post('/create', (req, res) => {
    const { 
        lead_id, credit_note_number, credit_date, reference, status, 
        sub_total, discount_val, discount_type, discount_calc, // <--- Added these
        total_tax, adjustment, total_amount, 
        items, admin_note, client_note, terms
    } = req.body;

    const sql = `
        INSERT INTO credit_notes (
            lead_id, credit_note_number, credit_date, reference_number, status, 
            sub_total, discount_val, discount_type, discount_calc, 
            total_tax, adjustment, total_amount, remaining_credits, 
            admin_note, client_note, terms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        lead_id, credit_note_number, credit_date, reference, status,
        sub_total, discount_val, discount_type, discount_calc || 'after_tax',
        total_tax, adjustment, total_amount, total_amount, // Remaining = Total initially
        admin_note, client_note, terms
    ];

    db.query(sql, values, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const cnId = result.insertId;
        
        // Update Auto-Increment Number
        const realCNNum = `CN-${String(cnId).padStart(6, '0')}`;
        db.query("UPDATE credit_notes SET credit_note_number = ? WHERE id = ?", [realCNNum, cnId]);

        if (items && items.length > 0) {
            const sqlItems = `INSERT INTO credit_note_items (credit_note_id, description, long_description, qty, rate, tax, amount) VALUES ?`;
            const itemValues = items.map(i => [cnId, i.description, i.long_description, i.qty, i.rate, i.tax, i.amount]);
            db.query(sqlItems, [itemValues]);
        }
        res.json({ message: "Credit Note Created", id: cnId });
    });
});
// 5. GET SINGLE CREDIT NOTE (For View/Edit)
router.get('/:id', (req, res) => {
    const cnId = req.params.id;
    // A. Get Main Details
    const sql = `SELECT cn.*, c.name AS customer_name, c.address, c.city, c.country FROM credit_notes cn LEFT JOIN contacts c ON cn.lead_id = c.id WHERE cn.id = ?`;
    
    db.query(sql, [cnId], (err, result) => {
        if (err || result.length === 0) return res.status(500).json(err || { message: 'Not Found' });
        
        const creditNote = result[0];

        // B. Get Items
        db.query('SELECT * FROM credit_note_items WHERE credit_note_id = ?', [cnId], (errItems, items) => {
            if (errItems) return res.status(500).json(errItems);
            creditNote.items = items;
            res.json(creditNote);
        });
    });
});

// 6. UPDATE CREDIT NOTE
router.put('/:id', (req, res) => {
    const cnId = req.params.id;
    const { 
        lead_id, credit_date, reference, status, 
        sub_total, discount_val, discount_type, discount_calc, 
        total_tax, adjustment, total_amount, 
        items, admin_note, client_note, terms
    } = req.body;

    // A. Update Main Table
    const sql = `
        UPDATE credit_notes SET 
        lead_id=?, credit_date=?, reference_number=?, status=?, 
        sub_total=?, discount_val=?, discount_type=?, discount_calc=?, 
        total_tax=?, adjustment=?, total_amount=?, remaining_credits=?, 
        admin_note=?, client_note=?, terms=?
        WHERE id=?
    `;

    // Note: updating remaining_credits to total_amount assumes no credits have been "used" yet. 
    // In a complex system, you'd calculate (total_amount - used_amount). For now, resetting is safer for edits.
    const values = [
        lead_id, credit_date, reference, status,
        sub_total, discount_val, discount_type, discount_calc || 'after_tax',
        total_tax, adjustment, total_amount, total_amount, 
        admin_note, client_note, terms,
        cnId
    ];

    db.query(sql, values, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        // B. Update Items (Delete Old -> Insert New)
        db.query("DELETE FROM credit_note_items WHERE credit_note_id = ?", [cnId], (errDel) => {
            if (errDel) return res.status(500).json(errDel);

            if (items && items.length > 0) {
                const sqlItems = `INSERT INTO credit_note_items (credit_note_id, description, long_description, qty, rate, tax, amount) VALUES ?`;
                const itemValues = items.map(i => [cnId, i.description, i.long_description, i.qty, i.rate, i.tax, i.amount]);
                db.query(sqlItems, [itemValues]);
            }
            res.json({ message: "Credit Note Updated Successfully" });
        });
    });
});
// 7. DELETE CREDIT NOTE
router.delete('/:id', (req, res) => {
    const cnId = req.params.id;
    
    // Deleting the Credit Note will automatically delete its items 
    // IF you set up "ON DELETE CASCADE" in your SQL. 
    // If not, we run a delete query for items first just to be safe.
    
    const sqlDeleteItems = "DELETE FROM credit_note_items WHERE credit_note_id = ?";
    db.query(sqlDeleteItems, [cnId], (errItems) => {
        if (errItems) {
            console.error(errItems);
            // Continue anyway to try and delete the note
        }

        const sqlDeleteNote = "DELETE FROM credit_notes WHERE id = ?";
        db.query(sqlDeleteNote, [cnId], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Credit Note Deleted Successfully" });
        });
    });
});
// 8. APPLY CREDIT TO INVOICE
router.post('/apply-to-invoice', (req, res) => {
    const { credit_note_id, invoice_id, amount_to_credit } = req.body;

    // 1. Get Credit Note Details
    db.query("SELECT * FROM credit_notes WHERE id = ?", [credit_note_id], (err, cnResults) => {
        if (err || cnResults.length === 0) return res.status(500).json({ error: "Credit Note not found" });
        const creditNote = cnResults[0];

        if (creditNote.remaining_credits < amount_to_credit) {
            return res.status(400).json({ error: "Insufficient remaining credits" });
        }

        // 2. Get Invoice Details (assuming you have an 'invoices' table with 'due_amount' or similar)
        // You might need to adjust column names based on your Invoice table structure
        db.query("SELECT * FROM invoices WHERE id = ?", [invoice_id], (errInv, invResults) => {
            if (errInv || invResults.length === 0) return res.status(500).json({ error: "Invoice not found" });
            const invoice = invResults[0];

            // 3. Insert Record into credit_note_applies
            const sqlInsert = "INSERT INTO credit_note_applies (credit_note_id, invoice_id, amount) VALUES (?, ?, ?)";
            db.query(sqlInsert, [credit_note_id, invoice_id, amount_to_credit], (errApply) => {
                if (errApply) return res.status(500).json({ error: "Failed to apply credit" });

                // 4. Update Credit Note Remaining Balance
                const newRemaining = parseFloat(creditNote.remaining_credits) - parseFloat(amount_to_credit);
                const cnStatus = newRemaining === 0 ? 'Closed' : 'Open';
                
                db.query("UPDATE credit_notes SET remaining_credits = ?, status = ? WHERE id = ?", [newRemaining, cnStatus, credit_note_id]);

                // 5. Update Invoice Status (Example logic)
                // Assuming your invoice has 'paid_amount' and 'total_amount'
                // You might need to update this logic to match your specific Invoice table
                /* WARNING: You need to make sure your invoices table has a column to track payments/credits 
                   or reduce the due amount directly. This is a generic example:
                */
                // db.query("UPDATE invoices SET paid_amount = paid_amount + ?, status = IF(paid_amount + ? >= total_amount, 'Paid', 'Partial') WHERE id = ?", [amount_to_credit, amount_to_credit, invoice_id]);

                res.json({ message: "Credit applied successfully!" });
            });
        });
    });
});
module.exports = router;