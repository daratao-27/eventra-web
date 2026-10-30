<div align="center">

<img src="docs/images/logo.png" width="110" alt="Eventra logo"/>

# Eventra

**Find something worth circling on the calendar.**<br/>
Browse events, book tickets, leave reviews and run your own events, all on a serverless AWS stack.

![AWS Lambda](https://img.shields.io/badge/AWS-Lambda-FF9900?logo=awslambda&logoColor=white)
![API Gateway](https://img.shields.io/badge/AWS-API%20Gateway-FF4F8B?logo=amazonapigateway&logoColor=white)
![Cognito](https://img.shields.io/badge/AWS-Cognito-DD344C?logo=amazoncognito&logoColor=white)
![RDS](https://img.shields.io/badge/AWS-RDS%20MySQL-527FFF?logo=amazonrds&logoColor=white)
![DynamoDB](https://img.shields.io/badge/AWS-DynamoDB-4053D6?logo=amazondynamodb&logoColor=white)
![S3](https://img.shields.io/badge/AWS-S3-569A31?logo=amazons3&logoColor=white)
![JavaScript](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E?logo=javascript&logoColor=black)

<br/>

<img src="docs/images/hero.png" width="100%" alt="Eventra screens: events homepage, event details with tickets left, and the organizer's My events page"/>

</div>

<br/>

## Contents

- [Overview](#overview)
- [Features at a glance](#features-at-a-glance)
- [Design](#design)
- [Authentication](#authentication)
- [Browse and search](#browse-and-search)
- [Event details and booking](#event-details-and-booking)
- [Reviews](#reviews)
- [Organizer tools](#organizer-tools)
- [Profile](#profile)
- [Validation and feedback](#validation-and-feedback)
- [Architecture](#architecture)
- [API reference](#api-reference)
- [Getting started](#getting-started)
- [Notes](#notes)

## Overview

Eventra is a cloud event booking platform. **Attendees** can browse and search published events, see how many tickets are left, book and cancel tickets, and leave a star review after the event. **Organizers** get their own space to create, edit and delete events, upload an event image, and watch bookings and revenue on a dashboard.


> [!NOTE]
> Eventra is a student project. Event names, prices and photos are sample data for demonstration, and no real payments take place.



## Features at a glance

| Area | What it does |
|---|---|
| **Authentication** | Sign up with a live password-rule checklist, email confirmation code, log in, log out, forgot and reset password, edit profile, delete account. Cognito and the database are kept in sync |
| **Browse and search** | Published events as ticket-style cards, with keyword, category and date filters |
| **Event details** | Image, description, average star rating, price, capacity and a live **tickets left** count |
| **Booking** | Book tickets with quantity limits, view them under **My tickets**, cancel a booking |
| **Reviews** | Star rating and comment, reviewer names shown, one review per person per event, edit and delete your own |
| **Organizer tools** | **My events** with draft, published and cancelled badges, create and edit events, image upload straight to S3, delete events |
| **Dashboard** | Total revenue, total bookings and per-event bookings and revenue |
| **Roles** | Organizers cannot book tickets or post reviews, and attendees never see organizer pages |
| **Feedback** | Inline field validation, toast messages and themed confirmation dialogs instead of browser pop-ups |
| **Backend** | 28 REST endpoints across 4 Lambda services, with a 43-request Postman collection (12 of them error cases) |

## Design

The project started on paper: who uses it, what they do, and what each screen looks like.

<div align="center">
<table>
  <tr>
    <td align="center" valign="top"><img src="docs/images/use-case-diagram.png" width="330" alt="Use case diagram for organizers and attendees"/><br/><sub><b>Use cases</b></sub></td>
    <td align="center" valign="top"><img src="docs/images/user-flow.png" width="460" alt="User flows for attendees, reviews, organizers and profile management"/><br/><sub><b>User flows</b></sub></td>
  </tr>
</table>
</div>

<details>
<summary><b>Low-fidelity prototypes</b></summary>

<br/>

<div align="center">

<img src="docs/images/lowfi-attendee.png" width="100%" alt="Low-fidelity attendee screens"/><br/><sub><b>Attendee</b></sub>

<br/><br/>

<img src="docs/images/lowfi-organiser.png" width="100%" alt="Low-fidelity organiser screens"/><br/><sub><b>Organizer</b></sub>

<br/><br/>

<img src="docs/images/lowfi-auth.png" width="70%" alt="Low-fidelity register and login screens"/><br/><sub><b>Register and login (both roles)</b></sub>

</div>

</details>

These wireframes were the starting point for the screens. The built app adds its own visual identity: a warm paper background, a navy header with a dashed "ticket perforation" edge, and event cards styled like ticket stubs. Headings use **Fraunces**, body text uses **Inter**, and prices use **JetBrains Mono**.

## Authentication

<div align="center">
<table>
  <tr>
    <td align="center" valign="top" width="320"><img src="docs/images/create-account.png" width="300" alt="Create account form with a live password checklist"/></td>
    <td valign="top">
      <ul>
        <li><b>Sign up</b> with name, email, password and a role (attendee or organizer).</li>
        <li>A <b>live checklist</b> ticks off each password rule as you type: 8+ characters, an uppercase letter, a lowercase letter and a number. It mirrors the Cognito pool's password policy, so mistakes are caught before a request is sent.</li>
        <li>A <b>confirmation code</b> is emailed by Cognito. After sign-up the app moves straight to the confirm screen, then to login.</li>
        <li><b>Forgot password</b> sends a reset code and takes you to a new-password screen.</li>
        <li>Email format is checked inline on sign-up and on the profile form.</li>
      </ul>
    </td>
  </tr>
</table>
</div>

```mermaid
sequenceDiagram
    actor User
    participant App as Browser app
    participant US as UserService
    participant CG as Cognito
    participant DB as RDS (users)
    User->>App: Sign up (name, email, password, role)
    App->>US: POST /api/users/register
    US->>CG: SignUp
    US->>DB: INSERT name, email, role
    US-->>App: 201, check your email
    User->>App: Enter confirmation code
    App->>US: POST /api/users/confirm
    US->>CG: ConfirmSignUp
    User->>App: Log in
    App->>US: POST /api/users/login
    US->>CG: InitiateAuth (USER_PASSWORD_AUTH)
    CG-->>US: ID token (JWT)
    US->>DB: SELECT profile by email
    US-->>App: token + user profile
```

Passwords are never stored by Eventra. **Cognito is the only place credentials live**, and the `users` table keeps just the profile (name, email, role).

## Browse and search

<div align="center">
<img src="docs/images/homepage.png" width="760" alt="Events homepage with search bar and event cards"/><br/>
<sub><b>Events homepage</b></sub>
</div>

<br/>

<div align="center">
<table>
  <tr>
    <td align="center" valign="top"><img src="docs/images/filter-category.png" width="370" alt="Filtered by the Networking category"/><br/><sub><b>Filter by category</b></sub></td>
    <td align="center" valign="top"><img src="docs/images/filter-keyword.png" width="370" alt="Searched for the keyword music"/><br/><sub><b>Search by keyword</b></sub></td>
  </tr>
  <tr>
    <td align="center" valign="top" colspan="2"><img src="docs/images/filter-date.png" width="370" alt="Filtered by date 15 September 2026"/><br/><sub><b>Filter by date</b></sub></td>
  </tr>
</table>
</div>

- The homepage lists **published** events only. Drafts and cancelled events stay hidden from the public.
- Keyword search matches the title and description. Category and date narrow the list further, and the three can be combined.
- Each card shows the event image, category, title, date, venue and ticket price.

## Event details and booking

<div align="center">
<img src="docs/images/event-details.png" width="760" alt="Event details page with image, rating, price and tickets left"/><br/>
<sub><b>Event details for a signed-in attendee</b></sub>
</div>

- Shows the image, description, **average rating** and the number of reviews.
- **Tickets left** appears next to the price for signed-in users, in teal normally, coral when 10 or fewer remain, and red as **Sold out**, which also replaces the booking form with a disabled button.
- The quantity box is capped at the tickets left, so it cannot be set above what is available.
- A **Back** button returns to wherever you came from.
- **My tickets** lists every booking with its quantity, unit price at the time of booking, total and status, and lets you cancel one. Cancelling asks for confirmation first.
- Organizers see a short note instead of a booking form.

## Reviews

<div align="center">
<table>
  <tr>
    <td align="center" valign="top"><img src="docs/images/post-review.png" width="360" alt="Leave a review form"/><br/><sub><b>Leave a review</b></sub></td>
    <td align="center" valign="top"><img src="docs/images/review-posted.png" width="400" alt="Posted review marked as yours, with edit and delete icons"/><br/><sub><b>Your review, with edit and delete</b></sub></td>
  </tr>
</table>
</div>

- Pick **1 to 5 stars** and write a comment. Reviews are stored in **DynamoDB**.
- Reviews only store a user id, so the app looks up each reviewer's name once per page load and shows it between the stars and the comment. Your own review is tagged **(you)**.
- The pencil and bin icons appear **only on your own review**. Edit swaps the review for an inline form, delete asks for confirmation.
- One review per person per event: once you have reviewed an event, the form is replaced by your review.

## Organizer tools

<div align="center">
<img src="docs/images/my-events.png" width="760" alt="My events page listing the organizer's events with status badges"/><br/>
<sub><b>My events</b></sub>
</div>

<br/>

<div align="center">
<table>
  <tr>
    <td align="center" valign="top"><img src="docs/images/create-event.png" width="400" alt="Create event form"/><br/><sub><b>Create</b></sub></td>
    <td align="center" valign="top"><img src="docs/images/edit-event.png" width="400" alt="Edit event form"/><br/><sub><b>Edit</b></sub></td>
  </tr>
</table>
</div>

<div align="center">
<img src="docs/images/organizer-dashboard.png" width="760" alt="Organizer dashboard with revenue, bookings and per-event table"/><br/>
<sub><b>Organizer dashboard</b></sub>
</div>

- **My events** lists everything the organizer owns, including **draft** and **cancelled** events that the public never sees, with price, status badge, Edit and Delete.
- The **category** field suggests the categories already in use but lets you type a new one. New categories and venues are created automatically by the API.
- **Image upload** goes browser to S3 using a short-lived presigned URL, so no AWS credentials ever reach the browser:

```mermaid
sequenceDiagram
    actor Org as Organizer
    participant App as Browser app
    participant ES as EventService
    participant S3 as Amazon S3
    participant DB as RDS (events)
    Org->>App: Submit event form + image
    App->>ES: POST /api/events
    ES->>DB: INSERT event
    ES-->>App: event_id
    App->>ES: GET /api/events/{id}/upload-url
    ES-->>App: presigned PUT URL + image URL
    App->>S3: PUT image bytes (URL expires in 5 minutes)
    App->>ES: PUT /api/events/{id} with image_url
    ES->>DB: UPDATE image_url
```

- The **dashboard** shows total revenue, total bookings and number of events, plus a table of bookings and revenue per event. Only confirmed bookings count, so cancelling a ticket removes it from the totals.

## Profile

<div align="center">
<img src="docs/images/profile.png" width="420" alt="Profile page with name, email and delete account"/><br/>
<sub><b>Profile</b> (email hidden for privacy)</sub>
</div>

- Update your name and email, with the same inline email check used at sign-up.
- **Delete my account** removes the user from **both** Cognito and the database, so the two stay in step.

## Validation and feedback

<div align="center">
<table>
  <tr>
    <td align="center" valign="top"><img src="docs/images/booking-too-many.png" width="370" alt="Quantity above the tickets left is rejected"/><br/><sub><b>More than the tickets left</b></sub></td>
    <td align="center" valign="top"><img src="docs/images/booking-too-few.png" width="370" alt="Quantity below 1 is rejected"/><br/><sub><b>Less than 1</b></sub></td>
  </tr>
</table>
</div>

- **Inline** messages for fixing a field: the password checklist, the email hint, and quantity limits.
- **Toasts** for what just happened (booked, review posted, something failed).
- **Themed confirmation dialogs** before anything destructive: deleting an event, a review or an account, and cancelling a booking.
- The API replies with clear status codes: `400` for missing or invalid fields, `401` for a wrong email or password, `403` for an unconfirmed account, `404` for something that does not exist, and `409` for conflicts such as a duplicate email, a duplicate review or cancelling a booking twice.
- Login failures are deliberately generic ("Incorrect email or password") so the API does not reveal which emails have accounts.

## Architecture

```mermaid
flowchart LR
    U["Browser<br/>HTML, CSS, vanilla JS"] -->|"loads static files"| AM["AWS Amplify<br/>Hosting"]
    U -->|"fetch /api/*"| AG["Amazon API Gateway<br/>REST API, prod stage"]
    AG --> US["UserService<br/>Lambda"]
    AG --> ES["EventService<br/>Lambda"]
    AG --> BS["BookingService<br/>Lambda"]
    AG --> RS["ReviewService<br/>Lambda"]
    US --> CG["Amazon Cognito<br/>User Pool"]
    US --> DB[("Amazon RDS MySQL<br/>eventra_db")]
    ES --> DB
    BS --> DB
    RS --> DD[("Amazon DynamoDB<br/>reviews")]
    ES -->|"signs upload URL"| S3[("Amazon S3<br/>event images")]
    U -.->|"uploads image directly"| S3
```

Amplify only **delivers** the static files. Everything dynamic goes through API Gateway to one of four Lambda services, each owning one area of the app.

| Service | Responsibility |
|---|---|
| **AWS Amplify** | Hosts the five static files and redeploys on every push to GitHub, with HTTPS included |
| **Amazon API Gateway** | One REST API (`prod` stage) routing `/api/users`, `/api/events`, `/api/bookings` and `/api/reviews` to the right Lambda, with CORS enabled |
| **AWS Lambda** | `UserService`, `EventService`, `BookingService` and `ReviewService` (Node.js), one per domain |
| **Amazon Cognito** | Owns credentials: sign-up, email confirmation, login (issues a JWT), password reset and the password policy |
| **Amazon RDS (MySQL)** | One schema, `eventra_db`: users, categories, venues, events and bookings |
| **Amazon DynamoDB** | Reviews, keyed so that "all reviews for event X" is a single efficient query |
| **Amazon S3** | Event images, uploaded with presigned URLs and read publicly by URL |
| **Amazon CloudWatch** | Lambda logs, used to debug failures |

<details>
<summary><b>Database design</b></summary>

<br/>

**MySQL (`eventra_db`)**

```mermaid
erDiagram
    USERS ||--o{ EVENTS : organizes
    USERS ||--o{ BOOKINGS : makes
    EVENTS ||--o{ BOOKINGS : receives
    CATEGORIES ||--o{ EVENTS : groups
    VENUES ||--o{ EVENTS : hosts

    USERS {
        int user_id PK
        varchar name
        varchar email UK
        enum role "organizer or attendee"
        datetime created_at
    }
    CATEGORIES {
        int category_id PK
        varchar category_name UK
    }
    VENUES {
        int venue_id PK
        varchar venue_name
        varchar address
    }
    EVENTS {
        int event_id PK
        int organizer_id FK
        varchar title
        text description
        int category_id FK
        int venue_id FK
        datetime event_date
        int capacity
        decimal ticket_price
        enum status "draft, published or cancelled"
        varchar image_url
        datetime created_at
    }
    BOOKINGS {
        int booking_id PK
        int user_id FK
        int event_id FK
        int quantity
        decimal unit_price_at_booking
        enum status "confirmed or cancelled"
        datetime booked_at
    }
```

**DynamoDB (`reviews`)**

| Attribute | Role |
|---|---|
| `event_id` (String) | Partition key |
| `review_id` (String) | Sort key. A global secondary index, `review_id-index`, allows looking a single review up by id |
| `user_id`, `rating` (1-5), `comment`, `created_at` | Review data |

A booking's total is never stored. It is calculated as `quantity x unit_price_at_booking`, and the price is copied at booking time so later price changes never rewrite history.

<br/>

| Part 1 design | Final design | Why |
|---|---|---|
| `users.password` column | Removed | Cognito is the only credential store, so the app never handles password hashes |
| `events.category` and `events.venue` as text | Separate `categories` and `venues` tables, linked by id | Removes repeated text and gives clean filters. The API creates new entries automatically |
| `bookings.total_price` | `unit_price_at_booking`, with the total calculated | Keeps a snapshot of the price paid and avoids storing a value that can drift |
| `reviews` in MySQL | `reviews` in DynamoDB, with a partition and sort key | Reviews are always fetched per event, which suits a key-value store |
| Separate databases per service | One `eventra_db` schema shared by the three SQL services | Project requirement |

</details>

<details>
<summary><b>Project structure</b></summary>

```text
.
├── index.html                  # App shell: header, nav, footer
├── styles.css                  # Design system (ticket-stub theme, light surfaces)
├── config.js                   # API Gateway base URL
├── api.js                      # One function per endpoint, plus auth/session helpers
├── app.js                      # Hash router and every page view
├── lambda/                     # Backend source, one folder per Lambda
│   ├── UserService/
│   ├── EventService/
│   ├── BookingService/
│   └── ReviewService/
└── docs/
    ├── DEPLOYMENT.md           # Amplify / S3 + CloudFront / S3 bucket setup
    ├── postman/                # Postman collection for all endpoints
    └── images/                 # Screenshots and diagrams used in this README
```

</details>

### Tech stack

| Purpose | Technology |
|---|---|
| Frontend | HTML, CSS and vanilla JavaScript, with a hash-based router (no framework, no build step) |
| Hosting | AWS Amplify, connected to GitHub |
| API | Amazon API Gateway (REST) |
| Compute | AWS Lambda (Node.js), `mysql2`, AWS SDK v3 |
| Auth | Amazon Cognito (`USER_PASSWORD_AUTH`) |
| Relational data | Amazon RDS for MySQL |
| Reviews | Amazon DynamoDB |
| Images | Amazon S3 with presigned upload URLs |
| API testing | Postman |
| Fonts | Fraunces, Inter and JetBrains Mono (Google Fonts) |

## API reference

Every endpoint is served from one API Gateway base URL (`prod` stage). The Postman collection in [`docs/postman`](docs/postman/CADV_Project_Part_2_postman_collection.json) covers all of them, including **12 error-case requests** such as invalid ids, nonexistent records and cancelling twice.

<details>
<summary><b>UserService</b> (<code>/api/users</code>)</summary>

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/users/register` | Create the Cognito user and the profile row |
| POST | `/api/users/confirm` | Confirm email with the emailed code |
| POST | `/api/users/login` | Returns a JWT and the user profile |
| POST | `/api/users/forgot-password` | Send a reset code |
| POST | `/api/users/reset-password` | Set a new password with the code |
| GET | `/api/users` | List users, optional `?name=` |
| GET | `/api/users/{id}` | One user |
| PUT | `/api/users/{id}` | Update name and email |
| DELETE | `/api/users/{id}` | Delete from Cognito and the database |

</details>

<details>
<summary><b>EventService</b> (<code>/api/events</code>, <code>/api/analytics</code>)</summary>

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/events` | Create an event (category and venue are resolved by name) |
| GET | `/api/events` | Published events, optional `?keyword=`, `?category=`, `?date=` |
| GET | `/api/events/{id}` | One event with category and venue names |
| PUT | `/api/events/{id}` | Update an event, including its `image_url` |
| DELETE | `/api/events/{id}` | Delete an event |
| GET | `/api/events/{id}/upload-url` | Presigned S3 upload URL and the final image URL |
| GET | `/api/analytics/events/{eventId}` | Total bookings and revenue for one event |
| GET | `/api/analytics/organizer/{organizerId}` | Bookings and revenue per event for an organizer |

</details>

<details>
<summary><b>BookingService</b> (<code>/api/bookings</code>)</summary>

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/bookings` | Book tickets. The price is read from the event and stored as `unit_price_at_booking` |
| GET | `/api/bookings` | All bookings |
| GET | `/api/bookings/{id}` | One booking |
| GET | `/api/bookings/user/{userId}` | A user's bookings |
| GET | `/api/bookings/event/{eventId}` | Bookings for an event |
| DELETE | `/api/bookings/{id}` | Cancel (sets status to `cancelled`, `409` if already cancelled) |

</details>

<details>
<summary><b>ReviewService</b> (<code>/api/reviews</code>)</summary>

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/reviews` | Post a review. Rating must be 1 to 5, and `409` if the user already reviewed the event |
| GET | `/api/reviews/{id}` | One review, found through the `review_id-index` |
| GET | `/api/reviews/event/{eventId}` | All reviews for an event |
| PUT | `/api/reviews/{id}` | Update rating and comment |
| DELETE | `/api/reviews/{id}` | Delete a review |

</details>

## Getting started

### Prerequisites

- An AWS account with the Part 2 backend deployed (API Gateway, the four Lambdas, RDS, DynamoDB, S3 and a Cognito user pool)
- Git, and any static file server for local testing (Python is enough)

### 1. Clone

```bash
git clone <your-repo-url>
cd <your-repo-folder>
```

### 2. Point the app at your API

Open `config.js` and set the base URL of your API Gateway `prod` stage:

```js
const CONFIG = {
  API_BASE_URL: "https://<api-id>.execute-api.<region>.amazonaws.com/prod"
};
```

### 3. Backend configuration

Each Lambda reads its settings from environment variables. Nothing secret is committed to this repository.

| Lambda | Environment variables |
|---|---|
| `UserService` | `DB_HOST`, `DB_USER`, `DB_PASS`, `COGNITO_CLIENT_ID`, `COGNITO_USER_POOL_ID` |
| `EventService` | `DB_HOST`, `DB_USER`, `DB_PASS` |
| `BookingService` | `DB_HOST`, `DB_USER`, `DB_PASS` |
| `ReviewService` | none (uses its IAM role to reach DynamoDB) |

- Set the Cognito pool's password policy to match the app: minimum 8 characters, with a number, an uppercase and a lowercase letter.
- The three SQL services need network access to the RDS instance, and the `EventService` role needs `s3:PutObject` on the image bucket.
- Enable **CORS** on the API (allow `Content-Type` and `Authorization`, and the `GET`, `POST`, `PUT`, `DELETE` and `OPTIONS` methods), then **redeploy the `prod` stage**.

> [!TIP]
> CORS changes on a REST API only take effect after the stage is redeployed. If the browser shows a CORS error right after you enabled it, redeploy first.

### 4. Image bucket

Uploads need a **CORS rule** on the bucket, and images need **public read** access to be displayed. The exact JSON for both is in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#6-s3-image-bucket-needed-for-event-images).

### 5. Run locally

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

### 6. Deploy

Push to GitHub and connect the repository in **AWS Amplify**. There is no build step, so the build settings only need to publish the repository root. The full walkthrough, including an S3 + CloudFront option, is in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Notes

- **No automated tests.** The API was tested with the Postman collection, and the app by hand against the live deployment.
- Sample event photos are stock images used for demonstration only.


### Acknowledgements

- [AWS documentation](https://docs.aws.amazon.com/) for Lambda, API Gateway, Cognito, RDS, DynamoDB, S3 and Amplify
- [Google Fonts](https://fonts.google.com/): Fraunces, Inter and JetBrains Mono
- [shields.io](https://shields.io/) for the badges at the top of this page
