// One-off: add OG/Twitter meta tags to public subpages (idempotent).
const fs = require('fs');

const pages = [
  ['pages/services.html', 'Services | LEC Mechanics Harare', 'Mechanical repairs, auto electrical, diagnostics, brakes, towing, roadside assistance and apprenticeships in Harare.'],
  ['pages/about.html', 'About Us | LEC Mechanics', 'A Harare automotive garage built on quality workmanship, reliable diagnostics and customer-focused service.'],
  ['pages/contact.html', 'Contact | LEC Mechanics', 'Request a service, get a free quote, or reach LEC Mechanics 24/7 for towing and roadside assistance in Harare.'],
  ['pages/track.html', 'Track Your Service | LEC Mechanics', 'Enter your tracking code to follow the progress of your service request at LEC Mechanics.'],
  ['pages/gallery.html', 'Project Portfolio | LEC Mechanics', 'Browse photos of real jobs from our Harare workshop, organised by project folder.'],
  ['pages/terms.html', 'Terms & Conditions | LEC Mechanics', 'Terms and conditions for using LEC Mechanics services and website.'],
  ['pages/privacy.html', 'Privacy Policy | LEC Mechanics', 'How LEC Mechanics collects, uses and protects your personal information.'],
  ['pages/cookies.html', 'Cookies Preferences | LEC Mechanics', 'How LEC Mechanics uses cookies and how to manage your preferences.'],
];

for (const [file, title, desc] of pages) {
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('property="og:title"')) {
    console.log('skip (already has og):', file);
    continue;
  }
  const url = 'https://lec-mechanics.vercel.app/' + file.replace(/\\/g, '/').replace('.html', '');
  const og = [
    '    <meta property="og:title" content="' + title + '">',
    '    <meta property="og:description" content="' + desc + '">',
    '    <meta property="og:type" content="website">',
    '    <meta property="og:image" content="https://lec-mechanics.vercel.app/images/favicon.svg">',
    '    <meta property="og:url" content="' + url + '">',
    '    <meta name="twitter:card" content="summary">',
  ].join('\n') + '\n';

  const marker = /(<meta name="description"[^\n]*\n)/;
  if (!marker.test(html)) {
    console.error('NO DESCRIPTION MARKER in', file);
    continue;
  }
  html = html.replace(marker, '$1' + og);
  fs.writeFileSync(file, html);
  console.log('og added:', file);
}
