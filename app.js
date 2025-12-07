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
    the rest of file trimmed
