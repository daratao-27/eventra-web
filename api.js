// Thin wrapper around every Eventra Part 2 endpoint.
// Every function returns a parsed JSON body, or throws an Error with a readable message.

const Auth = {
  getToken() { return localStorage.getItem("eventra_token"); },
  getUser() {
    const raw = localStorage.getItem("eventra_user");
    return raw ? JSON.parse(raw) : null;
  },
  setSession(token, user) {
    localStorage.setItem("eventra_token", token);
    localStorage.setItem("eventra_user", JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem("eventra_token");
    localStorage.removeItem("eventra_user");
  },
  isLoggedIn() { return !!this.getToken(); },
  isOrganizer() { const u = this.getUser(); return u && u.role === "organizer"; }
};

async function request(path, { method = "GET", body, auth = false, query } = {}) {
  let url = `${CONFIG.API_BASE_URL}${path}`;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }

  const headers = { "Content-Type": "application/json" };
  if (auth && Auth.getToken()) headers["Authorization"] = `Bearer ${Auth.getToken()}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (networkErr) {
    throw new Error("Could not reach the Eventra API. Check your connection and try again.");
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

const API = {
  users: {
    register: (body) => request("/api/users/register", { method: "POST", body }),
    confirm: (body) => request("/api/users/confirm", { method: "POST", body }),
    login: (body) => request("/api/users/login", { method: "POST", body }),
    forgotPassword: (body) => request("/api/users/forgot-password", { method: "POST", body }),
    resetPassword: (body) => request("/api/users/reset-password", { method: "POST", body }),
    list: (name) => request("/api/users", { query: { name } }),
    get: (id) => request(`/api/users/${id}`),
    update: (id, body) => request(`/api/users/${id}`, { method: "PUT", body, auth: true }),
    remove: (id) => request(`/api/users/${id}`, { method: "DELETE", auth: true })
  },
  events: {
    create: (body) => request("/api/events", { method: "POST", body, auth: true }),
    list: (query) => request("/api/events", { query, auth: true }),
    get: (id) => request(`/api/events/${id}`),
    update: (id, body) => request(`/api/events/${id}`, { method: "PUT", body, auth: true }),
    remove: (id) => request(`/api/events/${id}`, { method: "DELETE", auth: true }),
    uploadUrl: (id, filename, contentType) =>
      request(`/api/events/${id}/upload-url`, { query: { filename, contentType }, auth: true }),
    analyticsForEvent: (id) => request(`/api/analytics/events/${id}`, { auth: true }),
    analyticsForOrganizer: (organizerId) => request(`/api/analytics/organizer/${organizerId}`, { auth: true })
  },
  bookings: {
    create: (body) => request("/api/bookings", { method: "POST", body, auth: true }),
    list: () => request("/api/bookings", { auth: true }),
    get: (id) => request(`/api/bookings/${id}`, { auth: true }),
    byUser: (userId) => request(`/api/bookings/user/${userId}`, { auth: true }),
    byEvent: (eventId) => request(`/api/bookings/event/${eventId}`, { auth: true }),
    cancel: (id) => request(`/api/bookings/${id}`, { method: "DELETE", auth: true })
  },
  reviews: {
    create: (body) => request("/api/reviews", { method: "POST", body, auth: true }),
    get: (id) => request(`/api/reviews/${id}`),
    byEvent: (eventId) => request(`/api/reviews/event/${eventId}`),
    update: (id, body) => request(`/api/reviews/${id}`, { method: "PUT", body, auth: true }),
    remove: (id, body) => request(`/api/reviews/${id}`, { method: "DELETE", body, auth: true })
  }
};
