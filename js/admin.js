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

    // Show/hide (eye) buttons inside a container.
    function wirePasswordEyes(container) {
        if (!container) return;
        container.querySelectorAll('.lec-eye').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var input = container.querySelector('#' + btn.getAttribute('data-target'));
                if (!input) return;
                var showing = input.type === 'text';
                input.type = showing ? 'password' : 'text';
                btn.textContent = showing ? '👁' : '🙈';
                input.focus();
            });
        });
    }

    // Live 'passwords match' indicator between a password field and its confirm field.
    function wirePasswordMatch(passwordInput, confirmInput, hintEl) {
        if (!passwordInput || !confirmInput || !hintEl) return;
        function update() {
            if (!confirmInput.value) { hintEl.textContent = ''; hintEl.style.color = ''; return; }
            if (confirmInput.value === passwordInput.value) {
                hintEl.textContent = '✓ Passwords match';
                hintEl.style.color = '#1e8e3e';
            } else {
                hintEl.textContent = '✗ Passwords do not match';
                hintEl.style.color = '#c0392b';
            }
        }
        passwordInput.addEventListener('input', update);
        confirmInput.addEventListener('input', update);
    }

    function labelStyle() {
        return 'display:block;font-size:13px;font-weight:600;margin:12px 0 4px;';
    }

    function showLogin(userCount) {
        if (document.getElementById('lec-login-overlay')) return;
        var setupDone = userCount !== undefined && userCount > 0;

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
            '<div style="position:relative;">' +
            '<input id="lec-login-password" type="password" required autocomplete="current-password" style="' + inputStyle() + ' padding-right:44px;">' +
            '<button type="button" class="lec-eye" data-target="lec-login-password" title="Show / hide password" ' +
            'style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:none;cursor:pointer;font-size:16px;padding:4px;">👁</button>' +
            '</div>' +
            '<small id="lec-caps-hint" style="display:block;color:#c0392b;font-size:12px;margin-top:4px;min-height:14px;"></small>' +
            '<div id="lec-setup-fields" hidden>' +
            '<label style="' + labelStyle() + '">Full name</label>' +
            '<input id="lec-setup-name" type="text" style="' + inputStyle() + '">' +
            '<label style="' + labelStyle() + '">Confirm password</label>' +
            '<div style="position:relative;">' +
            '<input id="lec-setup-confirm" type="password" autocomplete="new-password" style="' + inputStyle() + ' padding-right:44px;">' +
            '<button type="button" class="lec-eye" data-target="lec-setup-confirm" title="Show / hide password" ' +
            'style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:none;cursor:pointer;font-size:16px;padding:4px;">👁</button>' +
            '</div>' +
            '<small id="lec-setup-match-hint" style="display:block;font-size:12px;margin-top:4px;min-height:14px;"></small>' +
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
            'text-decoration:underline;cursor:pointer;">' + (setupDone ? 'Request an admin account (master approval needed)' : 'First time here? Create the admin account') + '</button>' +
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
        wirePasswordEyes(overlay);
        wirePasswordMatch(overlay.querySelector('#lec-login-password'), overlay.querySelector('#lec-setup-confirm'), overlay.querySelector('#lec-setup-match-hint'));

        // The link stays visible: before setup it creates the first admin;
        // afterwards it becomes the account-request flow (master approves).

        var forgotForm = overlay.querySelector('#lec-forgot-form');
        var forgotToggle = overlay.querySelector('#lec-forgot-toggle');
        var forgotStep2 = overlay.querySelector('#lec-forgot-step2');
        var forgotErrorShownOnLogin = false;

        setupToggle.addEventListener('click', function () {
            setupMode = !setupMode;
            setupFields.hidden = !setupMode;
            submitBtn.textContent = setupMode
                ? (setupDone ? 'Submit Account Request' : 'Create Admin Account')
                : 'Sign In';
            setupToggle.textContent = setupMode
                ? 'Already have an account? Sign in'
                : (setupDone ? 'Request an admin account (master approval needed)' : 'First time here? Create the admin account');
            forgotForm.hidden = true;
            forgotToggle.hidden = setupMode;
            errorBox.textContent = '';
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
                var confirmValue = overlay.querySelector('#lec-setup-confirm').value;
                if (password !== confirmValue) {
                    errorBox.textContent = 'Password confirmation does not match the password.';
                    submitBtn.disabled = false;
                    return;
                }
                var requestBody = {
                    full_name: overlay.querySelector('#lec-setup-name').value.trim(),
                    email: email,
                    password: password,
                    confirm_password: confirmValue,
                    security_question: overlay.querySelector('#lec-setup-question').value,
                    security_answer: overlay.querySelector('#lec-setup-answer').value
                };
                if (setupDone) {
                    // Later accounts: public request that the master must approve.
                    request = api('auth', { method: 'POST', action: 'request-admin', body: requestBody })
                        .then(function (result) {
                            errorBox.style.color = '#1e8e3e';
                            errorBox.textContent = result.message || 'Request received! You can sign in once the master admin approves it.';
                            setupToggle.click(); // back to sign-in view
                            return null; // do not auto-login
                        });
                } else {
                    // Very first account: full setup + immediate sign-in.
                    request = api('auth', { method: 'POST', action: 'setup', body: requestBody })
                        .then(function () {
                            return api('auth', { method: 'POST', action: 'login', body: { email: email, password: password } });
                        });
                }
            } else {
                request = api('auth', { method: 'POST', action: 'login', body: { email: email, password: password } });
            }

            request.then(function (result) {
                if (lockoutTimer) {
                    clearInterval(lockoutTimer);
                    lockoutTimer = null;
                }
                if (!result) return; // account request submitted — success message already shown
                if (result.csrf_token) setCsrfToken(result.csrf_token);
                overlay.remove();
                if (markAdminUnlocked) markAdminUnlocked(); // explicit login unlocks the panel
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
                '<div id="lec-sec-pending" style="margin:0 0 18px;"></div>' +

                /* --- my details (every admin) --- */
                '<form id="lec-sec-profile-form" style="border-top:1px solid #eee;padding-top:16px;">' +
                '<h3 style="margin:0 0 8px;font-size:15px;">My details</h3>' +
                '<p style="margin:0 0 10px;color:#777;font-size:12px;">Change your display name and sign-in email.</p>' +
                '<label style="' + labelStyle() + '">Full name</label>' +
                '<input id="lec-sec-profile-name" type="text" value="' + esc((me.user && me.user.full_name) || '') + '" style="' + inputStyle() + '">' +
                '<label style="' + labelStyle() + '">Email</label>' +
                '<input id="lec-sec-profile-email" type="email" value="' + esc((me.user && me.user.email) || '') + '" style="' + inputStyle() + '">' +
                '<button type="submit" style="margin-top:12px;padding:10px 16px;border:0;border-radius:8px;background:#111;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Save my details</button>' +
                '</form>' +

                /* --- edit another account (master only) --- */
                '<div id="lec-sec-edit-others" style="display:none;border-top:1px solid #eee;margin-top:18px;padding-top:16px;">' +
                '<h3 style="margin:0 0 8px;font-size:15px;">Edit account</h3>' +
                '<p id="lec-sec-edit-target" style="margin:0 0 10px;color:#777;font-size:12px;"></p>' +
                '<label style="' + labelStyle() + '">Full name</label>' +
                '<input id="lec-sec-edit-name" type="text" style="' + inputStyle() + '">' +
                '<label style="' + labelStyle() + '">Email</label>' +
                '<input id="lec-sec-edit-email" type="email" style="' + inputStyle() + '">' +
                '<label style="' + labelStyle() + '">Role</label>' +
                '<select id="lec-sec-edit-role" style="' + inputStyle() + '"><option value="admin">Admin</option><option value="master">Master</option></select>' +
                '<div style="display:flex;gap:8px;margin-top:12px;">' +
                '<button type="button" id="lec-sec-edit-save" style="padding:10px 16px;border:0;border-radius:8px;background:#111;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Save changes</button>' +
                '<button type="button" id="lec-sec-edit-cancel" style="padding:10px 16px;border:1px solid #bbb;border-radius:8px;background:#fff;font-size:13px;cursor:pointer;">Cancel</button>' +
                '</div>' +
                '</div>' +

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

                /* --- create admin (master only, pending approval) --- */
                (canCreateAdmin && me.is_master
                    ? '<form id="lec-sec-admin-form" style="border-top:1px solid #eee;margin-top:18px;padding-top:16px;">' +
                      '<h3 style="margin:0 0 8px;font-size:15px;">Create admin account</h3>' +
                      '<p style="margin:0 0 10px;color:#777;font-size:12px;">The new account stays locked until you approve it below.</p>' +
                      '<label style="' + labelStyle() + '">Full name</label>' +
                      '<input id="lec-sec-admin-name" type="text" style="' + inputStyle() + '">' +
                      '<label style="' + labelStyle() + '">Email</label>' +
                      '<input id="lec-sec-admin-email" type="email" style="' + inputStyle() + '">' +
                      '<label style="' + labelStyle() + '">Password</label>' +
                      '<div style="position:relative;">' +
                      '<input id="lec-sec-admin-password" type="password" autocomplete="new-password" style="' + inputStyle() + ' padding-right:44px;">' +
                      '<button type="button" class="lec-eye" data-target="lec-sec-admin-password" title="Show / hide password" ' +
                      'style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:none;cursor:pointer;font-size:16px;padding:4px;">👁</button>' +
                      '</div>' +
                      '<label style="' + labelStyle() + '">Confirm password</label>' +
                      '<div style="position:relative;">' +
                      '<input id="lec-sec-admin-confirm" type="password" autocomplete="new-password" style="' + inputStyle() + ' padding-right:44px;">' +
                      '<button type="button" class="lec-eye" data-target="lec-sec-admin-confirm" title="Show / hide password" ' +
                      'style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:none;cursor:pointer;font-size:16px;padding:4px;">👁</button>' +
                      '</div>' +
                      '<small id="lec-sec-admin-match" style="display:block;font-size:12px;margin-top:4px;min-height:14px;"></small>' +
                      '<small style="display:block;color:#777;font-size:12px;margin-top:4px;">' + passwordRuleText() + '</small>' +
                      '<label style="' + labelStyle() + '">Security question</label>' +
                      '<select id="lec-sec-admin-question" style="' + inputStyle() + '">' +
                      SECURITY_QUESTIONS.map(function (q) { return '<option>' + q + '</option>'; }).join('') +
                      '</select>' +
                      '<label style="' + labelStyle() + '">Security answer</label>' +
                      '<input id="lec-sec-admin-answer" type="text" autocomplete="off" style="' + inputStyle() + '">' +
                      '<button type="submit" style="margin-top:12px;padding:10px 16px;border:0;border-radius:8px;background:#111;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Create admin account</button>' +
                      '</form>'
                    : '<p style="border-top:1px solid #eee;margin:18px 0 0;padding-top:16px;color:#777;font-size:13px;">' +
                      (me.is_master
                          ? 'The maximum of ' + maxAdmins + ' approved admin accounts exists. Delete is not exposed; all admins can sign in normally.'
                          : 'Only the master admin account can create new admin accounts.') + '</p>') +

                /* --- change password --- */
                '<form id="lec-sec-password-form" style="border-top:1px solid #eee;margin-top:18px;padding-top:16px;">' +
                '<h3 style="margin:0 0 8px;font-size:15px;">Change my password</h3>' +
                '<label style="' + labelStyle() + '">Current password</label>' +
                '<input id="lec-sec-current" type="password" autocomplete="current-password" style="' + inputStyle() + '">' +
                '<label style="' + labelStyle() + '">New password</label>' +
                '<div style="position:relative;">' +
                '<input id="lec-sec-new" type="password" autocomplete="new-password" style="' + inputStyle() + ' padding-right:44px;">' +
                '<button type="button" class="lec-eye" data-target="lec-sec-new" title="Show / hide password" ' +
                'style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:none;cursor:pointer;font-size:16px;padding:4px;">👁</button>' +
                '</div>' +
                '<label style="' + labelStyle() + '">Confirm new password</label>' +
                '<div style="position:relative;">' +
                '<input id="lec-sec-new-confirm" type="password" autocomplete="new-password" style="' + inputStyle() + ' padding-right:44px;">' +
                '<button type="button" class="lec-eye" data-target="lec-sec-new-confirm" title="Show / hide password" ' +
                'style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:none;cursor:pointer;font-size:16px;padding:4px;">👁</button>' +
                '</div>' +
                '<small id="lec-sec-new-match" style="display:block;font-size:12px;margin-top:4px;min-height:14px;"></small>' +
                '<button type="submit" style="margin-top:12px;padding:10px 16px;border:0;border-radius:8px;background:#111;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Change password</button>' +
                '</form>' +
                '<div id="lec-sec-msg" style="margin-top:14px;font-size:13px;min-height:18px;"></div>' +
                '</div>';

            document.body.appendChild(overlay);

            wirePasswordEyes(overlay);
            wirePasswordMatch(overlay.querySelector('#lec-sec-admin-password'), overlay.querySelector('#lec-sec-admin-confirm'), overlay.querySelector('#lec-sec-admin-match'));
            wirePasswordMatch(overlay.querySelector('#lec-sec-new'), overlay.querySelector('#lec-sec-new-confirm'), overlay.querySelector('#lec-sec-new-match'));

            function msg(text, isError) {
                var box = overlay.querySelector('#lec-sec-msg');
                box.textContent = text;
                box.style.color = isError ? '#c0392b' : '#1e8e3e';
            }

            function renderAdminList() {
                api('auth', { action: 'list-users' }).then(function (result) {
                    var container = overlay.querySelector('#lec-sec-admin-list');
                    var rows = result.data || [];

                    // Master admin: pending account requests with approve/reject buttons.
                    var pendingBox = overlay.querySelector('#lec-sec-pending');
                    if (pendingBox) {
                        var pending = result.data.filter(function (r) { return r.approval_status === 'pending'; });
                        if (result.is_master && pending.length) {
                            pendingBox.innerHTML =
                                '<div style="border:2px solid #e67e22;border-radius:10px;padding:12px;background:#fff8ef;">' +
                                '<h3 style="margin:0 0 8px;font-size:14px;color:#b9770e;">⏳ Pending approvals (' + pending.length + ')</h3>' +
                                '<p style="margin:0 0 10px;font-size:12px;color:#777;">These people requested accounts from the admin sign-in page. Approving lets them sign in with the password they chose.</p>' +
                                pending.map(function (row) {
                                    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f0e0c8;font-size:13px;">' +
                                        '<div><strong>' + esc(row.full_name) + '</strong>' +
                                        '<div style="color:#777;font-size:12px;">' + esc(row.email) + '</div></div>' +
                                        '<div style="display:flex;gap:6px;">' +
                                        '<button type="button" class="lec-approve" data-id="' + row.id + '" ' +
                                        'style="padding:6px 12px;border:0;border-radius:6px;background:#1e8e3e;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">✓ Approve</button>' +
                                        '<button type="button" class="lec-reject" data-id="' + row.id + '" ' +
                                        'style="padding:6px 12px;border:0;border-radius:6px;background:#c0392b;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">✗ Reject</button>' +
                                        '</div></div>';
                                }).join('') + '</div>';
                            pendingBox.querySelectorAll('.lec-approve').forEach(function (btn) {
                                btn.addEventListener('click', function () {
                                    decideUser(btn.getAttribute('data-id'), 'approve-user');
                                });
                            });
                            pendingBox.querySelectorAll('.lec-reject').forEach(function (btn) {
                                btn.addEventListener('click', function () {
                                    decideUser(btn.getAttribute('data-id'), 'reject-user');
                                });
                            });
                        } else {
                            pendingBox.innerHTML = '';
                        }
                    }                    container.innerHTML =
                        '<div style="border:1px solid #eee;border-radius:10px;overflow:hidden;">' +
                        rows.map(function (row) {
                            var isCurrent = row.id === result.current_user_id;
                            var statusLabel = row.approval_status === 'pending'
                                ? '<span style="color:#e67e22;font-weight:700;">⏳ awaiting approval</span>'
                                : (row.approval_status === 'rejected'
                                    ? '<span style="color:#c0392b;font-weight:700;">rejected</span>'
                                    : (row.role === 'master' ? '<span style="color:#8e44ad;font-weight:700;">★ master</span>' : 'Active'));
                            // Master can edit any account; others only their own (via the form above).
                            var canEdit = result.is_master || isCurrent;
                            var editBtn = canEdit && row.approval_status === 'approved'
                                ? '<button type="button" class="lec-edit-user" data-id="' + row.id + '" '
                                  + 'data-name="' + esc(row.full_name) + '" data-email="' + esc(row.email) + '" data-role="' + esc(row.role) + '" '
                                  + 'title="Edit name, email' + (result.is_master ? ' and role' : '') + '" '
                                  + 'style="padding:4px 10px;border:1px solid #bbb;background:#fff;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;">✎ Edit</button>'
                                : '';
                            return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;'
                                + 'border-bottom:1px solid #eee;font-size:13px;' + (isCurrent ? 'background:#f6f9ff;' : '') + '">' +
                                '<div>' +
                                '<strong>' + esc(row.full_name) + (isCurrent ? ' <span style="color:#2980b9;font-size:11px;">(you)</span>' : '') + '</strong>' +
                                '<div style="color:#777;font-size:12px;">' + esc(row.email) + '</div>' +
                                '</div>' +
                                '<div style="text-align:right;font-size:12px;color:' + (row.is_active ? '#1e8e3e' : '#c0392b') + ';">' +
                                statusLabel +
                                '<div style="color:' + (Number(row.has_security_question) ? '#1e8e3e' : '#e67e22') + ';">' +
                                (Number(row.has_security_question) ? '✓ recovery set' : '⚠ no recovery') + '</div>' +
                                (editBtn ? '<div style="margin-top:6px;">' + editBtn + '</div>' : '') +
                                '</div>' +
                                '</div>';
                        }).join('') +
                        '</div>';

                    // Master: clicking ✎ fills the edit-another-account form.
                    container.querySelectorAll('.lec-edit-user').forEach(function (btn) {
                        btn.addEventListener('click', function () {
                            var box = overlay.querySelector('#lec-sec-edit-others');
                            box.style.display = 'block';
                            overlay.querySelector('#lec-sec-edit-name').value = btn.getAttribute('data-name');
                            overlay.querySelector('#lec-sec-edit-email').value = btn.getAttribute('data-email');
                            var roleSel = overlay.querySelector('#lec-sec-edit-role');
                            roleSel.value = btn.getAttribute('data-role');
                            roleSel.disabled = btn.getAttribute('data-role') === 'master'; // master role is fixed
                            overlay.querySelector('#lec-sec-edit-target').innerHTML =
                                'Editing <strong>' + esc(btn.getAttribute('data-name')) + '</strong> — update the name, email' +
                                (result.is_master && btn.getAttribute('data-role') !== 'master' ? ' or role' : '') + '.';
                            box.setAttribute('data-id', btn.getAttribute('data-id'));
                            box.scrollIntoView({ block: 'nearest' });
                        });
                    });
                }).catch(function (error) {
                    var container = overlay.querySelector('#lec-sec-admin-list');
                    if (container) container.innerHTML = '<em style="color:#c0392b;font-size:13px;">' + esc(error.message) + '</em>';
                });
            }
            renderAdminList();

            function decideUser(id, action) {
                api('auth', {
                    method: 'POST',
                    action: action,
                    body: { id: Number(id) }
                }).then(function (r) {
                    msg(r.message || 'Done.');
                    renderAdminList();
                }).catch(function (e) { msg(e.message, true); });
            }

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
                    var pw = overlay.querySelector('#lec-sec-admin-password').value;
                    var pwConfirm = overlay.querySelector('#lec-sec-admin-confirm').value;
                    if (pw !== pwConfirm) {
                        msg('Password confirmation does not match the password.', true);
                        return;
                    }
                    api('auth', {
                        method: 'POST',
                        action: 'create-admin',
                        body: {
                            full_name: overlay.querySelector('#lec-sec-admin-name').value.trim(),
                            email: overlay.querySelector('#lec-sec-admin-email').value.trim(),
                            password: pw,
                            confirm_password: pwConfirm,
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

            // My details (every admin edits their own name/email).
            overlay.querySelector('#lec-sec-profile-form').addEventListener('submit', function (event) {
                event.preventDefault();
                api('auth', {
                    method: 'POST',
                    action: 'update-profile',
                    body: {
                        full_name: overlay.querySelector('#lec-sec-profile-name').value.trim(),
                        email: overlay.querySelector('#lec-sec-profile-email').value.trim()
                    }
                }).then(function (r) {
                    msg(r.message || 'Details updated.');
                    renderAdminList();
                    // Refresh the header name/role without a reload.
                    api('auth', { action: 'me' }).then(function (updated) {
                        if (updated.user) setUser(updated.user);
                    }).catch(function () {});
                }).catch(function (e) { msg(e.message, true); });
            });

            // Master editing another account.
            var editBox = overlay.querySelector('#lec-sec-edit-others');
            overlay.querySelector('#lec-sec-edit-cancel').addEventListener('click', function () {
                editBox.style.display = 'none';
                editBox.removeAttribute('data-id');
            });
            overlay.querySelector('#lec-sec-edit-save').addEventListener('click', function () {
                var targetId = Number(editBox.getAttribute('data-id'));
                if (!targetId) { msg('Pick an account with ✎ Edit first.', true); return; }
                api('auth', {
                    method: 'POST',
                    action: 'update-profile',
                    body: {
                        id: targetId,
                        full_name: overlay.querySelector('#lec-sec-edit-name').value.trim(),
                        email: overlay.querySelector('#lec-sec-edit-email').value.trim(),
                        role: overlay.querySelector('#lec-sec-edit-role').value
                    }
                }).then(function (r) {
                    msg(r.message || 'Account updated.');
                    editBox.style.display = 'none';
                    editBox.removeAttribute('data-id');
                    renderAdminList();
                }).catch(function (e) { msg(e.message, true); });
            });

            overlay.querySelector('#lec-sec-password-form').addEventListener('submit', function (event) {
                event.preventDefault();
                var newPw = overlay.querySelector('#lec-sec-new').value;
                var newConfirm = overlay.querySelector('#lec-sec-new-confirm').value;
                if (newPw !== newConfirm) {
                    msg('Password confirmation does not match the new password.', true);
                    return;
                }
                api('auth', {
                    method: 'POST',
                    action: 'change-password',
                    body: {
                        current_password: overlay.querySelector('#lec-sec-current').value,
                        new_password: newPw,
                        confirm_password: newConfirm
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
            // payload builders may return a promise (e.g. to create related records first)
            Promise.resolve(payload).then(function (resolved) {
                if (!resolved) return null; // async builder already showed an error
                var request = state.editingId
                    ? api(config.resource, { method: 'PATCH', id: state.editingId, body: resolved })
                    : api(config.resource, { method: 'POST', body: resolved });

                return request.then(function () {
                    toast(state.editingId ? 'Record updated.' : config.label + ' saved.');
                    resetForm();
                    return refresh();
                });
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
                // labelFn is called with the row's id (customerName/vehicleLabel/
                // mechanicName all resolve names from the cache by id).
                return '<option value="' + row.id + '">' + esc(labelFn(row.id)) + '</option>';
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

            /* Customer and vehicle are typed by the admin instead of picked from a
               dropdown. Matching options are suggested, and anything new is created
               automatically when the invoice is saved. */
            var customerInput = form.elements.customer;
            var vehicleInput = form.elements.vehicle;

            function refreshSuggestions() {
                var customerList = $('customer-options');
                var vehicleList = $('vehicle-options');
                if (customerList) {
                    customerList.innerHTML = cache.customers.map(function (c) {
                        return '<option value="' + esc(customerName(c.id)) + '"></option>';
                    }).join('');
                }
                if (vehicleList) {
                    vehicleList.innerHTML = cache.vehicles.map(function (v) {
                        return '<option value="' + esc(v.registration_number + ' — ' + v.make + ' ' + v.model) + '"></option>';
                    }).join('');
                }
            }
            refreshSuggestions();

            // Keep names in sync so vehicles created here link to the right owner.
            function vehicleOwnerName() { return customerInput.value.trim(); }

            function isSameCustomer(name, customer) {
                return name.toLowerCase() === (customer.first_name + ' ' + customer.last_name).trim().toLowerCase();
            }

            function findCustomerByName(name) {
                return cache.customers.filter(function (c) { return isSameCustomer(name, c); })[0] || null;
            }

            function findVehicleByLabel(text) {
                var needle = text.trim().toLowerCase();
                return cache.vehicles.filter(function (v) {
                    return (v.registration_number + ' — ' + v.make + ' ' + v.model).toLowerCase() === needle ||
                        String(v.registration_number).toLowerCase() === needle;
                })[0] || null;
            }

            function ensureCustomer(name) {
                var existing = findCustomerByName(name);
                if (existing) return Promise.resolve(existing.id);
                return api('customers', {
                    method: 'POST',
                    body: {
                        first_name: name,
                        last_name: '',
                        phone: 'N/A',
                        customer_type: 'Individual'
                    }
                }).then(function (result) {
                    var record = { id: result.id, first_name: name, last_name: '', phone: 'N/A' };
                    cache.customers.push(record);
                    cache.customerById[result.id] = record;
                    refreshSuggestions();
                    return result.id;
                });
            }

            function ensureVehicle(text) {
                var existing = findVehicleByLabel(text);
                if (existing) return Promise.resolve(existing.id);
                var ownerName = vehicleOwnerName();
                return ensureCustomer(ownerName || 'Walk-in Customer').then(function (ownerId) {
                    var reg = text.split('—')[0].trim();
                    var rest = text.split('—')[1] || '';
                    var parts = rest.trim().split(/\s+/);
                    return api('vehicles', {
                        method: 'POST',
                        body: {
                            customer_id: ownerId,
                            registration_number: reg,
                            make: parts[0] || 'Unknown',
                            model: parts.slice(1).join(' ') || 'Unknown'
                        }
                    }).then(function (result) {
                        var record = {
                            id: result.id,
                            customer_id: ownerId,
                            registration_number: reg,
                            make: parts[0] || 'Unknown',
                            model: parts.slice(1).join(' ') || 'Unknown'
                        };
                        cache.vehicles.push(record);
                        cache.vehicleById[result.id] = record;
                        refreshSuggestions();
                        return result.id;
                    });
                });
            }

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
                    var customerTyped = f.customer.value.trim();
                    if (!customerTyped) {
                        toast('Please enter the customer to bill.', true);
                        return null;
                    }
                    // Resolve the typed customer (and vehicle, if any) before saving.
                    return ensureCustomer(customerTyped).then(function (customerId) {
                        var vehicleTyped = f.vehicle.value.trim();
                        var vehiclePromise = vehicleTyped ? ensureVehicle(vehicleTyped) : Promise.resolve(null);
                        return vehiclePromise.then(function (vehicleId) {
                            var statusMap = { 'Unpaid': 'Unpaid', 'Partially Paid': 'Partially Paid', 'Paid': 'Paid', 'Overdue': 'Unpaid' };
                            return {
                                invoice_number: f.invoiceNumber.value.trim(),
                                customer_id: customerId,
                                vehicle_id: vehicleId,
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
                        });
                    });
                },
                fill: function (form, record) {
                    var f = form.elements;
                    f.invoiceNumber.value = record.invoice_number || '';
                    f.invoiceDate.value = record.invoice_date || '';
                    f.customer.value = customerName(record.customer_id);
                    f.vehicle.value = record.vehicle_id ? vehicleLabel(record.vehicle_id) : '';
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
        var showApprenticeships = false;
        var allRequests = [];

        function statusColor(status) {
            return {
                'New': '#2980b9',
                'Contacted': '#8e44ad',
                'Approved': '#1e8e3e',
                'Scheduled': '#e67e22',
                'Declined': '#c0392b',
                'Completed': '#1e8e3e',
                'Closed': '#7f8c8d',
                'Car Fixed': '#1e8e3e',
                'Not Done': '#c0392b'
            }[status] || '#333';
        }

        // Quick status update from the action buttons in the table.
        function quickStatus(id, status) {
            var label = { 'Approved': 'Approve this request?', 'Car Fixed': 'Mark as CAR FIXED? The client will see this immediately.', 'Not Done': 'Mark as NOT DONE? The client will be asked to call you.' }[status];
            if (!window.confirm(label || ('Set status to ' + status + '?'))) return;
            api('service_requests', { method: 'PATCH', id: id, body: { status: status } })
                .then(function () {
                    toast('Status set to ' + status + '.');
                    refresh();
                })
                .catch(function (error) { toast(error.message, true); });
        }

        // Show the full apprenticeship application details.
        function showApprenticeDetails(record) {
            var detailsBox = $('sr-apprentice-details');
            var panelBox = $('sr-apprentice-panel');
            if (!detailsBox || !panelBox) return;
            if ($('sr-apprentice-label')) $('sr-apprentice-label').textContent = '#' + record.id + ' — ' + record.full_name;
            var rows = [
                ['Name', (record.first_name || '') + ' ' + (record.last_name || '')],
                ['Age', record.age || '—'],
                ['Phone', record.phone || '—'],
                ['Email', record.email || '—'],
                ['O Level qualifications', record.o_level_results || '—'],
                ['A Level qualifications', record.a_level_results || '—'],
                ['Technical subjects', record.technical_subjects || '—'],
                ['Driver\'s licence', record.drivers_licence || '—'],
                ['Motivation / notes', record.message || '—'],
                ['Tracking code', record.tracking_code || '—'],
                ['Submitted', String(record.created_at || '').slice(0, 10)]
            ];
            detailsBox.innerHTML = rows.map(function (pair) {
                return '<div><dt>' + esc(pair[0]) + '</dt><dd>' + esc(pair[1]) + '</dd></div>';
            }).join('');
            panelBox.hidden = false;
            panelBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Tab switching between car requests and apprenticeship applications.
        var tabService = $('sr-tab-service');
        var tabApprentice = $('sr-tab-apprentice');
        function paintTabs() {
            if (tabService) tabService.className = showApprenticeships ? 'cancel-button' : 'admin-primary-button';
            if (tabApprentice) tabApprentice.className = showApprenticeships ? 'admin-primary-button' : 'cancel-button';
        }
        if (tabService) tabService.addEventListener('click', function () {
            showApprenticeships = false; paintTabs(); refresh();
        });
        if (tabApprentice) tabApprentice.addEventListener('click', function () {
            showApprenticeships = true; paintTabs(); refresh();
        });
        if ($('sr-apprentice-close')) {
            $('sr-apprentice-close').addEventListener('click', function () {
                if ($('sr-apprentice-panel')) $('sr-apprentice-panel').hidden = true;
            });
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
        }        function refresh() {
            return api('service_requests').then(function (result) {
                allRequests = (result.data || []).slice().sort(function (a, b) { return b.id - a.id; });
                var rows = allRequests.filter(function (r) {
                    return showApprenticeships ? r.request_type === 'Apprenticeship' : r.request_type !== 'Apprenticeship';
                });

                if (!rows.length) {
                    tbody.innerHTML = '<tr><td colspan="9" class="table-empty">' + (showApprenticeships
                        ? 'No apprenticeship applications yet. They appear here when someone applies on the Services page.'
                        : 'No service requests yet. They will appear here when customers submit the website contact form.') + '</td></tr>';
                    return;
                }

                tbody.innerHTML = rows.map(function (row) {
                    var search = (row.full_name + ' ' + row.phone + ' ' + row.request_type + ' ' + row.message + ' ' + row.status)
                        .toLowerCase().replace(/"/g, '&quot;');
                    var isApp = row.request_type === 'Apprenticeship';
                    var fixed = row.status === 'Car Fixed' || row.status === 'Not Done' || row.status === 'Completed';
                    var actions =
                        '<button type="button" class="row-track" data-id="' + row.id + '">🔍 Track</button>' +
                        (isApp
                            ? '<button type="button" class="row-app-details" data-id="' + row.id + '">📄 Details</button>' +
                              (row.status !== 'Approved'
                                  ? '<button type="button" class="row-quick-approve" data-id="' + row.id + '">✓ Approve</button>' +
                                    '<button type="button" class="row-quick-decline" data-id="' + row.id + '">✗ Disapprove</button>'
                                  : '')
                            : (row.status !== 'Car Fixed'
                                  ? '<button type="button" class="row-quick-fixed" data-id="' + row.id + '" ' +
                                    'style="background:#1e8e3e;color:#fff;border-color:#1e8e3e;">✔ Car Fixed</button>' : '') +
                              (row.status !== 'Not Done'
                                  ? '<button type="button" class="row-quick-notdone" data-id="' + row.id + '" ' +
                                    'style="background:#c0392b;color:#fff;border-color:#c0392b;">✖ Not Done</button>' : '')) +
                        '<button type="button" class="row-edit" data-id="' + row.id + '">Edit</button>' +
                        '<button type="button" class="row-delete" data-id="' + row.id + '">Delete</button>';
                    return '<tr data-search="' + search + '">' +
                        '<td>' + row.id + '</td>' +
                        '<td><strong>' + esc(row.full_name) + '</strong></td>' +
                        '<td>' + esc(row.phone) + '</td>' +
                        '<td>' + esc(row.request_type) + '</td>' +
                        '<td style="max-width:260px;">' + esc(String(row.message || '').slice(0, 90)) + (String(row.message || '').length > 90 ? '…' : '') + '</td>' +
                        '<td>' + esc(row.preferred_date || '—') + '</td>' +
                        '<td><span style="color:' + statusColor(row.status) + ';font-weight:700;">' + esc(row.status) + '</span></td>' +
                        '<td><code class="track-code-cell">' + esc(row.tracking_code || '—') + '</code></td>' +
                        '<td style="white-space:nowrap;">' + actions + '</td></tr>';
                }).join('');

                tbody.querySelectorAll('.row-quick-approve').forEach(function (button) {
                    button.addEventListener('click', function () { quickStatus(button.getAttribute('data-id'), 'Approved'); });
                });
                tbody.querySelectorAll('.row-quick-decline').forEach(function (button) {
                    button.addEventListener('click', function () { quickStatus(button.getAttribute('data-id'), 'Declined'); });
                });
                tbody.querySelectorAll('.row-quick-fixed').forEach(function (button) {
                    button.addEventListener('click', function () { quickStatus(button.getAttribute('data-id'), 'Car Fixed'); });
                });
                tbody.querySelectorAll('.row-quick-notdone').forEach(function (button) {
                    button.addEventListener('click', function () { quickStatus(button.getAttribute('data-id'), 'Not Done'); });
                });
                tbody.querySelectorAll('.row-app-details').forEach(function (button) {
                    button.addEventListener('click', function () {
                        var record = rows.filter(function (r) { return String(r.id) === button.getAttribute('data-id'); })[0];
                        if (record) showApprenticeDetails(record);
                    });
                });

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
                        var statusSelect = $('sr-status');
                        if (statusSelect) {
                            // Include the request's current status even if it is a new value.
                            var hasOption = Array.prototype.some.call(statusSelect.options, function (o) { return o.value === record.status; });
                            if (!hasOption && record.status) {
                                var opt = document.createElement('option');
                                opt.value = record.status; opt.textContent = record.status;
                                statusSelect.appendChild(opt);
                            }
                        }
                        panel.hidden = false;
                        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                });

                // Track button: shows the customer-facing status view for this request.
                tbody.querySelectorAll('.row-track').forEach(function (button) {
                    button.addEventListener('click', function () {
                        var record = rows.filter(function (r) { return String(r.id) === button.getAttribute('data-id'); })[0];
                        if (record) showTrackModal(record);
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

    /* ================= track-status modal (customer view) ================= */

    var TRACK_STEPS = [
        { key: 'Received',  label: 'Request Received',   note: 'Your request is in our system and waiting for review.' },
        { key: 'In Review', label: 'Under Review',       note: 'Our team is reviewing your request.' },
        { key: 'Approved',  label: 'Approved by Admin',  note: 'Good news — the admin has approved your request.' },
        { key: 'Scheduled', label: 'Booked & Scheduled', note: 'Your service has been scheduled. See the date below.' },
        { key: 'Completed', label: 'Service Completed',  note: 'The work is done. Thank you for choosing LEC Mechanics.' }
    ];
    var TRACK_STEP_FOR_STATUS = { 'New': 0, 'Contacted': 1, 'Approved': 2, 'Scheduled': 3, 'Completed': 4 };

    function showTrackModal(record) {
        if (document.getElementById('lec-track-modal')) return;

        var status = record.status || 'New';
        var code = record.tracking_code || '—';
        var current = TRACK_STEP_FOR_STATUS[status] !== undefined ? TRACK_STEP_FOR_STATUS[status] : 0;

        function fmtDate(value) {
            if (!value) return '—';
            var d = new Date(String(value).replace(' ', 'T'));
            return isNaN(d) ? esc(value) : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        }

        var body;
        if (status === 'Car Fixed' || status === 'Completed') {
            body =
                '<span class="track-status-pill track-pill-success">✔ Car Fixed</span>' +
                '<h3>Your car is fixed! 🎉</h3>' +
                '<p>All work has been completed. The customer can collect the vehicle at their convenience.</p>' +
                '<dl class="track-details">' +
                    '<div><dt>Code</dt><dd>' + esc(code) + '</dd></div>' +
                    '<div><dt>Service</dt><dd>' + esc(record.service_name || record.request_type) + '</dd></div>' +
                    '<div><dt>Vehicle</dt><dd>' + esc(record.registration_number || '—') + '</dd></div>' +
                    '<div><dt>Submitted</dt><dd>' + fmtDate(record.created_at) + '</dd></div>' +
                '</dl>';
        } else if (status === 'Not Done') {
            body =
                '<span class="track-status-pill track-pill-declined">✖ Not Done</span>' +
                '<h3>We could not complete this job</h3>' +
                '<p>The customer sees: unable to fix due to circumstances beyond our control — asked to call 0771 232 171.</p>' +
                '<dl class="track-details">' +
                    '<div><dt>Code</dt><dd>' + esc(code) + '</dd></div>' +
                    '<div><dt>Service</dt><dd>' + esc(record.service_name || record.request_type) + '</dd></div>' +
                    '<div><dt>Submitted</dt><dd>' + fmtDate(record.created_at) + '</dd></div>' +
                '</dl>';
        } else if (status === 'Declined' || status === 'Closed') {
            var isApprenticeship = (record.request_type || '') === 'Apprenticeship';
            var closedNote = status === 'Declined'
                ? (isApprenticeship
                    ? 'The apprenticeship application was not successful this time.'
                    : 'Unfortunately this request was not approved. The customer can call 0771 232 171 to discuss it.')
                : 'This request has been closed. The customer can submit a new request if they still need service.';
            body =
                '<span class="track-status-pill track-pill-declined">' + esc(status) + '</span>' +
                '<h3>Request ' + esc(status) + '</h3>' +
                '<p>' + closedNote + '</p>' +
                '<dl class="track-details">' +
                    '<div><dt>Code</dt><dd>' + esc(code) + '</dd></div>' +
                    '<div><dt>Type</dt><dd>' + esc(record.request_type) + '</dd></div>' +
                    '<div><dt>Submitted</dt><dd>' + fmtDate(record.created_at) + '</dd></div>' +
                '</dl>';
        } else if ((record.request_type || '') === 'Apprenticeship') {
            // Mirror the customer's apprenticeship view (2 steps, not the service flow).
            var appSteps = [
                { key: 'New',      label: 'Application Received',      note: 'The application is in the system and waiting for review.' },
                { key: 'Approved', label: 'Application Approved ✅', note: 'Congratulations! Approved — the team will call the applicant on the number provided.' }
            ];
            var appIndex = (status === 'Approved' || status === 'Scheduled') ? 1 : 0;
            var appStepsHtml = appSteps.map(function (step, index) {
                var state = index < appIndex ? 'done' : (index === appIndex ? 'current' : 'todo');
                return '<li class="track-step ' + state + '">' +
                    '<span class="track-step-dot"></span>' +
                    '<div><strong>' + esc(step.label) + '</strong>' +
                    (state === 'current' ? '<p>' + esc(step.note) + '</p>' : '') +
                    '</div></li>';
            }).join('');
            body =
                '<span class="track-status-pill">' + esc(status === 'Scheduled' ? 'Approved' : status) + '</span>' +
                '<h3>' + esc(appSteps[appIndex].label) + '</h3>' +
                '<p>' + esc(appSteps[appIndex].note) + '</p>' +
                '<ol class="track-steps">' + appStepsHtml + '</ol>' +
                '<dl class="track-details">' +
                    '<div><dt>Code</dt><dd>' + esc(code) + '</dd></div>' +
                    '<div><dt>Applicant</dt><dd>' + esc(record.full_name) + '</dd></div>' +
                    '<div><dt>Submitted</dt><dd>' + fmtDate(record.created_at) + '</dd></div>' +
                '</dl>';
        } else {
            var stepsHtml = TRACK_STEPS.map(function (step, index) {
                var state = index < current ? 'done' : (index === current ? 'current' : 'todo');
                return '<li class="track-step ' + state + '">' +
                    '<span class="track-step-dot"></span>' +
                    '<div><strong>' + esc(step.label) + '</strong>' +
                    (state === 'current' ? '<p>' + esc(step.note) + '</p>' : '') +
                    '</div></li>';
            }).join('');

            body =
                '<span class="track-status-pill">' + esc(status) + '</span>' +
                '<h3>' + esc(TRACK_STEPS[current].label) + '</h3>' +
                '<p>' + esc(TRACK_STEPS[current].note) + '</p>' +
                '<ol class="track-steps">' + stepsHtml + '</ol>' +
                '<dl class="track-details">' +
                    '<div><dt>Code</dt><dd>' + esc(code) + '</dd></div>' +
                    '<div><dt>Service</dt><dd>' + esc(record.service_name || record.request_type) + '</dd></div>' +
                    '<div><dt>Vehicle</dt><dd>' + esc(record.registration_number || '—') + '</dd></div>' +
                    '<div><dt>Preferred date</dt><dd>' + fmtDate(record.preferred_date) + '</dd></div>' +
                    '<div><dt>Submitted</dt><dd>' + fmtDate(record.created_at) + '</dd></div>' +
                    '<div><dt>Last update</dt><dd>' + fmtDate(record.updated_at) + '</dd></div>' +
                '</dl>';
        }

        var overlay = document.createElement('div');
        overlay.id = 'lec-track-modal';
        overlay.style.cssText =
            'position:fixed;inset:0;z-index:9999;background:rgba(8,12,20,.7);' +
            'display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto;';
        overlay.innerHTML =
            '<div class="track-card" style="max-width:560px;width:100%;margin:auto;position:relative;">' +
                '<button type="button" id="lec-track-close" ' +
                    'style="position:absolute;top:12px;right:12px;border:0;background:none;font-size:24px;cursor:pointer;line-height:1;color:#777;">&times;</button>' +
                '<div style="font-size:11px;font-weight:800;letter-spacing:2px;color:#999;margin-bottom:6px;">CUSTOMER VIEW — WHAT ' + esc(record.full_name || 'THE CLIENT') + ' SEES</div>' +
                body +
                '<div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap;">' +
                    '<button type="button" id="lec-track-copy" class="admin-primary-button" style="flex:1;min-width:180px;">📋 Copy tracking code</button>' +
                    '<a href="https://wa.me/?text=' + encodeURIComponent('Your LEC Mechanics tracking code is ' + code + ' — track your service status at /pages/track.html') + '" target="_blank" rel="noopener" ' +
                    'style="flex:1;min-width:150px;text-align:center;padding:12px;border:0;border-radius:8px;background:#25D366;color:#fff;font-size:13px;font-weight:700;text-decoration:none;">WhatsApp the client</a>' +
                '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        overlay.querySelector('#lec-track-close').addEventListener('click', function () { overlay.remove(); });
        overlay.addEventListener('click', function (event) { if (event.target === overlay) overlay.remove(); });
        document.addEventListener('keydown', function onKey(event) {
            if (event.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); }
        });

        overlay.querySelector('#lec-track-copy').addEventListener('click', function () {
            var done = function () {
                toast('Tracking code copied — paste it to your client.');
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(code).then(done).catch(function () { fallbackCopy(code); done(); });
            } else {
                fallbackCopy(code);
                done();
            }
        });
    }

    function fallbackCopy(text) {
        var temp = document.createElement('textarea');
        temp.value = text;
        temp.style.cssText = 'position:fixed;left:-9999px;';
        document.body.appendChild(temp);
        temp.select();
        try { document.execCommand('copy'); } catch (e) { /* ignore */ }
        temp.remove();
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
                    var total = result.total !== undefined ? result.total : items.length;
                    $('gallery-count').textContent = total + ' image(s) published' +
                        (result.hasMore ? ' (showing latest ' + items.length + ')' : '');
                }

                // Folder suggestions for the upload form.
                var folders = result.folders || {};
                var dataList = $('gallery-folder-list');
                if (dataList) {
                    dataList.innerHTML = Object.keys(folders).map(function (name) {
                        return '<option value="' + esc(name) + '">';
                    }).join('');
                }

                if (!items.length) {
                    grid.innerHTML = '<p class="table-empty">📷 No images yet — upload your first photo above.</p>';
                    return;
                }
                grid.innerHTML = items.map(function (img) {
                    return '<figure class="gallery-admin-card" data-id="' + img.id + '">' +
                        '<img src="/api?resource=gallery_image&thumb=1&id=' + encodeURIComponent(img.id) + '" alt="' + esc(img.title) + '" loading="lazy" decoding="async">' +
                        '<figcaption>' +
                        '<strong>' + esc(img.title) + '</strong>' +
                        '<span>📁 ' + esc(img.folder || 'General') + '</span>' +
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

            var btn = $('gallery-upload-btn');
            btn.disabled = true;
            btn.textContent = 'Preparing…';

            // keep the chosen folder after reset() below
            var chosenFolder = $('gallery-folder').value;

            // Resize each file in the browser before upload: full version capped
            // at 1600px (~250-400KB as JPEG) plus a 400px thumbnail (~30-60KB).
            // This keeps uploads fast and the website light even with phone photos.
            var MAX_FULL = 1600, MAX_THUMB = 400;
            function processFile(file) {
                return new Promise(function (resolve) {
                    var reader = new FileReader();
                    reader.onload = function () {
                        var img = new Image();
                        img.onload = function () {
                            function drawTo(maxSide, quality) {
                                var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                                var canvas = document.createElement('canvas');
                                canvas.width = Math.max(Math.round(img.width * scale), 1);
                                canvas.height = Math.max(Math.round(img.height * scale), 1);
                                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                                return canvas.toDataURL('image/jpeg', quality);
                            }
                            resolve({
                                full: drawTo(MAX_FULL, 0.82),
                                thumb: drawTo(MAX_THUMB, 0.7)
                            });
                        };
                        img.onerror = function () {
                            // Not a decodable image — send the original file as-is.
                            resolve({ full: reader.result, thumb: null });
                        };
                        img.src = reader.result;
                    };
                    reader.readAsDataURL(file);
                });
            }

            var jobs = [];
            for (var i = 0; i < files.length; i++) jobs.push(processFile(files[i]));

            Promise.all(jobs).then(function (processed) {
                btn.textContent = 'Uploading…';
                return fetch(new URL(API_URL, window.location.href).toString() + '?resource=gallery_images', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        images: processed.map(function (p) { return p.full; }),
                        thumbs: processed.map(function (p) { return p.thumb; }),
                        folder: chosenFolder,
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
                $('gallery-folder').value = chosenFolder;
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

    /* ================= auto re-auth lock =================
       Leaving the admin area (visiting the public site, closing the tab, or
       switching apps for a while) locks the panel. Coming back requires the
       password again — without logging the session out server-side. */

    function installReauthLock() {
        var STORE = 'lecAdminUnlocked';
        var LEFT = 'lecLeftAdminAt';

        function markUnlocked() {
            try { sessionStorage.setItem(STORE, '1'); } catch (e) { /* ignore */ }
        }

        function lock() {
            try { sessionStorage.removeItem(STORE); } catch (e) { /* ignore */ }
        }

        function isUnlocked() {
            try { return sessionStorage.getItem(STORE) === '1'; } catch (e) { return false; }
        }

        function forceRelogin() {
            api('auth', { method: 'POST', action: 'logout' }).catch(function () { /* ignore */ }).then(function () {
                setCsrfToken('');
                window.location.reload();
            });
        }

        // ANY click through to the public site locks the panel immediately —
        // returning to the admin area always requires signing in again.
        document.addEventListener('click', function (event) {
            var link = event.target && event.target.closest && event.target.closest('a[href]');
            if (!link) return;
            var href = link.getAttribute('href') || '';
            if (/^(#|mailto:|tel:|javascript:)/.test(href)) return;
            var goesPublic = href.charAt(0) === '.' &&   // public links leave the /admin folder
                !/^\.\/[^/]*\.html$/.test(href) &&      // but ./name.html is an admin page
                !/^\.\/admin/.test(href);
            if (goesPublic) {
                try { sessionStorage.removeItem(LEFT); } catch (e) { /* ignore */ }
                try { sessionStorage.setItem(LEFT, String(Date.now())); } catch (e) { /* ignore */ }
            }
        }, true);

        // Arriving on any admin page after having been on the public site → instant re-auth.
        try {
            if (sessionStorage.getItem(LEFT)) {
                sessionStorage.removeItem(LEFT);
                lock(); // no grace period — instant lock
            }
        } catch (e) { /* ignore */ }

        // Leaving the tab for more than a moment also locks the panel.
        var hiddenAt = 0;
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                hiddenAt = Date.now();
            } else if (hiddenAt && (Date.now() - hiddenAt) > 30 * 1000) {
                lock();
                window.location.reload(); // boot() will show the login overlay
            }
        });

        // Wrap boot: if the panel is locked, end the session and show the login overlay.
        var originalBoot = boot;
        boot = function () {
            if (isUnlocked()) {
                originalBoot();
                return;
            }
            forceRelogin();
        };

        // Expose unlock for the login form (session restore must NOT unlock).
        markAdminUnlocked = markUnlocked;
    }

    var markAdminUnlocked = null;
    installReauthLock();

    /* ================= boot ================= */

    function boot() {
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
                showLogin(result.user_count);
            }
        }).catch(function () {
            setCsrfToken('');
            showLogin();
        });
    });
})();
