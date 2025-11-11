/**
 * owner.js
 * واجهة صاحب الملعب - إدارة الملاعب والحجوزات والساعات
 */

document.addEventListener("DOMContentLoaded", initOwnerPanel);

async function initOwnerPanel() {
  await verifyOwnerAccess();
  await loadOwnerStadiums();
  await loadOwnerBookings();
}

// ======================
// 🔐 التحقق من الوصول
// ======================
async function verifyOwnerAccess() {
  try {
    const res = await fetch("/api/me", { credentials: "include" });
    if (!res.ok) throw new Error("Unauthorized");
    const user = await res.json();
    if (user.role !== "owner") window.location.href = "/admin.html";
  } catch (e) {
    console.error(e);
    window.location.href = "/login.html";
  }
}

// ======================
// ⚽ جلب ملاعب المستخدم
// ======================
async function loadOwnerStadiums() {
  try {
    const res = await fetch("/api/owner/stadiums", { credentials: "include" });
    if (!res.ok) throw new Error("فشل في تحميل الملاعب");
    const stadiums = await res.json();

    const ctr = document.getElementById("stadiumsContainer");
    ctr.innerHTML = "";

    stadiums.forEach((s) => {
      const card = document.createElement("div");
      card.className = "col-md-4";
      card.innerHTML = `
        <div class="manager-pitch-card">
          <h5>${escapeHtml(s.name)}</h5>
          <small>${escapeHtml(s.location || "")}</small>
          <div class="mt-3">
            <button class="btn btn-sm btn-primary" onclick="loadTimeSlots(${s.id})">عرض الساعات</button>
            <button class="btn btn-sm btn-outline-secondary" onclick="loadBookings(${s.id})">الحجوزات</button>
          </div>
        </div>
      `;
      ctr.appendChild(card);
    });
  } catch (e) {
    console.error(e);
    showError("فشل تحميل الملاعب");
  }
}

// ======================
// 🕒 الساعات
// ======================
async function loadTimeSlots(stadiumId) {
  try {
    const res = await fetch(`/api/owner/time-slots/${stadiumId}`, { credentials: "include" });
    if (!res.ok) throw new Error("فشل تحميل الساعات");
    const slots = await res.json();

    const container = document.getElementById("timeSlotsContainer");
    container.innerHTML = "";

    slots.forEach((s) => {
      const div = document.createElement("div");
      div.className = "time-slot " + s.status;
      div.innerHTML = `
        <div>${escapeHtml(s.date)} ${escapeHtml(s.start_time)} - ${escapeHtml(s.end_time)}</div>
        <div class="small text-muted">${s.price} ج.م</div>
      `;

      if (s.status === "pending") {
        const btns = document.createElement("div");
        btns.className = "mt-2";
        btns.innerHTML = `
          <button class="btn btn-sm btn-success" onclick="confirmBookingBySlot(${s.id})">تأكيد</button>
          <button class="btn btn-sm btn-danger" onclick="cancelBookingBySlot(${s.id})">إلغاء</button>
        `;
        div.appendChild(btns);
      }
      container.appendChild(div);
    });
  } catch (e) {
    console.error(e);
    showError("فشل تحميل الساعات");
  }
}

// ======================
// 📋 الحجوزات
// ======================
async function loadOwnerBookings() {
  try {
    const res = await fetch("/api/owner/bookings", { credentials: "include" });
    if (!res.ok) throw new Error("فشل تحميل الحجوزات");
    const bookings = await res.json();

    const tbody = document.getElementById("bookingsTableBody");
    tbody.innerHTML = "";

    bookings.forEach((b, i) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${i + 1}</td>
        <td>${escapeHtml(b.customer_name)}</td>
        <td>${escapeHtml(b.pitch_name)}</td>
        <td>${escapeHtml(b.date)}</td>
        <td>${escapeHtml(b.time)}</td>
        <td>${b.status === "confirmed" ? "✅ مؤكد" : b.status === "pending" ? "⌛ انتظار" : "❌ ملغي"}</td>
        <td>
          ${
            b.status === "pending" && b.deposit_amount == 0
              ? `<button class="btn btn-sm btn-success" onclick="confirmBooking('${b.id}')">تأكيد</button>
                 <button class="btn btn-sm btn-danger" onclick="cancelBooking('${b.id}')">إلغاء</button>`
              : ""
          }
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (e) {
    console.error(e);
    showError("فشل تحميل الحجوزات");
  }
}

// ======================
// ✅ تأكيد / إلغاء الحجز
// ======================
async function confirmBooking(id) {
  const res = await fetch(`/api/owner/bookings/${id}/confirm`, {
    method: "POST",
    credentials: "include",
  });
  if (res.ok) {
    alert("تم تأكيد الحجز");
    loadOwnerBookings();
  } else showError("فشل في تأكيد الحجز");
}

async function cancelBooking(id) {
  const res = await fetch(`/api/owner/bookings/${id}/cancel`, {
    method: "POST",
    credentials: "include",
  });
  if (res.ok) {
    alert("تم إلغاء الحجز");
    loadOwnerBookings();
  } else showError("فشل في إلغاء الحجز");
}

// ======================
// 🧩 أدوات مساعدة
// ======================
function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function showError(msg) {
  const box = document.getElementById("alertsContainer");
  if (box) box.innerHTML = `<div class="alert alert-danger">${msg}</div>`;
}
