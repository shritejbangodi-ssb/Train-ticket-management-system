const API_BASE = ""; // same origin

function showMessage(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

document.addEventListener("DOMContentLoaded", () => {

  // ================= LOGIN =================
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = loginForm.loginEmail.value.trim();
      const password = loginForm.loginPassword.value.trim();

      try {
        const res = await fetch("/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        if (!data.success) {
          showMessage("loginMessage", data.message);
          return;
        }

        localStorage.setItem("user", JSON.stringify(data.user));
        window.location.href = "booking.html";
      } catch (err) {
        console.error(err);
        showMessage("loginMessage", "Error connecting to server");
      }
    });
  }

  // ================= REGISTER =================
  const registerForm = document.getElementById("registerForm");
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = registerForm.regName.value.trim();
      const email = registerForm.regEmail.value.trim();
      const password = registerForm.regPassword.value.trim();

      try {
        const res = await fetch("/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password })
        });

        const data = await res.json();
        showMessage("registerMessage", data.message);

        if (data.success) {
          setTimeout(() => window.location.href = "index.html", 800);
        }
      } catch (err) {
        console.error(err);
        showMessage("registerMessage", "Error connecting to server");
      }
    });
  }

  // ================= BOOKING PAGE =================
  const bookingForm = document.getElementById("bookingForm");
  if (!bookingForm) return;

  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!user) {
    alert("Please login first");
    window.location.href = "index.html";
    return;
  }

  // ELEMENTS
  const passengerName = document.getElementById("passengerName");
  const age = document.getElementById("age");
  const fromStation = document.getElementById("fromStation");
  const toStation = document.getElementById("toStation");
  const reservationTypeEl = document.getElementById("reservationType");
  const travelDate = document.getElementById("travelDate");
  const fareResult = document.getElementById("fareResult");

  const viewBtn = document.getElementById("viewBookingsBtn");
  const bookingsBox = document.getElementById("myBookings");
  const bookingCount = document.getElementById("bookingCount");
  const bookingList = document.getElementById("bookingList");

  // Welcome
  const welcomeText = document.getElementById("welcomeText");
  if (welcomeText) {
    welcomeText.textContent = `Welcome, ${user.name}! Book your Karnataka tickets`;
  }

  // Date min
  travelDate.min = new Date().toISOString().split("T")[0];

  // ================= LOAD STATIONS =================
  async function loadStations() {
    const res = await fetch("/stations");
    const data = await res.json();
    if (!data.success) return;

    fromStation.innerHTML = `<option value="">-- Select --</option>`;
    toStation.innerHTML = `<option value="">-- Select --</option>`;

    data.stations.forEach(s => {
      fromStation.innerHTML += `<option value="${s.id}">${s.name} (${s.code})</option>`;
      toStation.innerHTML += `<option value="${s.id}">${s.name} (${s.code})</option>`;
    });
  }
  loadStations();

  // ================= CALCULATE FARE =================
  document.getElementById("calculateFareBtn").addEventListener("click", async () => {
    if (!reservationTypeEl.value || !fromStation.value || !toStation.value) {
      alert("Please select reservation type and stations");
      return;
    }

    if (fromStation.value === toStation.value) {
      alert("From and To stations must be different");
      return;
    }

    const res = await fetch("/calculate-fare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationType: reservationTypeEl.value,
        fromStationId: fromStation.value,
        toStationId: toStation.value
      })
    });

    const data = await res.json();
    if (!data.success) {
      alert(data.message || "Fare not found");
      return;
    }

    fareResult.textContent = `Fare Amount: ₹${data.amount}`;
  });

  // ================= BOOK TICKET =================
  document.getElementById("bookBtn").addEventListener("click", async () => {
    const body = {
      userId: user.id,
      passengerName: passengerName.value.trim(),
      age: parseInt(age.value),
      reservationType: reservationTypeEl.value,
      travelDate: travelDate.value,
      fromStationId: fromStation.value,
      toStationId: toStation.value
    };

    if (!body.passengerName || !body.age || !body.reservationType ||
        !body.travelDate || !body.fromStationId || !body.toStationId) {
      alert("Please fill all fields");
      return;
    }

    const res = await fetch("/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!data.success) {
      alert(data.message || "Booking failed");
      return;
    }

    alert("✅ Booking successful!");
  });
  const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("user");
    window.location.href = "index.html";
  });
}


  // ================= VIEW MY BOOKINGS (FIXED) =================
  async function loadUserBookings() {
    const res = await fetch(`/my-bookings?userId=${user.id}`);
    const data = await res.json();

    bookingCount.textContent = `Total bookings: ${data.count}`;
    bookingList.innerHTML = "";

    if (data.bookings.length === 0) {
      bookingList.innerHTML = "<p>No bookings yet</p>";
      return;
    }

    data.bookings.forEach((b, i) => {
      bookingList.innerHTML += `
        <p>
          <b>${i + 1}. ${b.passenger_name}</b><br>
          ${b.from_station} → ${b.to_station}<br>
          Class: ${b.class} | Fare: ₹${b.amount}<br>
          Date: ${new Date(b.travel_date).toLocaleDateString()}
        </p><hr>
      `;
    });
  }

  viewBtn.addEventListener("click", () => {
    if (bookingsBox.style.display === "block") {
      bookingsBox.style.display = "none";
    } else {
      bookingsBox.style.display = "block";
      loadUserBookings();
    }
  });

});
