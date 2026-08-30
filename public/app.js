// ============================================================
// KAAMSETU - FINAL FRONTEND APP
// Matches the current server.js API
// ============================================================

"use strict";

const API_BASE = "/api";

const state = {
  user: null,
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

function showMessage(message, type = "info") {
  const old = document.getElementById("ks-message");

  if (old) {
    old.remove();
  }

  const box = document.createElement("div");

  box.id = "ks-message";
  box.textContent = message;
  box.className = `ks-message ks-${type}`;

  document.body.appendChild(box);

  setTimeout(() => {
    box.remove();
  }, 4500);
}


// ============================================================
// API REQUEST HELPER
// ============================================================

async function apiRequest(
  endpoint,
  options = {}
) {
  const headers = {
    ...(options.headers || {})
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (state.user?.id) {
    headers["x-user-id"] = String(state.user.id);
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
    throw new Error(
      data.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}


// ============================================================
// LOCAL SESSION
// ============================================================

function saveSession() {
  if (!state.user) {
    localStorage.removeItem("kaamsetu_user");
    return;
  }

  localStorage.setItem(
    "kaamsetu_user",
    JSON.stringify(state.user)
  );
}

function loadSession() {
  try {
    const raw =
      localStorage.getItem("kaamsetu_user");

    if (!raw) {
      return;
    }

    const user = JSON.parse(raw);

    if (
      user &&
      Number.isInteger(Number(user.id))
    ) {
      state.user = user;
    }
  } catch {
    localStorage.removeItem("kaamsetu_user");
  }
}

function logout() {
  state.user = null;
  state.selectedWorker = null;
  state.nearbyWorkers = [];

  localStorage.removeItem(
    "kaamsetu_user"
  );

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
        class="secondary-btn"
        onclick="showAuth()"
      >
        Login
      </button>
    `;

    return;
  }

  const role =
    state.user.role
      ? escapeHTML(state.user.role)
      : "Account";

  const phone =
    escapeHTML(state.user.phone || "");

  session.innerHTML = `
    <div class="session-user">
      <span>
        ${phone}
      </span>

      <small>
        ${role}
      </small>

      <button
        class="secondary-btn"
        onclick="logout()"
      >
        Logout
      </button>
    </div>
  `;
}


// ============================================================
// AUTH MODAL
// ============================================================

function showAuth() {
  if (state.user) {
    renderApp();

    document
      .getElementById("app")
      ?.scrollIntoView({
        behavior: "smooth"
      });

    return;
  }

  getApp().innerHTML = `
    <section class="auth-card">

      <div class="section-heading">
        <span class="eyebrow">
          KAAMSETU ACCOUNT
        </span>

        <h2>
          Login with mobile number
        </h2>

        <p>
          Enter your mobile number to continue.
        </p>
      </div>

      <form
        id="phone-form"
        onsubmit="requestOTP(event)"
      >

        <label>
          Mobile Number
        </label>

        <input
          id="phone-input"
          type="tel"
          inputmode="numeric"
          maxlength="10"
          placeholder="10 digit mobile number"
          autocomplete="tel"
          required
        >

        <button
          type="submit"
          class="primary-btn"
        >
          Send OTP
        </button>

      </form>

      <div id="otp-area"></div>

    </section>
  `;

  getApp()
    .scrollIntoView({
      behavior: "smooth"
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

  const phone =
    String(input?.value || "")
      .replace(/\D/g, "")
      .slice(-10);

  if (!/^[0-9]{10}$/.test(phone)) {
    showMessage(
      "Please enter a valid 10 digit mobile number.",
      "error"
    );

    return;
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

        <label>
          Enter OTP
        </label>

        <input
          id="otp-input"
          type="text"
          inputmode="numeric"
          maxlength="6"
          placeholder="6 digit OTP"
          autocomplete="one-time-code"
        >

        <button
          class="primary-btn"
          onclick="verifyOTP()"
        >
          Verify OTP
        </button>

        ${
          data.demoOtp
            ? `
              <p>
                Development OTP:
                <strong>
                  ${escapeHTML(data.demoOtp)}
                </strong>
              </p>
            `
            : ""
        }

      </div>
    `;

    showMessage(
      "OTP sent successfully.",
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
// VERIFY OTP
// ============================================================

async function verifyOTP() {
  const input =
    document.getElementById(
      "otp-input"
    );

  const otp =
    String(input?.value || "")
      .replace(/\D/g, "")
      .slice(0, 6);

  if (!/^[0-9]{6}$/.test(otp)) {
    showMessage(
      "Please enter the 6 digit OTP.",
      "error"
    );

    return;
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

    state.user = data.user;

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
  }
}


// ============================================================
// ROLE SELECTION
// ============================================================

async function selectRole(role) {
  try {
    const data =
      await apiRequest(
        "/auth/select-role",
        {
          method: "POST",
          body: JSON.stringify({
            role
          })
        }
      );

    state.user.role =
      data.role;

    saveSession();
    updateSessionUI();
    renderApp();

    showMessage(
      `Account selected as ${role}.`,
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
// MAIN APP RENDER
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
// ROLE SELECTION SCREEN
// ============================================================

function renderRoleSelection() {
  getApp().innerHTML = `
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
// CUSTOMER DASHBOARD
// ============================================================

function renderCustomerDashboard() {
  getApp().innerHTML = `
    <section class="dashboard-card">

      <div class="section-heading">

        <span class="eyebrow">
          CUSTOMER
        </span>

        <h2>
          Book a local professional
        </h2>

        <p>
          Select a service and find approved
          workers near your location.
        </p>

      </div>

      <div class="dashboard-actions">

        <button
          class="primary-btn"
          onclick="locate()"
        >
          📍 Find Nearby Workers
        </button>

        <button
          class="secondary-btn"
          onclick="loadMyBookings()"
        >
          My Bookings
        </button>

        <button
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

      <label>
        Select service
      </label>

      <select id="customer-category">

        <option value="">
          Choose a service
        </option>

        <option>
          Plumber
        </option>

        <option>
          Electrician
        </option>

        <option>
          Carpenter
        </option>

        <option>
          Painter
        </option>

        <option>
          Cleaner
        </option>

        <option>
          AC Technician
        </option>

        <option>
          Mechanic
        </option>

        <option>
          General Labour
        </option>

      </select>

      <button
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
// SERVICE SELECT FROM HERO CARDS
// ============================================================

function selectService(category) {
  state.selectedService = category;

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
    select.value = category;
  }

  locate();
}


// ============================================================
// FIND WORKERS FROM FORM
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
// GPS LOCATION
// ============================================================

function locate() {
  if (!state.user) {
    showAuth();
    return;
  }

  if (state.user.role !== "customer") {
    showMessage(
      "GPS worker search is available for customers.",
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

      let message =
        "Unable to get your location.";

      if (
        error.code ===
        error.PERMISSION_DENIED
      ) {
        message =
          "Location permission was denied. Please allow GPS access.";
      }

      if (
        error.code ===
        error.POSITION_UNAVAILABLE
      ) {
        message =
          "Your location is currently unavailable.";
      }

      if (
        error.code ===
        error.TIMEOUT
      ) {
        message =
          "Location request timed out.";
      }

      showMessage(
        message,
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
// NEARBY WORKER SEARCH
// ============================================================

async function findNearbyWorkers(
  category
) {
  if (!state.customerLocation) {
    return;
  }

  const params =
    new URLSearchParams({
      lat: state.customerLocation.lat,
      lng: state.customerLocation.lng,
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

    renderWorkerResults();

    if (!state.nearbyWorkers.length) {
      showMessage(
        "No approved available worker was found in the available search range.",
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

function renderWorkerResults() {
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
          Please try another service or search again later.
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

      <p>
        KaamSetu prioritizes the nearest successful GPS range.
      </p>
    </div>

    <div class="worker-grid">

      ${state.nearbyWorkers
        .map(worker => `
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
                ⭐ ${escapeHTML(worker.rating)}
              </span>

              <span>
                📍 ${escapeHTML(worker.distanceKm)} km
              </span>

              <span>
                ₹${escapeHTML(worker.rate)}
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

            <button
              class="primary-btn"
              onclick="openBooking(${Number(worker.id)})"
            >
              Appoint Worker
            </button>

          </article>
        `)
        .join("")}

    </div>
  `;
}


// ============================================================
// BOOKING FORM
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
            Calculated securely by KaamSetu
          </strong>
        </p>

        <p>
          Final customer total:
          <strong>
            Calculated after booking
          </strong>
        </p>

      </div>

      <form
        onsubmit="createBooking(event)"
      >

        <label>
          Work description
        </label>

        <textarea
          id="booking-description"
          maxlength="1500"
          required
          placeholder="Describe what needs to be done..."
        ></textarea>

        <label>
          Work address
        </label>

        <textarea
          id="booking-address"
          maxlength="1000"
          required
          placeholder="Enter the complete work address..."
        ></textarea>

        <label>
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

        <label>
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
          Worker contact details are revealed only
          after the worker accepts the booking.
        </div>

        <button
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

  if (!description || !address || !duration) {
    showMessage(
      "Please complete all booking details.",
      "error"
    );

    return;
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
  }
}


// ============================================================
// BOOKING CONFIRMATION
// ============================================================

function renderBookingConfirmation(
  data
) {
  const content =
    document.getElementById(
      "customer-content"
    );

  if (!content) {
    return;
  }

  const pricing =
    data.pricing || {};

  content.innerHTML = `
    <div class="booking-card">

      <div class="section-heading">

        <span class="eyebrow">
          BOOKING CREATED
        </span>

        <h3>
          Appointment request sent
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
          Customer total:
          <strong>
            ${money(pricing.customerTotal)}
          </strong>
        </p>

      </div>

      <div class="booking-code-box">

        <h3>
          Completion Code
        </h3>

        <p>
          Keep this code safe.
          The appointed worker will need it
          to complete the job.
        </p>

        <strong class="completion-code">
          ${escapeHTML(data.completionCode)}
        </strong>

      </div>

      <div class="booking-warning">

        ${
          data.paymentMethod === "online"
            ? `
              Online payment is selected.
              Payment must be completed through the
              configured payment gateway before the worker
              can accept the booking.
            `
            : `
              Cash payment selected.
              The worker will receive the booking request
              and contact details become available after
              acceptance.
            `
        }

      </div>

      ${
        data.paymentMethod === "online"
          ? `
            <button
              class="primary-btn"
              onclick="startOnlinePayment(${Number(data.bookingId)})"
            >
              Continue to Online Payment
            </button>
          `
          : ""
      }

      <button
        class="secondary-btn"
        onclick="loadMyBookings()"
      >
        View My Bookings
      </button>

    </div>
  `;
}


// ============================================================
// ONLINE PAYMENT
// ============================================================

async function startOnlinePayment(
  bookingId
) {
  try {
    const data =
      await apiRequest(
        "/payments/create",
        {
          method: "POST",
          body: JSON.stringify({
            bookingId
          })
        }
      );

    if (data.alreadyPaid) {
      showMessage(
        "This booking is already paid.",
        "success"
      );

      return;
    }

    showMessage(
      data.message ||
      "Online payment gateway is not configured yet.",
      "info"
    );

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

    renderMyBookings();

  } catch (error) {
    showMessage(
      error.message,
      "error"
    );
  }
}


// ============================================================
// RENDER CUSTOMER BOOKINGS
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
          Your bookings will appear here.
        </p>

        <button
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
                Booking #${escapeHTML(booking.id)}
              </p>

              <p>
                Status:
                <strong>
                  ${escapeHTML(booking.status)}
                </strong>
              </p>

              <p>
                Worker price:
                ${money(booking.worker_price)}
              </p>

              <p>
                Platform fee:
                ${money(booking.platform_fee)}
              </p>

              <p>
                Total:
                <strong>
                  ${money(booking.customer_total)}
                </strong>
              </p>

              <p>
                Payment:
                ${escapeHTML(booking.payment_method)}
                /
                ${escapeHTML(booking.payment_status)}
              </p>

              ${
                canContact
                  ? `
                    <button
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

            </article>
          `;
        })
        .join("")}

    </div>
  `;
}


// ============================================================
// GET WORKER CONTACT
// ============================================================

async function getWorkerContact(
  bookingId
) {
  try {
    const data =
      await apiRequest(
        `/bookings/${Number(bookingId)}/contact`
      );

    const phone =
      String(data.workerPhone || "");

    if (!phone) {
      throw new Error(
        "Worker phone number is unavailable."
      );
    }

    showPhoneDialog(
      phone
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
  phone
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
    <div class="ks-modal">

      <h3>
        Worker Contact
      </h3>

      <p>
        You can contact your appointed worker
        using this number.
      </p>

      <a
        href="tel:${escapeHTML(phone)}"
        class="primary-btn"
      >
        📞 ${escapeHTML(phone)}
      </a>

      <button
        class="secondary-btn"
        onclick="document.getElementById('ks-phone-dialog').remove()"
      >
        Close
      </button>

    </div>
  `;

  document.body.appendChild(
    overlay
  );
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


// ============================================================
// RENDER NOTIFICATIONS
// ============================================================

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
          <article class="notification-card">

            <strong>
              ${escapeHTML(notification.type)}
            </strong>

            <p>
              ${escapeHTML(notification.message)}
            </p>

            <small>
              ${escapeHTML(notification.created_at)}
            </small>

            ${
              !notification.read
                ? `
                  <button
                    class="secondary-btn"
                    onclick="markNotificationRead(${Number(notification.id)})"
                  >
                    Mark as read
                  </button>
                `
                : `
                  <small>
                    Read
                  </small>
                `
            }

          </article>
        `)
        .join("")}

    </div>
  `;
}


// ============================================================
// MARK NOTIFICATION READ
// ============================================================

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
// WORKER DASHBOARD
// ============================================================

function renderWorkerDashboard() {
  getApp().innerHTML = `
    <section class="dashboard-card">

      <div class="section-heading">

        <span class="eyebrow">
          WORKER
        </span>

        <h2>
          Manage your KaamSetu work
        </h2>

        <p>
          Complete your profile, stay available,
          and manage customer requests.
        </p>

      </div>

      <div class="dashboard-actions">

        <button
          class="primary-btn"
          onclick="renderWorkerProfile()"
        >
          Worker Profile
        </button>

        <button
          class="secondary-btn"
          onclick="loadWorkerBookings()"
        >
          My Jobs
        </button>

        <button
          class="secondary-btn"
          onclick="updateWorkerLocation()"
        >
          📍 Update GPS
        </button>

        <button
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
        Submit your worker profile for admin approval.
      </p>

      <button
        class="primary-btn"
        onclick="renderWorkerProfile()"
      >
        Create / Update Profile
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

      </div>

      <form
        onsubmit="registerWorker(event)"
      >

        <label>
          Name
        </label>

        <input
          id="worker-name"
          type="text"
          maxlength="100"
          required
          placeholder="Your full name"
        >

        <label>
          Service category
        </label>

        <select
          id="worker-category"
          required
        >

          <option value="">
            Select category
          </option>

          <option>
            Plumber
          </option>

          <option>
            Electrician
          </option>

          <option>
            Carpenter
          </option>

          <option>
            Painter
          </option>

          <option>
            Cleaner
          </option>

          <option>
            AC Technician
          </option>

          <option>
            Mechanic
          </option>

          <option>
            General Labour
          </option>

        </select>

        <label>
          Skills
        </label>

        <input
          id="worker-skills"
          type="text"
          maxlength="500"
          placeholder="e.g. Pipe repair, fitting, leakage"
        >

        <label>
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

        <label>
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

        <label>
          About you
        </label>

        <textarea
          id="worker-bio"
          maxlength="1000"
          placeholder="Tell customers about your experience..."
        ></textarea>

        <button
          type="submit"
          class="primary-btn"
        >
          Submit Worker Profile
        </button>

      </form>

      <div class="booking-warning">

        Worker profiles are not visible to customers
        until they are approved by the KaamSetu admin.

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
    !Number.isFinite(experience) ||
    !Number.isFinite(rate)
  ) {
    showMessage(
      "Please complete all required worker details.",
      "error"
    );

    return;
  }

  let lat = null;
  let lng = null;

  if (state.customerLocation) {
    lat =
      state.customerLocation.lat;

    lng =
      state.customerLocation.lng;
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
            lat,
            lng
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
  }
}


// ============================================================
// WORKER GPS
// ============================================================

function updateWorkerLocation() {
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
          "Worker GPS location updated.",
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
// WORKER BOOKINGS
// ============================================================

async function loadWorkerBookings() {
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
// RENDER WORKER BOOKINGS
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
          <article class="booking-card">

            <h3>
              ${escapeHTML(booking.category)}
            </h3>

            <p>
              Booking #${escapeHTML(booking.id)}
            </p>

            <p>
              Status:
              <strong>
                ${escapeHTML(booking.status)}
              </strong>
            </p>

            <p>
              Work:
              ${escapeHTML(booking.description)}
            </p>

            <p>
              Address:
              ${escapeHTML(booking.address)}
            </p>

            <p>
              Worker price:
              <strong>
                ${money(booking.worker_price)}
              </strong>
            </p>

            <p>
              Platform fee:
              ${money(booking.platform_fee)}
            </p>

            <p>
              Customer total:
              ${money(booking.customer_total)}
            </p>

            <p>
              Payment:
              ${escapeHTML(booking.payment_method)}
              /
              ${escapeHTML(booking.payment_status)}
            </p>

            ${
              booking.customer_phone
                ? `
                  <p>
                    📞 Customer:
                    ${
                      booking.customer_phone ===
                      "Hidden until accepted"
                        ? "Hidden until accepted"
                        : `
                          <a
                            href="tel:${escapeHTML(booking.customer_phone)}"
                          >
                            ${escapeHTML(booking.customer_phone)}
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

function workerBookingActions(
  booking
) {
  if (
    booking.status ===
    "requested"
  ) {
    return `
      <button
        class="primary-btn"
        onclick="acceptBooking(${Number(booking.id)})"
      >
        Accept Booking
      </button>
    `;
  }

  if (
    booking.status ===
    "accepted"
  ) {
    return `
      <button
        class="primary-btn"
        onclick="startBooking(${Number(booking.id)})"
      >
        Start Job
      </button>
    `;
  }

  if (
    booking.status ===
    "in_progress"
  ) {
    return `
      <div class="completion-box">

        <label>
          Enter customer's completion code
        </label>

        <input
          id="completion-${Number(booking.id)}"
          type="text"
          inputmode="numeric"
          maxlength="6"
          placeholder="6 digit code"
        >

        <button
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

  return "";
}


// ============================================================
// ACCEPT BOOKING
// ============================================================

async function acceptBooking(
  bookingId
) {
  try {
    const data =
      await apiRequest(
        `/bookings/${Number(bookingId)}/accept`,
        {
          method: "POST"
        }
      );

    showPhoneDialog(
      data.workerPhone
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
      .replace(/\D/g, "")
      .slice(0, 6);

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


// ============================================================
// RENDER WORKER NOTIFICATIONS
// ============================================================

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
          <article class="notification-card">

            <strong>
              ${escapeHTML(notification.type)}
            </strong>

            <p>
              ${escapeHTML(notification.message)}
            </p>

            <small>
              ${escapeHTML(notification.created_at)}
            </small>

            ${
              !notification.read
                ? `
                  <button
                    class="secondary-btn"
                    onclick="markWorkerNotificationRead(${Number(notification.id)})"
                  >
                    Mark as read
                  </button>
                `
                : ""
            }

          </article>
        `)
        .join("")}

    </div>
  `;
}


// ============================================================
// MARK WORKER NOTIFICATION READ
// ============================================================

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

window.loadWorkerBookings =
  loadWorkerBookings;

window.acceptBooking =
  acceptBooking;

window.startBooking =
  startBooking;

window.completeBooking =
  completeBooking;

window.loadWorkerNotifications =
  loadWorkerNotifications;

window.markWorkerNotificationRead =
  markWorkerNotificationRead;
