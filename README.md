# Eventra — Part 3 Frontend

A single-page web app (vanilla HTML/CSS/JS, no build step) that consumes every
endpoint from Part 2: registration/login/password reset, event browsing/search,
event create/edit/delete with S3 image upload, ticket booking + cancellation,
reviews, and an organizer analytics dashboard.

## Files
- `index.html` — page shell, nav, footer
- `styles.css` — ticket-stub visual design
- `config.js` — **edit this** to point at your API Gateway base URL
- `api.js` — one function per Part 2 endpoint + auth/session helpers
- `app.js` — hash-based router and all page views


## Notes on what's implemented where
| Feature | Endpoints used |
|---|---|
| Register / confirm / login / forgot / reset | `/api/users/register`, `/confirm`, `/login`, `/forgot-password`, `/reset-password` |
| Browse & search events | `GET /api/events` with `keyword`, `category`, `date` |
| Event detail + reviews | `GET /api/events/{id}`, `GET /api/reviews/event/{eventId}` |
| Create/edit/delete event + image upload | `POST/PUT/DELETE /api/events`, `GET /api/events/{id}/upload-url` |
| Book / view / cancel tickets | `POST /api/bookings`, `GET /api/bookings/user/{userId}`, `DELETE /api/bookings/{id}` |
| Post/edit/delete review | `POST/PUT/DELETE /api/reviews` |
| Organizer dashboard | `GET /api/analytics/organizer/{organizerId}` |
| Profile edit / delete account | `PUT/DELETE /api/users/{id}` |
