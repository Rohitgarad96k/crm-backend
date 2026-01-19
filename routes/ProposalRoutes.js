const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ==========================
// GET PROPOSAL STATS (For Dashboard Cards)
// ==========================
router.get('/stats', (req, res) => {
    const sql = `
        SELECT 
            COUNT(*) as total_count,
            SUM(total_amount) as total_value,
            SUM(CASE WHEN status != 'Accepted' AND status != 'Declined' THEN 1 ELSE 0 END) as ongoing_count,
            SUM(CASE WHEN status = 'Accepted' OR status = 'Declined' THEN 1 ELSE 0 END) as closed_count
        FROM lead_proposals
    `;
    db.query(sql, (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result[0]);
    });
});

// ==========================
// GET ALL PROPOSALS (For List View)
// ==========================
router.get('/', (req, res) => {
    // Join with 'leads' to get the name of who the proposal is for
    const sql = `
        SELECT p.*, l.name as lead_name, l.company as lead_company 
        FROM lead_proposals p
        LEFT JOIN leads l ON p.lead_id = l.id
        ORDER BY p.id DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// ==========================
// CREATE PROPOSAL + ITEMS
// ==========================
router.post('/create', (req, res) => {
    console.log("Received Proposal Data:", req.body); // Debugging

    const { 
        lead_id, subject, assigned_to, proposal_date, open_till, currency, status,
        to_name, address, city, state, country, zip, email, phone,
        items, sub_total, discount_val, discount_type, adjustment, total_amount,
        tags, allow_comments, related_to
    } = req.body;

    const sqlProposal = `INSERT INTO lead_proposals 
    (lead_id, subject, assigned_to, proposal_date, open_till, currency, status, 
    to_name, address, city, state, country, zip, email, phone, 
    sub_total, discount_val, discount_type, adjustment, total_amount, 
    tags, allow_comments, related_to) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
        lead_id, 
        subject, 
        assigned_to, 
        proposal_date || null, // FIX: Sends NULL if empty
        open_till || null,     // FIX: Sends NULL if empty
        currency, 
        status,
        to_name, 
        address, 
        city, 
        state, 
        country, 
        zip, 
        email, 
        phone,
        sub_total, 
        discount_val || 0, 
        discount_type, 
        adjustment || 0, 
        total_amount,
        tags, 
        allow_comments ? 1 : 0, 
        related_to
    ];

    db.query(sqlProposal, values, (err, result) => {
        if (err) {
            console.error("❌ SQL Error (Insert Proposal):", err.message);
            return res.status(500).json({ error: err.message });
        }
        
        const proposalId = result.insertId;

        // Insert Items (if any)
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
// UPDATE PROPOSAL STATUS (For Kanban Drag & Drop)
// ==========================
router.put('/update-status/:id', (req, res) => {
    const { status } = req.body;
    const { id } = req.params;

    const sql = "UPDATE lead_proposals SET status = ? WHERE id = ?";
    
    db.query(sql, [status, id], (err, result) => {
        if (err) {
            console.error("Error updating status:", err);
            return res.status(500).json({ error: "Failed to update status" });
        }
        res.json({ message: "Status updated successfully" });
    });
});
// ==========================
// GET SINGLE PROPOSAL + ITEMS
// ==========================
router.get('/:id', (req, res) => {
    const { id } = req.params;

    // 1. Get Proposal Details
    const sqlProposal = `
        SELECT p.*, l.name as lead_name, l.company as lead_company, l.email as lead_email 
        FROM lead_proposals p
        LEFT JOIN leads l ON p.lead_id = l.id
        WHERE p.id = ?
    `;

    db.query(sqlProposal, [id], (err, results) => {
        if (err) return res.status(500).json(err);
        if (results.length === 0) return res.status(404).json({ message: 'Proposal not found' });

        const proposal = results[0];

        // 2. Get Proposal Items
        const sqlItems = "SELECT * FROM proposal_items WHERE proposal_id = ?";
        db.query(sqlItems, [id], (errItems, items) => {
            if (errItems) return res.status(500).json(errItems);
            
            // Combine them
            proposal.items = items;
            res.json(proposal);
        });
    });
});

// ==========================
// GET COMMENTS FOR A PROPOSAL
// ==========================
router.get('/comments/:id', (req, res) => {
    const sql = "SELECT * FROM proposal_comments WHERE proposal_id = ? ORDER BY created_at DESC";
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// ==========================
// ADD A NEW COMMENT
// ==========================
router.post('/comments/:id', (req, res) => {
    const { content } = req.body;
    const sql = "INSERT INTO proposal_comments (proposal_id, content) VALUES (?, ?)";
    db.query(sql, [req.params.id, content], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Comment added", id: result.insertId });
    });
});
// ==========================
// UPDATE A COMMENT
// ==========================
router.put('/comments/:commentId', (req, res) => {
    const { content } = req.body;
    const { commentId } = req.params;
    
    const sql = "UPDATE proposal_comments SET content = ? WHERE id = ?";
    db.query(sql, [content, commentId], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Comment updated" });
    });
});

// ==========================
// DELETE A COMMENT
// ==========================
router.delete('/comments/:commentId', (req, res) => {
    const { commentId } = req.params;
    
    const sql = "DELETE FROM proposal_comments WHERE id = ?";
    db.query(sql, [commentId], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Comment deleted" });
    });
});
// ==========================
// GET REMINDERS
// ==========================
router.get('/reminders/:id', (req, res) => {
    const sql = "SELECT * FROM proposal_reminders WHERE proposal_id = ? ORDER BY date_notified ASC";
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// ==========================
// ADD REMINDER
// ==========================
router.post('/reminders/:id', (req, res) => {
    const { date_notified, reminder_to, description, send_email } = req.body;
    const sql = "INSERT INTO proposal_reminders (proposal_id, date_notified, reminder_to, description, send_email) VALUES (?, ?, ?, ?, ?)";
    db.query(sql, [req.params.id, date_notified, reminder_to, description, send_email ? 1 : 0], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Reminder added", id: result.insertId });
    });
});

// ==========================
// DELETE REMINDER
// ==========================
router.delete('/reminders/:id', (req, res) => {
    const sql = "DELETE FROM proposal_reminders WHERE id = ?";
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Reminder deleted" });
    });
});



// ==========================
// GET TASKS FOR A PROPOSAL
// ==========================
router.get('/tasks/:id', (req, res) => {
    const sql = "SELECT * FROM tasks WHERE rel_type = 'Proposal' AND rel_id = ? ORDER BY start_date DESC";
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// ==========================
// ADD A NEW TASK (FIXED)
// ==========================
router.post('/tasks/:id', (req, res) => {
    // 1. Get data from Frontend
    const { 
        subject, hourly_rate, start_date, due_date, priority, 
        assignees, tags, description, is_public, is_billable // <--- Fixed variable name
    } = req.body;

    const sql = `INSERT INTO tasks 
    (rel_type, rel_id, subject, hourly_rate, start_date, due_date, priority, assignees, tags, description, is_public, billable, status) 
    VALUES ('Proposal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Not Started')`;

    const values = [
        req.params.id, 
        subject, 
        hourly_rate || 0, 
        start_date, 
        due_date || null,      // <--- CRITICAL FIX: Sends NULL instead of ""
        priority, 
        assignees, 
        tags || null,          // <--- FIX: Handles missing tags
        description, 
        is_public ? 1 : 0, 
        is_billable ? 1 : 0    // <--- FIX: Matches frontend name
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error("SQL Error (Add Task):", err.message); // Helpful for debugging
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: "Task created", id: result.insertId });
    });
});

// ==========================
// DELETE A TASK
// ==========================
router.delete('/tasks/:taskId', (req, res) => {
    const sql = "DELETE FROM tasks WHERE id = ?";
    db.query(sql, [req.params.taskId], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Task deleted" });
    });
});

// ==========================
// GET NOTES
// ==========================
router.get('/notes/:id', (req, res) => {
    const sql = "SELECT * FROM proposal_notes WHERE proposal_id = ? ORDER BY created_at DESC";
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// ==========================
// ADD NOTE
// ==========================
router.post('/notes/:id', (req, res) => {
    const { content } = req.body;
    const sql = "INSERT INTO proposal_notes (proposal_id, content) VALUES (?, ?)";
    db.query(sql, [req.params.id, content], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Note added", id: result.insertId });
    });
});

// ==========================
// UPDATE NOTE
// ==========================
router.put('/notes/:noteId', (req, res) => {
    const { content } = req.body;
    const sql = "UPDATE proposal_notes SET content = ? WHERE id = ?";
    db.query(sql, [content, req.params.noteId], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Note updated" });
    });
});

// ==========================
// DELETE NOTE
// ==========================
router.delete('/notes/:noteId', (req, res) => {
    const sql = "DELETE FROM proposal_notes WHERE id = ?";
    db.query(sql, [req.params.noteId], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Note deleted" });
    });
});
// ==========================
// GET TEMPLATES
// ==========================
router.get('/templates/:id', (req, res) => {
    const sql = "SELECT * FROM proposal_templates WHERE proposal_id = ? ORDER BY created_at DESC";
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// ==========================
// ADD TEMPLATE
// ==========================
router.post('/templates/:id', (req, res) => {
    const { title, content } = req.body;
    const sql = "INSERT INTO proposal_templates (proposal_id, title, content) VALUES (?, ?, ?)";
    db.query(sql, [req.params.id, title, content], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Template added", id: result.insertId });
    });
});

// ==========================
// DELETE TEMPLATE
// ==========================
router.delete('/templates/:id', (req, res) => {
    const sql = "DELETE FROM proposal_templates WHERE id = ?";
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Template deleted" });
    });
});
// ==========================
// UPDATE PROPOSAL (Robust Version)
// ==========================
router.put('/update/:id', (req, res) => {
    const proposalId = req.params.id;
    const { 
        subject, lead_id, proposal_date, open_till, currency, status, 
        assigned_to, to_name, address, city, state, country, zip, email, phone,
        sub_total, discount_val, adjustment, total_amount, items, tags, related_to
    } = req.body;

    // DEBUG: Print received data
    console.log("Updating Proposal:", proposalId, req.body);

    const sqlUpdate = `
        UPDATE lead_proposals SET 
        subject=?, lead_id=?, proposal_date=?, open_till=?, currency=?, status=?, 
        assigned_to=?, to_name=?, address=?, city=?, state=?, country=?, zip=?, email=?, phone=?,
        sub_total=?, discount_val=?, adjustment=?, total_amount=?, tags=?, related_to=?
        WHERE id=?
    `;

    const values = [
        subject, 
        lead_id || null, // Handle 0 or empty string as null if acceptable, or ensure ID exists
        proposal_date || null, 
        open_till || null, 
        currency || 'USD', 
        status || 'Draft',
        assigned_to || 'Admin', 
        to_name || '', 
        address || '', 
        city || '', 
        state || '', 
        country || '', 
        zip || '', 
        email || '', 
        phone || '',
        sub_total || 0, 
        discount_val || 0, 
        adjustment || 0, 
        total_amount || 0, 
        tags || '',
        related_to || 'Customer', // Ensure this field exists in your DB
        proposalId
    ];

    db.query(sqlUpdate, values, (err, result) => {
        if (err) {
            console.error("❌ SQL Error (Update Proposal):", err.message);
            return res.status(500).json({ error: "Database error: " + err.message });
        }

        // 2. Update Items
        const sqlDeleteItems = "DELETE FROM proposal_items WHERE proposal_id = ?";
        db.query(sqlDeleteItems, [proposalId], (errDel) => {
            if (errDel) {
                console.error("❌ SQL Error (Delete Items):", errDel.message);
                return res.status(500).json({ error: "Failed to clear old items" });
            }

            if (items && items.length > 0) {
                const sqlInsertItems = `INSERT INTO proposal_items 
                (proposal_id, description, long_description, qty, rate, tax, amount) 
                VALUES ?`;

                const itemValues = items.map(item => [
                    proposalId, 
                    item.description || '', 
                    item.long_description || '', 
                    item.qty || 0, 
                    item.rate || 0, 
                    item.tax || 0, 
                    item.amount || 0
                ]);

                db.query(sqlInsertItems, [itemValues], (errInsert) => {
                    if (errInsert) {
                        console.error("❌ SQL Error (Insert Items):", errInsert.message);
                        return res.status(500).json({ error: "Failed to save items" });
                    }
                    res.json({ message: "Proposal updated successfully" });
                });
            } else {
                res.json({ message: "Proposal updated successfully (No items)" });
            }
        });
    });
});
// ==========================
// SEND EMAIL (Simulated + Tracking)
// ==========================
router.post('/send-email/:id', (req, res) => {
    const proposalId = req.params.id;
    const { to, subject, message } = req.body;

    console.log(`Attempting to send email for Proposal #${proposalId} to ${to}`);

    // NOTE: To send REAL emails, you would use 'nodemailer' here.
    // For now, we simulate success and update the counter.

    // 1. Update the 'emails_sent' count
    // COALESCE ensures that if emails_sent is NULL, it treats it as 0
    const sqlUpdate = `
        UPDATE lead_proposals 
        SET emails_sent = COALESCE(emails_sent, 0) + 1 
        WHERE id = ?
    `;

    db.query(sqlUpdate, [proposalId], (err, result) => {
        if (err) {
            console.error("❌ SQL Error (Send Email):", err.message);
            return res.status(500).json({ error: "Database error: " + err.message });
        }
        
        console.log("✅ Email count updated successfully");
        res.json({ message: "Email sent successfully" });
    });
});
// ==========================
// DELETE PROPOSAL (Main)
// ==========================
router.delete('/:id', (req, res) => {
    // This will delete the proposal. 
    // If your DB is set up with ON DELETE CASCADE, it will auto-delete items/comments too.
    const sql = "DELETE FROM lead_proposals WHERE id = ?";
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Proposal deleted successfully" });
    });
});

// ==========================
// CONVERT PROPOSAL
// ==========================
router.post('/convert/:id', (req, res) => {
    const proposalId = req.params.id;
    const { type } = req.body; // 'Invoice' or 'Estimate'

    // 1. Get Proposal Details first
    db.query("SELECT * FROM lead_proposals WHERE id = ?", [proposalId], (err, results) => {
        if (err) return res.status(500).json(err);
        if (results.length === 0) return res.status(404).json({ message: "Proposal not found" });

        const p = results[0];
        let sqlInsert = "";
        let values = [];

        if (type === 'Invoice') {
            sqlInsert = `INSERT INTO invoices (proposal_id, lead_id, invoice_number, status, issue_date, due_date, total_amount) VALUES (?, ?, ?, 'Unpaid', NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY), ?)`;
            values = [p.id, p.lead_id, `INV-${p.id}`, p.total_amount];
        } else {
            sqlInsert = `INSERT INTO estimates (proposal_id, lead_id, estimate_number, status, valid_until, total_amount) VALUES (?, ?, ?, 'Draft', DATE_ADD(NOW(), INTERVAL 7 DAY), ?)`;
            values = [p.id, p.lead_id, `EST-${p.id}`, p.total_amount];
        }

        // 2. Insert into new table
        db.query(sqlInsert, values, (insertErr, insertRes) => {
            if (insertErr) return res.status(500).json({ error: "Conversion failed: " + insertErr.message });

            // 3. Update Proposal Status to 'Accepted' (or 'Converted')
            db.query("UPDATE lead_proposals SET status = 'Accepted' WHERE id = ?", [proposalId], () => {
                res.json({ message: `Successfully converted to ${type}`, newId: insertRes.insertId });
            });
        });
    });
});
module.exports = router;