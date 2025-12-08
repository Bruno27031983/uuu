// ================== MAXIMÁLNE BEZPEČNÁ VERZIA - app.js ==================

// Importy Firebase (CDN moduly)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js';

import {
  initializeFirestore,
  persistentLocalCache,
  CACHE_SIZE_UNLIMITED,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';

import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app-check.js';

// ================== Firebase konfigurácia ==================
const firebaseConfig = {
  apiKey: "AIzaSyBdLtJlduT3iKiGLDJ0UfAakpf6wcresnk",
  authDomain: "uuuuu-f7ef9.firebaseapp.com",
  projectId: "uuuuu-f7ef9",
  storageBucket: "uuuuu-f7ef9.appspot.com",
  messagingSenderId: "456105865458",
  appId: "1:456105865458:web:101f0a4dcb455f174b606b",
};
const RECAPTCHA_V3_SITE_KEY = "6LczmP0qAAAAAACGalBT9zZekkUr3hLgA2e8o99v";

const app = initializeApp(firebaseConfig);

// App Check - ochrana proti abuse
try {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
  console.log('✅ App Check initialized successfully');
} catch (e) {
  console.warn("⚠️ App Check init failed:", e);
}

const auth = getAuth(app);
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ sizeBytes: CACHE_SIZE_UNLIMITED })
  });
  console.log('✅ Firestore initialized with persistent cache');
} catch (e) {
  console.warn("⚠️ Firestore persistent cache failed, fallback:", e);
  db = initializeFirestore(app, {});
}

// ================== Bezpečnostné konštanty ==================
const SECURITY_CONSTANTS = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_TIMEOUT_MS: 900000, // 15 minút
  MAX_INPUT_LENGTH: {
    employeeName: 100,
    project: 200,
    note: 500,
    email: 100,
    password: 128
  },
  RATE_LIMIT: {
    saveToCloud: 2000, // 2 sekundy
    authAction: 3000, // 3 sekundy
    inputChange: 800 // 0.8 sekundy
  },
  VALIDATION_PATTERNS: {
    email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    time: /^([01]\d|2[0-3]):([0-5]\d)$/,
    number: /^\d+([.,]\d{1,2})?$/,
    name: /^[a-zA-ZáčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ\s]{1,100}$/
  }
};

// ================== Rate Limiting Manager ==================
class RateLimiter {
  constructor() {
    this.attempts = new Map();
    this.blockedUntil = new Map();
  }

  canAttempt(key, maxAttempts = SECURITY_CONSTANTS.MAX_LOGIN_ATTEMPTS, timeoutMs = SECURITY_CONSTANTS.LOGIN_TIMEOUT_MS) {
    const now = Date.now();
    
    // Skontroluj, či je užívateľ zablokovaný
    if (this.blockedUntil.has(key)) {
      const blockedTime = this.blockedUntil.get(key);
      if (now < blockedTime) {
        const remainingMinutes = Math.ceil((blockedTime - now) / 60000);
        return { allowed: false, remaining: remainingMinutes };
      } else {
        this.blockedUntil.delete(key);
        this.attempts.delete(key);
      }
    }

    const attemptsData = this.attempts.get(key) || { count: 0, firstAttempt: now };
    
    if (attemptsData.count >= maxAttempts) {
      const blockUntil = now + timeoutMs;
      this.blockedUntil.set(key, blockUntil);
      return { allowed: false, remaining: Math.ceil(timeoutMs / 60000) };
    }

    return { allowed: true, remaining: 0 };
  }

  recordAttempt(key, success = false) {
    if (success) {
      this.attempts.delete(key);
      this.blockedUntil.delete(key);
      return;
    }

    const now = Date.now();
    const attemptsData = this.attempts.get(key) || { count: 0, firstAttempt: now };
    attemptsData.count++;
    attemptsData.lastAttempt = now;
    this.attempts.set(key, attemptsData);
  }

  reset(key) {
    this.attempts.delete(key);
    this.blockedUntil.delete(key);
  }
}

const rateLimiter = new RateLimiter();

// ================== Input Sanitizer s DOMPurify ==================
class InputSanitizer {
  static sanitize(input, maxLength = 500) {
    if (typeof input !== 'string') return '';
    
    // Použitie DOMPurify ak je dostupný
    if (window.DOMPurify) {
      input = window.DOMPurify.sanitize(input, { 
        ALLOWED_TAGS: [], 
        ALLOWED_ATTR: [] 
      });
    }
    
    // Manuálna sanitizácia ako fallback
    input = input
      .replace(/[<>]/g, '') // Odstráň HTML tagy
      .replace(/javascript:/gi, '') // Odstráň javascript: protokol
      .replace(/on\w+=/gi, '') // Odstráň event handlery
      .trim();
    
    return input.substring(0, maxLength);
  }

  static sanitizeHTML(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  }

  static validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    email = email.trim().toLowerCase();
    return SECURITY_CONSTANTS.VALIDATION_PATTERNS.email.test(email) && 
           email.length <= SECURITY_CONSTANTS.MAX_INPUT_LENGTH.email;
  }

  static validatePassword(password) {
    if (!password || typeof password !== 'string') {
      return { valid: false, message: 'Heslo je povinné.' };
    }
    if (password.length < 8) {
      return { valid: false, message: 'Heslo musí mať aspoň 8 znakov.' };
    }
    if (password.length > SECURITY_CONSTANTS.MAX_INPUT_LENGTH.password) {
      return { valid: false, message: 'Heslo je príliš dlhé (max 128 znakov).' };
    }
    if (!/[A-Z]/.test(password)) {
      return { valid: false, message: 'Heslo musí obsahovať aspoň jedno veľké písmeno.' };
    }
    if (!/[a-z]/.test(password)) {
      return { valid: false, message: 'Heslo musí obsahovať aspoň jedno malé písmeno.' };
    }
    if (!/\d/.test(password)) {
      return { valid: false, message: 'Heslo musí obsahovať aspoň jedno číslo.' };
    }
    return { valid: true, message: '' };
  }

  static validateNumber(value, min = 0, max = Infinity) {
    const num = parseFloat(String(value).replace(',', '.'));
    return !isNaN(num) && num >= min && num <= max;
  }

  static validateTime(timeString) {
    return typeof timeString === 'string' && 
           SECURITY_CONSTANTS.VALIDATION_PATTERNS.time.test(timeString);
  }
}

// ================== Globálne premenné ==================
let currentUser = null;

const ui = {
  workDaysTbody: document.getElementById('workDays'),
  totalSalaryDiv: document.getElementById('totalSalary'),
  subTitle: document.getElementById('subTitle'),
  hourlyWageInput: document.getElementById('hourlyWageInput'),
  taxRateInput: document.getElementById('taxRateInput'),
  monthlyGoalInput: document.getElementById('monthlyGoalInput'),
  monthSelect: document.getElementById('monthSelect'),
  yearSelect: document.getElementById('yearSelect'),
  decimalPlacesSelect: document.getElementById('decimalPlacesSelect'),
  employeeNameInput: document.getElementById('employeeNameInput'),
  toggleSettingsBtn: document.getElementById('toggleSettingsBtn'),
  settingsCollapsibleContent: document.getElementById('settings-collapsible-content'),
  localStorageIndicator: document.getElementById('localStorageIndicator'),
  loginFieldset: document.getElementById('login-fieldset'),
  userInfo: document.getElementById('user-info'),
  userEmailSpan: document.getElementById('user-email'),
  appLoader: document.getElementById('app-loader'),
  mainContainer: document.querySelector('.container'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  themeIcon: document.getElementById('themeIcon'),
  themeMeta: document.querySelector('meta[name="theme-color"]'),
  loginBtn: document.getElementById('loginBtn'),
  registerBtn: document.getElementById('registerBtn'),
  resetPasswordLink: document.getElementById('resetPasswordLink'),
  logoutBtn: document.getElementById('logoutBtn'),
  exportPDFBtn: document.getElementById('exportPDFBtn'),
  sendPDFBtn: document.getElementById('sendPDFBtn'),
  createBackupBtn: document.getElementById('createBackupBtn'),
  restoreBackupBtn: document.getElementById('restoreBackupBtn'),
  loadFromFirestoreBtn: document.getElementById('loadFromFirestoreBtn'),
  saveToFirestoreBtn: document.getElementById('saveToFirestoreBtn'),
  clearMonthBtn: document.getElementById('clearMonthBtn'),
  emailInput: document.getElementById('email'),
  passwordInput: document.getElementById('password')
};

const currentDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();

let appSettings = {
  decimalPlaces: 2,
  employeeName: '',
  hourlyWage: 10,
  taxRate: 0.02,
  theme: 'light',
  monthlyEarningsGoal: null
};

const MONTH_NAMES = ["Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"];
const DAY_NAMES_SHORT = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];

// ================== Utility Functions ==================
const debounce = (fn, delay) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
};

const throttle = (fn, delay) => {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  };
};

function getDaysInMonth(month, year) { 
  return new Date(year, month + 1, 0).getDate(); 
}

function getDayName(year, month, day) { 
  return DAY_NAMES_SHORT[new Date(year, month, day).getDay()]; 
}

function isWeekend(year, month, day) {
  const d = new Date(year, month, day).getDay();
  return d === 0 || d === 6;
}

// ================== Notification System ==================
function showNotification(id, message, duration = 3500) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = InputSanitizer.sanitizeHTML(message);
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

function showSaveNotification(msg = '✅ Dáta boli úspešne uložené.') {
  showNotification('saveNotification', msg);
}

function showErrorNotification(msg) {
  console.error('Error:', msg);
  showNotification('errorNotification', '❌ ' + msg, 5000);
}

function showWarningNotification(msg) {
  console.warn('Warning:', msg);
  showNotification('warningNotification', '⚠️ ' + msg, 4500);
}

// ================== Validation Helpers ==================
function showFieldError(fieldId, message) {
  const errorEl = document.getElementById(`${fieldId}-error`);
  const inputEl = document.getElementById(fieldId);
  
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add('show');
  }
  
  if (inputEl) {
    inputEl.classList.add('invalid-input');
    inputEl.classList.remove('valid-input');
  }
}

function clearFieldError(fieldId) {
  const errorEl = document.getElementById(`${fieldId}-error`);
  const inputEl = document.getElementById(fieldId);
  
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.remove('show');
  }
  
  if (inputEl) {
    inputEl.classList.remove('invalid-input');
    if (inputEl.value) {
      inputEl.classList.add('valid-input');
    } else {
      inputEl.classList.remove('valid-input');
    }
  }
}

// ================== Theme Manager ==================
const ThemeManager = {
  init() {
    const stored = localStorage.getItem('theme');
    if (stored && (stored === 'light' || stored === 'dark')) {
      appSettings.theme = stored;
    } else {
      appSettings.theme = window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    this.applyTheme(appSettings.theme);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (!localStorage.getItem('theme')) {
        this.applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  },
  
  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    ui.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    appSettings.theme = theme;
    if (ui.themeMeta) {
      ui.themeMeta.content = getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-color-meta').trim();
    }
  },
  
  toggle() {
    const newTheme = appSettings.theme === 'light' ? 'dark' : 'light';
    this.applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    console.log(`🎨 Theme switched to: ${newTheme}`);
  }
};

// ================== Settings Management ==================
function loadAppSettingsFromLocalStorage() {
  try {
    const dp = parseInt(localStorage.getItem('decimalPlaces'));
    appSettings.decimalPlaces = (dp >= 0 && dp <= 3) ? dp : 2;
    
    const storedName = localStorage.getItem('employeeName');
    appSettings.employeeName = storedName ? InputSanitizer.sanitize(storedName, SECURITY_CONSTANTS.MAX_INPUT_LENGTH.employeeName) : '';
    
    const hw = parseFloat(localStorage.getItem('hourlyWage'));
    appSettings.hourlyWage = InputSanitizer.validateNumber(hw, 0, 1000) ? hw : 10;
    
    const tr = parseFloat(localStorage.getItem('taxRate'));
    appSettings.taxRate = InputSanitizer.validateNumber(tr, 0, 1) ? tr : 0.02;
    
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) {
      appSettings.theme = storedTheme;
    }
    
    const goal = localStorage.getItem('monthlyEarningsGoal');
    const parsedGoal = parseFloat(goal);
    appSettings.monthlyEarningsGoal = InputSanitizer.validateNumber(parsedGoal, 0, 1000000) ? parsedGoal : null;
    
    console.log('⚙️ Settings loaded from localStorage');
  } catch (e) {
    console.error('Error loading settings:', e);
    showErrorNotification('Chyba pri načítaní nastavení.');
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, value);
    appSettings[key] = value;
  } catch (e) {
    console.error('Error saving setting:', e);
    showErrorNotification('Chyba pri ukladaní nastavenia.');
  }
}

// Uloženie nastavení do Firestore s throttlingom
const saveSettingsToCloud = async () => {
  if (!currentUser || !navigator.onLine) {
    console.log('⚠️ Cannot save to cloud: user not logged in or offline');
    return;
  }
  
  try {
    const validatedSettings = {
      decimalPlaces: Math.max(0, Math.min(3, appSettings.decimalPlaces)),
      employeeName: InputSanitizer.sanitize(appSettings.employeeName, SECURITY_CONSTANTS.MAX_INPUT_LENGTH.employeeName),
      hourlyWage: Math.max(0, Math.min(1000, appSettings.hourlyWage)),
      taxRate: Math.max(0, Math.min(1, appSettings.taxRate)),
      monthlyEarningsGoal: appSettings.monthlyEarningsGoal
    };
    
    const userDoc = doc(db, 'users', currentUser.uid);
    await setDoc(userDoc, { 
      appSettings: validatedSettings,
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    console.log('☁️ Settings saved to cloud');
  } catch (e) {
    console.error('Save settings to Firestore failed:', e);
    showErrorNotification('Nepodarilo sa uložiť nastavenia do cloudu.');
  }
};

const debouncedSaveSettingsToCloud = debounce(saveSettingsToCloud, SECURITY_CONSTANTS.RATE_LIMIT.saveToCloud);

// ================== Table Calculations ==================
function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

function setCurrentTime(input) {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  input.value = `${h}:${m}`;
  input.classList.remove('invalid-time');
  debouncedSaveMonth();
  recalcRow(input);
}

function recalcRow(el) {
  const row = el.closest('tr');
  if (!row) return;
  
  const day = parseInt(row.dataset.day);
  const arr = row.querySelector(`#arrival-${day}`);
  const dep = row.querySelector(`#departure-${day}`);
  const brk = row.querySelector(`#break-${day}`);
  const worked = row.querySelector(`#worked-${day}`);
  const gross = row.querySelector(`#gross-${day}`);
  const net = row.querySelector(`#net-${day}`);

  const arrival = arr.value.trim();
  const departure = dep.value.trim();
  const breakMin = parseFloat(brk.value) || 0;

  // Validácia času
  if (InputSanitizer.validateTime(arrival) && InputSanitizer.validateTime(departure)) {
    const [ah, am] = arrival.split(':').map(Number);
    const [dh, dm] = departure.split(':').map(Number);
    let total = (dh * 60 + dm) - (ah * 60 + am);
    if (total < 0) total += 24 * 60;
    
    const workMin = Math.max(0, total - breakMin);
    const workH = workMin / 60;
    worked.value = workH.toFixed(appSettings.decimalPlaces);
    
    const g = workH * appSettings.hourlyWage;
    const n = g * (1 - appSettings.taxRate);
    gross.value = g.toFixed(appSettings.decimalPlaces);
    net.value = n.toFixed(appSettings.decimalPlaces);
    
    arr.classList.remove('invalid-time');
    dep.classList.remove('invalid-time');
  } else {
    worked.value = '';
    gross.value = '';
    net.value = '';
    
    if (arrival && !InputSanitizer.validateTime(arrival)) {
      arr.classList.add('invalid-time');
    } else {
      arr.classList.remove('invalid-time');
    }
    
    if (departure && !InputSanitizer.validateTime(departure)) {
      dep.classList.add('invalid-time');
    } else {
      dep.classList.remove('invalid-time');
    }
  }
  
  calcTotals();
}

function calcTotals() {
  let totalG = 0;
  let totalN = 0;
  let totalH = 0;
  
  ui.workDaysTbody.querySelectorAll('tr').forEach(tr => {
    const day = parseInt(tr.dataset.day);
    const w = tr.querySelector(`#worked-${day}`);
    const g = tr.querySelector(`#gross-${day}`);
    const n = tr.querySelector(`#net-${day}`);
    
    if (w && w.value) totalH += parseFloat(w.value) || 0;
    if (g && g.value) totalG += parseFloat(g.value) || 0;
    if (n && n.value) totalN += parseFloat(n.value) || 0;
  });

  let html = `
    <strong>Celková hrubá mzda:</strong> ${totalG.toFixed(appSettings.decimalPlaces)} €<br>
    <strong>Celková čistá mzda:</strong> ${totalN.toFixed(appSettings.decimalPlaces)} €<br>
    <strong>Celkovo odpracované hodiny:</strong> ${totalH.toFixed(appSettings.decimalPlaces)} h
  `;

  if (appSettings.monthlyEarningsGoal && appSettings.monthlyEarningsGoal > 0) {
    const progress = (totalN / appSettings.monthlyEarningsGoal) * 100;
    const remaining = appSettings.monthlyEarningsGoal - totalN;
    let cls = 'low';
    if (progress >= 90) cls = 'good';
    else if (progress >= 60) cls = 'medium';
    
    html += `
      <div class="goal-progress ${cls}">
        📊 Progres k cieľu: ${progress.toFixed(1)}% (${totalN.toFixed(2)} / ${appSettings.monthlyEarningsGoal.toFixed(2)} €)<br>
        ${remaining > 0 ? `Zostáva: ${remaining.toFixed(2)} €` : '🎉 Cieľ dosiahnutý!'}
      </div>
    `;
  }

  ui.totalSalaryDiv.innerHTML = html;
}

// ================== Month Data Management ==================
function monthKey(year = currentYear, month = currentMonth) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function collectMonthData() {
  const data = {};
  const days = getDaysInMonth(currentMonth, currentYear);
  
  for (let d = 1; d <= days; d++) {
    const a = document.getElementById(`arrival-${d}`)?.value.trim() || '';
    const b = document.getElementById(`break-${d}`)?.value || '';
    const de = document.getElementById(`departure-${d}`)?.value.trim() || '';
    const p = document.getElementById(`project-${d}`)?.value || '';
    const n = document.getElementById(`note-${d}`)?.value || '';
    
    if (a || b || de || p || n) {
      data[d] = {
        arrival: InputSanitizer.validateTime(a) ? a : '',
        departure: InputSanitizer.validateTime(de) ? de : '',
        break: InputSanitizer.validateNumber(parseFloat(b), 0, 1440) ? parseFloat(b) : 0,
        project: InputSanitizer.sanitize(p, SECURITY_CONSTANTS.MAX_INPUT_LENGTH.project),
        note: InputSanitizer.sanitize(n, SECURITY_CONSTANTS.MAX_INPUT_LENGTH.note)
      };
    }
  }
  
  return data;
}

function saveMonthLocal() {
  try {
    const data = collectMonthData();
    localStorage.setItem(`monthData_${monthKey()}`, JSON.stringify(data));
    console.log(`💾 Month data saved locally: ${monthKey()}`);
  } catch (e) {
    console.error('Error saving month data:', e);
    showErrorNotification('Chyba pri ukladaní dát.');
  }
}

const debouncedSaveMonth = debounce(saveMonthLocal, SECURITY_CONSTANTS.RATE_LIMIT.inputChange);

// Automatické uloženie do Firestore
const saveMonthToCloud = async () => {
  if (!currentUser || !navigator.onLine) return;
  
  try {
    const data = collectMonthData();
    const monthDoc = doc(db, 'users', currentUser.uid, 'months', monthKey());
    
    await setDoc(monthDoc, { 
      data,
      updatedAt: serverTimestamp()
    });
    
    console.log(`☁️ Month data saved to cloud: ${monthKey()}`);
  } catch (e) {
    console.error('Save month to Firestore failed:', e);
  }
};

const debouncedSaveMonthToCloud = debounce(saveMonthToCloud, SECURITY_CONSTANTS.RATE_LIMIT.saveToCloud);

function renderMonth(data = {}) {
  const days = getDaysInMonth(currentMonth, currentYear);
  const today = new Date();
  const isCurrent = today.getMonth() === currentMonth && today.getFullYear() === currentYear;
  const currentDay = isCurrent ? today.getDate() : -1;

  let html = '';
  for (let d = 1; d <= days; d++) {
    const dayName = getDayName(currentYear, currentMonth, d);
    const weekend = isWeekend(currentYear, currentMonth, d);
    const curr = d === currentDay;
    const row = data[d] || {};
    
    const arrival = InputSanitizer.sanitizeHTML(row.arrival || '');
    const departure = InputSanitizer.sanitizeHTML(row.departure || '');
    const breakMin = row.break || 0;
    const project = InputSanitizer.sanitizeHTML(row.project || '');
    const note = InputSanitizer.sanitizeHTML(row.note || '');

    html += `
      <tr data-day="${d}" class="${weekend ? 'weekend-day' : ''} ${curr ? 'current-day' : ''}">
        <td>${d}. ${dayName}</td>
        <td>
          <div class="time-input-wrapper">
            <input type="tel" 
                   id="arrival-${d}" 
                   class="time-input" 
                   placeholder="08:00" 
                   value="${arrival}" 
                   maxlength="5"
                   pattern="[0-9]{2}:[0-9]{2}"
                   autocomplete="off">
            <button type="button" class="time-btn" title="Nastaviť aktuálny čas" aria-label="Nastaviť aktuálny čas">🕐</button>
          </div>
        </td>
        <td>
          <div class="time-input-wrapper">
            <input type="tel" 
                   id="departure-${d}" 
                   class="time-input" 
                   placeholder="16:00" 
                   value="${departure}" 
                   maxlength="5"
                   pattern="[0-9]{2}:[0-9]{2}"
                   autocomplete="off">
            <button type="button" class="time-btn" title="Nastaviť aktuálny čas" aria-label="Nastaviť aktuálny čas">🕐</button>
          </div>
        </td>
        <td>
          <input type="number" 
                 id="break-${d}" 
                 placeholder="30" 
                 value="${breakMin || ''}" 
                 min="0" 
                 max="1440" 
                 step="1"
                 autocomplete="off">
        </td>
        <td><input type="number" id="worked-${d}" readonly tabindex="-1"></td>
        <td>
          <input type="text" 
                 id="project-${d}" 
                 class="project-input" 
                 placeholder="Názov projektu..." 
                 value="${project}" 
                 maxlength="${SECURITY_CONSTANTS.MAX_INPUT_LENGTH.project}"
                 autocomplete="off">
        </td>
        <td>
          <textarea id="note-${d}" 
                    placeholder="Poznámky..." 
                    maxlength="${SECURITY_CONSTANTS.MAX_INPUT_LENGTH.note}"
                    autocomplete="off">${note}</textarea>
        </td>
        <td><input type="number" id="gross-${d}" readonly tabindex="-1"></td>
        <td><input type="number" id="net-${d}" readonly tabindex="-1"></td>
        <td></td>
      </tr>
    `;
  }
  
  ui.workDaysTbody.innerHTML = html;

  // Auto-resize textareas
  ui.workDaysTbody.querySelectorAll('textarea').forEach(t => {
    autoResizeTextarea(t);
    // Pridaj input listener pre auto-resize
    t.addEventListener('input', () => autoResizeTextarea(t));
  });
  
  // Prepočítaj všetky riadky
  ui.workDaysTbody.querySelectorAll('tr').forEach(tr => {
    const inp = tr.querySelector('.time-input');
    if (inp) recalcRow(inp);
  });
  
  console.log(`📅 Month rendered: ${monthKey()}`);
}

function loadCurrentMonth() {
  try {
    const key = `monthData_${monthKey()}`;
    const stored = localStorage.getItem(key);
    let data = {};
    
    if (stored) {
      try { 
        data = JSON.parse(stored); 
      } catch (e) { 
        console.error('Error parsing month data:', e);
      }
    }
    
    renderMonth(data);
    updateSubTitle();
  } catch (e) {
    console.error('Error loading month:', e);
    showErrorNotification('Chyba pri načítaní mesiaca.');
  }
}

// ================== UI Updates ==================
function updateSubTitle() {
  const name = InputSanitizer.sanitizeHTML(appSettings.employeeName) || 'Pracovník';
  ui.subTitle.textContent = `${name} - ${MONTH_NAMES[currentMonth]} ${currentYear}`;
}

function updateSettingsInputs() {
  ui.employeeNameInput.value = appSettings.employeeName;
  ui.hourlyWageInput.value = appSettings.hourlyWage;
  ui.taxRateInput.value = (appSettings.taxRate * 100).toFixed(2);
  ui.monthlyGoalInput.value = appSettings.monthlyEarningsGoal || '';
  ui.decimalPlacesSelect.value = appSettings.decimalPlaces;
}

// ================== Authentication ==================
async function loginUser() {
  const email = ui.emailInput.value.trim().toLowerCase();
  const password = ui.passwordInput.value;
  
  // Validácia
  if (!InputSanitizer.validateEmail(email)) {
    showFieldError('email', 'Neplatná emailová adresa.');
    return;
  }
  clearFieldError('email');
  
  const passwordValidation = InputSanitizer.validatePassword(password);
  if (!passwordValidation.valid) {
    showFieldError('password', passwordValidation.message);
    return;
  }
  clearFieldError('password');
  
  // Rate limiting
  const rateLimitKey = `login_${email}`;
  const canAttempt = rateLimiter.canAttempt(rateLimitKey);
  
  if (!canAttempt.allowed) {
    showErrorNotification(`Príliš veľa pokusov. Skúste znova o ${canAttempt.remaining} minút.`);
    return;
  }
  
  // Disable tlačidlo
  ui.loginBtn.disabled = true;
  ui.loginBtn.classList.add('is-loading');
  
  try {
    await signInWithEmailAndPassword(auth, email, password);
    rateLimiter.recordAttempt(rateLimitKey, true);
    showSaveNotification('🎉 Úspešne prihlásený!');
    ui.passwordInput.value = '';
    console.log('✅ User logged in successfully');
  } catch (e) {
    rateLimiter.recordAttempt(rateLimitKey, false);
    console.error('Login error:', e);
    
    if (e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
      showErrorNotification('Nesprávny email alebo heslo.');
    } else if (e.code === 'auth/too-many-requests') {
      showErrorNotification('Príliš veľa pokusov. Účet dočasne zablokovaný.');
    } else if (e.code === 'auth/network-request-failed') {
      showErrorNotification('Chyba pripojenia. Skontrolujte internet.');
    } else {
      showErrorNotification('Chyba pri prihlásení. Skúste neskôr.');
    }
  } finally {
    ui.loginBtn.disabled = false;
    ui.loginBtn.classList.remove('is-loading');
  }
}

async function registerUser() {
  const email = ui.emailInput.value.trim().toLowerCase();
  const password = ui.passwordInput.value;
  
  // Validácia
  if (!InputSanitizer.validateEmail(email)) {
    showFieldError('email', 'Neplatná emailová adresa.');
    return;
  }
  clearFieldError('email');
  
  const passwordValidation = InputSanitizer.validatePassword(password);
  if (!passwordValidation.valid) {
    showFieldError('password', passwordValidation.message);
    return;
  }
  clearFieldError('password');
  
  // Rate limiting
  const rateLimitKey = `register_${email}`;
  const canAttempt = rateLimiter.canAttempt(rateLimitKey, 3, 1800000); // 3 pokusy za 30 minút
  
  if (!canAttempt.allowed) {
    showErrorNotification(`Príliš veľa pokusov. Skúste znova o ${canAttempt.remaining} minút.`);
    return;
  }
  
  // Disable tlačidlo
  ui.registerBtn.disabled = true;
  ui.registerBtn.classList.add('is-loading');
  
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    rateLimiter.recordAttempt(rateLimitKey, true);
    showSaveNotification('🎉 Úspešne registrovaný! Vitajte.');
    ui.passwordInput.value = '';
    console.log('✅ User registered successfully');
  } catch (e) {
    rateLimiter.recordAttempt(rateLimitKey, false);
    console.error('Registration error:', e);
    
    if (e.code === 'auth/email-already-in-use') {
      showErrorNotification('Email je už použitý. Prihláste sa.');
    } else if (e.code === 'auth/invalid-email') {
      showErrorNotification('Neplatný email.');
    } else if (e.code === 'auth/operation-not-allowed') {
      showErrorNotification('Registrácia je dočasne vypnutá.');
    } else if (e.code === 'auth/weak-password') {
      showErrorNotification('Heslo je príliš slabé.');
    } else {
      showErrorNotification('Chyba pri registrácii. Skúste neskôr.');
    }
  } finally {
    ui.registerBtn.disabled = false;
    ui.registerBtn.classList.remove('is-loading');
  }
}

async function logoutUser() {
  try {
    await signOut(auth);
    showSaveNotification('👋 Odhlásený.');
    console.log('✅ User logged out');
  } catch (e) {
    console.error('Logout error:', e);
    showErrorNotification('Chyba pri odhlásení.');
  }
}

async function resetUserPassword() {
  const email = ui.emailInput.value.trim().toLowerCase();
  
  if (!InputSanitizer.validateEmail(email)) {
    showFieldError('email', 'Prosím zadajte platnú emailovú adresu.');
    return;
  }
  clearFieldError('email');
  
  // Rate limiting
  const rateLimitKey = `reset_${email}`;
  const canAttempt = rateLimiter.canAttempt(rateLimitKey, 3, 3600000); // 3 pokusy za 60 minút
  
  if (!canAttempt.allowed) {
    showErrorNotification(`Príliš veľa pokusov. Skúste znova o ${canAttempt.remaining} minút.`);
    return;
  }
  
  try {
    await sendPasswordResetEmail(auth, email);
    rateLimiter.recordAttempt(rateLimitKey, true);
    showSaveNotification('📧 Email na reset hesla bol odoslaný.');
    console.log('✅ Password reset email sent');
  } catch (e) {
    rateLimiter.recordAttempt(rateLimitKey, false);
    console.error('Password reset error:', e);
    
    if (e.code === 'auth/user-not-found') {
      showErrorNotification('Používateľ s týmto emailom neexistuje.');
    } else if (e.code === 'auth/invalid-email') {
      showErrorNotification('Neplatný email.');
    } else {
      showErrorNotification('Chyba pri odosielaní emailu.');
    }
  }
}

// ================== Export / Backup ==================
function exportToPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showErrorNotification('PDF knižnica nie je načítaná.');
    return;
  }
  
  try {
    const { jsPDF } = window.jspdf;
    const docPDF = new jsPDF();
    const name = InputSanitizer.sanitizeHTML(appSettings.employeeName) || 'Pracovník';
    
    docPDF.setFontSize(16);
    docPDF.text(`${name} - ${MONTH_NAMES[currentMonth]} ${currentYear}`, 14, 20);
    
    // TODO: Pridať komplexnejšie PDF s tabuľkou (použiť jspdf-autotable)
    
    docPDF.save(`dochadzka_${MONTH_NAMES[currentMonth]}_${currentYear}.pdf`);
    showSaveNotification('📄 PDF exportované.');
    console.log('✅ PDF exported');
  } catch (e) {
    console.error('PDF export error:', e);
    showErrorNotification('Chyba pri exporte PDF.');
  }
}

function sendPDF() {
  showWarningNotification('📧 Priame odoslanie PDF nie je implementované. Použite export a pošlite emailom.');
}

function createBackup() {
  showWarningNotification('💾 XLSX záloha nie je v tejto verzii implementovaná.');
}

function restoreBackup() {
  showWarningNotification('📂 Obnovenie XLSX zálohy nie je v tejto verzii implementovaná.');
}

// ================== Firestore Operations ==================
async function saveMonthToFirestore() {
  if (!currentUser) {
    showErrorNotification('Musíte byť prihlásený.');
    return;
  }
  
  ui.saveToFirestoreBtn.disabled = true;
  ui.saveToFirestoreBtn.classList.add('is-loading');
  
  try {
    const data = collectMonthData();
    const monthDoc = doc(db, 'users', currentUser.uid, 'months', monthKey());
    
    await setDoc(monthDoc, { 
      data,
      updatedAt: serverTimestamp()
    });
    
    showSaveNotification('☁️ Dáta uložené do cloudu.');
    console.log(`✅ Month saved to cloud: ${monthKey()}`);
  } catch (e) {
    console.error('Save to Firestore error:', e);
    showErrorNotification('Chyba pri ukladaní do cloudu.');
  } finally {
    ui.saveToFirestoreBtn.disabled = false;
    ui.saveToFirestoreBtn.classList.remove('is-loading');
  }
}

async function loadMonthFromFirestore() {
  if (!currentUser) {
    showErrorNotification('Musíte byť prihlásený.');
    return;
  }
  
  ui.loadFromFirestoreBtn.disabled = true;
  ui.loadFromFirestoreBtn.classList.add('is-loading');
  
  try {
    const docRef = doc(db, 'users', currentUser.uid, 'months', monthKey());
    const snap = await getDoc(docRef);
    
    if (snap.exists()) {
      const data = snap.data().data || {};
      localStorage.setItem(`monthData_${monthKey()}`, JSON.stringify(data));
      renderMonth(data);
      showSaveNotification('📥 Dáta načítané z cloudu.');
      console.log(`✅ Month loaded from cloud: ${monthKey()}`);
    } else {
      showWarningNotification('V cloude nie sú dáta pre tento mesiac.');
    }
  } catch (e) {
    console.error('Load from Firestore error:', e);
    showErrorNotification('Chyba pri načítaní z cloudu.');
  } finally {
    ui.loadFromFirestoreBtn.disabled = false;
    ui.loadFromFirestoreBtn.classList.remove('is-loading');
  }
}

// ================== Event Handlers ==================
function populateMonthYearSelects() {
  if (!ui.monthSelect.options.length) {
    MONTH_NAMES.forEach((m, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = m;
      ui.monthSelect.appendChild(opt);
    });
  }
  ui.monthSelect.value = currentMonth;

  if (!ui.yearSelect.options.length) {
    const y = currentYear;
    for (let year = y - 3; year <= y + 3; year++) {
      const opt = document.createElement('option');
      opt.value = year;
      opt.textContent = year;
      ui.yearSelect.appendChild(opt);
    }
  }
  ui.yearSelect.value = currentYear;
}

function onMonthChange() {
  currentMonth = parseInt(ui.monthSelect.value);
  loadCurrentMonth();
  console.log(`📅 Month changed to: ${MONTH_NAMES[currentMonth]}`);
}

function onYearChange() {
  currentYear = parseInt(ui.yearSelect.value);
  loadCurrentMonth();
  console.log(`📅 Year changed to: ${currentYear}`);
}

function onEmployeeNameInput() {
  const sanitized = InputSanitizer.sanitize(ui.employeeNameInput.value.trim(), SECURITY_CONSTANTS.MAX_INPUT_LENGTH.employeeName);
  
  if (sanitized && !SECURITY_CONSTANTS.VALIDATION_PATTERNS.name.test(sanitized)) {
    showFieldError('employeeName', 'Meno obsahuje neplatné znaky.');
    return;
  }
  
  clearFieldError('employeeName');
  appSettings.employeeName = sanitized;
  saveSetting('employeeName', appSettings.employeeName);
  updateSubTitle();
  debouncedSaveSettingsToCloud();
}

function onNumberSettingInput(el) {
  el.value = el.value.replace(',', '.');
}

function onNumberSettingBlur(el) {
  const v = parseFloat(el.value);
  
  if (el === ui.hourlyWageInput) {
    if (!InputSanitizer.validateNumber(v, 0, 1000)) {
      showFieldError('hourlyWage', 'Hodinová mzda musí byť medzi 0 a 1000.');
      el.classList.add('invalid-value');
      return;
    }
    clearFieldError('hourlyWage');
    el.classList.remove('invalid-value');
    appSettings.hourlyWage = v;
    saveSetting('hourlyWage', v);
    
  } else if (el === ui.taxRateInput) {
    if (!InputSanitizer.validateNumber(v, 0, 100)) {
      showFieldError('taxRate', 'Daňové percento musí byť medzi 0 a 100.');
      el.classList.add('invalid-value');
      return;
    }
    clearFieldError('taxRate');
    el.classList.remove('invalid-value');
    appSettings.taxRate = v / 100;
    saveSetting('taxRate', appSettings.taxRate);
    
  } else if (el === ui.monthlyGoalInput) {
    if (!el.value) {
      appSettings.monthlyEarningsGoal = null;
      localStorage.removeItem('monthlyEarningsGoal');
      clearFieldError('monthlyGoal');
      el.classList.remove('invalid-value');
    } else if (!InputSanitizer.validateNumber(v, 0, 1000000)) {
      showFieldError('monthlyGoal', 'Mesačný cieľ musí byť medzi 0 a 1 000 000.');
      el.classList.add('invalid-value');
      return;
    } else {
      clearFieldError('monthlyGoal');
      appSettings.monthlyEarningsGoal = v;
      saveSetting('monthlyEarningsGoal', v);
      el.classList.remove('invalid-value');
    }
  }
  
  debouncedSaveSettingsToCloud();
  ui.workDaysTbody.querySelectorAll('.time-input').forEach(inp => recalcRow(inp));
}

function onDecimalPlacesChange() {
  appSettings.decimalPlaces = parseInt(ui.decimalPlacesSelect.value);
  saveSetting('decimalPlaces', appSettings.decimalPlaces);
  debouncedSaveSettingsToCloud();
  ui.workDaysTbody.querySelectorAll('.time-input').forEach(inp => recalcRow(inp));
}

function toggleSettings() {
  const vis = ui.settingsCollapsibleContent.classList.toggle('visible');
  ui.toggleSettingsBtn.setAttribute('aria-expanded', vis);
  ui.toggleSettingsBtn.textContent = vis
    ? '⚙️ Skryť nastavenia aplikácie ▲'
    : '⚙️ Zobraziť nastavenia aplikácie ▼';
}

// Tabuľka - event delegation
function onTableClick(e) {
  if (e.target.classList.contains('time-btn')) {
    const input = e.target.previousElementSibling || e.target.nextElementSibling;
    if (input) setCurrentTime(input);
  }
}

function onTableInput(e) {
  const t = e.target;
  
  if (t.classList.contains('time-input')) {
    debouncedSaveMonth();
    debouncedSaveMonthToCloud();
    recalcRow(t);
  } else if (t.id.startsWith('break-')) {
    debouncedSaveMonth();
    debouncedSaveMonthToCloud();
    recalcRow(t);
  } else if (t.id.startsWith('project-') || t.id.startsWith('note-')) {
    debouncedSaveMonth();
    debouncedSaveMonthToCloud();
  }
}

function clearMonthData() {
  if (!confirm(`⚠️ Naozaj chcete vymazať všetky dáta pre ${MONTH_NAMES[currentMonth]} ${currentYear}?\n\nTáto akcia je nevratná!`)) {
    return;
  }
  
  try {
    localStorage.removeItem(`monthData_${monthKey()}`);
    renderMonth({});
    showSaveNotification('🗑️ Mesačné dáta boli vymazané.');
    console.log(`✅ Month data cleared: ${monthKey()}`);
  } catch (e) {
    console.error('Error clearing month data:', e);
    showErrorNotification('Chyba pri mazaní dát.');
  }
}

// ================== Event Listeners ==================
function initEventListeners() {
  // Authentication
  ui.loginBtn.addEventListener('click', throttle(loginUser, SECURITY_CONSTANTS.RATE_LIMIT.authAction));
  ui.registerBtn.addEventListener('click', throttle(registerUser, SECURITY_CONSTANTS.RATE_LIMIT.authAction));
  ui.logoutBtn.addEventListener('click', logoutUser);
  ui.resetPasswordLink.addEventListener('click', e => {
    e.preventDefault();
    resetUserPassword();
  });
  
  // Email/Password input listeners
  ui.emailInput.addEventListener('blur', () => {
    if (ui.emailInput.value && !InputSanitizer.validateEmail(ui.emailInput.value.trim())) {
      showFieldError('email', 'Neplatná emailová adresa.');
    } else {
      clearFieldError('email');
    }
  });
  
  ui.passwordInput.addEventListener('input', () => {
    if (ui.passwordInput.value.length >= 8) {
      clearFieldError('password');
    }
  });

  // Theme
  ui.themeToggleBtn.addEventListener('click', () => ThemeManager.toggle());
  
  // Settings
  ui.toggleSettingsBtn.addEventListener('click', toggleSettings);
  ui.employeeNameInput.addEventListener('input', debounce(onEmployeeNameInput, SECURITY_CONSTANTS.RATE_LIMIT.inputChange));
  ui.hourlyWageInput.addEventListener('input', () => onNumberSettingInput(ui.hourlyWageInput));
  ui.hourlyWageInput.addEventListener('blur', () => onNumberSettingBlur(ui.hourlyWageInput));
  ui.taxRateInput.addEventListener('input', () => onNumberSettingInput(ui.taxRateInput));
  ui.taxRateInput.addEventListener('blur', () => onNumberSettingBlur(ui.taxRateInput));
  ui.monthlyGoalInput.addEventListener('input', () => onNumberSettingInput(ui.monthlyGoalInput));
  ui.monthlyGoalInput.addEventListener('blur', () => onNumberSettingBlur(ui.monthlyGoalInput));
  ui.decimalPlacesSelect.addEventListener('change', onDecimalPlacesChange);
  ui.monthSelect.addEventListener('change', onMonthChange);
  ui.yearSelect.addEventListener('change', onYearChange);

  // Action buttons
  ui.exportPDFBtn.addEventListener('click', exportToPDF);
  ui.sendPDFBtn.addEventListener('click', sendPDF);
  ui.createBackupBtn.addEventListener('click', createBackup);
  ui.restoreBackupBtn.addEventListener('click', restoreBackup);
  ui.saveToFirestoreBtn.addEventListener('click', saveMonthToFirestore);
  ui.loadFromFirestoreBtn.addEventListener('click', loadMonthFromFirestore);
  ui.clearMonthBtn.addEventListener('click', clearMonthData);

  // Table
  ui.workDaysTbody.addEventListener('click', onTableClick);
  ui.workDaysTbody.addEventListener('input', onTableInput);
  
  console.log('✅ Event listeners initialized');
}

// ================== Auth State Listener ==================
function initAuthListener() {
  onAuthStateChanged(auth, user => {
    currentUser = user || null;
    
    if (user) {
      ui.loginFieldset.style.display = 'none';
      ui.userInfo.style.display = 'flex';
      ui.userEmailSpan.textContent = user.email;
      rateLimiter.reset(`login_${user.email}`);
      console.log(`✅ User authenticated: ${user.email}`);
    } else {
      ui.loginFieldset.style.display = 'block';
      ui.userInfo.style.display = 'none';
      console.log('⚠️ User not authenticated');
    }
  });
}

// ================== App Initialization ==================
function initApp() {
  console.log('🚀 Initializing secure app...');
  
  try {
    loadAppSettingsFromLocalStorage();
    ThemeManager.init();
    populateMonthYearSelects();
    updateSettingsInputs();
    initEventListeners();
    initAuthListener();
    loadCurrentMonth();

    ui.appLoader.style.display = 'none';
    ui.mainContainer.style.display = 'block';
    
    console.log('✅ App initialized successfully');
    console.log(`🔒 Security features: Rate limiting, Input sanitization, DOMPurify, Firebase App Check`);
  } catch (e) {
    console.error('❌ App initialization failed:', e);
    showErrorNotification('Chyba pri inicializácii aplikácie.');
  }
}

// Spustenie aplikácie
initApp();

// Service Worker registrácia
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/uuu/service-worker.js')
      .then(() => {
        console.log('✅ Service Worker registered');
      })
      .catch(err => {
        console.error('❌ Service Worker registration failed:', err);
      });
  });
}

// Online/Offline detection
window.addEventListener('online', () => {
  showSaveNotification('🌐 Pripojenie obnovené.');
  console.log('🌐 Online');
});

window.addEventListener('offline', () => {
  showWarningNotification('📡 Pracujete offline. Dáta sa uložia lokálne.');
  console.log('📡 Offline');
});

// Zabránenie náhodného zatvorenia stránky s neuloženými dátami
window.addEventListener('beforeunload', (e) => {
  // Upozorniť len ak existujú nejaké dáta
  const data = collectMonthData();
  if (Object.keys(data).length > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});

console.log('🔒 Bruno\'s Calculator Pro - Secure Edition v1.0');
console.log('📊 All security measures active');
