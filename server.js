// server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { initDB } from "./db.js";
import multer from "multer";
import { spawn } from "child_process";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

let db;
(async () => {
  db = await initDB();
})();

// UPLOAD FILES ENDPOINT

const upload = multer({ dest: "uploads/" });

app.post("/api/upload", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const python = spawn("python3", ["./parse_receipt.py", req.file.path]);

  let output = "";
  python.stdout.on("data", data => output += data.toString());
  python.stderr.on("data", data => console.error("Python error:", data.toString()));

  python.on("close", async code => {
    if (code !== 0) return res.status(500).json({ error: "Python script failed" });

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch (e) {
      return res.status(500).json({ error: "Invalid JSON from Python script", raw: output });
    }

    try {
      // 1. Supermarket
      let supermarket = await db.get("SELECT * FROM supermarkets WHERE name = ?", [parsed.supermarket.name]);
      if (!supermarket) {
        const result = await db.run("INSERT INTO supermarkets (name) VALUES (?)", [parsed.supermarket.name]);
        supermarket = { id: result.lastID, name: parsed.supermarket.name };
      }

      // 2. Location
      let location = await db.get(
        "SELECT * FROM locations WHERE supermarket_id = ? AND address = ?",
        [supermarket.id, parsed.supermarket.location]
      );
      if (!location) {
        const result = await db.run(
          "INSERT INTO locations (supermarket_id, address) VALUES (?, ?)",
          [supermarket.id, parsed.supermarket.location]
        );
        location = { id: result.lastID, supermarket_id: supermarket.id, address: parsed.supermarket.location };
      }

      // 3. Payment method
      let payment = await db.get("SELECT * FROM payment_methods WHERE method = ?", [parsed.payment_method]);
      if (!payment) {
        const result = await db.run("INSERT INTO payment_methods (method) VALUES (?)", [parsed.payment_method]);
        payment = { id: result.lastID, method: parsed.payment_method };
      }

      // 4. Insert purchase
      const datetime = new Date(parseReceiptDate(parsed.datetime))
      const datePurchase = datetime.toISOString()
      const purchaseResult = await db.run(
        "INSERT INTO purchases (location_id, date, total, payment_method_id) VALUES (?, ?, ?, ?)",
        [location.id, datePurchase, parseFloat(parsed.total.replace(",", ".")), payment.id]
      );
      const purchase_id = purchaseResult.lastID;

      // 5. Insert items
      for (const it of parsed.items) {
        let item = await db.get("SELECT * FROM items WHERE name = ?", [it.name]);
        if (!item) {
          //try get alias
          item = await db.get("SELECT items.id FROM item_aliases JOIN items ON items.id = item_aliases.item_id WHERE alias = ?", [it.name])
          if (!item) {
            const result = await db.run("INSERT INTO items (name) VALUES (?)", [it.name]);
            const alias = await db.run("INSERT INTO item_aliases (item_id, alias) VALUES (?,?)", [result.lastID,it.name]);
            item = { id: result.lastID, name: it.name };
          }
        }

        // Insert into purchase_items
        await db.run(
          "INSERT INTO purchase_items (purchase_id, item_id, quantity, unit, price) VALUES (?, ?, ?, ?, ?)",
          [
            purchase_id,
            item.id,
            parseFloat(it.qtd.replace(",", ".")),
            it.unit,
            parseFloat(it.price.replace("R$","").replace(",", ".").trim())
          ]
        );
      }

      res.json({ success: true, purchase_id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });
});


function parseReceiptDate(str) {
  // Example: "03/10/2025 14:30"
  const [datePart, timePart] = str.split(" ");
  const [day, month, year] = datePart.split("/").map(Number);
  const [hours, minutes, seconds] = timePart.split(":").map(Number);

  // Months in JS Date are 0-based, so subtract 1
  return new Date(year, month - 1, day, hours, minutes, seconds);
}



//
// ========== ITEMS ==========
//

// Create item
app.post("/api/items", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Item name required" });

    const result = await db.run("INSERT INTO items (name) VALUES (?)", [name]);
    res.json({ id: result.lastID, name });
  } catch (err) {
    res.status(500).json({ error: "Failed to create item", details: err.message });
  }
});

// List items
app.get("/api/items", async (req, res) => {
  const rows = await db.all("SELECT * FROM items");
  res.json(rows);
});

// PUT update item
app.put("/api/items/:id", (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });

  db.run("UPDATE items SET name = ? WHERE id = ?", [name, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Item not found" });
    res.json({ id, name });
  });
});

// DELETE item
app.delete("/api/items/:id", (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM items WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Item not found" });
    res.json({ success: true });
  });
});

// GET /api/purchases/:id  — returns a single purchase with its items
app.get("/api/purchases/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // purchase header (with supermarket + location + payment)
    const purchase = await db.get(
      `
      SELECT 
        p.id,
        p.date,
        p.total,
        p.location_id,
        pm.method AS payment_method,
        l.address AS location_address,
        s.name AS supermarket_name,
        s.pretty_name AS supermarket_pretty
      FROM purchases p
      JOIN locations l ON p.location_id = l.id
      JOIN supermarkets s ON l.supermarket_id = s.id
      JOIN payment_methods pm ON p.payment_method_id = pm.id
      WHERE p.id = ?
      `,
      [id]
    );

    if (!purchase) {
      return res.status(404).json({ error: "Purchase not found" });
    }

    // purchase items (from purchase_items)
    const items = await db.all(
      `
      SELECT
        pi.id AS purchase_item_id,
        pi.purchase_id,
        pi.item_id,
        pi.unit,
        i.name AS item_name,
        pi.quantity,
        pi.price
      FROM purchase_items pi
      JOIN items i ON pi.item_id = i.id
      WHERE pi.purchase_id = ?
      ORDER BY pi.id
      `,
      [id]
    );

    // Attach items and send
    purchase.items = items;
    res.json(purchase);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});





//
// ========== ITEM ALIASES ==========
//

// Create alias for item
app.post("/api/item_aliases", async (req, res) => {
  try {
    const { item_id, alias } = req.body;
    if (!item_id || !alias) return res.status(400).json({ error: "item_id and alias required" });

    const result = await db.run("INSERT INTO item_aliases (item_id, alias) VALUES (?, ?)", [item_id, alias]);
    res.json({ id: result.lastID, item_id, alias });
  } catch (err) {
    res.status(500).json({ error: "Failed to create alias", details: err.message });
  }
});

// List aliases for item
app.get("/api/item_aliases/:item_id", async (req, res) => {
  const rows = await db.all("SELECT * FROM item_aliases WHERE item_id = ?", [req.params.item_id]);
  res.json(rows);
});

// List aliases for item
app.get("/api/item_aliases/", async (req, res) => {
  const rows = await db.all("SELECT ia.id, i.name, ia.alias FROM item_aliases AS ia JOIN items AS i ON i.id = ia.item_id");
  res.json(rows);
});

//
// ========== SUPERMARKETS ==========
//

// Create supermarket
app.post("/api/supermarkets", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Supermarket name required" });

    const result = await db.run("INSERT INTO supermarkets (name, pretty_name) VALUES (?,?)", [name,name]);
    res.json({ id: result.lastID, name });
  } catch (err) {
    res.status(500).json({ error: "Failed to create supermarket", details: err.message });
  }
});

// List supermarkets
app.get("/api/supermarkets", async (req, res) => {
  const rows = await db.all("SELECT * FROM supermarkets");
  res.json(rows);
});

// PUT update supermarket
app.put("/api/supermarkets/:id", async (req, res) => {
  const { id } = req.params;
  const { name, pretty_name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });

  try {
    const result = await db.run(
      "UPDATE supermarkets SET name = ?, pretty_name = ? WHERE id = ?",
      [name, pretty_name || null, id]
    );
    if (result.changes === 0) return res.status(404).json({ error: "Not found" });
    res.json({ id, name, pretty_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE supermarket
app.delete("/api/supermarkets/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.run("DELETE FROM supermarkets WHERE id = ?", [id]);
    if (result.changes === 0) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


//
// ========== LOCATIONS ==========
//

// Create location
app.post("/api/locations", async (req, res) => {
  try {
    const { supermarket_id, address } = req.body;
    if (!supermarket_id || !address) return res.status(400).json({ error: "supermarket_id and address required" });

    const result = await db.run("INSERT INTO locations (supermarket_id, address) VALUES (?, ?)", [supermarket_id, address]);
    res.json({ id: result.lastID, supermarket_id, address });
  } catch (err) {
    res.status(500).json({ error: "Failed to create location", details: err.message });
  }
});

// List locations for a supermarket
app.get("/api/locations/:supermarket_id", async (req, res) => {
  const rows = await db.all("SELECT * FROM locations WHERE supermarket_id = ?", [req.params.supermarket_id]);
  res.json(rows);
});

// List locations for a supermarket
app.get("/api/locations/", async (req, res) => {
  const rows = await db.all("SELECT locations.id, supermarkets.name AS supermarket, supermarkets.pretty_name as supermarketpn, locations.address FROM locations JOIN supermarkets ON supermarkets.id = locations.supermarket_id");
  res.json(rows);
});

/* ---------- PURCHASES ---------- */

// Get all purchases with items
app.get("/api/purchases", async (req, res) => {
  try {
    // Get purchases with location, supermarket, payment method
    const purchases = await db.all(`
      SELECT p.id, p.date, p.total, 
             l.address, s.name AS supermarket, s.pretty_name AS supermarketpn,
             pm.method AS payment_method
      FROM purchases p
      JOIN locations l ON p.location_id = l.id
      JOIN supermarkets s ON l.supermarket_id = s.id
      JOIN payment_methods pm ON p.payment_method_id = pm.id
      ORDER BY p.date DESC
    `);

    // Attach items for each purchase
    for (const p of purchases) {
      const items = await db.all(`
        SELECT pi.id, i.name, pi.quantity, pi.price
        FROM purchase_items pi
        JOIN items i ON pi.item_id = i.id
        WHERE pi.purchase_id = ?
      `, [p.id]);
      p.items = items;
    }

    res.json(purchases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new purchase
app.post("/api/purchases", async (req, res) => {
  const { location_id, payment_method_id, total, items } = req.body;
  if (!location_id || !payment_method_id || !total || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // 1. Insert purchase
    const dateNow = new Date().toISOString();
    const purchaseResult = await db.run(
      "INSERT INTO purchases (location_id, date, total, payment_method_id) VALUES (?, ?, ?, ?)",
      [location_id, dateNow, total, payment_method_id]
    );
    const purchase_id = purchaseResult.lastID;

    // 2. Insert items
    for (const it of items) {
      let item = await db.get("SELECT * FROM items WHERE id = ?", [it.item_id]);
      if (!item) {
        // Create item if it doesn't exist (optional: could also require pre-creation)
        const result = await db.run("INSERT INTO items (name) VALUES (?)", [it.name || "Unnamed Item"]);
        item = { id: result.lastID, name: it.name || "Unnamed Item" };
      }

      await db.run(
        "INSERT INTO purchase_items (purchase_id, item_id, quantity, price) VALUES (?, ?, ?, ?)",
        [purchase_id, item.id, it.quantity, it.price]
      );
    }

    res.json({ success: true, id: purchase_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* ---------- PAYMENT METHODS ---------- */
// List all payment methods
app.get("/api/payment_methods", async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM payment_methods ORDER BY method");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


//
// ========== SERVER START ==========
//

/* ---------- FALLBACK ---------- */
// If user goes to "/", serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
