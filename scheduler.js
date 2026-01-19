const cron = require('node-cron');
const db = require('./config/db');

// Run everyday at Midnight (00:00)
const startExpenseScheduler = () => {
    console.log("⏰ Expense Scheduler Started...");

    cron.schedule('0 0 * * *', () => {
        console.log("🔄 Checking for recurring expenses...");
        const today = new Date();
        
        // 1. Get all recurring expenses
        const sql = "SELECT * FROM expenses WHERE is_recurring = 1";
        
        db.query(sql, (err, expenses) => {
            if (err) return console.error("Scheduler DB Error:", err);

            expenses.forEach(exp => {
                const entryDate = new Date(exp.entry_date);
                let shouldCreate = false;
                let newDate = new Date(today);

                // 2. Check Frequency Logic
                if (exp.frequency === 'Monthly') {
                    // Check if today is the same "Day of Month" as the entry date
                    if (today.getDate() === entryDate.getDate()) {
                        shouldCreate = true;
                    }
                } else if (exp.frequency === 'Weekly') {
                    // Check if today is the same "Day of Week" (0-6)
                    if (today.getDay() === entryDate.getDay()) {
                        shouldCreate = true;
                    }
                } else if (exp.frequency === 'Yearly') {
                    // Check Month and Date
                    if (today.getDate() === entryDate.getDate() && today.getMonth() === entryDate.getMonth()) {
                        shouldCreate = true;
                    }
                }

                // 3. Create the New Expense (Clone)
                if (shouldCreate) {
                    const insertSql = `
                        INSERT INTO expenses 
                        (entry_date, category, amount, customer_id, reference_no, payment_mode, note, expense_name, billable, is_recurring, frequency) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                    `;
                    
                    const newNote = `(Auto-Recurring) ${exp.note || ''}`;
                    const dateStr = today.toISOString().split('T')[0];

                    db.query(insertSql, [
                        dateStr, exp.category, exp.amount, exp.customer_id, 
                        exp.reference_no, exp.payment_mode, newNote, exp.expense_name, 
                        exp.billable, exp.frequency
                    ], (err, res) => {
                        if (err) console.error("Failed to auto-create expense:", err);
                        else console.log(`✅ Auto-created expense for ${exp.expense_name}`);
                    });
                }
            });
        });
    });
};

module.exports = startExpenseScheduler;