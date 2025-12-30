// server.js (updated)
// Replaces previous server.js with a more robust version:
// - Uses mysql2 connection pool (promise API)
// - Adds CORS and morgan logging
// - Keeps same endpoints but fixes column name mismatch (reservation_type) while returning "class" in JSON
// - Uses express.json() (no body-parser)

const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- MIDDLEWARE ----------
app.use(cors()); // dev only: allow requests from browser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- MySQL pool (configure credentials if needed) ----------
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'Shritejb@7', // change or use env var
  database: process.env.DB_NAME || 'karnataka_trains',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
const db = pool.promise();

// ---------- Helpers ----------
function jsonError(res, msg, code = 500) {
  return res.status(code).json({ success: false, message: msg });
}

function isValidDateString(s) {
  if (!s) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function isTodayOrFuture(dateStr) {
  const travel = new Date(dateStr);
  const today = new Date();
  today.setHours(0,0,0,0);
  travel.setHours(0,0,0,0);
  return travel >= today;
}

// ---------- ROUTES ----------

// GET /stations
app.get('/stations', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, name, code FROM stations ORDER BY name');
    if (!rows || rows.length === 0) {
      // fallback list if table empty
      const fallback = [
        { id: 1, name: 'Bengaluru (SBC)', code: 'SBC' },
        { id: 2, name: 'Mysuru (MYS)', code: 'MYS' },
        { id: 3, name: 'Mangaluru (MAQ)', code: 'MAQ' },
        { id: 4, name: 'Hubballi (HUBL)', code: 'HUBL' }
      ];
      return res.json({ success: true, stations: fallback });
    }
    res.json({ success: true, stations: rows });
  } catch (err) {
    console.error('/stations error:', err);
    return jsonError(res, 'Could not load stations');
  }
});

// POST /calculate-fare
app.post('/calculate-fare', async (req, res) => {
  const { fromStationId, toStationId, reservationType } = req.body;
  if (!fromStationId || !toStationId || !reservationType) return jsonError(res, 'Missing parameters', 400);
  if (fromStationId === toStationId) return jsonError(res, 'From and To must be different', 400);

  try {
    const fareSql = `SELECT fare_ac, fare_sleeper, fare_passenger FROM fares WHERE from_station_id = ? AND to_station_id = ? LIMIT 1`;
    const [rows] = await db.query(fareSql, [fromStationId, toStationId]);

    let amount = null;
    if (rows && rows.length) {
      const r = rows[0];
      if (reservationType.toLowerCase() === 'ac') amount = r.fare_ac;
      else if (reservationType.toLowerCase() === 'sleeper') amount = r.fare_sleeper;
      else amount = r.fare_passenger;
    } else {
      // try reverse direction
      const [rev] = await db.query(fareSql, [toStationId, fromStationId]);
      if (rev && rev.length) {
        const r = rev[0];
        if (reservationType.toLowerCase() === 'ac') amount = r.fare_ac;
        else if (reservationType.toLowerCase() === 'sleeper') amount = r.fare_sleeper;
        else amount = r.fare_passenger;
      }
    }

    if (amount === null || amount === undefined) return jsonError(res, 'Fare not found for selected route', 404);
    res.json({ success: true, amount: Number(amount) });
  } catch (err) {
    console.error('/calculate-fare error:', err);
    return jsonError(res, 'Error calculating fare');
  }
});

// DEBUG /book handler — paste in place of your existing /book route
app.post('/book', async (req, res) => {
  console.log('=== /book called ===');
  console.log('Request body:', JSON.stringify(req.body));

  const { userId, passengerName, age, reservationType, travelDate, fromStationId, toStationId } = req.body || {};

  if (!userId || !passengerName || !age || !reservationType || !travelDate || !fromStationId || !toStationId) {
    console.log('/book -> validation failed', { userId, passengerName, age, reservationType, travelDate, fromStationId, toStationId });
    return res.status(400).json({ success: false, message: 'Missing booking fields' });
  }

  // validate date
  const t = new Date(travelDate);
  const today = new Date(); today.setHours(0,0,0,0); t.setHours(0,0,0,0);
  if (isNaN(t.getTime()) || t < today) {
    console.log('/book -> invalid or past travel date', travelDate);
    return res.status(400).json({ success: false, message: 'Invalid or past travel date' });
  }

  try {
    console.log('/book -> looking up fare for', fromStationId, '->', toStationId, 'class:', reservationType);

    const fareSql = `SELECT fare_ac, fare_sleeper, fare_passenger FROM fares WHERE from_station_id = ? AND to_station_id = ? LIMIT 1`;
    const [rows] = await db.query(fareSql, [fromStationId, toStationId]);
    console.log('/book -> fares rows:', rows && rows.length ? rows[0] : 'none');

    let amount = null;
    if (rows && rows.length) {
      const r = rows[0];
      amount = reservationType.toLowerCase() === 'ac' ? r.fare_ac
             : reservationType.toLowerCase() === 'sleeper' ? r.fare_sleeper
             : r.fare_passenger;
    } else {
      const [rev] = await db.query(fareSql, [toStationId, fromStationId]);
      console.log('/book -> reverse fares rows:', rev && rev.length ? rev[0] : 'none');
      if (rev && rev.length) {
        const r = rev[0];
        amount = reservationType.toLowerCase() === 'ac' ? r.fare_ac
               : reservationType.toLowerCase() === 'sleeper' ? r.fare_sleeper
               : r.fare_passenger;
      }
    }

    if (amount === null || amount === undefined) {
      console.log('/book -> no fare found for route', fromStationId, toStationId);
      return res.status(404).json({ success:false, message:'Fare not found for route', debug:{ fromStationId, toStationId }});
    }

    console.log('/book -> inserting booking amount:', amount);

    // use 'class' column (your DB uses class)
    const insertSql = `
      INSERT INTO bookings (user_id, passenger_name, age, class, travel_date, from_station_id, to_station_id, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [insertResult] = await db.query(insertSql, [
      userId, passengerName, age, reservationType, travelDate, fromStationId, toStationId, Number(amount)
    ]);
    console.log('/book -> inserted id:', insertResult.insertId);

    const detailsSql = `
      SELECT b.id, b.passenger_name, b.age, b.class AS reservation_type, b.travel_date, b.amount,
             fs.name AS from_station, ts.name AS to_station
      FROM bookings b
      LEFT JOIN stations fs ON b.from_station_id = fs.id
      LEFT JOIN stations ts ON b.to_station_id = ts.id
      WHERE b.id = ?
      LIMIT 1
    `;
    const [rows2] = await db.query(detailsSql, [insertResult.insertId]);
    console.log('/book -> fetched details rows2:', rows2);

    if (!rows2 || rows2.length === 0) {
      console.log('/book -> booking created but details missing for id', insertResult.insertId);
      return res.status(500).json({ success:false, message:'Booking created but could not fetch details', debug:{ insertId: insertResult.insertId }});
    }

    const r = rows2[0];
    const bookingResp = {
      id: r.id,
      passenger_name: r.passenger_name,
      age: r.age,
      class: r.reservation_type,
      travel_date: r.travel_date,
      amount: Number(r.amount),
      from_station: r.from_station || `Station ${fromStationId}`,
      to_station: r.to_station || `Station ${toStationId}`
    };

    console.log('/book -> success', bookingResp);
    return res.json({ success:true, booking: bookingResp });

  } catch (err) {
    console.error('/book error (detailed):', err);
    // temporary: return error message + stack so we see exact failure in browser
    return res.status(500).json({ success:false, message:'Could not complete booking', error: err.message, stack: err.stack });
  }
});



// GET /my-bookings?userId=#
app.get('/my-bookings', async (req, res) => {
  const userId = parseInt(req.query.userId, 10);
  if (!userId) return jsonError(res, 'Missing userId', 400);

  try {
    const sql = `
      SELECT b.id, b.passenger_name, b.age, b.class AS reservation_type, b.travel_date, b.amount,
             fs.name as from_station, ts.name as to_station
      FROM bookings b
      LEFT JOIN stations fs ON fs.id = b.from_station_id
      LEFT JOIN stations ts ON ts.id = b.to_station_id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `;
    const [rows] = await db.query(sql, [userId]);
    const bookings = (rows || []).map(r => ({
      id: r.id,
      passenger_name: r.passenger_name,
      age: r.age,
      class: r.reservation_type,
      travel_date: r.travel_date,
      amount: Number(r.amount),
      from_station: r.from_station,
      to_station: r.to_station
    }));
    res.json({ success: true, count: bookings.length, bookings });
  } catch (err) {
    console.error('/my-bookings error:', err);
    return jsonError(res, 'Could not load bookings');
  }
});

// POST /register
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return jsonError(res, 'Missing registration fields', 400);

  try {
    const sql = `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`;
    await db.query(sql, [name, email, password]);
    res.json({ success: true, message: 'Registration successful' });
  } catch (err) {
    console.error('/register error:', err);
    if (err && err.code === 'ER_DUP_ENTRY') return res.json({ success: false, message: 'Email already exists' });
    return jsonError(res, 'Could not register user');
  }
});

// POST /login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return jsonError(res, 'Missing login fields', 400);

  try {
    const sql = `SELECT id, name, email FROM users WHERE email = ? AND password = ? LIMIT 1`;
    const [rows] = await db.query(sql, [email, password]);
    if (!rows || rows.length === 0) return res.json({ success: false, message: 'Invalid email or password' });
    const user = rows[0];
    res.json({ success: true, user });
  } catch (err) {
    console.error('/login error:', err);
    return jsonError(res, 'Could not login');
  }
});

// fallback 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// start server
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  try {
    const [r] = await db.query('SELECT 1 + 1 AS ok');
    console.log('Connected to MySQL database (pool).');
  } catch (err) {
    console.error('MySQL connection test failed:', err);
  }
});
