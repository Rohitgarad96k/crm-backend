const mysql = require('mysql2');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Debugging: Print what the code sees
console.log("--- DEBUGGING DATABASE CONNECTION ---");
console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_USER:", process.env.DB_USER);
console.log("DB_PASSWORD (Check):", process.env.DB_PASSWORD ? "Loaded (Not Empty)" : "MISSING/EMPTY");
console.log("-------------------------------------");

// ✅ CHANGE: Use createPool instead of createConnection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10, // Max 10 simultaneous connections
    queueLimit: 0
});

// Test the connection pool on startup
db.getConnection((err, connection) => {
    if (err) {
        console.error("❌ Database Connection Failed:", err.message);
    } else {
        console.log("✅ MySQL Connected Successfully via Pool!");
        connection.release(); // Important: Release the connection back to the pool
    }
});

module.exports = db;