const express = require('express');
const cors = require('cors');
// ... other imports

const app = express();
app.use(cors());
app.use(express.json());

// --- IMPORT ROUTES ---
const contactRoutes = require('./routes/ContactRoutes');
const leadRoutes = require('./routes/LeadsRoutes');
const groupRoutes = require('./routes/groupRoutes'); // <--- ADD THIS
const proposalRoutes = require('./routes/ProposalRoutes');

// --- USE ROUTES ---
app.use('/api/contact', contactRoutes);
app.use('/api/lead', leadRoutes);
app.use('/api/group', groupRoutes); // <--- ADD THIS
app.use('/api/proposal', proposalRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));