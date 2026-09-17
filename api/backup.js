/**
 * Automatic database backups — Vercel Cron endpoint.
 *
 * Every night (see vercel.json cron schedule) this exports every business
 * table to JSON and stores the snapshot INSIDE the database itself
 * (table: backups). The last 30 snapshots are kept; older ones rotate
 * out automatically. Snapshots exclude the bulky gallery image bytes
 * (those are additive uploads; the metadata is backed up) so each
 * snapshot stays small enough for the Supabase free tier.
 *
 * Restore path: each snapshot row contains complete, ordered table data,
 * so any snapshot can be replayed to recover the business data.
 *
 * Protect it by setting the CRON_SECRET env var in Vercel; the cron
 * passes it automatically as an Authorization header.
 */
const { Pool } = require('pg');

// Order matters for restore (parents before children).
const BACKUP_TABLES = [
  'users',
  'customers',
  'vehicles',
  'mechanics',
  'spare_parts',
  'job_cards',
  'job_card_parts',
  'invoices',
  'payments',
  'service_requests',
  'gallery_images',
];

const KEEP_SNAPSHOTS = 30;

module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  try {
    // Only one snapshot per day: if today's already exists, skip.
    const existing = await pool.query(
      `SELECT id FROM backups WHERE created_at::date = now()::date LIMIT 1`);
    if (existing.rows.length) {
      await pool.end();
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, skipped: 'snapshot for today already exists' }));
    }

    const snapshot = { version: 1, taken_at: new Date().toISOString(), tables: {} };
    let totalRows = 0;

    for (const table of BACKUP_TABLES) {
      try {
        const result = await pool.query(`SELECT * FROM ${table} ORDER BY id ASC`);
        // gallery_images: store metadata but not the image/thumbnail bytes.
        const rows = table === 'gallery_images'
          ? result.rows.map((r) => {
              const copy = { ...r };
              delete copy.data;        // full image bytes (base64)
              delete copy.thumb_data;  // thumbnail bytes (base64)
              copy._image_bytes_omitted = true;
              return copy;
            })
          : result.rows;
        // users: never export password hashes/recovery hashes in plaintext dumps.
        if (table === 'users') {
          rows.forEach((r) => {
            delete r.password_hash;
            delete r.security_answer_hash;
          });
        }
        snapshot.tables[table] = rows;
        totalRows += rows.length;
      } catch (tableError) {
        snapshot.tables[table] = { error: tableError.message };
      }
    }

    const counts = Object.fromEntries(
      Object.entries(snapshot.tables).map(([t, v]) => [t, Array.isArray(v) ? v.length : -1]));

    await pool.query(
      'INSERT INTO backups (table_counts, row_count, payload) VALUES ($1, $2, $3)',
      [JSON.stringify(counts), totalRows, JSON.stringify(snapshot)]);

    // Rotate: keep only the newest KEEP_SNAPSHOTS.
    await pool.query(
      `DELETE FROM backups WHERE id NOT IN (
         SELECT id FROM backups ORDER BY created_at DESC LIMIT $1)`,
      [KEEP_SNAPSHOTS]);

    const kept = await pool.query('SELECT COUNT(*)::int AS n FROM backups');
    await pool.end();

    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      snapshot_rows: totalRows,
      tables: counts,
      backups_stored: kept.rows[0].n,
    }));
  } catch (error) {
    console.error('Backup failed:', error.message);
    try { await pool.end(); } catch (e) { /* ignore */ }
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: error.message }));
  }
};
