// ============================================================
// KAAMSETU - PRODUCTION MVP BACKEND
// ============================================================

const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

const app = express();

const PORT = Number(process.env.PORT || 10000);

const ADMIN_KEY = String(process.env.ADMIN_KEY || "");

const PLATFORM_FEE_PERCENT = Number(
  process.env.PLATFORM_FEE_PERCENT || 10
);

const FIRST_BOOKING_FREE = String(
  process.env.FIRST_BOOKING_FREE || "true"
).toLowerCase() === "true";

const LOYALTY_COMPLETED_BOOKINGS = Number(
  process.env.LOYALTY_COMPLETED_BOOKINGS || 10
);

const LOYALTY_DISCOUNT_PERCENT = Number(
  process.env.LOYALTY_DISCOUNT_PERCENT || 20
);

const MAX_BOOKING_RADIUS_KM = Number(
  process.env.MAX_BOOKING_RADIUS_KM || 50
);

const OTP_EXPIRY_MINUTES = Number(
  process.env.OTP_EXPIRY_MINUTES || 5
);

const COMPLETION_CODE_EXPIRY_MINUTES = Number(
  process.env.COMPLETION_CODE_EXPIRY_MINUTES || 180
);

const JWT_SECRET = String(
  process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex")
);

const SESSION_EXPIRY_DAYS = Number(
  process.env.SESSION_EXPIRY_DAYS || 30
);

// ============================================================
// APP SECURITY
// ============================================================

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);

app.use(
  cors({
    origin: true,
    credentials: false
  })
);

app.use(
  express.json({
    limit: "100kb"
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "50kb"
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication requests."
  }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/api", apiLimiter);

// ============================================================
// DATABASE
// ============================================================

const dbPath =
  process.env.DB_PATH ||
  path.join(__dirname, "kaamsetu.db");

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ============================================================
// DATABASE
// ============================================================

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  role TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  skills TEXT,
  experience INTEGER NOT NULL DEFAULT 0,
  rate REAL NOT NULL DEFAULT 0,
  bio TEXT,

  lat REAL,
  lng REAL,

  rating REAL NOT NULL DEFAULT 5,

  approved INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 1,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  customer_id INTEGER NOT NULL,
  worker_id INTEGER NOT NULL,

  category TEXT NOT NULL,
  description TEXT NOT NULL,
  address TEXT NOT NULL,

  lat REAL,
  lng REAL,

  duration TEXT NOT NULL,

  worker_price REAL NOT NULL DEFAULT 0,
  platform_fee REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  customer_total REAL NOT NULL DEFAULT 0,

  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_status TEXT NOT NULL DEFAULT 'pending',

  worker_fee_status TEXT NOT NULL DEFAULT 'pending',

  status TEXT NOT NULL DEFAULT 'requested',

  completion_code_hash TEXT,
  completion_code_expires_at INTEGER,
  completion_code_verified INTEGER NOT NULL DEFAULT 0,

  worker_phone_revealed INTEGER NOT NULL DEFAULT 0,

  accepted_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(customer_id)
    REFERENCES users(id),

  FOREIGN KEY(worker_id)
    REFERENCES workers(id)
);

CREATE TABLE IF NOT EXISTS worker_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  worker_id INTEGER NOT NULL,
  booking_id INTEGER,

  type TEXT NOT NULL,

  amount REAL NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending',

  description TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(worker_id)
    REFERENCES workers(id)
    ON DELETE CASCADE,

  FOREIGN KEY(booking_id)
    REFERENCES bookings(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  user_id INTEGER NOT NULL,

  type TEXT NOT NULL,

  message TEXT NOT NULL,

  booking_id INTEGER,

  read INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  booking_id INTEGER NOT NULL UNIQUE,

  provider TEXT NOT NULL DEFAULT 'razorpay',

  provider_order_id TEXT,

  amount REAL NOT NULL,

  currency TEXT NOT NULL DEFAULT 'INR',

  status TEXT NOT NULL DEFAULT 'created',

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(booking_id)
    REFERENCES bookings(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workers_category
ON workers(category);

CREATE INDEX IF NOT EXISTS idx_workers_location
ON workers(lat, lng);

CREATE INDEX IF NOT EXISTS idx_workers_available
ON workers(available, approved);

CREATE INDEX IF NOT EXISTS idx_bookings_customer
ON bookings(customer_id);

CREATE INDEX IF NOT EXISTS idx_bookings_worker
ON bookings(worker_id);

CREATE INDEX IF NOT EXISTS idx_sessions_token
ON sessions(token_hash);

CREATE INDEX IF NOT EXISTS idx_notifications_user
ON notifications(user_id);
`);

// ============================================================
// DATABASE MIGRATION SAFETY
// ============================================================

function ensureColumn(table, column, definition) {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all();

  const exists = columns.some(
    c => c.name === column
  );

  if (!exists) {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );
  }
}

ensureColumn("workers", "verified", "INTEGER NOT NULL DEFAULT 0");

ensureColumn(
  "bookings",
  "discount",
  "REAL NOT NULL DEFAULT 0"
);

ensureColumn(
  "bookings",
  "completion_code_expires_at",
  "INTEGER"
);

ensureColumn(
  "bookings",
  "completion_code_verified",
  "INTEGER NOT NULL DEFAULT 0"
);

ensureColumn(
  "bookings",
  "worker_phone_revealed",
  "INTEGER NOT NULL DEFAULT 0"
);

// ============================================================
// HELPERS
// ============================================================

function cleanString(value, max = 1000) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function normalizePhone(phone) {
  return String(phone || "")
    .replace(/\D/g, "")
    .slice(-10);
}

function validPhone(phone) {
  return /^[0-9]{10}$/.test(phone);
}

function validNumber(value) {
  return (
    value !== null &&
    value !== undefined &&
    Number.isFinite(Number(value))
  );
}

function clampNumber(value, min, max) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return null;
  }

  return Math.min(
    Math.max(n, min),
    max
  );
}

function roundMoney(value) {
  return Math.round(
    (Number(value) + Number.EPSILON) * 100
  ) / 100;
}

function hashValue(value) {
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));

  if (aa.length !== bb.length) {
    return false;
  }

  return crypto.timingSafeEqual(aa, bb);
}

function generateOTP() {
  return String(
    crypto.randomInt(100000, 1000000)
  );
}

function generateCompletionCode() {
  return String(
    crypto.randomInt(100000, 1000000)
  );
}

function haversineDistance(
  lat1,
  lng1,
  lat2,
  lng2
) {
  const R = 6371;

  const dLat =
    ((lat2 - lat1) * Math.PI) / 180;

  const dLng =
    ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(
      (lat1 * Math.PI) / 180
    ) *
      Math.cos(
        (lat2 * Math.PI) / 180
      ) *
      Math.sin(dLng / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}

// ============================================================
// PRICING
// ============================================================

function calculatePlatformFee(workerPrice) {
  return roundMoney(
    Number(workerPrice) *
      (PLATFORM_FEE_PERCENT / 100)
  );
}

function getCompletedBookingCount(customerId) {
  return db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM bookings
      WHERE customer_id = ?
        AND status = 'completed'
    `)
    .get(customerId).count;
}

function calculateDiscount(
  customerId,
  workerPrice
) {
  const completed =
    getCompletedBookingCount(
      customerId
    );

  if (
    completed > 0 &&
    completed % LOYALTY_COMPLETED_BOOKINGS === 0
  ) {
    return roundMoney(
      Number(workerPrice) *
        (LOYALTY_DISCOUNT_PERCENT / 100)
    );
  }

  return 0;
}

function calculateBookingPricing(
  customerId,
  workerPrice
) {
  const completed =
    getCompletedBookingCount(
      customerId
    );

  let platformFee =
    calculatePlatformFee(
      workerPrice
    );

  let discount = 0;

  // First booking platform-fee benefit
  if (
    FIRST_BOOKING_FREE &&
    completed === 0
  ) {
    platformFee = 0;
  }

  // Every 10 completed services:
  // next eligible booking gets discount.
  if (
    completed > 0 &&
    completed % LOYALTY_COMPLETED_BOOKINGS === 0
  ) {
    discount =
      roundMoney(
        Number(workerPrice) *
          (LOYALTY_DISCOUNT_PERCENT / 100)
      );
  }

  const customerTotal =
    roundMoney(
      Number(workerPrice) +
        platformFee -
        discount
    );

  return {
    workerPrice: roundMoney(workerPrice),
    platformFee,
    discount,
    customerTotal,
    completedBookings: completed
  };
}

// ============================================================
// NOTIFICATIONS
// ============================================================

function addNotification(
  userId,
  type,
  message,
  bookingId = null
) {
  db.prepare(`
    INSERT INTO notifications
    (
      user_id,
      type,
      message,
      booking_id
    )
    VALUES (?, ?, ?, ?)
  `).run(
    userId,
    type,
    message,
    bookingId
  );
}

// ============================================================
// AUTHENTICATION
// ============================================================

function createSession(userId) {
  const token =
    crypto.randomBytes(48).toString("hex");

  const tokenHash =
    hashValue(token);

  const expiresAt =
    Date.now() +
    SESSION_EXPIRY_DAYS *
      24 *
      60 *
      60 *
      1000;

  db.prepare(`
    INSERT INTO sessions
    (
      user_id,
      token_hash,
      expires_at
    )
    VALUES (?, ?, ?)
  `).run(
    userId,
    tokenHash,
    expiresAt
  );

  return token;
}

function getUserFromRequest(req) {
  const auth =
    String(
      req.headers.authorization || ""
    );

  if (
    !auth.startsWith("Bearer ")
  ) {
    return null;
  }

  const token =
    auth.slice(7).trim();

  if (!token) {
    return null;
  }

  const tokenHash =
    hashValue(token);

  const session =
    db.prepare(`
      SELECT
        s.*,
        u.id AS user_id,
        u.phone,
        u.role
      FROM sessions s
      JOIN users u
        ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.expires_at > ?
    `).get(
      tokenHash,
      Date.now()
    );

  return session || null;
}

function requireUser(req, res, next) {
  const user =
    getUserFromRequest(req);

  if (!user) {
    return res.status(401).json({
      error:
        "Login required."
    });
  }

  req.user = user;

  next();
}

function requireRole(role) {
  return (
    req,
    res,
    next
  ) => {
    if (!req.user) {
      return res.status(401).json({
        error:
          "Login required."
      });
    }

    if (
      req.user.role !== role
    ) {
      return res.status(403).json({
        error:
          "Access denied."
      });
    }

    next();
  };
}

function requireAdmin(req, res, next) {
  const supplied =
    String(
      req.headers["x-admin-key"] || ""
    );

  if (
    !ADMIN_KEY ||
    !safeEqual(
      supplied,
      ADMIN_KEY
    )
  ) {
    return res.status(403).json({
      error:
        "Admin access denied."
    });
  }

  next();
}

function getWorkerByUserId(userId) {
  return db
    .prepare(`
      SELECT *
      FROM workers
      WHERE user_id = ?
    `)
    .get(userId);
}

function publicWorker(
  worker,
  distanceKm = null
) {
  return {
    id: worker.id,
    name: worker.name,
    category: worker.category,
    skills: worker.skills,
    experience: worker.experience,
    rate: worker.rate,
    bio: worker.bio,
    rating: worker.rating,

    approved:
      Boolean(worker.approved),

    verified:
      Boolean(worker.verified),

    available:
      Boolean(worker.available),

    distanceKm:
      distanceKm === null
        ? null
        : roundMoney(distanceKm)
  };
}

// ============================================================
// HEALTH
// ============================================================

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      ok: true,
      service: "KaamSetu",
      version: "1.0.0",
      time:
        new Date().toISOString()
    });
  }
);

// ============================================================
// SEND OTP
// ============================================================

app.post(
  "/api/auth/send-otp",
  authLimiter,
  (req, res) => {
    const phone =
      normalizePhone(
        req.body.phone
      );

    if (!validPhone(phone)) {
      return res.status(400).json({
        error:
          "Please enter a valid 10 digit mobile number."
      });
    }

    const otp =
      generateOTP();

    const otpHash =
      hashValue(otp);

    const expiresAt =
      Date.now() +
      OTP_EXPIRY_MINUTES *
        60 *
        1000;

    db.prepare(`
      UPDATE otp_codes
      SET used = 1
      WHERE phone = ?
        AND used = 0
    `).run(phone);

    db.prepare(`
      INSERT INTO otp_codes
      (
        phone,
        otp_hash,
        expires_at
      )
      VALUES (?, ?, ?)
    `).run(
      phone,
      otpHash,
      expiresAt
    );

    /*
      Production:
      Connect an SMS provider here.

      Development:
      demoOtp is returned only outside production.
    */

    const response = {
      success: true,
      message:
        "OTP sent successfully."
    };

    if (
      process.env.NODE_ENV !==
      "production"
    ) {
      response.demoOtp = otp;
    }

    console.log(
      `[KaamSetu OTP] ${phone}: ${otp}`
    );

    res.json(response);
  }
);

// ============================================================
// VERIFY OTP
// ============================================================

app.post(
  "/api/auth/verify-otp",
  authLimiter,
  (req, res) => {
    const phone =
      normalizePhone(
        req.body.phone
      );

    const otp =
      cleanString(
        req.body.otp,
        6
      );

    if (!validPhone(phone)) {
      return res.status(400).json({
        error:
          "Invalid phone number."
      });
    }

    if (
      !/^[0-9]{6}$/.test(otp)
    ) {
      return res.status(400).json({
        error:
          "Invalid OTP."
      });
    }

    const record =
      db.prepare(`
        SELECT *
        FROM otp_codes
        WHERE phone = ?
          AND used = 0
        ORDER BY id DESC
        LIMIT 1
      `).get(phone);

    if (!record) {
      return res.status(400).json({
        error:
          "OTP not found. Request a new OTP."
      });
    }

    if (
      Date.now() >
      record.expires_at
    ) {
      return res.status(400).json({
        error:
          "OTP expired."
      });
    }

    if (
      record.attempts >= 5
    ) {
      return res.status(429).json({
        error:
          "Too many OTP attempts."
      });
    }

    db.prepare(`
      UPDATE otp_codes
      SET attempts = attempts + 1
      WHERE id = ?
    `).run(record.id);

    if (
      !safeEqual(
        hashValue(otp),
        record.otp_hash
      )
    ) {
      return res.status(400).json({
        error:
          "Incorrect OTP."
      });
    }

    db.prepare(`
      UPDATE otp_codes
      SET used = 1
      WHERE id = ?
    `).run(record.id);

    let user =
      db.prepare(`
        SELECT *
        FROM users
        WHERE phone = ?
      `).get(phone);

    if (!user) {
      const result =
        db.prepare(`
          INSERT INTO users(phone)
          VALUES(?)
        `).run(phone);

      user =
        db.prepare(`
          SELECT *
          FROM users
          WHERE id = ?
        `).get(
          result.lastInsertRowid
        );
    }

    const token =
      createSession(user.id);

    res.json({
      success: true,

      token,

      user: {
        id: user.id,
        phone: user.phone,
        role: user.role
      }
    });
  }
);

// ============================================================
// LOGOUT
// ============================================================

app.post(
  "/api/auth/logout",
  requireUser,
  (req, res) => {
    const auth =
      String(
        req.headers.authorization || ""
      );

    const token =
      auth.startsWith("Bearer ")
        ? auth.slice(7).trim()
        : "";

    if (token) {
      db.prepare(`
        DELETE FROM sessions
        WHERE token_hash = ?
      `).run(
        hashValue(token)
      );
    }

    res.json({
      success: true
    });
  }
);

// ============================================================
// SELECT ROLE
// ============================================================

app.post(
  "/api/auth/select-role",
  requireUser,
  (req, res) => {
    const role =
      cleanString(
        req.body.role,
        20
      ).toLowerCase();

    if (
      role !== "customer" &&
      role !== "worker"
    ) {
      return res.status(400).json({
        error:
          "Role must be customer or worker."
      });
    }

    if (
      req.user.role &&
      req.user.role !== role
    ) {
      return res.status(400).json({
        error:
          "Account role cannot be changed."
      });
    }

    db.prepare(`
      UPDATE users
      SET role = ?
      WHERE id = ?
    `).run(
      role,
      req.user.id
    );

    res.json({
      success: true,
      role
    });
  }
);

// ============================================================
// CURRENT USER
// ============================================================

app.get(
  "/api/auth/me",
  requireUser,
  (req, res) => {
    res.json({
      user: {
        id: req.user.user_id,
        phone: req.user.phone,
        role: req.user.role
      }
    });
  }
);

// ============================================================
// WORKER REGISTER
// ============================================================

app.post(
  "/api/workers/register",
  requireUser,
  requireRole("worker"),
  (req, res) => {
    const name =
      cleanString(
        req.body.name,
        100
      );

    const category =
      cleanString(
        req.body.category,
        80
      );

    const skills =
      cleanString(
        req.body.skills,
        500
      );

    const experience =
      clampNumber(
        req.body.experience,
        0,
        60
      );

    const rate =
      clampNumber(
        req.body.rate,
        0,
        1000000
      );

    const bio =
      cleanString(
        req.body.bio,
        1000
      );

    const lat =
      validNumber(req.body.lat)
        ? clampNumber(
            req.body.lat,
            -90,
            90
          )
        : null;

    const lng =
      validNumber(req.body.lng)
        ? clampNumber(
            req.body.lng,
            -180,
            180
          )
        : null;

    if (!name) {
      return res.status(400).json({
        error:
          "Name is required."
      });
    }

    if (!category) {
      return res.status(400).json({
        error:
          "Service category is required."
      });
    }

    if (
      experience === null ||
      rate === null
    ) {
      return res.status(400).json({
        error:
          "Invalid experience or rate."
      });
    }

    const existing =
      getWorkerByUserId(
        req.user.user_id
      );

    if (existing) {
      db.prepare(`
        UPDATE workers
        SET
          name = ?,
          category = ?,
          skills = ?,
          experience = ?,
          rate = ?,
          bio = ?,
          lat = COALESCE(?, lat),
          lng = COALESCE(?, lng),
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(
        name,
        category,
        skills,
        experience,
        rate,
        bio,
        lat,
        lng,
        req.user.user_id
      );

      return res.json({
        success: true,
        message:
          existing.approved
            ? "Profile updated successfully."
            : "Profile updated. Admin approval is required.",
        approved:
          Boolean(existing.approved),
        verified:
          Boolean(existing.verified)
      });
    }

    db.prepare(`
      INSERT INTO workers
      (
        user_id,
        name,
        category,
        skills,
        experience,
        rate,
        bio,
        lat,
        lng
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.user_id,
      name,
      category,
      skills,
      experience,
      rate,
      bio,
      lat,
      lng
    );

    res.status(201).json({
      success: true,
      message:
        "Worker profile submitted for approval.",
      approved: false,
      verified: false
    });
  }
);

// ============================================================
// WORKER LOCATION
// ============================================================

app.post(
  "/api/workers/location",
  requireUser,
  requireRole("worker"),
  (req, res) => {
    const lat =
      clampNumber(
        req.body.lat,
        -90,
        90
      );

    const lng =
      clampNumber(
        req.body.lng,
        -180,
        180
      );

    if (
      lat === null ||
      lng === null
    ) {
      return res.status(400).json({
        error:
          "Valid GPS coordinates are required."
      });
    }

    const worker =
      getWorkerByUserId(
        req.user.user_id
      );

    if (!worker) {
      return res.status(404).json({
        error:
          "Worker profile not found."
      });
    }

    db.prepare(`
      UPDATE workers
      SET
        lat = ?,
        lng = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      lat,
      lng,
      worker.id
    );

    res.json({
      success: true,
      lat,
      lng
    });
  }
);

// ============================================================
// WORKER AVAILABILITY
// ============================================================

app.post(
  "/api/workers/availability",
  requireUser,
  requireRole("worker"),
  (req, res) => {
    const worker =
      getWorkerByUserId(
        req.user.user_id
      );

    if (!worker) {
      return res.status(404).json({
        error:
          "Worker profile not found."
      });
    }

    const available =
      req.body.available === true ||
      String(
        req.body.available
      ).toLowerCase() === "true";

    if (!worker.approved) {
      return res.status(403).json({
        error:
          "Worker is not approved."
      });
    }

    db.prepare(`
      UPDATE workers
      SET
        available = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      available ? 1 : 0,
      worker.id
    );

    res.json({
      success: true,
      available
    });
  }
);

// ============================================================
// WORKER PROFILE
// ============================================================

app.get(
  "/api/workers/me",
  requireUser,
  requireRole("worker"),
  (req, res) => {
    const worker =
      getWorkerByUserId(
        req.user.user_id
      );

    if (!worker) {
      return res.status(404).json({
        error:
          "Worker profile not found."
      });
    }

    res.json({
      worker:
        publicWorker(worker)
    });
  }
);

// ============================================================
// NEARBY WORKERS
// ============================================================

app.get(
  "/api/workers/nearby",
  requireUser,
  requireRole("customer"),
  (req, res) => {
    const lat =
      clampNumber(
        req.query.lat,
        -90,
        90
      );

    const lng =
      clampNumber(
        req.query.lng,
        -180,
        180
      );

    const category =
      cleanString(
        req.query.category,
        80
      );

    if (
      lat === null ||
      lng === null
    ) {
      return res.status(400).json({
        error:
          "Valid GPS coordinates are required."
      });
    }

    if (!category) {
      return res.status(400).json({
        error:
          "Service category is required."
      });
    }

    /*
      GPS BUSINESS RULE:

      10 km
      ↓
      15 km
      ↓
      20 km
      ↓
      25 km
      ↓
      30 km
      ↓
      35 km
      ↓
      40 km
      ↓
      45 km
      ↓
      50 km

      Once a successful range is found,
      farther workers are NOT mixed.
    */

    const ranges = [
      10,
      15,
      20,
      25,
      30,
      35,
      40,
      45,
      50
    ];

    const maxRange =
      Math.min(
        Math.max(
          Number(
            req.query.maxRadius ||
            MAX_BOOKING_RADIUS_KM
          ),
          10
        ),
        MAX_BOOKING_RADIUS_KM
      );

    const selectedRanges =
      ranges.filter(
        r => r <= maxRange
      );

    const workers =
      db.prepare(`
        SELECT *
        FROM workers
        WHERE LOWER(category) = LOWER(?)
          AND approved = 1
          AND available = 1
          AND lat IS NOT NULL
          AND lng IS NOT NULL
      `).all(category);

    let selected = [];

    for (
      const radius of selectedRanges
    ) {
      const matches =
        workers
          .map(worker => ({
            worker,
            distance:
              haversineDistance(
                lat,
                lng,
                Number(worker.lat),
                Number(worker.lng)
              )
          }))
          .filter(
            x =>
              x.distance <= radius
          )
          .sort(
            (a, b) =>
              a.distance -
              b.distance
          );

      if (matches.length) {
        selected =
          matches.map(
            x =>
              publicWorker(
                x.worker,
                x.distance
              )
          );

        return res.json({
          workers: selected,
          searchRadiusKm: radius
        });
      }
    }

    res.json({
      workers: [],
      searchRadiusKm: maxRange
    });
  }
);

// ============================================================
// PRICE PREVIEW
// ============================================================

app.get(
  "/api/bookings/price-preview",
  requireUser,
  requireRole("customer"),
  (req, res) => {
    const workerId =
      Number(req.query.workerId);

    if (
      !Number.isInteger(workerId) ||
      workerId <= 0
    ) {
      return res.status(400).json({
        error:
          "Invalid worker."
      });
    }

    const worker =
      db.prepare(`
        SELECT *
        FROM workers
        WHERE id = ?
          AND approved = 1
      `).get(workerId);

    if (!worker) {
      return res.status(404).json({
        error:
          "Worker not found."
      });
    }

    const pricing =
      calculateBookingPricing(
        req.user.user_id,
        worker.rate
      );

    res.json({
      pricing
    });
  }
);

// ============================================================
// CREATE BOOKING
// ============================================================

app.post(
  "/api/bookings",
  requireUser,
  requireRole("customer"),
  (req, res) => {
    const workerId =
      Number(req.body.workerId);

    const category =
      cleanString(
        req.body.category,
        80
      );

    const description =
      cleanString(
        req.body.description,
        1500
      );

    const address =
      cleanString(
        req.body.address,
        1000
      );

    const duration =
      cleanString(
        req.body.duration,
        50
      );

    const paymentMethod =
      cleanString(
        req.body.paymentMethod ||
        req.body.payment_method ||
        "cash",
        20
      ).toLowerCase();

    const customerLat =
      validNumber(req.body.lat)
        ? clampNumber(
            req.body.lat,
            -90,
            90
          )
        : null;

    const customerLng =
      validNumber(req.body.lng)
        ? clampNumber(
            req.body.lng,
            -180,
            180
          )
        : null;

    if (
      !Number.isInteger(workerId) ||
      workerId <= 0
    ) {
      return res.status(400).json({
        error:
          "Invalid worker."
      });
    }

    if (!category) {
      return res.status(400).json({
        error:
          "Category is required."
      });
    }

    if (!description) {
      return res.status(400).json({
        error:
          "Please describe the work."
      });
    }

    if (!address) {
      return res.status(400).json({
        error:
          "Work address is required."
      });
    }

    if (!duration) {
      return res.status(400).json({
        error:
          "Work type is required."
      });
    }

    if (
      paymentMethod !== "cash" &&
      paymentMethod !== "online"
    ) {
      return res.status(400).json({
        error:
          "Payment method must be cash or online."
      });
    }

    const worker =
      db.prepare(`
        SELECT
          w.*,
          u.phone
        FROM workers w
        JOIN users u
          ON u.id = w.user_id
        WHERE w.id = ?
      `).get(workerId);

    if (!worker) {
      return res.status(404).json({
        error:
          "Worker not found."
      });
    }

    if (
      worker.user_id ===
      req.user.user_id
    ) {
      return res.status(400).json({
        error:
          "You cannot book yourself."
      });
    }

    if (!worker.approved) {
      return res.status(400).json({
        error:
          "Worker is not approved."
      });
    }

    if (!worker.available) {
      return res.status(400).json({
        error:
          "Worker is currently unavailable."
      });
    }

    if (
      worker.category.toLowerCase() !==
      category.toLowerCase()
    ) {
      return res.status(400).json({
        error:
          "Worker category does not match."
      });
    }

    // Server-side pricing
    const pricing =
      calculateBookingPricing(
        req.user.user_id,
        worker.rate
      );

    const completionCode =
      generateCompletionCode();

    const completionHash =
      hashValue(
        completionCode
      );

    const codeExpiry =
      Date.now() +
      COMPLETION_CODE_EXPIRY_MINUTES *
        60 *
        1000;

    const paymentStatus =
      paymentMethod === "online"
        ? "pending"
        : "cash_pending";

    const transaction =
      db.transaction(() => {
        const result =
          db.prepare(`
            INSERT INTO bookings
            (
              customer_id,
              worker_id,
              category,
              description,
              address,
              lat,
              lng,
              duration,

              worker_price,
              platform_fee,
              discount,
              customer_total,

              payment_method,
              payment_status,
              worker_fee_status,

              status,

              completion_code_hash,
              completion_code_expires_at
            )
            VALUES
            (?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?,
             ?, ?, ?,
             'requested',
             ?, ?)
          `).run(
            req.user.user_id,
            workerId,
            category,
            description,
            address,
            customerLat,
            customerLng,
            duration,

            pricing.workerPrice,
            pricing.platformFee,
            pricing.discount,
            pricing.customerTotal,

            paymentMethod,
            paymentStatus,
            "pending",

            completionHash,
            codeExpiry
          );

        const bookingId =
          Number(
            result.lastInsertRowid
          );

        addNotification(
          worker.user_id,
          "booking_request",
          `New ${category} booking request received.`,
          bookingId
        );

        return bookingId;
      });

    const bookingId =
      transaction();

    res.status(201).json({
      success: true,

      bookingId,

      pricing: {
        workerPrice:
          pricing.workerPrice,

        platformFee:
          pricing.platformFee,

        discount:
          pricing.discount,

        customerTotal:
          pricing.customerTotal
      },

      paymentMethod,

      /*
        Completion code belongs to customer.
        Store only its hash in database.
      */
      completionCode,

      loyalty: {
        completedBookings:
          pricing.completedBookings,

        firstBookingFree:
          FIRST_BOOKING_FREE &&
          pricing.completedBookings === 0,

        discountPercent:
          LOYALTY_DISCOUNT_PERCENT
      },

      message:
        paymentMethod === "online"
          ? "Booking created. Online payment is required."
          : "Booking request sent successfully."
    });
  }
);

// ============================================================
// WORKER ACCEPT BOOKING
// ============================================================

app.post(
  "/api/bookings/:id/accept",
  requireUser,
  requireRole("worker"),
  (req, res) => {
    const bookingId =
      Number(req.params.id);

    const worker =
      getWorkerByUserId(
        req.user.user_id
      );

    if (!worker) {
      return res.status(404).json({
        error:
          "Worker profile not found."
      });
    }

    if (!worker.approved) {
      return res.status(403).json({
        error:
          "Worker is not approved."
      });
    }

    const booking =
      db.prepare(`
        SELECT *
        FROM bookings
        WHERE id = ?
      `).get(bookingId);

    if (!booking) {
      return res.status(404).json({
        error:
          "Booking not found."
      });
    }

    if (
      booking.worker_id !==
      worker.id
    ) {
      return res.status(403).json({
        error:
          "This booking does not belong to you."
      });
    }

    if (
      booking.status !==
      "requested"
    ) {
      return res.status(400).json({
        error:
          "Booking cannot be accepted."
      });
    }

    if (
      booking.payment_method ===
        "online" &&
      booking.payment_status !==
        "paid"
    ) {
      return res.status(400).json({
        error:
          "Online payment is not completed."
      });
    }

    const transaction =
      db.transaction(() => {
        db.prepare(`
          UPDATE bookings
          SET
            status = 'accepted',
            accepted_at = CURRENT_TIMESTAMP,
            worker_phone_revealed = 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(bookingId);

        addNotification(
          booking.customer_id,
          "booking_accepted",
          "Your worker accepted the booking. Worker contact is now available.",
          bookingId
        );
      });

    transaction();

    res.json({
      success: true,
      message:
        "Booking accepted.",
      workerPhone:
        db.prepare(`
          SELECT phone
          FROM users
          WHERE id = ?
        `).get(
          worker.user_id
        ).phone
    });
  }
);

// ============================================================
// GET BOOKING CONTACT
// ============================================================

app.get(
  "/api/bookings/:id/contact",
  requireUser,
  (req, res) => {
    const bookingId =
      Number(req.params.id);

    const booking =
      db.prepare(`
        SELECT
          b.*,
          w.user_id AS worker_user_id,
          u.phone AS worker_phone
        FROM bookings b
        JOIN workers w
          ON w.id = b.worker_id
        JOIN users u
          ON u.id = w.user_id
        WHERE b.id = ?
      `).get(bookingId);

    if (!booking) {
      return res.status(404).json({
        error:
          "Booking not found."
      });
    }

    const worker =
      getWorkerByUserId(
        req.user.user_id
      );

    const isCustomer =
      booking.customer_id ===
      req.user.user_id;

    const isWorker =
      worker &&
      worker.id ===
      booking.worker_id;

    if (
      !isCustomer &&
      !isWorker
    ) {
      return res.status(403).json({
        error:
          "Access denied."
      });
    }

    if (
      !booking.worker_phone_revealed
    ) {
      return res.status(403).json({
        error:
          "Worker contact becomes available after acceptance."
      });
    }

    res.json({
      workerPhone:
        booking.worker_phone
    });
  }
);

// ============================================================
// START JOB
// ============================================================

app.post(
  "/api/bookings/:id/start",
  requireUser,
  requireRole("worker"),
  (req, res) => {
    const worker =
      getWorkerByUserId(
        req.user.user_id
      );

    const booking =
      db.prepare(`
        SELECT *
        FROM bookings
        WHERE id = ?
      `).get(
        Number(req.params.id)
      );

    if (!worker || !booking) {
      return res.status(404).json({
        error:
          "Booking not found."
      });
    }

    if (
      booking.worker_id !==
      worker.id
    ) {
      return res.status(403).json({
        error:
          "Access denied."
      });
    }

    if (
      booking.status !==
      "accepted"
    ) {
      return res.status(400).json({
        error:
          "Booking must be accepted first."
      });
    }

    db.prepare(`
      UPDATE bookings
      SET
        status = 'in_progress',
        started_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      booking.id
    );

    addNotification(
      booking.customer_id,
      "job_started",
      "Your worker has started the job.",
      booking.id
    );

    res.json({
      success: true,
      message:
        "Job started."
    });
  }
);

// ============================================================
// COMPLETE BOOKING
// ============================================================

app.post(
  "/api/bookings/:id/complete",
  requireUser,
  requireRole("worker"),
  (req, res) => {
    const bookingId =
      Number(req.params.id);

    const code =
      cleanString(
        req.body.code,
        6
      );

    if (
      !/^[0-9]{6}$/.test(code)
    ) {
      return res.status(400).json({
        error:
          "Valid 6 digit completion code required."
      });
    }

    const worker =
      getWorkerByUserId(
        req.user.user_id
      );

    const booking =
      db.prepare(`
        SELECT *
        FROM bookings
        WHERE id = ?
      `).get(bookingId);

    if (!worker || !booking) {
      return res.status(404).json({
        error:
          "Booking not found."
      });
    }

    if (
      booking.worker_id !==
      worker.id
    ) {
      return res.status(403).json({
        error:
          "Only the appointed worker can complete this job."
      });
    }

    if (
      booking.status !==
      "in_progress"
    ) {
      return res.status(400).json({
        error:
          "Job must be in progress."
      });
    }

    if (
      booking.completion_code_verified
    ) {
      return res.status(400).json({
        error:
          "Booking already completed."
      });
    }

    if (
      booking.completion_code_expires_at &&
      Date.now() >
        booking.completion_code_expires_at
    ) {
      return res.status(400).json({
        error:
          "Completion code expired."
      });
    }

    if (
      !safeEqual(
        hashValue(code),
        booking.completion_code_hash
      )
    ) {
      return res.status(400).json({
        error:
          "Incorrect completion code."
      });
    }

    const transaction =
      db.transaction(() => {
        db.prepare(`
          UPDATE bookings
          SET
            status = 'completed',
            completion_code_verified = 1,
            completed_at = CURRENT_TIMESTAMP,

            payment_status =
              CASE
                WHEN payment_method = 'online'
                  THEN 'paid'
                ELSE 'cash_received'
              END,

            worker_fee_status = 'pending',

            updated_at = CURRENT_TIMESTAMP

          WHERE id = ?
        `).run(bookingId);

        /*
          Platform revenue is recorded only after
          successful completion verification.
        */

        if (
          Number(booking.platform_fee) > 0
        ) {
          db.prepare(`
            INSERT INTO worker_ledger
            (
              worker_id,
              booking_id,
              type,
              amount,
              status,
              description
            )
            VALUES
            (?, ?, 'platform_fee', ?, 'pending', ?)
          `).run(
            worker.id,
            bookingId,
            booking.platform_fee,
            `Platform fee for booking #${bookingId}`
          );
        }

        addNotification(
          booking.customer_id,
          "booking_completed",
          `Booking #${bookingId} completed successfully.`,
          bookingId
        );
      });

    transaction();

    res.json({
      success: true,
      message:
        "Booking completed and verified.",
      platformFee:
        booking.platform_fee
    });
  }
);

// ============================================================
// CANCEL BOOKING
// ============================================================

app.post(
  "/api/bookings/:id/cancel",
  requireUser,
  (req, res) => {
    const bookingId =
      Number(req.params.id);

    const reason =
      cleanString(
        req.body.reason ||
        "Cancelled by user.",
        300
      );

    const booking =
      db.prepare(`
        SELECT *
        FROM bookings
        WHERE id = ?
      `).get(bookingId);

    if (!booking) {
      return res.status(404).json({
        error:
          "Booking not found."
      });
    }

    const worker =
      getWorkerByUserId(
        req.user.user_id
      );

    const isCustomer =
      booking.customer_id ===
      req.user.user_id;

    const isWorker =
      worker &&
      booking.worker_id ===
      worker.id;

    if (
      !isCustomer &&
      !isWorker
    ) {
      return res.status(403).json({
        error:
          "Access denied."
      });
    }

    if (
      booking.status ===
        "completed" ||
      booking.status ===
        "cancelled"
    ) {
      return res.status(400).json({
        error:
          "Booking cannot be cancelled."
      });
    }

    db.prepare(`
      UPDATE bookings
      SET
        status = 'cancelled',
        cancelled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(bookingId);

    const otherUserId =
      isCustomer
        ? db.prepare(`
            SELECT user_id
            FROM workers
            WHERE id = ?
          `).get(
            booking.worker_id
          ).user_id
        : booking.customer_id;

    addNotification(
      otherUserId,
      "booking_cancelled",
      `Booking #${bookingId} was cancelled. Reason: ${reason}`,
      bookingId
    );

    res.json({
      success: true,
      message:
        "Booking cancelled."
    });
  }
);

// ============================================================
// MY BOOKINGS
// ============================================================

app.get(
  "/api/bookings/my",
  requireUser,
  (req, res) => {
    if (
      req.user.role ===
      "customer"
    ) {
      const bookings =
        db.prepare(`
          SELECT
            b.*,
            w.name AS worker_name,
            w.verified AS worker_verified,
            CASE
              WHEN b.worker_phone_revealed = 1
              THEN u.phone
              ELSE NULL
            END AS worker_phone
          FROM bookings b
          JOIN workers w
            ON w.id = b.worker_id
          JOIN users u
            ON u.id = w.user_id
          WHERE b.customer_id = ?
          ORDER BY b.id DESC
        `).all(
          req.user.user_id
        );

      return res.json({
        bookings
      });
    }

    if (
      req.user.role ===
      "worker"
    ) {
      const worker =
        getWorkerByUserId(
          req.user.user_id
        );

      if (!worker) {
        return res.json({
          bookings: []
        });
      }

      const bookings =
        db.prepare(`
          SELECT
            b.*,
            CASE
              WHEN b.worker_phone_revealed = 1
              THEN u.phone
              ELSE NULL
            END AS customer_phone
          FROM bookings b
          JOIN users u
            ON u.id = b.customer_id
          WHERE b.worker_id = ?
          ORDER BY b.id DESC
        `).all(
          worker.id
        );

      return res.json({
        bookings
      });
    }

    res.json({
      bookings: []
    });
  }
);

// ============================================================
// CUSTOMER LOYALTY
// ============================================================

app.get(
  "/api/customer/loyalty",
  requireUser,
  requireRole("customer"),
  (req, res) => {
    const completed =
      getCompletedBookingCount(
        req.user.user_id
      );

    const nextRewardAt =
      completed === 0
        ? LOYALTY_COMPLETED_BOOKINGS
        : (
            Math.floor(
              completed /
                LOYALTY_COMPLETED_BOOKINGS
            ) + 1
          ) *
          LOYALTY_COMPLETED_BOOKINGS;

    res.json({
      completedBookings:
        completed,

      loyaltyTarget:
        LOYALTY_COMPLETED_BOOKINGS,

      discountPercent:
        LOYALTY_DISCOUNT_PERCENT,

      nextRewardAt,

      remaining:
        Math.max(
          nextRewardAt -
            completed,
          0
        )
    });
  }
);

// ============================================================
// NOTIFICATIONS
// ============================================================

app.get(
  "/api/notifications",
  requireUser,
  (req, res) => {
    const notifications =
      db.prepare(`
        SELECT *
        FROM notifications
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 100
      `).all(
        req.user.user_id
      );

    res.json({
      notifications
    });
  }
);

app.post(
  "/api/notifications/:id/read",
  requireUser,
  (req, res) => {
    db.prepare(`
      UPDATE notifications
      SET read = 1
      WHERE id = ?
        AND user_id = ?
    `).run(
      Number(req.params.id),
      req.user.user_id
    );

    res.json({
      success: true
    });
  }
);

// ============================================================
// ONLINE PAYMENT CREATE
// ============================================================

app.post(
  "/api/payments/create",
  requireUser,
  requireRole("customer"),
  async (req, res) => {
    const bookingId =
      Number(req.body.bookingId);

    const booking =
      db.prepare(`
        SELECT *
        FROM bookings
        WHERE id = ?
          AND customer_id = ?
      `).get(
        bookingId,
        req.user.user_id
      );

    if (!booking) {
      return res.status(404).json({
        error:
          "Booking not found."
      });
    }

    if (
      booking.payment_method !==
      "online"
    ) {
      return res.status(400).json({
        error:
          "This booking uses cash payment."
      });
    }

    if (
      booking.status ===
      "cancelled"
    ) {
      return res.status(400).json({
        error:
          "Cancelled booking."
      });
    }

    if (
      booking.payment_status ===
      "paid"
    ) {
      return res.json({
        success: true,
        alreadyPaid: true,
        bookingId
      });
    }

    /*
      REAL PAYMENT GATEWAY SUPPORT

      Set these Render environment variables:

      RAZORPAY_KEY_ID
      RAZORPAY_KEY_SECRET

      The backend creates the order.
      Frontend uses the returned order details.
    */

    const keyId =
      process.env.RAZORPAY_KEY_ID;

    const keySecret =
      process.env.RAZORPAY_KEY_SECRET;

    if (
      !keyId ||
      !keySecret
    ) {
      return res.status(503).json({
        error:
          "Online payment gateway is not configured yet.",
        amount:
          booking.customer_total,
        currency: "INR"
      });
    }

    try {
      const Razorpay =
        require("razorpay");

      const razorpay =
        new Razorpay({
          key_id: keyId,
          key_secret: keySecret
        });

      const order =
        await razorpay.orders.create({
          amount:
            Math.round(
              Number(
                booking.customer_total
              ) * 100
            ),
          currency: "INR",
          receipt:
            `KS-${booking.id}`,
          notes: {
            bookingId:
              String(booking.id),
            customerId:
              String(
                booking.customer_id
              )
          }
        });

      db.prepare(`
        INSERT INTO payment_orders
        (
          booking_id,
          provider,
          provider_order_id,
          amount,
          currency,
          status
        )
        VALUES (?, 'razorpay', ?, ?, 'INR', 'created')

        ON CONFLICT(booking_id)
        DO UPDATE SET
          provider_order_id =
            excluded.provider_order_id,
          amount =
            excluded.amount,
          status =
            'created',
          updated_at =
            CURRENT_TIMESTAMP
      `).run(
        booking.id,
        order.id,
        booking.customer_total
      );

      res.json({
        success: true,

        provider: "razorpay",

        keyId,

        orderId:
          order.id,

        amount:
          booking.customer_total,

        currency:
          "INR"
      });

    } catch (error) {
      console.error(
        "Payment order error:",
        error
      );

      res.status(500).json({
        error:
          "Unable to create payment order."
      });
    }
  }
);

// ============================================================
// RAZORPAY PAYMENT VERIFY
// ============================================================

app.post(
  "/api/payments/verify",
  requireUser,
  requireRole("customer"),
  (req, res) => {
    const bookingId =
      Number(req.body.bookingId);

    const paymentId =
      cleanString(
        req.body.razorpay_payment_id,
        200
      );

    const orderId =
      cleanString(
        req.body.razorpay_order_id,
        200
      );

    const signature =
      cleanString(
        req.body.razorpay_signature,
        300
      );

    const keySecret =
      process.env.RAZORPAY_KEY_SECRET;

    if (
      !keySecret
    ) {
      return res.status(503).json({
        error:
          "Payment gateway is not configured."
      });
    }

    const booking =
      db.prepare(`
        SELECT *
        FROM bookings
        WHERE id = ?
          AND customer_id = ?
          AND payment_method = 'online'
      `).get(
        bookingId,
        req.user.user_id
      );

    if (!booking) {
      return res.status(404).json({
        error:
          "Booking not found."
      });
    }

    const expected =
      crypto
        .createHmac(
          "sha256",
          keySecret
        )
        .update(
          `${orderId}|${paymentId}`
        )
        .digest("hex");

    if (
      !safeEqual(
        expected,
        signature
      )
    ) {
      return res.status(400).json({
        error:
          "Invalid payment signature."
      });
    }

    const paymentOrder =
      db.prepare(`
        SELECT *
        FROM payment_orders
        WHERE booking_id = ?
          AND provider_order_id = ?
      `).get(
        bookingId,
        orderId
      );

    if (!paymentOrder) {
      return res.status(400).json({
        error:
          "Payment order mismatch."
      });
    }

    db.transaction(() => {
      db.prepare(`
        UPDATE bookings
        SET
          payment_status = 'paid',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(bookingId);

      db.prepare(`
        UPDATE payment_orders
        SET
          status = 'paid',
          updated_at = CURRENT_TIMESTAMP
        WHERE booking_id = ?
      `).run(bookingId);

      addNotification(
        booking.worker_id,
        "payment_received",
        `Online payment received for booking #${bookingId}.`,
        bookingId
      );
    })();

    res.json({
      success: true,
      message:
        "Payment verified successfully."
    });
  }
);

// ============================================================
// PAYMENT WEBHOOK
// ============================================================

app.post(
  "/api/payments/webhook",
  express.raw({
    type: "application/json"
  }),
  (req, res) => {
    /*
      Razorpay webhook signature verification
      should be configured using RAZORPAY_WEBHOOK_SECRET.

      This route deliberately does not trust a browser's
      {paid:true} field.
    */

    const webhookSecret =
      process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return res.status(503).json({
        error:
          "Webhook secret is not configured."
      });
    }

    const signature =
      String(
        req.headers[
          "x-razorpay-signature"
        ] || ""
      );

    const rawBody =
      Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(
            JSON.stringify(
              req.body || {}
            )
          );

    const expected =
      crypto
        .createHmac(
          "sha256",
          webhookSecret
        )
        .update(rawBody)
        .digest("hex");

    if (
      !safeEqual(
        expected,
        signature
      )
    ) {
      return res.status(400).json({
        error:
          "Invalid webhook signature."
      });
    }

    let payload;

    try {
      payload =
        JSON.parse(
          rawBody.toString()
        );
    } catch {
      return res.status(400).json({
        error:
          "Invalid webhook payload."
      });
    }

    const event =
      payload.event;

    if (
      event ===
      "payment.captured"
    ) {
      const payment =
        payload.payload &&
        payload.payload.payment &&
        payload.payload.payment.entity;

      if (payment) {
        const orderId =
          payment.order_id;

        const bookingOrder =
          db.prepare(`
            SELECT *
            FROM payment_orders
            WHERE provider_order_id = ?
          `).get(orderId);

        if (bookingOrder) {
          db.transaction(() => {
            db.prepare(`
              UPDATE bookings
              SET
                payment_status = 'paid',
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(
              bookingOrder.booking_id
            );

            db.prepare(`
              UPDATE payment_orders
              SET
                status = 'paid',
                updated_at = CURRENT_TIMESTAMP
              WHERE booking_id = ?
            `).run(
              bookingOrder.booking_id
            );
          })();
        }
      }
    }

    res.json({
      received: true
    });
  }
);

// ============================================================
// ADMIN STATS
// ============================================================

app.get(
  "/api/admin/stats",
  requireAdmin,
  (req, res) => {
    const users =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM users
      `).get().count;

    const workers =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM workers
      `).get().count;

    const verifiedWorkers =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM workers
        WHERE approved = 1
          AND verified = 1
      `).get().count;

    const bookings =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM bookings
      `).get().count;

    const completed =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM bookings
        WHERE status = 'completed'
      `).get().count;

    const cancelled =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM bookings
        WHERE status = 'cancelled'
      `).get().count;

    const revenue =
      db.prepare(`
        SELECT
          COALESCE(
            SUM(platform_fee),
            0
          ) AS total
        FROM bookings
        WHERE status = 'completed'
      `).get().total;

    const unsettled =
      db.prepare(`
        SELECT
          COALESCE(
            SUM(amount),
            0
          ) AS total
        FROM worker_ledger
        WHERE type = 'platform_fee'
          AND status = 'pending'
      `).get().total;

    res.json({
      users,
      workers,
      verifiedWorkers,
      bookings,
      completedBookings:
        completed,
      cancelledBookings:
        cancelled,
      platformRevenue:
        roundMoney(revenue),
      unsettledPlatformFees:
        roundMoney(unsettled)
    });
  }
);

// ============================================================
// ADMIN WORKERS
// ============================================================

app.get(
  "/api/admin/workers",
  requireAdmin,
  (req, res) => {
    const workers =
      db.prepare(`
        SELECT
          w.*,
          u.phone
        FROM workers w
        JOIN users u
          ON u.id = w.user_id
        ORDER BY
          w.approved ASC,
          w.id DESC
      `).all();

    res.json(
      workers.map(
        worker => ({
          id: worker.id,
          name: worker.name,
          phone: worker.phone,
          category: worker.category,
          skills: worker.skills,
          experience: worker.experience,
          rate: worker.rate,
          bio: worker.bio,
          rating: worker.rating,
          approved:
            Boolean(worker.approved),
          verified:
            Boolean(worker.verified),
          available:
            Boolean(worker.available),
          lat: worker.lat,
          lng: worker.lng,
          created_at:
            worker.created_at
        })
      )
    );
  }
);

// ============================================================
// ADMIN APPROVE / VERIFY WORKER
// ============================================================

app.patch(
  "/api/admin/workers/:id",
  requireAdmin,
  (req, res) => {
    const workerId =
      Number(req.params.id);

    const worker =
      db.prepare(`
        SELECT *
        FROM workers
        WHERE id = ?
      `).get(workerId);

    if (!worker) {
      return res.status(404).json({
        error:
          "Worker not found."
      });
    }

    const approved =
      req.body.approved === true ||
      String(
        req.body.approved
      ).toLowerCase() === "true";

    const verified =
      req.body.verified === true ||
      String(
        req.body.verified
      ).toLowerCase() === "true";

    db.prepare(`
      UPDATE workers
      SET
        approved = ?,
        verified = ?,
        available =
          CASE
            WHEN ? = 1
            THEN available
            ELSE 0
          END,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      approved ? 1 : 0,
      approved && verified
        ? 1
        : 0,
      approved ? 1 : 0,
      workerId
    );

    addNotification(
      worker.user_id,
      approved
        ? "worker_approved"
        : "worker_disabled",
      approved
        ? (
            verified
              ? "Your KaamSetu profile is approved and verified."
              : "Your KaamSetu profile is approved."
          )
        : "Your KaamSetu worker profile has been disabled."
    );

    res.json({
      success: true,
      approved,
      verified:
        approved && verified
    });
  }
);

// ============================================================
// ADMIN BOOKINGS
// ============================================================

app.get(
  "/api/admin/bookings",
  requireAdmin,
  (req, res) => {
    const bookings =
      db.prepare(`
        SELECT
          b.*,

          customer.phone
            AS customer_phone,

          worker.name
            AS worker_name,

          worker.phone
            AS worker_phone

        FROM bookings b

        JOIN users customer
          ON customer.id =
             b.customer_id

        JOIN workers worker
          ON worker.id =
             b.worker_id

        JOIN users workerUser
          ON workerUser.id =
             worker.user_id

        ORDER BY
          b.id DESC
      `).all();

    res.json({
      bookings
    });
  }
);

// ============================================================
// ADMIN LEDGER
// ============================================================

app.get(
  "/api/admin/worker-ledger",
  requireAdmin,
  (req, res) => {
    const ledger =
      db.prepare(`
        SELECT
          l.*,
          w.name AS worker_name,
          u.phone AS worker_phone
        FROM worker_ledger l
        JOIN workers w
          ON w.id = l.worker_id
        JOIN users u
          ON u.id = w.user_id
        ORDER BY l.id DESC
      `).all();

    res.json({
      ledger
    });
  }
);

// ============================================================
// ADMIN SETTLE PLATFORM FEE
// ============================================================

app.patch(
  "/api/admin/worker-ledger/:id/settle",
  requireAdmin,
  (req, res) => {
    const ledgerId =
      Number(req.params.id);

    const ledger =
      db.prepare(`
        SELECT *
        FROM worker_ledger
        WHERE id = ?
      `).get(ledgerId);

    if (!ledger) {
      return res.status(404).json({
        error:
          "Ledger entry not found."
      });
    }

    if (
      ledger.status ===
      "settled"
    ) {
      return res.status(400).json({
        error:
          "Already settled."
      });
    }

    db.prepare(`
      UPDATE worker_ledger
      SET status = 'settled'
      WHERE id = ?
    `).run(ledgerId);

    res.json({
      success: true,
      message:
        "Platform fee marked as settled."
    });
  }
);

// ============================================================
// ADMIN REVENUE
// ============================================================

app.get(
  "/api/admin/revenue",
  requireAdmin,
  (req, res) => {
    const summary =
      db.prepare(`
        SELECT
          COUNT(*) AS completed_bookings,

          COALESCE(
            SUM(worker_price),
            0
          ) AS worker_value,

          COALESCE(
            SUM(platform_fee),
            0
          ) AS platform_revenue,

          COALESCE(
            SUM(discount),
            0
          ) AS discounts,

          COALESCE(
            SUM(customer_total),
            0
          ) AS customer_total

        FROM bookings

        WHERE status =
          'completed'
      `).get();

    const unsettled =
      db.prepare(`
        SELECT
          COALESCE(
            SUM(amount),
            0
          ) AS amount
        FROM worker_ledger
        WHERE type =
          'platform_fee'
          AND status =
          'pending'
      `).get();

    res.json({
      completedBookings:
        summary.completed_bookings,

      workerValue:
        roundMoney(
          summary.worker_value
        ),

      platformRevenue:
        roundMoney(
          summary.platform_revenue
        ),

      discounts:
        roundMoney(
          summary.discounts
        ),

      customerTotal:
        roundMoney(
          summary.customer_total
        ),

      unsettledWorkerFees:
        roundMoney(
          unsettled.amount
        )
    });
  }
);

// ============================================================
// CLEAN OLD SESSIONS / OTPs
// ============================================================

setInterval(
  () => {
    try {
      db.prepare(`
        DELETE FROM sessions
        WHERE expires_at < ?
      `).run(
        Date.now()
      );

      db.prepare(`
        DELETE FROM otp_codes
        WHERE expires_at < ?
      `).run(
        Date.now()
      );
    } catch (error) {
      console.error(
        "Cleanup error:",
        error
      );
    }
  },
  60 * 60 * 1000
);

// ============================================================
// API 404
// ============================================================

app.use(
  "/api",
  (req, res) => {
    res.status(404).json({
      error:
        "API endpoint not found."
    });
  }
);

// ============================================================
// STATIC FRONTEND
// ============================================================

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);

// ============================================================
// FRONTEND FALLBACK
// ============================================================

app.get(
  "*splat",
  (req, res) => {
    if (
      req.path.startsWith("/api/")
    ) {
      return res.status(404).json({
        error:
          "API endpoint not found."
      });
    }

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    console.error(
      "KaamSetu server error:",
      err
    );

    if (
      res.headersSent
    ) {
      return next(err);
    }

    res.status(500).json({
      error:
        "Internal server error."
    });
  }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `KaamSetu server running on port ${PORT}`
    );

    console.log(
      `Platform fee: ${PLATFORM_FEE_PERCENT}%`
    );

    console.log(
      `First booking free: ${FIRST_BOOKING_FREE}`
    );

    console.log(
      `Loyalty target: ${LOYALTY_COMPLETED_BOOKINGS}`
    );

    console.log(
      `Loyalty discount: ${LOYALTY_DISCOUNT_PERCENT}%`
    );

    console.log(
      `Maximum GPS range: ${MAX_BOOKING_RADIUS_KM} km`
    );

    if (!ADMIN_KEY) {
      console.warn(
        "WARNING: ADMIN_KEY is not configured."
      );
    }
  }
);
