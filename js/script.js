// LEC Mechanics — shared front-end behaviour
(function () {
    'use strict';

    /* ---------------- DARK / LIGHT THEME TOGGLE ---------------- */

    (function buildThemeToggle() {
        var KEY = 'lecTheme';

        // Apply saved preference immediately (before first paint if possible).
        var saved = null;
        try { saved = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
        var theme = saved === 'dark' || saved === 'light'
            ? saved
            : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);

        // Ensure <head> exists even for late injection.
        function apply(t) {
            document.documentElement.setAttribute('data-theme', t);
            try { localStorage.setItem(KEY, t); } catch (e) { /* ignore */ }
            var btn = document.querySelector('.theme-toggle');
            if (btn) {
                btn.textContent = t === 'dark' ? '☀️ Light' : '🌙 Dark';
                btn.setAttribute('aria-label', 'Switch to ' + (t === 'dark' ? 'light' : 'dark') + ' mode');
            }
        }

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theme-toggle';
        btn.addEventListener('click', function () {
            var current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            apply(current);
        });

        // Admin pages: fixed sidebar owns the left — place the toggle bottom-right.
        if (document.body.classList.contains('admin-body')) {
            btn.classList.add('theme-toggle-right');
        }
        document.body.appendChild(btn);
        apply(theme);
    })();

    /* ---------------- HERO BACKGROUND SLIDESHOW (crossfade) ---------------- */

    (function heroBackgroundSlideshow() {
        var slides = document.querySelectorAll('.hero-bg-slide');
        if (slides.length < 2) return;

        var current = 0;
        var INTERVAL = 6000; // 6 s per photo

        function goTo(index) {
            slides[current].classList.remove('active');
            current = (index + slides.length) % slides.length;
            slides[current].classList.add('active');
        }

        // Preload the remaining photos so the first crossfade is seamless.
        slides.forEach(function (slide) {
            var match = slide.style.backgroundImage && slide.style.backgroundImage.match(/url\(["']?(.+?)["']?\)/);
            if (match) { var img = new Image(); img.src = match[1]; }
        });

        // Pause while the tab is hidden so photos never skip.
        var timer = setInterval(function () { goTo(current + 1); }, INTERVAL);
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                clearInterval(timer);
            } else {
                timer = setInterval(function () { goTo(current + 1); }, INTERVAL);
            }
        });
    })();

    /* ---------------- BACK TO HOME BUTTON (every page except home) ---------------- */

    (function buildBackHome() {
        var path = window.location.pathname.replace(/\\/g, '/');
        var isHome = /(^|\/)index\.html$/.test(path) || path.slice(-1) === '/';
        if (isHome) return;

        var link = document.createElement('a');
        link.className = 'back-home-fab';
        link.href = document.body.classList.contains('admin-body') ? '../index.html' : '../index.html';
        // subpages (pages/) and admin pages both sit one level deep; root pages link plainly
        if (!/(^|\/)(pages|admin)\//.test(path)) link.href = 'index.html';
        link.innerHTML = '<span>←</span> Back to Home';
        document.body.appendChild(link);
    })();

    /* ---------------- MOBILE NAVIGATION ---------------- */

    function buildMobileNav() {
        var header = document.querySelector('.navbar');
        if (!header || header.querySelector('.nav-toggle')) return;

        var toggle = document.createElement('button');
        toggle.className = 'nav-toggle';
        toggle.type = 'button';
        toggle.setAttribute('aria-label', 'Toggle navigation menu');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.innerHTML = '<span></span><span></span><span></span>';
        header.insertBefore(toggle, header.querySelector('nav'));

        toggle.addEventListener('click', function () {
            var open = header.classList.toggle('nav-open');
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
    }

    buildMobileNav();

    /* ---------------- NAVBAR SCROLL SHADOW ---------------- */

    var navbar = document.querySelector('.navbar');
    if (navbar) {
        var updateNav = function () {
            navbar.classList.toggle('nav-scrolled', window.scrollY > 10);
        };
        window.addEventListener('scroll', updateNav, { passive: true });
        updateNav();
    }

    /* ---------------- WORK GALLERY SLIDESHOW ---------------- */

    var slideshow = document.getElementById('home-slideshow');
    if (slideshow) {
        var slides = slideshow.querySelectorAll('.slide');
        var dotsWrap = slideshow.querySelector('.slide-dots');
        var current = 0;
        var timer = null;
        var INTERVAL = 5000;

        var dots = [];
        slides.forEach(function (_, index) {
            var dot = document.createElement('button');
            dot.type = 'button';
            dot.setAttribute('aria-label', 'Go to photo ' + (index + 1));
            dot.addEventListener('click', function () {
                goTo(index);
                restart();
            });
            dotsWrap.appendChild(dot);
            dots.push(dot);
        });

        function goTo(index) {
            slides[current].classList.remove('active');
            dots[current].classList.remove('active');
            current = (index + slides.length) % slides.length;
            slides[current].classList.add('active');
            dots[current].classList.add('active');
        }

        function start() {
            timer = setInterval(function () {
                goTo(current + 1);
            }, INTERVAL);
        }

        function stop() {
            clearInterval(timer);
        }

        function restart() {
            stop();
            start();
        }

        slideshow.querySelector('.slide-arrow.prev').addEventListener('click', function () {
            goTo(current - 1);
            restart();
        });

        slideshow.querySelector('.slide-arrow.next').addEventListener('click', function () {
            goTo(current + 1);
            restart();
        });

        slideshow.addEventListener('mouseenter', stop);
        slideshow.addEventListener('mouseleave', start);

        // Pause auto-play while the tab is hidden so photos are never skipped.
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                stop();
            } else {
                restart();
            }
        });

        dots[0].classList.add('active');
        start();
    }

    /* ---------------- ADMIN-UPLOADED GALLERY (public site) ---------------- */

    function esc(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    (function loadAdminGallery() {
        var target = document.getElementById('admin-gallery');
        if (!target) return;

        // /api works from any page depth and on Vercel (relative path).
        var apiUrl = '../api?resource=gallery_images';

        fetch(apiUrl, { credentials: 'same-origin' })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                var items = (result && result.data) || [];
                if (!items.length) {
                    target.innerHTML = '';
                    return;
                }
                target.innerHTML = items.map(function (img) {
                    // Images are streamed by the API from the database.
                    var src = '../api?resource=gallery_image&id=' + encodeURIComponent(img.id);
                    var caption = img.caption ? esc(img.caption) : '';
                    return '<figure>' +
                        '<img src="' + src + '" alt="' + esc(img.title) + '" loading="lazy">' +
                        '<figcaption><strong>' + esc(img.title) + '</strong>' +
                        (caption ? '<span>' + caption + '</span>' : '') +
                        '</figcaption></figure>';
                }).join('');
            })
            .catch(function () {
                target.innerHTML = '';
            });
    })();

    /* ---------------- CONTACT / ENQUIRY FORM ---------------- */

    var form = document.getElementById('service-request-form');
    if (form) {
        var feedback = form.querySelector('.form-feedback');
        var submitButton = form.querySelector('button[type="submit"]');

        var showFeedback = function (message, isError) {
            if (!feedback) return;
            feedback.textContent = message;
            feedback.classList.toggle('form-error', Boolean(isError));
            feedback.classList.toggle('form-success', !isError);
            feedback.hidden = false;
        };

        form.addEventListener('submit', function (event) {
            event.preventDefault();

            var data = {
                request_type: form.requestType.value || 'General Enquiry',
                full_name: form.fullName.value.trim(),
                phone: form.phone.value.trim(),
                email: form.email.value.trim() || null,
                registration_number: form.registration.value.trim() || null,
                service_name: form.serviceName.value || null,
                preferred_date: form.preferredDate.value || null,
                message: form.message.value.trim()
            };

            if (!data.full_name || !data.phone || !data.message) {
                showFeedback('Please fill in your name, phone number and message.', true);
                return;
            }

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Sending...';
            }

// API base — /api on Vercel (rewrite), PHP fallback locally without a rewrite.
            var API_BASE = '/api';

            fetch(API_BASE + '?resource=service_requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
                .then(function (response) {
                    return response.text().then(function (text) {
                        var result = null;
                        try {
                            result = JSON.parse(text);
                        } catch (parseError) {
                            result = null;
                        }
                        if (!response.ok || !result) {
                            throw new Error(
                                (result && result.error) ||
                                    'We could not submit your request right now. ' +
                                    'Please call us on 0771 232 171 instead.'
                            );
                        }
                        return result;
                    });
                })
                .then(function (result) {
                    var code = result && result.tracking_code;
                    showFeedback(
                        'Thank you! Your request has been received.' +
                        (code
                            ? ' Your tracking code is ' + code +
                              ' — save it and use it on the Track Service page to follow your approval status.'
                            : ' We will get back to you shortly.'),
                        false
                    );
                    form.reset();
                })
                .catch(function () {
                    showFeedback(
                        'We could not submit your request right now. ' +
                            'Please call us on 0771 232 171 or reach us on WhatsApp.',
                        true
                    );
                })
                .finally(function () {
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.textContent = 'Send Request';
                    }
                });
        });
    }

    /* ---------------- APPRENTICESHIP APPLICATION FORM (services.html) ---------------- */

    var appForm = document.getElementById('apprenticeship-form-el');
    if (appForm) {
        var appFeedback = appForm.querySelector('.form-feedback');
        var appButton = appForm.querySelector('button[type="submit"]');

        var showAppFeedback = function (message, isError) {
            if (!appFeedback) return;
            appFeedback.textContent = message;
            appFeedback.classList.toggle('form-error', Boolean(isError));
            appFeedback.classList.toggle('form-success', !isError);
            appFeedback.hidden = false;
        };

        appForm.addEventListener('submit', function (event) {
            event.preventDefault();

            var data = {
                request_type: 'Apprenticeship',
                full_name: (appForm.firstName.value.trim() + ' ' + appForm.lastName.value.trim()).trim(),
                first_name: appForm.firstName.value.trim(),
                last_name: appForm.lastName.value.trim(),
                age: appForm.age.value ? Number(appForm.age.value) : null,
                phone: appForm.phone.value.trim(),
                o_level_results: appForm.oLevel.value.trim() || null,
                a_level_results: appForm.aLevel.value.trim() || null,
                technical_subjects: appForm.technical.value.trim() || null,
                drivers_licence: appForm.licence.value || 'None',
                message: appForm.message.value.trim()
            };

            if (!data.first_name || !data.last_name || !data.phone || !data.message) {
                showAppFeedback('Please fill in your name, surname, phone number and motivation.', true);
                return;
            }

            if (appButton) {
                appButton.disabled = true;
                appButton.textContent = 'Submitting...';
            }

            fetch('/api?resource=service_requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
                .then(function (response) {
                    return response.json().then(function (result) {
                        if (!response.ok || !result.success) {
                            throw new Error(result.error || 'Submission failed.');
                        }
                        return result;
                    });
                })
                .then(function (result) {
                    var code = result && result.tracking_code;
                    showAppFeedback(
                        'Thank you! Your application has been received.' +
                        (code
                            ? ' Your tracking code is ' + code +
                              ' — save it and use it on the Track page to see if you have been approved.'
                            : ' We will get back to you shortly.'),
                        false
                    );
                    appForm.reset();
                })
                .catch(function () {
                    showAppFeedback(
                        'We could not submit your application right now. Please call us on 0771 232 171.',
                        true
                    );
                })
                .finally(function () {
                    if (appButton) {
                        appButton.disabled = false;
                        appButton.textContent = 'Submit Application';
                    }
                });
        });
    }

    /* ---------------- LEGAL FOOTER BAR (every public page, admin excluded) ---------------- */

    (function buildLegalBar() {
        if (document.body.classList.contains('admin-body')) return;
        if (document.getElementById('lec-legal-bar')) return;

        var path = window.location.pathname.replace(/\\/g, '/');
        var inPages = /(^|\/)pages\//.test(path);
        var prefix = inPages ? '' : 'pages/';
        if (/terms|privacy|cookies/.test(path)) return; // the legal pages already link between themselves

        var bar = document.createElement('div');
        bar.id = 'lec-legal-bar';
        bar.style.cssText =
            'display:flex;flex-wrap:wrap;gap:6px 22px;justify-content:center;align-items:center;' +
            'padding:14px 20px;font-size:12.5px;border-top:1px solid rgba(128,128,128,.2);' +
            'background:rgba(128,128,128,.06);';
        bar.innerHTML =
            '<a href="' + prefix + 'terms.html">Terms &amp; Conditions</a>' +
            '<a href="' + prefix + 'privacy.html">Privacy Policy</a>' +
            '<a href="' + prefix + 'cookies.html">Cookies Preferences</a>' +
            '<span style="opacity:.55;">Functional cookies only — no advertising trackers.</span>';
        bar.querySelectorAll('a').forEach(function (a) {
            a.style.cssText = 'text-decoration:none;font-weight:600;';
            a.addEventListener('mouseenter', function () { a.style.textDecoration = 'underline'; });
            a.addEventListener('mouseleave', function () { a.style.textDecoration = 'none'; });
        });

        // Place the bar just before the footer (or at the end of the body).
        var footer = document.querySelector('footer.site-footer') || document.querySelector('footer.footer') || document.body;
        footer.parentNode.insertBefore(bar, footer);
    })();

    (function serviceTracker() {
        var form = document.getElementById('track-form');
        if (!form) return;

        var resultBox = document.getElementById('track-result');
        var feedback = form.querySelector('.form-feedback');
        var input = document.getElementById('track-code');
        var submitButton = form.querySelector('button[type="submit"]');

        // Ordered flow a request passes through after the admin reviews it.
        var STEPS = [
            { key: 'Received',   label: 'Request Received',        note: 'Your request is in our system and waiting for review.' },
            { key: 'In Review',  label: 'Under Review',            note: 'Our team is reviewing your request.' },
            { key: 'Approved',   label: 'Approved by Admin',       note: 'Good news — the admin has approved your request.' },
            { key: 'Scheduled',  label: 'Booked & Scheduled',      note: 'Your service has been scheduled. See the date below.' },
            { key: 'Completed',  label: 'Service Completed',       note: 'The work is done. Thank you for choosing LEC Mechanics.' }
        ];
        var STEP_FOR_STATUS = { 'New': 0, 'Contacted': 1, 'Approved': 2, 'Scheduled': 3, 'Completed': 4 };
        function esc(value) {
            return String(value === null || value === undefined ? '' : value)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function showFeedback(message, isError) {
            if (!feedback) return;
            feedback.textContent = message;
            feedback.classList.toggle('form-error', Boolean(isError));
            feedback.classList.toggle('form-success', !isError);
            feedback.hidden = false;
        }

        function fmtDate(value) {
            if (!value) return '—';
            var d = new Date(String(value).replace(' ', 'T'));
            return isNaN(d) ? esc(value) : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        }

        function render(request) {
            if (!resultBox) return;
            var status = request.status || 'New';
            var code = esc(request.tracking_code || '');
            var isApprenticeship = (request.request_type || '') === 'Apprenticeship';

            /* ---- FINAL STATES ---- */

            // Car fixed: green success card.
            if (status === 'Car Fixed' || status === 'Completed') {
                resultBox.innerHTML =
                    '<div class="track-card track-success">' +
                        '<span class="track-status-pill track-pill-success">✔ Car Fixed</span>' +
                        '<h3>Your car is fixed! 🎉</h3>' +
                        '<p>All work has been completed. You can collect your vehicle at your convenience — ' +
                        'or call us on 0771 232 171 to arrange anything further.</p>' +
                        '<dl class="track-details">' +
                            '<div><dt>Code</dt><dd>' + code + '</dd></div>' +
                            '<div><dt>Service</dt><dd>' + esc(request.service_name || request.request_type) + '</dd></div>' +
                            '<div><dt>Vehicle</dt><dd>' + esc(request.registration_number || '—') + '</dd></div>' +
                            '<div><dt>Submitted</dt><dd>' + fmtDate(request.created_at) + '</dd></div>' +
                            '<div><dt>Last update</dt><dd>' + fmtDate(request.updated_at) + '</dd></div>' +
                        '</dl>' +
                    '</div>';
                resultBox.hidden = false;
                return;
            }

            // Not done: red card with a clear explanation.
            if (status === 'Not Done') {
                resultBox.innerHTML =
                    '<div class="track-card track-declined">' +
                        '<span class="track-status-pill track-pill-declined">✖ Not Done</span>' +
                        '<h3>We could not complete this job</h3>' +
                        '<p>Unfortunately we were unable to fix this vehicle due to circumstances beyond our control ' +
                        '(for example unavailable parts or a fault we could not reproduce). ' +
                        'Please call us on 0771 232 171 to discuss the way forward.</p>' +
                        '<dl class="track-details">' +
                            '<div><dt>Code</dt><dd>' + code + '</dd></div>' +
                            '<div><dt>Service</dt><dd>' + esc(request.service_name || request.request_type) + '</dd></div>' +
                            '<div><dt>Submitted</dt><dd>' + fmtDate(request.created_at) + '</dd></div>' +
                        '</dl>' +
                    '</div>';
                resultBox.hidden = false;
                return;
            }

            // Declined (service request) or disapproved (apprenticeship).
            if (status === 'Declined' || status === 'Closed') {
                var closedNote = status === 'Declined'
                    ? (isApprenticeship
                        ? 'Unfortunately your apprenticeship application was not successful this time. Keep trying — new intakes open regularly.'
                        : 'Unfortunately this request was not approved. Please call us on 0771 232 171 to discuss it.')
                    : 'This request has been closed. If you still need service, please submit a new request or call us.';
                resultBox.innerHTML =
                    '<div class="track-card track-declined">' +
                        '<span class="track-status-pill">' + esc(status) + '</span>' +
                        '<h3>Request ' + esc(status) + '</h3>' +
                        '<p>' + closedNote + '</p>' +
                        '<dl class="track-details">' +
                            '<div><dt>Code</dt><dd>' + code + '</dd></div>' +
                            '<div><dt>Type</dt><dd>' + esc(request.request_type) + '</dd></div>' +
                            '<div><dt>Submitted</dt><dd>' + fmtDate(request.created_at) + '</dd></div>' +
                        '</dl>' +
                    '</div>';
                resultBox.hidden = false;
                return;
            }

            /* ---- APPRENTICESHIP PROGRESS ---- */
            if (isApprenticeship) {
                var appSteps = [
                    { key: 'New',      label: 'Application Received', note: 'Your apprenticeship application is in our system and waiting for review.' },
                    { key: 'Approved', label: 'Application Approved ✅', note: 'Congratulations! Your application has been approved. Our team will call you on the number you provided to discuss the next steps.' }
                ];
                var appIndex = status === 'Approved' || status === 'Scheduled' ? 1 : 0;
                var appStepsHtml = appSteps.map(function (step, index) {
                    var state = index < appIndex ? 'done' : (index === appIndex ? 'current' : 'todo');
                    return '<li class="track-step ' + state + '">' +
                        '<span class="track-step-dot"></span>' +
                        '<div><strong>' + esc(step.label) + '</strong>' +
                        (state === 'current' ? '<p>' + esc(step.note) + '</p>' : '') +
                        '</div></li>';
                }).join('');
                resultBox.innerHTML =
                    '<div class="track-card">' +
                        '<span class="track-status-pill">' + esc(status === 'Scheduled' ? 'Approved' : status) + '</span>' +
                        '<h3>' + esc(appSteps[appIndex].label) + '</h3>' +
                        '<p>' + esc(appSteps[appIndex].note) + '</p>' +
                        '<ol class="track-steps">' + appStepsHtml + '</ol>' +
                        '<dl class="track-details">' +
                            '<div><dt>Code</dt><dd>' + code + '</dd></div>' +
                            '<div><dt>Applicant</dt><dd>' + esc(request.full_name) + '</dd></div>' +
                            '<div><dt>Submitted</dt><dd>' + fmtDate(request.created_at) + '</dd></div>' +
                        '</dl>' +
                    '</div>';
                resultBox.hidden = false;
                return;
            }

            /* ---- SERVICE PROGRESS (steps) ---- */
            var current = STEP_FOR_STATUS[status] !== undefined ? STEP_FOR_STATUS[status] : 0;
            var stepsHtml = STEPS.map(function (step, index) {
                var state = index < current ? 'done' : (index === current ? 'current' : 'todo');
                return '<li class="track-step ' + state + '">' +
                    '<span class="track-step-dot"></span>' +
                    '<div><strong>' + esc(step.label) + '</strong>' +
                    (state === 'current' ? '<p>' + esc(step.note) + '</p>' : '') +
                    '</div></li>';
            }).join('');

            resultBox.innerHTML =
                '<div class="track-card">' +
                    '<span class="track-status-pill">' + esc(status) + '</span>' +
                    '<h3>' + esc(STEPS[current].label) + '</h3>' +
                    '<p>' + esc(STEPS[current].note) + '</p>' +
                    '<ol class="track-steps">' + stepsHtml + '</ol>' +
                    '<dl class="track-details">' +
                        '<div><dt>Code</dt><dd>' + code + '</dd></div>' +
                        '<div><dt>Service</dt><dd>' + esc(request.service_name || request.request_type) + '</dd></div>' +
                        '<div><dt>Vehicle</dt><dd>' + esc(request.registration_number || '—') + '</dd></div>' +
                        '<div><dt>Preferred date</dt><dd>' + fmtDate(request.preferred_date) + '</dd></div>' +
                        '<div><dt>Submitted</dt><dd>' + fmtDate(request.created_at) + '</dd></div>' +
                        '<div><dt>Last update</dt><dd>' + fmtDate(request.updated_at) + '</dd></div>' +
                    '</dl>' +
                '</div>';
            resultBox.hidden = false;
        }

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            var code = (input && input.value || '').trim().toUpperCase();
            if (!code) {
                showFeedback('Enter your tracking code, e.g. LEC-4F7A2B.', true);
                return;
            }
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Checking…';
            }
            fetch('/api?resource=track&code=' + encodeURIComponent(code), {
                credentials: 'same-origin'
            })
                .then(function (response) {
                    return response.json().then(function (result) {
                        if (!response.ok || !result.found) {
                            throw new Error(result.error || 'No request found for that code.');
                        }
                        return result;
                    });
                })
                .then(function (result) {
                    showFeedback('');
                    feedback.hidden = true;
                    render(result.request);
                })
                .catch(function (error) {
                    if (resultBox) resultBox.hidden = true;
                    showFeedback(error.message || 'Something went wrong. Please try again.', true);
                })
                .finally(function () {
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.textContent = 'Track';
                    }
                });
        });
    })();
})();
