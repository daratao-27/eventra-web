const mysql = require('mysql2/promise');
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

  try {
    // POST /api/bookings
    if (method === 'POST') {
      const { user_id, event_id, quantity } = body;

      if (!user_id || !event_id || quantity === undefined) {
        return respond(400, { message: 'Missing required fields: user_id, event_id, and quantity are all required.' });
      }
      if (quantity <= 0) {
        return respond(400, { message: 'Quantity must be greater than 0.' });
      }

      const [eventRows] = await pool.query(
        'SELECT ticket_price, capacity FROM events WHERE event_id = ?',
        [event_id]
      );
      if (eventRows.length === 0) {
        return respond(404, { message: 'Event not found' });
      }
      const unit_price_at_booking = parseFloat(eventRows[0].ticket_price);
      const total_price = Math.round(quantity * unit_price_at_booking * 100) / 100;

      const [result] = await pool.query(
        'INSERT INTO bookings (user_id, event_id, quantity, unit_price_at_booking, status) VALUES (?, ?, ?, ?, "confirmed")',
        [user_id, event_id, quantity, unit_price_at_booking]
      );

      return respond(201, {
        message: 'Booking confirmed',
        booking_id: result.insertId,
        unit_price_at_booking,
        total_price
      });
    }

    // GET /api/bookings (all bookings)
    if (method === 'GET' && !params.id && !path.includes('/user/') && !path.includes('/event/')) {
      const [rows] = await pool.query('SELECT * FROM bookings');
      return respond(200, rows.map(addTotalPrice));
    }

    // GET /api/bookings/{id}
    if (method === 'GET' && params.id && !path.includes('/user/') && !path.includes('/event/')) {
      if (isNaN(params.id)) {
        return respond(400, { message: 'Booking ID must be a number.' });
      }
      const [rows] = await pool.query('SELECT * FROM bookings WHERE booking_id = ?', [params.id]);
      if (rows.length === 0) return respond(404, { message: 'Booking not found' });
      return respond(200, addTotalPrice(rows[0]));
    }

    // GET /api/bookings/user/{userId}
    if (method === 'GET' && path.includes('/user/')) {
      if (isNaN(params.userId)) {
        return respond(400, { message: 'User ID must be a number.' });
      }
      const [rows] = await pool.query('SELECT * FROM bookings WHERE user_id = ?', [params.userId]);
      return respond(200, rows.map(addTotalPrice));
    }

    // GET /api/bookings/event/{eventId}
    if (method === 'GET' && path.includes('/event/')) {
      if (isNaN(params.eventId)) {
        return respond(400, { message: 'Event ID must be a number.' });
      }
      const [rows] = await pool.query('SELECT * FROM bookings WHERE event_id = ?', [params.eventId]);
      return respond(200, rows.map(addTotalPrice));
    }

    // DELETE /api/bookings/{id}
    if (method === 'DELETE' && params.id) {
      const [existingBooking] = await pool.query('SELECT booking_id, status FROM bookings WHERE booking_id = ?', [params.id]);
      if (existingBooking.length === 0) {
        return respond(404, { message: 'Booking not found' });
      }
      if (existingBooking[0].status === 'cancelled') {
        return respond(409, { message: 'Booking is already cancelled.' });
      }
      await pool.query('UPDATE bookings SET status = "cancelled" WHERE booking_id = ?', [params.id]);
      return respond(200, { message: 'Booking cancelled' });
    }

    return respond(404, { message: 'Route not found' });

  } catch (err) {
    return respond(500, { message: 'Server error', error: err.message });
  }
};

function addTotalPrice(booking) {
  const total = booking.quantity * parseFloat(booking.unit_price_at_booking);
  return {
    ...booking,
    total_price: Math.round(total * 100) / 100
  };
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}