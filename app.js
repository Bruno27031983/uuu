// ================== BEZPEČNÁ VERZIA - script.js ==================
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
  collection
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';

import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app-check.js';

// ================== Firebase konfigurácia ==================
// POZNÁMKA: API kľúč môže byť verejný, ale MUSÍTE nastaviť:
// 1. Firestore Security Rules (pozri nižšie)
// 2. Firebase Authentication restrictions
// 3. API Key restrictions v Google Cloud Console
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
} catch (e) {
  console.warn("App Check init failed:", e);
}

const auth = getAuth(app);
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ sizeBytes: CACHE_SIZE_UNLIMITED })
  });
} catch (e) {
  console.warn("Firestore persistent cache failed, fallback:", e);
  db = initializeFirestore(app, {});
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
  clearMonthBtn: document.getElementById('clearMonthBtn')
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

// ================== Utility ==================
const debounce = (fn, delay) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
};

// Sanitizácia vstupu - ochrana proti XSS
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

function isValidTimeFormat(timeString) {
  return typeof timeString === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeString);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getDaysInMonth(month, year) { return new Date(year, month + 1, 0).getDate(); }
function getDayName(year, month, day) { return DAY_NAMES_SHORT[new Date(year, month, day).getDay()]; }
function isWeekend(year, month, day) {
  const d = new Date(year, month, day).getDay();
  return d === 0 || d === 6;
}

// ----------------- Notifikácie -----------------
function showNotification(id, message, duration = 3500) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = sanitizeInput(message);
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}
function showSaveNotification(msg = 'Dáta boli úspešne uložené.') {
  showNotification('saveNotification', msg);
}
function showErrorNotification(msg) {
  showNotification('errorNotification', msg, 5000);
}
function showWarningNotification(msg) {
  showNotification('warningNotification', msg, 4500);
}

// ----------------- Theme -----------------
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
  }
};

// ----------------- Ukladanie nastavení -----------------
function loadAppSettingsFromLocalStorage() {
  const dp = parseInt(localStorage.getItem('decimalPlaces'));
  appSettings.decimalPlaces = (dp >= 0 && dp <= 4) ? dp : 2;
  
  appSettings.employeeName = sanitizeInput(localStorage.getItem('employeeName') || '');
  
  const hw = parseFloat(localStorage.getItem('hourlyWage'));
  appSettings.hourlyWage = (hw > 0) ? hw : 10;
  
  const tr = parseFloat(localStorage.getItem('taxRate'));
  appSettings.taxRate = (tr >= 0 && tr <= 1) ? tr : 0.02;
  
  const storedTheme = localStorage.getItem('theme');
  if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) {
    appSettings.theme = storedTheme;
  }
  
  const goal = localStorage.getItem('monthlyEarningsGoal');
  const parsedGoal = parseFloat(goal);
  appSettings.monthlyEarningsGoal = (parsedGoal > 0) ? parsedGoal : null;
}

function saveSetting(key, value) {
  localStorage.setItem(key, value);
  appSettings[key] = value;
}

// Uloženie nastavení do Firestore s validáciou
const debouncedSaveSettingsToCloud = debounce(async () => {
  if (!currentUser || !navigator.onLine) return;
  
  // Validácia pred uložením
  const validatedSettings = {
    decimalPlaces: Math.max(0, Math.min(4, appSettings.decimalPlaces)),
    employeeName: sanitizeInput(appSettings.employeeName.substring(0, 100)),
    hourlyWage: Math.max(0, Math.min(1000, appSettings.hourlyWage)),
    taxRate: Math.max(0, Math.min(1, appSettings.taxRate)),
    monthlyEarningsGoal: appSettings.monthlyEarningsGoal
  };
  
  const userDoc = doc(db, 'users', currentUser.uid);
  try {
    await setDoc(userDoc, { 
      appSettings: validatedSettings,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (e) {
    console.error('Save settings to Firestore failed:', e);
    showErrorNotification('Nepodarilo sa uložiť nastavenia do cloudu.');
  }
}, 1500);

// ----------------- Výpočty v tabuľke -----------------
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

  const arrival = arr.value;
  const departure = dep.value;
  const breakMin = parseFloat(brk.value) || 0;

  if (isValidTimeFormat(arrival) && isValidTimeFormat(departure)) {
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
    if (arrival && !isValidTimeFormat(arrival)) arr.classList.add('invalid-time');
    else arr.classList.remove('invalid-time');
    if (departure && !isValidTimeFormat(departure)) dep.classList.add('invalid-time');
    else dep.classList.remove('invalid-time');
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

// ----------------- Uloženie / načítanie mesiaca -----------------
function monthKey(year = currentYear, month = currentMonth) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function collectMonthData() {
  const data = {};
  const days = getDaysInMonth(currentMonth, currentYear);
  for (let d = 1; d <= days; d++) {
    const a = document.getElementById(`arrival-${d}`)?.value || '';
    const b = document.getElementById(`break-${d}`)?.value || '';
    const de = document.getElementById(`departure-${d}`)?.value || '';
    const p = sanitizeInput(document.getElementById(`project-${d}`)?.value || '');
    const n = sanitizeInput(document.getElementById(`note-${d}`)?.value || '');
    if (a || b || de || p || n) {
      data[d] = {
        arrival: a,
        departure: de,
        break: parseFloat(b) || 0,
        project: p.substring(0, 200),
        note: n.substring(0, 500)
      };
    }
  }
  return data;
}

function saveMonthLocal() {
  const data = collectMonthData();
  localStorage.setItem(`monthData_${monthKey()}`, JSON.stringify(data));
}
const debouncedSaveMonth = debounce(saveMonthLocal, 800);

// Automatické uloženie do Firestore
const debouncedSaveMonthToCloud = debounce(async () => {
  if (!currentUser || !navigator.onLine) return;
  const data = collectMonthData();
  const monthDoc = doc(db, 'users', currentUser.uid, 'months', monthKey());
  try {
    await setDoc(monthDoc, { 
      data,
      updatedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('Save month to Firestore failed:', e);
  }
}, 2000);

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
    const arrival = sanitizeInput(row.arrival || '');
    const departure = sanitizeInput(row.departure || '');
    const breakMin = row.break || 0;
    const project = sanitizeInput(row.project || '');
    const note = sanitizeInput(row.note || '');

    html += `
      <tr data-day="${d}" class="${weekend ? 'weekend-day' : ''} ${curr ? 'current-day' : ''}">
        <td>${d}. ${dayName}</td>
        <td>
          <div class="time-input-wrapper">
            <input type="tel" id="arrival-${d}" class="time-input" placeholder="08:00" value="${arrival}" maxlength="5">
            <button type="button" class="time-btn" title="Nastaviť aktuálny čas">🕐</button>
          </div>
        </td>
        <td>
          <div class="time-input-wrapper">
            <input type="tel" id="departure-${d}" class="time-input" placeholder="16:00" value="${departure}" maxlength="5">
            <button type="button" class="time-btn" title="Nastaviť aktuálny čas">🕐</button>
          </div>
        </td>
        <td><input type="number" id="break-${d}" placeholder="30" value="${breakMin || ''}" min="0" max="1440" step="1"></td>
        <td><input type="number" id="worked-${d}" readonly></td>
        <td><input type="text" id="project-${d}" class="project-input" placeholder="Názov projektu..." value="${project}" maxlength="200"></td>
        <td><textarea id="note-${d}" placeholder="Poznámky..." maxlength="500">${note}</textarea></td>
        <td><input type="number" id="gross-${d}" readonly></td>
        <td><input type="number" id="net-${d}" readonly></td>
        <td></td>
      </tr>
    `;
  }
  ui.workDaysTbody.innerHTML = html;

  ui.workDaysTbody.querySelectorAll('textarea').forEach(t => autoResizeTextarea(t));
  ui.workDaysTbody.querySelectorAll('tr').forEach(tr => {
    const inp = tr.querySelector('.time-input');
    if (inp) recalcRow(inp);
  });
}

function loadCurrentMonth() {
  const key = `monthData_${monthKey()}`;
  const stored = localStorage.getItem(key);
  let data = {};
  if (stored) {
    try { data = JSON.parse(stored); } catch (e) { console.error(e); }
  }
  renderMonth(data);
  updateSubTitle();
}

// ----------------- UI nastavenia -----------------
function updateSubTitle() {
  const name = sanitizeInput(appSettings.employeeName) || 'Pracovník';
  ui.subTitle.textContent = `${name} - ${MONTH_NAMES[currentMonth]} ${currentYear}`;
}

function updateSettingsInputs() {
  ui.employeeNameInput.value = appSettings.employeeName;
  ui.hourlyWageInput.value = appSettings.hourlyWage;
  ui.taxRateInput.value = (appSettings.taxRate * 100).toFixed(2);
  ui.monthlyGoalInput.value = appSettings.monthlyEarningsGoal || '';
  ui.decimalPlacesSelect.value = appSettings.decimalPlaces;
}

// ----------------- AUTH -----------------
function validatePassword(password) {
  if (!password || password.length < 8) return 'Heslo musí mať aspoň 8 znakov.';
  if (!/[A-Z]/.test(password)) return 'Heslo musí obsahovať aspoň jedno veľké písmeno.';
  if (!/[a-z]/.test(password)) return 'Heslo musí obsahovať aspoň jedno malé písmeno.';
  if (!/\d/.test(password)) return 'Heslo musí obsahovať aspoň jedno číslo.';
  if (password.length > 128) return 'Heslo je príliš dlhé (max 128 znakov).';
  return null;
}

async function loginUser() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  
  if (!email || !password) {
    showErrorNotification('Prosím vyplňte email a heslo.');
    return;
  }
  
  if (!isValidEmail(email)) {
    showErrorNotification('Neplatná emailová adresa.');
    return;
  }
  
  try {
    await signInWithEmailAndPassword(auth, email, password);
    showSaveNotification('Úspešne prihlásený!');
  } catch (e) {
    console.error(e);
    if (e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') {
      showErrorNotification('Nesprávny email alebo heslo.');
    } else if (e.code === 'auth/too-many-requests') {
      showErrorNotification('Príliš veľa pokusov. Skúste neskôr.');
    } else {
      showErrorNotification('Chyba pri prihlásení.');
    }
  }
}

async function registerUser() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  
  if (!email || !password) {
    showErrorNotification('Prosím vyplňte email a heslo.');
    return;
  }
  
  if (!isValidEmail(email)) {
    showErrorNotification('Neplatná emailová adresa.');
    return;
  }
  
  const err = validatePassword(password);
  if (err) {
    showErrorNotification(err);
    return;
  }
  
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    showSaveNotification('Úspešne registrovaný!');
  } catch (e) {
    console.error(e);
    if (e.code === 'auth/email-already-in-use') {
      showErrorNotification('Email je už použitý.');
    } else if (e.code === 'auth/invalid-email') {
      showErrorNotification('Neplatný email.');
    } else {
      showErrorNotification('Chyba pri registrácii.');
    }
  }
}

async function logoutUser() {
  try {
    await signOut(auth);
    showSaveNotification('Odhlásený.');
  } catch (e) {
    console.error(e);
    showErrorNotification('Chyba pri odhlásení.');
  }
}

async function resetUserPassword() {
  const email = document.getElementById('email').value.trim();
  
  if (!email) {
    showErrorNotification('Prosím zadajte email adresu.');
    return;
  }
  
  if (!isValidEmail(email)) {
    showErrorNotification('Neplatná emailová adresa.');
    return;
  }
  
  try {
    await sendPasswordResetEmail(auth, email);
    showSaveNotification('Email na reset hesla bol odoslaný.');
  } catch (e) {
    console.error(e);
    if (e.code === 'auth/user-not-found') {
      showErrorNotification('Používateľ s týmto emailom neexistuje.');
    } else {
      showErrorNotification('Chyba pri odosielaní emailu.');
    }
  }
}

// ----------------- Export / backup -----------------
function exportToPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showErrorNotification('PDF knižnica nie je načítaná.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const docPDF = new jsPDF();
  const name = sanitizeInput(appSettings.employeeName) || 'Pracovník';
  docPDF.setFontSize(16);
  docPDF.text(`${name} - ${MONTH_NAMES[currentMonth]} ${currentYear}`, 14, 20);
  docPDF.save(`dochadzka_${MONTH_NAMES[currentMonth]}_${currentYear}.pdf`);
  showSaveNotification('PDF exportované.');
}

function sendPDF() {
  showWarningNotification('Priame odoslanie PDF nie je implementované. Použite export a pošlite emailom.');
}

function createBackup() {
  showWarningNotification('XLSX záloha nie je v tejto verzii implementovaná.');
}

function restoreBackup() {
  showWarningNotification('Obnovenie XLSX zálohy nie je v tejto verzii implementované.');
}

// ----------------- Firestore operácie -----------------
async function saveMonthToFirestore() {
  if (!currentUser) {
    showErrorNotification('Musíte byť prihlásený.');
    return;
  }
  
  const data = collectMonthData();
  const monthDoc = doc(db, 'users', currentUser.uid, 'months', monthKey());
  
  try {
    await setDoc(monthDoc, { 
      data,
      updatedAt: new Date().toISOString()
    });
    showSaveNotification('Dáta uložené do cloudu.');
  } catch (e) {
    console.error(e);
    showErrorNotification('Chyba pri ukladaní do cloudu.');
  }
}

async function loadMonthFromFirestore() {
  if (!currentUser) {
    showErrorNotification('Musíte byť prihlásený.');
    return;
  }
  
  const docRef = doc(db, 'users', currentUser.uid, 'months', monthKey());
  
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data().data || {};
      localStorage.setItem(`monthData_${monthKey()}`, JSON.stringify(data));
      renderMonth(data);
      showSaveNotification('Dáta načítané z cloudu.');
    } else {
      showWarningNotification('V cloude nie sú dáta pre tento mesiac.');
    }
  } catch (e) {
    console.error(e);
    showErrorNotification('Chyba pri načítaní z cloudu.');
  }
}

// ----------------- Ostatné UI handlers -----------------
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
}

function onYearChange() {
  currentYear = parseInt(ui.yearSelect.value);
  loadCurrentMonth();
}

function onEmployeeNameInput() {
  const sanitized = sanitizeInput(ui.employeeNameInput.value.trim());
  appSettings.employeeName = sanitized.substring(0, 100);
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
    if (isNaN(v) || v < 0 || v > 1000) {
      showErrorNotification('Hodinová mzda musí byť medzi 0 a 1000.');
      el.classList.add('invalid-value');
      return;
    }
    el.classList.remove('invalid-value');
    appSettings.hourlyWage = v;
    saveSetting('hourlyWage', v);
  } else if (el === ui.taxRateInput) {
    if (isNaN(v) || v < 0 || v > 100) {
      showErrorNotification('Daňové percento musí byť medzi 0 a 100.');
      el.classList.add('invalid-value');
      return;
    }
    el.classList.remove('invalid-value');
    appSettings.taxRate = v / 100;
    saveSetting('taxRate', appSettings.taxRate);
  } else if (el === ui.monthlyGoalInput) {
    if (!el.value) {
      appSettings.monthlyEarningsGoal = null;
      localStorage.removeItem('monthlyEarningsGoal');
      el.classList.remove('invalid-value');
    } else if (isNaN(v) || v < 0 || v > 1000000) {
      showErrorNotification('Mesačný cieľ musí byť medzi 0 a 1 000 000.');
      el.classList.add('invalid-value');
      return;
    } else {
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
    ? 'Skryť nastavenia aplikácie ▲'
    : 'Zobraziť nastavenia aplikácie ▼';
}

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
    if (t.tagName === 'TEXTAREA') autoResizeTextarea(t);
    debouncedSaveMonth();
    debouncedSaveMonthToCloud();
  }
}

function clearMonthData() {
  if (!confirm(`Naozaj chcete vymazať všetky dáta pre ${MONTH_NAMES[currentMonth]} ${currentYear}?`)) return;
  localStorage.removeItem(`monthData_${monthKey()}`);
  renderMonth({});
  showSaveNotification('Mesačné dáta boli vymazané.');
}

// ================== Inicializácia ==================
function initEventListeners() {
  ui.loginBtn.addEventListener('click', loginUser);
  ui.registerBtn.addEventListener('click', registerUser);
  ui.logoutBtn.addEventListener('click', logoutUser);
  ui.resetPasswordLink.addEventListener('click', e => {
    e.preventDefault();
    resetUserPassword();
  });

  ui.themeToggleBtn.addEventListener('click', () => ThemeManager.toggle());
  ui.toggleSettingsBtn.addEventListener('click', toggleSettings);
  ui.employeeNameInput.addEventListener('input', onEmployeeNameInput);
  ui.hourlyWageInput.addEventListener('input', () => onNumberSettingInput(ui.hourlyWageInput));
  ui.hourlyWageInput.addEventListener('blur', () => onNumberSettingBlur(ui.hourlyWageInput));
  ui.taxRateInput.addEventListener('input', () => onNumberSettingInput(ui.taxRateInput));
  ui.taxRateInput.addEventListener('blur', () => onNumberSettingBlur(ui.taxRateInput));
  ui.monthlyGoalInput.addEventListener('input', () => onNumberSettingInput(ui.monthlyGoalInput));
  ui.monthlyGoalInput.addEventListener('blur', () => onNumberSettingBlur(ui.monthlyGoalInput));
  ui.decimalPlacesSelect.addEventListener('change', onDecimalPlacesChange);
  ui.monthSelect.addEventListener('change', onMonthChange);
  ui.yearSelect.addEventListener('change', onYearChange);

  ui.exportPDFBtn.addEventListener('click', exportToPDF);
  ui.sendPDFBtn.addEventListener('click', sendPDF);
  ui.createBackupBtn.addEventListener('click', createBackup);
  ui.restoreBackupBtn.addEventListener('click', restoreBackup);
  ui.loadFromFirestoreBtn.addEventListener('click', loadMonthFromFirestore);
  if (ui.saveToFirestoreBtn) {
    ui.saveToFirestoreBtn.addEventListener('click', saveMonthToFirestore);
  }
  ui.clearMonthBtn.addEventListener('click', clearMonthData);

  ui.workDaysTbody.addEventListener('click', onTableClick);
  ui.workDaysTbody.addEventListener('input', onTableInput);
}

function initAuthListener() {
  onAuthStateChanged(auth, user => {
    currentUser = user || null;
    if (user) {
      ui.loginFieldset.style.display = 'none';
      ui.userInfo.style.display = 'flex';
      ui.userEmailSpan.textContent = user.email;
    } else {
      ui.loginFieldset.style.display = 'block';
      ui.userInfo.style.display = 'none';
    }
  });
}

function initApp() {
  loadAppSettingsFromLocalStorage();
  ThemeManager.init();
  populateMonthYearSelects();
  updateSettingsInputs();
  initEventListeners();
  initAuthListener();
  loadCurrentMonth();

  ui.appLoader.style.display = 'none';
  ui.mainContainer.style.display = 'block';
}

initApp();

// Service Worker registrácia
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/uuu/service-worker.js')
      .catch(err => {
        console.error('Service worker registration failed:', err);
      });
  });
}
