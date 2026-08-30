// ============================================================
// KAAMSETU - FINAL MVP BACKEND
// ============================================================

const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;
const ADMIN_KEY = process.env.ADMIN_KEY || "";

const PLATFORM_FEE_PERCENT =
  Number(process.env.PLATFORM_FEE_PERCENT || 10);

const OTP_EXPIRY_MINUTES =
  Number(process.env.OTP_EXPIRY_MINUTES || 5);

const MAX_BOOKING_RADIUS_KM =
  Number(process.env.MAX_BOOKING_RADIUS_KM || 50);


// ============================================================
// SECURITY / MIDDLEWARE
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
    error: "Too many requests. Please try again later."
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
// DATABASE TABLES
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE,
    role TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    available INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)
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
    customer_total REAL NOT NULL DEFAULT 0,

    payment_method TEXT NOT NULL DEFAULT 'cash',
    payment_status TEXT NOT NULL DEFAULT 'pending',

    worker_fee_status TEXT NOT NULL DEFAULT 'pending',

    status TEXT NOT NULL DEFAULT 'requested',

    completion_code_hash TEXT,
    completion_code_verified INTEGER NOT NULL DEFAULT 0,

    worker_phone_revealed INTEGER NOT NULL DEFAULT 0,

    accepted_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    cancelled_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (customer_id)
      REFERENCES users(id),

    FOREIGN KEY (worker_id)
      REFERENCES workers(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    booking_id INTEGER,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
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

    FOREIGN KEY (worker_id)
      REFERENCES workers(id)
      ON DELETE CASCADE,

    FOREIGN KEY (booking_id)
      REFERENCES bookings(id)
      ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_workers_category
    ON workers(category);

  CREATE INDEX IF NOT EXISTS idx_workers_location
    ON workers(lat, lng);

  CREATE INDEX IF NOT EXISTS idx_bookings_customer
    ON bookings(customer_id);

  CREATE INDEX IF NOT EXISTS idx_bookings_worker
    ON bookings(worker_id);

  CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications(user_id);
`);


// ============================================================
// HELPERS
// ============================================================

function normalizePhone(phone) {
  return String(phone || "")
    .replace(/\D/g, "")
    .slice(-10);
}

function validPhone(phone) {
  return /^[0-9]{10}$/.test(phone);
}

function cleanString(value, max = 1000) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
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

function calculatePlatformFee(workerPrice) {
  return roundMoney(
    Number(workerPrice) *
      (PLATFORM_FEE_PERCENT / 100)
  );
}

function calculateTotal(workerPrice) {
  const fee =
    calculatePlatformFee(workerPrice);

  return roundMoney(
    Number(workerPrice) + fee
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

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;
}

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

function getUserFromRequest(req) {
  const id =
    Number(req.headers["x-user-id"]);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return null;
  }

  return db.prepare(`
    SELECT *
    FROM users
    WHERE id = ?
  `).get(id);
}

function requireUser(req, res, next) {
  const user =
    getUserFromRequest(req);

  if (!user) {
    return res.status(401).json({
      error: "Login required."
    });
  }

  req.user = user;

  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Login required."
      });
    }

    if (req.user.role !== role) {
      return res.status(403).json({
        error: "Access denied."
      });
    }

    next();
  };
}

function requireAdmin(req, res, next) {
  if (
    !ADMIN_KEY ||
    req.headers["x-admin-key"] !== ADMIN_KEY
  ) {
    return res.status(403).json({
      error: "Admin access denied."
    });
  }

  next();
}

function getWorkerByUserId(userId) {
  return db.prepare(`
    SELECT *
    FROM workers
    WHERE user_id = ?
  `).get(userId);
}

function publicWorker(worker, distanceKm = null) {
  return {
    id: worker.id,
    name: worker.name,
    category: worker.category,
    skills: worker.skills,
    experience: worker.experience,
    rate: worker.rate,
    bio: worker.bio,
    rating: worker.rating,
    approved: Boolean(worker.approved),
    available: Boolean(worker.available),
    distanceKm:
      distanceKm === null
        ? null
        : roundMoney(distanceKm)
  };
}


// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "KaamSetu",
    time: new Date().toISOString()
  });
});


// ============================================================
// AUTH - SEND OTP
// ============================================================

app.post(
  "/api/auth/send-otp",
  authLimiter,
  (req, res) => {
    const phone =
      normalizePhone(req.body.phone);

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

    // ========================================================
    // DEVELOPMENT MODE
    // ========================================================
    // Real SMS provider can be connected later.
    //
    // Never expose OTP in production.
    // ========================================================

    const response = {
      message:
        "OTP generated successfully."
    };

    if (
      process.env.NODE_ENV !== "production"
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
// AUTH - VERIFY OTP
// ============================================================

app.post(
  "/api/auth/verify-otp",
  authLimiter,
  (req, res) => {
    const phone =
      normalizePhone(req.body.phone);

    const otp =
      cleanString(req.body.otp, 6);

    if (!validPhone(phone)) {
      return res.status(400).json({
        error: "Invalid phone number."
      });
    }

    if (!/^[0-9]{6}$/.test(otp)) {
      return res.status(400).json({
        error: "Invalid OTP."
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
          "OTP not found. Please request a new OTP."
      });
    }

    if (
      Date.now() > record.expires_at
    ) {
      return res.status(400).json({
        error:
          "OTP expired. Please request a new OTP."
      });
    }

    if (record.attempts >= 5) {
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
      hashValue(otp) !==
      record.otp_hash
    ) {
      return res.status(400).json({
        error: "Incorrect OTP."
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
          INSERT INTO users (phone)
          VALUES (?)
        `).run(phone);

      user =
        db.prepare(`
          SELECT *
          FROM users
          WHERE id = ?
        `).get(result.lastInsertRowid);
    }

    res.json({
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role
      }
    });
  }
);


// ============================================================
// AUTH - SELECT ROLE
// ============================================================

app.post(
  "/api/auth/select-role",
  requireUser,
  (req, res) => {
    const role =
      cleanString(req.body.role, 20)
        .toLowerCase();

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
// WORKER REGISTER / UPDATE PROFILE
// ============================================================

app.post(
  "/api/workers/register",
  requireUser,
  requireRole("worker"),
  (req, res) => {
    const name =
      cleanString(req.body.name, 100);

    const category =
      cleanString(req.body.category, 80);

    const skills =
      cleanString(req.body.skills, 500);

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
      cleanString(req.body.bio, 1000);

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
        error: "Name is required."
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
        req.user.id
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
        req.user.id
      );

      return res.json({
        success: true,
        message:
          existing.approved
            ? "Profile updated successfully."
            : "Profile updated. Admin approval is required.",
        approved:
          Boolean(existing.approved)
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
      req.user.id,
      name,
      category,
      skills,
      experience,
      rate,
      bio,
      lat,
      lng
    );

    res.json({
      success: true,
      message:
        "Profile submitted successfully. Admin approval is required.",
      approved: false
    });
  }
);


// ============================================================
// WORKER GPS
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
        req.user.id
      );

    if (!worker) {
      return res.status(404).json({
        error:
          "Please create your worker profile first."
      });
    }

    db.prepare(`
      UPDATE workers
      SET
        lat = ?,
        lng = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      lat,
      lng,
      req.user.id
    );

    res.json({
      success: true,
      message:
        "GPS location updated successfully."
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

    // --------------------------------------------------------
    // GPS PRIORITY:
    //
    // 10 km first
    // If workers found -> STOP
    //
    // Otherwise 15 km
    // Otherwise 20 km
    // Otherwise 25 km...
    //
    // Once workers are found in the first successful range,
    // workers from farther ranges are NOT mixed into results.
    // --------------------------------------------------------

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

    const requestedRadius =
      clampNumber(
        req.query.radius,
        1,
        MAX_BOOKING_RADIUS_KM
      );

    let maxRange =
      requestedRadius || 10;

    maxRange =
      Math.min(
        maxRange,
        MAX_BOOKING_RADIUS_KM
      );

    const selectedRanges =
      ranges.filter(
        range => range <= maxRange
      );

    if (
      selectedRanges.length === 0
    ) {
      selectedRanges.push(10);
    }

    const workers =
      db.prepare(`
        SELECT *
        FROM workers
        WHERE category = ?
          AND approved = 1
          AND available = 1
          AND lat IS NOT NULL
          AND lng IS NOT NULL
      `).all(category);

    let selectedWorkers = [];

    for (
      const radius of selectedRanges
    ) {

      const matches =
        workers
          .map(worker => {

            const distance =
              haversineDistance(
                lat,
                lng,
                Number(worker.lat),
                Number(worker.lng)
              );

            return {
              worker,
              distance
            };
          })
          .filter(
            item =>
              item.distance <= radius
          )
          .sort(
            (a, b) =>
              a.distance -
              b.distance
          );

      if (matches.length) {

        selectedWorkers =
          matches.map(
            item =>
              publicWorker(
                item.worker,
                item.distance
              )
          );

        break;
      }
    }

    res.json({
      workers: selectedWorkers
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

    if (!worker.approved) {
      return res.status(400).json({
        error:
          "This worker is not approved."
      });
    }

    if (!worker.available) {
      return res.status(400).json({
        error:
          "This worker is currently unavailable."
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

    // --------------------------------------------------------
    // SERVER-SIDE PRICE
    // NEVER TRUST FRONTEND RATE.
    // --------------------------------------------------------

    const workerPrice =
      roundMoney(worker.rate);

    const platformFee =
      calculatePlatformFee(
        workerPrice
      );

    const customerTotal =
      roundMoney(
        workerPrice +
        platformFee
      );

    // --------------------------------------------------------
    // COMPLETION CODE
    // Generated on booking creation.
    // Stored only as hash.
    // Customer will know the code.
    // Worker must obtain it from customer at job completion.
    // --------------------------------------------------------

    const completionCode =
      generateCompletionCode();

    const completionHash =
      hashValue(
        completionCode
      );

    // --------------------------------------------------------
    // CUSTOMER PHONE MUST NOT BE PUBLIC.
    // WORKER PHONE WILL BE REVEALED ONLY AFTER ACCEPTANCE.
    // --------------------------------------------------------

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
          customer_total,
          payment_method,
          payment_status,
          worker_fee_status,
          status,
          completion_code_hash
        )
        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.user.id,
        workerId,
        category,
        description,
        address,
        customerLat,
        customerLng,
        duration,
        workerPrice,
        platformFee,
        customerTotal,
        paymentMethod,
        paymentMethod === "online"
          ? "pending"
          : "cash_pending",
        "pending",
        "requested",
        completionHash
      );

    const bookingId =
      Number(result.lastInsertRowid);

    addNotification(
      worker.user_id,
      "booking_request",
      `New ${category} job request received.`,
      bookingId
    );

    res.status(201).json({
      success: true,
      bookingId,

      pricing: {
        workerPrice,
        platformFee,
        customerTotal
      },

      paymentMethod,

      // Customer gets the code.
      // It is NOT stored in plaintext.
      completionCode,

      message:
        paymentMethod === "online"
          ? "Booking created. Complete online payment to continue."
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
        req.user.id
      );

    if (!worker) {
      return res.status(404).json({
        error:
          "Worker profile not found."
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
          "This booking cannot be accepted."
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
          "Online payment is not completed yet."
      });
    }

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
      "Your worker has accepted the booking. Worker contact details are now available.",
      bookingId
    );

    res.json({
      success: true,
      message:
        "Booking accepted.",

      // Phone is revealed ONLY now.
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
        req.user.id
      );

    const isCustomer =
      booking.customer_id ===
      req.user.id;

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
      !booking.worker_phone_revealed
    ) {
      return res.status(403).json({
        error:
          "Worker contact is available after the booking is accepted."
      });
    }

    res.json({
      workerPhone:
        booking.worker_phone
    });
  }
);


// ============================================================
// WORKER START JOB
// ============================================================

app.post(
  "/api/bookings/:id/start",
  requireUser,
  requireRole("worker"),
  (req, res) => {

    const worker =
      getWorkerByUserId(
        req.user.id
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
        "Job marked as started."
    });
  }
);


// ============================================================
// COMPLETE BOOKING WITH CODE
// ============================================================

app.post(
  "/api/bookings/:id/complete",
  requireUser,
  (req, res) => {

    const bookingId =
      Number(req.params.id);

    const code =
      cleanString(
        req.body.code,
        10
      );

    if (!/^[0-9]{6}$/.test(code)) {
      return res.status(400).json({
        error:
          "Valid completion code is required."
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

    const worker =
      getWorkerByUserId(
        req.user.id
      );

    const isWorker =
      worker &&
      worker.id ===
      booking.worker_id;

    if (!isWorker) {
      return res.status(403).json({
        error:
          "Only the appointed worker can complete the job."
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
          "Booking is already completed."
      });
    }

    if (
      hashValue(code) !==
      booking.completion_code_hash
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
            payment_status = CASE
              WHEN payment_method = 'online'
                THEN 'paid'
              ELSE 'cash_received'
            END,
            worker_fee_status = 'pending',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(bookingId);

        // ----------------------------------------------------
        // Platform revenue ledger
        // ----------------------------------------------------

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
          VALUES (?, ?, 'platform_fee', ?, 'pending', ?)
        `).run(
          worker.id,
          bookingId,
          booking.platform_fee,
          `Platform fee for booking #${bookingId}`
        );

        addNotification(
          booking.customer_id,
          "booking_completed",
          `Booking #${bookingId} has been completed successfully.`,
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
// CUSTOMER / WORKER BOOKINGS
// ============================================================

app.get(
  "/api/bookings/my",
  requireUser,
  (req, res) => {

    let bookings;

    if (
      req.user.role ===
      "customer"
    ) {

      bookings =
        db.prepare(`
          SELECT
            b.*,
            w.name AS worker_name,
            u.phone AS worker_phone
          FROM bookings b
          JOIN workers w
            ON w.id = b.worker_id
          JOIN users u
            ON u.id = w.user_id
          WHERE b.customer_id = ?
          ORDER BY b.id DESC
        `).all(
          req.user.id
        );

    } else if (
      req.user.role ===
      "worker"
    ) {

      const worker =
        getWorkerByUserId(
          req.user.id
        );

      if (!worker) {
        return res.json({
          bookings: []
        });
      }

      bookings =
        db.prepare(`
          SELECT
            b.*,
            u.phone AS customer_phone
          FROM bookings b
          JOIN users u
            ON u.id = b.customer_id
          WHERE b.worker_id = ?
          ORDER BY b.id DESC
        `).all(
          worker.id
        );

      // Do NOT expose customer phone before acceptance.
      bookings =
        bookings.map(
          booking => ({
            ...booking,
            customer_phone:
              booking.status ===
                "requested"
                ? "Hidden until accepted"
                : booking.customer_phone
          })
        );
    } else {

      bookings = [];
    }

    res.json({
      bookings
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
        req.user.id
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
      req.user.id
    );

    res.json({
      success: true
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
        req.user.id
      );

    if (!worker) {
      return res.status(404).json({
        error:
          "Worker profile not found."
      });
    }

    const available =
      Boolean(
        req.body.available
      );

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
// ADMIN - STATS
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

    const bookings =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM bookings
      `).get().count;

    const pendingWorkers =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM workers
        WHERE approved = 0
      `).get().count;

    const completedBookings =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM bookings
        WHERE status = 'completed'
      `).get().count;

    const platformRevenue =
      db.prepare(`
        SELECT
          COALESCE(
            SUM(platform_fee),
            0
          ) AS total
        FROM bookings
        WHERE status = 'completed'
      `).get().total;

    const pendingWorkerFees =
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
      bookings,
      pending_workers:
        pendingWorkers,
      completed_bookings:
        completedBookings,
      platform_revenue:
        roundMoney(platformRevenue),
      pending_worker_fees:
        roundMoney(pendingWorkerFees)
    });
  }
);


// ============================================================
// ADMIN - WORKERS
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
      workers.map(worker => ({
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
        available:
          Boolean(worker.available),
        lat: worker.lat,
        lng: worker.lng,
        created_at:
          worker.created_at
      }))
    );
  }
);


// ============================================================
// ADMIN - APPROVE / DISABLE WORKER
// ============================================================

app.patch(
  "/api/admin/workers/:id",
  requireAdmin,
  (req, res) => {

    const workerId =
      Number(req.params.id);

    const approved =
      Boolean(
        req.body.approved
      );

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

    db.prepare(`
      UPDATE workers
      SET
        approved = ?,
        available = CASE
          WHEN ? = 1
            THEN available
          ELSE 0
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      approved ? 1 : 0,
      approved ? 1 : 0,
      workerId
    );

    addNotification(
      worker.user_id,
      approved
        ? "worker_approved"
        : "worker_disabled",
      approved
        ? "Your KaamSetu worker profile has been approved."
        : "Your KaamSetu worker profile has been disabled."
    );

    res.json({
      success: true,
      approved
    });
  }
);


// ============================================================
// ADMIN - BOOKINGS
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
            AS worker_name

        FROM bookings b

        JOIN users customer
          ON customer.id =
             b.customer_id

        JOIN workers worker
          ON worker.id =
             b.worker_id

        ORDER BY
          b.id DESC
      `).all();

    res.json(
      bookings.map(
        booking => ({
          ...booking,
          estimated_price:
            booking.customer_total
        })
      )
    );
  }
);


// ============================================================
// ADMIN - WORKER LEDGER
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
// ADMIN - MARK PLATFORM FEE SETTLED
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
          "This fee is already settled."
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
// ADMIN - REVENUE SUMMARY
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
// ONLINE PAYMENT PLACEHOLDER
// ============================================================
// This endpoint intentionally does NOT pretend to process real
// money. A real payment gateway webhook must verify payment
// server-to-server before marking payment as paid.
//
// Gateway can later call:
// POST /api/payments/webhook
// ============================================================

app.post(
  "/api/payments/create",
  requireUser,
  requireRole("customer"),
  (req, res) => {

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
        req.user.id
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
      booking.payment_status ===
      "paid"
    ) {
      return res.json({
        success: true,
        alreadyPaid: true
      });
    }

    // --------------------------------------------------------
    // Replace this section with actual Razorpay/other gateway.
    // Server must create the gateway order using
    // booking.customer_total.
    // --------------------------------------------------------

    res.json({
      success: true,
      paymentRequired: true,
      bookingId,
      amount:
        booking.customer_total,
      currency: "INR",
      message:
        "Connect your payment gateway here for real online payment."
    });
  }
);


// ============================================================
// PAYMENT WEBHOOK PLACEHOLDER
// ============================================================

app.post(
  "/api/payments/webhook",
  (req, res) => {

    // IMPORTANT:
    // Do not trust frontend payment confirmation.
    //
    // Real gateway webhook signature must be verified here.
    //
    // After verification:
    //
    // booking.payment_status = "paid"
    //
    // Never simply accept:
    // { paid: true }
    // from a browser.

    res.status(501).json({
      error:
        "Payment gateway webhook is not configured yet."
    });
  }
);


// ============================================================
// 404 API
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
    path.join(__dirname, "public")
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
  (err, req, res, next) => {

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
      `Maximum GPS range: ${MAX_BOOKING_RADIUS_KM} km`
    );

    if (!ADMIN_KEY) {
      console.warn(
        "WARNING: ADMIN_KEY is not configured."
      );
    }
  }
);
