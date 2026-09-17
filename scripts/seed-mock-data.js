// One-off: seed realistic mock data into production (customers, vehicles,
// mechanics, spare parts, job cards, invoices, payments).
// Skips gallery and service_requests entirely.
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const existing = await pool.query('SELECT COUNT(*)::int AS n FROM customers');
  if (existing.rows[0].n > 0) {
    console.log('Customers already exist — aborting to avoid duplicating mock data.');
    return;
  }

  const c = await pool.query(`
    INSERT INTO customers (first_name, last_name, phone, email, customer_type, address) VALUES
    ('Tendai', 'Moyo', '0771234001', 'tendai.moyo@example.com', 'Individual', 'Borrowdale, Harare'),
    ('Rutendo', 'Chikwanha', '0771234002', 'rutendo.c@example.com', 'Individual', 'Mount Pleasant, Harare'),
    ('Blessing', 'Ncube', '0771234003', 'blessing.ncube@example.com', 'Individual', 'Waterfalls, Harare'),
    ('Nyasha', 'Gatsi', '0771234004', 'nyasha.gatsi@example.com', 'Individual', 'Chitungwiza'),
    ('Delta', 'Fleet Services', '0771234005', 'fleet@deltafleet.co.zw', 'Company', 'Graniteside, Harare'),
    ('Kudzai', 'Mapfumo', '0771234006', 'kudzai.m@example.com', 'Individual', 'Marlborough, Harare'),
    ('Farai', 'Zvobgo', '0771234007', 'farai.z@example.com', 'Individual', 'Avondale, Harare'),
    ('Sunbelt', 'Logistics', '0771234008', 'ops@sunbelt.co.zw', 'Fleet Customer', 'Msasa, Harare')
    RETURNING id`);
  const cust = {}; // first_name -> id
  c.rows.forEach(r => { /* indexed below by position */ });
  const ids = c.rows.map(r => r.id);
  const [tendai, rutendo, blessing, nyasha, delta, kudzai, farai, sunbelt] = ids;
  console.log('customers:', ids.length);

  const v = await pool.query(`
    INSERT INTO vehicles (customer_id, registration_number, make, model, vehicle_year, colour, current_mileage, engine_type, transmission) VALUES
    ($1, 'ABM 4521', 'Toyota', 'Hilux', 2018, 'White', 145000, 'Diesel', 'Manual'),
    ($2, 'ACX 7834', 'Mazda', 'Demio', 2015, 'Blue', 187000, 'Petrol', 'Automatic'),
    ($3, 'AEZ 1190', 'Nissan', 'NP200', 2019, 'Silver', 98000, 'Petrol', 'Manual'),
    ($4, 'ADB 6672', 'Toyota', 'Vitz', 2014, 'Red', 210000, 'Petrol', 'Automatic'),
    ($5, 'ADL 3345', 'Isuzu', 'KB250', 2017, 'White', 265000, 'Diesel', 'Manual'),
    ($5, 'ADL 3346', 'Isuzu', 'KB250', 2017, 'White', 259000, 'Diesel', 'Manual'),
    ($6, 'AEN 8823', 'Honda', 'Fit', 2016, 'Grey', 156000, 'Petrol', 'Automatic'),
    ($7, 'AFB 2210', 'Mitsubishi', 'L200', 2013, 'Black', 298000, 'Diesel', 'Manual'),
    ($8, 'AFR 9087', 'Hino', '300', 2020, 'White', 88000, 'Diesel', 'Manual'),
    ($8, 'AFR 9088', 'Hino', '500', 2021, 'White', 45000, 'Diesel', 'Manual')
    RETURNING id, registration_number`, [tendai, rutendo, blessing, nyasha, delta, kudzai, farai, sunbelt]);
  const veh = {};
  v.rows.forEach(r => { veh[r.registration_number] = r.id; });
  console.log('vehicles:', v.rows.length);

  const m = await pool.query(`
    INSERT INTO mechanics (first_name, last_name, phone, staff_id, specialization, years_experience, status) VALUES
    ('Tapiwa', 'Marufu', '0772001001', 'MEC-001', 'Engine & Transmission', 12, 'Active'),
    ('Simba', 'Dube', '0772001002', 'MEC-002', 'Auto Electrical', 8, 'Active'),
    ('Gift', 'Chirwa', '0772001003', 'MEC-003', 'Diagnostics', 6, 'Active'),
    ('Lovemore', 'Sibanda', '0772001004', 'MEC-004', 'Brakes & Suspension', 15, 'Active'),
    ('Panashe', 'Kanyemba', '0772001005', 'MEC-005', 'General Repairs', 3, 'On Leave')
    RETURNING id`);
  const mech = m.rows.map(r => r.id);
  console.log('mechanics:', mech.length);

  const p = await pool.query(`
    INSERT INTO spare_parts (part_name, part_number, category, supplier, quantity_in_stock, minimum_stock_level, buying_price, selling_price, storage_location) VALUES
    ('Engine Oil 5W-30 (5L)', 'OIL-5W30-5L', 'Fluids', 'Zim Oils', 24, 10, 22.00, 32.00, 'Shelf A1'),
    ('Oil Filter (Toyota)', 'FLT-OIL-TOY', 'Filters', 'AutoSpares ZW', 18, 8, 6.50, 12.00, 'Shelf A2'),
    ('Air Filter (Hilux)', 'FLT-AIR-HIL', 'Filters', 'AutoSpares ZW', 9, 6, 9.00, 16.50, 'Shelf A2'),
    ('Brake Pads Front (Hilux)', 'BRK-PAD-HIL', 'Brakes', 'BrakeCentre', 14, 6, 28.00, 45.00, 'Cabinet B1'),
    ('Brake Discs Rear (Demio)', 'BRK-DSC-DEM', 'Brakes', 'BrakeCentre', 4, 6, 45.00, 75.00, 'Cabinet B2'),
    ('Spark Plugs (Iridium, set)', 'SPK-IRI-SET', 'Engine', 'IgnitionZW', 30, 12, 8.00, 14.00, 'Shelf C1'),
    ('Alternator (Honda Fit)', 'ALT-HON-FIT', 'Electrical', 'ElectroAuto', 2, 2, 120.00, 195.00, 'Cabinet D1'),
    ('Battery 12V 65Ah', 'BAT-12V-65', 'Electrical', 'Exide ZW', 7, 4, 85.00, 135.00, 'Battery Rack'),
    ('Clutch Kit (KB250)', 'CLU-KB250', 'Transmission', 'TransParts', 3, 2, 160.00, 260.00, 'Cabinet D2'),
    ('Timing Belt (Vitz)', 'TB-VITZ', 'Engine', 'TransParts', 6, 3, 35.00, 60.00, 'Shelf C2'),
    ('Shock Absorber Front (NP200)', 'SHK-NP200', 'Suspension', 'RideWell', 5, 4, 55.00, 90.00, 'Shelf E1'),
    ('CV Joint (L200)', 'CVJ-L200', 'Transmission', 'TransParts', 0, 3, 48.00, 85.00, 'Shelf E2')
    RETURNING id, part_name`);
  const part = {};
  p.rows.forEach(r => { part[r.part_name] = r.id; });
  console.log('spare parts:', p.rows.length);

  const today = new Date();
  function d(daysAgo) {
    const t = new Date(today.getTime() - daysAgo * 86400000);
    return t.toISOString().slice(0, 10);
  }

  const j = await pool.query(`
    INSERT INTO job_cards (job_number, customer_id, vehicle_id, mechanic_id, job_date, estimated_completion_date, priority, mileage, complaint, diagnosis, work_required, work_completed, status, estimated_cost, notes, created_by) VALUES
    ('JOB-1001', $1, $9,  $17, $21::date, $22::date, 'Normal', 145200, 'Engine overheating on long trips', 'Faulty thermostat and worn water pump', 'Replace thermostat and water pump, refill coolant', 'Replaced thermostat and water pump. Cooling system flushed.', 'Completed', 180.00, 'Client advised on coolant intervals.', NULL),
    ('JOB-1002', $2, $10, $18, $23::date, $24::date, 'Normal', 187400, 'Battery not holding charge', 'Alternator output below spec', 'Replace alternator and battery terminals', 'Alternator replaced with new unit.', 'Completed', 260.00, NULL, NULL),
    ('JOB-1003', $3, $11, $19, $25::date, $26::date, 'High', 98150, 'Loud grinding when braking', 'Metal-on-metal — front pads worn out', 'Replace front brake pads and skim discs', 'Front pads replaced, discs skimmed.', 'Completed', 140.00, NULL, NULL),
    ('JOB-1004', $4, $12, $20, $27::date, NULL,      'Normal', 210300, 'Routine service 210k km', 'Due major service', 'Oil, filters, plugs, timing belt inspection', 'In progress — timing belt on order.', 'In Progress', 220.00, 'Parts ETA 2 days.', NULL),
    ('JOB-1005', $5, $13, $17, $28::date, $29::date, 'Urgent', 265800, 'Clutch slipping badly under load', 'Clutch plate worn beyond limit', 'Replace full clutch kit', 'Awaiting clutch kit delivery.', 'Awaiting Parts', 420.00, 'Fleet vehicle — prioritise.', NULL),
    ('JOB-1006', $6, $14, $18, $30::date, NULL,      'Normal', 156900, 'Dashboard battery light flickering', 'Loose alternator belt, battery weak', 'Tension belt, load-test battery', 'Diagnosed, quoting client.', 'Pending', 90.00, NULL, NULL),
    ('JOB-1007', $7, $15, $19, $31::date, $32::date, 'Normal', 298450, 'Excessive vibration above 80km/h', 'Worn CV joint, unbalanced wheels', 'Replace CV joint, balance wheels', 'Booked for Monday.', 'Pending', 200.00, NULL, NULL),
    ('JOB-1008', $8, $16, $20, $33::date, NULL,      'Urgent', 88400, 'Truck losing power uphill, black smoke', 'Clogged air filter, EGR fault', 'Replace air filter, clean EGR', 'In progress.', 'In Progress', 150.00, 'Fleet account.', NULL)
    RETURNING id, job_number`,
    [tendai, rutendo, blessing, nyasha, delta, kudzai, farai, sunbelt,
     veh['ABM 4521'], veh['ACX 7834'], veh['AEZ 1190'], veh['ADB 6672'],
     veh['ADL 3345'], veh['AEN 8823'], veh['AFB 2210'], veh['AFR 9087'],
     mech[0], mech[1], mech[2], mech[3],
     d(20), d(18), d(15), d(13), d(12), d(10), d(8), d(6), d(3), d(5), d(2), d(0), d(1)]);
  const job = {};
  j.rows.forEach(r => { job[r.job_number] = r.id; });
  console.log('job cards:', j.rows.length);

  const i = await pool.query(`
    INSERT INTO invoices (invoice_number, customer_id, vehicle_id, job_card_id, invoice_date, due_date, service_charges, parts_charges, discount, tax, status, notes) VALUES
    ('INV-2001', $1, $2, $3, $4::date, $5::date, 90.00, 62.00, 0, 8.00, 'Paid', 'Thermostat + water pump job.'),
    ('INV-2002', $6, $7, $8, $9::date, $10::date, 110.00, 128.00, 10.00, 12.00, 'Paid', 'Alternator replacement incl. battery terminals.'),
    ('INV-2003', $11, $12, $13, $14::date, $15::date, 65.00, 70.00, 0, 7.00, 'Partially Paid', 'Front brake overhaul. $60 outstanding.'),
    ('INV-2004', $16, $17, $18, $19::date, $20::date, 85.00, 40.00, 5.00, 6.00, 'Unpaid', 'Major service — 210k km.'),
    ('INV-2005', $21, $22, NULL, $23::date, $24::date, 150.00, 0.00, 0, 8.00, 'Unpaid', 'Fleet diagnostics call-out.')
    RETURNING id, invoice_number`,
    [tendai, veh['ABM 4521'], job['JOB-1001'], d(18), d(8),
     rutendo, veh['ACX 7834'], job['JOB-1002'], d(13), d(3),
     blessing, veh['AEZ 1190'], job['JOB-1003'], d(10), d(0),
     nyasha, veh['ADB 6672'], job['JOB-1004'], d(5), d(5),
     sunbelt, veh['AFR 9087'], d(1), d(7)]);

  console.log('invoices:', i.rows.length);

  const pay = await pool.query(`
    INSERT INTO payments (invoice_id, payment_date, amount, payment_method, reference_number, notes) VALUES
    ($1::bigint, $4::date, 160.00, 'EcoCash', 'EC-778812', 'Full payment via EcoCash.'),
    ($2::bigint, $5::date, 240.00, 'Bank Transfer', 'TT-99231', 'Direct bank transfer.'),
    ($3::bigint, $6::date, 82.00, 'Cash', NULL, 'Part payment — balance due on collection.')
    RETURNING id`, [i.rows[0].id, i.rows[1].id, i.rows[2].id, d(16), d(11), d(9)]);
  console.log('payments:', pay.rows.length);

  console.log('\nMOCK DATA SEEDED SUCCESSFULLY');
}

main()
  .then(() => pool.end())
  .catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
