const express = require("express");
const router = express.Router();
const db = require("../config/db");

function generateInvNo(count) {
  return `#INV${String(count + 1).padStart(4, "0")}`;
}

function calculateInvoice(items, discount = 0, taxPercent = 0) {
  let subTotal = 0;

  items.forEach(item => {
    item.total = Number(item.price) * Number(item.quantity);
    subTotal += item.total;
  });

  const discountAmount = (subTotal * discount) / 100;
  const afterDiscount = subTotal - discountAmount;

  const taxAmount = (afterDiscount * taxPercent) / 100;

  const grandTotal = afterDiscount + taxAmount;

  return {
    sub_total: subTotal.toFixed(2),
    discount: discountAmount.toFixed(2),
    tax: taxAmount.toFixed(2),
    total: grandTotal.toFixed(2)
  };
}


// ------------------------------------
// Amount in Words (Indian System)
// ------------------------------------
function numberToWords(num) {
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six",
    "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
    "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];

  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty",
    "Sixty", "Seventy", "Eighty", "Ninety"];

  function inWords(num) {
    if ((num = num.toString()).length > 9) return "Overflow";

    let n = ("000000000" + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);

    if (!n) return;

    let str = "";
    str += n[1] != 0 ? (a[Number(n[1])] || b[n[1][0]] + " " + a[n[1][1]]) + " Crore " : "";
    str += n[2] != 0 ? (a[Number(n[2])] || b[n[2][0]] + " " + a[n[2][1]]) + " Lakh " : "";
    str += n[3] != 0 ? (a[Number(n[3])] || b[n[3][0]] + " " + a[n[3][1]]) + " Thousand " : "";
    str += n[4] != 0 ? (a[Number(n[4])] || b[n[4][0]] + " " + a[n[4][1]]) + " Hundred " : "";
    str += n[5] != 0 ? ((str != "") ? "and " : "") +
      (a[Number(n[5])] || b[n[5][0]] + " " + a[n[5][1]]) : "";

    return str.trim();
  }

  return inWords(Math.floor(num)) + " Rupees Only";
}


// ==========================
// Get All Invoices
// ==========================
router.get("/", (req, res) => {
  db.query("SELECT * FROM invoice", (err, result) => {
    if (err) return res.status(500).json({ error: err });
    res.json(result);
  });
});

// ==========================
// Get Single Invoice + Items
// ==========================
router.get("/:inv_no", (req, res) => {
  const { inv_no } = req.params;

  db.query("SELECT * FROM invoice WHERE inv_no=?", [inv_no], (err, invoice) => {
    if (err) return res.status(500).json({ error: err });
    if (!invoice.length) return res.status(404).json({ message: "Invoice not found" });

    db.query(
      "SELECT * FROM invoice_items WHERE invoice_id=?",
      [invoice[0].id],
      (err, items) => {
        if (err) return res.status(500).json({ error: err });

        res.json({
          invoice: invoice[0],
          items
        });
      }
    );
  });
});

// ==========================
// Create Invoice + Items
// ==========================
router.post("/", (req, res) => {
  const invoice = req.body;

  db.query("SELECT COUNT(*) AS total FROM invoice", (err, result) => {
    if (err) return res.status(500).json({ error: err });

    const invNo = generateInvNo(result[0].total);

    // ---- Auto Calculation ----
    const calc = calculateInvoice(invoice.items, invoice.discount || 0, invoice.tax || 0);

    const sql = `
      INSERT INTO invoice 
      (inv_no, bill_to, ship_to, company_name, currency,
       issue_date, due_date, payment_method,
       sub_total, tax, discount, total, ammount_words, status,
       terms_conditions, note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    db.query(
      sql,
      [
        invNo,
        invoice.bill_to,
        invoice.ship_to,
        invoice.company_name,
        invoice.currency || "INR",
        invoice.issue_date,
        invoice.due_date,
        invoice.payment_method,
        calc.sub_total,
        calc.tax,
        calc.discount,
        calc.total,
        numberToWords(calc.total),
        invoice.status || "Draft",
        invoice.terms_conditions,
        invoice.note
      ],
      (err, result) => {
        if (err) return res.status(500).json({ error: err });

        const invoiceId = result.insertId;

        const values = invoice.items.map(item => [
          invoiceId,
          item.name,
          item.quantity,
          item.price,
          item.total
        ]);

        db.query(
          "INSERT INTO invoice_items (invoice_id, name, quantity, price, total) VALUES ?",
          [values],
          err => {
            if (err) return res.status(500).json({ error: err });

            res.json({
              message: "Invoice Created Successfully",
              inv_no: invNo
            });
          }
        );
      }
    );
  });
});


// ==========================
// Update Invoice
// ==========================
router.put("/:inv_no", (req, res) => {
  const { inv_no } = req.params;
  const invoice = req.body;

  db.query(
    "UPDATE invoice SET ? WHERE inv_no=?",
    [invoice, inv_no],
    (err, result) => {
      if (err) return res.status(500).json({ error: err });

      if (!result.affectedRows)
        return res.status(404).json({ message: "Invoice not found" });

      res.json({ message: "Invoice Updated Successfully" });
    }
  );
});

// ==========================
// Delete Invoice (cascade deletes items)
// ==========================
router.delete("/:inv_no", (req, res) => {
  const { inv_no } = req.params;

  db.query("DELETE FROM invoice WHERE inv_no=?", [inv_no], (err, result) => {
    if (err) return res.status(500).json({ error: err });

    if (!result.affectedRows)
      return res.status(404).json({ message: "Invoice not found" });

    res.json({ message: "Invoice Deleted Successfully" });
  });
});

module.exports = router;
