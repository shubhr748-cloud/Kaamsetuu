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

async function api(url, options = {}) {
  options.headers = {
    ...(options.headers || {}),
    ...(user ? { "x-user-id": user.id } : {})
  };

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong");
  }

  return data;
}


/* =========================
   AUTH
========================= */

function showAuth() {

  document.getElementById("app").innerHTML = `
    <section class="panel auth-panel">

      <div class="section-heading">
        <span class="eyebrow">GET STARTED</span>

        <h2>
          Register or Login
        </h2>

        <p>
          Enter your mobile number to continue.
        </p>
      </div>

      <input
        id="phone"
        type="tel"
        placeholder="Mobile number"
        maxlength="15"
      >

      <select id="role">

        <option value="customer">
          Customer
        </option>

        <option value="worker">
          Worker / Service Professional
        </option>

      </select>

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


async function sendOTP() {

  const phone =
    document.getElementById("phone").value.trim();

  const role =
    document.getElementById("role").value;

  if (!phone) {
    alert("Please enter your mobile number.");
    return;
  }

  try {

    const data = await api(
      "/api/auth/request-otp",
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
          OTP sent to your mobile number.
        </p>

        ${
          data.demoCode
            ? `<p class="demo-otp">
                Demo OTP:
                <strong>${data.demoCode}</strong>
              </p>`
            : ""
        }

        <input
          id="otp"
          type="number"
          placeholder="Enter OTP"
        >

        <button
          class="primary-btn full-btn"
          onclick="verifyOTP('${phone}','${role}')"
        >
          Verify OTP
        </button>

      </div>

    `;

  } catch (error) {

    alert(error.message);

  }
}


async function verifyOTP(phone, role) {

  const code =
    document.getElementById("otp").value.trim();

  if (!code) {
    alert("Enter OTP.");
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
          code,
          role
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


/* =========================
   GPS
========================= */

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

      if (user && user.role === "customer") {
        findWorkers();
      }

    },

    () => {

      alert(
        "Location permission was denied. You can still search without GPS."
      );

    },

    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }

  );
}


/* =========================
   SERVICES
========================= */

function selectService(service) {

  category = service;

  if (!user) {

    showAuth();

    return;
  }

  if (user.role !== "customer") {

    alert(
      "Please login as a customer to book workers."
    );

    return;
  }

  render();

  document
    .getElementById("worker-section")
    ?.scrollIntoView({
      behavior: "smooth"
    });

}


/* =========================
   FIND WORKERS
========================= */

async function findWorkers() {

  const workerContainer =
    document.getElementById("workers");

  if (!workerContainer) {
    return;
  }

  workerContainer.innerHTML = `
    <div class="loading">
      Finding available workers...
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
      "radius",
      "10"
    );

    if (
      latitude !== null &&
      longitude !== null
    ) {

      params.set(
        "lat",
        latitude
      );

      params.set(
        "lng",
        longitude
      );

    }

    const workers =
      await api(
        "/api/workers/nearby?" +
        params.toString()
      );

    if (!workers.length) {

      workerContainer.innerHTML = `

        <div class="empty-state">

          <div class="empty-icon">
            🔍
          </div>

          <h3>
            No workers found
          </h3>

          <p>
            There are currently no approved
            ${category.toLowerCase()}
            workers available nearby.
          </p>

        </div>

      `;

      return;
    }


    workerContainer.innerHTML =
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
                ${
                  worker.distance_km == null
                    ? "Distance unavailable"
                    : worker.distance_km.toFixed(1) +
                      " km away"
                }
              </span>

            </div>

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
                ${worker.rate || 0}
              )"
            >
              Request
            </button>

          </div>

        </article>

      `).join("");

  } catch (error) {

    workerContainer.innerHTML = `
      <div class="error-state">
        ${escapeHTML(error.message)}
      </div>
    `;

  }
}


/* =========================
   BOOKING
========================= */

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
      "Work type: enter 'small' or 'full-day'",
      "small"
    );

  if (duration === null) {
    return;
  }

  try {

    await api(
      "/api/bookings",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({

          worker_id: workerId,

          category:
            workerCategory,

          description,

          address,

          lat: latitude,

          lng: longitude,

          duration,

          estimated_price: rate

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


/* =========================
   BOOKINGS
========================= */

async function loadBookings() {

  const container =
    document.getElementById("bookings");

  if (!container) {
    return;
  }

  try {

    const bookings =
      await api("/api/bookings");

    if (!bookings.length) {

      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📅</div>
          <h3>No bookings yet</h3>
          <p>Your job requests will appear here.</p>
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

            <p>
              Worker:
              <strong>
                ${escapeHTML(
                  booking.worker_name ||
                  "Worker"
                )}
              </strong>
            </p>

          </div>

          <div class="booking-status">

            <span class="status status-${booking.status}">
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


/* =========================
   WORKER ACCOUNT
========================= */

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
          Customers can discover you after
          admin verification.
        </p>

      </div>


      <input
        id="workerName"
        placeholder="Full name"
      >


      <select id="workerCategory">

        ${categories.map(
          item =>
            `<option value="${item}">
              ${item}
            </option>`
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
        placeholder="Short description about your work"
        rows="4"
      ></textarea>


      <button
        class="primary-btn"
        onclick="saveWorkerProfile()"
      >
        Save Profile
      </button>


      <button
        class="secondary-btn"
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

    await api(
      "/api/workers/profile",
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

          lng: longitude,

          available: true

        })

      }
    );

    alert(
      "Profile saved. Admin approval is required before customers can see you."
    );

  } catch (error) {

    alert(error.message);

  }

}


function updateWorkerGPS() {

  if (!navigator.geolocation) {

    alert(
      "GPS is not supported."
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
        "GPS location updated. Save your profile again to store it."
      );

    },

    () => {

      alert(
        "Unable to access your location."
      );

    },

    {
      enableHighAccuracy: true,
      timeout: 10000
    }

  );

}


/* =========================
   LOGOUT
========================= */

function logout() {

  localStorage.removeItem(
    "ks_user"
  );

  user = null;

  location.reload();

}


/* =========================
   MAIN RENDER
========================= */

function render() {

  const session =
    document.getElementById(
      "session"
    );

  if (!user) {

    session.innerHTML = "";

    showAuth();

    return;
  }


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


  if (user.role === "worker") {

    workerDashboard();

    return;
  }


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
          Find a ${category}
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
              class="
                service-chip
                ${
                  item === category
                    ? "active"
                    : ""
                }
              "
              onclick="
                category='${escapeAttribute(item)}';
                render();
              "
            >
              ${item}
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


/* =========================
   HELPERS
========================= */

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


/* =========================
   START
========================= */

if (user) {

  render();

} else {

  showAuth();

}
