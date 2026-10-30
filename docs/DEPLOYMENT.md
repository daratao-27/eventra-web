[← Back to the main README](../README.md)

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

## 1. Point it at your API
Open `config.js` and confirm `API_BASE_URL` matches your `prod` stage invoke URL.
It's already pre-filled with the URL from your Part 2 summary:
```
https://trcc40lsml.execute-api.ap-southeast-1.amazonaws.com/prod
```

## 2. Enable CORS on API Gateway (if not already done)
Every Lambda response needs these headers (or set CORS at the API Gateway/stage
level):
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Content-Type,Authorization
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
```
Enable CORS on each resource in API Gateway, redeploy the `prod` stage, and
add an `OPTIONS` method if API Gateway didn't create one automatically.

## 3. Deploy — two options

### Option A: AWS Amplify Hosting (recommended, simplest for the brief)
1. Push this folder to a GitHub repo (or a folder inside your existing repo).
2. AWS Console → Amplify → **Create app** → **Deploy without Git provider**
   (drag-and-drop) or connect your GitHub repo.
3. Since this is a static site with no build step, use build settings:
   ```yaml
   version: 1
   frontend:
     phases:
       build:
         commands: []
     artifacts:
       baseDirectory: /
       files:
         - '**/*'
   ```
4. Deploy. Amplify gives you an `https://<branch>.<app-id>.amplifyapp.com` URL —
   that's the URL to submit in your `.txt` file.

### Option B: S3 static website + CloudFront
1. Create an S3 bucket (e.g. `eventra-web-app`), enable **Static website
   hosting**, set `index.html` as the index document.
2. Upload all 5 files to the bucket root.
3. Either:
   - Make the bucket public + a bucket policy allowing `s3:GetObject`, and use
     the S3 website endpoint directly, **or**
   - (Better for the "explore additional AWS features" mark) keep the bucket
     private, put **CloudFront** in front of it with an Origin Access Control,
     and use the CloudFront domain as your app URL — this also gets you HTTPS
     and edge caching for free.
4. Submit the CloudFront/S3 URL.

## 4. Optional extras that map to the assignment's suggestions
- **Cognito**: already wired up — login/register/reset flows call your
  UserService, which talks to your existing Cognito User Pool. Nothing extra
  needed for the basic flow, but you can mention in your report that the JWT
  from Cognito is stored client-side and sent as `Authorization: Bearer
  <token>` on protected calls.
- **EventBridge**: a natural add-on is emitting a `BookingConfirmed` event from
  BookingService to EventBridge, with a target Lambda that sends a
  confirmation email via SES — good "additional feature" talking point for
  your demo/report even if not required.
- **Step Functions**: could orchestrate the "create event → generate
  presigned URL → wait for upload" flow, or a booking → payment (simulated) →
  confirmation pipeline, if you want to show off orchestration.
- **CloudWatch**: turn on Lambda logging/alarms (e.g. alarm on BookingService
  error rate) for the "monitoring" bullet point in the brief.

## 5. Test locally before deploying
Because this is plain static files with `fetch()` calls (no CORS issues from
`file://` as long as your API allows `*`), you can just open `index.html` in a
browser, or serve it locally to avoid `file://` quirks:
```
cd eventra-web
python3 -m http.server 8080
# visit http://localhost:8080
```

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

## 6. S3 image bucket (needed for event images)

Event images are uploaded **straight from the browser to S3** using a presigned URL, and then displayed by pointing an `<img>` at the object's URL. Two bucket settings are required, otherwise uploads fail with "Failed to fetch" or the image shows as a placeholder.

**a) CORS** (bucket → *Permissions* → *Cross-origin resource sharing*). Lets the browser `PUT` the file:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": []
  }
]
```
Tighten `AllowedOrigins` to your Amplify URL once everything works.

**b) Public read** (bucket → *Permissions*). Untick *Block all public access*, then add this bucket policy so anyone can *view* images. Uploads still require a presigned URL, so the bucket is not publicly writable:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadForEventImages",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::<your-bucket-name>/*"
    }
  ]
}
```

The `EventService` Lambda's execution role also needs `s3:PutObject` on the bucket to be able to sign upload URLs.
