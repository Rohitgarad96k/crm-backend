require('dotenv').config();
const express = require('express');
const cors = require('cors');

const startExpenseScheduler = require('./scheduler');

const app = express();
app.use(cors());
app.use(express.json());

// This makes the 'uploads' folder public so files can be downloaded
app.use('/uploads', express.static('uploads'));

// --- IMPORT ROUTES ---
const contactRoutes = require('./routes/ContactRoutes');
const leadRoutes = require('./routes/LeadsRoutes');
const groupRoutes = require('./routes/groupRoutes'); // <--- ADD THIS
const proposalRoutes = require('./routes/ProposalRoutes');
const estimateRoutes = require('./routes/EstimateRoutes');
const invoiceRoutes = require('./routes/InvoiceRoutes');
const paymentRoutes = require('./routes/PaymentRoutes');
const creditNoteRoutes = require('./routes/creditNoteRoutes');
const itemRoutes = require('./routes/itemRoutes');
const expenseRoutes = require('./routes/ExpenseRoutes');
const subscriptionRoutes = require('./routes/SubscriptionRoutes');

// --- USE ROUTES ---
app.use('/api/contact', contactRoutes);
app.use('/api/lead', leadRoutes);
app.use('/api/group', groupRoutes); 
app.use('/api/proposal', proposalRoutes);
app.use('/api/estimates', estimateRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/credit_notes', creditNoteRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // This activates the cron job to check for recurring expenses
    startExpenseScheduler(); 
});