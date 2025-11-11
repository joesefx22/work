/**
 * admin.js
 * واجهة الأدمن الكاملة لإدارة النظام
 * - جلب بيانات الإحصاءات والمستخدمين والملاعب والحجوزات
 * - عرضها ديناميكيًا في الجداول
 * - صلاحيات الأدمن فقط
 */

document.addEventListener("DOMContentLoaded", initAdminPanel);

async function initAdminPanel() {
  await verifyAdminAccess();
  await Promise.all([
    loadDashboardStats(),
    loadAllStadiums(),
    loadRecentBookings(),
    loadUsers(),
    loadPendingManagers(),
    loadSystemLogs()
  ]);
}

// ==========================
// 🔐 التحقق من صلاحيات الأدمن
// ==========================
async function verifyAdminAccess() {
  try {
    const res = await fetch("/api/me", { credentials: "include" });
    if (!res.ok) throw new Error("Unauthorized");
    const user = await res.json();
    if (user.role !== "admin") {
      window.location.href = "/owner.html";
    }
  } catch (e) {
    console.error(e);
    window.location.href = "/login.html";
  }
}

// ==========================
// 📊 إحصائيات عامة
// ==========================
async function loadDashboardStats() {
  try {
    const res = await fetch("/api/admin/dashboard", { credentials: "include" });
    if (!res.ok) throw new Error("فشل في تحميل الإحصائيات");
    const data = await res.json();

    setText("totalUsers", data.totalUsers);
    setText("totalStadiums", data.totalStadiums);
    setText("totalBookings", data.totalBookings);
    setText("totalRevenue", data.totalRevenue + " ج.م");
  } catch (err) {
    console.error(err);
    showError("فشل تحميل بيانات الإحصائيات");
  }
}

// ==========================
// ⚽ الملاعب
// ==========================
async function loadAllStadiums() {
  try {
    const res = await fetch("/api/admin/stadiums", { credentials: "include" });
    if (!res.ok) throw new Error("فشل في تحميل الملاعب");
    const stadiums = await res.json();

    const container = document.getElementById("stadiumsTableBody");
    if (!container) return;
    container.innerHTML = "";

    stadiums.forEach((s, i) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${i + 1}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.location || "-")}</td>
        <td>${escapeHtml(s.area || "-")}</td>
        <td>${escapeHtml(s.price || 0)} ج.م</td>
        <td>${s.is_active ? "✅" : "❌"}</td>
      `;
      container.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    showError("فشل تحميل الملاعب");
  }
}

// ==========================
// 🧾 الحجوزات الأخيرة
// ==========================
async function loadRecentBookings() {
  try {
    const res = await fetch("/api/admin/bookings?limit=10", { credentials: "include" });
    if (!res.ok) throw new Error("فشل تحميل الحجوزات");
    const bookings = await res.json();

    const tbody = document.getElementById("recentBookingsTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (bookings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center">لا توجد حجوزات حديثة</td></tr>`;
      return;
    }

    bookings.forEach((b, i) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${i + 1}</td>
        <td>${escapeHtml(b.customer_name)}</td>
        <td>${escapeHtml(b.pitch_name)}</td>
        <td>${escapeHtml(b.date)}</td>
        <td>${escapeHtml(b.time)}</td>
        <td>${b.status === "confirmed" ? "✅ مؤكد" : b.status === "pending" ? "⌛ انتظار" : "❌ ملغي"}</td>
        <td>${b.amount} ج.م</td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    showError("فشل تحميل بيانات الحجوزات");
  }
}

// ==========================
// 👥 المستخدمون
// ==========================
async function loadUsers() {
  try {
    const res = await fetch("/api/admin/users", { credentials: "include" });
    if (!res.ok) throw new Error("فشل تحميل المستخدمين");
    const users = await res.json();

    const tbody = document.getElementById("usersTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    users.forEach((u, i) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${i + 1}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.phone || "-")}</td>
        <td>${u.role}</td>
        <td>${u.approved ? "✅" : "❌"}</td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    showError("فشل تحميل المستخدمين");
  }
}

// ==========================
// 🧑‍💼 طلبات المديرين
// ==========================
async function loadPendingManagers() {
  try {
    const res = await fetch("/api/admin/pending-managers", { credentials: "include" });
    if (!res.ok) throw new Error("فشل تحميل طلبات المديرين");
    const managers = await res.json();

    const tbody = document.getElementById("pendingManagersTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (managers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center">لا توجد طلبات حالياً</td></tr>`;
      return;
    }

    managers.forEach((m, i) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${i + 1}</td>
        <td>${escapeHtml(m.username)}</td>
        <td>${escapeHtml(m.email)}</td>
        <td>${escapeHtml(m.requested_stadiums || "-")}</td>
        <td>
          <button class="btn btn-success btn-sm" onclick="approveManager('${m.user_id}')">قبول</button>
          <button class="btn btn-danger btn-sm" onclick="rejectManager('${m.user_id}')">رفض</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    showError("فشل تحميل طلبات المديرين");
  }
}

async function approveManager(id) {
  if (!confirm("تأكيد قبول هذا المدير؟")) return;
  const res = await fetch(`/api/admin/pending-managers/${id}/approve`, {
    method: "POST",
    credentials: "include",
  });
  if (res.ok) {
    alert("تم قبول المدير بنجاح");
    loadPendingManagers();
  } else showError("فشل في الموافقة على المدير");
}

async function rejectManager(id) {
  if (!confirm("هل تريد رفض هذا الطلب؟")) return;
  const res = await fetch(`/api/admin/pending-managers/${id}/reject`, {
    method: "POST",
    credentials: "include",
  });
  if (res.ok) {
    alert("تم رفض الطلب");
    loadPendingManagers();
  } else showError("فشل في رفض الطلب");
}

// ==========================
// 🧾 سجل النشاط
// ==========================
async function loadSystemLogs() {
  try {
    const res = await fetch("/api/admin/activity-logs?limit=15", { credentials: "include" });
    if (!res.ok) throw new Error("فشل تحميل السجل");
    const logs = await res.json();

    const tbody = document.getElementById("activityLogsTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    logs.forEach((l, i) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${i + 1}</td>
        <td>${escapeHtml(l.user_name || "-")}</td>
        <td>${escapeHtml(l.action)}</td>
        <td>${escapeHtml(l.description || "-")}</td>
        <td>${escapeHtml(l.created_at)}</td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    showError("فشل تحميل سجل الأنشطة");
  }
}

// ==========================
// 🧩 أدوات مساعدة
// ==========================
function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function showError(msg) {
  const alertBox = document.getElementById("alertsContainer");
  if (alertBox) alertBox.innerHTML = `<div class="alert alert-danger">${msg}</div>`;
}
