const mysql = require('mysql2');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Debugging: Print what the code sees (Don't worry, this runs in your terminal only)
console.log("--- DEBUGGING DATABASE CONNECTION ---");
console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_USER:", process.env.DB_USER);
console.log("DB_PASSWORD (Check):", process.env.DB_PASSWORD ? "Loaded (Not Empty)" : "MISSING/EMPTY");
console.log("-------------------------------------");

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, // <--- MUST MATCH .env (DB_PASSWORD)
    database: process.env.DB_NAME
});

db.connect(err => {
    if (err) {
        console.error("❌ Database Connection Failed:", err.message);
        return;
    }
    console.log("✅ MySQL Connected Successfully!");
});

module.exports = db;