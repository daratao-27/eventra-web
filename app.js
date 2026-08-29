// ---------- helpers ----------
const $app = document.getElementById("app");

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function money(n) {
  const num = Number(n);
  return isNaN(num) ? "$0.00" : `$${num.toFixed(2)}`;
}
function fmtDate(d) {
  if (!d) return "TBC";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function toast(msg, kind = "info") {
  const host = document.getElementById("toastHost");
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3800);
}

// Themed replacement for window.confirm() — returns a Promise<boolean>, resolved
// true on "confirm" / false on "cancel" or backdrop click / Escape.
function confirmModal(message, { title = "Are you sure?", confirmLabel = "Confirm", danger = true } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="modalTitle">
        <h3 id="modalTitle">${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="form-actions modal-actions">
          <button class="btn ${danger ? "btn-ghost danger" : "btn-primary"}" data-modal-confirm>${escapeHtml(confirmLabel)}</button>
          <button class="btn btn-ghost" data-modal-cancel>Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    const close = (result) => {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 200);
      document.removeEventListener("keydown", onKeydown);
      resolve(result);
    };
    const onKeydown = (e) => { if (e.key === "Escape") close(false); };

    overlay.querySelector("[data-modal-confirm]").addEventListener("click", () => close(true));
    overlay.querySelector("[data-modal-cancel]").addEventListener("click", () => close(false));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
    document.addEventListener("keydown", onKeydown);
    overlay.querySelector("[data-modal-cancel]").focus();
  });
}

function requireAuth() {
  if (!Auth.isLoggedIn()) { location.hash = "#/login"; return false; }
  return true;
}
function requireOrganizer() {
  if (!requireAuth()) return false;
  if (!Auth.isOrganizer()) { toast("Only organizers can do that.", "error"); location.hash = "#/events"; return false; }
  return true;
}
function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

// ---------- password policy (Cognito: min 8, 1 number, 1 uppercase, 1 lowercase) ----------
const PASSWORD_RULES = [
  { key: "length", label: "At least 8 characters", test: (v) => v.length >= 8 },
  { key: "upper", label: "At least 1 uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { key: "lower", label: "At least 1 lowercase letter", test: (v) => /[a-z]/.test(v) },
  { key: "number", label: "At least 1 number", test: (v) => /[0-9]/.test(v) }
];
function passwordChecklistHtml(id) {
  return "<ul class=\"password-checklist\" id=\"" + id + "\">"
    + PASSWORD_RULES.map(r => "<li data-rule=\"" + r.key + "\" class=\"pending\">" + escapeHtml(r.label) + "</li>").join("")
    + "</ul>";
}
function passwordIsValid(value) {
  return PASSWORD_RULES.every(r => r.test(value));
}
function wirePasswordChecklist(inputEl, listEl) {
  const update = () => {
    const value = inputEl.value;
    PASSWORD_RULES.forEach(r => {
      const li = listEl.querySelector("[data-rule=\"" + r.key + "\"]");
      if (!li) return;
      const ok = r.test(value);
      li.classList.toggle("met", ok);
      li.classList.toggle("pending", !ok);
    });
  };
  inputEl.addEventListener("input", update);
  update();
}

// ---------- email validation ----------
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function emailIsValid(value) {
  return EMAIL_REGEX.test(String(value || "").trim());
}
// Wires an email <input> to a small inline hint element, shown only once the user has typed something invalid.
function wireEmailValidation(inputEl, hintEl) {
  const update = () => {
    const value = inputEl.value.trim();
    const invalid = value.length > 0 && !emailIsValid(value);
    hintEl.hidden = !invalid;
    inputEl.classList.toggle("input-invalid", invalid);
  };
  inputEl.addEventListener("input", update);
  inputEl.addEventListener("blur", update);
  update();
}

// ---------- nav chrome ----------
function refreshChrome() {
  const loggedIn = Auth.isLoggedIn();
  const organizer = Auth.isOrganizer();
  qsa(".auth-only").forEach(el => el.style.display = loggedIn ? "" : "none");
  qsa(".guest-only").forEach(el => el.style.display = loggedIn ? "none" : "");
  qsa(".organizer-only").forEach(el => el.style.display = (loggedIn && organizer) ? "" : "none");
  qsa(".attendee-only").forEach(el => el.style.display = (loggedIn && !organizer) ? "" : "none");
  const chip = document.getElementById("userChip");
  if (loggedIn) {
    const u = Auth.getUser();
    chip.textContent = `${u.name} · ${u.role}`;
  }
  qsa(".main-nav a").forEach(a => {
    a.classList.toggle("active", location.hash.startsWith(`#/${a.dataset.route}`));
  });
}
document.getElementById("logoutBtn").addEventListener("click", () => {
  Auth.clearSession();
  toast("Logged out.");
  if (location.hash === "#/events" || location.hash === "" || location.hash === "#/") {
    render();
  } else {
    location.hash = "#/events";
  }
});
document.getElementById("hamburger").addEventListener("click", () => {
  document.getElementById("mainNav").classList.toggle("open");
});

// ---------- router ----------
const routes = [];
function route(pattern, handler) { routes.push({ pattern, handler }); }
function matchRoute(hash) {
  const raw = hash.replace(/^#/, "") || "/events";
  const path = raw.split("?")[0];
  for (const r of routes) {
    const paramNames = [];
    const regex = new RegExp("^" + r.pattern.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name); return "([^/]+)";
    }) + "$");
    const m = path.match(regex);
    if (m) {
      const params = {};
      paramNames.forEach((n, i) => params[n] = decodeURIComponent(m[i + 1]));
      return { handler: r.handler, params };
    }
  }
  return null;
}
async function render() {
  document.getElementById("mainNav").classList.remove("open");
  const match = matchRoute(location.hash);
  refreshChrome();
  window.scrollTo(0, 0);
  if (!match) { $app.innerHTML = notFoundView(); return; }
  $app.innerHTML = `<div class="loading-shell"><div class="spinner"></div></div>`;
  try {
    await match.handler(match.params);
  } catch (err) {
    $app.innerHTML = errorView(err.message || "Something went wrong.");
  }
  refreshChrome();
}
window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);

function notFoundView() {
  return `<div class="empty-state"><h2>Page not found</h2><p>That ticket doesn't exist. <a href="#/events">Back to events</a></p></div>`;
}
function errorView(msg) {
  return `<div class="empty-state"><h2>Couldn't load this</h2><p>${escapeHtml(msg)}</p></div>`;
}

// ============================================================
// EVENTS: list / search
// ============================================================
route("/events", async () => {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const keyword = params.get("keyword") || "";
  const category = params.get("category") || "";
  const date = params.get("date") || "";

  $app.innerHTML = `
    <section class="hero">
      <p class="eyebrow">EVENTRA · ADMIT ONE</p>
      <h1>Find something worth<br>circling on the calendar.</h1>
      <p class="hero-sub">Browse published events, book a ticket, and leave a review after the encore.</p>
    </section>
    <section class="search-bar">
      <form id="searchForm">
        <input type="text" name="keyword" placeholder="Search events…" value="${escapeHtml(keyword)}">
        <input type="text" name="category" placeholder="Category" value="${escapeHtml(category)}">
        <input type="date" name="date" value="${escapeHtml(date)}">
        <button class="btn btn-primary" type="submit">Search</button>
      </form>
      ${Auth.isOrganizer() ? `<a href="#/events/new" class="btn btn-secondary">+ New event</a>` : ""}
    </section>
    <section id="eventGrid" class="event-grid"><div class="spinner"></div></section>
  `;
  qs("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const p = new URLSearchParams();
    for (const [k, v] of f.entries()) if (v) p.set(k, v);
    location.hash = `#/events?${p.toString()}`;
  });

  const events = await API.events.list({ keyword, category, date });
  const grid = qs("#eventGrid");
  if (!events || !events.length) {
    grid.innerHTML = `<div class="empty-state"><h3>No events match yet</h3><p>Try clearing a filter, or check back soon.</p></div>`;
    return;
  }
  grid.innerHTML = events.map(eventCard).join("");
});

function eventCard(ev) {
  const img = ev.image_url
    ? `<img src="${escapeHtml(ev.image_url)}" alt="${escapeHtml(ev.title)}" class="ticket-img" onerror="this.outerHTML='<div class=&quot;ticket-img ticket-img-placeholder&quot;>${escapeHtml((ev.category || "EV").slice(0,2).toUpperCase())}</div>'">`
    : `<div class="ticket-img ticket-img-placeholder">${escapeHtml((ev.category || "EV").slice(0,2).toUpperCase())}</div>`;
  return `
    <a class="ticket" href="#/events/${ev.event_id}">
      ${img}
      <div class="ticket-body">
        <p class="ticket-category">${escapeHtml(ev.category || "General")}</p>
        <h3 class="ticket-title">${escapeHtml(ev.title)}</h3>
        <p class="ticket-meta">${fmtDate(ev.event_date)} · ${escapeHtml(ev.venue || "Venue TBC")}</p>
      </div>
      <div class="ticket-stub">
        <span class="stub-price">${money(ev.ticket_price)}</span>
        <span class="stub-label">PRICE</span>
      </div>
    </a>
  `;
}

// ============================================================
// EVENT DETAIL
// ============================================================
route("/events/new", async () => { if (!requireOrganizer()) return; await renderEventForm(); });
route("/events/:id/edit", async ({ id }) => {
  if (!requireOrganizer()) return;
  const ev = await API.events.get(id);
  await renderEventForm(ev);
});

async function renderEventForm(existing) {
  const isEdit = !!existing;
  let categories = [];
  try {
    const allEvents = await API.events.list({});
    categories = [...new Set(allEvents.map(e => e.category).filter(Boolean))].sort();
  } catch { /* non-fatal — form still works without suggestions */ }

  $app.innerHTML = `
    <section class="form-page">
      <h1>${isEdit ? "Edit event" : "Create a new event"}</h1>
      <form id="eventForm" class="card-form">
        <label>Title <input name="title" required value="${escapeHtml(existing?.title || "")}"></label>
        <label>Description <textarea name="description" rows="4" required>${escapeHtml(existing?.description || "")}</textarea></label>
        <div class="form-row">
          <label>Category
            <input name="category" list="categoryOptions" required value="${escapeHtml(existing?.category || "")}" placeholder="Pick or type a new one">
            <datalist id="categoryOptions">
              ${categories.map(c => `<option value="${escapeHtml(c)}">`).join("")}
            </datalist>
          </label>
          <label>Venue <input name="venue" required value="${escapeHtml(existing?.venue || "")}"></label>
        </div>
        <div class="form-row">
          <label>Date <input type="date" name="event_date" required value="${existing?.event_date ? String(existing.event_date).slice(0,10) : ""}"></label>
          <label>Capacity <input type="number" min="1" name="capacity" required value="${existing?.capacity ?? ""}"></label>
          <label>Ticket price ($) <input type="number" min="0" step="0.01" name="ticket_price" required value="${existing?.ticket_price ?? ""}"></label>
        </div>
        <label>Status
          <select name="status">
            <option value="draft" ${existing?.status === "draft" ? "selected" : ""}>Draft</option>
            <option value="published" ${(!existing || existing?.status === "published") ? "selected" : ""}>Published</option>
            <option value="cancelled" ${existing?.status === "cancelled" ? "selected" : ""}>Cancelled</option>
          </select>
        </label>
        <label>Event image <input type="file" id="imageInput" accept="image/*"></label>
        ${existing?.image_url ? `<img src="${escapeHtml(existing.image_url)}" class="form-preview">` : ""}
        <div class="form-actions">
          <button class="btn btn-primary" type="submit">${isEdit ? "Save changes" : "Create event"}</button>
          <a class="btn btn-ghost" href="#/events${isEdit ? "/" + existing.event_id : ""}">Cancel</a>
        </div>
      </form>
    </section>
  `;
  qs("#eventForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      title: f.get("title"), description: f.get("description"),
      category: f.get("category"), venue: f.get("venue"),
      event_date: f.get("event_date"), capacity: Number(f.get("capacity")),
      ticket_price: Number(f.get("ticket_price")), status: f.get("status")
    };
    if (!isEdit) body.organizer_id = Auth.getUser().user_id;
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      let eventId = existing?.event_id;
      let createdResponse = null;
      if (isEdit) {
        await API.events.update(eventId, body);
      } else {
        createdResponse = await API.events.create(body);
        eventId = createdResponse?.event_id ?? createdResponse?.id ?? createdResponse?.eventId;
      }

      const file = qs("#imageInput").files[0];
      if (file) {
        if (!eventId) {
          // Creation succeeded but we couldn't determine the new event's ID from the API response,
          // so we can't request a presigned upload URL for it. Tell the user plainly rather than failing silently.
          toast("Event created, but the image couldn't be uploaded automatically — add it from the Edit screen.", "info");
        } else {
          const { uploadUrl, imageUrl } = await API.events.uploadUrl(eventId, file.name, file.type);
          await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
          // The upload-url endpoint only stages the S3 object; the event row's image_url column
          // still needs to be set explicitly via PUT so it persists and shows up on reload.
          await API.events.update(eventId, { ...body, image_url: imageUrl });
        }
      }

      toast(isEdit ? "Event updated." : "Event created.", "success");
      if (eventId) {
        location.hash = `#/events/${eventId}`;
      } else {
        // No usable ID came back from create — fall back to the events list instead of a broken "#/events/undefined" link.
        location.hash = "#/events";
      }
      render();
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false; btn.textContent = isEdit ? "Save changes" : "Create event";
    }
  });
}

route("/events/:id", async ({ id }) => {
  const [ev, reviews] = await Promise.all([
    API.events.get(id),
    API.reviews.byEvent(id).catch(() => [])
  ]);

  // Remaining capacity requires the bookings-by-event endpoint, which is auth-protected —
  // guests simply won't see a live count, only the event's total capacity.
  let remaining = null;
  if (Auth.isLoggedIn()) {
    try {
      const bookings = await API.bookings.byEvent(ev.event_id);
      const bookedQty = (bookings || [])
        .filter(b => b.status === "confirmed")
        .reduce((sum, b) => sum + Number(b.quantity), 0);
      remaining = Math.max(0, Number(ev.capacity) - bookedQty);
    } catch { /* non-fatal — booking form still works, just without a live count shown */ }
  }

  // Reviews only store user_id, not a name — resolve each unique reviewer's name once, in parallel.
  const reviewerNames = {};
  if (reviews?.length) {
    const uniqueUserIds = [...new Set(reviews.map(r => r.user_id))];
    await Promise.all(uniqueUserIds.map(async (uid) => {
      try {
        const user = await API.users.get(uid);
        reviewerNames[uid] = user?.name || "Anonymous";
      } catch {
        reviewerNames[uid] = "Anonymous";
      }
    }));
  }

  const isOwner = Auth.isOrganizer() && Auth.getUser().user_id == ev.organizer_id;
  const isOrganizer = Auth.isOrganizer();
  const avgRating = reviews?.length
    ? (reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length).toFixed(1) : null;

  $app.innerHTML = `
    <button class="back-link" id="backBtn" aria-label="Go back">
      <span class="back-link-arrow">←</span> Back
    </button>
    <section class="event-detail">
      <div class="event-detail-media">
        ${ev.image_url ? `<img src="${escapeHtml(ev.image_url)}" alt="${escapeHtml(ev.title)}" onerror="this.outerHTML='<div class=&quot;ticket-img-placeholder large&quot;>${escapeHtml((ev.category||"EV").slice(0,2).toUpperCase())}</div>'">` : `<div class="ticket-img-placeholder large">${escapeHtml((ev.category||"EV").slice(0,2).toUpperCase())}</div>`}
      </div>
      <div class="event-detail-info">
        <p class="eyebrow">${escapeHtml(ev.category || "General")} · ${escapeHtml(ev.status || "")}</p>
        <h1>${escapeHtml(ev.title)}</h1>
        <p class="event-meta">${fmtDate(ev.event_date)} · ${escapeHtml(ev.venue || "Venue TBC")}</p>
        <p class="event-desc">${escapeHtml(ev.description || "")}</p>
        ${avgRating ? `<p class="event-rating">★ ${avgRating} average (${reviews.length} review${reviews.length===1?"":"s"})</p>` : `<p class="event-rating muted">No reviews yet</p>`}
        <div class="ticket-divider"></div>
        <div class="event-buy">
          <div>
            <span class="stub-price">${money(ev.ticket_price)}</span>
            <span class="stub-label">per ticket · ${ev.capacity ?? "?"} capacity</span>
            ${remaining !== null ? `<span class="capacity-note ${remaining === 0 ? "capacity-sold-out" : remaining <= 10 ? "capacity-low" : ""}">${remaining === 0 ? "Sold out" : `${remaining} ticket${remaining === 1 ? "" : "s"} left`}</span>` : ""}
          </div>
          ${isOwner ? `
            <div class="form-actions">
              <a class="btn btn-secondary" href="#/events/${ev.event_id}/edit">Edit</a>
              <button class="btn btn-ghost danger" id="deleteEventBtn">Delete</button>
            </div>` : isOrganizer ? `
            <p class="muted">Organizer accounts can't book tickets.</p>` : remaining === 0 ? `
            <button class="btn btn-primary" disabled>Sold out</button>` : ev.status !== "published" ? `
            <p class="muted">This event isn't open for booking yet.</p>` : `
            <form id="bookForm" class="inline-form">
              <input type="number" name="quantity" min="1" max="${remaining ?? ""}" value="1" required>
              <button class="btn btn-primary" type="submit">Book ticket</button>
            </form>`}
        </div>
      </div>
    </section>

    <section class="reviews-section">
      <h2>Reviews</h2>
      <div id="reviewList" class="review-list">
        ${reviews?.length ? reviews.map(r => reviewItem(r, Auth.getUser()?.user_id, reviewerNames[r.user_id])).join("") : `<p class="muted">Be the first to review this event after attending.</p>`}
      </div>
      ${Auth.isLoggedIn() && !isOrganizer && !reviews?.some(r => String(r.user_id) === String(Auth.getUser().user_id)) ? `
        <form id="reviewForm" class="card-form review-form">
          <h3>Leave a review</h3>
          <label>Rating
            <select name="rating">${[5,4,3,2,1].map(n => `<option value="${n}">${n} ★</option>`).join("")}</select>
          </label>
          <label>Comment <textarea name="comment" rows="3" placeholder="How was it?"></textarea></label>
          <button class="btn btn-secondary" type="submit">Submit review</button>
        </form>` : ""}
    </section>
  `;

  qs("#backBtn")?.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      location.hash = "#/events";
    }
  });

  qs("#bookForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireAuth()) return;
    const qty = Number(new FormData(e.target).get("quantity"));
    if (remaining !== null && qty > remaining) {
      toast(`Only ${remaining} ticket${remaining === 1 ? "" : "s"} left for this event.`, "error");
      return;
    }
    try {
      const res = await API.bookings.create({ user_id: Auth.getUser().user_id, event_id: ev.event_id, quantity: qty });
      toast(`Booked! Total ${money(res.total_price)}.`, "success");
      location.hash = "#/bookings";
    } catch (err) { toast(err.message, "error"); }
  });

  qs("#deleteEventBtn")?.addEventListener("click", async () => {
    const ok = await confirmModal("This permanently deletes the event and can't be undone.", { title: "Delete this event?", confirmLabel: "Delete event" });
    if (!ok) return;
    try { await API.events.remove(ev.event_id); toast("Event deleted.", "success"); location.hash = "#/events"; }
    catch (err) { toast(err.message, "error"); }
  });

  qs("#reviewForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const review_id = `r-${Date.now()}-${Auth.getUser().user_id}`;
    try {
      await API.reviews.create({
        review_id, event_id: String(ev.event_id), user_id: String(Auth.getUser().user_id),
        rating: Number(f.get("rating")), comment: f.get("comment")
      });
      toast("Review posted.", "success");
      location.hash = `#/events/${ev.event_id}`;
      render();
    } catch (err) { toast(err.message, "error"); }
  });

  // Review edit / delete (event delegation on the list, since items re-render)
  qs("#reviewList")?.addEventListener("click", async (e) => {
    const item = e.target.closest(".review-item");
    if (!item) return;
    const reviewId = item.dataset.reviewId;
    const eventId = item.dataset.eventId;

    if (e.target.closest("[data-edit-review]")) {
      qs(".review-item-view", item).hidden = true;
      qs("[data-edit-form]", item).hidden = false;
    }
    if (e.target.closest("[data-cancel-edit]")) {
      qs(".review-item-view", item).hidden = false;
      qs("[data-edit-form]", item).hidden = true;
    }
    if (e.target.closest("[data-delete-review]")) {
      const ok = await confirmModal("This removes your review from this event.", { title: "Delete your review?", confirmLabel: "Delete review" });
      if (!ok) return;
      try {
        await API.reviews.remove(reviewId, { event_id: eventId });
        toast("Review deleted.", "success");
        render();
      } catch (err) { toast(err.message, "error"); }
    }
  });
  qs("#reviewList")?.addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-edit-form]");
    if (!form) return;
    e.preventDefault();
    const item = form.closest(".review-item");
    const reviewId = item.dataset.reviewId;
    const eventId = item.dataset.eventId;
    const f = new FormData(form);
    try {
      await API.reviews.update(reviewId, {
        event_id: eventId,
        rating: Number(f.get("rating")),
        comment: f.get("comment")
      });
      toast("Review updated.", "success");
      render();
    } catch (err) { toast(err.message, "error"); }
  });
});

function reviewItem(r, currentUserId, reviewerName) {
  const isMine = currentUserId && String(r.user_id) === String(currentUserId);
  return `<div class="review-item" data-review-id="${escapeHtml(r.review_id)}" data-event-id="${escapeHtml(r.event_id)}">
    <div class="review-item-view">
      <div class="review-item-head">
        <span class="review-stars">${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</span>
        ${isMine ? `
          <span class="review-item-actions">
            <button class="icon-btn" data-edit-review title="Edit your review" aria-label="Edit your review">✎</button>
            <button class="icon-btn icon-btn-danger" data-delete-review title="Delete your review" aria-label="Delete your review">🗑</button>
          </span>` : ""}
      </div>
      <p class="review-author">${escapeHtml(reviewerName || "Anonymous")}${isMine ? " <span class=\"review-author-you\">(you)</span>" : ""}</p>
      <p>${escapeHtml(r.comment || "")}</p>
    </div>
    ${isMine ? `
      <form class="card-form review-edit-form" data-edit-form hidden>
        <label>Rating
          <select name="rating">${[5,4,3,2,1].map(n => `<option value="${n}" ${n===r.rating?"selected":""}>${n} ★</option>`).join("")}</select>
        </label>
        <label>Comment <textarea name="comment" rows="3">${escapeHtml(r.comment || "")}</textarea></label>
        <div class="form-actions">
          <button class="btn btn-secondary" type="submit">Save changes</button>
          <button class="btn btn-ghost" type="button" data-cancel-edit>Cancel</button>
        </div>
      </form>` : ""}
  </div>`;
}

// ============================================================
// AUTH: register / confirm / login / forgot / reset
// ============================================================
route("/register", async () => {
  $app.innerHTML = `
    <section class="form-page narrow">
      <h1>Create your account</h1>
      <form id="registerForm" class="card-form">
        <label>Name <input name="name" required></label>
        <label>Email
          <input type="email" name="email" id="registerEmail" required>
          <span class="field-hint" id="registerEmailHint" hidden>Enter a valid email address, like name@example.com</span>
        </label>
        <label>Password <input type="password" name="password" id="registerPassword" required minlength="8"></label>
        ${passwordChecklistHtml("registerPasswordChecklist")}
        <label>I am an
          <select name="role"><option value="attendee">Attendee</option><option value="organizer">Organizer</option></select>
        </label>
        <button class="btn btn-primary" type="submit">Sign up</button>
      </form>
      <p class="form-footnote">Already have an account? <a href="#/login">Log in</a></p>
    </section>`;
  wirePasswordChecklist(qs("#registerPassword"), qs("#registerPasswordChecklist"));
  wireEmailValidation(qs("#registerEmail"), qs("#registerEmailHint"));
  qs("#registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = Object.fromEntries(f.entries());
    if (!emailIsValid(body.email)) {
      toast("Please enter a valid email address.", "error");
      qs("#registerEmailHint").hidden = false;
      qs("#registerEmail").classList.add("input-invalid");
      return;
    }
    if (!passwordIsValid(body.password)) {
      toast("Your password doesn't meet all the requirements below.", "error");
      qs("#registerPasswordChecklist").classList.add("shake");
      setTimeout(() => qs("#registerPasswordChecklist")?.classList.remove("shake"), 400);
      return;
    }
    try {
      await API.users.register(body);
      toast("Account created — check your email for a confirmation code.", "success");
      location.hash = `#/confirm?email=${encodeURIComponent(body.email)}`;
    } catch (err) { toast(err.message, "error"); }
  });
});

route("/confirm", async () => {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  $app.innerHTML = `
    <section class="form-page narrow">
      <h1>Confirm your email</h1>
      <p class="muted">Enter the code we sent to your inbox.</p>
      <form id="confirmForm" class="card-form">
        <label>Email <input type="email" name="email" required value="${escapeHtml(params.get("email") || "")}"></label>
        <label>Confirmation code <input name="code" required></label>
        <button class="btn btn-primary" type="submit">Confirm account</button>
      </form>
    </section>`;
  qs("#confirmForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      await API.users.confirm(body);
      toast("Account confirmed. You can log in now.", "success");
      location.hash = "#/login";
    } catch (err) { toast(err.message, "error"); }
  });
});

route("/login", async () => {
  $app.innerHTML = `
    <section class="form-page narrow">
      <h1>Log in</h1>
      <form id="loginForm" class="card-form">
        <label>Email <input type="email" name="email" required></label>
        <label>Password <input type="password" name="password" required></label>
        <button class="btn btn-primary" type="submit">Log in</button>
      </form>
      <p class="form-footnote"><a href="#/forgot-password">Forgot password?</a> · New here? <a href="#/register">Sign up</a></p>
    </section>`;
  qs("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      const res = await API.users.login(body);
      Auth.setSession(res.token, res.user);
      toast(`Welcome back, ${res.user.name.split(" ")[0]}.`, "success");
      location.hash = "#/events";
    } catch (err) { toast(err.message, "error"); }
  });
});

route("/forgot-password", async () => {
  $app.innerHTML = `
    <section class="form-page narrow">
      <h1>Reset your password</h1>
      <form id="forgotForm" class="card-form">
        <label>Email <input type="email" name="email" required></label>
        <button class="btn btn-primary" type="submit">Send reset code</button>
      </form>
    </section>`;
  qs("#forgotForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      await API.users.forgotPassword(body);
      toast("Reset code sent.", "success");
      location.hash = `#/reset-password?email=${encodeURIComponent(body.email)}`;
    } catch (err) { toast(err.message, "error"); }
  });
});

route("/reset-password", async () => {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  $app.innerHTML = `
    <section class="form-page narrow">
      <h1>Enter new password</h1>
      <form id="resetForm" class="card-form">
        <label>Email <input type="email" name="email" required value="${escapeHtml(params.get("email") || "")}"></label>
        <label>Code <input name="code" required></label>
        <label>New password <input type="password" name="newPassword" id="resetPassword" required minlength="8"></label>
        ${passwordChecklistHtml("resetPasswordChecklist")}
        <button class="btn btn-primary" type="submit">Reset password</button>
      </form>
    </section>`;
  wirePasswordChecklist(qs("#resetPassword"), qs("#resetPasswordChecklist"));
  qs("#resetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    if (!passwordIsValid(body.newPassword)) {
      toast("Your password doesn't meet all the requirements below.", "error");
      qs("#resetPasswordChecklist").classList.add("shake");
      setTimeout(() => qs("#resetPasswordChecklist")?.classList.remove("shake"), 400);
      return;
    }
    try {
      await API.users.resetPassword(body);
      toast("Password reset. Please log in.", "success");
      location.hash = "#/login";
    } catch (err) { toast(err.message, "error"); }
  });
});

// ============================================================
// PROFILE
// ============================================================
route("/profile", async () => {
  if (!requireAuth()) return;
  const u = Auth.getUser();
  $app.innerHTML = `
    <section class="form-page narrow">
      <h1>Your profile</h1>
      <form id="profileForm" class="card-form">
        <label>Name <input name="name" required value="${escapeHtml(u.name)}"></label>
        <label>Email
          <input type="email" name="email" id="profileEmail" required value="${escapeHtml(u.email)}">
          <span class="field-hint" id="profileEmailHint" hidden>Enter a valid email address, like name@example.com</span>
        </label>
        <button class="btn btn-primary" type="submit">Save changes</button>
      </form>
      <button id="deleteAccountBtn" class="btn btn-ghost danger" style="margin-top:24px;">Delete my account</button>
    </section>`;
  wireEmailValidation(qs("#profileEmail"), qs("#profileEmailHint"));
  qs("#profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    if (!emailIsValid(body.email)) {
      toast("Please enter a valid email address.", "error");
      qs("#profileEmailHint").hidden = false;
      qs("#profileEmail").classList.add("input-invalid");
      return;
    }
    try {
      await API.users.update(u.user_id, body);
      Auth.setSession(Auth.getToken(), { ...u, ...body });
      toast("Profile updated.", "success");
      render();
    } catch (err) { toast(err.message, "error"); }
  });
  qs("#deleteAccountBtn").addEventListener("click", async () => {
    const ok = await confirmModal("This permanently deletes your account and can't be undone.", { title: "Delete your account?", confirmLabel: "Delete account" });
    if (!ok) return;
    try { await API.users.remove(u.user_id); Auth.clearSession(); toast("Account deleted.", "success"); location.hash = "#/events"; }
    catch (err) { toast(err.message, "error"); }
  });
});

// ============================================================
// MY BOOKINGS
// ============================================================
route("/bookings", async () => {
  if (!requireAuth()) return;
  const bookings = await API.bookings.byUser(Auth.getUser().user_id);
  $app.innerHTML = `
    <section class="page-header"><h1>My tickets</h1></section>
    <section id="bookingList" class="booking-list">
      ${bookings?.length ? "" : `<div class="empty-state"><h3>No tickets yet</h3><p>Once you book an event, it'll show up here.</p></div>`}
    </section>`;
  const list = qs("#bookingList");
  if (!bookings?.length) return;

  const withEvents = await Promise.all(bookings.map(async b => {
    try { return { ...b, event: await API.events.get(b.event_id) }; } catch { return { ...b, event: null }; }
  }));
  list.innerHTML = withEvents.map(b => `
    <div class="booking-row">
      <div>
        <h3>${escapeHtml(b.event?.title || `Event #${b.event_id}`)}</h3>
        <p class="muted">${b.event ? fmtDate(b.event.event_date) : ""} · Qty ${b.quantity} · ${money(b.unit_price_at_booking)} each</p>
        <span class="status-badge status-${b.status}">${escapeHtml(b.status)}</span>
      </div>
      <div class="booking-row-right">
        <span class="stub-price">${money(b.total_price ?? (b.quantity * b.unit_price_at_booking))}</span>
        ${b.status !== "cancelled" ? `<button class="btn btn-ghost danger" data-cancel="${b.booking_id}">Cancel</button>` : ""}
      </div>
    </div>
  `).join("");

  qsa("[data-cancel]").forEach(btn => btn.addEventListener("click", async () => {
    const ok = await confirmModal("This ticket will be cancelled and can't be un-done.", { title: "Cancel this booking?", confirmLabel: "Cancel booking" });
    if (!ok) return;
    try { await API.bookings.cancel(btn.dataset.cancel); toast("Booking cancelled.", "success"); render(); }
    catch (err) { toast(err.message, "error"); }
  }));
});

// ============================================================
// MY EVENTS (organizer)
// ============================================================
route("/my-events", async () => {
  if (!requireOrganizer()) return;
  const u = Auth.getUser();
  $app.innerHTML = `
    <section class="page-header">
      <h1>My events</h1>
      <a href="#/events/new" class="btn btn-primary">+ New event</a>
    </section>
    <section id="myEventsList" class="booking-list"><div class="spinner"></div></section>
  `;
  const events = await API.events.list({ organizerId: u.user_id });
  const list = qs("#myEventsList");
  if (!events?.length) {
    list.innerHTML = `<div class="empty-state"><h3>No events yet</h3><p><a href="#/events/new">Create your first event</a> to see it here.</p></div>`;
    return;
  }
  list.innerHTML = events.map(ev => `
    <div class="booking-row">
      <div>
        <h3>${escapeHtml(ev.title)}</h3>
        <p class="muted">${fmtDate(ev.event_date)} · ${escapeHtml(ev.venue || "Venue TBC")} · ${escapeHtml(ev.category || "")}</p>
        <span class="status-badge status-${escapeHtml(ev.status || "draft")}">${escapeHtml(ev.status || "draft")}</span>
      </div>
      <div class="booking-row-right">
        <span class="stub-price">${money(ev.ticket_price)}</span>
        <a class="btn btn-secondary" href="#/events/${ev.event_id}/edit">Edit</a>
        <button class="btn btn-ghost danger" data-delete-event="${ev.event_id}">Delete</button>
      </div>
    </div>
  `).join("");

  qsa("[data-delete-event]").forEach(btn => btn.addEventListener("click", async () => {
    const ok = await confirmModal("This permanently deletes the event and can't be undone.", { title: "Delete this event?", confirmLabel: "Delete event" });
    if (!ok) return;
    try {
      await API.events.remove(btn.dataset.deleteEvent);
      toast("Event deleted.", "success");
      render();
    } catch (err) { toast(err.message, "error"); }
  }));
});

// ============================================================
// ORGANIZER DASHBOARD
// ============================================================
route("/dashboard", async () => {
  if (!requireOrganizer()) return;
  const u = Auth.getUser();
  $app.innerHTML = `<section class="page-header"><h1>Organizer dashboard</h1></section>
    <section id="dashStats" class="dash-grid"><div class="spinner"></div></section>`;
  const rows = await API.events.analyticsForOrganizer(u.user_id);
  const dash = qs("#dashStats");
  if (!rows?.length) {
    dash.innerHTML = `<div class="empty-state"><h3>No events yet</h3><p><a href="#/events/new">Create your first event</a> to see analytics here.</p></div>`;
    return;
  }
  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue || 0), 0);
  const totalBookings = rows.reduce((s, r) => s + Number(r.bookings || 0), 0);
  dash.innerHTML = `
    <div class="stat-card"><span class="stat-value">${money(totalRevenue)}</span><span class="stat-label">Total revenue</span></div>
    <div class="stat-card"><span class="stat-value">${totalBookings}</span><span class="stat-label">Total bookings</span></div>
    <div class="stat-card"><span class="stat-value">${rows.length}</span><span class="stat-label">Events</span></div>
    <table class="dash-table">
      <thead><tr><th>Event</th><th>Bookings</th><th>Revenue</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${escapeHtml(r.title)}</td><td>${r.bookings}</td><td>${money(r.revenue)}</td></tr>`).join("")}</tbody>
    </table>`;
});
