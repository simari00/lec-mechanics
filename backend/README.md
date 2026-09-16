# LEC Mechanics backend setup

The backend uses a local **SQLite** database file so it can run with nothing
but PHP installed. Open [`lec_mechanics.sqlite`](lec_mechanics.sqlite) with
[DB Browser for SQLite](https://sqlitebrowser.org/) to inspect or edit the data.

## Create the database

Run once (also use this to reset the database after deleting the file):

```bash
php backend/init_sqlite.php
```

This builds `backend/lec_mechanics.sqlite` from
[`database.sqlite.sql`](database.sqlite.sql) — the SQLite version of the schema
with tables for users, customers, vehicles, mechanics, job cards, spare parts,
invoices, payments and service requests, plus the dashboard views.

## Configure PHP

No environment variables are required by default. The database file lives at
`backend/lec_mechanics.sqlite`; set `DB_PATH` to override the location.

The reusable connection is [`config/database.php`](config/database.php). Include it from API endpoints with:

```php
require_once __DIR__ . '/../config/database.php';
$database = db();
```

Use prepared statements for all values supplied by forms. Do not commit a default admin password. The first admin account is created through the API's `auth=setup` action; passwords are stored as PHP `password_hash()` results, never plain text.

## Important deployment note

The current HTML admin pages are presentation-only: their forms do not yet submit to PHP endpoints. The schema is ready for them, but CRUD API endpoints and JavaScript form wiring still need to be added before the pages can save and display live records.