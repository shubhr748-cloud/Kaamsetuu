// ============================================================
// KAAMSETU - FINAL FRONTEND APP.JS
// Matches current server.js API
// ============================================================

"use strict";

const API_BASE = "/api";

const state = {
  user: null,
  token: null,

  selectedService: "",
  customerLocation: null,

  nearbyWorkers: [],
  selectedWorker: null,

  currentBookings: [],
  notifications: [],

  otpPhone: "",
  pendingBooking: null
};


// ============================================================
// CONSTANTS
// ============================================================

const SERVICES = [
  "Plumber",
  "Electrician",
  "Carpenter",
  "Painter",
  "Cleaner",
  "AC Technician",
  "Mechanic",
  "General Labour"
];

const BOOKING_STATUSES = {
  requested: "Requested",
  accepted: "Accepted",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled"
};


// ============================================================
// DOM HELPERS
// ============================================================

function getApp() {
  return document.getElementById("app");
}


function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function money(value) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(amount);
}


function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}


function statusLabel(status) {
  return (
    BOOKING_STATUSES[status] ||
    String(status || "Unknown")
  );
}


function showMessage(message, type = "info") {
  const old = document.getElementById("ks-message");

  if (old) {
    old.remove();
  }

  const box = document.createElement("div");

  box.id = "ks-message";
  box.textContent = String(message || "");
  box.className = `ks-message ks-${type}`;

  document.body.appendChild(box);

  setTimeout(() => {
    if (box.isConnected) {
      box.remove();
    }
  }, 4500);
}


// ============================================================
// API REQUEST
// ============================================================

async function apiRequest(endpoint, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  // Current server.js supports signed Bearer sessions.
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(
    `${API_BASE}${endpoint}`,
    {
      ...options,
      headers
    }
  );

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    if (response.status === 401) {
      handleExpiredSession();
    }

    throw new Error(
      data.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}


// ============================================================
// SESSION
// ============================================================

function saveSession() {
  if (!state.user || !state.token) {
    localStorage.removeItem("kaamsetu_session");
    return;
  }

  localStorage.setItem(
    "kaamsetu_session",
    JSON.stringify({
      user: state.user,
      token: state.token
    })
  );
}


function loadSession() {
  try {
    const raw =
      localStorage.getItem(
        "kaamsetu_session"
      );

    if (!raw) {
      return;
    }

    const session = JSON.parse(raw);

    if (
      session &&
      session.user &&
      Number.isInteger(
        Number(session.user.id)
      ) &&
      session.token
    ) {
      state.user = session.user;
      state.token = String(session.token);
      return;
    }

    localStorage.removeItem(
      "kaamsetu_session"
    );

  } catch {
    localStorage.removeItem(
      "kaamsetu_session"
    );
  }
}


function clearSession() {
  state.user = null;
  state.token = null;

  state.selectedWorker = null;
  state.nearbyWorkers = [];
  state.currentBookings = [];
  state.notifications = [];

  localStorage.removeItem(
    "kaamsetu_session"
  );
}


function handleExpiredSession() {
  clearSession();
  updateSessionUI();
  renderApp();

  showMessage(
    "Your session has expired. Please login again.",
    "error"
  );
}


function logout() {
  clearSession();

  updateSessionUI();
  renderApp();

  showMessage(
    "You have been logged out.",
    "success"
  );
}


// ============================================================
// SESSION UI
// ============================================================

function updateSessionUI() {
  const session =
    document.getElementById("session");

  if (!session) {
    return;
  }

  if (!state.user) {
    session.innerHTML = `
      <button
        type="button"
        class="secondary-btn"
        onclick="showAuth()"
      >
        Login
      </button>
    `;

    return;
  }

  const phone =
    escapeHTML(
      state.user.phone || ""
    );

  const role =
    escapeHTML(
      state.user.role || "Account"
    );

  session.innerHTML = `
    <div class="session-user">

      <span>
        ${phone}
      </span>

      <small>
        ${role}
      </small>

      <button
        type="button"
        class="secondary-btn"
        onclick="logout()"
      >
        Logout
      </button>

    </div>
  `;
}


// ============================================================
// AUTH
// ============================================================

function showAuth() {
  if (state.user) {
    renderApp();

    document
      .getElementById("app")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    return;
  }

  const app = getApp();

  if (!app) {
    return;
  }

  app.innerHTML = `
    <section class="auth-card">

      <div class="section-heading">

        <span class="eyebrow">
          KAAMSETU ACCOUNT
        </span>

        <h2>
          Login with mobile number
        </h2>

        <p>
          Enter your 10 digit Indian mobile number
          to continue.
        </p>

      </div>

      <form
        id="phone-form"
        onsubmit="requestOTP(event)"
      >

        <label for="phone-input">
          Mobile Number
        </label>

        <input
          id="phone-input"
          type="tel"
          inputmode="numeric"
          maxlength="10"
          minlength="10"
          pattern="[0-9]{10}"
          placeholder="10 digit mobile number"
          autocomplete="tel"
          required
        >

        <button
          id="send-otp-btn"
          type="submit"
          class="primary-btn"
        >
          Send OTP
        </button>

      </form>

      <div id="otp-area"></div>

    </section>
  `;

  app.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


// ============================================================
// SEND OTP
// ============================================================

async function requestOTP(event) {
  event.preventDefault();

  const input =
    document.getElementById(
      "phone-input"
    );

  const button =
    document.getElementById(
      "send-otp-btn"
    );

  const phone =
    String(input?.value || "")
      .replace(/\D/g, "");

  if (!/^[0-9]{10}$/.test(phone)) {
    showMessage(
      "Please enter a valid 10 digit mobile number.",
      "error"
    );

    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Sending OTP...";
  }

  try {
    const data =
      await apiRequest(
        "/auth/send-otp",
        {
          method: "POST",
          body: JSON.stringify({
            phone
          })
        }
      );

    state.otpPhone = phone;

    const otpArea =
      document.getElementById(
        "otp-area"
      );

    if (!otpArea) {
      return;
    }

    otpArea.innerHTML = `
      <div class="otp-box">

        <label for="otp-input">
          Enter OTP
        </label>

        <input
          id="otp-input"
          type="text"
          inputmode="numeric"
          maxlength="6"
          minlength="6"
          pattern="[0-9]{6}"
          placeholder="6 digit OTP"
          autocomplete="one-time-code"
        >

        <button
          id="verify-otp-btn"
          type="button"
          class="primary-btn"
          onclick="verifyOTP()"
        >
          Verify OTP
        </button>

        ${
          data.demoOtp
            ? `
              <p class="demo-otp">
                Development OTP:
                <strong>
                  ${escapeHTML(data.demoOtp)}
                </strong>
              </p>
            `
            : ""
        }

        <button
          type="button"
          class="secondary-btn"
          onclick="showAuth()"
        >
          Change Number
        </button>

      </div>
    `;

    showMessage(
      "OTP sent successfully.",
      "success"
    );

    document
      .getElementById("otp-input")
      ?.focus();

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent = "Send OTP";
    }

  }
}


// ============================================================
// VERIFY OTP
// ============================================================

async function verifyOTP() {
  const input =
    document.getElementById(
      "otp-input"
    );

  const button =
    document.getElementById(
      "verify-otp-btn"
    );

  const otp =
    String(input?.value || "")
      .replace(/\D/g, "");

  if (!/^[0-9]{6}$/.test(otp)) {
    showMessage(
      "Please enter the 6 digit OTP.",
      "error"
    );

    return;
  }

  if (!state.otpPhone) {
    showMessage(
      "Please request a new OTP.",
      "error"
    );

    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Verifying...";
  }

  try {
    const data =
      await apiRequest(
        "/auth/verify-otp",
        {
          method: "POST",
          body: JSON.stringify({
            phone: state.otpPhone,
            otp
          })
        }
      );

    if (
      !data.user ||
      !data.token
    ) {
      throw new Error(
        "Login response was incomplete."
      );
    }

    state.user = data.user;
    state.token = data.token;

    state.otpPhone = "";

    saveSession();
    updateSessionUI();

    showMessage(
      "Login successful.",
      "success"
    );

    renderApp();

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent = "Verify OTP";
    }

  }
}


// ============================================================
// ROLE
// ============================================================

async function selectRole(role) {
  const normalizedRole =
    String(role || "")
      .trim()
      .toLowerCase();

  if (
    !["customer", "worker"]
      .includes(normalizedRole)
  ) {
    showMessage(
      "Invalid account type.",
      "error"
    );

    return;
  }

  try {

    const data =
      await apiRequest(
        "/auth/select-role",
        {
          method: "POST",
          body: JSON.stringify({
            role: normalizedRole
          })
        }
      );

    state.user.role =
      data.role;

    if (data.token) {
      state.token =
        data.token;
    }

    saveSession();
    updateSessionUI();
    renderApp();

    showMessage(
      normalizedRole === "customer"
        ? "Customer account selected."
        : "Worker account selected.",
      "success"
    );

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


// ============================================================
// MAIN RENDER
// ============================================================

function renderApp() {
  const app = getApp();

  if (!app) {
    return;
  }

  if (!state.user) {
    app.innerHTML = "";
    return;
  }

  if (!state.user.role) {
    renderRoleSelection();
    return;
  }

  if (state.user.role === "customer") {
    renderCustomerDashboard();
    return;
  }

  if (state.user.role === "worker") {
    renderWorkerDashboard();
    return;
  }

  app.innerHTML = "";
}


// ============================================================
// ROLE SELECTION
// ============================================================

function renderRoleSelection() {
  const app = getApp();

  if (!app) {
    return;
  }

  app.innerHTML = `
    <section class="auth-card">

      <div class="section-heading">

        <span class="eyebrow">
          WELCOME TO KAAMSETU
        </span>

        <h2>
          How will you use KaamSetu?
        </h2>

        <p>
          Select your account type.
        </p>

      </div>

      <div class="role-grid">

        <button
          type="button"
          class="service-card"
          onclick="selectRole('customer')"
        >

          <span>🏠</span>

          <b>
            I'm a Customer
          </b>

          <small>
            I need a service professional.
          </small>

        </button>

        <button
          type="button"
          class="service-card"
          onclick="selectRole('worker')"
        >

          <span>🛠️</span>

          <b>
            I'm a Worker
          </b>

          <small>
            I provide professional services.
          </small>

        </button>

      </div>

    </section>
  `;
}


// ============================================================
// SERVICE OPTIONS
// ============================================================

function serviceOptions(selected = "") {
  return `
    <option value="">
      Choose a service
    </option>

    ${SERVICES.map(service => `
      <option
        value="${escapeHTML(service)}"
        ${service === selected ? "selected" : ""}
      >
        ${escapeHTML(service)}
      </option>
    `).join("")}
  `;
}


// ============================================================
// CUSTOMER DASHBOARD
// ============================================================

function renderCustomerDashboard() {
  const app = getApp();

  if (!app) {
    return;
  }

  app.innerHTML = `
    <section class="dashboard-card">

      <div class="section-heading">

        <span class="eyebrow">
          CUSTOMER
        </span>

        <h2>
          Book a local professional
        </h2>

        <p>
          Find approved and verified workers
          near your location.
        </p>

      </div>

      <div class="dashboard-actions">

        <button
          type="button"
          class="primary-btn"
          onclick="locate()"
        >
          📍 Find Nearby Workers
        </button>

        <button
          type="button"
          class="secondary-btn"
          onclick="loadMyBookings()"
        >
          My Bookings
        </button>

        <button
          type="button"
          class="secondary-btn"
          onclick="loadNotifications()"
        >
          Notifications
        </button>

      </div>

      <div id="customer-content"></div>

    </section>
  `;

  renderCustomerHome();
}


// ============================================================
// CUSTOMER HOME
// ============================================================

function renderCustomerHome() {
  const content =
    document.getElementById(
      "customer-content"
    );

  if (!content) {
    return;
  }

  content.innerHTML = `
    <div class="booking-search">

      <label for="customer-category">
        Select service
      </label>

      <select
        id="customer-category"
      >
        ${serviceOptions(
          state.selectedService
        )}
      </select>

      <button
        type="button"
        class="primary-btn"
        onclick="findWorkersFromForm()"
      >
        Find Workers
      </button>

    </div>

    <div id="worker-results"></div>
  `;
}


// ============================================================
// HERO SERVICE
// ============================================================

function selectService(category) {
  const service =
    String(category || "").trim();

  if (!SERVICES.includes(service)) {
    showMessage(
      "This service is not available.",
      "error"
    );

    return;
  }

  state.selectedService = service;

  if (!state.user) {
    showAuth();
    return;
  }

  if (state.user.role !== "customer") {
    showMessage(
      "Only customer accounts can book workers.",
      "error"
    );

    return;
  }

  renderCustomerDashboard();

  const select =
    document.getElementById(
      "customer-category"
    );

  if (select) {
    select.value = service;
  }

  locate();
}


// ============================================================
// FIND WORKERS
// ============================================================

async function findWorkersFromForm() {
  const select =
    document.getElementById(
      "customer-category"
    );

  const category =
    String(select?.value || "").trim();

  if (!category) {
    showMessage(
      "Please select a service.",
      "error"
    );

    return;
  }

  state.selectedService = category;

  await locate();
}


// ============================================================
// CUSTOMER GPS
// ============================================================

function locate() {
  if (!state.user) {
    showAuth();
    return;
  }

  if (state.user.role !== "customer") {
    showMessage(
      "Nearby worker search is available for customers.",
      "error"
    );

    return;
  }

  if (!navigator.geolocation) {
    showMessage(
      "GPS is not supported by this browser.",
      "error"
    );

    return;
  }

  const category =
    state.selectedService ||
    document.getElementById(
      "customer-category"
    )?.value ||
    "";

  if (!category) {
    showMessage(
      "First select the service you need.",
      "error"
    );

    renderCustomerDashboard();
    return;
  }

  showMessage(
    "Getting your location...",
    "info"
  );

  navigator.geolocation.getCurrentPosition(
    async position => {

      state.customerLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      await findNearbyWorkers(
        category
      );

    },

    error => {

      if (
        error.code ===
        error.PERMISSION_DENIED
      ) {
        showMessage(
          "Location permission was denied. Please allow GPS access.",
          "error"
        );
        return;
      }

      if (
        error.code ===
        error.POSITION_UNAVAILABLE
      ) {
        showMessage(
          "Your location is currently unavailable.",
          "error"
        );
        return;
      }

      if (
        error.code ===
        error.TIMEOUT
      ) {
        showMessage(
          "Location request timed out. Please try again.",
          "error"
        );
        return;
      }

      showMessage(
        "Unable to get your location.",
        "error"
      );

    },

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000
    }
  );
}


// ============================================================
// NEARBY WORKERS
// ============================================================

async function findNearbyWorkers(category) {
  if (!state.customerLocation) {
    showMessage(
      "Customer location is unavailable.",
      "error"
    );

    return;
  }

  const params =
    new URLSearchParams({
      lat: String(
        state.customerLocation.lat
      ),

      lng: String(
        state.customerLocation.lng
      ),

      category
    });

  try {

    const data =
      await apiRequest(
        `/workers/nearby?${params.toString()}`
      );

    state.nearbyWorkers =
      Array.isArray(data.workers)
        ? data.workers
        : [];

    renderWorkerResults(
      data.rangeUsedKm
    );

    if (
      !state.nearbyWorkers.length
    ) {
      showMessage(
        "No approved and available worker was found nearby.",
        "info"
      );
    }

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


// ============================================================
// WORKER RESULTS
// ============================================================

function renderWorkerResults(rangeUsedKm = null) {
  const results =
    document.getElementById(
      "worker-results"
    );

  if (!results) {
    return;
  }

  if (!state.nearbyWorkers.length) {
    results.innerHTML = `
      <div class="empty-state">

        <h3>
          No workers found
        </h3>

        <p>
          Try another service or search again later.
        </p>

      </div>
    `;

    return;
  }

  results.innerHTML = `
    <div class="section-heading">

      <span class="eyebrow">
        AVAILABLE WORKERS
      </span>

      <h3>
        Professionals near you
      </h3>

      ${
        rangeUsedKm
          ? `
            <p>
              Workers found within
              ${escapeHTML(rangeUsedKm)} km.
            </p>
          `
          : ""
      }

    </div>

    <div class="worker-grid">

      ${state.nearbyWorkers
        .map(worker => {

          const rating =
            Number(worker.rating || 0)
              .toFixed(1);

          const distance =
            worker.distanceKm !== null &&
            worker.distanceKm !== undefined
              ? `${escapeHTML(worker.distanceKm)} km`
              : "Nearby";

          return `
            <article class="worker-card">

              <div class="worker-avatar">
                🛠️
              </div>

              <h3>
                ${escapeHTML(worker.name)}
              </h3>

              <p>
                ${escapeHTML(worker.category)}
              </p>

              <div class="worker-info">

                <span>
                  ⭐ ${escapeHTML(rating)}
                </span>

                <span>
                  📍 ${distance}
                </span>

                <span>
                  ${money(worker.rate)}
                </span>

              </div>

              ${
                worker.skills
                  ? `
                    <p>
                      ${escapeHTML(worker.skills)}
                    </p>
                  `
                  : ""
              }

              ${
                worker.experience !== undefined
                  ? `
                    <small>
                      ${escapeHTML(worker.experience)}
                      years experience
                    </small>
                  `
                  : ""
              }

              ${
                worker.verified
                  ? `
                    <div class="booking-warning">
                      ✓ KaamSetu Verified
                    </div>
                  `
                  : ""
              }

              <button
                type="button"
                class="primary-btn"
                onclick="openBooking(${Number(worker.id)})"
              >
                Appoint Worker
              </button>

            </article>
          `;
        })
        .join("")}

    </div>
  `;
}


// ============================================================
// OPEN BOOKING
// ============================================================

function openBooking(workerId) {
  const worker =
    state.nearbyWorkers.find(
      item =>
        Number(item.id) ===
        Number(workerId)
    );

  if (!worker) {
    showMessage(
      "Worker information not found.",
      "error"
    );

    return;
  }

  state.selectedWorker = worker;

  const content =
    document.getElementById(
      "customer-content"
    );

  if (!content) {
    return;
  }

  content.innerHTML = `
    <div class="booking-card">

      <div class="section-heading">

        <span class="eyebrow">
          APPOINT WORKER
        </span>

        <h3>
          ${escapeHTML(worker.name)}
        </h3>

        <p>
          ${escapeHTML(worker.category)}
        </p>

      </div>

      <div class="price-summary">

        <p>
          Worker price:
          <strong>
            ${money(worker.rate)}
          </strong>
        </p>

        <p>
          Platform fee:
          <strong>
            Calculated by KaamSetu
          </strong>
        </p>

        <p>
          Loyalty discount:
          <strong>
            Calculated by KaamSetu
          </strong>
        </p>

        <p>
          Customer total:
          <strong>
            Calculated after booking
          </strong>
        </p>

      </div>

      <form
        onsubmit="createBooking(event)"
      >

        <label for="booking-description">
          Work description
        </label>

        <textarea
          id="booking-description"
          maxlength="1500"
          required
          placeholder="Describe what needs to be done..."
        ></textarea>

        <label for="booking-address">
          Work address
        </label>

        <textarea
          id="booking-address"
          maxlength="1000"
          required
          placeholder="Enter the complete work address..."
        ></textarea>

        <label for="booking-duration">
          Work type / duration
        </label>

        <select
          id="booking-duration"
          required
        >

          <option value="">
            Select work type
          </option>

          <option value="Small Job">
            Small Job
          </option>

          <option value="Few Hours">
            Few Hours
          </option>

          <option value="Half Day">
            Half Day
          </option>

          <option value="Full Day">
            Full Day
          </option>

        </select>

        <label for="booking-payment">
          Payment method
        </label>

        <select
          id="booking-payment"
          required
        >

          <option value="cash">
            Cash
          </option>

          <option value="online">
            Online
          </option>

        </select>

        <div class="booking-warning">
          Worker contact details remain protected
          until the booking is accepted.
        </div>

        <button
          id="confirm-booking-btn"
          type="submit"
          class="primary-btn"
        >
          Confirm Appointment
        </button>

        <button
          type="button"
          class="secondary-btn"
          onclick="renderCustomerDashboard()"
        >
          Cancel
        </button>

      </form>

    </div>
  `;
}


// ============================================================
// CREATE BOOKING
// ============================================================

async function createBooking(event) {
  event.preventDefault();

  if (!state.selectedWorker) {
    showMessage(
      "Please select a worker first.",
      "error"
    );

    return;
  }

  const description =
    document.getElementById(
      "booking-description"
    )?.value.trim();

  const address =
    document.getElementById(
      "booking-address"
    )?.value.trim();

  const duration =
    document.getElementById(
      "booking-duration"
    )?.value.trim();

  const paymentMethod =
    document.getElementById(
      "booking-payment"
    )?.value;

  if (
    !description ||
    !address ||
    !duration ||
    !paymentMethod
  ) {
    showMessage(
      "Please complete all booking details.",
      "error"
    );

    return;
  }

  const button =
    document.getElementById(
      "confirm-booking-btn"
    );

  if (button) {
    button.disabled = true;
    button.textContent = "Creating Booking...";
  }

  try {

    const data =
      await apiRequest(
        "/bookings",
        {
          method: "POST",

          body: JSON.stringify({

            workerId:
              Number(
                state.selectedWorker.id
              ),

            category:
              state.selectedWorker.category,

            description,

            address,

            duration,

            paymentMethod,

            lat:
              state.customerLocation?.lat ??
              null,

            lng:
              state.customerLocation?.lng ??
              null

          })
        }
      );

    state.pendingBooking = data;

    renderBookingConfirmation(
      data
    );

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent = "Confirm Appointment";
    }

  }
}


// ============================================================
// BOOKING CONFIRMATION
// ============================================================

function renderBookingConfirmation(data) {
  const content =
    document.getElementById(
      "customer-content"
    );

  if (!content) {
    return;
  }

  const pricing =
    data.pricing || {};

  const firstBooking =
    data.offers?.firstBookingFeeWaived;

  const loyaltyApplied =
    data.offers?.loyaltyApplied;

  content.innerHTML = `
    <div class="booking-card">

      <div class="section-heading">

        <span class="eyebrow">
          BOOKING CREATED
        </span>

        <h3>
          Appointment request created
        </h3>

        <p>
          Booking #${escapeHTML(data.bookingId)}
        </p>

      </div>

      <div class="price-summary">

        <p>
          Worker price:
          <strong>
            ${money(pricing.workerPrice)}
          </strong>
        </p>

        <p>
          Platform fee:
          <strong>
            ${money(pricing.platformFee)}
          </strong>
        </p>

        <p>
          Loyalty discount:
          <strong>
            ${money(pricing.loyaltyDiscount)}
          </strong>
        </p>

        <p>
          Customer total:
          <strong>
            ${money(pricing.customerTotal)}
          </strong>
        </p>

      </div>

      ${
        firstBooking
          ? `
            <div class="booking-warning">
              🎉 First-booking platform fee waived.
            </div>
          `
          : ""
      }

      ${
        loyaltyApplied
          ? `
            <div class="booking-warning">
              🎁 Loyalty discount applied.
            </div>
          `
          : ""
      }

      <div class="booking-code-box">

        <h3>
          Completion Code
        </h3>

        <p>
          Keep this 6 digit code safe.
          You will need it when the job is completed.
        </p>

        <strong class="completion-code">
          ${escapeHTML(data.completionCode)}
        </strong>

      </div>

      <div class="booking-warning">

        ${
          data.paymentMethod === "online"
            ? `
              Online payment is required before
              the worker can accept this booking.
            `
            : `
              Cash payment selected.
              The worker can accept the request
              according to the booking rules.
            `
        }

      </div>

      ${
        data.paymentMethod === "online"
          ? `
            <button
              type="button"
              class="primary-btn"
              onclick="startOnlinePayment(${Number(data.bookingId)})"
            >
              Continue to Online Payment
            </button>
          `
          : ""
      }

      <button
        type="button"
        class="secondary-btn"
        onclick="loadMyBookings()"
      >
        View My Bookings
      </button>

    </div>
  `;
}


// ============================================================
// RAZORPAY SCRIPT
// ============================================================

function loadRazorpayScript() {
  return new Promise((resolve, reject) => {

    if (
      typeof window.Razorpay ===
      "function"
    ) {
      resolve(true);
      return;
    }

    const existing =
      document.querySelector(
        'script[data-kaamsetu-razorpay="true"]'
      );

    if (existing) {
      existing.addEventListener(
        "load",
        () => resolve(true),
        { once: true }
      );

      existing.addEventListener(
        "error",
        () =>
          reject(
            new Error(
              "Unable to load payment gateway."
            )
          ),
        { once: true }
      );

      return;
    }

    const script =
      document.createElement("script");

    script.src =
      "https://checkout.razorpay.com/v1/checkout.js";

    script.async = true;

    script.dataset.kaamsetuRazorpay =
      "true";

    script.onload = () => {
      if (
        typeof window.Razorpay ===
        "function"
      ) {
        resolve(true);
      } else {
        reject(
          new Error(
            "Payment gateway failed to load."
          )
        );
      }
    };

    script.onerror = () => {
      reject(
        new Error(
          "Unable to load Razorpay checkout."
        )
      );
    };

    document.head.appendChild(script);
  });
}


// ============================================================
// ONLINE PAYMENT
// ============================================================

async function startOnlinePayment(bookingId) {
  const id = Number(bookingId);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    showMessage(
      "Invalid booking.",
      "error"
    );

    return;
  }

  try {

    const data =
      await apiRequest(
        "/payments/create",
        {
          method: "POST",
          body: JSON.stringify({
            bookingId: id
          })
        }
      );

    if (data.alreadyPaid) {
      showMessage(
        "This booking is already paid.",
        "success"
      );

      await loadMyBookings();
      return;
    }

    if (
      data.gateway !== "razorpay" ||
      !data.keyId ||
      !data.orderId
    ) {
      throw new Error(
        "Online payment gateway response is incomplete."
      );
    }

    await loadRazorpayScript();

    const options = {

      key: data.keyId,

      amount: Number(data.amount),

      currency:
        data.currency || "INR",

      name: "KaamSetu",

      description:
        `KaamSetu Booking #${id}`,

      order_id:
        data.orderId,

      handler: async function (response) {

        try {

          showMessage(
            "Verifying payment...",
            "info"
          );

          await apiRequest(
            "/payments/verify",
            {
              method: "POST",

              body: JSON.stringify({

                bookingId: id,

                razorpay_order_id:
                  response.razorpay_order_id,

                razorpay_payment_id:
                  response.razorpay_payment_id,

                razorpay_signature:
                  response.razorpay_signature

              })
            }
          );

          showMessage(
            "Payment successful and verified.",
            "success"
          );

          await loadMyBookings();

        } catch (error) {

          showMessage(
            error.message,
            "error"
          );

        }

      },

      modal: {
        ondismiss: function () {
          showMessage(
            "Payment window closed.",
            "info"
          );
        }
      },

      theme: {
        color: "#f97316"
      }

    };

    const razorpay =
      new window.Razorpay(
        options
      );

    razorpay.on(
      "payment.failed",
      function () {
        showMessage(
          "Payment failed. Please try again.",
          "error"
        );
      }
    );

    razorpay.open();

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


// ============================================================
// CUSTOMER BOOKINGS
// ============================================================

async function loadMyBookings() {
  if (!state.user) {
    showAuth();
    return;
  }

  try {

    const data =
      await apiRequest(
        "/bookings/my"
      );

    state.currentBookings =
      Array.isArray(data.bookings)
        ? data.bookings
        : [];

    if (
      state.user.role ===
      "worker"
    ) {
      renderWorkerBookings();
    } else {
      renderMyBookings();
    }

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


// ============================================================
// CUSTOMER BOOKINGS UI
// ============================================================

function renderMyBookings() {
  const content =
    document.getElementById(
      "customer-content"
    );

  if (!content) {
    return;
  }

  if (!state.currentBookings.length) {
    content.innerHTML = `
      <div class="empty-state">

        <h3>
          No bookings yet
        </h3>

        <p>
          Your appointments will appear here.
        </p>

        <button
          type="button"
          class="primary-btn"
          onclick="renderCustomerHome()"
        >
          Find a Worker
        </button>

      </div>
    `;

    return;
  }

  content.innerHTML = `
    <div class="section-heading">

      <span class="eyebrow">
        MY BOOKINGS
      </span>

      <h3>
        Your appointments
      </h3>

    </div>

    <div class="booking-list">

      ${state.currentBookings
        .map(booking => {

          const canContact =
            Boolean(
              booking.worker_phone_revealed
            ) ||
            [
              "accepted",
              "in_progress",
              "completed"
            ].includes(
              booking.status
            );

          return `
            <article class="booking-card">

              <h3>
                ${escapeHTML(
                  booking.worker_name
                )}
              </h3>

              <p>
                Booking #
                ${escapeHTML(booking.id)}
              </p>

              <p>
                Status:
                <strong>
                  ${escapeHTML(
                    statusLabel(
                      booking.status
                    )
                  )}
                </strong>
              </p>

              <p>
                Service:
                ${escapeHTML(
                  booking.category
                )}
              </p>

              <p>
                Work:
                ${escapeHTML(
                  booking.description
                )}
              </p>

              <p>
                Address:
                ${escapeHTML(
                  booking.address
                )}
              </p>

              <p>
                Duration:
                ${escapeHTML(
                  booking.duration
                )}
              </p>

              <p>
                Worker price:
                ${money(
                  booking.worker_price
                )}
              </p>

              <p>
                Platform fee:
                ${money(
                  booking.platform_fee
                )}
              </p>

              <p>
                Discount:
                ${money(
                  booking.discount
                )}
              </p>

              <p>
                Total:
                <strong>
                  ${money(
                    booking.customer_total
                  )}
                </strong>
              </p>

              <p>
                Payment:
                ${escapeHTML(
                  booking.payment_method
                )}
                /
                ${escapeHTML(
                  booking.payment_status
                )}
              </p>

              ${
                booking.payment_method ===
                  "online" &&
                booking.payment_status !==
                  "paid" &&
                booking.status !==
                  "cancelled"
                  ? `
                    <button
                      type="button"
                      class="primary-btn"
                      onclick="startOnlinePayment(${Number(booking.id)})"
                    >
                      Pay Online
                    </button>
                  `
                  : ""
              }

              ${
                canContact
                  ? `
                    <button
                      type="button"
                      class="primary-btn"
                      onclick="getWorkerContact(${Number(booking.id)})"
                    >
                      📞 Show Worker Number
                    </button>
                  `
                  : `
                    <p>
                      📞 Worker number will be available
                      after the worker accepts the booking.
                    </p>
                  `
              }

              ${
                ![
                  "completed",
                  "cancelled"
                ].includes(
                  booking.status
                )
                  ? `
                    <button
                      type="button"
                      class="secondary-btn"
                      onclick="cancelBooking(${Number(booking.id)})"
                    >
                      Cancel Booking
                    </button>
                  `
                  : ""
              }

              ${
                booking.created_at
                  ? `
                    <small>
                      Created:
                      ${escapeHTML(
                        formatDate(
                          booking.created_at
                        )
                      )}
                    </small>
                  `
                  : ""
              }

            </article>
          `;
        })
        .join("")}

    </div>
  `;
}


// ============================================================
// WORKER CONTACT
// ============================================================

async function getWorkerContact(bookingId) {
  try {

    const data =
      await apiRequest(
        `/bookings/${Number(bookingId)}/contact`
      );

    const phone =
      String(
        data.workerPhone || ""
      );

    if (!/^[0-9]{10}$/.test(phone)) {
      throw new Error(
        "Worker phone number is unavailable."
      );
    }

    showPhoneDialog(
      phone,
      "Worker Contact"
    );

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


// ============================================================
// PHONE DIALOG
// ============================================================

function showPhoneDialog(
  phone,
  title = "Contact"
) {
  const old =
    document.getElementById(
      "ks-phone-dialog"
    );

  if (old) {
    old.remove();
  }

  const overlay =
    document.createElement("div");

  overlay.id =
    "ks-phone-dialog";

  overlay.className =
    "ks-modal-overlay";

  overlay.innerHTML = `
    <div
      class="ks-modal"
      role="dialog"
      aria-modal="true"
    >

      <h3>
        ${escapeHTML(title)}
      </h3>

      <p>
        Contact details are available
        for this accepted booking.
      </p>

      <a
        href="tel:${escapeHTML(phone)}"
        class="primary-btn"
      >
        📞 ${escapeHTML(phone)}
      </a>

      <button
        type="button"
        class="secondary-btn"
        onclick="closePhoneDialog()"
      >
        Close
      </button>

    </div>
  `;

  document.body.appendChild(
    overlay
  );
}


function closePhoneDialog() {
  document
    .getElementById(
      "ks-phone-dialog"
    )
    ?.remove();
}


// ============================================================
// NOTIFICATIONS
// ============================================================

async function loadNotifications() {
  try {

    const data =
      await apiRequest(
        "/notifications"
      );

    state.notifications =
      Array.isArray(data.notifications)
        ? data.notifications
        : [];

    renderNotifications();

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


function renderNotifications() {
  const content =
    document.getElementById(
      "customer-content"
    );

  if (!content) {
    return;
  }

  if (!state.notifications.length) {
    content.innerHTML = `
      <div class="empty-state">

        <h3>
          No notifications
        </h3>

        <button
          type="button"
          class="primary-btn"
          onclick="renderCustomerHome()"
        >
          Back
        </button>

      </div>
    `;

    return;
  }

  content.innerHTML = `
    <div class="section-heading">

      <span class="eyebrow">
        NOTIFICATIONS
      </span>

      <h3>
        Updates
      </h3>

    </div>

    <div class="notification-list">

      ${state.notifications
        .map(notification => `

          <article
            class="notification-card"
          >

            <strong>
              ${escapeHTML(
                notification.type
              )}
            </strong>

            <p>
              ${escapeHTML(
                notification.message
              )}
            </p>

            <small>
              ${escapeHTML(
                formatDate(
                  notification.created_at
                )
              )}
            </small>

            ${
              !Number(
                notification.read
              )
                ? `
                  <button
                    type="button"
                    class="secondary-btn"
                    onclick="markNotificationRead(${Number(notification.id)})"
                  >
                    Mark as read
                  </button>
                `
                : `
                  <small>
                    ✓ Read
                  </small>
                `
            }

          </article>

        `)
        .join("")}

    </div>
  `;
}


async function markNotificationRead(
  notificationId
) {
  try {

    await apiRequest(
      `/notifications/${Number(notificationId)}/read`,
      {
        method: "POST"
      }
    );

    await loadNotifications();

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


// ============================================================
// CUSTOMER CANCEL BOOKING
// ============================================================

async function cancelBooking(
  bookingId
) {
  const confirmed =
    window.confirm(
      "Are you sure you want to cancel this booking?"
    );

  if (!confirmed) {
    return;
  }

  const reason =
    window.prompt(
      "Cancellation reason (optional):",
      "Cancelled by customer"
    );

  try {

    await apiRequest(
      `/bookings/${Number(bookingId)}/cancel`,
      {
        method: "POST",

        body: JSON.stringify({
          reason:
            String(
              reason || ""
            ).trim() ||
            "Cancelled by customer"
        })
      }
    );

    showMessage(
      "Booking cancelled successfully.",
      "success"
    );

    await loadMyBookings();

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


// ============================================================
// WORKER DASHBOARD
// ============================================================

function renderWorkerDashboard() {
  const app = getApp();

  if (!app) {
    return;
  }

  app.innerHTML = `
    <section class="dashboard-card">

      <div class="section-heading">

        <span class="eyebrow">
          WORKER
        </span>

        <h2>
          Manage your KaamSetu work
        </h2>

        <p>
          Manage your profile, GPS,
          availability and customer requests.
        </p>

      </div>

      <div class="dashboard-actions">

        <button
          type="button"
          class="primary-btn"
          onclick="renderWorkerProfile()"
        >
          Worker Profile
        </button>

        <button
          type="button"
          class="secondary-btn"
          onclick="loadWorkerBookings()"
        >
          My Jobs
        </button>

        <button
          type="button"
          class="secondary-btn"
          onclick="updateWorkerLocation()"
        >
          📍 Update GPS
        </button>

        <button
          type="button"
          class="secondary-btn"
          onclick="loadWorkerWallet()"
        >
          Wallet
        </button>

        <button
          type="button"
          class="secondary-btn"
          onclick="loadWorkerNotifications()"
        >
          Notifications
        </button>

      </div>

      <div id="worker-content"></div>

    </section>
  `;

  renderWorkerHome();
}


// ============================================================
// WORKER HOME
// ============================================================

function renderWorkerHome() {
  const content =
    document.getElementById(
      "worker-content"
    );

  if (!content) {
    return;
  }

  content.innerHTML = `
    <div class="empty-state">

      <h3>
        Welcome to KaamSetu
      </h3>

      <p>
        Complete your worker profile,
        update your GPS and wait for admin approval.
      </p>

      <button
        type="button"
        class="primary-btn"
        onclick="renderWorkerProfile()"
      >
        Create / Update Profile
      </button>

      <button
        type="button"
        class="secondary-btn"
        onclick="updateWorkerLocation()"
      >
        📍 Update GPS Location
      </button>

    </div>
  `;
}


// ============================================================
// WORKER PROFILE
// ============================================================

function renderWorkerProfile() {
  const content =
    document.getElementById(
      "worker-content"
    );

  if (!content) {
    return;
  }

  content.innerHTML = `
    <div class="booking-card">

      <div class="section-heading">

        <span class="eyebrow">
          WORKER PROFILE
        </span>

        <h3>
          Register your service
        </h3>

        <p>
          Customers can see your profile only
          after the required admin approval.
        </p>

      </div>

      <form
        onsubmit="registerWorker(event)"
      >

        <label for="worker-name">
          Name
        </label>

        <input
          id="worker-name"
          type="text"
          maxlength="100"
          required
          placeholder="Your full name"
        >

        <label for="worker-category">
          Service category
        </label>

        <select
          id="worker-category"
          required
        >

          ${serviceOptions()}

        </select>

        <label for="worker-skills">
          Skills
        </label>

        <input
          id="worker-skills"
          type="text"
          maxlength="500"
          placeholder="e.g. Pipe repair, fitting, leakage"
        >

        <label for="worker-experience">
          Experience in years
        </label>

        <input
          id="worker-experience"
          type="number"
          min="0"
          max="60"
          step="1"
          required
          value="0"
        >

        <label for="worker-rate">
          Your service price
        </label>

        <input
          id="worker-rate"
          type="number"
          min="0"
          max="1000000"
          step="0.01"
          required
          placeholder="₹500"
        >

        <label for="worker-bio">
          About you
        </label>

        <textarea
          id="worker-bio"
          maxlength="1000"
          placeholder="Tell customers about your experience..."
        ></textarea>

        <button
          id="worker-submit-btn"
          type="submit"
          class="primary-btn"
        >
          Submit Worker Profile
        </button>

      </form>

      <div class="booking-warning">

        Worker profiles are visible to customers
        only after admin approval and verification.

      </div>

    </div>
  `;
}


// ============================================================
// REGISTER WORKER
// ============================================================

async function registerWorker(event) {
  event.preventDefault();

  const name =
    document.getElementById(
      "worker-name"
    )?.value.trim();

  const category =
    document.getElementById(
      "worker-category"
    )?.value.trim();

  const skills =
    document.getElementById(
      "worker-skills"
    )?.value.trim();

  const experience =
    Number(
      document.getElementById(
        "worker-experience"
      )?.value
    );

  const rate =
    Number(
      document.getElementById(
        "worker-rate"
      )?.value
    );

  const bio =
    document.getElementById(
      "worker-bio"
    )?.value.trim();

  if (
    !name ||
    !category ||
    !SERVICES.includes(category) ||
    !Number.isFinite(experience) ||
    !Number.isFinite(rate)
  ) {
    showMessage(
      "Please complete all required worker details.",
      "error"
    );

    return;
  }

  // IMPORTANT:
  // Worker registration must NOT use customerLocation.
  // Current server.js accepts worker GPS through
  // /workers/location separately.
  const button =
    document.getElementById(
      "worker-submit-btn"
    );

  if (button) {
    button.disabled = true;
    button.textContent = "Submitting...";
  }

  try {

    const data =
      await apiRequest(
        "/workers/register",
        {
          method: "POST",

          body: JSON.stringify({
            name,
            category,
            skills,
            experience,
            rate,
            bio,
            lat: null,
            lng: null
          })
        }
      );

    showMessage(
      data.message ||
      "Worker profile submitted.",
      "success"
    );

    renderWorkerHome();

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent =
        "Submit Worker Profile";
    }

  }
}


// ============================================================
// WORKER GPS
// ============================================================

function updateWorkerLocation() {
  if (!state.user) {
    showAuth();
    return;
  }

  if (state.user.role !== "worker") {
    showMessage(
      "Only worker accounts can update worker GPS.",
      "error"
    );

    return;
  }

  if (!navigator.geolocation) {
    showMessage(
      "GPS is not supported by this browser.",
      "error"
    );

    return;
  }

  showMessage(
    "Getting your current location...",
    "info"
  );

  navigator.geolocation.getCurrentPosition(
    async position => {

      const lat =
        position.coords.latitude;

      const lng =
        position.coords.longitude;

      try {

        await apiRequest(
          "/workers/location",
          {
            method: "POST",

            body: JSON.stringify({
              lat,
              lng
            })
          }
        );

        showMessage(
          "Worker GPS location updated successfully.",
          "success"
        );

      } catch (error) {

        showMessage(
          error.message,
          "error"
        );

      }

    },

    error => {

      if (
        error.code ===
        error.PERMISSION_DENIED
      ) {
        showMessage(
          "Please allow location permission.",
          "error"
        );

        return;
      }

      showMessage(
        "Unable to update your location.",
        "error"
      );

    },

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000
    }
  );
}


// ============================================================
// WORKER AVAILABILITY
// ============================================================

async function setWorkerAvailability(
  available
) {
  try {

    const data =
      await apiRequest(
        "/workers/availability",
        {
          method: "POST",

          body: JSON.stringify({
            available:
              Boolean(available)
          })
        }
      );

    showMessage(
      data.available
        ? "You are now available for jobs."
        : "You are now unavailable for new jobs.",
      "success"
    );

    renderWorkerHome();

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


// ============================================================
// WORKER BOOKINGS
// ============================================================

async function loadWorkerBookings() {
  if (!state.user) {
    showAuth();
    return;
  }

  try {

    const data =
      await apiRequest(
        "/bookings/my"
      );

    state.currentBookings =
      Array.isArray(data.bookings)
        ? data.bookings
        : [];

    renderWorkerBookings();

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


// ============================================================
// WORKER BOOKINGS UI
// ============================================================

function renderWorkerBookings() {
  const content =
    document.getElementById(
      "worker-content"
    );

  if (!content) {
    return;
  }

  if (!state.currentBookings.length) {
    content.innerHTML = `
      <div class="empty-state">

        <h3>
          No jobs yet
        </h3>

        <p>
          New customer requests will appear here.
        </p>

      </div>
    `;

    return;
  }

  content.innerHTML = `
    <div class="section-heading">

      <span class="eyebrow">
        MY JOBS
      </span>

      <h3>
        Customer bookings
      </h3>

    </div>

    <div class="booking-list">

      ${state.currentBookings
        .map(booking => `

          <article
            class="booking-card"
          >

            <h3>
              ${escapeHTML(
                booking.category
              )}
            </h3>

            <p>
              Booking #
              ${escapeHTML(booking.id)}
            </p>

            <p>
              Status:
              <strong>
                ${escapeHTML(
                  statusLabel(
                    booking.status
                  )
                )}
              </strong>
            </p>

            <p>
              Work:
              ${escapeHTML(
                booking.description
              )}
            </p>

            <p>
              Address:
              ${escapeHTML(
                booking.address
              )}
            </p>

            <p>
              Duration:
              ${escapeHTML(
                booking.duration
              )}
            </p>

            <p>
              Worker price:
              <strong>
                ${money(
                  booking.worker_price
                )}
              </strong>
            </p>

            <p>
              Platform fee:
              ${money(
                booking.platform_fee
              )}
            </p>

            <p>
              Customer total:
              ${money(
                booking.customer_total
              )}
            </p>

            <p>
              Payment:
              ${escapeHTML(
                booking.payment_method
              )}
              /
              ${escapeHTML(
                booking.payment_status
              )}
            </p>

            ${
              booking.customer_phone
                ? `
                  <p>
                    📞 Customer:

                    ${
                      booking.customer_phone ===
                      "Hidden until accepted"
                        ? `
                          <span>
                            Hidden until accepted
                          </span>
                        `
                        : `
                          <a
                            href="tel:${escapeHTML(
                              booking.customer_phone
                            )}"
                          >
                            ${escapeHTML(
                              booking.customer_phone
                            )}
                          </a>
                        `
                    }

                  </p>
                `
                : ""
            }

            ${workerBookingActions(booking)}

          </article>

        `)
        .join("")}

    </div>
  `;
}


// ============================================================
// WORKER BOOKING ACTIONS
// ============================================================

function workerBookingActions(booking) {

  if (
    booking.status ===
    "requested"
  ) {
    return `
      <button
        type="button"
        class="primary-btn"
        onclick="acceptBooking(${Number(booking.id)})"
      >
        Accept Booking
      </button>

      <button
        type="button"
        class="secondary-btn"
        onclick="cancelBooking(${Number(booking.id)})"
      >
        Decline / Cancel
      </button>
    `;
  }


  if (
    booking.status ===
    "accepted"
  ) {
    return `
      <button
        type="button"
        class="primary-btn"
        onclick="startBooking(${Number(booking.id)})"
      >
        Start Job
      </button>

      <button
        type="button"
        class="secondary-btn"
        onclick="cancelBooking(${Number(booking.id)})"
      >
        Cancel Booking
      </button>
    `;
  }


  if (
    booking.status ===
    "in_progress"
  ) {
    return `
      <div class="completion-box">

        <label
          for="completion-${Number(booking.id)}"
        >
          Enter customer's completion code
        </label>

        <input
          id="completion-${Number(booking.id)}"
          type="text"
          inputmode="numeric"
          maxlength="6"
          minlength="6"
          pattern="[0-9]{6}"
          placeholder="6 digit code"
        >

        <button
          type="button"
          class="primary-btn"
          onclick="completeBooking(${Number(booking.id)})"
        >
          Complete Job
        </button>

      </div>
    `;
  }


  if (
    booking.status ===
    "completed"
  ) {
    return `
      <div class="booking-warning">
        ✓ Job completed and verified.
      </div>
    `;
  }


  if (
    booking.status ===
    "cancelled"
  ) {
    return `
      <div class="booking-warning">
        Booking cancelled.
      </div>
    `;
  }


  return "";
}


// ============================================================
// ACCEPT BOOKING
// ============================================================

async function acceptBooking(
  bookingId
) {
  try {

    /*
     * IMPORTANT:
     * The current server returns workerPhone here.
     * That is the WORKER'S OWN number.
     *
     * Therefore we deliberately DO NOT show it in a popup.
     *
     * After acceptance, /bookings/my returns the customer's
     * phone number because the booking is no longer "requested".
     */

    await apiRequest(
      `/bookings/${Number(bookingId)}/accept`,
      {
        method: "POST"
      }
    );

    showMessage(
      "Booking accepted successfully.",
      "success"
    );

    await loadWorkerBookings();

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


// ============================================================
// START BOOKING
// ============================================================

async function startBooking(
  bookingId
) {
  try {

    await apiRequest(
      `/bookings/${Number(bookingId)}/start`,
      {
        method: "POST"
      }
    );

    showMessage(
      "Job marked as started.",
      "success"
    );

    await loadWorkerBookings();

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


// ============================================================
// COMPLETE BOOKING
// ============================================================

async function completeBooking(
  bookingId
) {
  const input =
    document.getElementById(
      `completion-${Number(bookingId)}`
    );

  const code =
    String(input?.value || "")
      .replace(/\D/g, "");

  if (!/^[0-9]{6}$/.test(code)) {
    showMessage(
      "Enter the customer's 6 digit completion code.",
      "error"
    );

    return;
  }

  try {

    const data =
      await apiRequest(
        `/bookings/${Number(bookingId)}/complete`,
        {
          method: "POST",

          body: JSON.stringify({
            code
          })
        }
      );

    showMessage(
      data.message ||
      "Job completed successfully.",
      "success"
    );

    await loadWorkerBookings();

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


// ============================================================
// WORKER CANCEL
// ============================================================

async function cancelWorkerBooking(
  bookingId
) {
  await cancelBooking(
    bookingId,
    "Cancelled by worker"
  );
}


// ============================================================
// GENERIC CANCEL
// ============================================================

async function cancelBooking(
  bookingId,
  defaultReason = ""
) {
  const confirmed =
    window.confirm(
      "Are you sure you want to cancel this booking?"
    );

  if (!confirmed) {
    return;
  }

  let reason = defaultReason;

  if (!reason) {
    reason =
      window.prompt(
        "Cancellation reason (optional):",
        ""
      ) || "";
  }

  try {

    await apiRequest(
      `/bookings/${Number(bookingId)}/cancel`,
      {
        method: "POST",

        body: JSON.stringify({
          reason:
            String(reason).trim() ||
            "Cancelled by user"
        })
      }
    );

    showMessage(
      "Booking cancelled successfully.",
      "success"
    );

    if (
      state.user?.role ===
      "worker"
    ) {
      await loadWorkerBookings();
    } else {
      await loadMyBookings();
    }

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


// ============================================================
// WORKER NOTIFICATIONS
// ============================================================

async function loadWorkerNotifications() {
  try {

    const data =
      await apiRequest(
        "/notifications"
      );

    state.notifications =
      Array.isArray(data.notifications)
        ? data.notifications
        : [];

    renderWorkerNotifications();

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


function renderWorkerNotifications() {
  const content =
    document.getElementById(
      "worker-content"
    );

  if (!content) {
    return;
  }

  if (!state.notifications.length) {
    content.innerHTML = `
      <div class="empty-state">

        <h3>
          No notifications
        </h3>

      </div>
    `;

    return;
  }

  content.innerHTML = `
    <div class="section-heading">

      <span class="eyebrow">
        NOTIFICATIONS
      </span>

      <h3>
        Updates
      </h3>

    </div>

    <div class="notification-list">

      ${state.notifications
        .map(notification => `

          <article
            class="notification-card"
          >

            <strong>
              ${escapeHTML(
                notification.type
              )}
            </strong>

            <p>
              ${escapeHTML(
                notification.message
              )}
            </p>

            <small>
              ${escapeHTML(
                formatDate(
                  notification.created_at
                )
              )}
            </small>

            ${
              !Number(
                notification.read
              )
                ? `
                  <button
                    type="button"
                    class="secondary-btn"
                    onclick="markWorkerNotificationRead(${Number(notification.id)})"
                  >
                    Mark as read
                  </button>
                `
                : `
                  <small>
                    ✓ Read
                  </small>
                `
            }

          </article>

        `)
        .join("")}

    </div>
  `;
}


async function markWorkerNotificationRead(
  notificationId
) {
  try {

    await apiRequest(
      `/notifications/${Number(notificationId)}/read`,
      {
        method: "POST"
      }
    );

    await loadWorkerNotifications();

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


// ============================================================
// WORKER WALLET
// ============================================================

async function loadWorkerWallet() {
  try {

    const data =
      await apiRequest(
        "/workers/wallet"
      );

    renderWorkerWallet(
      data
    );

  } catch (error) {

    showMessage(
      error.message,
      "error"
    );

  }
}


function renderWorkerWallet(
  data
) {
  const content =
    document.getElementById(
      "worker-content"
    );

  if (!content) {
    return;
  }

  const transactions =
    Array.isArray(
      data.transactions
    )
      ? data.transactions
      : [];

  content.innerHTML = `
    <div class="booking-card">

      <div class="section-heading">

        <span class="eyebrow">
          WORKER WALLET
        </span>

        <h3>
          Wallet balance
        </h3>

      </div>

      <div class="price-summary">

        <p>
          Current balance:
          <strong>
            ${money(data.balance)}
          </strong>
        </p>

        <p>
          Cash booking requirement:
          <strong>
            ${escapeHTML(
              data.requiredForNextCashBooking
            )}
          </strong>
        </p>

      </div>

      <h3>
        Recent wallet transactions
      </h3>

      ${
        transactions.length
          ? `
            <div class="booking-list">

              ${transactions
                .map(tx => `
                  <article
                    class="notification-card"
                  >

                    <strong>
                      ${escapeHTML(
                        tx.type
                      )}
                    </strong>

                    <p>
                      Amount:
                      ${money(tx.amount)}
                    </p>

                    <p>
                      Status:
                      ${escapeHTML(
                        tx.status
                      )}
                    </p>

                    ${
                      tx.description
                        ? `
                          <p>
                            ${escapeHTML(
                              tx.description
                            )}
                          </p>
                        `
                        : ""
                    }

                    <small>
                      ${escapeHTML(
                        formatDate(
                          tx.created_at
                        )
                      )}
                    </small>

                  </article>
                `)
                .join("")}

            </div>
          `
          : `
            <div class="empty-state">
              <p>
                No wallet transactions yet.
              </p>
            </div>
          `
      }

    </div>
  `;
}


// ============================================================
// AUTO LOAD
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    loadSession();

    updateSessionUI();

    if (state.user) {
      renderApp();
    }

  }
);


// ============================================================
// GLOBAL FUNCTIONS
// ============================================================

window.showAuth =
  showAuth;

window.requestOTP =
  requestOTP;

window.verifyOTP =
  verifyOTP;

window.selectRole =
  selectRole;

window.logout =
  logout;

window.selectService =
  selectService;

window.locate =
  locate;

window.findWorkersFromForm =
  findWorkersFromForm;

window.openBooking =
  openBooking;

window.createBooking =
  createBooking;

window.startOnlinePayment =
  startOnlinePayment;

window.loadMyBookings =
  loadMyBookings;

window.getWorkerContact =
  getWorkerContact;

window.closePhoneDialog =
  closePhoneDialog;

window.loadNotifications =
  loadNotifications;

window.markNotificationRead =
  markNotificationRead;

window.renderCustomerDashboard =
  renderCustomerDashboard;

window.renderCustomerHome =
  renderCustomerHome;

window.renderWorkerDashboard =
  renderWorkerDashboard;

window.renderWorkerHome =
  renderWorkerHome;

window.renderWorkerProfile =
  renderWorkerProfile;

window.registerWorker =
  registerWorker;

window.updateWorkerLocation =
  updateWorkerLocation;

window.setWorkerAvailability =
  setWorkerAvailability;

window.loadWorkerBookings =
  loadWorkerBookings;

window.acceptBooking =
  acceptBooking;

window.startBooking =
  startBooking;

window.completeBooking =
  completeBooking;

window.cancelBooking =
  cancelBooking;

window.cancelWorkerBooking =
  cancelWorkerBooking;

window.loadWorkerNotifications =
  loadWorkerNotifications;

window.markWorkerNotificationRead =
  markWorkerNotificationRead;

window.loadWorkerWallet =
  loadWorkerWallet;
