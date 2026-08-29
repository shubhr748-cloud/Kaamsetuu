const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "change-this-admin-key";

const db = new Database("kaamsetu.db");

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120
  })
);

app.use(express.static(path.join(__dirname, "public")));

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  verified INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS otp (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE,
  name TEXT,
  phone TEXT,
  category TEXT,
  skills TEXT,
  experience INTEGER DEFAULT 0,
  rating REAL DEFAULT 5,
  lat REAL,
  lng REAL,
  available INTEGER DEFAULT 1,
  approved INTEGER DEFAULT 0,
  rate REAL DEFAULT 0,
  bio TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  worker_id INTEGER,
  category TEXT,
  description TEXT,
  address TEXT,
  lat REAL,
  lng REAL,
  date TEXT,
  time TEXT,
  duration TEXT,
  status TEXT DEFAULT 'requested',
  estimated_price REAL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER UNIQUE,
  customer_id INTEGER,
  worker_id INTEGER,
  rating INTEGER,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT,
  body TEXT,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

function notify(userId, title, body) {
  db.prepare(
    "INSERT INTO notifications(user_id,title,body) VALUES(?,?,?)"
  ).run(userId, title, body);
}

function auth(req, res, next) {
  const userId = Number(req.headers["x-user-id"]);

  const user = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(userId);

  if (!user) {
    return res.status(401).json({
      error: "Login required"
    });
  }

  req.user = user;
  next();
}

function adminAuth(req, res, next) {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    return res.status(401).json({
      error: "Admin authentication required"
    });
  }

  next();
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* =========================
   AUTHENTICATION
========================= */

app.post("/api/auth/request-otp", (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, "");

  if (phone.length < 10 || phone.length > 15) {
    return res.status(400).json({
      error: "Enter a valid mobile number"
    });
  }

  const code = String(
    Math.floor(100000 + Math.random() * 900000)
  );

  db.prepare(`
    INSERT INTO otp(phone,code,expires_at)
    VALUES(?,?,?)
    ON CONFLICT(phone)
    DO UPDATE SET
      code=excluded.code,
      expires_at=excluded.expires_at
  `).run(
    phone,
    code,
    Date.now() + 5 * 60 * 1000
  );

  res.json({
    ok: true,
    demoCode:
      process.env.NODE_ENV === "production"
        ? undefined
        : code
  });
});

app.post("/api/auth/verify-otp", (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, "");
  const code = String(req.body.code || "");

  const otp = db
    .prepare("SELECT * FROM otp WHERE phone = ?")
    .get(phone);

  if (
    !otp ||
    otp.code !== code ||
    Date.now() > otp.expires_at
  ) {
    return res.status(400).json({
      error: "Invalid or expired OTP"
    });
  }

  db.prepare("DELETE FROM otp WHERE phone = ?").run(phone);

  let user = db
    .prepare("SELECT * FROM users WHERE phone = ?")
    .get(phone);

  const role =
    req.body.role === "worker"
      ? "worker"
      : "customer";

  if (!user) {
    const result = db
      .prepare(
        "INSERT INTO users(phone,role,verified) VALUES(?,?,1)"
      )
      .run(phone, role);

    user = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(result.lastInsertRowid);
  } else {
    db.prepare(
      "UPDATE users SET verified = 1 WHERE id = ?"
    ).run(user.id);
  }

  res.json({
    ok: true,
    token: "session-" + user.id,
    user
  });
});

app.get("/api/me", auth, (req, res) => {
  res.json(req.user);
});

/* =========================
   WORKER PROFILE
========================= */

app.post("/api/workers/profile", auth, (req, res) => {
  if (req.user.role !== "worker") {
    return res.status(403).json({
      error: "Worker account required"
    });
  }

  const body = req.body;

  if (!body.name || !body.category) {
    return res.status(400).json({
      error: "Name and category are required"
    });
  }

  const existing = db
    .prepare(
      "SELECT id FROM workers WHERE user_id = ?"
    )
    .get(req.user.id);

  if (existing) {
    db.prepare(`
      UPDATE workers SET
        name=?,
        category=?,
        skills=?,
        experience=?,
        lat=?,
        lng=?,
        available=?,
        rate=?,
        bio=?
      WHERE user_id=?
    `).run(
      body.name,
      body.category,
      body.skills || "",
      Number(body.experience) || 0,
      body.lat ?? null,
      body.lng ?? null,
      body.available ? 1 : 0,
      Number(body.rate) || 0,
      body.bio || "",
      req.user.id
    );
  } else {
    db.prepare(`
      INSERT INTO workers(
        user_id,
        name,
        phone,
        category,
        skills,
        experience,
        lat,
        lng,
        available,
        rate,
        bio
      )
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      req.user.id,
      body.name,
      req.user.phone,
      body.category,
      body.skills || "",
      Number(body.experience) || 0,
      body.lat ?? null,
      body.lng ?? null,
      body.available ? 1 : 0,
      Number(body.rate) || 0,
      body.bio || ""
    );
  }

  res.json({
    ok: true,
    message: "Worker profile saved"
  });
});

/* =========================
   GPS NEARBY WORKERS
========================= */

app.get("/api/workers/nearby", (req, res) => {
  const category = String(
    req.query.category || ""
  );

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  const radius = Math.min(
    Math.max(Number(req.query.radius) || 10, 1),
    50
  );

  let workers = db
    .prepare(`
      SELECT * FROM workers
      WHERE approved=1
      AND available=1
      AND lower(category)=lower(?)
    `)
    .all(category);

  if (
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    workers = workers
      .map(worker => ({
        ...worker,
        distance_km:
          worker.lat == null || worker.lng == null
            ? null
            : distanceKm(
                lat,
                lng,
                worker.lat,
                worker.lng
              )
      }))
      .filter(
        worker =>
          worker.distance_km === null ||
          worker.distance_km <= radius
      )
      .sort(
        (a, b) =>
          (a.distance_km ?? 999) -
          (b.distance_km ?? 999)
      );
  }

  res.json(workers);
});

/* =========================
   BOOKINGS
========================= */

app.post("/api/bookings", auth, (req, res) => {
  if (req.user.role !== "customer") {
    return res.status(403).json({
      error: "Customer account required"
    });
  }

  const body = req.body;

  const worker = db
    .prepare(`
      SELECT * FROM workers
      WHERE id=?
      AND approved=1
      AND available=1
    `)
    .get(Number(body.worker_id));

  if (!worker) {
    return res.status(400).json({
      error: "Worker is not available"
    });
  }

  const result = db
    .prepare(`
      INSERT INTO bookings(
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
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
    `)
    .run(
      req.user.id,
      worker.id,
      body.category,
      body.description || "",
      body.address || "",
      body.lat ?? null,
      body.lng ?? null,
      body.date || "",
      body.time || "",
      body.duration || "small",
      Number(body.estimated_price) ||
        worker.rate ||
        0
    );

  notify(
    worker.user_id,
    "New job request",
    "You have a new " +
      body.category +
      " request."
  );

  res.json({
    ok: true,
    booking_id: result.lastInsertRowid
  });
});

app.get("/api/bookings", auth, (req, res) => {
  if (req.user.role === "customer") {
    const bookings = db
      .prepare(`
        SELECT
          b.*,
          w.name AS worker_name,
          w.rating
        FROM bookings b
        JOIN workers w
          ON w.id=b.worker_id
        WHERE b.customer_id=?
        ORDER BY b.id DESC
      `)
      .all(req.user.id);

    return res.json(bookings);
  }

  const worker = db
    .prepare(
      "SELECT id FROM workers WHERE user_id=?"
    )
    .get(req.user.id);

  if (!worker) {
    return res.json([]);
  }

  const bookings = db
    .prepare(`
      SELECT
        b.*,
        u.phone AS customer_phone
      FROM bookings b
      JOIN users u
        ON u.id=b.customer_id
      WHERE b.worker_id=?
      ORDER BY b.id DESC
    `)
    .all(worker.id);

  res.json(bookings);
});

app.patch(
  "/api/bookings/:id/status",
  auth,
  (req, res) => {
    const bookingId = Number(req.params.id);
    const status = String(
      req.body.status || ""
    );

    const allowed = [
      "accepted",
      "on_the_way",
      "arrived",
      "started",
      "completed",
      "cancelled"
    ];

    if (!allowed.includes(status)) {
      return res.status(400).json({
        error: "Invalid booking status"
      });
    }

    const booking = db
      .prepare(
        "SELECT * FROM bookings WHERE id=?"
      )
      .get(bookingId);

    if (!booking) {
      return res.status(404).json({
        error: "Booking not found"
      });
    }

    const worker = db
      .prepare(
        "SELECT * FROM workers WHERE id=?"
      )
      .get(booking.worker_id);

    const customerAllowed =
      req.user.role === "customer" &&
      booking.customer_id === req.user.id;

    const workerAllowed =
      req.user.role === "worker" &&
      worker &&
      worker.user_id === req.user.id;

    if (!customerAllowed && !workerAllowed) {
      return res.status(403).json({
        error: "Not allowed"
      });
    }

    db.prepare(
      "UPDATE bookings SET status=? WHERE id=?"
    ).run(status, bookingId);

    const otherUser =
      req.user.role === "customer"
        ? worker.user_id
        : booking.customer_id;

    notify(
      otherUser,
      "Booking updated",
      "Booking #" +
        bookingId +
        " is now " +
        status.replaceAll("_", " ") +
        "."
    );

    res.json({ ok: true });
  }
);

/* =========================
   REVIEWS
========================= */

app.post("/api/reviews", auth, (req, res) => {
  const booking = db
    .prepare(`
      SELECT * FROM bookings
      WHERE id=?
      AND customer_id=?
      AND status='completed'
    `)
    .get(
      Number(req.body.booking_id),
      req.user.id
    );

  if (!booking) {
    return res.status(400).json({
      error:
        "Only completed bookings can be reviewed"
    });
  }

  try {
    const rating = Math.min(
      5,
      Math.max(
        1,
        Number(req.body.rating) || 1
      )
    );

    db.prepare(`
      INSERT INTO reviews(
        booking_id,
        customer_id,
        worker_id,
        rating,
        comment
      )
      VALUES(?,?,?,?,?)
    `).run(
      booking.id,
      req.user.id,
      booking.worker_id,
      rating,
      String(req.body.comment || "")
    );

    const average = db
      .prepare(`
        SELECT AVG(rating) AS avg
        FROM reviews
        WHERE worker_id=?
      `)
      .get(booking.worker_id);

    db.prepare(
      "UPDATE workers SET rating=? WHERE id=?"
    ).run(
      Number(average.avg.toFixed(2)),
      booking.worker_id
    );

    res.json({ ok: true });
  } catch {
    res.status(400).json({
      error: "Already reviewed"
    });
  }
});

/* =========================
   NOTIFICATIONS
========================= */

app.get(
  "/api/notifications",
  auth,
  (req, res) => {
    const notifications = db
      .prepare(`
        SELECT *
        FROM notifications
        WHERE user_id=?
        ORDER BY id DESC
        LIMIT 50
      `)
      .all(req.user.id);

    res.json(notifications);
  }
);

/* =========================
   ADMIN DASHBOARD
========================= */

app.get(
  "/api/admin/stats",
  adminAuth,
  (req, res) => {
    const count = table =>
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM " +
            table
        )
        .get().count;

    res.json({
      users: count("users"),
      workers: count("workers"),
      bookings: count("bookings"),
      pending_workers: db
        .prepare(
          "SELECT COUNT(*) AS count FROM workers WHERE approved=0"
        )
        .get().count
    });
  }
);

app.get(
  "/api/admin/workers",
  adminAuth,
  (req, res) => {
    const workers = db
      .prepare(
        "SELECT * FROM workers ORDER BY id DESC"
      )
      .all();

    res.json(workers);
  }
);

app.patch(
  "/api/admin/workers/:id",
  adminAuth,
  (req, res) => {
    const workerId = Number(req.params.id);
    const approved = req.body.approved ? 1 : 0;

    db.prepare(
      "UPDATE workers SET approved=? WHERE id=?"
    ).run(approved, workerId);

    const worker = db
      .prepare(
        "SELECT user_id FROM workers WHERE id=?"
      )
      .get(workerId);

    if (worker) {
      notify(
        worker.user_id,
        approved
          ? "Worker verified"
          : "Worker update",
        approved
          ? "Your profile has been approved."
          : "Your profile needs an update."
      );
    }

    res.json({ ok: true });
  }
);

app.get(
  "/api/admin/bookings",
  adminAuth,
  (req, res) => {
    const bookings = db
      .prepare(`
        SELECT
          b.*,
          u.phone AS customer_phone,
          w.name AS worker_name
        FROM bookings b
        JOIN users u
          ON u.id=b.customer_id
        JOIN workers w
          ON w.id=b.worker_id
        ORDER BY b.id DESC
      `)
      .all();

    res.json(bookings);
  }
);

/* =========================
   FRONTEND FALLBACK
========================= */

app.use((req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

app.listen(PORT, () => {
  console.log(
    "KaamSetu running on port " + PORT
  );
});
