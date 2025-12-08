// ============================================
// Bruno's Calculator Pro - Ultimate Edition
// ============================================

// Firebase imports
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

// ============================================
// FIREBASE CONFIGURATION
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyBdLtJlduT3iKiGLDJ0UfAakpf6wcresnk",
  authDomain: "uuuuu-f7ef9.firebaseapp.com",
  projectId: "uuuuu-f7ef9",
  storageBucket: "uuuuu-f7ef9.appspot.com",
  messagingSenderId: "456105865458",
  appId: "1:456105865458:web:101f0a4dcb455f174b606b"
};

const RECAPTCHA_V3_SITE_KEY = '6LczmP0qAAAAAACGalBT9zZekkUr3hLgA2e8o99v';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize App Check
try {
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
  console.log('✅ Firebase App Check initialized');
} catch (e) {
  console.warn('App Check initialization failed:', e);
  showWarningNotification('Inicializácia App Check zlyhala. Niektoré funkcie môžu byť obmedzené.');
}

const auth = getAuth(app);

// Initialize Firestore with persistent cache
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      sizeBytes: CACHE_SIZE_UNLIMITED
    })
  });
  console.log('✅ Firestore offline cache enabled');
} catch (error) {
  console.warn('Failed to initialize Firestore with persistent cache. Falling back to in-memory cache:', error);
  showWarningNotification('Chyba pri inicializácii offline úložiska. Dáta nebudú dostupné offline.');
  db = initializeFirestore(app);
}

// ============================================
// GLOBAL VARIABLES
// ============================================
let currentUser = null;
let currentListenerUnsubscribe = null;

const uiRefs = {
  workDaysTbody: document.getElementById('workDays'),
  totalSalaryDiv: document.getElementById('totalSalary'),
  mainTitle: document.getElementById('mainTitle'),
  subTitle: document.getElementById('subTitle'),
  hourlyWageInput: document.getElementById('hourlyWageInput'),
  taxRateInput: document.getElementById('taxRateInput'),
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
  themeMeta: document.querySelector('meta[name="theme-color"]')
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

const MONTH_NAMES = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];
const DAY_NAMES_SHORT = ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'];
const PENDING_SYNC_MONTHS_LS_KEY = 'pendingSyncMonthsList';

// ============================================
// THEME MANAGER
// ============================================
const ThemeManager = {
  init() {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme) {
      appSettings.theme = storedTheme;
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      appSettings.theme = prefersDark ? 'dark' : 'light';
    }
    
    ThemeManager.applyTheme(appSettings.theme);
    
    uiRefs.themeToggleBtn.onclick = ThemeManager.toggleTheme;
    
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        appSettings.theme = e.matches ? 'dark' : 'light';
        ThemeManager.applyTheme(appSettings.theme);
      }
    });
  },
  
  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    uiRefs.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    appSettings.theme = theme;
    
    if (uiRefs.themeMeta) {
      uiRefs.themeMeta.content = getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-color-meta').trim();
    }
  },
  
  toggleTheme() {
    const newTheme = appSettings.theme === 'light' ? 'dark' : 'light';
    ThemeManager.applyTheme(newTheme);
    saveAppSettingToLocalStorage('theme', newTheme);
    debouncedSaveAppSettingsToFirestore();
  }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

async function updateAppBadge(count) {
  if ('setAppBadge' in navigator) {
    try {
      if (count > 0) {
        await navigator.setAppBadge(count);
      } else {
        await navigator.clearAppBadge();
      }
    } catch (error) {
      console.error('Failed to set app badge:', error);
    }
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

const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

function isValidTimeFormat(timeString) {
  return typeof timeString === 'string' && /^([01]?\d|2[0-3]):([0-5]\d)$/.test(timeString);
}

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

window.showSaveNotification = (message = 'Dáta boli úspešne uložené.') => {
  showNotification('saveNotification', message);
};

window.showErrorNotification = (message) => {
  showNotification('errorNotification', message, 5000);
};

window.showWarningNotification = (message) => {
  showNotification('warningNotification', message, 4500);
};

function setLoadingState(button, isLoading, textParam = 'Spracúvam...') {
  if (!button) return;
  
  if (isLoading) {
    button.disabled = true;
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    button.textContent = '';
    const spinnerSpan = document.createElement('span');
    spinnerSpan.className = 'spinner';
    spinnerSpan.setAttribute('role', 'status');
    spinnerSpan.setAttribute('aria-hidden', 'true');
    button.textContent = '';
    button.appendChild(spinnerSpan);
    button.appendChild(document.createTextNode(' ' + textParam));
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

// ============================================
// APP SETTINGS
// ============================================

function loadAppSettingsFromLocalStorage() {
  appSettings.decimalPlaces = parseInt(localStorage.getItem('decimalPlaces')) || 2;
  appSettings.employeeName = localStorage.getItem('employeeName') || '';
  appSettings.hourlyWage = parseFloat(localStorage.getItem('hourlyWage')) || 10;
  appSettings.taxRate = parseFloat(localStorage.getItem('taxRate')) || 0.02;
  appSettings.theme = localStorage.getItem('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  appSettings.monthlyEarningsGoal = localStorage.getItem('monthlyEarningsGoal') ? parseFloat(localStorage.getItem('monthlyEarningsGoal')) : null;
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
    console.error('Error saving app settings to Firestore:', error);
    showErrorNotification('Nepodarilo sa uložiť nastavenia aplikácie do cloudu.');
  }
}

const debouncedSaveAppSettingsToFirestore = debounce(saveAppSettingsToFirestore, 1800);

async function loadUserAppSettingsFromFirestore() {
  if (!currentUser || !navigator.onLine) return Promise.resolve(false);
  
  const userDocRef = doc(db, 'users', currentUser.uid);
  try {
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists() && docSnap.data().appSettings) {
      const fsSettings = docSnap.data().appSettings;
      Object.keys(appSettings).forEach(key => {
        if (fsSettings.hasOwnProperty(key) && fsSettings[key] !== undefined) {
          if (key === 'decimalPlaces') {
            appSettings[key] = parseInt(fsSettings[key]);
          } else if (key === 'hourlyWage' || key === 'taxRate' || key === 'monthlyEarningsGoal') {
            appSettings[key] = parseFloat(fsSettings[key]);
          } else if (key === 'theme') {
            if (fsSettings[key] === 'light' || fsSettings[key] === 'dark') {
              appSettings[key] = fsSettings[key];
            }
          } else {
            appSettings[key] = fsSettings[key];
          }
        }
      });
      
      if (isNaN(appSettings.monthlyEarningsGoal)) {
        appSettings.monthlyEarningsGoal = null;
      }
      
      Object.entries(appSettings).forEach(([key, value]) => {
        if (value !== undefined) {
          localStorage.setItem(key, value);
        }
      });
      
      updateSettingsUIInputs();
      ThemeManager.applyTheme(appSettings.theme);
      return true;
    }
  } catch (error) {
    console.error('Error loading app settings from Firestore:', error);
    showErrorNotification('Chyba načítania nastavení aplikácie z cloudu.');
  }
  return false;
}

function updateSettingsUIInputs() {
  uiRefs.decimalPlacesSelect.value = appSettings.decimalPlaces;
  uiRefs.employeeNameInput.value = appSettings.employeeName;
  
  const wage = typeof appSettings.hourlyWage === 'number' ? appSettings.hourlyWage : parseFloat(appSettings.hourlyWage) || 0;
  uiRefs.hourlyWageInput.value = wage.toFixed(appSettings.decimalPlaces > 0 ? appSettings.decimalPlaces : 1);
  
  const tax = typeof appSettings.taxRate === 'number' ? appSettings.taxRate : parseFloat(appSettings.taxRate) || 0;
  uiRefs.taxRateInput.value = (tax * 100).toFixed(1);
}

// ============================================
// UI INITIALIZATION
// ============================================

function initializeUI() {
  loadAppSettingsFromLocalStorage();
  ThemeManager.init();
  
  MONTH_NAMES.forEach((name, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = name;
    uiRefs.monthSelect.appendChild(option);
  });
  
  const startYear = 2020, endYear = currentDate.getFullYear() + 5;
  for (let year = startYear; year <= endYear; year++) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    uiRefs.yearSelect.appendChild(option);
  }
  
  uiRefs.monthSelect.value = currentMonth;
  uiRefs.yearSelect.value = currentYear;
  
  updateSettingsUIInputs();
  updatePageTitleAndGreeting();
  updateLocalStorageSizeIndicator();
  updateAppBadge(getPendingSyncCount());
}

window.updateEmployeeName = function() {
  saveAppSettingToLocalStorage('employeeName', uiRefs.employeeNameInput.value.trim());
  updatePageTitleAndGreeting();
  debouncedSaveAppSettingsToFirestore();
};

window.handleNumericInput = function(inputElement) {
  let value = inputElement.value;
  value = value.replace(/,/g, '.');
  value = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
  inputElement.value = value;
};

window.handleWageOrTaxOrGoalBlur = function(inputElement) {
  let valueString = inputElement.value.replace(/,/g, '.');
  let value = parseFloat(valueString);
  const id = inputElement.id;
  let validChange = true;
  
  inputElement.classList.remove('invalid-value');
  
  if (id === 'hourlyWageInput') {
    if (!isNaN(value) && value >= 0) {
      appSettings.hourlyWage = value;
      inputElement.value = value.toFixed(appSettings.decimalPlaces > 0 ? appSettings.decimalPlaces : 1);
      saveAppSettingToLocalStorage('hourlyWage', appSettings.hourlyWage);
    } else {
      inputElement.value = (appSettings.hourlyWage || 0).toFixed(appSettings.decimalPlaces > 0 ? appSettings.decimalPlaces : 1);
      showErrorNotification('Neplatná hodinová mzda.');
      inputElement.classList.add('invalid-value');
      validChange = false;
    }
  } else if (id === 'taxRateInput') {
    if (!isNaN(value) && value >= 0 && value <= 100) {
      appSettings.taxRate = value / 100;
      inputElement.value = value.toFixed(1);
      saveAppSettingToLocalStorage('taxRate', appSettings.taxRate);
    } else {
      inputElement.value = ((appSettings.taxRate || 0) * 100).toFixed(1);
      showErrorNotification('Neplatné daňové percento.');
      inputElement.classList.add('invalid-value');
      validChange = false;
    }
  }
  
  if (validChange) {
    recalculateAllRowsAndUpdateTotal();
    debouncedSaveAppSettingsToFirestore();
  }
};

window.changeDecimalPlaces = function() {
  saveAppSettingToLocalStorage('decimalPlaces', parseInt(uiRefs.decimalPlacesSelect.value));
  const currentWage = typeof appSettings.hourlyWage === 'number' ? appSettings.hourlyWage : 0;
  uiRefs.hourlyWageInput.value = currentWage.toFixed(appSettings.decimalPlaces > 0 ? appSettings.decimalPlaces : 1);
  recalculateAllRowsAndUpdateTotal();
  debouncedSaveAppSettingsToFirestore();
};

function recalculateAllRowsAndUpdateTotal() {
  const days = getDaysInMonth(currentMonth, currentYear);
  for (let i = 1; i <= days; i++) {
    calculateRow(i);
  }
  calculateTotal();
}

function updatePageTitleAndGreeting() {
  const wavingHand = '👋';
  const namePart = appSettings.employeeName ? appSettings.employeeName.split(' ')[0] : '';
  uiRefs.mainTitle.textContent = `Vitaj ${namePart ? namePart + ' ' : ''}${wavingHand}`;
  
  const monthName = MONTH_NAMES[currentMonth];
  const titleNamePart = appSettings.employeeName ? `${appSettings.employeeName} - ` : '';
  document.title = `${titleNamePart}${monthName} ${currentYear} - Bruno's Calc Pro`;
  uiRefs.subTitle.textContent = `${monthName} ${currentYear}`;
}

function updateLocalStorageSizeIndicator() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    total += (key.length + (localStorage.getItem(key)?.length || 0)) * 2;
  }
  uiRefs.localStorageIndicator.textContent = `Lokálne uložené: ${(total / 1024).toFixed(1)}KB`;
}

// ============================================
// AUTHENTICATION
// ============================================

const authErrorMap = {
  'auth/invalid-email': 'Neplatný formát emailu.',
  'auth/user-disabled': 'Tento účet bol deaktivovaný.',
  'auth/user-not-found': 'Používateľ s týmto emailom nebol nájdený.',
  'auth/wrong-password': 'Nesprávne heslo.',
  'auth/email-already-in-use': 'Tento email je už zaregistrovaný.',
  'auth/weak-password': 'Heslo je príliš slabé (musí mať aspoň 6 znakov).',
  'auth/requires-recent-login': 'Vyžaduje sa nedávne prihlásenie. Odhlás​te sa a prihláste znova.',
  'auth/network-request-failed': 'Chyba sieťového pripojenia. Skontrolujte internetové pripojenie.',
  'auth/too-many-requests': 'Príliš veľa neúspešných pokusov o prihlásenie. Skúste neskôr.',
  'auth/missing-email': 'Prosím, zadajte emailovú adresu.'
};

function mapFirebaseAuthError(code) {
  return authErrorMap[code] || `Neznáma chyba (${code}). Skúste prosím znova.`;
}

window.loginUser = async function() {
  const btn = event.target;
  setLoadingState(btn, true, 'Prihlasuje​m...');
  
  if (!navigator.onLine) {
    showErrorNotification('Ste offline. Prihlásenie je možné iba v online režime.');
    setLoadingState(btn, false, 'Prihlásiť sa');
    return;
  }
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  if (!email || !password) {
    showErrorNotification('Prosím, zadajte email aj heslo.');
    setLoadingState(btn, false, 'Prihlásiť sa');
    return;
  }
  
  try {
    await signInWithEmailAndPassword(auth, email, password);
    showSaveNotification('Úspešne prihlásený.');
  } catch (error) {
    showErrorNotification('Chyba pri prihlásení: ' + mapFirebaseAuthError(error.code));
  } finally {
    setLoadingState(btn, false, 'Prihlásiť sa');
  }
};

window.registerUser = async function() {
  const btn = event.target;
  setLoadingState(btn, true, 'Registrujem...');
  
  if (!navigator.onLine) {
    showErrorNotification('Ste offline. Registrácia je možná iba v online režime.');
    setLoadingState(btn, false, 'Registrovať');
    return;
  }
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  if (!email || !password) {
    showErrorNotification('Prosím, zadajte email aj heslo.');
    setLoadingState(btn, false, 'Registrovať');
    return;
  }
  
  if (password.length < 6) {
    showErrorNotification('Heslo musí mať aspoň 6 znakov.');
    setLoadingState(btn, false, 'Registrovať');
    return;
  }
  
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    await createUserCollectionAndSettings();
    showSaveNotification('Úspešne zaregistrovaný a prihlásený.');
  } catch (error) {
    showErrorNotification('Chyba pri registrácii: ' + mapFirebaseAuthError(error.code));
  } finally {
    setLoadingState(btn, false, 'Registrovať');
  }
};

async function createUserCollectionAndSettings() {
  if (auth.currentUser) {
    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    const initialMonthDocId = getFirestoreDocId(currentYear, currentMonth);
    const initialMonthDocRef = doc(db, 'users', auth.currentUser.uid, 'workData', initialMonthDocId);
    
    const batch = writeBatch(db);
    batch.set(userDocRef, {
      email: auth.currentUser.email,
      createdAt: new Date().toISOString(),
      appSettings: appSettings
    }, { merge: true });
    
    batch.set(initialMonthDocRef, {
      data: {},
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    try {
      await batch.commit();
    } catch (error) {
      console.error('Error creating user collection/settings:', error);
      showErrorNotification('Nepodarilo sa inicializovať používateľské dáta v cloude.');
    }
  }
}

window.logoutUser = async function() {
  const btn = event.target;
  setLoadingState(btn, true, 'Odhlasuje​m...');
  
  if (currentListenerUnsubscribe) {
    currentListenerUnsubscribe();
    currentListenerUnsubscribe = null;
  }
  
  try {
    await signOut(auth);
    showSaveNotification('Úspešne odhlásený.');
  } catch (error) {
    showErrorNotification('Chyba pri odhlásení: ' + error.message);
  } finally {
    setLoadingState(btn, false, 'Odhlásiť sa');
  }
};

window.resetUserPassword = async function() {
  if (!navigator.onLine) {
    showErrorNotification('Ste offline. Obnova hesla je možná iba v online režime.');
    return;
  }
  
  const emailInput = document.getElementById('email');
  const email = emailInput.value;
  
  if (!email) {
    emailInput.style.border = '1px solid red';
    showErrorNotification('Prosím, zadajte Vašu emailovú adresu pre obnovu hesla.');
    setTimeout(() => emailInput.style.border = '', 3000);
    return;
  }
  
  emailInput.style.border = '';
  
  try {
    await sendPasswordResetEmail(auth, email);
    showSaveNotification(`Email na obnovu hesla bol odoslaný na adresu ${email}. Skontrolujte si doručenú poštu.`);
  } catch (error) {
    showErrorNotification('Chyba pri odosielaní emailu na obnovu hesla: ' + mapFirebaseAuthError(error.code));
  }
};

function updateUIForAuthStateChange() {
  const isLoggedIn = !!currentUser;
  
  if (uiRefs.loginFieldset) {
    uiRefs.loginFieldset.style.display = isLoggedIn ? 'none' : 'block';
  }
  uiRefs.userInfo.style.display = isLoggedIn ? 'flex' : 'none';
  
  if (isLoggedIn && uiRefs.userEmailSpan) {
    uiRefs.userEmailSpan.textContent = `Prihlásený: ${currentUser.email}`;
    
    const logoutBtn = uiRefs.userInfo.querySelector('.reset-btn');
    if (logoutBtn && logoutBtn.classList.contains('is-loading')) {
      setLoadingState(logoutBtn, false, 'Odhlásiť sa');
    }
  }
  
  updateAppBadge(getPendingSyncCount());
}

// ============================================
// FIRESTORE SYNC
// ============================================

function setupFirestoreWorkDataListener() {
  if (currentListenerUnsubscribe) {
    currentListenerUnsubscribe();
  }
  
  if (!currentUser) {
    loadWorkDataFromLocalStorage();
    return;
  }
  
  if (!navigator.onLine) {
    loadWorkDataFromLocalStorage();
    showWarningNotification('Ste offline. Zobrazujem lokálne dáta. Synchronizácia prebehne po pripojení.');
    return;
  }
  
  const docId = getFirestoreDocId(currentYear, currentMonth);
  const docRef = doc(db, 'users', currentUser.uid, 'workData', docId);
  
  currentListenerUnsubscribe = onSnapshot(docRef, (docSnap) => {
    const localKey = getLocalStorageKeyForWorkData(docId);
    
    if (docSnap.exists()) {
      const firestoreData = docSnap.data();
      const firestoreDataString = JSON.stringify(firestoreData);
      
      if (!docSnap.metadata.hasPendingWrites && firestoreDataString !== localStorage.getItem(localKey)) {
        localStorage.setItem(localKey, firestoreDataString);
      }
      
      if (!docSnap.metadata.hasPendingWrites) {
        removeMonthFromPendingList(docId);
        const pendingKey = getPendingSyncKeyForMonth(docId);
        if (pendingKey) localStorage.removeItem(pendingKey);
      }
      
      parseAndApplyWorkData(firestoreDataString);
    } else {
      calculateTotal();
    }
  }, (error) => {
    console.error('Firestore listener error:', error);
    showErrorNotification(`Chyba synchronizácie dát s cloudom: ${error.message}. Zobrazujem lokálne uložené dáta.`);
    loadWorkDataFromLocalStorage();
    syncPendingWorkData();
  });
}

function getFirestoreDocId(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function getLocalStorageKeyForWorkData(docId) {
  return currentUser ? `workData-${currentUser.uid}-${docId}` : `workData-guest-${docId}`;
}

function getPendingSyncKeyForMonth(docId) {
  return currentUser ? `pendingSync-workData-${currentUser.uid}-${docId}` : null;
}

const debouncedSaveWorkDataAndSync = debounce(async () => {
  const dataToSave = collectWorkDataForMonth();
  const docId = getFirestoreDocId(currentYear, currentMonth);
  const localKey = getLocalStorageKeyForWorkData(docId);
  
  localStorage.setItem(localKey, JSON.stringify(dataToSave));
  updateLocalStorageSizeIndicator();
  
  if (currentUser && navigator.onLine) {
    const docRef = doc(db, 'users', currentUser.uid, 'workData', docId);
    try {
      await setDoc(docRef, {
        data: dataToSave,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving to Firestore:', error);
      addMonthToPendingList(docId);
      const pendingKey = getPendingSyncKeyForMonth(docId);
      if (pendingKey) {
        localStorage.setItem(pendingKey, JSON.stringify(dataToSave));
      }
    }
  } else if (currentUser) {
    addMonthToPendingList(docId);
    const pendingKey = getPendingSyncKeyForMonth(docId);
    if (pendingKey) {
      localStorage.setItem(pendingKey, JSON.stringify(dataToSave));
    }
  }
}, 1000);

function collectWorkDataForMonth() {
  const data = {};
  const days = getDaysInMonth(currentMonth, currentYear);
  
  for (let i = 1; i <= days; i++) {
    const dayStr = String(i).padStart(2, '0');
    const startInput = document.getElementById(`start-${dayStr}`);
    const endInput = document.getElementById(`end-${dayStr}`);
    const breakInput = document.getElementById(`break-${dayStr}`);
    const projectInput = document.getElementById(`project-${dayStr}`);
    const noteTextarea = document.getElementById(`note-${dayStr}`);
    
    const start = startInput?.value?.trim() || '';
    const end = endInput?.value?.trim() || '';
    const breakMinutes = breakInput?.value?.trim() || '';
    const project = projectInput?.value?.trim() || '';
    const note = noteTextarea?.value?.trim() || '';
    
    if (start || end || breakMinutes || project || note) {
      data[dayStr] = { start, end, break: breakMinutes, project, note };
    }
  }
  
  return data;
}

function loadWorkDataFromLocalStorage() {
  const docId = getFirestoreDocId(currentYear, currentMonth);
  const localKey = getLocalStorageKeyForWorkData(docId);
  const storedDataString = localStorage.getItem(localKey);
  
  if (storedDataString) {
    parseAndApplyWorkData(storedDataString);
  } else {
    clearAllFields();
    calculateTotal();
  }
}

function parseAndApplyWorkData(dataString) {
  let parsedData = null;
  
  try {
    const obj = JSON.parse(dataString);
    parsedData = obj.data || obj;
  } catch (e) {
    console.error('Error parsing work data:', e);
    clearAllFields();
    calculateTotal();
    return;
  }
  
  const days = getDaysInMonth(currentMonth, currentYear);
  
  for (let i = 1; i <= days; i++) {
    const dayStr = String(i).padStart(2, '0');
    const dayData = parsedData[dayStr] || {};
    
    const startInput = document.getElementById(`start-${dayStr}`);
    const endInput = document.getElementById(`end-${dayStr}`);
    const breakInput = document.getElementById(`break-${dayStr}`);
    const projectInput = document.getElementById(`project-${dayStr}`);
    const noteTextarea = document.getElementById(`note-${dayStr}`);
    
    if (startInput) startInput.value = dayData.start || '';
    if (endInput) endInput.value = dayData.end || '';
    if (breakInput) breakInput.value = dayData.break || '';
    if (projectInput) projectInput.value = dayData.project || '';
    if (noteTextarea) noteTextarea.value = dayData.note || '';
    
    calculateRow(i);
  }
  
  calculateTotal();
}

function clearAllFields() {
  const days = getDaysInMonth(currentMonth, currentYear);
  
  for (let i = 1; i <= days; i++) {
    const dayStr = String(i).padStart(2, '0');
    const startInput = document.getElementById(`start-${dayStr}`);
    const endInput = document.getElementById(`end-${dayStr}`);
    const breakInput = document.getElementById(`break-${dayStr}`);
    const projectInput = document.getElementById(`project-${dayStr}`);
    const noteTextarea = document.getElementById(`note-${dayStr}`);
    
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
    if (breakInput) breakInput.value = '';
    if (projectInput) projectInput.value = '';
    if (noteTextarea) noteTextarea.value = '';
  }
}

async function syncPendingWorkData() {
  if (!currentUser || !navigator.onLine) return;
  
  const pendingMonths = getPendingSyncMonths();
  if (pendingMonths.length === 0) return;
  
  console.log('Syncing pending months:', pendingMonths);
  
  for (const monthDocId of pendingMonths) {
    const pendingKey = getPendingSyncKeyForMonth(monthDocId);
    const pendingData = pendingKey ? localStorage.getItem(pendingKey) : null;
    
    if (pendingData) {
      const docRef = doc(db, 'users', currentUser.uid, 'workData', monthDocId);
      try {
        const dataToSync = JSON.parse(pendingData);
        await setDoc(docRef, {
          data: dataToSync,
          lastUpdated: new Date().toISOString()
        }, { merge: true });
        
        localStorage.removeItem(pendingKey);
        removeMonthFromPendingList(monthDocId);
        console.log(`Successfully synced month: ${monthDocId}`);
      } catch (error) {
        console.error(`Error syncing month ${monthDocId}:`, error);
      }
    } else {
      removeMonthFromPendingList(monthDocId);
    }
  }
}

// ============================================
// TABLE CREATION & MANAGEMENT
// ============================================

function createTable() {
  const days = getDaysInMonth(currentMonth, currentYear);
  const tbody = uiRefs.workDaysTbody;
  tbody.innerHTML = '';
  
  const today = new Date();
  const isCurrentMonth = (currentMonth === today.getMonth() && currentYear === today.getFullYear());
  const currentDay = isCurrentMonth ? today.getDate() : -1;
  
  for (let i = 1; i <= days; i++) {
    const dayStr = String(i).padStart(2, '0');
    const row = document.createElement('tr');
    const isCurrDay = (i === currentDay);
    const isWknd = isWeekend(currentYear, currentMonth, i);
    
    if (isCurrDay) {
      row.classList.add('current-day');
    } else if (isWknd) {
      row.classList.add('weekend-day');
    }
    
    row.innerHTML = `
      <td>${i}. ${getDayName(currentYear, currentMonth, i)}${isCurrDay ? '<span aria-hidden="true" style="font-style:normal;filter:grayscale(0.1) brightness(1.3);">👈</span>' : ''}</td>
      <td>
        <div class="time-input-wrapper">
          <input type="tel" id="start-${dayStr}" maxlength="5" pattern="[0-9:]" inputmode="numeric" placeholder="HH:MM" aria-label="Príchod dňa ${dayStr}" oninput="handleTimeInput(this, 'end-${dayStr}', ${i})" onblur="validateAndFormatTimeBlur(this, ${i}); debouncedSaveWorkDataAndSync()">
          <button class="time-btn" onclick="setCurrentTime('start-${dayStr}', ${i})" title="Zadať aktuálny čas" aria-label="Zadať aktuálny čas pre príchod dňa ${dayStr}">📷</button>
        </div>
      </td>
      <td>
        <div class="time-input-wrapper">
          <input type="tel" id="end-${dayStr}" maxlength="5" pattern="[0-9:]" inputmode="numeric" placeholder="HH:MM" aria-label="Odchod dňa ${dayStr}" oninput="handleTimeInput(this, 'break-${dayStr}', ${i})" onblur="validateAndFormatTimeBlur(this, ${i}); debouncedSaveWorkDataAndSync()">
          <button class="time-btn" onclick="setCurrentTime('end-${dayStr}', ${i})" title="Zadať aktuálny čas" aria-label="Zadať aktuálny čas pre odchod dňa ${dayStr}">📷</button>
        </div>
      </td>
      <td>
        <input type="number" id="break-${dayStr}" min="0" max="999" placeholder="Min" aria-label="Prestávka (minúty) dňa ${dayStr}" oninput="calculateRow(${i}); debouncedSaveWorkDataAndSync()">
      </td>
      <td>
        <input type="number" id="worked-${dayStr}" readonly aria-label="Odpracované hodiny dňa ${dayStr}" tabindex="-1">
      </td>
      <td>
        <input type="text" id="project-${dayStr}" class="project-input" placeholder="Projekt/Úloha" aria-label="Projekt dňa ${dayStr}" maxlength="200" oninput="debouncedSaveWorkDataAndSync()">
      </td>
      <td>
        <textarea id="note-${dayStr}" placeholder="Poznámka..." aria-label="Poznámka pre deň ${dayStr}" maxlength="500" oninput="debouncedSaveWorkDataAndSync()"></textarea>
      </td>
      <td>
        <input type="number" id="gross-${dayStr}" readonly aria-label="Hrubá mzda dňa ${dayStr}" tabindex="-1">
      </td>
      <td>
        <input type="number" id="net-${dayStr}" readonly aria-label="Čistá mzda dňa ${dayStr}" tabindex="-1">
      </td>
      <td>
        <button class="time-btn" onclick="resetRow(${i})" title="Vymazať riadok" aria-label="Vymazať dáta pre deň ${dayStr}">❌</button>
      </td>
    `;
    
    tbody.appendChild(row);
  }
  
  setupFirestoreWorkDataListener();
}

// ============================================
// TIME INPUT FORMATTING & AUTO-ADVANCE
// ============================================

function formatTimeInputOnly(input) {
  const rawValue = input.value;
  let digits = rawValue.replace(/\D/g, '');
  let formattedValue = '';
  
  if (digits.length > 2) {
    formattedValue = digits.substring(0, 2) + ':';
    if (digits.length > 2) {
      formattedValue += digits.substring(2, 4);
    }
  } else if (rawValue.endsWith(':') && digits.length === 2) {
    formattedValue = rawValue;
  } else if (rawValue.length > 2 && digits.length === 2) {
    formattedValue = digits;
  } else {
    formattedValue = digits;
  }
  
  if (input.value !== formattedValue && formattedValue.length <= 5) {
    input.value = formattedValue;
  }
}

window.handleTimeInput = function(input, nextId, day) {
  formatTimeInputOnly(input);
  
  if (input.value.length === 5 && isValidTimeFormat(input.value)) {
    calculateRow(day);
    
    const nextElement = document.getElementById(nextId);
    if (nextElement && document.activeElement === input) {
      if (!nextId.startsWith('break-')) {
        nextElement.focus();
        if (typeof nextElement.select === 'function') {
          nextElement.select();
        }
      }
    }
  } else if (input.value.length === 5) {
    calculateRow(day);
  }
};

window.validateAndFormatTimeBlur = function(input, day) {
  let value = input.value.trim();
  
  if (!value) {
    input.classList.remove('invalid-time');
    calculateRow(day);
    return;
  }
  
  if (isValidTimeFormat(value)) {
    input.classList.remove('invalid-time');
  } else {
    input.classList.add('invalid-time');
    showWarningNotification(`Neplatný formát času na deň ${day}. Použite formát HH:MM.`);
  }
  
  calculateRow(day);
};

window.setCurrentTime = function(inputId, day) {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeString = `${hours}:${minutes}`;
  
  const input = document.getElementById(inputId);
  if (input) {
    input.value = timeString;
    input.classList.remove('invalid-time');
    calculateRow(day);
    debouncedSaveWorkDataAndSync();
  }
};

// ============================================
// CALCULATIONS
// ============================================

function calculateRow(day) {
  const dayStr = String(day).padStart(2, '0');
  const startInput = document.getElementById(`start-${dayStr}`);
  const endInput = document.getElementById(`end-${dayStr}`);
  const breakInput = document.getElementById(`break-${dayStr}`);
  const workedInput = document.getElementById(`worked-${dayStr}`);
  const grossInput = document.getElementById(`gross-${dayStr}`);
  const netInput = document.getElementById(`net-${dayStr}`);
  
  const start = startInput?.value.trim();
  const end = endInput?.value.trim();
  const breakMinutes = parseInt(breakInput?.value) || 0;
  
  if (!start || !end || !isValidTimeFormat(start) || !isValidTimeFormat(end)) {
    if (workedInput) workedInput.value = '';
    if (grossInput) grossInput.value = '';
    if (netInput) netInput.value = '';
    return;
  }
  
  const [startHour, startMin] = start.split(':').map(Number);
  const [endHour, endMin] = end.split(':').map(Number);
  
  let totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
  
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }
  
  totalMinutes -= breakMinutes;
  
  if (totalMinutes < 0) {
    totalMinutes = 0;
  }
  
  const workedHours = totalMinutes / 60;
  const grossSalary = workedHours * appSettings.hourlyWage;
  const netSalary = grossSalary * (1 - appSettings.taxRate);
  
  if (workedInput) workedInput.value = workedHours.toFixed(appSettings.decimalPlaces);
  if (grossInput) grossInput.value = grossSalary.toFixed(appSettings.decimalPlaces);
  if (netInput) netInput.value = netSalary.toFixed(appSettings.decimalPlaces);
}

function calculateTotal() {
  const days = getDaysInMonth(currentMonth, currentYear);
  let totalWorkedHours = 0;
  let totalGross = 0;
  let totalNet = 0;
  
  for (let i = 1; i <= days; i++) {
    const dayStr = String(i).padStart(2, '0');
    const workedInput = document.getElementById(`worked-${dayStr}`);
    const grossInput = document.getElementById(`gross-${dayStr}`);
    const netInput = document.getElementById(`net-${dayStr}`);
    
    const worked = parseFloat(workedInput?.value) || 0;
    const gross = parseFloat(grossInput?.value) || 0;
    const net = parseFloat(netInput?.value) || 0;
    
    totalWorkedHours += worked;
    totalGross += gross;
    totalNet += net;
  }
  
  let summaryHTML = `
    <div style="font-size: 1.1rem; margin-bottom: 12px;">
      <strong>📊 Celkovo odpracované:</strong> ${totalWorkedHours.toFixed(appSettings.decimalPlaces)} hod
    </div>
    <div style="display: flex; justify-content: space-around; flex-wrap: wrap; gap: 15px; margin-bottom: 12px;">
      <div>
        <strong>💰 Hrubá mzda:</strong> ${totalGross.toFixed(appSettings.decimalPlaces)} €
      </div>
      <div>
        <strong>💵 Čistá mzda:</strong> ${totalNet.toFixed(appSettings.decimalPlaces)} €
      </div>
      <div>
        <strong>🏦 Daň (${(appSettings.taxRate * 100).toFixed(1)}%):</strong> ${(totalGross - totalNet).toFixed(appSettings.decimalPlaces)} €
      </div>
    </div>
  `;
  
  if (appSettings.monthlyEarningsGoal && appSettings.monthlyEarningsGoal > 0) {
    const progressPercent = (totalNet / appSettings.monthlyEarningsGoal) * 100;
    const remaining = appSettings.monthlyEarningsGoal - totalNet;
    
    let progressClass = 'low';
    let progressIcon = '🔴';
    
    if (progressPercent >= 100) {
      progressClass = 'good';
      progressIcon = '🟢';
    } else if (progressPercent >= 70) {
      progressClass = 'medium';
      progressIcon = '🟡';
    }
    
    summaryHTML += `
      <div class="goal-progress ${progressClass}">
        ${progressIcon} <strong>Cieľ:</strong> ${totalNet.toFixed(appSettings.decimalPlaces)} € / ${appSettings.monthlyEarningsGoal.toFixed(appSettings.decimalPlaces)} € (${progressPercent.toFixed(1)}%)
        ${remaining > 0 ? `<br>📈 Zostáva: ${remaining.toFixed(appSettings.decimalPlaces)} €` : '<br>🎉 Cieľ dosiahnutý!'}
      </div>
    `;
  }
  
  uiRefs.totalSalaryDiv.innerHTML = summaryHTML;
}

// ============================================
// ROW ACTIONS
// ============================================

window.resetRow = function(day) {
  if (!confirm(`Naozaj chcete vymazať všetky dáta pre deň ${day}.?`)) {
    return;
  }
  
  const dayStr = String(day).padStart(2, '0');
  const startInput = document.getElementById(`start-${dayStr}`);
  const endInput = document.getElementById(`end-${dayStr}`);
  const breakInput = document.getElementById(`break-${dayStr}`);
  const projectInput = document.getElementById(`project-${dayStr}`);
  const noteTextarea = document.getElementById(`note-${dayStr}`);
  
  if (startInput) startInput.value = '';
  if (endInput) endInput.value = '';
  if (breakInput) breakInput.value = '';
  if (projectInput) projectInput.value = '';
  if (noteTextarea) noteTextarea.value = '';
  
  calculateRow(day);
  debouncedSaveWorkDataAndSync();
  
  showSaveNotification(`Deň ${day}. bol vymazaný.`);
};

// ============================================
// MONTH/YEAR NAVIGATION
// ============================================

window.changeMonth = function() {
  currentMonth = parseInt(uiRefs.monthSelect.value);
  createTable();
  updatePageTitleAndGreeting();
};

window.changeYear = function() {
  currentYear = parseInt(uiRefs.yearSelect.value);
  createTable();
  updatePageTitleAndGreeting();
};

// ============================================
// SETTINGS TOGGLE
// ============================================

if (uiRefs.toggleSettingsBtn) {
  uiRefs.toggleSettingsBtn.addEventListener('click', () => {
    const isVisible = uiRefs.settingsCollapsibleContent.classList.toggle('visible');
    uiRefs.toggleSettingsBtn.textContent = isVisible ? '⚙️ Skryť nastavenia ▲' : '⚙️ Zobraziť nastavenia ▼';
    uiRefs.toggleSettingsBtn.setAttribute('aria-expanded', isVisible);
  });
}

// ============================================
// EXPORT & BACKUP FUNCTIONS
// ============================================

window.exportToPDF = async function() {
  const btn = document.getElementById('exportPDFBtn');
  setLoadingState(btn, true, 'Exportujem PDF...');
  
  try {
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
      throw new Error('jsPDF knižnica nie je načítaná.');
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const monthName = MONTH_NAMES[currentMonth];
    const titleText = `${appSettings.employeeName ? appSettings.employeeName + ' - ' : ''}${monthName} ${currentYear}`;
    
    doc.setFontSize(16);
    doc.text(titleText, 105, 15, { align: 'center' });
    
    const tableData = [];
    const days = getDaysInMonth(currentMonth, currentYear);
    
    for (let i = 1; i <= days; i++) {
      const dayStr = String(i).padStart(2, '0');
      const start = document.getElementById(`start-${dayStr}`)?.value || '';
      const end = document.getElementById(`end-${dayStr}`)?.value || '';
      const breakMin = document.getElementById(`break-${dayStr}`)?.value || '';
      const worked = document.getElementById(`worked-${dayStr}`)?.value || '';
      const project = document.getElementById(`project-${dayStr}`)?.value || '';
      const note = document.getElementById(`note-${dayStr}`)?.value || '';
      const gross = document.getElementById(`gross-${dayStr}`)?.value || '';
      const net = document.getElementById(`net-${dayStr}`)?.value || '';
      
      tableData.push([
        `${i}. ${getDayName(currentYear, currentMonth, i)}`,
        start,
        end,
        breakMin,
        worked,
        project,
        note,
        gross,
        net
      ]);
    }
    
    doc.autoTable({
      startY: 25,
      head: [['Deň', 'Príchod', 'Odchod', 'Prestávka', 'Odprac.', 'Projekt', 'Poznámka', 'Hrubá €', 'Čistá €']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [124, 58, 237], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 18 },
        2: { cellWidth: 18 },
        3: { cellWidth: 15 },
        4: { cellWidth: 18 },
        5: { cellWidth: 30 },
        6: { cellWidth: 35 },
        7: { cellWidth: 18 },
        8: { cellWidth: 18 }
      }
    });
    
    const filename = `${appSettings.employeeName ? appSettings.employeeName.replace(/\s+/g, '_') + '_' : ''}${monthName}_${currentYear}.pdf`;
    doc.save(filename);
    
    showSaveNotification('PDF bol úspešne exportovaný.');
  } catch (error) {
    console.error('Error exporting PDF:', error);
    showErrorNotification('Chyba pri exporte PDF: ' + error.message);
  } finally {
    setLoadingState(btn, false, '📄 Export PDF');
  }
};

window.sendPDF = async function() {
  const btn = document.getElementById('sendPDFBtn');
  setLoadingState(btn, true, 'Pripravujem PDF...');
  
  try {
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
      throw new Error('jsPDF knižnica nie je načítaná.');
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const monthName = MONTH_NAMES[currentMonth];
    const titleText = `${appSettings.employeeName ? appSettings.employeeName + ' - ' : ''}${monthName} ${currentYear}`;
    
    doc.setFontSize(16);
    doc.text(titleText, 105, 15, { align: 'center' });
    
    const tableData = [];
    const days = getDaysInMonth(currentMonth, currentYear);
    
    for (let i = 1; i <= days; i++) {
      const dayStr = String(i).padStart(2, '0');
      const start = document.getElementById(`start-${dayStr}`)?.value || '';
      const end = document.getElementById(`end-${dayStr}`)?.value || '';
      const breakMin = document.getElementById(`break-${dayStr}`)?.value || '';
      const worked = document.getElementById(`worked-${dayStr}`)?.value || '';
      const project = document.getElementById(`project-${dayStr}`)?.value || '';
      const note = document.getElementById(`note-${dayStr}`)?.value || '';
      const gross = document.getElementById(`gross-${dayStr}`)?.value || '';
      const net = document.getElementById(`net-${dayStr}`)?.value || '';
      
      tableData.push([
        `${i}. ${getDayName(currentYear, currentMonth, i)}`,
        start,
        end,
        breakMin,
        worked,
        project,
        note,
        gross,
        net
      ]);
    }
    
    doc.autoTable({
      startY: 25,
      head: [['Deň', 'Príchod', 'Odchod', 'Prestávka', 'Odprac.', 'Projekt', 'Poznámka', 'Hrubá €', 'Čistá €']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [124, 58, 237], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 18 },
        2: { cellWidth: 18 },
        3: { cellWidth: 15 },
        4: { cellWidth: 18 },
        5: { cellWidth: 30 },
        6: { cellWidth: 35 },
        7: { cellWidth: 18 },
        8: { cellWidth: 18 }
      }
    });
    
    const pdfBlob = doc.output('blob');
    const filename = `${appSettings.employeeName ? appSettings.employeeName.replace(/\s+/g, '_') + '_' : ''}${monthName}_${currentYear}.pdf`;
    
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([pdfBlob], filename, { type: 'application/pdf' })] })) {
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });
      await navigator.share({
        files: [file],
        title: titleText,
        text: `Dochádzka za ${monthName} ${currentYear}`
      });
      showSaveNotification('PDF bol úspešne zdieľaný.');
    } else {
      doc.save(filename);
      showWarningNotification('Zdieľanie nie je podporované. PDF bol stiahnutý.');
    }
  } catch (error) {
    console.error('Error sharing PDF:', error);
    showErrorNotification('Chyba pri zdieľaní PDF: ' + error.message);
  } finally {
    setLoadingState(btn, false, '📧 Poslať PDF');
  }
};

window.createBackup = function() {
  const btn = document.getElementById('createBackupBtn');
  setLoadingState(btn, true, 'Vytváram zálohu...');
  
  try {
    if (typeof XLSX === 'undefined') {
      throw new Error('XLSX knižnica nie je načítaná.');
    }
    
    const days = getDaysInMonth(currentMonth, currentYear);
    const data = [['Deň', 'Príchod', 'Odchod', 'Prestávka (min)', 'Odpracované (hod)', 'Projekt', 'Poznámka', 'Hrubá mzda (€)', 'Čistá mzda (€)']];
    
    for (let i = 1; i <= days; i++) {
      const dayStr = String(i).padStart(2, '0');
      data.push([
        `${i}. ${getDayName(currentYear, currentMonth, i)}`,
        document.getElementById(`start-${dayStr}`)?.value || '',
        document.getElementById(`end-${dayStr}`)?.value || '',
        document.getElementById(`break-${dayStr}`)?.value || '',
        document.getElementById(`worked-${dayStr}`)?.value || '',
        document.getElementById(`project-${dayStr}`)?.value || '',
        document.getElementById(`note-${dayStr}`)?.value || '',
        document.getElementById(`gross-${dayStr}`)?.value || '',
        document.getElementById(`net-${dayStr}`)?.value || ''
      ]);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${MONTH_NAMES[currentMonth]} ${currentYear}`);
    
    const filename = `Zaloha_${appSettings.employeeName ? appSettings.employeeName.replace(/\s+/g, '_') + '_' : ''}${MONTH_NAMES[currentMonth]}_${currentYear}.xlsx`;
    XLSX.writeFile(wb, filename);
    
    showSaveNotification('Záloha bola úspešne vytvorená.');
  } catch (error) {
    console.error('Error creating backup:', error);
    showErrorNotification('Chyba pri vytváraní zálohy: ' + error.message);
  } finally {
    setLoadingState(btn, false, '💾 Záloha (XLSX)');
  }
};

window.restoreBackup = function() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx';
  
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        if (typeof XLSX === 'undefined') {
          throw new Error('XLSX knižnica nie je načítaná.');
        }
        
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          const dayStr = String(i).padStart(2, '0');
          
          const startInput = document.getElementById(`start-${dayStr}`);
          const endInput = document.getElementById(`end-${dayStr}`);
          const breakInput = document.getElementById(`break-${dayStr}`);
          const projectInput = document.getElementById(`project-${dayStr}`);
          const noteTextarea = document.getElementById(`note-${dayStr}`);
          
          if (startInput) startInput.value = row[1] || '';
          if (endInput) endInput.value = row[2] || '';
          if (breakInput) breakInput.value = row[3] || '';
          if (projectInput) projectInput.value = row[5] || '';
          if (noteTextarea) noteTextarea.value = row[6] || '';
          
          calculateRow(i);
        }
        
        debouncedSaveWorkDataAndSync();
        showSaveNotification('Záloha bola úspešne obnovená.');
      } catch (error) {
        console.error('Error restoring backup:', error);
        showErrorNotification('Chyba pri obnovovaní zálohy: ' + error.message);
      }
    };
    
    reader.readAsArrayBuffer(file);
  };
  
  input.click();
};

window.saveToFirestore = async function() {
  const btn = document.getElementById('saveToFirestoreBtn');
  
  if (!currentUser) {
    showWarningNotification('Musíte byť prihlásený na uloženie do cloudu.');
    return;
  }
  
  if (!navigator.onLine) {
    showWarningNotification('Ste offline. Pripojte sa na internet.');
    return;
  }
  
  setLoadingState(btn, true, 'Ukladám...');
  
  try {
    await debouncedSaveWorkDataAndSync.flush();
    showSaveNotification('Dáta boli úspešne uložené do cloudu.');
  } catch (error) {
    console.error('Error manual save:', error);
    showErrorNotification('Chyba pri ukladaní do cloudu: ' + error.message);
  } finally {
    setLoadingState(btn, false, '☁️ Uložiť do cloudu');
  }
};

window.loadFromFirestore = async function() {
  const btn = document.getElementById('loadFromFirestoreBtn');
  
  if (!currentUser) {
    showWarningNotification('Musíte byť prihlásený na načítanie z cloudu.');
    return;
  }
  
  if (!navigator.onLine) {
    showWarningNotification('Ste offline. Pripojte sa na internet.');
    return;
  }
  
  setLoadingState(btn, true, 'Načítavam...');
  
  try {
    const docId = getFirestoreDocId(currentYear, currentMonth);
    const docRef = doc(db, 'users', currentUser.uid, 'workData', docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const firestoreData = docSnap.data();
      const firestoreDataString = JSON.stringify(firestoreData);
      parseAndApplyWorkData(firestoreDataString);
      showSaveNotification('Dáta boli úspešne načítané z cloudu.');
    } else {
      showWarningNotification('Žiadne dáta pre tento mesiac v cloude.');
    }
  } catch (error) {
    console.error('Error loading from Firestore:', error);
    showErrorNotification('Chyba pri načítaní z cloudu: ' + error.message);
  } finally {
    setLoadingState(btn, false, '📥 Načítať z cloudu');
  }
};

window.clearMonthData = function() {
  if (!confirm(`Naozaj chcete vymazať všetky dáta pre ${MONTH_NAMES[currentMonth]} ${currentYear}?`)) {
    return;
  }
  
  clearAllFields();
  calculateTotal();
  debouncedSaveWorkDataAndSync();
  
  showSaveNotification('Všetky dáta pre tento mesiac boli vymazané.');
};

// ============================================
// SERVICE WORKER REGISTRATION
// ============================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('✅ Service Worker registered:', reg.scope))
      .catch(err => console.error('❌ Service Worker registration failed:', err));
  });
}

// ============================================
// AUTH STATE LISTENER
// ============================================

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  
  if (user) {
    console.log('✅ User authenticated:', user.email);
    await loadUserAppSettingsFromFirestore();
    updateUIForAuthStateChange();
    createTable();
    syncPendingWorkData();
  } else {
    console.log('❌ User not authenticated');
    currentUser = null;
    updateUIForAuthStateChange();
    createTable();
  }
  
  uiRefs.appLoader.style.display = 'none';
  uiRefs.mainContainer.style.display = 'block';
});

// ============================================
// INITIALIZE APP
// ============================================

initializeUI();

console.log('🚀 Bruno\'s Calculator Pro - Ultimate Edition initialized');
