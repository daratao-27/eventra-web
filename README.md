# Eventra — Cloud-Based Event Booking Platform

Eventra is a full-stack event booking platform built on AWS, developed as a three-part project: microservices architecture and database design (Part 1), a serverless microservices backend (Part 2) and a static frontend web application (Part 3). It supports event discovery, ticket booking, reviews, and organiser analytics, with authentication handled entirely through Amazon Cognito.

---

## Overview

Eventra lets attendees browse and search published events, book tickets, and leave reviews, while organisers can create, edit, and manage their own events and view booking analytics on a dashboard. The entire stack is serverless — no servers to provision or manage — built on AWS Lambda, API Gateway, RDS, DynamoDB, S3, and Cognito, with the frontend hosted on AWS Amplify.

---

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌──────────────────────┐
│   Browser   │─────▶│ AWS Amplify  │      │   API Gateway (REST) │
│ (index.html,│      │  (hosting)   │      │   stage: prod         │
│  app.js)    │      └──────────────┘      └──────────┬────────────┘
└──────┬──────┘                                        │
       │ fetch() calls                                 │
       └────────────────────────────────────────────────┘
                                                         │
              ┌──────────────┬──────────────┬───────────┴─────┬──────────────┐
              ▼              ▼              ▼                 ▼              
      ┌───────────────┐┌──────────────┐┌───────────────┐┌───────────────┐
      │ UserService    ││ EventService ││ BookingService││ ReviewService │
      │   (Lambda)     ││   (Lambda)   ││   (Lambda)    ││   (Lambda)    │
      └───────┬────────┘└──────┬───────┘└───────┬───────┘└───────┬───────┘
              │                │                │                │
              ▼                ▼                ▼                ▼
      ┌───────────────┐┌──────────────┐┌───────────────┐┌───────────────┐
      │ Cognito +      ││ RDS MySQL +  ││  RDS MySQL     ││  DynamoDB     │
      │ RDS MySQL      ││  S3 (images) ││  (eventra_db)  ││  (reviews)    │
      └───────────────┘└──────────────┘└───────────────┘└───────────────┘
```

Four independent Lambda functions, one per domain, sit behind a single API Gateway REST API. Each service owns its own data access — three talk to a shared RDS MySQL schema (`eventra_db`), while reviews live in DynamoDB for fast event-scoped lookups.

---

## Tech stack

**Frontend**
- Vanilla HTML/CSS/JavaScript — no framework, no build step
- Hash-based client-side router (SPA)
- Hosted on AWS Amplify (Git-connected, auto-deploy on push)

**Backend**
- AWS Lambda (Node.js) — 4 microservices: `UserService`, `EventService`, `BookingService`, `ReviewService`
- Amazon API Gateway (REST API) — routes all `/api/*` requests to the appropriate Lambda
- Amazon RDS (MySQL) — relational data: users, events, categories, venues, bookings
- Amazon DynamoDB — reviews (`event_id` partition key, `review_id` sort key, with a `review_id-index` GSI)
- Amazon S3 — event image storage, uploaded via presigned URLs
- Amazon Cognito — user authentication, password policy, email confirmation, password reset

---

## Features

**Attendees**
- Register, confirm email, log in, reset forgotten password
- Browse and search published events by keyword, category, and date
- View event details, ratings, and reviews
- Book tickets (with live remaining-capacity display and sold-out handling)
- View and cancel their own bookings ("My tickets")
- Leave, edit, and delete their own review per event

**Organizers**
- Create, edit, and delete their own events, including draft/published/cancelled status
- Upload an event image (stored in S3, linked via a presigned upload URL)
- View all their events in one place ("My events") with status, price, and quick edit/delete
- View booking and revenue analytics per event on an organiser dashboard
- Cannot book tickets or leave reviews (role-gated)

**Cross-cutting**
- Client-side password/email validation matching Cognito's actual policy
- Server-side ticket capacity enforcement (rejects overbooking, not just a UI limit)
- Themed confirmation modals and toast notifications throughout (no native browser dialogs)
- Generic, non-leaking error messages returned to the client; full error detail logged server-side via CloudWatch

---

## Project structure

```
eventra-web/
├── index.html      # App shell, navigation, footer
├── styles.css       # Full visual design system (ticket-stub theme)
├── config.js         # API Gateway base URL
├── api.js            # One function per backend endpoint + auth/session helpers
├── app.js             # Router and all page views/logic
└── README.md           # Deployment instructions
```

---

## API reference

All endpoints are served from a single API Gateway REST API (`prod` stage).

| Service | Method | Route | Description |
|---|---|---|---|
| UserService | POST | `/api/users/register` | Create account (Cognito + RDS) |
| UserService | POST | `/api/users/confirm` | Confirm email with code |
| UserService | POST | `/api/users/login` | Authenticate, returns JWT + profile |
| UserService | POST | `/api/users/forgot-password` | Send password reset code |
| UserService | POST | `/api/users/reset-password` | Complete password reset |
| UserService | GET/PUT/DELETE | `/api/users/{id}` | Read, update, or delete a user |
| EventService | GET | `/api/events` | List published events (search/filter) |
| EventService | POST/PUT/DELETE | `/api/events/{id}` | Create, update, or delete an event |
| EventService | GET | `/api/events/{id}/upload-url` | Get a presigned S3 upload URL |
| EventService | GET | `/api/analytics/organizer/{organizerId}` | Bookings/revenue per event |
| BookingService | POST | `/api/bookings` | Book tickets (capacity-checked) |
| BookingService | GET | `/api/bookings/user/{userId}` | A user's bookings |
| BookingService | DELETE | `/api/bookings/{id}` | Cancel a booking |
| ReviewService | POST/PUT/DELETE | `/api/reviews/{id}` | Create, update, delete a review |
| ReviewService | GET | `/api/reviews/event/{eventId}` | Reviews for an event |

---

## Author

Built as an Information Technology coursework project — cloud application development on AWS (Part 1: microservices architecture and database design, Part 2: serverless microservices backend, Part 3: cloud-hosted frontend).
