let user = JSON.parse(
  localStorage.getItem("ks_user") || "null"
);

let category = "Plumber";
let latitude = null;
let longitude = null;

const categories = [
  "Plumber",
  "Electrician",
  "Carpenter",
  "Painter",
  "Cleaner",
  "AC Technician",
  "Mechanic",
  "Mason",
  "Gardener",
  "Driver",
  "Welder",
  "General Labour",
  "Appliance Repair",
  "CCTV Technician"
];


// =========================
// API HELPER
// =========================

async function api(url, options = {}) {

  options.headers = {
    ...(options.headers || {}),
    ...(user ? { "x-user-id": user.id } : {})
  };

  const response = await fetch(url, options);

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error || "Something went wrong"
    );
  }

  return data;
}


// =========================
// AUTH SCREEN
// =========================

function showAuth() {

  document.getElementById("app").innerHTML = `

    <section class="panel auth-panel">

      <div class="section-heading">

        <span class="eyebrow">
          GET STARTED
        </span>

        <h2>
          Login to KaamSetu
        </h2>

        <p>
          Enter your mobile number to continue.
        </p>

      </div>

      <input
        id="phone"
        type="tel"
        inputmode="numeric"
        maxlength="10"
        placeholder="10 digit mobile number"
      >

      <button
        class="primary-btn full-btn"
        onclick="sendOTP()"
      >
        Send OTP
      </button>

      <div id="otpbox"></div>

    </section>

  `;
}


// =========================
// SEND OTP
// =========================

async function sendOTP() {

  const phone =
    document.getElementById("phone").value.trim();

  if (!/^[0-9]{10}$/.test(phone)) {

    alert(
      "Please enter a valid 10 digit mobile number."
    );

    return;
  }

  try {

    const data = await api(
      "/api/auth/send-otp",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          phone
        })
      }
    );

    document.getElementById("otpbox").innerHTML = `

      <div class="otp-box">

        <p>
          ${escapeHTML(
            data.message ||
            "OTP sent successfully."
          )}
        </p>

        <input
          id="otp"
          type="number"
          inputmode="numeric"
          maxlength="6"
          placeholder="Enter OTP"
        >

        <button
          class="primary-btn full-btn"
          onclick="verifyOTP('${phone}')"
        >
          Verify OTP
        </button>

        <p style="margin-top:12px;font-size:13px;color:#687386;">
          Enter the OTP received on your mobile.
        </p>

      </div>

    `;

  } catch (error) {

    alert(error.message);

  }
}


// =========================
// VERIFY OTP
// =========================

async function verifyOTP(phone) {

  const code =
    document.getElementById("otp").value.trim();

  if (!/^[0-9]{6}$/.test(code)) {

    alert("Please enter the 6 digit OTP.");

    return;
  }

  try {

    const data = await api(
      "/api/auth/verify-otp",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          phone,
          otp: code
        })
      }
    );

    user = data.user;

    localStorage.setItem(
      "ks_user",
      JSON.stringify(user)
    );

    render();

  } catch (error) {

    alert(error.message);

  }
}


// =========================
// ROLE SELECTION
// =========================

function showRoleSelection() {

  document.getElementById("app").innerHTML = `

    <section class="panel">

      <div class="section-heading">

        <span class="eyebrow">
          WELCOME TO KAAMSETU
        </span>

        <h2>
          How do you want to use KaamSetu?
        </h2>

        <p>
          Choose your account type.
        </p>

      </div>

      <button
        class="primary-btn full-btn"
        onclick="selectRole('customer')"
      >
        👤 I need a service
      </button>

      <br><br>

      <button
        class="secondary-btn full-btn"
        onclick="selectRole('worker')"
      >
        🛠️ I provide services
      </button>

    </section>

  `;
}


async function selectRole(role) {

  try {

    const data = await api(
      "/api/auth/select-role",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          role
        })
      }
    );

    user.role = data.role;

    localStorage.setItem(
      "ks_user",
      JSON.stringify(user)
    );

    render();

  } catch (error) {

    alert(error.message);

  }
}


// =========================
// GPS
// =========================

function locate() {

  if (!navigator.geolocation) {

    alert(
      "GPS is not supported on this device."
    );

    return;
  }

  navigator.geolocation.getCurrentPosition(

    position => {

      latitude =
        position.coords.latitude;

      longitude =
        position.coords.longitude;

      alert(
        "Your location has been detected."
      );

      if (
        user &&
        user.role === "customer"
      ) {
        findWorkers();
      }

    },

    () => {

      alert(
        "Location permission was denied."
      );

    },

    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }

  );
}


// =========================
// FIND WORKERS
// =========================

async function findWorkers() {

  const container =
    document.getElementById("workers");

  if (!container) {
    return;
  }

  if (
    latitude === null ||
    longitude === null
  ) {

    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">
          📍
        </div>

        <h3>
          Turn on your location
        </h3>

        <p>
          Use GPS to find nearby available workers.
        </p>

        <br>

        <button
          class="primary-btn"
          onclick="locate()"
        >
          Use GPS
        </button>

      </div>

    `;

    return;
  }

  container.innerHTML = `

    <div class="loading">
      Finding nearby workers...
    </div>

  `;

  try {

    const params =
      new URLSearchParams();

    params.set(
      "category",
      category
    );

    params.set(
      "lat",
      latitude
    );

    params.set(
      "lng",
      longitude
    );

    params.set(
      "radius",
      "10"
    );

    const data =
      await api(
        "/api/workers/nearby?" +
        params.toString()
      );

    const workers =
      data.workers || [];

    if (!workers.length) {

      container.innerHTML = `

        <div class="empty-state">

          <div class="empty-icon">
            🔍
          </div>

          <h3>
            No workers found
          </h3>

          <p>
            No approved ${escapeHTML(
              category.toLowerCase()
            )} workers are available nearby right now.
          </p>

        </div>

      `;

      return;
    }

    container.innerHTML =
      workers.map(worker => `

        <article class="worker-card">

          <div class="worker-avatar">
            ${getInitials(worker.name)}
          </div>

          <div class="worker-info">

            <div class="worker-name-row">

              <h3>
                ${escapeHTML(worker.name)}
              </h3>

              <span class="verified-badge">
                ✓ Verified
              </span>

            </div>

            <p class="worker-category">
              ${escapeHTML(worker.category)}
            </p>

            <div class="worker-meta">

              <span>
                ⭐ ${worker.rating || 5}
              </span>

              <span>
                ${worker.experience || 0}
                years experience
              </span>

              <span>
                ${worker.distanceKm == null
                  ? "Distance unavailable"
                  : worker.distanceKm + " km away"
                }
              </span>

            </div>

            ${
              worker.skills
                ? `
                  <p class="worker-bio">
                    Skills:
                    ${escapeHTML(worker.skills)}
                  </p>
                `
                : ""
            }

            ${
              worker.bio
                ? `
                  <p class="worker-bio">
                    ${escapeHTML(worker.bio)}
                  </p>
                `
                : ""
            }

          </div>

          <div class="worker-action">

            <strong>
              ${
                worker.rate
                  ? "₹" + worker.rate
                  : "Quote"
              }
            </strong>

            <small>
              starting
            </small>

            <button
              class="primary-btn"
              onclick="bookWorker(
                ${worker.id},
                '${escapeAttribute(worker.category)}',
                ${Number(worker.rate) || 0}
              )"
            >
              Request
            </button>

          </div>

        </article>

      `).join("");

  } catch (error) {

    container.innerHTML = `

      <div class="error-state">
        ${escapeHTML(error.message)}
      </div>

    `;

  }
}


// =========================
// BOOK WORKER
// =========================

async function bookWorker(
  workerId,
  workerCategory,
  rate
) {

  const description =
    prompt(
      "Describe the work you need:"
    );

  if (description === null) {
    return;
  }

  const address =
    prompt(
      "Enter your work address:"
    );

  if (address === null) {
    return;
  }

  const duration =
    prompt(
      "Enter work type: small-work or full-day",
      "small-work"
    );

  if (duration === null) {
    return;
  }

  try {

    const data = await api(
      "/api/bookings",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({

          workerId,

          category:
            workerCategory,

          description,

          address,

          lat: latitude,

          lng: longitude,

          duration,

          estimatedPrice: rate

        })
      }
    );

    alert(
      "Job request sent successfully!"
    );

    loadBookings();

  } catch (error) {

    alert(error.message);

  }
}


// =========================
// BOOKINGS
// =========================

async function loadBookings() {

  const container =
    document.getElementById("bookings");

  if (!container) {
    return;
  }

  try {

    const data =
      await api("/api/bookings/my");

    const bookings =
      data.bookings || [];

    if (!bookings.length) {

      container.innerHTML = `

        <div class="empty-state">

          <div class="empty-icon">
            📅
          </div>

          <h3>
            No bookings yet
          </h3>

          <p>
            Your bookings will appear here.
          </p>

        </div>

      `;

      return;
    }

    container.innerHTML =
      bookings.map(booking => `

        <article class="booking-card">

          <div>

            <span class="booking-id">
              #${booking.id}
            </span>

            <h3>
              ${escapeHTML(
                booking.category
              )}
            </h3>

            ${
              user.role === "customer"
                ? `
                  <p>
                    Worker:
                    <strong>
                      ${escapeHTML(
                        booking.worker_name ||
                        "Worker"
                      )}
                    </strong>
                  </p>
                `
                : `
                  <p>
                    Customer:
                    <strong>
                      ${escapeHTML(
                        booking.customer_phone ||
                        "Customer"
                      )}
                    </strong>
                  </p>
                `
            }

          </div>

          <div class="booking-status">

            <span class="status status-${escapeAttribute(
              booking.status
            )}">
              ${formatStatus(
                booking.status
              )}
            </span>

          </div>

        </article>

      `).join("");

  } catch (error) {

    container.innerHTML = `

      <div class="error-state">
        ${escapeHTML(error.message)}
      </div>

    `;

  }
}


// =========================
// WORKER DASHBOARD
// =========================

function workerDashboard() {

  document.getElementById("app").innerHTML = `

    <section class="panel">

      <div class="section-heading">

        <span class="eyebrow">
          WORKER PROFILE
        </span>

        <h2>
          Create your professional profile
        </h2>

        <p>
          Your profile will be reviewed by KaamSetu
          before customers can see you.
        </p>

      </div>

      <input
        id="workerName"
        placeholder="Full name"
      >

      <select id="workerCategory">

        ${categories.map(
          item => `
            <option value="${escapeHTML(item)}">
              ${escapeHTML(item)}
            </option>
          `
        ).join("")}

      </select>

      <input
        id="workerSkills"
        placeholder="Skills e.g. pipe repair, wiring"
      >

      <input
        id="workerExperience"
        type="number"
        min="0"
        placeholder="Experience in years"
      >

      <input
        id="workerRate"
        type="number"
        min="0"
        placeholder="Starting rate ₹"
      >

      <textarea
        id="workerBio"
        rows="4"
        placeholder="Short description about your work"
      ></textarea>

      <button
        class="primary-btn full-btn"
        onclick="saveWorkerProfile()"
      >
        Submit Profile
      </button>

      <br>

      <button
        class="secondary-btn full-btn"
        onclick="updateWorkerGPS()"
      >
        📍 Update GPS Location
      </button>

    </section>


    <section class="panel">

      <div class="section-heading">

        <span class="eyebrow">
          JOB REQUESTS
        </span>

        <h2>
          Your bookings
        </h2>

      </div>

      <div id="bookings">
        Loading...
      </div>

    </section>

  `;

  loadBookings();
}


// =========================
// SAVE WORKER PROFILE
// =========================

async function saveWorkerProfile() {

  const name =
    document.getElementById(
      "workerName"
    ).value.trim();

  const selectedCategory =
    document.getElementById(
      "workerCategory"
    ).value;

  const skills =
    document.getElementById(
      "workerSkills"
    ).value.trim();

  const experience =
    document.getElementById(
      "workerExperience"
    ).value;

  const rate =
    document.getElementById(
      "workerRate"
    ).value;

  const bio =
    document.getElementById(
      "workerBio"
    ).value.trim();

  if (!name) {

    alert(
      "Please enter your name."
    );

    return;
  }

  try {

    const data =
      await api(
        "/api/workers/register",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({

            name,

            category:
              selectedCategory,

            skills,

            experience,

            rate,

            bio,

            lat: latitude,

            lng: longitude

          })
        }
      );

    alert(
      data.message ||
      "Profile submitted successfully. Admin approval is required."
    );

  } catch (error) {

    alert(error.message);

  }
}


// =========================
// WORKER GPS
// =========================

function updateWorkerGPS() {

  if (!navigator.geolocation) {

    alert(
      "GPS is not supported on this device."
    );

    return;
  }

  navigator.geolocation.getCurrentPosition(

    position => {

      latitude =
        position.coords.latitude;

      longitude =
        position.coords.longitude;

      alert(
        "GPS location updated. Submit your profile now."
      );

    },

    () => {

      alert(
        "Unable to access your location."
      );

    },

    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }

  );
}


// =========================
// LOGOUT
// =========================

function logout() {

  localStorage.removeItem(
    "ks_user"
  );

  user = null;

  location.reload();

}


// =========================
// MAIN CUSTOMER SCREEN
// =========================

function customerDashboard() {

  document.getElementById("app").innerHTML = `

    <section
      id="worker-section"
      class="panel"
    >

      <div class="section-heading">

        <span class="eyebrow">
          CUSTOMER
        </span>

        <h2>
          Find a ${escapeHTML(category)}
        </h2>

        <p>
          Select a service and find available
          professionals near your location.
        </p>

      </div>


      <div class="service-selector">

        ${categories.map(
          item => `

            <button
              class="service-chip ${
                item === category
                  ? "active"
                  : ""
              }"
              onclick="
                category='${escapeAttribute(item)}';
                render();
              "
            >
              ${escapeHTML(item)}
            </button>

          `
        ).join("")}

      </div>


      <div class="location-bar">

        <div>

          <strong>
            📍 Location
          </strong>

          <small>
            ${
              latitude !== null
                ? "GPS location detected"
                : "GPS not selected"
            }
          </small>

        </div>

        <button
          class="secondary-btn"
          onclick="locate()"
        >
          ${
            latitude !== null
              ? "Update GPS"
              : "Use GPS"
          }
        </button>

      </div>


      <div
        id="workers"
        class="workers-list"
      >
      </div>

    </section>


    <section class="panel">

      <div class="section-heading">

        <span class="eyebrow">
          YOUR ACTIVITY
        </span>

        <h2>
          My bookings
        </h2>

      </div>

      <div id="bookings">
        Loading...
      </div>

    </section>

  `;

  findWorkers();

  loadBookings();
}


// =========================
// MAIN RENDER
// =========================

function render() {

  const session =
    document.getElementById("session");

  if (!user) {

    if (session) {
      session.innerHTML = "";
    }

    showAuth();

    return;
  }


  if (!user.role) {

    if (session) {
      session.innerHTML = "";
    }

    showRoleSelection();

    return;
  }


  if (session) {

    session.innerHTML = `

      <div class="session-user">

        <span>
          ${escapeHTML(user.phone)}
        </span>

        <button
          class="logout-btn"
          onclick="logout()"
        >
          Logout
        </button>

      </div>

    `;

  }


  if (user.role === "worker") {

    workerDashboard();

    return;
  }


  customerDashboard();
}


// =========================
// HELPERS
// =========================

function getInitials(name) {

  if (!name) {
    return "KS";
  }

  return name
    .split(" ")
    .slice(0, 2)
    .map(
      word =>
        word.charAt(0).toUpperCase()
    )
    .join("");
}


function formatStatus(status) {

  return String(status || "")
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      letter =>
        letter.toUpperCase()
    );
}


function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function escapeAttribute(value) {

  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll('"', "&quot;");
}


// =========================
// START
// =========================

render();
