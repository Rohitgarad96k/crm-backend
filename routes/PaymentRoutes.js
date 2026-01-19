const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. GET ALL PAYMENTS (For Payment List Page)
router.get('/', (req, res) => {
    const sql = `
        SELECT p.*, i.invoice_number, c.name as customer_name 
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        JOIN contacts c ON p.customer_id = c.id
        ORDER BY p.payment_date DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// 2. RECORD A NEW PAYMENT
router.post('/create', (req, res) => {
    const { invoice_id, customer_id, amount, payment_mode, transaction_id, payment_date, note } = req.body;

    // A. Insert Payment Record
    const sqlInsert = `INSERT INTO payments (invoice_id, customer_id, amount, payment_mode, transaction_id, payment_date, note) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(sqlInsert, [invoice_id, customer_id, amount, payment_mode, transaction_id, payment_date, note], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        // B. Recalculate Invoice Status & Amount Paid
        // We calculate the sum of ALL payments for this invoice to be safe/accurate
        const sqlSum = `SELECT SUM(amount) as total_paid FROM payments WHERE invoice_id = ?`;
        
        db.query(sqlSum, [invoice_id], (errSum, sumResult) => {
            const totalPaid = sumResult[0].total_paid || 0;

            // Get Invoice Total to compare
            db.query(`SELECT total_amount FROM invoices WHERE id = ?`, [invoice_id], (errInv, invResult) => {
                const invoiceTotal = invResult[0].total_amount;
                
                let newStatus = 'Partially Paid';
                if (parseFloat(totalPaid) >= parseFloat(invoiceTotal)) {
                    newStatus = 'Paid';
                }

                // C. Update Invoice Table
                const sqlUpdateInv = `UPDATE invoices SET amount_paid = ?, status = ?, payment_status = ? WHERE id = ?`;
                db.query(sqlUpdateInv, [totalPaid, newStatus, newStatus, invoice_id], (errUpd) => {
                    if (errUpd) console.error("Error updating invoice status:", errUpd);
                    
                    res.json({ message: "Payment recorded successfully", newStatus });
                });
            });
        });
    });
});

// 3. DELETE PAYMENT (And Revert Invoice Status)
router.delete('/:id', (req, res) => {
    const paymentId = req.params.id;

    // Get invoice_id before deleting
    db.query(`SELECT invoice_id FROM payments WHERE id = ?`, [paymentId], (err, result) => {
        if (!result.length) return res.status(404).json({ message: "Payment not found" });
        
        const invoice_id = result[0].invoice_id;

        // Delete Payment
        db.query(`DELETE FROM payments WHERE id = ?`, [paymentId], () => {
            
            // Recalculate Invoice (Revert Logic)
            const sqlSum = `SELECT SUM(amount) as total_paid FROM payments WHERE invoice_id = ?`;
            db.query(sqlSum, [invoice_id], (errSum, sumResult) => {
                const totalPaid = sumResult[0].total_paid || 0; // Might be 0 now

                db.query(`SELECT total_amount FROM invoices WHERE id = ?`, [invoice_id], (errInv, invResult) => {
                    const invoiceTotal = invResult[0].total_amount;
                    let newStatus = 'Partially Paid';
                    if (totalPaid === 0) newStatus = 'Unpaid';
                    else if (totalPaid >= invoiceTotal) newStatus = 'Paid';

                    db.query(`UPDATE invoices SET amount_paid = ?, status = ?, payment_status = ? WHERE id = ?`, 
                        [totalPaid, newStatus, newStatus, invoice_id]);
                    
                    res.json({ message: "Payment deleted and invoice updated" });
                });
            });
        });
    });
});
// GET Single Payment Details
router.get('/:id', (req, res) => {
    const sql = `
        SELECT p.*, 
               i.invoice_number, 
               c.name AS customer_name, 
               c.id AS lead_id
        FROM payments p
        LEFT JOIN invoices i ON p.invoice_id = i.id
        LEFT JOIN contacts c ON p.customer_id = c.id
        WHERE p.id = ?
    `;

    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Database error" });
        }
        if (result.length === 0) {
            return res.status(404).json({ error: "Payment not found" });
        }
        res.json(result[0]);
    });
});
// 4. UPDATE Payment (SMART SYNC - Updates Invoice too!)
router.put('/:id', (req, res) => {
    const paymentId = req.params.id;
    const { amount, payment_date, payment_mode, transaction_id, note } = req.body;

    // 1. Get the OLD payment details first
    const getOldPayment = "SELECT * FROM payments WHERE id = ?";

    db.query(getOldPayment, [paymentId], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (results.length === 0) return res.status(404).json({ error: "Payment not found" });

        const oldPayment = results[0];
        const oldAmount = parseFloat(oldPayment.amount);
        const newAmount = parseFloat(amount);
        const invoiceId = oldPayment.invoice_id;

        // 2. Update the Payment Record
        const updatePaymentSql = `
            UPDATE payments 
            SET amount=?, payment_date=?, payment_mode=?, transaction_id=?, note=? 
            WHERE id=?
        `;

        db.query(updatePaymentSql, [amount, payment_date, payment_mode, transaction_id, note, paymentId], (err2) => {
            if (err2) return res.status(500).json({ error: "Failed to update payment record" });

            // 3. Calculate Difference (New - Old)
            const difference = newAmount - oldAmount;
            
            // 4. Update Invoice 'amount_paid' (FIXED COLUMN NAME HERE)
            const updateInvoiceSql = "UPDATE invoices SET amount_paid = amount_paid + ? WHERE id = ?";
            
            db.query(updateInvoiceSql, [difference, invoiceId], (err3) => {
                if (err3) {
                    console.error("Invoice Sync Error:", err3);
                    return res.status(500).json({ error: "Payment updated, but failed to sync invoice" });
                }

                // 5. Recalculate Invoice Status
                const checkInvoiceSql = "SELECT total_amount, amount_paid FROM invoices WHERE id = ?";
                
                db.query(checkInvoiceSql, [invoiceId], (err4, invResults) => {
                    if (err4) return res.status(500).json({ error: "Failed to fetch invoice status" });
                    
                    const inv = invResults[0];
                    let newStatus = 'Unpaid';
                    let paymentStatus = 'Unpaid';

                    const total = parseFloat(inv.total_amount);
                    const paid = parseFloat(inv.amount_paid);

                    if (paid >= total - 0.01) { 
                        newStatus = 'Paid';
                        paymentStatus = 'Paid';
                    } else if (paid > 0) {
                        newStatus = 'Partial'; // Or 'Partially Paid' depending on your preference
                        paymentStatus = 'Partially Paid';
                    }

                    // 6. Final Status Update (FIXED COLUMN NAMES)
                    db.query("UPDATE invoices SET status = ?, payment_status = ? WHERE id = ?", [newStatus, paymentStatus, invoiceId], (err5) => {
                        if (err5) return res.status(500).json({ error: "Status update failed" });
                        
                        res.json({ message: "Payment updated and Invoice synced successfully!" });
                    });
                });
            });
        });
    });
});
module.exports = router;