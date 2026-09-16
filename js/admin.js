// LEC Mechanics — admin panel logic (shared across all admin pages)
// Talks to ../backend/api/index.php using cookie-based sessions.
(function () {
    'use strict';

    var API_URL = '/api';  // Vercel rewrite + local dev server

    /* ================= helpers ================= */

    function $(id) {
        return document.getElementById(id);
    }

    function esc(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function money(value) {
        var n = Number(value || 0);
        return '$' + n.toFixed(2);
    }

    function today() {
        return new Date().toISOString().slice(0, 10);
    }

    function toast(message, isError) {
        var existing = document.getElementById('lec-toast');
        if (existing) existing.remove();

        var el = document.createElement('div');
        el.id = 'lec-toast';
        el.textContent = message;
        el.style.cssText =
            'position:fixed;top:20px;right:20px;z-index:10000;padding:12px 18px;' +
            'border-radius:8px;color:#fff;font-size:14px;max-width:360px;box-shadow:0 6px 20px rgba(0,0,0,.25);' +
            'background:' + (isError ? '#c0392b' : '#1e8e3e') + ';';
        document.body.appendChild(el);
        setTimeout(function () { el.remove(); }, 3500);
    }

    /* ================= API ================= */

    // CSRF token issued by the server at login; sent on every state-changing request.
    var csrfToken = sessionStorage.getItem('lecCsrfToken') || '';

    // Warn the user when Caps Lock is on in a password field.
    function wireCapsLockWarning(input, hintEl) {
        if (!input || !hintEl) return;
        function update(event) {
            var on = event && typeof event.getModifierState === 'function' && event.getModifierState('CapsLock');
            hintEl.textContent = on ? '⚠ Caps Lock is ON — passwords are case-sensitive' : '';
        }
        input.addEventListener('keydown', update);
        input.addEventListener('keyup', update);
        input.addEventListener('blur', function () { hintEl.textContent = ''; });
    }

    function setCsrfToken(token) {
        csrfToken = token || '';
        if (token) {
            sessionStorage.setItem('lecCsrfToken', token);
        } else {
            sessionStorage.removeItem('lecCsrfToken');
        }
    }

    function api(resource, options) {
        options = options || {};
        var url = new URL(API_URL, window.location.href);
        url.searchParams.set('resource', resource);
        if (options.action) url.searchParams.set('action', options.action);
        if (options.id) url.searchParams.set('id', options.id);

        var init = {
            method: options.method || 'GET',
            credentials: 'same-origin',
            headers: {}
        };
        if (options.body !== undefined && options.body !== null) {
            init.headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(options.body);
        }
        if (csrfToken && init.method !== 'GET') {
            init.headers['X-CSRF-Token'] = csrfToken;
        }

        return fetch(url.toString(), init).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
                if (!response.ok) {
                    var error = new Error(data.error || ('Request failed (' + response.status + ')'));
                    error.status = response.status;
                    error.body = data;
                    throw error;
                }
                return data;
            });
        });
    }

    /* ================= mobile admin drawer ================= */

    function buildMobileDrawer() {
        if (!document.body.classList.contains('admin-body')) return;
        var header = document.querySelector('.admin-header');
        var sidebar = document.querySelector('.sidebar');
        if (!header || !sidebar || document.getElementById('lec-admin-toggle')) return;

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.id = 'lec-admin-toggle';
        toggle.className = 'admin-menu-toggle';
        toggle.setAttribute('aria-label', 'Toggle navigation menu');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.innerHTML = '<span></span><span></span><span></span>';
        header.insertBefore(toggle, header.firstChild);

        var overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);

        function setOpen(open) {
            document.body.classList.toggle('sidebar-open', open);
            toggle.classList.toggle('open', open);
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        toggle.addEventListener('click', function () {
            setOpen(!document.body.classList.contains('sidebar-open'));
        });
        overlay.addEventListener('click', function () { setOpen(false); });

        // Close the drawer when a menu link is clicked (phone navigation).
        sidebar.addEventListener('click', function (event) {
            if (event.target.closest('a')) setOpen(false);
        });
    }

    if (document.readyState !== 'loading') buildMobileDrawer();
    else document.addEventListener('DOMContentLoaded', buildMobileDrawer);

    /* ================= auth guard + login overlay ================= */

    var currentUser = null;

    function setUser(user) {
        currentUser = user;
        if (!user) return;
        var boxes = document.querySelectorAll('.admin-user');
        boxes.forEach(function (box) {
            var strong = box.querySelector('strong');
            var small = box.querySelector('small');
            var avatar = box.querySelector('.user-avatar');
            if (strong) strong.textContent = user.full_name;
            if (small) small.textContent = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '';
            if (avatar) avatar.textContent = (user.full_name || 'A').trim().charAt(0).toUpperCase();
        });
    }

    var SECURITY_QUESTIONS = [
        'What was the name of your first pet?',
        'What is your mother\'s maiden name?',
        'What city were you born in?',
        'What was your first car?',
        'What is the name of your primary school?'
    ];

    function passwordRuleText() {
        return 'At least 8 characters, with an uppercase letter, a lowercase letter, and a number.';
    }

    function inputStyle() {
        return 'width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #ccc;border-radius:8px;font-size:14px;';
    }

    function labelStyle() {
        return 'display:block;font-size:13px;font-weight:600;margin:12px 0 4px;';
    }

    function showLogin() {
        if (document.getElementById('lec-login-overlay')) return;

        var overlay = document.createElement('div');
        overlay.id = 'lec-login-overlay';
        overlay.style.cssText =
            'position:fixed;inset:0;z-index:9999;background:rgba(8,12,20,.88);' +
            'display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;';

        overlay.innerHTML =
            '<div style="background:#fff;border-radius:14px;padding:34px 30px;width:100%;max-width:380px;' +
            'box-shadow:0 20px 60px rgba(0,0,0,.45);font-family:inherit;margin:auto;">' +
            '<div style="text-align:center;margin-bottom:22px;">' +
            '<div style="font-size:26px;font-weight:800;letter-spacing:1px;">LEC <span style="opacity:.55;">MECHANICS</span></div>' +
            '<div style="font-size:12px;letter-spacing:3px;opacity:.5;margin-top:4px;">ADMIN SIGN IN</div>' +
            '</div>' +
            '<form id="lec-login-form">' +
            '<label style="' + labelStyle() + '">Email</label>' +
            '<input id="lec-login-email" type="email" required autocomplete="username" style="' + inputStyle() + '">' +
            '<label style="' + labelStyle() + '">Password</label>' +
            '<input id="lec-login-password" type="password" required autocomplete="current-password" style="' + inputStyle() + '">' +
            '<small id="lec-caps-hint" style="display:block;color:#c0392b;font-size:12px;margin-top:4px;min-height:14px;"></small>' +
            '<div id="lec-setup-fields" hidden>' +
            '<label style="' + labelStyle() + '">Full name</label>' +
            '<input id="lec-setup-name" type="text" style="' + inputStyle() + '">' +
            '<label style="' + labelStyle() + '">Security question</label>' +
            '<select id="lec-setup-question" style="' + inputStyle() + '">' +
            SECURITY_QUESTIONS.map(function (q) { return '<option>' + q + '</option>'; }).join('') +
            '</select>' +
            '<label style="' + labelStyle() + '">Security answer</label>' +
            '<input id="lec-setup-answer" type="text" autocomplete="off" style="' + inputStyle() + '">' +
            '<small style="display:block;color:#777;font-size:12px;margin-top:4px;">Used to recover your password if you forget it. Case and extra spaces are ignored.</small>' +
            '<div style="background:#f6f7f9;border-radius:8px;padding:10px 12px;margin-top:12px;font-size:12px;color:#555;">' +
            passwordRuleText() +
            '</div>' +
            '</div>' +
            '<div id="lec-login-error" style="color:#c0392b;font-size:13px;margin-top:12px;min-height:16px;"></div>' +
            '<button type="submit" id="lec-login-submit" ' +
            'style="width:100%;margin-top:6px;padding:12px;border:0;border-radius:8px;background:#111;color:#fff;' +
            'font-size:15px;font-weight:700;cursor:pointer;">Sign In</button>' +
            '</form>' +
            '<button type="button" id="lec-setup-toggle" ' +
            'style="display:block;margin:14px auto 0;background:none;border:0;color:#555;font-size:12px;' +
            'text-decoration:underline;cursor:pointer;">First time here? Create the admin account</button>' +
            '<button type="button" id="lec-forgot-toggle" ' +
            'style="display:block;margin:8px auto 0;background:none;border:0;color:#555;font-size:12px;' +
            'text-decoration:underline;cursor:pointer;">Forgot password?</button>' +
            '<form id="lec-forgot-form" hidden style="margin-top:10px;">' +
            '<label style="' + labelStyle() + '">Account email</label>' +
            '<input id="lec-forgot-email" type="email" required style="' + inputStyle() + '">' +
            '<button type="button" id="lec-forgot-lookup" ' +
            'style="width:100%;margin-top:12px;padding:10px;border:0;border-radius:8px;background:#333;color:#fff;' +
            'font-size:14px;font-weight:600;cursor:pointer;">Get security question</button>' +
            '<div id="lec-forgot-step2" hidden>' +
            '<label style="' + labelStyle() + '" id="lec-forgot-question-label"></label>' +
            '<input id="lec-forgot-answer" type="text" autocomplete="off" style="' + inputStyle() + '">' +
            '<label style="' + labelStyle() + '">New password</label>' +
            '<input id="lec-forgot-password" type="password" autocomplete="new-password" style="' + inputStyle() + '">' +
            '<small style="display:block;color:#777;font-size:12px;margin-top:4px;">' + passwordRuleText() + '</small>' +
            '<button type="submit" ' +
            'style="width:100%;margin-top:12px;padding:10px;border:0;border-radius:8px;background:#111;color:#fff;' +
            'font-size:14px;font-weight:600;cursor:pointer;">Reset password</button>' +
            '</div>' +
            '</form>' +
            '</div>';

        document.body.appendChild(overlay);

        var form = overlay.querySelector('#lec-login-form');
        var errorBox = overlay.querySelector('#lec-login-error');
        var setupFields = overlay.querySelector('#lec-setup-fields');
        var setupToggle = overlay.querySelector('#lec-setup-toggle');
        var submitBtn = overlay.querySelector('#lec-login-submit');
        var setupMode = false;

        wireCapsLockWarning(overlay.querySelector('#lec-login-password'), overlay.querySelector('#lec-caps-hint'));

        var forgotForm = overlay.querySelector('#lec-forgot-form');
        var forgotToggle = overlay.querySelector('#lec-forgot-toggle');
        var forgotStep2 = overlay.querySelector('#lec-forgot-step2');
        var forgotErrorShownOnLogin = false;

        setupToggle.addEventListener('click', function () {
            setupMode = !setupMode;
            setupFields.hidden = !setupMode;
            submitBtn.textContent = setupMode ? 'Create Admin Account' : 'Sign In';
            setupToggle.textContent = setupMode
                ? 'Already have an account? Sign in'
                : 'First time here? Create the admin account';
            forgotForm.hidden = true;
            forgotToggle.hidden = setupMode;
        });

        forgotToggle.addEventListener('click', function () {
            form.hidden = !form.hidden;
            forgotForm.hidden = !forgotForm.hidden;
            setupToggle.hidden = !forgotForm.hidden;
            errorBox.textContent = '';
            if (!forgotForm.hidden) {
                overlay.querySelector('#lec-forgot-email').value = overlay.querySelector('#lec-login-email').value;
            }
        });

        overlay.querySelector('#lec-forgot-lookup').addEventListener('click', function () {
            errorBox.textContent = '';
            api('auth', {
                method: 'POST',
                action: 'forgot-question',
                body: { email: overlay.querySelector('#lec-forgot-email').value.trim() }
            }).then(function (result) {
                overlay.querySelector('#lec-forgot-question-label').textContent = result.security_question;
                forgotStep2.hidden = false;
            }).catch(function (error) {
                errorBox.textContent = error.message;
            });
        });

        forgotForm.addEventListener('submit', function (event) {
            event.preventDefault();
            errorBox.textContent = '';
            api('auth', {
                method: 'POST',
                action: 'forgot-reset',
                body: {
                    email: overlay.querySelector('#lec-forgot-email').value.trim(),
                    security_answer: overlay.querySelector('#lec-forgot-answer').value,
                    new_password: overlay.querySelector('#lec-forgot-password').value
                }
            }).then(function (result) {
                toast(result.message || 'Password reset.');
                forgotToggle.click(); // back to sign-in
            }).catch(function (error) {
                errorBox.textContent = error.message;
            });
        });

        var lockoutTimer = null;

        function startLockoutCountdown(seconds) {
            if (lockoutTimer) {
                clearInterval(lockoutTimer);
                lockoutTimer = null;
            }
            var remaining = seconds;
            var update = function () {
                var minutes = Math.floor(remaining / 60);
                var secs = remaining % 60;
                errorBox.textContent = 'Account locked: too many failed attempts. Try again in ' +
                    minutes + 'm ' + (secs < 10 ? '0' : '') + secs + 's.';
                submitBtn.disabled = true;
                if (remaining <= 0) {
                    clearInterval(lockoutTimer);
                    lockoutTimer = null;
                    errorBox.textContent = '';
                    submitBtn.disabled = false;
                    return;
                }
                remaining--;
            };
            update();
            lockoutTimer = setInterval(update, 1000);
        }

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            errorBox.textContent = '';
            var email = overlay.querySelector('#lec-login-email').value.trim();
            var password = overlay.querySelector('#lec-login-password').value;

            if (submitBtn.disabled && lockoutTimer) return; // mid-lockout: ignore
            submitBtn.disabled = true;

            var request;
            if (setupMode) {
                request = api('auth', {
                    method: 'POST',
                    action: 'setup',
                    body: {
                        full_name: overlay.querySelector('#lec-setup-name').value.trim(),
                        email: email,
                        password: password,
                        security_question: overlay.querySelector('#lec-setup-question').value,
                        security_answer: overlay.querySelector('#lec-setup-answer').value
                    }
                }).then(function () {
                    return api('auth', { method: 'POST', action: 'login', body: { email: email, password: password } });
                });
            } else {
                request = api('auth', { method: 'POST', action: 'login', body: { email: email, password: password } });
            }

            request.then(function (result) {
                if (lockoutTimer) {
                    clearInterval(lockoutTimer);
                    lockoutTimer = null;
                }
                if (result.csrf_token) setCsrfToken(result.csrf_token);
                overlay.remove();
                setUser(result.user);
                boot();
            }).catch(function (error) {
                var data = error.body || {};
                if (data.locked && data.retry_after_seconds) {
                    startLockoutCountdown(data.retry_after_seconds);
                } else {
                    errorBox.textContent = error.message;
                }
            }).finally(function () {
                if (!lockoutTimer) submitBtn.disabled = false;
            });
        });
    }

    function wireLogout() {
        document.querySelectorAll('.sidebar-bottom a[href="#"]').forEach(function (link) {
            if (/logout/i.test(link.textContent)) {
                link.addEventListener('click', function (event) {
                    event.preventDefault();
                    api('auth', { method: 'POST', action: 'logout' }).finally(function () {
                        setCsrfToken('');
                        window.location.reload();
                    });
                });
            }
        });

        // Settings link opens the security panel instead of doing nothing.
        document.querySelectorAll('.sidebar-bottom a[href="#"]').forEach(function (link) {
            if (/settings/i.test(link.textContent)) {
                link.addEventListener('click', function (event) {
                    event.preventDefault();
                    showSecurityPanel();
                });
            }
        });
    }

    /* ================= security settings panel ================= */

    function showSecurityPanel() {
        if (document.getElementById('lec-security-overlay')) return;

        api('auth', { action: 'me' }).then(function (me) {
            var overlay = document.createElement('div');
            overlay.id = 'lec-security-overlay';
            overlay.style.cssText =
                'position:fixed;inset:0;z-index:9999;background:rgba(8,12,20,.7);' +
                'display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow:auto;';

            var maxAdmins = me.max_admins || 2;
            var canCreateAdmin = (me.user_count || 0) < maxAdmins;
            var hasQuestion = Boolean(me.security_question);

            overlay.innerHTML =
                '<div style="background:#fff;border-radius:14px;padding:30px;width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,.45);font-family:inherit;margin:auto;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
                '<h2 style="margin:0;font-size:20px;">Security &amp; Account</h2>' +
                '<button type="button" id="lec-sec-close" style="border:0;background:none;font-size:22px;cursor:pointer;line-height:1;">&times;</button>' +
                '</div>' +
                '<p style="margin:0 0 18px;color:#666;font-size:13px;">Admin accounts: <strong>' + (me.user_count || 0) + ' of ' + maxAdmins + '</strong>' +
                (canCreateAdmin ? '' : ' — the cap is reached.') + '</p>' +
                '<div id="lec-sec-admin-list" style="margin:0 0 18px;"><em style="color:#999;font-size:13px;">Loading accounts…</em></div>' +

                /* --- security question --- */
                '<form id="lec-sec-question-form" style="border-top:1px solid #eee;padding-top:16px;">' +
                '<h3 style="margin:0 0 8px;font-size:15px;">Security question</h3>' +
                '<p style="margin:0 0 10px;color:#777;font-size:12px;">' +
                (hasQuestion ? 'A security question is set for your account. You can replace it below.' : 'No security question set yet — set one so you can recover your password.') + '</p>' +
                '<label style="' + labelStyle() + '">Question</label>' +
                '<select id="lec-sec-question" style="' + inputStyle() + '">' +
                SECURITY_QUESTIONS.map(function (q) { return '<option>' + q + '</option>'; }).join('') +
                '</select>' +
                '<label style="' + labelStyle() + '">Answer</label>' +
                '<input id="lec-sec-answer" type="text" autocomplete="off" style="' + inputStyle() + '">' +
                '<button type="submit" style="margin-top:12px;padding:10px 16px;border:0;border-radius:8px;background:#111;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Save security question</button>' +
                '</form>' +

                /* --- create second admin --- */
                (canCreateAdmin
                    ? '<form id="lec-sec-admin-form" style="border-top:1px solid #eee;margin-top:18px;padding-top:16px;">' +
                      '<h3 style="margin:0 0 8px;font-size:15px;">Create the second admin</h3>' +
                      '<label style="' + labelStyle() + '">Full name</label>' +
                      '<input id="lec-sec-admin-name" type="text" style="' + inputStyle() + '">' +
                      '<label style="' + labelStyle() + '">Email</label>' +
                      '<input id="lec-sec-admin-email" type="email" style="' + inputStyle() + '">' +
                      '<label style="' + labelStyle() + '">Password</label>' +
                      '<input id="lec-sec-admin-password" type="password" autocomplete="new-password" style="' + inputStyle() + '">' +
                      '<small style="display:block;color:#777;font-size:12px;margin-top:4px;">' + passwordRuleText() + '</small>' +
                      '<label style="' + labelStyle() + '">Security question</label>' +
                      '<select id="lec-sec-admin-question" style="' + inputStyle() + '">' +
                      SECURITY_QUESTIONS.map(function (q) { return '<option>' + q + '</option>'; }).join('') +
                      '</select>' +
                      '<label style="' + labelStyle() + '">Security answer</label>' +
                      '<input id="lec-sec-admin-answer" type="text" autocomplete="off" style="' + inputStyle() + '">' +
                      '<button type="submit" style="margin-top:12px;padding:10px 16px;border:0;border-radius:8px;background:#111;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Create admin account</button>' +
                      '</form>'
                    : '<p style="border-top:1px solid #eee;margin:18px 0 0;padding-top:16px;color:#777;font-size:13px;">The maximum of ' + maxAdmins + ' admin accounts exists. Delete is not exposed; all admins can sign in normally.</p>') +

                /* --- change password --- */
                '<form id="lec-sec-password-form" style="border-top:1px solid #eee;margin-top:18px;padding-top:16px;">' +
                '<h3 style="margin:0 0 8px;font-size:15px;">Change my password</h3>' +
                '<label style="' + labelStyle() + '">Current password</label>' +
                '<input id="lec-sec-current" type="password" autocomplete="current-password" style="' + inputStyle() + '">' +
                '<label style="' + labelStyle() + '">New password</label>' +
                '<input id="lec-sec-new" type="password" autocomplete="new-password" style="' + inputStyle() + '">' +
                '<small style="display:block;color:#777;font-size:12px;margin-top:4px;">' + passwordRuleText() + '</small>' +
                '<button type="submit" style="margin-top:12px;padding:10px 16px;border:0;border-radius:8px;background:#111;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Change password</button>' +
                '</form>' +
                '<div id="lec-sec-msg" style="margin-top:14px;font-size:13px;min-height:18px;"></div>' +
                '</div>';

            document.body.appendChild(overlay);

            function msg(text, isError) {
                var box = overlay.querySelector('#lec-sec-msg');
                box.textContent = text;
                box.style.color = isError ? '#c0392b' : '#1e8e3e';
            }

            function renderAdminList() {
                api('auth', { action: 'list-users' }).then(function (result) {
                    var container = overlay.querySelector('#lec-sec-admin-list');
                    var rows = result.data || [];
                    container.innerHTML =
                        '<div style="border:1px solid #eee;border-radius:10px;overflow:hidden;">' +
                        rows.map(function (row) {
                            var isCurrent = row.id === result.current_user_id;
                            return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;' +
                                'border-bottom:1px solid #eee;font-size:13px;' + (isCurrent ? 'background:#f6f9ff;' : '') + '">' +
                                '<div>' +
                                '<strong>' + esc(row.full_name) + (isCurrent ? ' <span style="color:#2980b9;font-size:11px;">(you)</span>' : '') + '</strong>' +
                                '<div style="color:#777;font-size:12px;">' + esc(row.email) + '</div>' +
                                '</div>' +
                                '<div style="text-align:right;font-size:12px;color:' + (row.is_active ? '#1e8e3e' : '#c0392b') + ';">' +
                                (row.is_active ? 'Active' : 'Disabled') +
                                '<div style="color:' + (Number(row.has_security_question) ? '#1e8e3e' : '#e67e22') + ';">' +
                                (Number(row.has_security_question) ? '✓ recovery set' : '⚠ no recovery') + '</div>' +
                                '</div>' +
                                '</div>';
                        }).join('') +
                        '</div>';
                }).catch(function (error) {
                    var container = overlay.querySelector('#lec-sec-admin-list');
                    if (container) container.innerHTML = '<em style="color:#c0392b;font-size:13px;">' + esc(error.message) + '</em>';
                });
            }
            renderAdminList();

            overlay.querySelector('#lec-sec-close').addEventListener('click', function () { overlay.remove(); });

            overlay.querySelector('#lec-sec-question-form').addEventListener('submit', function (event) {
                event.preventDefault();
                api('auth', {
                    method: 'POST',
                    action: 'set-security-question',
                    body: {
                        security_question: overlay.querySelector('#lec-sec-question').value,
                        security_answer: overlay.querySelector('#lec-sec-answer').value
                    }
                }).then(function (r) { msg(r.message || 'Saved.'); })
                  .catch(function (e) { msg(e.message, true); });
            });

            var adminForm = overlay.querySelector('#lec-sec-admin-form');
            if (adminForm) {
                adminForm.addEventListener('submit', function (event) {
                    event.preventDefault();
                    api('auth', {
                        method: 'POST',
                        action: 'create-admin',
                        body: {
                            full_name: overlay.querySelector('#lec-sec-admin-name').value.trim(),
                            email: overlay.querySelector('#lec-sec-admin-email').value.trim(),
                            password: overlay.querySelector('#lec-sec-admin-password').value,
                            security_question: overlay.querySelector('#lec-sec-admin-question').value,
                            security_answer: overlay.querySelector('#lec-sec-admin-answer').value
                        }
                    }).then(function (r) {
                        msg(r.message || 'Admin created.');
                        adminForm.reset();
                        renderAdminList();
                        // keep header count fresh
                        api('auth', { action: 'me' }).then(function (updated) {
                            var p = overlay.querySelector('p strong');
                            if (p) p.textContent = (updated.user_count || 0) + ' of ' + (updated.max_admins || 2);
                        });
                    }).catch(function (e) { msg(e.message, true); });
                });
            }

            overlay.querySelector('#lec-sec-password-form').addEventListener('submit', function (event) {
                event.preventDefault();
                api('auth', {
                    method: 'POST',
                    action: 'change-password',
                    body: {
                        current_password: overlay.querySelector('#lec-sec-current').value,
                        new_password: overlay.querySelector('#lec-sec-new').value
                    }
                }).then(function (r) {
                    msg(r.message || 'Password changed.');
                    overlay.querySelector('#lec-sec-password-form').reset();
                }).catch(function (e) { msg(e.message, true); });
            });
        }).catch(function (error) {
            toast(error.message, true);
        });
    }

    /* ================= shared table CRUD ================= */

    function actionButtons(id) {
        return '<button type="button" class="row-edit" data-id="' + id + '" ' +
            'style="padding:4px 10px;margin-right:6px;border:1px solid #bbb;background:#fff;border-radius:6px;cursor:pointer;font-size:12px;">Edit</button>' +
            '<button type="button" class="row-delete" data-id="' + id + '" ' +
            'style="padding:4px 10px;border:1px solid #c0392b;background:#fff;color:#c0392b;border-radius:6px;cursor:pointer;font-size:12px;">Delete</button>';
    }

    function renderRows(tbody, rows, columns, searchTexts) {
        if (!tbody) return;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="99" class="table-empty">No records found.</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(function (row, index) {
            var cells = columns(row, index).map(function (cell) {
                return '<td>' + cell + '</td>';
            }).join('');
            var search = (searchTexts ? searchTexts(row) : '').toLowerCase().replace(/"/g, '&quot;');
            return '<tr data-search="' + search + '">' + cells +
                '<td style="white-space:nowrap;">' + actionButtons(row.id) + '</td>';
        }).join('');
    }

    function wireSearch(tbody) {
        var input = tbody && tbody.closest('.admin-form-panel')
            ? tbody.closest('.admin-form-panel').querySelector('.table-search')
            : null;
        if (!input) return;
        input.addEventListener('input', function () {
            var query = input.value.trim().toLowerCase();
            tbody.querySelectorAll('tr[data-search]').forEach(function (tr) {
                var match = !query || tr.getAttribute('data-search').indexOf(query) !== -1;
                tr.style.display = match ? '' : 'none';
            });
        });
    }

    function wireCrud(config) {
        var form = $(config.form);
        var tbody = $(config.tbody);
        if (!form || !tbody) return;

        var state = { editingId: null };
        var submitBtn = form.querySelector('button[type="submit"]');
        var resetBtn = form.querySelector('button[type="reset"]');
        var originalSubmitLabel = submitBtn ? submitBtn.textContent : 'Save';

        function setEditing(id) {
            state.editingId = id;
            if (submitBtn) {
                submitBtn.textContent = id ? 'Update ' + config.label : originalSubmitLabel;
            }
        }

        function resetForm() {
            form.reset();
            setEditing(null);
        }

        function refresh() {
            return api(config.resource).then(function (result) {
                var rows = result.data || [];

                var ready = config.beforeRender ? Promise.resolve(config.beforeRender(rows)) : Promise.resolve();
                return ready.then(function () {
                    renderRows(tbody, rows, config.columns, config.search);
                    if (config.afterLoad) config.afterLoad(rows);
                    if (rows.length) {
                        tbody.querySelectorAll('.row-edit').forEach(function (button) {
                            button.addEventListener('click', function () {
                                var record = rows.filter(function (r) { return String(r.id) === button.getAttribute('data-id'); })[0];
                                if (!record) return;
                                if (config.fill) {
                                    config.fill(form, record);
                                } else {
                                    config.fields.forEach(function (key) {
                                        var field = form.elements[key];
                                        if (!field) return;
                                        field.value = record[key] === null || record[key] === undefined ? '' : record[key];
                                    });
                                }
                                setEditing(record.id);
                                form.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            });
                        });
                        tbody.querySelectorAll('.row-delete').forEach(function (button) {
                            button.addEventListener('click', function () {
                                if (!window.confirm('Delete this record permanently?')) return;
                                api(config.resource, { method: 'DELETE', id: button.getAttribute('data-id') })
                                    .then(function () {
                                        toast('Deleted.');
                                        refresh();
                                    })
                                    .catch(function (error) {
                                        toast(error.message, true);
                                    });
                            });
                        });
                    }
                });
            }).catch(function (error) {
                toast(error.message, true);
            });
        }

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            var payload = config.payload(form);
            if (!payload) return; // payload builder already showed an error

            submitBtn.disabled = true;
            var request = state.editingId
                ? api(config.resource, { method: 'PATCH', id: state.editingId, body: payload })
                : api(config.resource, { method: 'POST', body: payload });

            request.then(function () {
                toast(state.editingId ? 'Record updated.' : config.label + ' saved.');
                resetForm();
                return refresh();
            }).catch(function (error) {
                toast(error.message, true);
            }).finally(function () {
                submitBtn.disabled = false;
            });
        });

        form.addEventListener('reset', function () {
            setEditing(null);
        });
        if (resetBtn) {
            resetBtn.addEventListener('click', function () { setEditing(null); });
        }

        wireSearch(tbody);
        refresh();

        return { refresh: refresh };
    }

    /* ================= reference data cache ================= */

    var cache = {};

    function loadReference() {
        var resources = ['customers', 'vehicles', 'mechanics', 'job_cards', 'spare_parts'];
        return Promise.all(resources.map(function (r) {
            return api(r).then(function (result) {
                cache[r] = result.data || [];
            }).catch(function () {
                cache[r] = [];
            });
        })).then(function () {
            cache.customerById = {};
            cache.customers.forEach(function (c) { cache.customerById[c.id] = c; });
            cache.vehicleById = {};
            cache.vehicles.forEach(function (v) { cache.vehicleById[v.id] = v; });
            cache.mechanicById = {};
            cache.mechanics.forEach(function (m) { cache.mechanicById[m.id] = m; });
            cache.jobById = {};
            cache.job_cards.forEach(function (j) { cache.jobById[j.id] = j; });
        });
    }

    function customerName(id) {
        var c = cache.customerById[id];
        return c ? c.first_name + ' ' + c.last_name : '—';
    }

    function vehicleLabel(id) {
        var v = cache.vehicleById[id];
        return v ? v.registration_number + ' — ' + v.make + ' ' + v.model : '—';
    }

    function mechanicName(id) {
        var m = cache.mechanicById[id];
        return m ? m.first_name + ' ' + m.last_name : 'Unassigned';
    }

    function fillSelect(select, rows, labelFn, placeholder) {
        if (!select) return;
        var current = select.value;
        select.innerHTML = '<option value="">' + placeholder + '</option>' +
            rows.map(function (row) {
                return '<option value="' + row.id + '">' + esc(labelFn(row)) + '</option>';
            }).join('');
        if (current) select.value = current;
    }

    /* ================= page: dashboard ================= */

    function dashboardPage() {
        api('dashboard').then(function (data) {
            var s = data.summary || {};
            if ($('stat-customers')) $('stat-customers').textContent = s.total_customers || 0;
            if ($('stat-vehicles')) $('stat-vehicles').textContent = s.total_vehicles || 0;
            if ($('stat-jobs')) $('stat-jobs').textContent = s.active_jobs || 0;
            if ($('stat-revenue')) $('stat-revenue').textContent = money(s.total_revenue);

            // Recent jobs table
            var tbody = $('recent-jobs-tbody');
            var empty = $('recent-jobs-empty');
            var jobs = data.recent_jobs || [];
            if (tbody) {
                if (!jobs.length) {
                    if (empty) empty.hidden = false;
                    tbody.closest('.table-container').hidden = true;
                } else {
                    if (empty) empty.hidden = true;
                    tbody.closest('.table-container').hidden = false;
                    tbody.innerHTML = jobs.map(function (job) {
                        return '<tr>' +
                            '<td>' + esc(job.job_number) + '</td>' +
                            '<td>' + esc(job.customer_name) + '</td>' +
                            '<td>' + esc(job.registration_number) + '</td>' +
                            '<td>' + esc(job.job_date) + '</td>' +
                            '<td>' + esc(job.status) + '</td>' +
                            '</tr>';
                    }).join('');
                }
            }

            // Low stock panel
            var low = data.low_stock_parts || [];
            if (low.length) {
                var footer = document.querySelector('.admin-footer');
                var section = document.createElement('section');
                section.className = 'dashboard-panel system-overview';
                section.innerHTML =
                    '<div class="panel-header"><div><h2>Low Stock Alerts</h2>' +
                    '<p>Parts at or below their minimum stock level</p></div></div>' +
                    '<div class="overview-items">' +
                    low.map(function (part) {
                        return '<div><span class="status-dot" style="background:#e67e22;"></span><div>' +
                            '<strong>' + esc(part.part_name) + ' (' + esc(part.part_number) + ')</strong>' +
                            '<small>In stock: ' + part.quantity_in_stock + ' — minimum: ' + part.minimum_stock_level + '</small>' +
                            '</div></div>';
                    }).join('') +
                    '</div>';
                if (footer) footer.parentNode.insertBefore(section, footer);
            }

            // Recent activity panel
            var activity = data.activity || [];
            if (activity.length) {
                var footer2 = document.querySelector('.admin-footer');
                var section2 = document.createElement('section');
                section2.className = 'dashboard-panel system-overview';
                var actionColor = { 'create': '#1e8e3e', 'update': '#2980b9', 'delete': '#c0392b' };
                section2.innerHTML =
                    '<div class="panel-header"><div><h2>Recent Activity</h2>' +
                    '<p>Who created, edited, or deleted records</p></div></div>' +
                    '<div class="overview-items">' +
                    activity.map(function (entry) {
                        var color = actionColor[entry.action] || '#333';
                        var label = { 'create': 'Created', 'update': 'Edited', 'delete': 'Deleted' }[entry.action] || entry.action;
                        var what = entry.summary ? entry.summary + ' (' + entry.resource.replace('_', ' ') + ')' : entry.resource.replace('_', ' ') + ' #' + entry.record_id;
                        return '<div><span class="status-dot" style="background:' + color + ';"></span><div>' +
                            '<strong>' + label + ': ' + esc(what) + '</strong>' +
                            '<small>by ' + esc(entry.user_name || 'unknown') + ' — ' + esc(entry.created_at) + ' UTC</small>' +
                            '</div></div>';
                    }).join('') +
                    '</div>';
                if (footer2) footer2.parentNode.insertBefore(section2, footer2);
            }
        }).catch(function (error) {
            toast(error.message, true);
        });
    }

    /* ================= page: customers ================= */

    function customersPage() {
        wireCrud({
            form: 'customer-form',
            tbody: 'customer-tbody',
            resource: 'customers',
            label: 'Customer',
            fields: ['first_name', 'last_name', 'phone', 'email', 'national_id', 'customer_type', 'address'],
            payload: function (form) {
                var f = form.elements;
                return {
                    first_name: f.first_name.value.trim(),
                    last_name: f.last_name.value.trim(),
                    phone: f.phone.value.trim(),
                    email: f.email.value.trim() || null,
                    national_id: f.national_id.value.trim() || null,
                    customer_type: f.customer_type.value || 'Individual',
                    address: f.address.value.trim() || null
                };
            },
            columns: function (row) {
                return [
                    row.id,
                    '<strong>' + esc(row.first_name) + ' ' + esc(row.last_name) + '</strong>',
                    esc(row.phone),
                    esc(row.email || '—'),
                    esc(row.customer_type)
                ];
            },
            search: function (row) {
                return row.first_name + ' ' + row.last_name + ' ' + row.phone + ' ' + (row.email || '') + ' ' + row.customer_type;
            }
        });
    }

    /* ================= page: vehicles ================= */

    function vehiclesPage() {
        loadReference().then(function () {
            fillSelect(document.querySelector('#vehicle-form select[name="customer_id"]'),
                cache.customers, customerName, 'Select customer');

            wireCrud({
                form: 'vehicle-form',
                tbody: 'vehicle-tbody',
                resource: 'vehicles',
                label: 'Vehicle',
                fields: ['customer_id', 'registration_number', 'make', 'model', 'vehicle_year', 'colour', 'vin', 'current_mileage', 'engine_type', 'transmission', 'notes'],
                payload: function (form) {
                    var f = form.elements;
                    if (!f.customer_id.value) {
                        toast('Please select the vehicle owner.', true);
                        return null;
                    }
                    return {
                        customer_id: Number(f.customer_id.value),
                        registration_number: f.registration_number.value.trim(),
                        make: f.make.value.trim(),
                        model: f.model.value.trim(),
                        vehicle_year: f.vehicle_year.value ? Number(f.vehicle_year.value) : null,
                        colour: f.colour.value.trim() || null,
                        vin: f.vin.value.trim() || null,
                        current_mileage: f.current_mileage.value ? Number(f.current_mileage.value) : 0,
                        engine_type: f.engine_type.value || null,
                        transmission: f.transmission.value || null,
                        notes: f.notes.value.trim() || null
                    };
                },
                columns: function (row) {
                    return [
                        row.id,
                        '<strong>' + esc(row.registration_number) + '</strong>',
                        esc(row.make + ' ' + row.model),
                        esc(customerName(row.customer_id)),
                        esc(row.vehicle_year || '—'),
                        esc(row.engine_type || '—'),
                        Number(row.current_mileage || 0).toLocaleString() + ' km'
                    ];
                },
                search: function (row) {
                    return row.registration_number + ' ' + row.make + ' ' + row.model + ' ' + customerName(row.customer_id);
                }
            });
        });
    }

    /* ================= page: mechanics ================= */

    function mechanicsPage() {
        wireCrud({
            form: 'mechanic-form',
            tbody: 'mechanic-tbody',
            resource: 'mechanics',
            label: 'Mechanic',
            fields: ['firstName', 'lastName', 'phone', 'email', 'staffId', 'specialization', 'experience', 'status'],
            payload: function (form) {
                var f = form.elements;
                return {
                    first_name: f.firstName.value.trim(),
                    last_name: f.lastName.value.trim(),
                    phone: f.phone.value.trim(),
                    email: f.email.value.trim() || null,
                    staff_id: f.staffId.value.trim(),
                    specialization: f.specialization.value,
                    years_experience: f.experience.value ? Number(f.experience.value) : 0,
                    status: f.status.value || 'Active'
                };
            },
            fill: function (form, record) {
                var f = form.elements;
                f.firstName.value = record.first_name || '';
                f.lastName.value = record.last_name || '';
                f.phone.value = record.phone || '';
                f.email.value = record.email || '';
                f.staffId.value = record.staff_id || '';
                f.specialization.value = record.specialization || '';
                f.experience.value = record.years_experience || 0;
                f.status.value = record.status || 'Active';
            },
            columns: function (row) {
                return [
                    row.id,
                    '<strong>' + esc(row.first_name) + ' ' + esc(row.last_name) + '</strong>',
                    esc(row.staff_id),
                    esc(row.phone),
                    esc(row.specialization),
                    (row.years_experience || 0) + ' yrs',
                    esc(row.status)
                ];
            },
            search: function (row) {
                return row.first_name + ' ' + row.last_name + ' ' + row.staff_id + ' ' + row.specialization + ' ' + row.status;
            }
        });
    }

    /* ================= page: spare parts ================= */

    function partsPage() {
        var crud = wireCrud({
            form: 'part-form',
            tbody: 'part-tbody',
            resource: 'spare_parts',
            label: 'Spare part',
            fields: ['partName', 'partNumber', 'category', 'supplier', 'quantity', 'minimumStock', 'buyingPrice', 'sellingPrice', 'location', 'description'],
            payload: function (form) {
                var f = form.elements;
                return {
                    part_name: f.partName.value.trim(),
                    part_number: f.partNumber.value.trim(),
                    category: f.category.value,
                    supplier: f.supplier.value.trim() || null,
                    quantity_in_stock: f.quantity.value ? Number(f.quantity.value) : 0,
                    minimum_stock_level: f.minimumStock.value ? Number(f.minimumStock.value) : 0,
                    buying_price: f.buyingPrice.value ? Number(f.buyingPrice.value) : 0,
                    selling_price: f.sellingPrice.value ? Number(f.sellingPrice.value) : 0,
                    storage_location: f.location.value.trim() || null,
                    description: f.description.value.trim() || null
                };
            },
            fill: function (form, record) {
                var f = form.elements;
                f.partName.value = record.part_name || '';
                f.partNumber.value = record.part_number || '';
                f.category.value = record.category || '';
                f.supplier.value = record.supplier || '';
                f.quantity.value = record.quantity_in_stock || 0;
                f.minimumStock.value = record.minimum_stock_level || 0;
                f.buyingPrice.value = record.buying_price || 0;
                f.sellingPrice.value = record.selling_price || 0;
                f.location.value = record.storage_location || '';
                f.description.value = record.description || '';
            },
            columns: function (row) {
                var low = row.quantity_in_stock <= row.minimum_stock_level;
                return [
                    row.id,
                    '<strong>' + esc(row.part_name) + '</strong>',
                    esc(row.part_number),
                    esc(row.category),
                    esc(row.supplier || '—'),
                    row.quantity_in_stock,
                    money(row.selling_price),
                    low ? '<span style="color:#e67e22;font-weight:700;">Low stock</span>' : '<span style="color:#1e8e3e;font-weight:600;">OK</span>'
                ];
            },
            search: function (row) {
                return row.part_name + ' ' + row.part_number + ' ' + row.category + ' ' + (row.supplier || '');
            },
            afterLoad: function (rows) {
                var totalQty = 0, value = 0, lowCount = 0;
                rows.forEach(function (row) {
                    totalQty += Number(row.quantity_in_stock || 0);
                    value += Number(row.quantity_in_stock || 0) * Number(row.buying_price || 0);
                    if (Number(row.quantity_in_stock) <= Number(row.minimum_stock_level)) lowCount++;
                });
                if ($('stat-total-parts')) $('stat-total-parts').textContent = rows.length;
                if ($('stat-stock-qty')) $('stat-stock-qty').textContent = totalQty.toLocaleString();
                if ($('stat-low-stock')) $('stat-low-stock').textContent = lowCount;
                if ($('stat-inventory-value')) $('stat-inventory-value').textContent = money(value);
            }
        });

        // Expose refresh for potential reuse
        window.__lecPartsRefresh = crud ? crud.refresh : null;
    }

    /* ================= page: job cards ================= */

    function jobCardsPage() {
        loadReference().then(function () {
            var form = $('jobcard-form');
            if (!form) return;
            fillSelect(form.elements.customer, cache.customers, customerName, 'Select customer');
            fillSelect(form.elements.mechanic, cache.mechanics, mechanicName, 'Select mechanic');

            function fillVehicles() {
                var customerId = form.elements.customer.value;
                var rows = customerId
                    ? cache.vehicles.filter(function (v) { return String(v.customer_id) === customerId; })
                    : cache.vehicles;
                fillSelect(form.elements.vehicle, rows, vehicleLabel, 'Select vehicle');
            }
            form.elements.customer.addEventListener('change', fillVehicles);
            fillVehicles();

            // Default the job date to today
            if (!form.elements.jobDate.value) form.elements.jobDate.value = today();

            wireCrud({
                form: 'jobcard-form',
                tbody: 'jobcard-tbody',
                resource: 'job_cards',
                label: 'Job card',
                fields: ['jobNumber', 'jobDate', 'customer', 'vehicle', 'mechanic', 'priority', 'mileage', 'completionDate', 'complaint', 'diagnosis', 'workRequired', 'workCompleted', 'status', 'estimatedCost', 'notes'],
                payload: function (form) {
                    var f = form.elements;
                    if (!f.customer.value || !f.vehicle.value) {
                        toast('Please select both customer and vehicle.', true);
                        return null;
                    }
                    return {
                        job_number: f.jobNumber.value.trim(),
                        customer_id: Number(f.customer.value),
                        vehicle_id: Number(f.vehicle.value),
                        mechanic_id: f.mechanic.value ? Number(f.mechanic.value) : null,
                        job_date: f.jobDate.value || today(),
                        estimated_completion_date: f.completionDate.value || null,
                        priority: f.priority.value || 'Normal',
                        mileage: f.mileage.value ? Number(f.mileage.value) : null,
                        complaint: f.complaint.value.trim(),
                        diagnosis: f.diagnosis.value.trim() || null,
                        work_required: f.workRequired.value.trim() || null,
                        work_completed: f.workCompleted.value.trim() || null,
                        status: f.status.value || 'Pending',
                        estimated_cost: f.estimatedCost.value ? Number(f.estimatedCost.value) : 0,
                        notes: f.notes.value.trim() || null,
                        created_by: currentUser ? currentUser.id : null
                    };
                },
                fill: function (form, record) {
                    var f = form.elements;
                    f.jobNumber.value = record.job_number || '';
                    f.jobDate.value = record.job_date || '';
                    f.customer.value = String(record.customer_id || '');
                    f.customer.dispatchEvent(new Event('change'));
                    f.vehicle.value = String(record.vehicle_id || '');
                    f.mechanic.value = record.mechanic_id ? String(record.mechanic_id) : '';
                    f.priority.value = record.priority || 'Normal';
                    f.mileage.value = record.mileage || '';
                    f.completionDate.value = record.estimated_completion_date || '';
                    f.complaint.value = record.complaint || '';
                    f.diagnosis.value = record.diagnosis || '';
                    f.workRequired.value = record.work_required || '';
                    f.workCompleted.value = record.work_completed || '';
                    f.status.value = record.status || 'Pending';
                    f.estimatedCost.value = record.estimated_cost || '';
                    f.notes.value = record.notes || '';
                },
                columns: function (row) {
                    var colors = {
                        'Pending': '#7f8c8d',
                        'In Progress': '#2980b9',
                        'Awaiting Parts': '#e67e22',
                        'Completed': '#1e8e3e',
                        'Cancelled': '#c0392b'
                    };
                    return [
                        row.id,
                        '<strong>' + esc(row.job_number) + '</strong>',
                        esc(vehicleLabel(row.vehicle_id)),
                        esc(customerName(row.customer_id)),
                        esc(mechanicName(row.mechanic_id)),
                        esc(row.job_date),
                        '<span style="color:' + (colors[row.status] || '#333') + ';font-weight:700;">' + esc(row.status) + '</span>'
                    ];
                },
                search: function (row) {
                    return row.job_number + ' ' + customerName(row.customer_id) + ' ' + vehicleLabel(row.vehicle_id) + ' ' + row.status;
                }
            });
        });
    }

    /* ================= page: invoices ================= */

    function invoicesPage() {
        loadReference().then(function () {
            var form = $('invoice-form');
            if (!form) return;
            fillSelect(form.elements.customer, cache.customers, customerName, 'Select customer');
            fillSelect(form.elements.vehicle, cache.vehicles, vehicleLabel, 'Select vehicle (optional)');
            fillSelect(form.elements.jobCard, cache.job_cards, function (job) {
                return job.job_number + ' — ' + customerName(job.customer_id);
            }, 'Select job card (optional)');

            if (!form.elements.invoiceDate.value) form.elements.invoiceDate.value = today();

            function computeTotal() {
                var f = form.elements;
                var total = Number(f.serviceCharges.value || 0) + Number(f.partsCharges.value || 0) -
                    Number(f.discount.value || 0) + Number(f.tax.value || 0);
                f.total.value = total.toFixed(2);
                return total;
            }
            ['serviceCharges', 'partsCharges', 'discount', 'tax'].forEach(function (name) {
                form.elements[name].addEventListener('input', computeTotal);
            });
            computeTotal();

            function statusColor(status) {
                return {
                    'Paid': '#1e8e3e',
                    'Partially Paid': '#e67e22',
                    'Unpaid': '#c0392b',
                    'Draft': '#7f8c8d',
                    'Void': '#7f8c8d'
                }[status] || '#333';
            }

            function invoiceColumns(row) {
                var paid = cache.paidByInvoice[row.id] || 0;
                return [
                    row.id,
                    '<strong>' + esc(row.invoice_number) + '</strong>',
                    esc(customerName(row.customer_id)),
                    esc(row.vehicle_id ? vehicleLabel(row.vehicle_id) : '—'),
                    esc(row.invoice_date),
                    money(row.total_amount),
                    money(paid),
                    '<span style="color:' + statusColor(row.status) + ';font-weight:700;">' + esc(row.status) + '</span>'
                ];
            }

            function invoiceSearch(row) {
                return row.invoice_number + ' ' + customerName(row.customer_id) + ' ' + row.status;
            }

            wireCrud({
                form: 'invoice-form',
                tbody: 'invoice-tbody',
                resource: 'invoices',
                label: 'Invoice',
                fields: ['invoiceNumber', 'invoiceDate', 'customer', 'vehicle', 'jobCard', 'dueDate', 'serviceCharges', 'partsCharges', 'discount', 'tax', 'paymentStatus', 'notes'],
                payload: function (form) {
                    var f = form.elements;
                    if (!f.customer.value) {
                        toast('Please select the customer to bill.', true);
                        return null;
                    }
                    var statusMap = { 'Unpaid': 'Unpaid', 'Partially Paid': 'Partially Paid', 'Paid': 'Paid', 'Overdue': 'Unpaid' };
                    return {
                        invoice_number: f.invoiceNumber.value.trim(),
                        customer_id: Number(f.customer.value),
                        vehicle_id: f.vehicle.value ? Number(f.vehicle.value) : null,
                        job_card_id: f.jobCard.value ? Number(f.jobCard.value) : null,
                        invoice_date: f.invoiceDate.value || today(),
                        due_date: f.dueDate.value || null,
                        service_charges: Number(f.serviceCharges.value || 0),
                        parts_charges: Number(f.partsCharges.value || 0),
                        discount: Number(f.discount.value || 0),
                        tax: Number(f.tax.value || 0),
                        status: statusMap[f.paymentStatus.value] || 'Unpaid',
                        notes: f.notes.value.trim() || null
                    };
                },
                fill: function (form, record) {
                    var f = form.elements;
                    f.invoiceNumber.value = record.invoice_number || '';
                    f.invoiceDate.value = record.invoice_date || '';
                    f.customer.value = String(record.customer_id || '');
                    f.vehicle.value = record.vehicle_id ? String(record.vehicle_id) : '';
                    f.jobCard.value = record.job_card_id ? String(record.job_card_id) : '';
                    f.dueDate.value = record.due_date || '';
                    f.serviceCharges.value = record.service_charges || 0;
                    f.partsCharges.value = record.parts_charges || 0;
                    f.discount.value = record.discount || 0;
                    f.tax.value = record.tax || 0;
                    computeTotal();
                    f.paymentStatus.value = record.status === 'Void' ? 'Unpaid' : record.status;
                    f.notes.value = record.notes || '';
                },
                columns: invoiceColumns,
                search: invoiceSearch,
                beforeRender: function (rows) {
                    // Aggregate payments per invoice before the rows render.
                    return api('payments').then(function (result) {
                        cache.paidByInvoice = {};
                        (result.data || []).forEach(function (payment) {
                            cache.paidByInvoice[payment.invoice_id] = (cache.paidByInvoice[payment.invoice_id] || 0) + Number(payment.amount);
                        });

                        var summary = { count: rows.length, revenue: 0, outstanding: 0, paid: 0 };
                        rows.forEach(function (row) {
                            if (row.status === 'Void') return;
                            var paidAmt = cache.paidByInvoice[row.id] || 0;
                            summary.revenue += paidAmt;
                            summary.outstanding += Math.max(Number(row.total_amount || 0) - paidAmt, 0);
                            if (row.status === 'Paid') summary.paid++;
                        });
                        if ($('stat-inv-count')) $('stat-inv-count').textContent = summary.count;
                        if ($('stat-inv-revenue')) $('stat-inv-revenue').textContent = money(summary.revenue);
                        if ($('stat-inv-outstanding')) $('stat-inv-outstanding').textContent = money(summary.outstanding);
                        if ($('stat-inv-paid')) $('stat-inv-paid').textContent = summary.paid;
                    });
                }
            });
        });
    }

    /* ================= page: service requests ================= */

    function serviceRequestsPage() {
        var tbody = $('sr-tbody');
        if (!tbody) return;

        var panel = $('sr-update-panel');
        var form = $('sr-form');
        var editLabel = $('sr-edit-label');
        var editingId = null;

        function statusColor(status) {
            return {
                'New': '#2980b9',
                'Contacted': '#8e44ad',
                'Approved': '#1e8e3e',
                'Scheduled': '#e67e22',
                'Declined': '#c0392b',
                'Completed': '#1e8e3e',
                'Closed': '#7f8c8d'
            }[status] || '#333';
        }

        function stopEdit() {
            editingId = null;
            if (panel) panel.hidden = true;
            if (form) form.reset();
        }

        if ($('sr-cancel-edit')) $('sr-cancel-edit').addEventListener('click', stopEdit);
        if ($('sr-cancel-edit-2')) $('sr-cancel-edit-2').addEventListener('click', stopEdit);

        if (form) {
            form.addEventListener('submit', function (event) {
                event.preventDefault();
                if (!editingId) return;
                var f = form.elements;
                api('service_requests', {
                    method: 'PATCH',
                    id: editingId,
                    body: {
                        status: $('sr-status').value,
                        phone: $('sr-phone-edit').value.trim() || null,
                        message: $('sr-notes-edit').value.trim() || null
                    }
                }).then(function () {
                    toast('Request updated.');
                    stopEdit();
                    refresh();
                }).catch(function (error) {
                    toast(error.message, true);
                });
            });
        }

        function refresh() {
            return api('service_requests').then(function (result) {
                var rows = (result.data || []).slice().sort(function (a, b) { return b.id - a.id; });

                if (!rows.length) {
                    tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No service requests yet. They will appear here when customers submit the website contact form.</td></tr>';
                    return;
                }

                tbody.innerHTML = rows.map(function (row) {
                    var search = (row.full_name + ' ' + row.phone + ' ' + row.request_type + ' ' + row.message + ' ' + row.status)
                        .toLowerCase().replace(/"/g, '&quot;');
                    return '<tr data-search="' + search + '">' +
                        '<td>' + row.id + '</td>' +
                        '<td><strong>' + esc(row.full_name) + '</strong></td>' +
                        '<td>' + esc(row.phone) + '</td>' +
                        '<td>' + esc(row.request_type) + '</td>' +
                        '<td style="max-width:260px;">' + esc(String(row.message || '').slice(0, 90)) + (String(row.message || '').length > 90 ? '…' : '') + '</td>' +
                        '<td>' + esc(row.preferred_date || '—') + '</td>' +
                        '<td><span style="color:' + statusColor(row.status) + ';font-weight:700;">' + esc(row.status) + '</span></td>' +
                        '<td><code class="track-code-cell">' + esc(row.tracking_code || '—') + '</code></td>' +
                        '<td style="white-space:nowrap;">' +
                        '<button type="button" class="row-edit" data-id="' + row.id + '">Edit</button>' +
                        '<button type="button" class="row-delete" data-id="' + row.id + '">Delete</button>' +
                        '</td></tr>';
                }).join('');

                tbody.querySelectorAll('.row-edit').forEach(function (button) {
                    button.addEventListener('click', function () {
                        var record = rows.filter(function (r) { return String(r.id) === button.getAttribute('data-id'); })[0];
                        if (!record || !panel) return;
                        editingId = record.id;
                        if (editLabel) editLabel.textContent = '#' + record.id + ' — ' + record.full_name;
                        $('sr-status').value = record.status || 'New';
                        $('sr-phone-edit').value = record.phone || '';
                        $('sr-notes-edit').value = record.message || '';
                        if ($('sr-code-display')) $('sr-code-display').value = record.tracking_code || '—';
                        panel.hidden = false;
                        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                });

                tbody.querySelectorAll('.row-delete').forEach(function (button) {
                    button.addEventListener('click', function () {
                        if (!window.confirm('Delete this request permanently?')) return;
                        api('service_requests', { method: 'DELETE', id: button.getAttribute('data-id') })
                            .then(function () {
                                toast('Deleted.');
                                refresh();
                            })
                            .catch(function (error) {
                                toast(error.message, true);
                            });
                    });
                });

                // search box
                var input = tbody.closest('.admin-form-panel').querySelector('.table-search');
                if (input) {
                    input.addEventListener('input', function () {
                        var query = input.value.trim().toLowerCase();
                        tbody.querySelectorAll('tr[data-search]').forEach(function (tr) {
                            tr.style.display = !query || tr.getAttribute('data-search').indexOf(query) !== -1 ? '' : 'none';
                        });
                    });
                }
            }).catch(function (error) {
                tbody.innerHTML = '<tr><td colspan="8" class="table-empty">' + esc(error.message) + '</td></tr>';
            });
        }

        refresh();
    }

    /* ================= page: reports ================= */

    function reportsPage() {
        if (!$('rep-revenue')) return;

        var chartMax = 0;

        function renderChart(monthly) {
            var chart = $('rep-chart');
            if (!chart) return;
            if (!monthly.length) {
                chart.innerHTML = '<div class="table-empty" style="width:100%;">No invoice data yet.</div>';
                return;
            }
            chartMax = Math.max.apply(null, monthly.map(function (m) { return Number(m.total); })) || 1;
            var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            chart.innerHTML = monthly.map(function (m) {
                var total = Number(m.total);
                var pct = Math.round((total / chartMax) * 100);
                var label = monthNames[Number(m.month.slice(5, 7)) - 1] + ' ' + m.month.slice(2, 4);
                var title = label + ': $' + Number(total).toFixed(2);
                return '<div class="chart-column" title="' + title + '">' +
                    '<div class="bar" style="height:' + Math.max(pct, 2) + '%;"></div>' +
                    '<span>' + label + '</span>' +
                    '</div>';
            }).join('');
        }

        function renderSummary(data) {
            var s = data.summary || {};
            $('rep-revenue').textContent = money(s.revenue || 0);
            $('rep-invoices').textContent = s.invoices || 0;
            $('rep-vehicles').textContent = s.vehicles || 0;
            $('rep-jobs-done').textContent = s.jobs_completed || 0;

            // job status
            var jobStatus = data.job_status || {};
            document.querySelectorAll('#rep-job-status [data-status]').forEach(function (el) {
                el.textContent = jobStatus[el.getAttribute('data-status')] || 0;
            });

            // payments (map the short data-pay keys to the API's field names)
            var pay = data.payments || {};
            var payKeyMap = { paid: 'paid_invoices', partial: 'partially_paid', unpaid: 'unpaid_invoices' };
            document.querySelectorAll('#rep-payments [data-pay]').forEach(function (el) {
                var key = el.getAttribute('data-pay');
                if (key === 'outstanding') {
                    el.textContent = money(pay.outstanding || 0);
                } else {
                    el.textContent = pay[payKeyMap[key]] || 0;
                }
            });

            // inventory
            var inv = data.inventory || {};
            document.querySelectorAll('#rep-inventory [data-inv]').forEach(function (el) {
                var key = el.getAttribute('data-inv');
                el.textContent = key === 'value' ? money(inv.stock_value || 0) : (inv[key] || 0);
            });

            renderChart(data.monthly_revenue || []);
        }

        function periodRange(period) {
            // Returns {from, to} or {} for all-time. Week starts Monday.
            var now = new Date();
            function iso(d) { return d.toISOString().slice(0, 10); }
            if (period === 'today') {
                return { from: iso(now), to: iso(now) };
            }
            if (period === 'week') {
                var day = now.getDay() || 7; // Mon=1..Sun=7
                var monday = new Date(now); monday.setDate(now.getDate() - day + 1);
                return { from: iso(monday), to: iso(now) };
            }
            if (period === 'month') {
                return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
            }
            if (period === 'year') {
                return { from: now.getFullYear() + '-01-01', to: iso(now) };
            }
            return {};
        }

        function reportTable(type, rows) {
            var tbody = $('rep-tbody');
            var head = $('rep-table-head');
            if (!tbody) return;

            if (!rows.length) {
                tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No records found for this report type in the selected period.</td></tr>';
                return;
            }

            head.innerHTML = '<th>#</th><th>Item</th><th>Detail</th><th>Count</th><th>Amount</th>';
            tbody.innerHTML = rows.map(function (row) {
                return '<tr>' +
                    '<td>' + row[0] + '</td>' +
                    '<td><strong>' + esc(row[1]) + '</strong></td>' +
                    '<td>' + esc(row[2]) + '</td>' +
                    '<td>' + row[3] + '</td>' +
                    '<td>' + row[4] + '</td>' +
                    '</tr>';
            }).join('');
        }

        function buildReport(type, range) {
            // Period filter: ISO date strings compare correctly as text.
            function inRange(dateStr) {
                if (!range.from && !range.to) return true;
                var d = dateStr ? String(dateStr).slice(0, 10) : '';
                if (!d) return false;
                if (range.from && d < range.from) return false;
                if (range.to && d > range.to) return false;
                return true;
            }

            function get(resource, params) {
                return api(resource, params || {});
            }

            var promise;
            if (type === 'payments') {
                promise = get('payments').then(function (result) {
                    return (result.data || []).filter(function (p) { return inRange(p.payment_date); }).map(function (p, i) {
                        return [i + 1, p.payment_method || 'Payment', p.payment_date || '—', 1, money(p.amount)];
                    });
                });
            } else if (type === 'jobs') {
                promise = get('job_cards').then(function (result) {
                    return (result.data || []).filter(function (j) { return inRange(j.job_date); }).map(function (j, i) {
                        return [i + 1, j.job_number, j.status + (j.job_date ? ' — ' + j.job_date : ''), 1, money(j.estimated_cost || 0)];
                    });
                });
            } else if (type === 'customers') {
                promise = get('customers').then(function (result) {
                    return (result.data || []).filter(function (c) { return inRange(c.created_at); }).map(function (c, i) {
                        return [i + 1, (c.first_name + ' ' + c.last_name).trim(), c.customer_type + (c.phone ? ' — ' + c.phone : ''), 1, '—'];
                    });
                });
            } else if (type === 'vehicles') {
                promise = Promise.all([get('vehicles'), get('job_cards')]).then(function (results) {
                    var vehicles = results[0].data || [];
                    var jobs = results[1].data || [];
                    return vehicles.map(function (v, i) {
                        var count = jobs.filter(function (j) { return j.vehicle_id === v.id; }).length;
                        return [i + 1, v.registration_number, (v.make + ' ' + v.model).trim(), count + ' job(s)', '—'];
                    });
                });
            } else if (type === 'parts') {
                promise = get('spare_parts').then(function (result) {
                    return (result.data || []).map(function (p, i) {
                        var low = Number(p.quantity_in_stock) <= Number(p.minimum_stock_level);
                        return [i + 1, p.part_name + ' (' + p.part_number + ')', low ? 'Low stock' : 'In stock', p.quantity_in_stock, money(Number(p.quantity_in_stock) * Number(p.buying_price || 0))];
                    });
                });
            } else if (type === 'revenue') {
                promise = get('invoices').then(function (result) {
                    return (result.data || []).filter(function (inv) { return inv.status !== 'Void' && inRange(inv.invoice_date); }).map(function (inv, i) {
                        return [i + 1, inv.invoice_number, inv.status + (inv.invoice_date ? ' — ' + inv.invoice_date : ''), 1, money(inv.total_amount)];
                    });
                });
            } else {
                // business overview: one summary row set from the reports endpoint
                promise = Promise.all([get('reports', { noScope: true }), get('customers'), get('job_cards')]).then(function (results) {
                    var rep = results[0];
                    var customers = (results[1].data || []).length;
                    var jobs = (results[2].data || []).length;
                    var s = rep.summary || {};
                    return [
                        [1, 'Revenue received', 'Payments recorded', (rep.payments ? (rep.payments.paid_invoices + rep.payments.partially_paid) : 0) + ' payment(s)', money(s.revenue || 0)],
                        [2, 'Outstanding', 'Invoiced but unpaid', (rep.payments ? rep.payments.unpaid_invoices : 0) + ' invoice(s)', money(rep.payments ? rep.payments.outstanding : 0)],
                        [3, 'Job cards', 'All recorded jobs', jobs, '—'],
                        [4, 'Jobs completed', 'Status: Completed', s.jobs_completed || 0, '—'],
                        [5, 'Customers', 'All registered', customers, '—'],
                        [6, 'Vehicles', 'All registered', s.vehicles || 0, '—'],
                        [7, 'Inventory value', 'Stock at buying price', (rep.inventory ? rep.inventory.total_parts : 0) + ' part(s)', money(rep.inventory ? rep.inventory.stock_value : 0)]
                    ];
                });
            }

            return promise.then(function (rows) { reportTable(type, rows); })
                .catch(function (error) {
                    var tbody = $('rep-tbody');
                    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="table-empty">' + esc(error.message) + '</td></tr>';
                });
        }

        // The api() helper requires 'resource' — allow raw resources through
        function patchedGet(resource) {
            return api(resource);
        }

        // Wire filter buttons
        if ($('rep-clear')) {
            $('rep-clear').addEventListener('click', function () {
                $('reportType').value = 'business';
                $('reportPeriod').value = 'all';
                $('startDate').value = '';
                $('endDate').value = '';
                load();
            });
        }

        if ($('rep-generate')) {
            $('rep-generate').addEventListener('click', function () {
                var type = $('reportType').value;
                var period = $('reportPeriod').value;
                var range;
                if (period === 'custom') {
                    var from = $('startDate').value;
                    var to = $('endDate').value;
                    range = from ? { from: from, to: to } : {};
                } else {
                    range = periodRange(period);
                }
                buildReport(type, range);
            });
        }

        function load() {
            var period = $('reportPeriod') ? $('reportPeriod').value : 'all';
            var range = period === 'custom'
                ? ($('startDate').value ? { from: $('startDate').value, to: $('endDate').value } : {})
                : periodRange(period);
            var query = range.from ? '&from=' + encodeURIComponent(range.from) + '&to=' + encodeURIComponent(range.to) : '';
            var url = new URL(API_URL, window.location.href);
            url.searchParams.set('resource', 'reports');
            if (range.from) {
                url.searchParams.set('from', range.from);
                url.searchParams.set('to', range.to);
            }
            fetch(url.toString(), { credentials: 'same-origin', headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {} })
                .then(function (r) { return r.json(); })
                .then(renderSummary)
                .catch(function () { /* non-fatal: the page still shows the report table */ });
        }

        load();
        buildReport('business', {});
    }

    /* ================= page: gallery ================= */

    function galleryPage() {
        if (!$('gallery-upload-form')) return;

        var grid = $('gallery-grid');

        function imageUrl(id) {
            // Images are stored in the database and streamed by the API.
            return '/api?resource=gallery_image&id=' + encodeURIComponent(id);
        }

        function loadGallery() {
            api('gallery_images').then(function (result) {
                var items = result.data || [];
                if ($('gallery-count')) {
                    $('gallery-count').textContent = items.length + ' image(s) published';
                }
                if (!items.length) {
                    grid.innerHTML = '<p class="table-empty">📷 No images yet — upload your first photo above.</p>';
                    return;
                }
                grid.innerHTML = items.map(function (img) {
                    return '<figure class="gallery-admin-card" data-id="' + img.id + '">' +
                        '<img src="' + imageUrl(img.id) + '" alt="' + esc(img.title) + '">' +
                        '<figcaption>' +
                        '<strong>' + esc(img.title) + '</strong>' +
                        (img.caption ? '<span>' + esc(img.caption) + '</span>' : '') +
                        '</figcaption>' +
                        '<div class="gallery-admin-actions">' +
                        '<button type="button" class="gallery-btn-edit" data-id="' + img.id + '">✏️ Edit</button>' +
                        '<button type="button" class="gallery-btn-delete" data-id="' + img.id + '">🗑 Delete</button>' +
                        '</div>' +
                        '</figure>';
                }).join('');
            }).catch(function (error) {
                grid.innerHTML = '<p class="table-empty">' + esc(error.message) + '</p>';
            });
        }

        // Upload (multipart — bypasses the JSON api() helper).
        $('gallery-upload-form').addEventListener('submit', function (event) {
            event.preventDefault();
            var files = $('gallery-file').files;
            if (!files.length) {
                toast('Choose at least one image first.', true);
                return;
            }
            // Serverless API has no multipart handling — send base64 data URLs.
            var toDataUrl = function (file) {
                return new Promise(function (resolve) {
                    var reader = new FileReader();
                    reader.onload = function () { resolve(reader.result); };
                    reader.readAsDataURL(file);
                });
            };

            var btn = $('gallery-upload-btn');
            btn.disabled = true;
            btn.textContent = 'Uploading…';

            var jobs = [];
            for (var i = 0; i < files.length; i++) jobs.push(toDataUrl(files[i]));

            Promise.all(jobs).then(function (dataUrls) {
                return fetch(new URL(API_URL, window.location.href).toString() + '?resource=gallery_images', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        images: dataUrls,
                        title: $('gallery-title').value.trim(),
                        caption: $('gallery-caption').value.trim()
                    })
                }).then(function (response) {
                    return response.json().then(function (body) { return { ok: response.ok, body: body }; });
                });
            }).then(function (result) {
                if (!result.ok) throw new Error(result.body.error || 'Upload failed.');
                var saved = (result.body.saved || []).length;
                var failed = result.body.errors || [];
                if (failed.length) {
                    toast(saved + ' uploaded, ' + failed.length + ' failed: ' + failed[0], true);
                } else {
                    toast(saved + (saved === 1 ? ' image' : ' images') + ' published to the website 🎉');
                }
                $('gallery-upload-form').reset();
                loadGallery();
            }).catch(function (error) {
                toast(error.message, true);
            }).finally(function () {
                btn.disabled = false;
                btn.textContent = '⬆ Upload to Website';
            });
        });

        // Edit + delete (delegated).
        grid.addEventListener('click', function (event) {
            var target = event.target;
            var id = target.getAttribute && target.getAttribute('data-id');
            if (!id) return;

            if (target.classList.contains('gallery-btn-delete')) {
                if (!confirm('Delete this image from the website?')) return;
                api('gallery_images', { method: 'DELETE', id: id }).then(function () {
                    toast('Image deleted.');
                    loadGallery();
                }).catch(function (error) { toast(error.message, true); });
            } else if (target.classList.contains('gallery-btn-edit')) {
                var card = target.closest('.gallery-admin-card');
                var dialog = $('gallery-edit-dialog');
                $('gedit-id').value = id;
                $('gedit-title').value = card.querySelector('strong').textContent;
                var cap = card.querySelector('figcaption span');
                $('gedit-caption').value = cap ? cap.textContent : '';
                if (typeof dialog.showModal === 'function') {
                    dialog.showModal();
                } else {
                    dialog.setAttribute('open', '');
                }
            }
        });

        $('gedit-cancel').addEventListener('click', function () {
            $('gallery-edit-dialog').close ? $('gallery-edit-dialog').close() : $('gallery-edit-dialog').removeAttribute('open');
        });

        $('gallery-edit-dialog').addEventListener('submit', function (event) {
            event.preventDefault();
            var id = $('gedit-id').value;
            api('gallery_images', {
                method: 'PATCH',
                id: id,
                body: { title: $('gedit-title').value.trim(), caption: $('gedit-caption').value.trim() }
            }).then(function () {
                toast('Image updated.');
                var d = $('gallery-edit-dialog');
                d.close ? d.close() : d.removeAttribute('open');
                loadGallery();
            }).catch(function (error) { toast(error.message, true); });
        });

        loadGallery();
    }

    /* ================= boot ================= */    function boot() {
        wireLogout();
        if ($('stat-customers')) return dashboardPage();
        if ($('sr-tbody')) return serviceRequestsPage();
        if ($('customer-form')) return customersPage();
        if ($('vehicle-form')) return vehiclesPage();
        if ($('mechanic-form')) return mechanicsPage();
        if ($('part-form')) return partsPage();
        if ($('jobcard-form')) return jobCardsPage();
        if ($('invoice-form')) return invoicesPage();
        if ($('rep-revenue')) return reportsPage();
        if ($('gallery-upload-form')) return galleryPage();
        // unknown pages: nothing to wire yet
    }

    document.addEventListener('DOMContentLoaded', function () {
        api('auth', { action: 'me' }).then(function (result) {
            if (result.authenticated && result.user) {
                // Restore the CSRF token issued for this session (survives reloads).
                if (result.csrf_token) setCsrfToken(result.csrf_token);
                setUser(result.user);
                boot();
            } else {
                setCsrfToken('');
                showLogin();
            }
        }).catch(function () {
            setCsrfToken('');
            showLogin();
        });
    });
})();
