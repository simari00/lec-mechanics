<?php

declare(strict_types=1);

/**
 * Seed the SQLite database with realistic sample data.
 *
 * Usage:  php backend/seed_sqlite.php
 * Safe to re-run: it wipes and repopulates the sample rows each time
 * (keeps the users table untouched so your admin login survives).
 *
 * The database file itself must exist first:  php backend/init_sqlite.php
 */

require_once __DIR__ . '/config/database.php';

$database = db();

$database->beginTransaction();

// Keep users (admin login); wipe only the business data.
$database->exec('DELETE FROM payments');
$database->exec('DELETE FROM invoices');
$database->exec('DELETE FROM job_card_parts');
$database->exec('DELETE FROM job_cards');
$database->exec('DELETE FROM spare_parts');
$database->exec('DELETE FROM vehicles');
$database->exec('DELETE FROM mechanics');
$database->exec('DELETE FROM customers');
$database->exec('DELETE FROM service_requests');

$adminId = (int) $database->query('SELECT id FROM users ORDER BY id LIMIT 1')->fetchColumn() ?: null;

// ---------------- Customers ----------------
$customers = [
    ['Tariro', 'Moyo', '+263771234567', 'tariro.moyo@gmail.com', null, 'Individual', '12 Cherutony Rd, Msasa, Harare'],
    ['Rumbidzai', 'Chikafu', '+263772345678', 'r.chikafu@yahoo.com', '63-1234567B43', 'Individual', '45 Keyworth Ave, Kensington, Harare'],
    ['Blessing', 'Ncube', '+263773456789', null, null, 'Individual', '8 Penalonga Rd, Waterfalls, Harare'],
    ['Sunbelt', 'Logistics (Pvt) Ltd', '+263774567890', 'fleet@sunbeltlogistics.co.zw', null, 'Company', '23 Arcturus Rd, Graniteside, Harare'],
    ['Kudzai', 'Mapfumo', '+263775678901', 'kudzai.mapfumo@gmail.com', '12-0987654X21', 'Individual', '77 Seke Rd, Chitungwiza'],
    ['Highland', 'Farm Supplies', '+263776789012', 'admin@highlandfarm.co.zw', null, 'Fleet Customer', 'Plot 4, Norton Road, Norton'],
];

$insertCustomer = $database->prepare(
    'INSERT INTO customers (first_name, last_name, phone, email, national_id, customer_type, address) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
$customerIds = [];
foreach ($customers as $row) {
    $insertCustomer->execute($row);
    $customerIds[] = (int) $database->lastInsertId();
}

// ---------------- Vehicles ----------------
$vehicles = [
    [$customerIds[0], 'AEZ 4821', 'Toyota', 'Corolla', 2015, 'Silver', 'Petrol', 'Manual', 148_000],
    [$customerIds[1], 'ACX 1190', 'Mazda', 'Demio', 2018, 'Blue', 'Petrol', 'Automatic', 92_500],
    [$customerIds[2], 'ADF 7734', 'Nissan', 'NP200', 2013, 'White', 'Petrol', 'Manual', 231_000],
    [$customerIds[3], 'AEQ 2255', 'Hino', '300 Series', 2019, 'White', 'Diesel', 'Manual', 310_400],
    [$customerIds[3], 'AEQ 2256', 'Hino', '300 Series', 2019, 'White', 'Diesel', 'Manual', 305_900],
    [$customerIds[4], 'AFT 6612', 'Honda', 'Fit', 2016, 'Grey', 'Hybrid', 'Automatic', 121_300],
    [$customerIds[5], 'AGH 3301', 'Isuzu', 'KB 250', 2014, 'Green', 'Diesel', 'Manual', 268_700],
];

$insertVehicle = $database->prepare(
    'INSERT INTO vehicles (customer_id, registration_number, make, model, vehicle_year, colour, engine_type, transmission, current_mileage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
$vehicleIds = [];
foreach ($vehicles as $row) {
    $insertVehicle->execute($row);
    $vehicleIds[] = (int) $database->lastInsertId();
}

// ---------------- Mechanics ----------------
$mechanics = [
    ['Tendai', 'Chirwa', '+263781111111', 'tendai.chirwa@lecmechanics.co.zw', 'LEC-M01', 'Engine & Diagnostics', 12, 'Active'],
    ['Farai', 'Mutasa', '+263782222222', 'farai.mutasa@lecmechanics.co.zw', 'LEC-M02', 'Auto Electrical', 8, 'Active'],
    ['Nyasha', 'Gumbo', '+263783333333', null, 'LEC-M03', 'Brakes & Suspension', 5, 'Active'],
    ['Simba', 'Dube', '+263784444444', null, 'LEC-M04', 'Panel Beating & Spray', 10, 'On Leave'],
];

$insertMechanic = $database->prepare(
    'INSERT INTO mechanics (first_name, last_name, phone, email, staff_id, specialization, years_experience, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
$mechanicIds = [];
foreach ($mechanics as $row) {
    $insertMechanic->execute($row);
    $mechanicIds[] = (int) $database->lastInsertId();
}

// ---------------- Spare parts ----------------
$parts = [
    ['Oil Filter (Toyota)', 'TOF-90915', 'Filters', 'Motorparts Harare', 24, 10, 6.00, 10.00, 'A1-03', null],
    ['Air Filter (Hino)', 'HAF-17801', 'Filters', 'TruckSpares ZW', 6, 8, 14.00, 22.00, 'A1-05', null],
    ['Brake Pads Front', 'BPF-5512', 'Brakes', 'Brake Centre Harare', 18, 8, 22.00, 38.00, 'B2-01', null],
    ['Spark Plug Set (Iridium)', 'SPK-IR7', 'Engine', 'AutoElect ZW', 40, 15, 8.50, 15.00, 'B1-06', null],
    ['Alternator 12V 90A', 'ALT-90A', 'Electrical', 'Zim Auto Electric', 2, 3, 85.00, 140.00, 'C1-02', null],
    ['Battery 12V 65Ah', 'BAT-65', 'Electrical', 'Exide Zimbabwe', 9, 6, 78.00, 115.00, 'C1-01', null],
    ['Shock Absorber Rear', 'SHK-R33', 'Suspension', 'Suspension World', 12, 6, 45.00, 72.00, 'B3-04', null],
    ['Coolant 5L', 'COL-5L', 'Fluids', 'Motorparts Harare', 30, 12, 9.00, 16.00, 'D1-02', null],
];

$insertPart = $database->prepare(
    'INSERT INTO spare_parts (part_name, part_number, category, supplier, quantity_in_stock, minimum_stock_level, buying_price, selling_price, storage_location, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
$partIds = [];
foreach ($parts as $row) {
    $insertPart->execute($row);
    $partIds[] = (int) $database->lastInsertId();
}

// ---------------- Job cards ----------------
$today = date('Y-m-d');

$jobs = [
    // [job_number, customer, vehicle, mechanic, days_ago, est_days_ahead, priority, status, complaint, diagnosis, work_required, work_completed, est_cost]
    ['JC-2026-0101', 0, 0, 0, 12, 8, 'Normal', 'Completed', 'Rough idle and engine warning light on.', 'Worn spark plugs and dirty air filter.', 'Replace spark plugs and air filter; reset ECU.', 'Replaced spark plug set and air filter, cleared codes.', 68.00],
    ['JC-2026-0102', 1, 1, 1, 9, 6, 'Normal', 'Completed', 'Battery not charging, battery light stays on.', 'Faulty alternator, low output at idle.', 'Fit reconditioned alternator, test charging system.', 'Replaced alternator, charging at 14.2V.', 195.00],
    ['JC-2026-0103', 3, 3, 0, 7, 4, 'High', 'In Progress', 'Fleet truck Hino 300 losing power under load.', 'Clogged air and fuel filters, low boost.', 'Full filter service and turbo inspection.', null, 320.00],
    ['JC-2026-0104', 2, 2, 2, 5, 3, 'Urgent', 'In Progress', 'Grinding noise when braking, pedal vibration.', 'Brake pads worn to metal, warped front discs.', 'Replace front pads and machine discs.', null, 240.00],
    ['JC-2026-0105', 3, 4, 1, 3, 2, 'High', 'Awaiting Parts', 'Truck battery drains overnight.', 'Parasitic draw suspected; alternator diode test pending replacement part.', 'Replace battery and test charging circuit.', null, 180.00],
    ['JC-2026-0106', 4, 5, 2, 2, 1, 'Normal', 'Pending', 'Knocking noise from rear over bumps.', 'Possible worn rear shock absorbers.', 'Inspect and replace rear shocks.', null, 150.00],
    ['JC-2026-0107', 5, 6, 0, 1, 5, 'Normal', 'Pending', 'Scheduled 80,000 km major service.', null, 'Full service: fluids, filters, brakes inspection.', null, 260.00],
];

$insertJob = $database->prepare(
    'INSERT INTO job_cards (job_number, customer_id, vehicle_id, mechanic_id, job_date, estimated_completion_date, priority, mileage, complaint, diagnosis, work_required, work_completed, status, estimated_cost, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
$jobIds = [];
foreach ($jobs as [$number, $cIdx, $vIdx, $mIdx, $daysAgo, $daysAhead, $priority, $status, $complaint, $diagnosis, $workRequired, $workCompleted, $estCost]) {
    $insertJob->execute([
        $number, $customerIds[$cIdx], $vehicleIds[$vIdx], $mechanicIds[$mIdx],
        date('Y-m-d', strtotime("-{$daysAgo} days")),
        date('Y-m-d', strtotime("+{$daysAhead} days")),
        $priority, random_int(30_000, 300_000),
        $complaint, $diagnosis, $workRequired, $workCompleted,
        $status, $estCost, 'Sample seed record.', $adminId,
    ]);
    $jobIds[] = (int) $database->lastInsertId();
}

// ---------------- Job card parts ----------------
$jobParts = [
    [$jobIds[0], $partIds[0], 1, 10.00],   // oil filter
    [$jobIds[0], $partIds[3], 1, 15.00],   // spark plugs
    [$jobIds[1], $partIds[4], 1, 140.00],  // alternator
    [$jobIds[2], $partIds[1], 2, 22.00],   // hino air filters
    [$jobIds[3], $partIds[2], 1, 38.00],   // brake pads
    [$jobIds[5], $partIds[6], 2, 72.00],   // shocks
];

$insertJobPart = $database->prepare(
    'INSERT INTO job_card_parts (job_card_id, spare_part_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
);
foreach ($jobParts as $row) {
    $insertJobPart->execute($row);
}

// ---------------- Invoices ----------------
$invoices = [
    ['INV-2026-0041', 0, 0, 0, 11, 'Paid', 45.00, 25.00, 0.00, 0.00],
    ['INV-2026-0042', 1, 1, 1, 8, 'Paid', 55.00, 140.00, 10.00, 0.00],
    ['INV-2026-0043', 3, 3, 2, 6, 'Unpaid', 180.00, 44.00, 0.00, 0.00],
    ['INV-2026-0044', 2, 2, 3, 4, 'Partially Paid', 202.00, 38.00, 0.00, 0.00],
    ['INV-2026-0045', 3, 4, 4, 2, 'Draft', 120.00, 78.00, 0.00, 0.00],
];

$insertInvoice = $database->prepare(
    'INSERT INTO invoices (invoice_number, customer_id, vehicle_id, job_card_id, invoice_date, due_date, service_charges, parts_charges, discount, tax, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
$invoiceIds = [];
foreach ($invoices as [$number, $cIdx, $vIdx, $jIdx, $daysAgo, $status, $service, $partsCharges, $discount, $tax]) {
    $insertInvoice->execute([
        $number, $customerIds[$cIdx], $vehicleIds[$vIdx], $jobIds[$jIdx],
        date('Y-m-d', strtotime("-{$daysAgo} days")),
        date('Y-m-d', strtotime('+14 days')),
        $service, $partsCharges, $discount, $tax, $status, 'Sample seed record.',
    ]);
    $invoiceIds[] = (int) $database->lastInsertId();
}

// ---------------- Payments ----------------
$payments = [
    [$invoiceIds[0], 11, 70.00, 'Cash', 'CSH-0001'],
    [$invoiceIds[1], 8, 185.00, 'EcoCash', 'EC-88213'],
    [$invoiceIds[3], 4, 150.00, 'Bank Transfer', 'TT-55021'],
];

$insertPayment = $database->prepare(
    'INSERT INTO payments (invoice_id, payment_date, amount, payment_method, reference_number) VALUES (?, ?, ?, ?, ?)'
);
foreach ($payments as [$invoiceId, $daysAgo, $amount, $method, $ref]) {
    $insertPayment->execute([$invoiceId, date('Y-m-d', strtotime("-{$daysAgo} days")), $amount, $method, $ref]);
}

// ---------------- Service requests ----------------
$requests = [
    ['Towing', 'Panashe Zvobgo', '+263779001122', 'panashe.z@gmail.com', 'AEW 4412', 'Roadside Assistance', '+2 days', 'Vehicle stalled on Enterprise Road, needs tow to workshop.'],
    ['Service', 'Melissa Dziwa', '+263779003344', null, 'ABX 9034', 'Full Service', '+5 days', 'Annual service due, 120,000 km.'],
    ['General Enquiry', 'Ropafadzo Chieza', '+263779005566', 'ropachieza@outlook.com', null, 'Diagnostics', null, 'Engine light came on after rain, would like a check.'],
];

$insertRequest = $database->prepare(
    'INSERT INTO service_requests (request_type, full_name, phone, email, registration_number, service_name, preferred_date, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
foreach ($requests as [$type, $name, $phone, $email, $reg, $service, $when, $message]) {
    $insertRequest->execute([
        $type, $name, $phone, $email, $reg, $service,
        $when !== null ? date('Y-m-d', strtotime($when)) : null,
        $message,
    ]);
}

$database->commit();

// ---------------- Summary ----------------
$summary = $database->query('SELECT * FROM dashboard_summary')->fetch();

printf("Seed complete.%s", PHP_EOL);
printf("  Customers: %d%s", count($customers), PHP_EOL);
printf("  Vehicles: %d%s", count($vehicles), PHP_EOL);
printf("  Mechanics: %d%s", count($mechanics), PHP_EOL);
printf("  Spare parts: %d%s", count($parts), PHP_EOL);
printf("  Job cards: %d%s", count($jobs), PHP_EOL);
printf("  Invoices: %d%s", count($invoices), PHP_EOL);
printf("  Payments: %d%s", count($payments), PHP_EOL);
printf("  Service requests: %d%s", count($requests), PHP_EOL);
echo '  Dashboard: ' . json_encode($summary) . PHP_EOL;
