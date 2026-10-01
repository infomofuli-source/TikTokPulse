require("dotenv").config();
const path = require("path");
const express = require("express");
require("./db");
const accountsRoutes = require("./routes/accounts");

const app = express();
app.set("trust proxy", true);
app.use(express.json());

const API_KEY = process.env.API_KEY;

function requireAppKey(req, res, next) {
  if (!API_KEY) return next(); // no key configured (local dev) - allow through
  const key = req.headers["x-app-key"];
  if (key !== API_KEY) return res.status(401).json({ error: "Missing or invalid X-App-Key header" });
  next();
}

app.use("/api/accounts", requireAppKey, accountsRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, "..", "public")));

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => {
  console.log(`TikTok Pulse API + UI running on port ${PORT}`);
  if (!API_KEY) {
    console.warn("No API_KEY set - running open/unauthenticated. Fine for local dev only.");
  }
});
