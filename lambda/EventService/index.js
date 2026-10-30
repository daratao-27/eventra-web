const mysql = require('mysql2/promise');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({ region: 'ap-southeast-1' });
const BUCKET = 'eventra-tp-images';
let pool;

exports.handler = async (event) => {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: 'eventra_db',
      port: 3306
    });
  }

  const method = event.httpMethod;
  const path = event.path;
  const body = event.body ? JSON.parse(event.body) : {};
  const params = event.pathParameters || {};
  const query = event.queryStringParameters || {};

  try {
    // GET all events
    if (method === 'GET' && !params.id && !path.includes('/analytics')) {
      let sql = `
        SELECT e.*, c.category_name AS category, v.venue_name AS venue
        FROM events e
        JOIN categories c ON e.category_id = c.category_id
        JOIN venues v ON e.venue_id = v.venue_id
        WHERE e.status = "published"
      `;
      const sqlParams = [];
      if (query.keyword) { sql += ' AND (e.title LIKE ? OR e.description LIKE ?)'; sqlParams.push(`%${query.keyword}%`, `%${query.keyword}%`); }
      if (query.category) { sql += ' AND c.category_name = ?'; sqlParams.push(query.category); }
      if (query.date) { sql += ' AND DATE(e.event_date) = ?'; sqlParams.push(query.date); }
      const [rows] = await pool.query(sql, sqlParams);
      return respond(200, rows);
    }

    // GET /api/events/{id}/upload-url
    if (method === 'GET' && path.includes('/upload-url')) {
      const { filename, contentType } = event.queryStringParameters || {};
      if (!filename) {
        return respond(400, { message: 'filename query parameter is required.' });
      }
      const key = `events/${params.id}/${filename}`;
      const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType || 'image/jpeg'
      });
      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
      const imageUrl = `https://${BUCKET}.s3.ap-southeast-1.amazonaws.com/${key}`;
      return respond(200, { uploadUrl, imageUrl });
    }

    // GET single event
    if (method === 'GET' && params.id && !path.includes('/analytics')) {
      if (isNaN(params.id)) {
        return respond(400, { message: 'Event ID must be a number.' });
      }
      const [rows] = await pool.query(
        `SELECT e.*, c.category_name AS category, v.venue_name AS venue
         FROM events e
         JOIN categories c ON e.category_id = c.category_id
         JOIN venues v ON e.venue_id = v.venue_id
         WHERE e.event_id = ?`,
        [params.id]
      );
      if (rows.length === 0) return respond(404, { message: 'Event not found' });
      return respond(200, rows[0]);
    }

    // POST create event
    if (method === 'POST') {
      const { organizer_id, title, description, category, venue, event_date, capacity, ticket_price, status } = body;

      if (!organizer_id || !title || !category || !venue || !event_date || capacity === undefined || ticket_price === undefined) {
        return respond(400, { message: 'Missing required fields: organizer_id, title, category, venue, event_date, capacity, and ticket_price are all required.' });
      }
      if (capacity < 0) {
        return respond(400, { message: 'Capacity cannot be negative.' });
      }
      if (ticket_price < 0) {
        return respond(400, { message: 'Ticket price cannot be negative.' });
      }
      if (status && !['draft', 'published', 'cancelled'].includes(status)) {
        return respond(400, { message: 'Status must be one of: draft, published, cancelled.' });
      }

      const category_id = await getOrCreateCategoryId(category);
      const venue_id = await getOrCreateVenueId(venue);

      const [result] = await pool.query(
        'INSERT INTO events (organizer_id, title, description, category_id, venue_id, event_date, capacity, ticket_price, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [organizer_id, title, description, category_id, venue_id, event_date, capacity, ticket_price, status || 'published']
      );
      return respond(201, { message: 'Event created', event_id: result.insertId });
    }

    // PUT update event
    if (method === 'PUT' && params.id) {
      const { title, description, category, venue, event_date, capacity, ticket_price, status } = body;

      if (!title || !category || !venue || !event_date || capacity === undefined || ticket_price === undefined) {
        return respond(400, { message: 'Missing required fields: title, category, venue, event_date, capacity, and ticket_price are all required.' });
      }
      if (capacity < 0) {
        return respond(400, { message: 'Capacity cannot be negative.' });
      }
      if (ticket_price < 0) {
        return respond(400, { message: 'Ticket price cannot be negative.' });
      }
      if (status && !['draft', 'published', 'cancelled'].includes(status)) {
        return respond(400, { message: 'Status must be one of: draft, published, cancelled.' });
      }

      const [existingEvent] = await pool.query('SELECT event_id FROM events WHERE event_id = ?', [params.id]);
      if (existingEvent.length === 0) {
        return respond(404, { message: 'Event not found' });
      }

      const category_id = await getOrCreateCategoryId(category);
      const venue_id = await getOrCreateVenueId(venue);

      await pool.query(
        'UPDATE events SET title=?, description=?, category_id=?, venue_id=?, event_date=?, capacity=?, ticket_price=?, status=? WHERE event_id=?',
        [title, description, category_id, venue_id, event_date, capacity, ticket_price, status, params.id]
      );
      return respond(200, { message: 'Event updated' });
    }

    // DELETE event
    if (method === 'DELETE' && params.id) {
      const [existingEvent] = await pool.query('SELECT event_id FROM events WHERE event_id = ?', [params.id]);
      if (existingEvent.length === 0) {
        return respond(404, { message: 'Event not found' });
      }
      await pool.query('DELETE FROM events WHERE event_id = ?', [params.id]);
      return respond(200, { message: 'Event deleted' });
    }

    // GET analytics for event
    if (method === 'GET' && path.includes('/analytics/events')) {
      const [rows] = await pool.query(
        'SELECT COUNT(*) as total_bookings, SUM(b.quantity * b.unit_price_at_booking) as total_revenue FROM bookings b WHERE b.event_id = ? AND b.status = "confirmed"',
        [params.eventId]
      );
      return respond(200, rows[0]);
    }

    // GET analytics for organizer
    if (method === 'GET' && path.includes('/analytics/organizer')) {
      const [rows] = await pool.query(
        `SELECT e.title, COUNT(b.booking_id) as bookings, SUM(b.quantity * b.unit_price_at_booking) as revenue
         FROM events e
         LEFT JOIN bookings b ON e.event_id = b.event_id AND b.status = "confirmed"
         WHERE e.organizer_id = ?
         GROUP BY e.event_id`,
        [params.organizerId]
      );
      return respond(200, rows);
    }

    return respond(404, { message: 'Route not found' });

  } catch (err) {
    return respond(500, { message: 'Server error', error: err.message });
  }
};

async function getOrCreateCategoryId(categoryName) {
  const [rows] = await pool.query('SELECT category_id FROM categories WHERE category_name = ?', [categoryName]);
  if (rows.length > 0) return rows[0].category_id;
  const [result] = await pool.query('INSERT INTO categories (category_name) VALUES (?)', [categoryName]);
  return result.insertId;
}

async function getOrCreateVenueId(venueName) {
  const [rows] = await pool.query('SELECT venue_id FROM venues WHERE venue_name = ?', [venueName]);
  if (rows.length > 0) return rows[0].venue_id;
  const [result] = await pool.query('INSERT INTO venues (venue_name) VALUES (?)', [venueName]);
  return result.insertId;
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}