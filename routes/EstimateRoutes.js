const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ==========================
// 1. GET ESTIMATE STATS
// ==========================
router.get('/stats', (req, res) => {
    const sql = `
        SELECT 
            SUM(CASE WHEN status = 'Draft' THEN 1 ELSE 0 END) as draft_count,
            SUM(CASE WHEN status = 'Sent' THEN 1 ELSE 0 END) as sent_count,
            SUM(CASE WHEN status = 'Expired' THEN 1 ELSE 0 END) as expired_count,
            SUM(CASE WHEN status = 'Declined' THEN 1 ELSE 0 END) as declined_count,
            SUM(CASE WHEN status = 'Accepted' THEN 1 ELSE 0 END) as accepted_count
        FROM estimates
    `;
    db.query(sql, (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result[0]);
    });
});

// ==========================
// 2. GET ALL ESTIMATES
// ==========================
router.get('/', (req, res) => {
    const sql = `
        SELECT e.*, c.name AS customer_name 
        FROM estimates e
        LEFT JOIN contacts c ON e.lead_id = c.id
        ORDER BY e.id DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// ==========================
// 3. GET NEXT NUMBER
// ==========================
router.get('/next-number', (req, res) => {
    const sql = "SELECT estimate_number FROM estimates ORDER BY id DESC LIMIT 1";
    db.query(sql, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let nextNumber = 'EST-000001';
        if (result.length > 0 && result[0].estimate_number) {
            const lastNum = result[0].estimate_number; 
            const parts = lastNum.split('-'); 
            if (parts.length === 2) {
                const numPart = parseInt(parts[1]); 
                if (!isNaN(numPart)) {
                    nextNumber = `EST-${String(numPart + 1).padStart(6, '0')}`;
                }
            }
        }
        res.json({ nextNumber });
    });
});

// ==========================
// 4. GET SINGLE ESTIMATE (Needed for Edit Page)
// ==========================
router.get('/:id', (req, res) => {
    // A. Get Estimate Details
    const sqlEstimate = `
        SELECT e.*, c.name as customer_name, c.address, c.city, c.country, c.billing_address, c.shipping_address 
        FROM estimates e 
        LEFT JOIN contacts c ON e.lead_id = c.id 
        WHERE e.id = ?`;
    
    db.query(sqlEstimate, [req.params.id], (err, result) => {
        if (err) return res.status(500).json(err);
        if (result.length === 0) return res.status(404).json({ message: "Estimate not found" });

        const estimate = result[0];

        // B. Get Estimate Items
        const sqlItems = `SELECT * FROM estimate_items WHERE estimate_id = ?`;
        db.query(sqlItems, [req.params.id], (errItems, resultItems) => {
            if (errItems) return res.status(500).json(errItems);
            
            estimate.items = resultItems; // Attach items to response
            res.json(estimate);
        });
    });
});
// 5. CREATE NEW ESTIMATE 
router.post('/create', (req, res) => {
    const { 
        lead_id, issue_date, valid_until, reference, tags, 
        currency, status, sale_agent, discount_type, discount_calc,
        admin_note, client_note, terms,
        sub_total, discount_val, total_tax, adjustment, total_amount, // <--- Added total_tax
        items 
    } = req.body;

    const sqlEstimate = `
        INSERT INTO estimates (
            lead_id, issue_date, valid_until, reference_number, tags, 
            currency, status, sale_agent, discount_type, discount_calc,
            admin_note, client_note, terms,
            sub_total, discount_val, total_tax, adjustment, total_amount,  -- <--- Added Column
            estimate_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const tempNum = `EST-${Date.now()}`; 

    const values = [
        lead_id, issue_date, valid_until || null, reference, tags,
        currency, status, sale_agent, discount_type, discount_calc || 'after_tax',
        admin_note, client_note, terms,
        sub_total, discount_val, total_tax, adjustment, total_amount, // <--- Added Value
        tempNum
    ];

    db.query(sqlEstimate, values, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        const newEstimateId = result.insertId;
        const realEstimateNum = `EST-${String(newEstimateId).padStart(6, '0')}`;

        // Update with real number
        db.query("UPDATE estimates SET estimate_number = ? WHERE id = ?", [realEstimateNum, newEstimateId]);

        // Insert Items
        if (items && items.length > 0) {
            const sqlItems = `INSERT INTO estimate_items (estimate_id, description, long_description, qty, rate, tax, amount) VALUES ?`;
            const itemValues = items.map(item => [
                newEstimateId, item.description, item.long_description || '', item.qty, item.rate, item.tax || 0, item.amount
            ]);
            db.query(sqlItems, [itemValues]);
        }

        res.json({ message: "Estimate created", id: newEstimateId });
    });
});
// 6. UPDATE ESTIMATE (Fixed: Added total_tax)
router.put('/:id', (req, res) => {
    const { 
        lead_id, issue_date, valid_until, reference, tags, 
        currency, status, sale_agent, discount_type, discount_calc,
        admin_note, client_note, terms,
        sub_total, discount_val, total_tax, adjustment, total_amount, // <--- Added total_tax
        items 
    } = req.body;

    const sqlUpdate = `
        UPDATE estimates SET 
        lead_id=?, issue_date=?, valid_until=?, reference_number=?, tags=?, 
        currency=?, status=?, sale_agent=?, discount_type=?, discount_calc=?,
        admin_note=?, client_note=?, terms=?, 
        sub_total=?, discount_val=?, total_tax=?, adjustment=?, total_amount=? 
        WHERE id=?
    `;

    const values = [
        lead_id, issue_date, valid_until || null, reference, tags,
        currency, status, sale_agent, discount_type, discount_calc || 'after_tax',
        admin_note, client_note, terms,
        sub_total, discount_val, total_tax, adjustment, total_amount, // <--- Added value
        req.params.id
    ];

    db.query(sqlUpdate, values, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        db.query("DELETE FROM estimate_items WHERE estimate_id = ?", [req.params.id], (errDel) => {
             if (errDel) return res.status(500).json(errDel);

             if (items && items.length > 0) {
                const sqlItems = "INSERT INTO estimate_items (estimate_id, description, long_description, qty, rate, tax, amount) VALUES ?";
                const itemValues = items.map(item => [
                    req.params.id, item.description, item.long_description || '', item.qty, item.rate, item.tax || 0, item.amount
                ]);
                db.query(sqlItems, [itemValues]);
             }
             
             res.json({ message: "Estimate Updated Successfully" });
        });
    });
});
// ==========================
// 7. CONVERT ESTIMATE TO INVOICE
// ==========================
router.post('/:id/convert', (req, res) => {
    const estimateId = req.params.id;

    // A. Get Estimate Data
    db.query(`SELECT * FROM estimates WHERE id = ?`, [estimateId], (err, estResult) => {
        if (err || estResult.length === 0) return res.status(404).json({ error: "Estimate not found" });
        const est = estResult[0];

        // B. Generate New Invoice Number (Auto-Increment Logic)
        db.query("SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 1", (errNum, numResult) => {
            let nextInvNum = 'INV-000001';
            if (numResult.length > 0 && numResult[0].invoice_number) {
                const parts = numResult[0].invoice_number.split('-');
                if (parts.length === 2) {
                     const numPart = parseInt(parts[1]);
                     if (!isNaN(numPart)) nextInvNum = `INV-${String(numPart + 1).padStart(6, '0')}`;
                }
            }

            // C. Insert into Invoices
            const sqlInsertInv = `
                INSERT INTO invoices 
                (lead_id, invoice_number, issue_date, due_date, sale_agent, 
                 sub_total, discount_val, total_tax, adjustment, total_amount, 
                 discount_type, discount_calc, terms, client_note, admin_note, status)
                VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Unpaid')
            `;
            
            const values = [
                est.lead_id, nextInvNum, est.sale_agent, 
                est.sub_total, est.discount_val, est.total_tax, est.adjustment, est.total_amount,
                est.discount_type, est.discount_calc, est.terms, est.client_note, est.admin_note
            ];

            db.query(sqlInsertInv, values, (errInv, invResult) => {
                if (errInv) return res.status(500).json({ error: errInv.message });
                const newInvoiceId = invResult.insertId;

                // D. Copy Items from Estimate to Invoice
                db.query(`SELECT * FROM estimate_items WHERE estimate_id = ?`, [estimateId], (errItems, items) => {
                    if (items.length > 0) {
                        const sqlInsertItems = `INSERT INTO invoice_items (invoice_id, description, long_description, qty, rate, tax, amount) VALUES ?`;
                        const itemValues = items.map(i => [newInvoiceId, i.description, i.long_description, i.qty, i.rate, i.tax, i.amount]);
                        db.query(sqlInsertItems, [itemValues]);
                    }

                    // E. Update Estimate Status to 'Invoiced'
                    db.query(`UPDATE estimates SET status = 'Invoiced' WHERE id = ?`, [estimateId]);

                    res.json({ message: "Converted successfully", invoiceId: newInvoiceId });
                });
            });
        });
    });
});

module.exports = router;