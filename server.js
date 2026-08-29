const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// NEVER put your real admin key directly in public code.
const ADMIN_KEY = process.env.ADMIN_KEY || "CHANGE_THIS_ADMIN_KEY";

const db = new Database("kaamsetu.db");

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use(express.static(path.join(__dirname, "public")));

db.pragma("journal_mode = WAL");


// =========================
// DATABASE
// =========================

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  role TEXT,
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS otp (
  phone TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  category TEXT NOT NULL,
  skills TEXT DEFAULT '',
  experience INTEGER DEFAULT 0,
  rating REAL DEFAULT 5,
  lat REAL,
  lng REAL,
  available INTEGER DEFAULT 1,
  approved INTEGER DEFAULT 0,
  rate REAL DEFAULT 0,
  bio TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  worker_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  address TEXT DEFAULT '',
  lat REAL,
  lng REAL,
  date TEXT,
  time TEXT,
  duration TEXT DEFAULT 'small-work',
  status TEXT DEFAULT 'requested',
  estimated_price REAL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER UNIQUE,
  customer_id INTEGER NOT NULL,
  worker_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);


// =========================
// HELPERS
// =========================

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");
}

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function notify(userId, title, body) {
  db.prepare(`
    INSERT INTO notifications(user_id, title, body)
    VALUES (?, ?, ?)
  `).run(userId, title, body);
}

function getUser(id) {
  return db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id);
}


// =========================
// USER AUTH
// =========================

function auth(req, res, next) {
  const userId = Number(req.headers["x-user-id"]);

  if (!userId) {
    return res.status(401).json({
      error: "Login required"
    });
  }

  const user = getUser(userId);

  if (!user || !user.verified) {
    return res.status(401).json({
      error: "Account not verified"
    });
  }

  req.user = user;
  next();
}


// =========================
// ADMIN AUTH
// =========================
// ADMIN DASHBOARD IS NOT USER ACCESSIBLE.

function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"];

  if (!key || key !== ADMIN_KEY) {
    return res.status(403).json({
      error: "Admin access denied"
    });
  }

  next();
}


// =========================
// HEALTH
// =========================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    app: "KaamSetu",
    status: "running"
  });
});


// =========================
// SEND OTP
// =========================

app.post("/api/auth/send-otp", (req, res) => {
  const phone = String(req.body.phone || "").trim();

  if (!/^[0-9]{10}$/.test(phone)) {
    return res.status(400).json({
      error: "Enter a valid 10 digit phone number"
    });
  }

  const otp = generateOTP();

  db.prepare(`
    INSERT INTO otp(phone, code_hash, expires_at, attempts)
    VALUES (?, ?, ?, 0)
    ON CONFLICT(phone)
    DO UPDATE SET
      code_hash = excluded.code_hash,
      expires_at = excluded.expires_at,
      attempts = 0
  `).run(
    phone,
    hash(otp),
    Date.now() + 5 * 60 * 1000
  );

  // DEVELOPMENT ONLY
  // Replace this section with SMS provider later.
  console.log(`KaamSetu OTP for ${phone}: ${otp}`);

  res.json({
    success: true,
    message: "OTP sent successfully"
  });
});


// =========================
// VERIFY OTP
// =========================

app.post("/api/auth/verify-otp", (req, res) => {
  const phone = String(req.body.phone || "").trim();
  const code = String(req.body.otp || "").trim();

  const record = db
    .prepare("SELECT * FROM otp WHERE phone = ?")
    .get(phone);

  if (!record) {
    return res.status(400).json({
      error: "OTP not found"
    });
  }

  if (Date.now() > record.expires_at) {
    return res.status(400).json({
      error: "OTP expired"
    });
  }

  if (record.attempts >= 5) {
    return res.status(429).json({
      error: "Too many attempts"
    });
  }

  if (hash(code) !== record.code_hash) {
    db.prepare(`
      UPDATE otp
      SET attempts = attempts + 1
      WHERE phone = ?
    `).run(phone);

    return res.status(400).json({
      error: "Invalid OTP"
    });
  }

  let user = db
    .prepare("SELECT * FROM users WHERE phone = ?")
    .get(phone);

  if (!user) {
    const result = db.prepare(`
      INSERT INTO users(phone, verified)
      VALUES (?, 1)
    `).run(phone);

    user = getUser(result.lastInsertRowid);
  } else {
    db.prepare(`
      UPDATE users
      SET verified = 1
      WHERE id = ?
    `).run(user.id);

    user = getUser(user.id);
  }

  db.prepare("DELETE FROM otp WHERE phone = ?").run(phone);

  res.json({
    success: true,
    user: {
      id: user.id,
      phone: user.phone,
      role: user.role,
      verified: true
    }
  });
});


// =========================
// SELECT CUSTOMER / WORKER
// =========================

app.post("/api/auth/select-role", auth, (req, res) => {
  const role = String(req.body.role || "").toLowerCase();

  if (!["customer", "worker"].includes(role)) {
    return res.status(400).json({
      error: "Role must be customer or worker"
    });
  }

  db.prepare(`
    UPDATE users
    SET role = ?
    WHERE id = ?
  `).run(role, req.user.id);

  res.json({
    success: true,
    role
  });
});


// =========================
// CURRENT USER
// =========================

app.get("/api/me", auth, (req, res) => {
  res.json({
    id: req.user.id,
    phone: req.user.phone,
    role: req.user.role,
    verified: !!req.user.verified
  });
});


// =========================
// WORKER REGISTRATION
// =========================

app.post("/api/workers/register", auth, (req, res) => {
  if (req.user.role !== "worker") {
    return res.status(403).json({
      error: "Worker account required"
    });
  }

  const {
    name,
    category,
    skills = "",
    experience = 0,
    lat = null,
    lng = null,
    rate = 0,
    bio = ""
  } = req.body;

  if (!name || !category) {
    return res.status(400).json({
      error: "Name and category are required"
    });
  }

  const existing = db
    .prepare("SELECT id FROM workers WHERE user_id = ?")
    .get(req.user.id);

  if (existing) {
    return res.status(409).json({
      error: "Worker profile already exists"
    });
  }

  const result = db.prepare(`
    INSERT INTO workers
    (
      user_id,
      name,
      phone,
      category,
      skills,
      experience,
      lat,
      lng,
      rate,
      bio
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    name,
    req.user.phone,
    category,
    skills,
    Number(experience) || 0,
    lat,
    lng,
    Number(rate) || 0,
    bio
  );

  res.json({
    success: true,
    workerId: result.lastInsertRowid,
    message: "Worker profile submitted for approval"
  });
});


// =========================
// UPDATE WORKER LOCATION
// =========================

app.post("/api/workers/location", auth, (req, res) => {
  if (req.user.role !== "worker") {
    return res.status(403).json({
      error: "Worker account required"
    });
  }

  const worker = db
    .prepare("SELECT id FROM workers WHERE user_id = ?")
    .get(req.user.id);

  if (!worker) {
    return res.status(404).json({
      error: "Worker profile not found"
    });
  }

  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({
      error: "Invalid location"
    });
  }

  db.prepare(`
    UPDATE workers
    SET lat = ?, lng = ?
    WHERE id = ?
  `).run(lat, lng, worker.id);

  res.json({
    success: true
  });
});


// =========================
// WORKER AVAILABILITY
// =========================

app.post("/api/workers/availability", auth, (req, res) => {
  if (req.user.role !== "worker") {
    return res.status(403).json({
      error: "Worker account required"
    });
  }

  const worker = db
    .prepare("SELECT id FROM workers WHERE user_id = ?")
    .get(req.user.id);

  if (!worker) {
    return res.status(404).json({
      error: "Worker profile not found"
    });
  }

  const available = req.body.available ? 1 : 0;

  db.prepare(`
    UPDATE workers
    SET available = ?
    WHERE id = ?
  `).run(available, worker.id);

  res.json({
    success: true,
    available: !!available
  });
});


// =========================
// NEARBY WORKERS
// =========================

app.get("/api/workers/nearby", auth, (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const category = req.query.category
    ? String(req.query.category)
    : null;

  const radius = Math.min(
    Math.max(Number(req.query.radius) || 10, 1),
    50
  );

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({
      error: "Valid GPS location required"
    });
  }

  let workers = db.prepare(`
    SELECT
      id,
      name,
      phone,
      category,
      skills,
      experience,
      rating,
      lat,
      lng,
      rate,
      bio
    FROM workers
    WHERE approved = 1
      AND available = 1
      AND lat IS NOT NULL
      AND lng IS NOT NULL
  `).all();

  workers = workers
    .filter(worker => {
      if (category && worker.category.toLowerCase() !== category.toLowerCase()) {
        return false;
      }

      const distance = getDistanceKm(
        lat,
        lng,
        worker.lat,
        worker.lng
      );

      worker.distanceKm = Number(distance.toFixed(2));

      return distance <= radius;
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  res.json({
    success: true,
    workers
  });
});


// =========================
// DISTANCE CALCULATION
// =========================

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );
}

function toRad(value) {
  return value * Math.PI / 180;
}


// =========================
// CREATE BOOKING
// =========================

app.post("/api/bookings", auth, (req, res) => {
  if (req.user.role !== "customer") {
    return res.status(403).json({
      error: "Customer account required"
    });
  }

  const {
    workerId,
    category,
    description = "",
    address = "",
    lat = null,
    lng = null,
    date = null,
    time = null,
    duration = "small-work",
    estimatedPrice = 0
  } = req.body;

  if (!workerId || !category) {
    return res.status(400).json({
      error: "Worker and category are required"
    });
  }

  const worker = db
    .prepare(`
      SELECT *
      FROM workers
      WHERE id = ?
        AND approved = 1
        AND available = 1
    `)
    .get(workerId);

  if (!worker) {
    return res.status(404).json({
      error: "Worker unavailable"
    });
  }

  const result = db.prepare(`
    INSERT INTO bookings
    (
      customer_id,
      worker_id,
      category,
      description,
      address,
      lat,
      lng,
      date,
      time,
      duration,
      estimated_price
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    workerId,
    category,
    description,
    address,
    lat,
    lng,
    date,
    time,
    duration,
    Number(estimatedPrice) || 0
  );

  notify(
    worker.user_id,
    "New KaamSetu booking",
    `You have received a new ${category} work request.`
  );

  res.json({
    success: true,
    bookingId: result.lastInsertRowid,
    status: "requested"
  });
});


// =========================
// WORKER ACCEPT / REJECT
// =========================

app.post("/api/bookings/:id/status", auth, (req, res) => {
  if (req.user.role !== "worker") {
    return res.status(403).json({
      error: "Worker account required"
    });
  }

  const bookingId = Number(req.params.id);
  const status = String(req.body.status || "").toLowerCase();

  const allowed = [
    "accepted",
    "rejected",
    "on_the_way",
    "started",
    "completed",
    "cancelled"
  ];

  if (!allowed.includes(status)) {
    return res.status(400).json({
      error: "Invalid booking status"
    });
  }

  const worker = db
    .prepare("SELECT id FROM workers WHERE user_id = ?")
    .get(req.user.id);

  if (!worker) {
    return res.status(404).json({
      error: "Worker profile not found"
    });
  }

  const booking = db.prepare(`
    SELECT *
    FROM bookings
    WHERE id = ?
      AND worker_id = ?
  `).get(bookingId, worker.id);

  if (!booking) {
    return res.status(404).json({
      error: "Booking not found"
    });
  }

  db.prepare(`
    UPDATE bookings
    SET status = ?
    WHERE id = ?
  `).run(status, bookingId);

  notify(
    booking.customer_id,
    "Booking update",
    `Your KaamSetu booking is now ${status}.`
  );

  res.json({
    success: true,
    status
  });
});


// =========================
// CUSTOMER BOOKINGS
// =========================

app.get("/api/bookings/my", auth, (req, res) => {
  let bookings;

  if (req.user.role === "customer") {
    bookings = db.prepare(`
      SELECT
        b.*,
        w.name AS worker_name,
        w.phone AS worker_phone,
        w.rating AS worker_rating
      FROM bookings b
      LEFT JOIN workers w ON w.id = b.worker_id
      WHERE b.customer_id = ?
      ORDER BY b.created_at DESC
    `).all(req.user.id);
  } else {
    const worker = db
      .prepare("SELECT id FROM workers WHERE user_id = ?")
      .get(req.user.id);

    if (!worker) {
      return res.json({
        bookings: []
      });
    }

    bookings = db.prepare(`
      SELECT
        b.*,
        u.phone AS customer_phone
      FROM bookings b
      LEFT JOIN users u ON u.id = b.customer_id
      WHERE b.worker_id = ?
      ORDER BY b.created_at DESC
    `).all(worker.id);
  }

  res.json({
    bookings
  });
});


// =========================
// NOTIFICATIONS
// =========================

app.get("/api/notifications", auth, (req, res) => {
  const notifications = db.prepare(`
    SELECT *
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.user.id);

  res.json({
    notifications
  });
});

app.post("/api/notifications/:id/read", auth, (req, res) => {
  db.prepare(`
    UPDATE notifications
    SET read = 1
    WHERE id = ?
      AND user_id = ?
  `).run(
    Number(req.params.id),
    req.user.id
  );

  res.json({
    success: true
  });
});


// =========================
// REVIEW
// =========================

app.post("/api/reviews", auth, (req, res) => {
  if (req.user.role !== "customer") {
    return res.status(403).json({
      error: "Customer account required"
    });
  }

  const {
    bookingId,
    rating,
    comment = ""
  } = req.body;

  const score = Number(rating);

  if (!bookingId || score < 1 || score > 5) {
    return res.status(400).json({
      error: "Valid booking and rating required"
    });
  }

  const booking = db.prepare(`
    SELECT *
    FROM bookings
    WHERE id = ?
      AND customer_id = ?
      AND status = 'completed'
  `).get(bookingId, req.user.id);

  if (!booking) {
    return res.status(404).json({
      error: "Completed booking not found"
    });
  }

  try {
    db.prepare(`
      INSERT INTO reviews
      (
        booking_id,
        customer_id,
        worker_id,
        rating,
        comment
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      bookingId,
      req.user.id,
      booking.worker_id,
      score,
      comment
    );
  } catch {
    return res.status(409).json({
      error: "Review already submitted"
    });
  }

  const stats = db.prepare(`
    SELECT AVG(rating) AS average
    FROM reviews
    WHERE worker_id = ?
  `).get(booking.worker_id);

  db.prepare(`
    UPDATE workers
    SET rating = ?
    WHERE id = ?
  `).run(
    Number(stats.average || 5),
    booking.worker_id
  );

  res.json({
    success: true
  });
});


// =========================
// ADMIN
// =========================
// These routes require X-Admin-Key.
// Normal customers CANNOT access them.

app.get("/api/admin/stats", adminAuth, (req, res) => {
  const users = db.prepare(
    "SELECT COUNT(*) AS count FROM users"
  ).get().count;

  const workers = db.prepare(
    "SELECT COUNT(*) AS count FROM workers"
  ).get().count;

  const pendingWorkers = db.prepare(
    "SELECT COUNT(*) AS count FROM workers WHERE approved = 0"
  ).get().count;

  const bookings = db.prepare(
    "SELECT COUNT(*) AS count FROM bookings"
  ).get().count;

  res.json({
    users,
    workers,
    pendingWorkers,
    bookings
  });
});

app.get("/api/admin/workers/pending", adminAuth, (req, res) => {
  const workers = db.prepare(`
    SELECT *
    FROM workers
    WHERE approved = 0
    ORDER BY created_at DESC
  `).all();

  res.json({
    workers
  });
});

app.post("/api/admin/workers/:id/approve", adminAuth, (req, res) => {
  const workerId = Number(req.params.id);

  const worker = db
    .prepare("SELECT * FROM workers WHERE id = ?")
    .get(workerId);

  if (!worker) {
    return res.status(404).json({
      error: "Worker not found"
    });
  }

  db.prepare(`
    UPDATE workers
    SET approved = 1
    WHERE id = ?
  `).run(workerId);

  notify(
    worker.user_id,
    "KaamSetu verification approved",
    "Your worker profile has been approved. You can now receive work."
  );

  res.json({
    success: true,
    message: "Worker approved"
  });
});


// =========================
// 404
// =========================

app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API endpoint not found"
  });
});


// =========================
// START SERVER
// =========================

app.listen(PORT, () => {
  console.log(`KaamSetu server running on port ${PORT}`);
});
