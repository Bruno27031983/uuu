// Importy Firebase
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
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';

import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app-check.js';

// -------------------- Firebase config --------------------
const firebaseConfig = {
  apiKey: "AIzaSyBdLtJlduT3iKiGLDJ0UfAakpf6wcresnk",
  authDomain: "uuuuu-f7ef9.firebaseapp.com",
  projectId: "uuuuu-f7ef9",
  storageBucket: "uuuuu-f7ef9.appspot.com",
  messagingSenderId: "456105865458",
  appId: "1:456105865458:web:101f0a4dcb455f174b606b",
};

const RECAPTCHA_V3_SITE_KEY = "6LczmP0qAAAAAACGalBT9zZekkUr3hLgA2e8o99v";

// -------------------- Globálne premenné --------------------
const app = initializeApp(firebaseConfig);

try {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
} catch (e) {
  console.warn("App Check initialization failed.", e);
  showWarningNotification("Inicializácia App Check zlyhala. Niektoré funkcie môžu byť obmedzené.");
}

const auth = getAuth(app);

let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ sizeBytes: CACHE_SIZE_UNLIMITED })
  });
} catch (error) {
  console.warn("Failed to initialize Firestore with persistent cache. Falling back to in-memory cache.", error);
  showWarningNotification("Chyba pri inicializácii offline úložiska. Dáta nebudú dostupné offline.");
  db = initializeFirestore(app, {});
}

let currentUser = null;
let currentListenerUnsubscribe = null;

const uiRefs = {
  workDaysTbody: document.getElementById('workDays'),
  totalSalaryDiv: document.getElementById('totalSalary'),
  mainTitle: document.getElementById('mainTitle'),
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
  loginForm: document.getElementById('login-form'),
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
  clearMonthBtn: document.getElementById('clearMonthBtn'),
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
const PENDING_SYNC_MONTHS_LS_KEY = 'pendingSyncMonthsList';

// -------------------- Pomocné funkcie --------------------
async function updateAppBadge(count) {
  if ('setAppBadge' in navigator) {
    try {
      if (count > 0) { await navigator.setAppBadge(count); }
      else { await navigator.clearAppBadge(); }
    } catch (error) { console.error('Failed to set app badge:', error); }
  }
}

function getPendingSyncMonths() {
  const stored = localStorage.getItem(PENDING_SYNC_MONTHS_LS_KEY);
  return stored ? JSON.parse(stored) : [];
}

function savePendingSyncMonths(months) {
  localStorage.setItem(PENDING_SYNC_MONTHS_LS_KEY, JSON.stringify(months));
  updateAppBadge(months.length);
}

function addMonthToPendingList(monthDocId) {
  if (!currentUser) return;
  let pendingMonths = getPendingSyncMonths();
  if (!pendingMonths.includes(monthDocId)) {
    pendingMonths.push(monthDocId);
    savePendingSyncMonths(pendingMonths);
  }
}

function removeMonthFromPendingList(monthDocId) {
  let pendingMonths = getPendingSyncMonths();
  const index = pendingMonths.indexOf(monthDocId);
  if (index > -1) {
    pendingMonths.splice(index, 1);
    savePendingSyncMonths(pendingMonths);
  }
}

function getPendingSyncCount() {
  if (!currentUser) return 0;
  return getPendingSyncMonths().length;
}

function getDaysInMonth(month, year) { return new Date(year, month + 1, 0).getDate(); }
function getDayName(year, month, day) { return DAY_NAMES_SHORT[new Date(year, month, day).getDay()]; }
function isWeekend(year, month, day) {
  const d = new Date(year, month, day).getDay();
  return d === 0 || d === 6;
}

const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(null, args), wait);
  };
};

function isValidTimeFormat(timeString) {
  return typeof timeString === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeString);
}

// -------------------- Notifikácie --------------------
function showNotification(id, message, duration = 3500) {
  const notification = document.getElementById(id);
  if (!notification) {
    console.warn(`Notification element with ID '${id}' not found.`);
    return;
  }
  notification.textContent = message;
  notification.classList.add('show');
  setTimeout(() => notification.classList.remove('show'), duration);
}

function showSaveNotification(message = 'Dáta boli úspešne uložené.') {
  showNotification('saveNotification', message);
}

function showErrorNotification(message) {
  showNotification('errorNotification', message, 5000);
}

function showWarningNotification(message) {
  showNotification('warningNotification', message, 4500);
}

// -------------------- Loader stav tlačidiel --------------------
function setLoadingState(button, isLoading, textParam = "Spracúvam...") {
  if (!button) return;
  if (isLoading) {
    button.disabled = true;
    if (!button.dataset.originalText) { button.dataset.originalText = button.textContent; }
    const spinnerSpan = document.createElement('span');
    spinnerSpan.className = 'spinner';
    spinnerSpan.setAttribute('role', 'status');
    spinnerSpan.setAttribute('aria-hidden', 'true');
    button.textContent = '';
    button.appendChild(spinnerSpan);
    button.appendChild(document.createTextNode(` ${textParam}`));
    button.classList.add('is-loading');
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    } else {
      button.textContent = textParam;
    }
    button.classList.remove('is-loading');
  }
}

// -------------------- Theme manager --------------------
const ThemeManager = {
  init: () => {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme) {
      appSettings.theme = storedTheme;
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      appSettings.theme = prefersDark ? 'dark' : 'light';
    }
    ThemeManager.applyTheme(appSettings.theme);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (!localStorage.getItem('theme')) {
        appSettings.theme = e.matches ? 'dark' : 'light';
        ThemeManager.applyTheme(appSettings.theme);
      }
    });
  },
  applyTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    uiRefs.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    appSettings.theme = theme;
    if (uiRefs.themeMeta) {
      uiRefs.themeMeta.content = getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-color-meta')
        .trim();
    }
  },
  toggleTheme: () => {
    const newTheme = appSettings.theme === 'light' ? 'dark' : 'light';
    ThemeManager.applyTheme(newTheme);
    saveAppSettingToLocalStorage('theme', newTheme);
    debouncedSaveAppSettingsToFirestore();
  }
};

// -------------------- Ukladanie nastavení --------------------
function loadAppSettingsFromLocalStorage() {
  appSettings.decimalPlaces = parseInt(localStorage.getItem('decimalPlaces')) || 2;
  appSettings.employeeName = localStorage.getItem('employeeName') || '';
  appSettings.hourlyWage = parseFloat(localStorage.getItem('hourlyWage')) || 10;
  appSettings.taxRate = parseFloat(localStorage.getItem('taxRate')) || 0.02;
  appSettings.theme = localStorage.getItem('theme') ||
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  appSettings.monthlyEarningsGoal = localStorage.getItem('monthlyEarningsGoal')
    ? parseFloat(localStorage.getItem('monthlyEarningsGoal'))
    : null;
}

function saveAppSettingToLocalStorage(key, value) {
  localStorage.setItem(key, value);
  appSettings[key] = value;
}

async function saveAppSettingsToFirestore() {
  if (!currentUser || !navigator.onLine) return;
  const userDocRef = doc(db, 'users', currentUser.uid);
  try {
    await setDoc(userDocRef, { appSettings: appSettings }, { merge: true });
  } catch (error) {
    console.error("Error saving app settings to Firestore:", error);
    showErrorNotification("Nepodarilo sa uložiť nastavenia aplikácie do cloudu.");
  }
}

const debouncedSaveAppSettingsToFirestore = debounce(saveAppSettingsToFirestore, 1800);

// -------------------- Validácia hesla --------------------
function validatePassword(password) {
  if (!password || password.length < 8) {
    return 'Heslo musí mať aspoň 8 znakov.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Heslo musí obsahovať aspoň jedno veľké písmeno.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Heslo musí obsahovať aspoň jedno malé písmeno.';
  }
  if (!/\d/.test(password)) {
    return 'Heslo musí obsahovať aspoň jedno číslo.';
  }
  return null;
}

// -------------------- Tabuľka – výpočty --------------------
function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

function setCurrentTime(input) {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  input.value = `${hours}:${minutes}`;
  input.classList.remove('invalid-time');
  debouncedSaveMonthData();
  recalculateDayRow(input);
}

function recalculateDayRow(inputElement) {
  const row = inputElement.closest('tr');
  if (!row) return;

  const day = parseInt(row.dataset.day);
  if (!day) return;

  const arrivalInput = row.querySelector(`#arrival-${day}`);
  const departureInput = row.querySelector(`#departure-${day}`);
  const breakInput = row.querySelector(`#break-${day}`);
  const workedHoursInput = row.querySelector(`#worked-${day}`);
  const grossSalaryInput = row.querySelector(`#gross-${day}`);
  const netSalaryInput = row.querySelector(`#net-${day}`);

  if (!arrivalInput || !departureInput || !breakInput || !workedHoursInput || !grossSalaryInput || !netSalaryInput) return;

  const arrival = arrivalInput.value;
  const departure = departureInput.value;
  const breakMinutes = parseFloat(breakInput.value) || 0;

  if (isValidTimeFormat(arrival) && isValidTimeFormat(departure)) {
    const [arrH, arrM] = arrival.split(':').map(Number);
    const [depH, depM] = departure.split(':').map(Number);

    let totalMinutes = (depH * 60 + depM) - (arrH * 60 + arrM);
    if (totalMinutes < 0) totalMinutes += 24 * 60;

    const workedMinutes = Math.max(0, totalMinutes - breakMinutes);
    const workedHours = workedMinutes / 60;

    workedHoursInput.value = workedHours.toFixed(appSettings.decimalPlaces);

    const grossSalary = workedHours * appSettings.hourlyWage;
    const netSalary = grossSalary * (1 - appSettings.taxRate);

    grossSalaryInput.value = grossSalary.toFixed(appSettings.decimalPlaces);
    netSalaryInput.value = netSalary.toFixed(appSettings.decimalPlaces);

    arrivalInput.classList.remove('invalid-time');
    departureInput.classList.remove('invalid-time');
  } else {
    workedHoursInput.value = '';
    grossSalaryInput.value = '';
    netSalaryInput.value = '';

    if (arrival && !isValidTimeFormat(arrival)) {
      arrivalInput.classList.add('invalid-time');
    } else {
      arrivalInput.classList.remove('invalid-time');
    }

    if (departure && !isValidTimeFormat(departure)) {
      departureInput.classList.add('invalid-time');
    } else {
      departureInput.classList.remove('invalid-time');
    }
  }

  calculateTotalSalary();
}

function calculateTotalSalary() {
  let totalGross = 0;
  let totalNet = 0;
  let totalWorkedHours = 0;

  const allRows = uiRefs.workDaysTbody.querySelectorAll('tr');
  allRows.forEach(row => {
    const day = parseInt(row.dataset.day);
    if (!day) return;

    const workedInput = row.querySelector(`#worked-${day}`);
    const grossInput = row.querySelector(`#gross-${day}`);
    const netInput = row.querySelector(`#net-${day}`);

    if (workedInput && workedInput.value) {
      totalWorkedHours += parseFloat(workedInput.value) || 0;
    }
    if (grossInput && grossInput.value) {
      totalGross += parseFloat(grossInput.value) || 0;
    }
    if (netInput && netInput.value) {
      totalNet += parseFloat(netInput.value) || 0;
    }
  });

  let summaryHTML = `
    <strong>Celková hrubá mzda:</strong> ${totalGross.toFixed(appSettings.decimalPlaces)} €<br>
    <strong>Celková čistá mzda:</strong> ${totalNet.toFixed(appSettings.decimalPlaces)} €<br>
    <strong>Celkovo odpracované hodiny:</strong> ${totalWorkedHours.toFixed(appSettings.decimalPlaces)} h
  `;

  if (appSettings.monthlyEarningsGoal && appSettings.monthlyEarningsGoal > 0) {
    const progress = (totalNet / appSettings.monthlyEarningsGoal) * 100;
    const remaining = appSettings.monthlyEarningsGoal - totalNet;

    let progressClass = 'low';
    if (progress >= 90) progressClass = 'good';
    else if (progress >= 60) progressClass = 'medium';

    summaryHTML += `
      <div class="goal-progress ${progressClass}">
        📊 Progres k cieľu: ${progress.toFixed(1)}% (${totalNet.toFixed(2)} / ${appSettings.monthlyEarningsGoal.toFixed(2)} €)<br>
        ${remaining > 0 ? `Zostáva: ${remaining.toFixed(2)} €` : '🎉 Cieľ dosiahnutý!'}
      </div>
    `;
  }

  uiRefs.totalSalaryDiv.innerHTML = summaryHTML;
}

// -------------------- Spracovanie vstupov --------------------
function handleNumericInput(input) {
  let value = input.value.replace(',', '.');
  input.value = value;
}

function handleWageOrTaxOrGoalBlur(input) {
  const value = parseFloat(input.value);

  if (input.id === 'hourlyWageInput') {
    if (!isNaN(value) && value >= 0) {
      appSettings.hourlyWage = value;
      saveAppSettingToLocalStorage('hourlyWage', value);
      input.classList.remove('invalid-value');
    } else {
      input.classList.add('invalid-value');
      showErrorNotification('Hodinová mzda musí byť kladné číslo.');
      return;
    }
  } else if (input.id === 'taxRateInput') {
    if (!isNaN(value) && value >= 0 && value <= 100) {
      appSettings.taxRate = value / 100;
      saveAppSettingToLocalStorage('taxRate', appSettings.taxRate);
      input.classList.remove('invalid-value');
    } else {
      input.classList.add('invalid-value');
      showErrorNotification('Daňové percento musí byť medzi 0 a 100.');
      return;
    }
  } else if (input.id === 'monthlyGoalInput') {
    if (!isNaN(value) && value >= 0) {
      appSettings.monthlyEarningsGoal = value;
      saveAppSettingToLocalStorage('monthlyEarningsGoal', value);
      input.classList.remove('invalid-value');
    } else if (input.value === '') {
      appSettings.monthlyEarningsGoal = null;
      localStorage.removeItem('monthlyEarningsGoal');
      input.classList.remove('invalid-value');
    } else {
      input.classList.add('invalid-value');
      showErrorNotification('Mesačný cieľ musí byť kladné číslo.');
      return;
    }
  }

  debouncedSaveAppSettingsToFirestore();
  recalculateAllRows();
  calculateTotalSalary();
}

function handleBreakBlur(input) {
  const value = parseFloat(input.value);
  if (isNaN(value) || value < 0) {
    input.classList.add('invalid-value');
    showErrorNotification('Prestávka musí byť kladné číslo.');
  } else {
    input.classList.remove('invalid-value');
    recalculateDayRow(input);
  }
}

function recalculateAllRows() {
  const allRows = uiRefs.workDaysTbody.querySelectorAll('tr');
  allRows.forEach(row => {
    const firstInput = row.querySelector('input');
    if (firstInput) recalculateDayRow(firstInput);
  });
}

// -------------------- Nastavenia/UI --------------------
function updateEmployeeName() {
  const name = uiRefs.employeeNameInput.value.trim();
  appSettings.employeeName = name;
  saveAppSettingToLocalStorage('employeeName', name);
  updateSubTitle();
  debouncedSaveAppSettingsToFirestore();
}

function updateSubTitle() {
  const monthName = MONTH_NAMES[currentMonth];
  const employeeName = appSettings.employeeName || 'Pracovník';
  uiRefs.subTitle.textContent = `${employeeName} - ${monthName} ${currentYear}`;
}

function changeDecimalPlaces() {
  const newValue = parseInt(uiRefs.decimalPlacesSelect.value);
  appSettings.decimalPlaces = newValue;
  saveAppSettingToLocalStorage('decimalPlaces', newValue);
  debouncedSaveAppSettingsToFirestore();
  recalculateAllRows();
  calculateTotalSalary();
}

function changeMonth() {
  const newMonth = parseInt(uiRefs.monthSelect.value);
  if (newMonth !== currentMonth) {
    currentMonth = newMonth;
    loadCurrentMonthData();
  }
}

function changeYear() {
  const newYear = parseInt(uiRefs.yearSelect.value);
  if (newYear !== currentYear) {
    currentYear = newYear;
    loadCurrentMonthData();
  }
}

function toggleSettings() {
  const isVisible = uiRefs.settingsCollapsibleContent.classList.toggle('visible');
  uiRefs.toggleSettingsBtn.setAttribute('aria-expanded', isVisible);
  uiRefs.toggleSettingsBtn.textContent = isVisible
    ? 'Skryť nastavenia aplikácie ▲'
    : 'Zobraziť nastavenia aplikácie ▼';
}

// -------------------- AUTH --------------------
async function loginUser() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    showErrorNotification('Prosím vyplňte email a heslo.');
    return;
  }

  setLoadingState(uiRefs.loginBtn, true, 'Prihlasovanie...');

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showSaveNotification('Úspešne prihlásený!');
  } catch (error) {
    console.error('Login error:', error);
    showErrorNotification(`Chyba pri prihlásení: ${error.message}`);
  } finally {
    setLoadingState(uiRefs.loginBtn, false);
  }
}

async function registerUser() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    showErrorNotification('Prosím vyplňte email a heslo.');
    return;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    showErrorNotification(passwordError);
    return;
  }

  setLoadingState(uiRefs.registerBtn, true, 'Registrácia...');

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    showSaveNotification('Úspešne registrovaný!');
  } catch (error) {
    console.error('Registration error:', error);
    showErrorNotification(`Chyba pri registrácii: ${error.message}`);
  } finally {
    setLoadingState(uiRefs.registerBtn, false);
  }
}

async function logoutUser() {
  try {
    await signOut(auth);
    showSaveNotification('Odhlásený.');
  } catch (error) {
    console.error('Logout error:', error);
    showErrorNotification('Chyba pri odhlásení.');
  }
}

async function resetUserPassword() {
  const email = document.getElementById('email').value.trim();

  if (!email) {
    showErrorNotification('Prosím zadajte email adresu.');
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showSaveNotification('Email na reset hesla bol odoslaný.');
  } catch (error) {
    console.error('Password reset error:', error);
    showErrorNotification(`Chyba: ${error.message}`);
  }
}

// -------------------- Ukladanie mesačných dát --------------------
function getMonthDocId() {
  return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
}

function collectMonthData() {
  const monthData = {};
  const daysInMonth = getDaysInMonth(currentMonth, currentYear);

  for (let day = 1; day <= daysInMonth; day++) {
    const arrival = document.getElementById(`arrival-${day}`)?.value || '';
    const departure = document.getElementById(`departure-${day}`)?.value || '';
    const breakMinutes = parseFloat(document.getElementById(`break-${day}`)?.value) || 0;
    const project = document.getElementById(`project-${day}`)?.value || '';
    const note = document.getElementById(`note-${day}`)?.value || '';

    if (arrival || departure || breakMinutes || project || note) {
      monthData[day] = { arrival, departure, break: breakMinutes, project, note };
    }
  }

  return monthData;
}

function saveMonthData() {
  const monthData = collectMonthData();
  const monthDocId = getMonthDocId();

  localStorage.setItem(`monthData_${monthDocId}`, JSON.stringify(monthData));

  if (currentUser && navigator.onLine) {
    saveMonthDataToFirestore(monthData, monthDocId);
  } else if (currentUser) {
    addMonthToPendingList(monthDocId);
    updateLocalStorageIndicator();
  }
}

const debouncedSaveMonthData = debounce(saveMonthData, 1000);

async function saveMonthDataToFirestore(monthData, monthDocId) {
  if (!currentUser) return;

  const monthDocRef = doc(db, 'users', currentUser.uid, 'months', monthDocId);

  try {
    await setDoc(monthDocRef, { data: monthData }, { merge: true });
    removeMonthFromPendingList(monthDocId);
    updateLocalStorageIndicator();
  } catch (error) {
    console.error('Error saving to Firestore:', error);
    addMonthToPendingList(monthDocId);
    updateLocalStorageIndicator();
  }
}

// -------------------- Načítanie a render mesačných dát --------------------
function renderMonthTable(monthData) {
  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const today = new Date();
  const isCurrentMonth = today.getMonth() === currentMonth && today.getFullYear() === currentYear;
  const currentDay = isCurrentMonth ? today.getDate() : -1;

  let html = '';

  for (let day = 1; day <= daysInMonth; day++) {
    const dayName = getDayName(currentYear, currentMonth, day);
    const isWeekendDay = isWeekend(currentYear, currentMonth, day);
    const isCurrentDay = day === currentDay;

    const dayData = monthData[day] || {};
    const arrival = dayData.arrival || '';
    const departure = dayData.departure || '';
    const breakMinutes = dayData.break || 0;
    const project = dayData.project || '';
    const note = dayData.note || '';

    let workedHours = '';
    let grossSalary = '';
    let netSalary = '';

    if (isValidTimeFormat(arrival) && isValidTimeFormat(departure)) {
      const [arrH, arrM] = arrival.split(':').map(Number);
      const [depH, depM] = departure.split(':').map(Number);

      let totalMinutes = (depH * 60 + depM) - (arrH * 60 + arrM);
      if (totalMinutes < 0) totalMinutes += 24 * 60;

      const workedMinutes = Math.max(0, totalMinutes - breakMinutes);
      const worked = workedMinutes / 60;

      workedHours = worked.toFixed(appSettings.decimalPlaces);

      const gross = worked * appSettings.hourlyWage;
      const net = gross * (1 - appSettings.taxRate);

      grossSalary = gross.toFixed(appSettings.decimalPlaces);
      netSalary = net.toFixed(appSettings.decimalPlaces);
    }

    html += `
      <tr data-day="${day}" class="${isWeekendDay ? 'weekend-day' : ''} ${isCurrentDay ? 'current-day' : ''}">
        <td>${day}. ${dayName}</td>
        <td>
          <div class="time-input-wrapper">
            <input type="tel" id="arrival-${day}" class="time-input" placeholder="08:00" value="${arrival}" maxlength="5">
            <button type="button" class="time-btn" title="Nastaviť aktuálny čas">🕐</button>
          </div>
        </td>
        <td>
          <div class="time-input-wrapper">
            <input type="tel" id="departure-${day}" class="time-input" placeholder="16:00" value="${departure}" maxlength="5">
            <button type="button" class="time-btn" title="Nastaviť aktuálny čas">🕐</button>
          </div>
        </td>
        <td><input type="number" id="break-${day}" placeholder="30" value="${breakMinutes || ''}" min="0" step="1"></td>
        <td><input type="number" id="worked-${day}" readonly value="${workedHours}"></td>
        <td><input type="text" id="project-${day}" class="project-input" placeholder="Názov projektu..." value="${project}"></td>
        <td><textarea id="note-${day}" placeholder="Poznámky...">${note}</textarea></td>
        <td><input type="number" id="gross-${day}" readonly value="${grossSalary}"></td>
        <td><input type="number" id="net-${day}" readonly value="${netSalary}"></td>
        <td></td>
      </tr>
    `;
  }

  uiRefs.workDaysTbody.innerHTML = html;

  document.querySelectorAll('textarea[id^="note-"]').forEach(textarea => {
    autoResizeTextarea(textarea);
  });

  calculateTotalSalary();
}

function loadCurrentMonthData() {
  updateSubTitle();
  populateMonthSelects();

  const monthDocId = getMonthDocId();
  const storedData = localStorage.getItem(`monthData_${monthDocId}`);

  if (storedData) {
    try {
      const monthData = JSON.parse(storedData);
      renderMonthTable(monthData);
    } catch (error) {
      console.error('Error parsing stored month data:', error);
      renderMonthTable({});
    }
  } else {
    renderMonthTable({});
  }

  if (currentUser && navigator.onLine) {
    attachMonthListener();
  }
}

function attachMonthListener() {
  if (currentListenerUnsubscribe) {
    currentListenerUnsubscribe();
  }

  if (!currentUser) return;

  const monthDocId = getMonthDocId();
  const monthDocRef = doc(db, 'users', currentUser.uid, 'months', monthDocId);

  currentListenerUnsubscribe = onSnapshot(monthDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && data.data) {
        localStorage.setItem(`monthData_${monthDocId}`, JSON.stringify(data.data));
        renderMonthTable(data.data);
        removeMonthFromPendingList(monthDocId);
        updateLocalStorageIndicator();
      }
    }
  }, (error) => {
    console.error('Firestore listener error:', error);
  });
}

async function loadFromFirestore() {
  if (!currentUser) {
    showErrorNotification('Musíte byť prihlásený.');
    return;
  }

  if (!navigator.onLine) {
    showWarningNotification('Ste offline. Pripojte sa k internetu.');
    return;
  }

  setLoadingState(uiRefs.loadFromFirestoreBtn, true, 'Načítavam...');

  const monthDocId = getMonthDocId();
  const monthDocRef = doc(db, 'users', currentUser.uid, 'months', monthDocId);

  try {
    const docSnap = await getDoc(monthDocRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && data.data) {
        localStorage.setItem(`monthData_${monthDocId}`, JSON.stringify(data.data));
        renderMonthTable(data.data);
        showSaveNotification('Dáta boli načítané z cloudu.');
      } else {
        showWarningNotification('Žiadne dáta v cloude pre tento mesiac.');
      }
    } else {
      showWarningNotification('Žiadne dáta v cloude pre tento mesiac.');
    }
  } catch (error) {
    console.error('Error loading from Firestore:', error);
    showErrorNotification('Chyba pri načítaní z cloudu.');
  } finally {
    setLoadingState(uiRefs.loadFromFirestoreBtn, false);
  }
}

function clearMonthData() {
  if (!confirm(`Naozaj chcete vymazať všetky dáta pre ${MONTH_NAMES[currentMonth]} ${currentYear}?`)) {
    return;
  }

  const monthDocId = getMonthDocId();
  localStorage.removeItem(`monthData_${monthDocId}`);
  renderMonthTable({});

  if (currentUser && navigator.onLine) {
    deleteMonthDataFromFirestore(monthDocId);
  }

  showSaveNotification('Mesačné dáta boli vymazané.');
}

async function deleteMonthDataFromFirestore(monthDocId) {
  if (!currentUser) return;

  const monthDocRef = doc(db, 'users', currentUser.uid, 'months', monthDocId);

  try {
    await deleteDoc(monthDocRef);
    removeMonthFromPendingList(monthDocId);
    updateLocalStorageIndicator();
  } catch (error) {
    console.error('Error deleting from Firestore:', error);
  }
}

// -------------------- Export / Backup --------------------
async function exportToPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showErrorNotification('PDF knižnica nie je načítaná. Skúste znova.');
    return;
  }

  setLoadingState(uiRefs.exportPDFBtn, true, 'Generujem PDF...');

  try {
    const { jsPDF } = window.jspdf;
    const docPDF = new jsPDF();

    const monthName = MONTH_NAMES[currentMonth];
    const employeeName = appSettings.employeeName || 'Pracovník';

    docPDF.setFontSize(16);
    docPDF.text(`${employeeName} - ${monthName} ${currentYear}`, 14, 20);

    const monthData = collectMonthData();
    const tableData = [];

    for (let day = 1; day <= getDaysInMonth(currentMonth, currentYear); day++) {
      const dayData = monthData[day] || {};
      const dayName = getDayName(currentYear, currentMonth, day);

      tableData.push([
        `${day}. ${dayName}`,
        dayData.arrival || '-',
        dayData.departure || '-',
        dayData.break ? `${dayData.break} min` : '-',
        dayData.project || '-'
      ]);
    }

    docPDF.autoTable({
      startY: 30,
      head: [['Deň', 'Príchod', 'Odchod', 'Prestávka', 'Projekt']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 9 }
    });

    const filename = `${employeeName}_${monthName}_${currentYear}.pdf`;
    docPDF.save(filename);

    showSaveNotification('PDF bolo exportované.');
  } catch (error) {
    console.error('PDF export error:', error);
    showErrorNotification('Chyba pri exporte PDF.');
  } finally {
    setLoadingState(uiRefs.exportPDFBtn, false);
  }
}

async function sendPDF() {
  showWarningNotification('Funkcia odoslania PDF nie je implementovaná. Použite export a odošlite manuálne.');
}

async function createBackup() {
  if (!window.XLSX) {
    showErrorNotification('XLSX knižnica nie je načítaná. Skúste znova.');
    return;
  }

  setLoadingState(uiRefs.createBackupBtn, true, 'Vytváram zálohu...');

  try {
    const monthData = collectMonthData();
    const worksheetData = [['Deň', 'Príchod', 'Odchod', 'Prestávka', 'Projekt', 'Poznámka']];

    for (let day = 1; day <= getDaysInMonth(currentMonth, currentYear); day++) {
      const dayData = monthData[day] || {};
      const dayName = getDayName(currentYear, currentMonth, day);

      worksheetData.push([
        `${day}. ${dayName}`,
        dayData.arrival || '',
        dayData.departure || '',
        dayData.break || '',
        dayData.project || '',
        dayData.note || ''
      ]);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${MONTH_NAMES[currentMonth]} ${currentYear}`);

    const monthName = MONTH_NAMES[currentMonth];
    const employeeName = appSettings.employeeName || 'Pracovnik';
    const filename = `${employeeName}_${monthName}_${currentYear}_zaloha.xlsx`;

    XLSX.writeFile(workbook, filename);

    showSaveNotification('Záloha bola vytvorená.');
  } catch (error) {
    console.error('Backup error:', error);
    showErrorNotification('Chyba pri vytváraní zálohy.');
  } finally {
    setLoadingState(uiRefs.createBackupBtn, false);
  }
}

async function restoreBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx';

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.XLSX) {
      showErrorNotification('XLSX knižnica nie je načítaná.');
      return;
    }

    setLoadingState(uiRefs.restoreBackupBtn, true, 'Obnovovanie...');

    try {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array' });

          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

          const monthData = {};

          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            const dayMatch = String(row[0]).match(/^(\d+)\./);
            if (!dayMatch) continue;

            const day = parseInt(dayMatch[1]);

            monthData[day] = {
              arrival: row[1] || '',
              departure: row[2] || '',
              break: parseFloat(row[3]) || 0,
              project: row[4] || '',
              note: row[5] || ''
            };
          }

          const monthDocId = getMonthDocId();
          localStorage.setItem(`monthData_${monthDocId}`, JSON.stringify(monthData));
          renderMonthTable(monthData);

          if (currentUser && navigator.onLine) {
            saveMonthDataToFirestore(monthData, monthDocId);
          }

          showSaveNotification('Záloha bola obnovená.');
        } catch (error) {
          console.error('Restore error:', error);
          showErrorNotification('Chyba pri obnovení zálohy.');
        } finally {
          setLoadingState(uiRefs.restoreBackupBtn, false);
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('File read error:', error);
      showErrorNotification('Chyba pri čítaní súboru.');
      setLoadingState(uiRefs.restoreBackupBtn, false);
    }
  };

  input.click();
}

// -------------------- UI pomocné --------------------
function populateMonthSelects() {
  if (uiRefs.monthSelect.options.length === 0) {
    MONTH_NAMES.forEach((name, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = name;
      uiRefs.monthSelect.appendChild(option);
    });
  }
  uiRefs.monthSelect.value = currentMonth;

  if (uiRefs.yearSelect.options.length === 0) {
    for (let year = currentYear - 5; year <= currentYear + 5; year++) {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      uiRefs.yearSelect.appendChild(option);
    }
  }
  uiRefs.yearSelect.value = currentYear;
}

function updateLocalStorageIndicator() {
  const pendingCount = getPendingSyncCount();
  if (pendingCount > 0) {
    uiRefs.localStorageIndicator.textContent = `⚠️ ${pendingCount} mesiac(ov) čaká na synchronizáciu`;
  } else {
    uiRefs.localStorageIndicator.textContent = currentUser ? '✅ Všetko synchronizované' : '';
  }
}

function updateUISettings() {
  uiRefs.hourlyWageInput.value = appSettings.hourlyWage;
  uiRefs.taxRateInput.value = (appSettings.taxRate * 100).toFixed(2);
  uiRefs.monthlyGoalInput.value = appSettings.monthlyEarningsGoal || '';
  uiRefs.decimalPlacesSelect.value = appSettings.decimalPlaces;
  uiRefs.employeeNameInput.value = appSettings.employeeName;
}

// -------------------- Event listenery --------------------
function handleTableClick(e) {
  if (e.target.classList.contains('time-btn')) {
    const input = e.target.previousElementSibling || e.target.nextElementSibling;
    if (input && input.tagName === 'INPUT') {
      setCurrentTime(input);
    }
  }
}

function handleTableInput(e) {
  const target = e.target;

  if (target.classList.contains('time-input')) {
    debouncedSaveMonthData();
    recalculateDayRow(target);
  }

  if (target.id && target.id.startsWith('break-')) {
    handleNumericInput(target);
    debouncedSaveMonthData();
    recalculateDayRow(target);
  }

  if (target.id && target.id.startsWith('project-')) {
    debouncedSaveMonthData();
  }

  if (target.id && target.id.startsWith('note-')) {
    autoResizeTextarea(target);
    debouncedSaveMonthData();
  }
}

function handleTableBlur(e) {
  const target = e.target;

  if (target.id && target.id.startsWith('break-')) {
    handleBreakBlur(target);
  }
}

function setupEventListeners() {
  // Auth
  uiRefs.loginBtn.addEventListener('click', loginUser);
  uiRefs.registerBtn.addEventListener('click', registerUser);
  uiRefs.resetPasswordLink.addEventListener('click', (e) => {
    e.preventDefault();
    resetUserPassword();
  });
  uiRefs.logoutBtn.addEventListener('click', logoutUser);

  // Theme
  uiRefs.themeToggleBtn.addEventListener('click', ThemeManager.toggleTheme);

  // Settings
  uiRefs.toggleSettingsBtn.addEventListener('click', toggleSettings);
  uiRefs.employeeNameInput.addEventListener('input', updateEmployeeName);

  uiRefs.hourlyWageInput.addEventListener('input', function () { handleNumericInput(this); });
  uiRefs.hourlyWageInput.addEventListener('blur', function () { handleWageOrTaxOrGoalBlur(this); });

  uiRefs.taxRateInput.addEventListener('input', function () { handleNumericInput(this); });
  uiRefs.taxRateInput.addEventListener('blur', function () { handleWageOrTaxOrGoalBlur(this); });

  uiRefs.monthlyGoalInput.addEventListener('input', function () { handleNumericInput(this); });
  uiRefs.monthlyGoalInput.addEventListener('blur', function () { handleWageOrTaxOrGoalBlur(this); });

  uiRefs.decimalPlacesSelect.addEventListener('change', changeDecimalPlaces);
  uiRefs.monthSelect.addEventListener('change', changeMonth);
  uiRefs.yearSelect.addEventListener('change', changeYear);

  // Action buttons
  uiRefs.exportPDFBtn.addEventListener('click', exportToPDF);
  uiRefs.sendPDFBtn.addEventListener('click', sendPDF);
  uiRefs.createBackupBtn.addEventListener('click', createBackup);
  uiRefs.restoreBackupBtn.addEventListener('click', restoreBackup);
  uiRefs.loadFromFirestoreBtn.addEventListener('click', loadFromFirestore);
  uiRefs.clearMonthBtn.addEventListener('click', clearMonthData);

  // Table delegation
  uiRefs.workDaysTbody.addEventListener('click', handleTableClick);
  uiRefs.workDaysTbody.addEventListener('input', handleTableInput);
  uiRefs.workDaysTbody.addEventListener('blur', handleTableBlur, true);
}

// -------------------- Sync pending mesiacov --------------------
async function syncPendingMonths() {
  if (!currentUser || !navigator.onLine) return;

  const pendingMonths = getPendingSyncMonths();
  if (pendingMonths.length === 0) return;

  for (const monthDocId of pendingMonths) {
    const storedData = localStorage.getItem(`monthData_${monthDocId}`);
    if (storedData) {
      try {
        const monthData = JSON.parse(storedData);
        await saveMonthDataToFirestore(monthData, monthDocId);
      } catch (error) {
        console.error(`Error syncing month ${monthDocId}:`, error);
      }
    }
  }

  updateLocalStorageIndicator();
}

// -------------------- Inicializácia --------------------
function initApp() {
  loadAppSettingsFromLocalStorage();
  ThemeManager.init();
  setupEventListeners();
  populateMonthSelects();
  updateSubTitle();
  updateUISettings();
  updateLocalStorageIndicator();

  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      uiRefs.loginFieldset.style.display = 'none';
      uiRefs.userInfo.style.display = 'flex';
      uiRefs.userEmailSpan.textContent = user.email;

      loadCurrentMonthData();

      if (navigator.onLine) {
        syncPendingMonths();
      }
    } else {
      currentUser = null;
      uiRefs.loginFieldset.style.display = 'block';
      uiRefs.userInfo.style.display = 'none';

      if (currentListenerUnsubscribe) {
        currentListenerUnsubscribe();
        currentListenerUnsubscribe = null;
      }

      loadCurrentMonthData();
    }

    updateLocalStorageIndicator();

    uiRefs.appLoader.style.display = 'none';
    uiRefs.mainContainer.style.display = 'block';
  });

  window.addEventListener('online', () => {
    showSaveNotification('Pripojenie obnovené. Synchronizujem...');
    if (currentUser) {
      syncPendingMonths();
      attachMonthListener();
    }
  });

  window.addEventListener('offline', () => {
    showWarningNotification('Ste offline. Zmeny sa uložia lokálne.');
  });
}

// spustenie
initApp();
