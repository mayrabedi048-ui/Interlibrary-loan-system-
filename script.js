/* =========================================================
   Interlibrary Loan Hub – plain JavaScript, data in localStorage
   ========================================================= */

const ADMIN_USER = "admin";
const ADMIN_PASS = "admin123";

/* ---------- Storage helpers ---------- */
const store = {
  get(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
};

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISO(d);
}
function toISO(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}
const today = () => toISO(new Date());

/* ---------- Seed data (first run only) ---------- */
function seed() {
  if (store.get("ill_seeded", false)) return;

  store.set("ill_libs", [
    "City Central Library",
    "University Library",
    "Riverside Public Library",
    "State Archives Library"
  ]);

  store.set("ill_catalog", [
    { id: 1, title: "Clean Code", author: "Robert C. Martin", isbn: "9780132350884", owned: true,  partners: ["University Library"] },
    { id: 2, title: "Introduction to Algorithms", author: "Thomas H. Cormen", isbn: "9780262046305", owned: false, partners: ["University Library", "City Central Library"] },
    { id: 3, title: "The Pragmatic Programmer", author: "Andrew Hunt", isbn: "9780135957059", owned: false, partners: ["Riverside Public Library"] },
    { id: 4, title: "Discovery of India", author: "Jawaharlal Nehru", isbn: "9780143031031", owned: true,  partners: ["State Archives Library"] },
    { id: 5, title: "Rare Manuscripts of Punjab", author: "Various", isbn: "", owned: false, partners: ["State Archives Library"] }
  ]);

  store.set("ill_requests", [
    {
      id: "ILL-1001", title: "Introduction to Algorithms", author: "Thomas H. Cormen", isbn: "9780262046305",
      preferredLibrary: "University Library", name: "Aman Sharma", memberId: "M-2041",
      email: "aman@example.com", phone: "9876543210", notes: "",
      approval: "Approved", source: "University Library", shipment: "In Transit",
      dueDate: dateOffset(10), returnStatus: "Not Returned", createdAt: dateOffset(-4)
    },
    {
      id: "ILL-1002", title: "The Pragmatic Programmer", author: "Andrew Hunt", isbn: "9780135957059",
      preferredLibrary: "Any", name: "Simran Kaur", memberId: "M-1187",
      email: "simran@example.com", phone: "9812345678", notes: "Need before exams",
      approval: "Pending", source: "", shipment: "Not Shipped",
      dueDate: "", returnStatus: "Not Returned", createdAt: dateOffset(-1)
    },
    {
      id: "ILL-1003", title: "Rare Manuscripts of Punjab", author: "Various", isbn: "",
      preferredLibrary: "State Archives Library", name: "Rohit Verma", memberId: "M-3310",
      email: "rohit@example.com", phone: "9988776655", notes: "",
      approval: "Approved", source: "State Archives Library", shipment: "Delivered",
      dueDate: dateOffset(-3), returnStatus: "Not Returned", createdAt: dateOffset(-20)
    }
  ]);

  store.set("ill_counter", 1003);
  store.set("ill_seeded", true);
}

/* ---------- State ---------- */
let libs, catalog, requests, editingId = null;
function load() {
  libs = store.get("ill_libs", []);
  catalog = store.get("ill_catalog", []);
  requests = store.get("ill_requests", []);
}
const saveLibs = () => store.set("ill_libs", libs);
const saveCatalog = () => store.set("ill_catalog", catalog);
const saveRequests = () => store.set("ill_requests", requests);

/* ---------- Small utilities ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function esc(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function badge(text, extra) {
  const cls = "b-" + String(text).toLowerCase().replace(/[^a-z]/g, "");
  return '<span class="badge ' + cls + " " + (extra || "") + '">' + esc(text) + "</span>";
}
function fmtDate(d) { return d ? d : "—"; }
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2600);
}
function nextId() {
  const n = store.get("ill_counter", 1000) + 1;
  store.set("ill_counter", n);
  return "ILL-" + n;
}
/* A book is overdue when it has a due date in the past and is not yet returned */
function effectiveReturn(r) {
  if (r.returnStatus !== "Returned" && r.dueDate && r.dueDate < today() && r.shipment === "Delivered") {
    return "Overdue";
  }
  return r.returnStatus;
}
function isLoggedIn() { return sessionStorage.getItem("ill_admin") === "1"; }

/* ---------- View navigation ---------- */
function showView(name) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  $("#" + name + "View").classList.add("active");
  window.scrollTo(0, 0);
  if (name === "admin") renderAdmin();
}
function setupTabs(containerSel, prefix) {
  $$(containerSel + " .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(containerSel + " .tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const pane = btn.closest(".container");
      pane.querySelectorAll(".tabpane").forEach((p) => p.classList.remove("active"));
      $("#tab-" + btn.dataset.tab).classList.add("active");
    });
  });
}
function switchTab(containerSel, tab) {
  const btn = document.querySelector(containerSel + ' .tab[data-tab="' + tab + '"]');
  if (btn) btn.click();
}

/* =========================================================
   CUSTOMER SIDE
   ========================================================= */

function fillLibrarySelects() {
  const sel = $("#preferredLibrary");
  sel.innerHTML = '<option value="Any">Any (let the library decide)</option>' +
    libs.map((l) => "<option>" + esc(l) + "</option>").join("");
}

/* ----- Availability search ----- */
function searchBooks() {
  const q = $("#searchInput").value.trim().toLowerCase();
  const box = $("#searchResults");
  if (!q) { box.innerHTML = '<p class="empty">Type something to search.</p>'; return; }

  const found = catalog.filter((b) =>
    b.title.toLowerCase().includes(q) ||
    b.author.toLowerCase().includes(q) ||
    (b.isbn || "").includes(q));

  if (!found.length) {
    box.innerHTML = '<div class="card"><b>No match in our catalog.</b>' +
      '<p class="small">We may still be able to borrow it from a partner library.</p>' +
      '<button class="btn btn-primary btn-sm" data-prefill="' + esc($("#searchInput").value) + '">Request it anyway</button></div>';
    return;
  }

  box.innerHTML = found.map((b) => {
    let status;
    if (b.owned) status = badge("Available", "") + ' <span class="small">in our library – you can borrow it directly</span>';
    else if (b.partners.length) status = badge("Partner", "") + ' <span class="small">Not in our library, available via: ' + esc(b.partners.join(", ")) + "</span>";
    else status = badge("Unavailable", "") + ' <span class="small">No known copies</span>';

    const action = b.owned ? "" :
      '<button class="btn btn-primary btn-sm" data-book="' + b.id + '">Request this book</button>';

    return '<div class="card result"><div><h4>' + esc(b.title) + "</h4>" +
      '<div class="small">' + esc(b.author) + (b.isbn ? " &bull; ISBN " + esc(b.isbn) : "") + "</div>" +
      "<div style='margin-top:.4rem'>" + status + "</div></div>" + action + "</div>";
  }).join("");
}

function prefillRequest(book) {
  const f = $("#requestForm");
  f.title.value = book.title || "";
  f.author.value = book.author || "";
  f.isbn.value = book.isbn || "";
  if (book.partners && book.partners.length) f.preferredLibrary.value = book.partners[0];
  switchTab("#custTabs", "request");
}

/* ----- Submit request ----- */
function submitRequest(e) {
  e.preventDefault();
  const f = e.target;
  const req = {
    id: nextId(),
    title: f.title.value.trim(),
    author: f.author.value.trim(),
    isbn: f.isbn.value.trim(),
    preferredLibrary: f.preferredLibrary.value,
    name: f.name.value.trim(),
    memberId: f.memberId.value.trim(),
    email: f.email.value.trim(),
    phone: f.phone.value.trim(),
    notes: f.notes.value.trim(),
    approval: "Pending",
    source: "",
    shipment: "Not Shipped",
    dueDate: "",
    returnStatus: "Not Returned",
    createdAt: today()
  };
  requests.push(req);
  saveRequests();
  f.reset();
  $("#requestSuccess").innerHTML =
    '<div class="card success"><h3>✅ Request submitted!</h3>' +
    "<p>Your request ID is <b>" + esc(req.id) + "</b>. Save it – you will need it with your email (" +
    esc(req.email) + ') to track the status.</p></div>';
  toast("Request " + req.id + " submitted");
}

/* ----- Track request ----- */
function trackRequest(e) {
  e.preventDefault();
  const id = e.target.reqId.value.trim().toUpperCase();
  const email = e.target.email.value.trim().toLowerCase();
  const r = requests.find((x) => x.id.toUpperCase() === id && x.email.toLowerCase() === email);
  const box = $("#trackResult");

  if (!r) {
    box.innerHTML = '<div class="card"><b>No request found.</b><p class="small">Check the request ID and email address.</p></div>';
    return;
  }
  box.innerHTML = '<div class="card"><h3>' + esc(r.title) + '</h3><div class="small">' + esc(r.author) +
    " &bull; Requested on " + esc(r.createdAt) + "</div>" +
    '<div class="track-grid">' +
    "<div><span>Request ID</span>" + esc(r.id) + "</div>" +
    "<div><span>Requester</span>" + esc(r.name) + " (" + esc(r.memberId) + ")</div>" +
    "<div><span>Approval</span>" + badge(r.approval) + "</div>" +
    "<div><span>Source library</span>" + esc(r.source || "Not assigned yet") + "</div>" +
    "<div><span>Shipment status</span>" + badge(r.shipment) + "</div>" +
    "<div><span>Due date</span>" + fmtDate(r.dueDate) + "</div>" +
    "<div><span>Return status</span>" + badge(effectiveReturn(r)) + "</div>" +
    "</div></div>";
}

/* =========================================================
   MANAGEMENT SIDE
   ========================================================= */

function renderAdmin() {
  load();
  renderStats();
  renderRequests();
  renderCatalog();
  renderLibs();
}

function renderStats() {
  const total = requests.length;
  const pending = requests.filter((r) => r.approval === "Pending").length;
  const transit = requests.filter((r) => r.shipment === "Shipped" || r.shipment === "In Transit").length;
  const overdue = requests.filter((r) => effectiveReturn(r) === "Overdue").length;
  const returned = requests.filter((r) => r.returnStatus === "Returned").length;
  const items = [["Total requests", total], ["Pending approval", pending], ["In shipment", transit], ["Overdue", overdue], ["Returned", returned]];
  $("#stats").innerHTML = items.map((i) => '<div class="stat"><b>' + i[1] + "</b><span>" + i[0] + "</span></div>").join("");
}

function renderRequests() {
  const text = $("#reqFilterText").value.trim().toLowerCase();
  const st = $("#reqFilterStatus").value;
  const rt = $("#reqFilterReturn").value;

  const list = requests.filter((r) => {
    const hay = (r.id + " " + r.title + " " + r.name + " " + r.email).toLowerCase();
    return (!text || hay.includes(text)) &&
           (!st || r.approval === st) &&
           (!rt || effectiveReturn(r) === rt);
  }).slice().reverse();

  $("#reqTable").innerHTML = list.length ? list.map((r) =>
    "<tr><td><b>" + esc(r.id) + '</b><div class="small">' + esc(r.createdAt) + "</div></td>" +
    "<td>" + esc(r.title) + '<div class="small">' + esc(r.author) + "</div></td>" +
    "<td>" + esc(r.name) + '<div class="small">' + esc(r.memberId) + " &bull; " + esc(r.email) + "<br>" + esc(r.phone) + "</div></td>" +
    "<td>" + esc(r.source || "—") + "</td>" +
    "<td>" + badge(r.approval) + "</td>" +
    "<td>" + badge(r.shipment) + "</td>" +
    "<td>" + fmtDate(r.dueDate) + "</td>" +
    "<td>" + badge(effectiveReturn(r)) + "</td>" +
    '<td><button class="btn btn-primary btn-sm" data-manage="' + esc(r.id) + '">Manage</button></td></tr>'
  ).join("") : '<tr><td colspan="9" class="empty">No requests found.</td></tr>';
}

/* ----- Manage request dialog ----- */
function openManage(id) {
  const r = requests.find((x) => x.id === id);
  if (!r) return;
  editingId = id;

  $("#manageTitle").textContent = "Manage " + r.id;
  $("#manageInfo").innerHTML =
    "<b>" + esc(r.title) + "</b> by " + esc(r.author) + (r.isbn ? " (ISBN " + esc(r.isbn) + ")" : "") + "<br>" +
    "Requester: " + esc(r.name) + " (" + esc(r.memberId) + ") &bull; " + esc(r.email) + " &bull; " + esc(r.phone) + "<br>" +
    "Preferred library: " + esc(r.preferredLibrary) + (r.notes ? "<br>Notes: " + esc(r.notes) : "");

  $("#mSource").innerHTML = '<option value="">— Not assigned —</option>' +
    libs.map((l) => "<option" + (l === r.source ? " selected" : "") + ">" + esc(l) + "</option>").join("");
  $("#mApproval").value = r.approval;
  $("#mShipment").value = r.shipment;
  $("#mDue").value = r.dueDate;
  $("#mReturn").value = r.returnStatus;
  syncManageFields();
  $("#manageDialog").showModal();
}

/* Shipment / due date / return only make sense once a request is approved */
function syncManageFields() {
  const approved = $("#mApproval").value === "Approved";
  ["#mSource", "#mShipment", "#mDue", "#mReturn"].forEach((s) => ($(s).disabled = !approved));
  $("#manageHint").textContent = approved
    ? "Tip: when you mark a book Delivered and leave the due date empty, it is set to 14 days from today."
    : "Approve the request to assign a source library and update shipment, due date and return status.";
}

function saveManage() {
  const r = requests.find((x) => x.id === editingId);
  if (!r) return;
  r.approval = $("#mApproval").value;

  if (r.approval === "Approved") {
    r.source = $("#mSource").value;
    r.shipment = $("#mShipment").value;
    r.dueDate = $("#mDue").value;
    r.returnStatus = $("#mReturn").value;
    if (r.shipment === "Delivered" && !r.dueDate) r.dueDate = dateOffset(14);
  } else {
    /* Pending / Rejected: reset the fulfilment fields */
    r.source = "";
    r.shipment = "Not Shipped";
    r.dueDate = "";
    r.returnStatus = "Not Returned";
  }
  saveRequests();
  $("#manageDialog").close();
  renderAdmin();
  toast("Request " + r.id + " updated");
}

function deleteRequest() {
  if (!confirm("Delete request " + editingId + " permanently?")) return;
  requests = requests.filter((x) => x.id !== editingId);
  saveRequests();
  $("#manageDialog").close();
  renderAdmin();
  toast("Request deleted");
}

/* ----- Catalog ----- */
function renderCatalog() {
  $("#catalogTable").innerHTML = catalog.length ? catalog.map((b) =>
    "<tr><td>" + esc(b.title) + "</td><td>" + esc(b.author) + "</td><td>" + esc(b.isbn || "—") + "</td>" +
    "<td>" + (b.owned ? badge("Available") : badge("Unavailable")) + "</td>" +
    "<td>" + esc(b.partners.join(", ") || "—") + "</td>" +
    '<td><button class="btn btn-danger btn-sm" data-delbook="' + b.id + '">Remove</button></td></tr>'
  ).join("") : '<tr><td colspan="6" class="empty">Catalog is empty.</td></tr>';
}
function addBook(e) {
  e.preventDefault();
  const f = e.target;
  catalog.push({
    id: Date.now(),
    title: f.title.value.trim(),
    author: f.author.value.trim(),
    isbn: f.isbn.value.trim(),
    owned: f.owned.value === "yes",
    partners: f.partners.value.split(",").map((s) => s.trim()).filter(Boolean)
  });
  saveCatalog();
  f.reset();
  renderCatalog();
  toast("Book added");
}

/* ----- Partner libraries ----- */
function renderLibs() {
  $("#libTable").innerHTML = libs.length ? libs.map((l, i) =>
    "<tr><td>" + esc(l) + '</td><td><button class="btn btn-danger btn-sm" data-dellib="' + i + '">Remove</button></td></tr>'
  ).join("") : '<tr><td colspan="2" class="empty">No partner libraries yet.</td></tr>';
}
function addLib(e) {
  e.preventDefault();
  const name = e.target.lib.value.trim();
  if (!name) return;
  if (libs.some((l) => l.toLowerCase() === name.toLowerCase())) { toast("Library already exists"); return; }
  libs.push(name);
  saveLibs();
  e.target.reset();
  renderLibs();
  fillLibrarySelects();
  toast("Library added");
}

/* =========================================================
   LOGIN
   ========================================================= */
function updateMgmtButton() {
  $("#mgmtBtn").textContent = isLoggedIn() ? "Dashboard" : "Management Login";
}
function onMgmtClick() {
  if (isLoggedIn()) showView("admin");
  else {
    $("#loginError").textContent = "";
    $("#loginForm").reset();
    $("#loginDialog").showModal();
  }
}
function doLogin(e) {
  e.preventDefault();
  if ($("#loginUser").value.trim() === ADMIN_USER && $("#loginPass").value === ADMIN_PASS) {
    sessionStorage.setItem("ill_admin", "1");
    $("#loginDialog").close();
    updateMgmtButton();
    showView("admin");
    toast("Welcome, admin");
  } else {
    $("#loginError").textContent = "Invalid username or password.";
  }
}
function doLogout() {
  sessionStorage.removeItem("ill_admin");
  updateMgmtButton();
  showView("home");
  toast("Logged out");
}

/* =========================================================
   INIT
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  seed();
  load();
  fillLibrarySelects();
  updateMgmtButton();

  /* navigation */
  $("#borrowBtn").addEventListener("click", () => showView("customer"));
  $("#mgmtBtn").addEventListener("click", onMgmtClick);
  $("#brandLink").addEventListener("click", (e) => { e.preventDefault(); showView("home"); });
  $$("[data-go]").forEach((b) => b.addEventListener("click", () => showView(b.dataset.go)));
  $("#logoutBtn").addEventListener("click", doLogout);
  setupTabs("#custTabs");
  setupTabs("#adminTabs");

  /* customer */
  $("#searchBtn").addEventListener("click", searchBooks);
  $("#searchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") searchBooks(); });
  $("#searchResults").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.book) prefillRequest(catalog.find((x) => String(x.id) === b.dataset.book));
    if (b.dataset.prefill !== undefined) prefillRequest({ title: b.dataset.prefill });
  });
  $("#requestForm").addEventListener("submit", submitRequest);
  $("#trackForm").addEventListener("submit", trackRequest);

  /* login dialog */
  $("#loginForm").addEventListener("submit", doLogin);
  $("#loginCancel").addEventListener("click", () => $("#loginDialog").close());

  /* admin: requests */
  ["#reqFilterText", "#reqFilterStatus", "#reqFilterReturn"].forEach((s) => {
    $(s).addEventListener("input", renderRequests);
  });
  $("#reqTable").addEventListener("click", (e) => {
    const b = e.target.closest("[data-manage]");
    if (b) openManage(b.dataset.manage);
  });
  $("#mApproval").addEventListener("change", syncManageFields);
  $("#manageForm").addEventListener("submit", (e) => { e.preventDefault(); saveManage(); });
  $("#mCancel").addEventListener("click", () => $("#manageDialog").close());
  $("#mDelete").addEventListener("click", deleteRequest);

  /* admin: catalog + libraries */
  $("#catalogForm").addEventListener("submit", addBook);
  $("#catalogTable").addEventListener("click", (e) => {
    const b = e.target.closest("[data-delbook]");
    if (!b) return;
    catalog = catalog.filter((x) => String(x.id) !== b.dataset.delbook);
    saveCatalog();
    renderCatalog();
  });
  $("#libForm").addEventListener("submit", addLib);
  $("#libTable").addEventListener("click", (e) => {
    const b = e.target.closest("[data-dellib]");
    if (!b) return;
    libs.splice(Number(b.dataset.dellib), 1);
    saveLibs();
    renderLibs();
    fillLibrarySelects();
  });
});
