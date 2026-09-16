/**
 * Vercel Cron keep-alive — pings Supabase so the free Postgres project
 * never gets paused for inactivity, and returns health info.
 *
 * Schedule lives in vercel.json ("0 */6 * * *" = every 6 hours).
 * Protect it by setting the CRON_SECRET env var in Vercel; the cron
 * passes it automatically as an Authorization header.
 */
const { Pool } = require('pg');

module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
    const result = await pool.query(
      `INSERT INTO keepalive (id, last_ping, pings) VALUES (1, now(), 1)
       ON CONFLICT (id) DO UPDATE SET last_ping = now(), pings = keepalive.pings + 1
       RETURNING last_ping, pings`);
    await pool.end();
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, ...result.rows[0] }));
  } catch (error) {
    console.error('Cron keep-alive failed:', error.message);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: error.message }));
  }
};
