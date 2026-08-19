// ============ StockPro Auth: Login + Signup ============

document.addEventListener('DOMContentLoaded', () => {

  const tabs = document.querySelectorAll('.auth-tab');
  const forms = document.querySelectorAll('.auth-form');
  const loginFooterText = document.getElementById('loginFooterText');
  const signupFooterText = document.getElementById('signupFooterText');

  function activateTab(targetId) {
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.target === targetId));
    forms.forEach(form => form.classList.toggle('active', form.id === targetId));

    if (targetId === 'signupForm') {
      loginFooterText.classList.add('hidden');
      signupFooterText.classList.remove('hidden');
    } else {
      loginFooterText.classList.remove('hidden');
      signupFooterText.classList.add('hidden');
    }
    clearErrors();
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.target));
  });

  document.getElementById('showSignup').addEventListener('click', (e) => {
    e.preventDefault();
    activateTab('signupForm');
  });

  document.getElementById('showLogin').addEventListener('click', (e) => {
    e.preventDefault();
    activateTab('loginForm');
  });

  // ---------- Password show/hide ----------
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      const icon = btn.querySelector('i');
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      icon.classList.toggle('fa-eye', !isPassword);
      icon.classList.toggle('fa-eye-slash', isPassword);
    });
  });

  // ---------- Live password strength checklist ----------
  const signupPassword = document.getElementById('signupPassword');
  const checklist = document.getElementById('passwordChecklist');

  signupPassword.addEventListener('input', () => {
    const value = signupPassword.value;
    setRule('length', value.length >= 8);
    setRule('upper', /[A-Z]/.test(value));
    setRule('number', /[0-9]/.test(value));
  });

  function setRule(rule, passed) {
    const item = checklist.querySelector(`[data-rule="${rule}"]`);
    item.classList.toggle('valid', passed);
    const icon = item.querySelector('i');
    icon.classList.toggle('fa-circle-check', passed);
    icon.classList.toggle('fa-circle', !passed);
  }

  // ---------- Error helpers ----------
  function showError(elId, message) {
    const el = document.getElementById(elId);
    el.textContent = message;
    el.classList.add('show');
  }

  function clearErrors() {
    document.querySelectorAll('.form-error').forEach(el => {
      el.textContent = '';
      el.classList.remove('show');
    });
    document.querySelectorAll('.form-group input').forEach(input => {
      input.classList.remove('invalid');
    });
  }

  function markInvalid(id) {
    document.getElementById(id).classList.add('invalid');
  }

  // ---------- Toast ----------
  const toast = document.getElementById('toast');
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // ---------- LOGIN submit ----------
  const loginForm = document.getElementById('loginForm');
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors();

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username) {
      markInvalid('loginUsername');
      showError('loginError', 'Please enter your username or email.');
      return;
    }
    if (!password) {
      markInvalid('loginPassword');
      showError('loginError', 'Please enter your password.');
      return;
    }

    // ---- Hook up your real authentication call here ----
    // Example:
    // fetch('/api/login', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ username, password })
    // })
    //   .then(res => res.json())
    //   .then(data => { if (data.success) window.location.href = '/dashboard.html'; })
    //   .catch(() => showError('loginError', 'Something went wrong. Try again.'));

    showToast('Signed in! Redirecting…');
    // window.location.href = 'dashboard.html';
  });

  // ---------- SIGNUP submit ----------
  const signupForm = document.getElementById('signupForm');
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors();

    const fullName = document.getElementById('fullName').value.trim();
    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const terms = document.getElementById('terms').checked;

    if (!fullName) {
      markInvalid('fullName');
      showError('signupError', 'Please enter your full name.');
      return;
    }
    if (!username) {
      markInvalid('signupUsername');
      showError('signupError', 'Please choose a username.');
      return;
    }
    if (!isValidEmail(email)) {
      markInvalid('signupEmail');
      showError('signupError', 'Please enter a valid email address.');
      return;
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      markInvalid('signupPassword');
      showError('signupError', 'Password must meet all the requirements below.');
      return;
    }
    if (password !== confirmPassword) {
      markInvalid('confirmPassword');
      showError('signupError', 'Passwords do not match.');
      return;
    }
    if (!terms) {
      showError('signupError', 'Please agree to the Terms & Privacy Policy.');
      return;
    }

    // ---- Hook up your real registration call here ----
    // fetch('/api/register', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ fullName, username, email, password })
    // })
    //   .then(res => res.json())
    //   .then(data => {
    //     if (data.success) {
    //       showToast('Account created! Please sign in.');
    //       activateTab('loginForm');
    //     } else {
    //       showError('signupError', data.message || 'Registration failed.');
    //     }
    //   })
    //   .catch(() => showError('signupError', 'Something went wrong. Try again.'));

    showToast('Account created! You can now sign in.');
    signupForm.reset();
    checklist.querySelectorAll('li').forEach(li => {
      li.classList.remove('valid');
      const icon = li.querySelector('i');
      icon.classList.add('fa-circle');
      icon.classList.remove('fa-circle-check');
    });
    activateTab('loginForm');
  });

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
});