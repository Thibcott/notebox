const express = require("express");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const multer = require("multer");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");

const nanoid = (size = 10) => crypto.randomBytes(Math.ceil(size / 2)).toString("hex").slice(0, size);

const app = express();
app.use(cookieParser());
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const DB_FILE = path.join(DATA_DIR, "projects.json");
const TIME_FILE = path.join(DATA_DIR, "time.json");

function ensureDirs() {
  for (const dir of [DATA_DIR, UPLOADS_DIR, path.join(__dirname, "public")]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ projects: [] }, null, 2), "utf-8");
  }
  if (!fs.existsSync(TIME_FILE)) {
    fs.writeFileSync(TIME_FILE, JSON.stringify({ records: {} }, null, 2), "utf-8");
  }
}

async function readDB() {
  const raw = await fsp.readFile(DB_FILE, "utf-8");
  return JSON.parse(raw);
}
async function writeDB(db) {
  await fsp.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

async function readTimeDB() {
  const raw = await fsp.readFile(TIME_FILE, "utf-8");
  return JSON.parse(raw);
}
async function writeTimeDB(db) {
  await fsp.writeFile(TIME_FILE, JSON.stringify(db, null, 2), "utf-8");
}

ensureDirs();

app.use(express.json({ limit: "10mb" }));

require("dotenv").config();

// --- Authentication Middleware ---

const PASSWORD = process.env.NOTEBOX_PASSWORD;
if (!PASSWORD) {
  console.error("ERREUR FATALE: La variable d'environnement NOTEBOX_PASSWORD n'est pas définie dans le fichier .env !");
  process.exit(1);
}

app.post("/api/login", (req, res) => {
  if (req.body.password === PASSWORD) {
    res.cookie("notebox_auth", "true", { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 }); // 30 days
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "Invalid password" });
});

// Protect routes
app.use((req, res, next) => {
  // Allow login page, styles, and login API
  if (req.path === "/login.html" || req.path === "/styles.css" || req.path === "/api/login") {
    return next();
  }

  // Check auth cookie
  if (req.cookies.notebox_auth === "true") {
    return next();
  }

  // If not authenticated, redirect to login or send 401
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Unauthorized" });
  } else {
    // Explicitly redirect to absolute proxy path to avoid browser relative-path issues
    return res.redirect("/notebox/login.html");
  }
});

app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, "public")));

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname || "").slice(0, 10);
    cb(null, `${Date.now()}-${nanoid(10)}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// --- API ---

app.get("/api/projects", async (req, res) => {
  const db = await readDB();
  res.json(db.projects);
});

app.post("/api/projects", async (req, res) => {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Project name required" });

  const db = await readDB();
  const project = {
    id: nanoid(10),
    name,
    createdAt: new Date().toISOString(),
    tabs: [
      { id: nanoid(10), title: "Note 1", content: "", updatedAt: new Date().toISOString() }
    ],
    tasks: []
  };
  db.projects.unshift(project);
  await writeDB(db);
  res.json(project);
});

app.delete("/api/projects/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const db = await readDB();
  const before = db.projects.length;
  db.projects = db.projects.filter(p => p.id !== projectId);
  if (db.projects.length === before) return res.status(404).json({ error: "Not found" });
  await writeDB(db);
  res.json({ ok: true });
});

app.post("/api/projects/:projectId/tabs", async (req, res) => {
  const { projectId } = req.params;
  const title = (req.body?.title || "New Tab").trim() || "New Tab";

  const db = await readDB();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const tab = { id: nanoid(10), title, content: "", updatedAt: new Date().toISOString() };
  project.tabs.push(tab);
  await writeDB(db);
  res.json(tab);
});

app.patch("/api/projects/:projectId/tabs/:tabId", async (req, res) => {
  const { projectId, tabId } = req.params;
  const title = (req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "Title required" });

  const db = await readDB();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const tab = project.tabs.find(t => t.id === tabId);
  if (!tab) return res.status(404).json({ error: "Tab not found" });

  tab.title = title;
  tab.updatedAt = new Date().toISOString();
  await writeDB(db);
  res.json(tab);
});

app.delete("/api/projects/:projectId/tabs/:tabId", async (req, res) => {
  const { projectId, tabId } = req.params;

  const db = await readDB();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const before = project.tabs.length;
  project.tabs = project.tabs.filter(t => t.id !== tabId);
  if (project.tabs.length === before) return res.status(404).json({ error: "Tab not found" });

  if (project.tabs.length === 0) {
    project.tabs.push({ id: nanoid(10), title: "Note 1", content: "", updatedAt: new Date().toISOString() });
  }

  await writeDB(db);
  res.json({ ok: true });
});

app.put("/api/projects/:projectId/tabs/:tabId/content", async (req, res) => {
  const { projectId, tabId } = req.params;
  const content = req.body?.content ?? "";

  const db = await readDB();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const tab = project.tabs.find(t => t.id === tabId);
  if (!tab) return res.status(404).json({ error: "Tab not found" });

  tab.content = String(content);
  tab.updatedAt = new Date().toISOString();
  await writeDB(db);
  res.json({ ok: true, updatedAt: tab.updatedAt });
});

// --- TASKS API ---

app.post("/api/projects/:projectId/tasks", async (req, res) => {
  const { projectId } = req.params;
  const title = (req.body?.title || "New Task").trim() || "New Task";

  const db = await readDB();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  if (!project.tasks) project.tasks = [];
  const task = { id: nanoid(10), title, completed: false, createdAt: new Date().toISOString() };
  project.tasks.push(task);
  await writeDB(db);
  res.json(task);
});

app.patch("/api/projects/:projectId/tasks/:taskId", async (req, res) => {
  const { projectId, taskId } = req.params;
  
  const db = await readDB();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  if (!project.tasks) project.tasks = [];
  const task = project.tasks.find(t => t.id === taskId);
  if (!task) return res.status(404).json({ error: "Task not found" });

  if (req.body.title !== undefined) task.title = req.body.title.trim() || task.title;
  if (req.body.completed !== undefined) task.completed = req.body.completed;
  
  await writeDB(db);
  res.json(task);
});

app.delete("/api/projects/:projectId/tasks/:taskId", async (req, res) => {
  const { projectId, taskId } = req.params;

  const db = await readDB();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  if (!project.tasks) project.tasks = [];
  const before = project.tasks.length;
  project.tasks = project.tasks.filter(t => t.id !== taskId);
  if (project.tasks.length === before) return res.status(404).json({ error: "Task not found" });

  await writeDB(db);
  res.json({ ok: true });
});

// Upload image (returns URL)
app.post("/api/upload", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image file" });
  const url = `uploads/${req.file.filename}`;
  res.json({ url });
});

// --- TIME TRACKER API ---

app.get("/api/time", async (req, res) => {
  const db = await readTimeDB();
  res.json(db.records || {});
});

app.post("/api/time", async (req, res) => {
  const records = req.body;
  await writeTimeDB({ records });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Notebox running on http://localhost:${PORT}`);
});
