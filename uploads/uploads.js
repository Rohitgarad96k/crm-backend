const express = require("express");
const router = express.Router();
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const db = require("../config/db");

const upload = multer({ dest: "uploads/" });

// Import Leads
router.post("/import/leads", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "CSV file required" });

    const results = [];
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => {
        const errors = [];
        results.forEach((row, index) => {
          const leadData = {
            first_name: row.first_name,
            last_name: row.last_name,
            type: row.type || "Person",
            company: row.company,
            email: row.email,
            phone: row.phone,
            website: row.website,
            position: row.position,
            address: row.address,
            city: row.city,
            state: row.state,
            country: row.country,
            zipcode: row.zipcode,
            status: row.status || "New",
            source: row.source,
            industry: row.industry,
            assigned_to: row.assigned_to,
            tags: row.tags,
            lead_value: row.lead_value,
            currency: row.currency,
            visibility: row.visibility ?? 1,
            contacted_today: row.contacted_today ?? 0,
            description: row.description
          };

          db.query("INSERT INTO leads SET ?", leadData, (err) => {
            if (err) errors.push({ row: index + 1, error: err });
          });
        });

        res.json({ message: "Leads imported", total: results.length, errors });
        fs.unlinkSync(req.file.path);
      });
});

// Import Contacts (Customers)
router.post("/import/contacts", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "CSV file required" });

    const results = [];
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => {
        const errors = [];
        results.forEach((row, index) => {
          const contactData = {
            name: row.name,
            email: row.email,
            phone: row.phone,
            address: row.address,
            city: row.city,
            state: row.state,
            country: row.country,
            zipcode: row.zipcode,
            website: row.website,
            currency: row.currency,
            language: row.language,
            GST: row.GST
          };

          db.query("INSERT INTO contact SET ?", contactData, (err) => {
            if (err) errors.push({ row: index + 1, error: err });
          });
        });

        res.json({ message: "Contacts imported", total: results.length, errors });
        fs.unlinkSync(req.file.path);
      });
});
module.exports = router;
