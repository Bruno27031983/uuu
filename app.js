// Importy Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js';
import {
    initializeFirestore, persistentLocalCache, CACHE_SIZE_UNLIMITED,
    collection, doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, writeBatch
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app-check.js';

// POZNÁMKA: TOTO S├Ü PLACEHOLDER K─Ż├ÜČE. Nahra─Ćte vašimi skutočnými k─żúčmi pre produkciu.
const firebaseConfig = {
    apiKey: "AIzaSyBdLtJlduT3iKiGLDJ0UfAakpf6wcresnk",
    authDomain: "uuuuu-f7ef9.firebaseapp.com",
    projectId: "uuuuu-f7ef9",
    storageBucket: "uuuuu-f7ef9.appspot.com",
    messagingSenderId: "456105865458",
    appId: "1:456105865458:web:101f0a4dcb455f174b606b",
};
// POZNÁMKA: TOTO JE PLACEHOLDER K─Ż├ÜČ. Nahra─Ćte vašim skutočným k─żúčom pre produkciu.
const RECAPTCHA_V3_SITE_KEY = "6LczmP0qAAAAAACGalBT9zZekkUr3hLgA2e8o99v";


const app = initializeApp(firebaseConfig);
/*
try {
    const appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
        isTokenAutoRefreshEnabled: true
    });
} catch (e) {
    console.warn("App Check initialization failed.", e);
    showWarningNotification("Inicializácia App Check zlyhala. Niektoré funkcie m├┤┼żu byť obmedzené.");
}
*/
const auth = getAuth(app);

let db;
try {
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({ sizeBytes: CACHE_SIZE_UNLIMITED })
    });
} catch (error) {
    console.warn("Failed to initialize Firestore with persistent cache. Falling back to in-memory cache.", error);
    showWarningNotification("Chyba pri inicializácii offline úlo┼żiska. Dáta nebudú dostupné offline.");
    db = initializeFirestore(app, {}); // Fallback to default (in-memory) cache
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
    btnLogin: document.getElementById('btnLogin'),
    btnRegister: document.getElementById('btnRegister'),
    linkResetPassword: document.getElementById('linkResetPassword'),
    btnLogout: document.getElementById('btnLogout'),
    btnExportPdf: document.getElementById('btnExportPdf'),
    btnSendPdf: document.getElementById('btnSendPdf'),
    btnCreateBackup: document.getElementById('btnCreateBackup'),
    btnRestoreBackup: document.getElementById('btnRestoreBackup'),
    btnClearMonth: document.getElementById('btnClearMonth')
};

const currentDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();

let appSettings = { // Rozš├şrené appSettings
    decimalPlaces: 2, employeeName: '', hourlyWage: 10, taxRate: 0.02,
    theme: 'light', // NOV├ë: 'light' alebo 'dark'
    monthlyEarningsGoal: null // NOV├ë: cie─żová suma alebo null
};

const MONTH_NAMES = ["Január", "Február", "Marec", "Apr├şl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"];
const DAY_NAMES_SHORT = ["Ne", "Po", "Ut", "St", "┼át", "Pi", "So"];
const PENDING_SYNC_MONTHS_LS_KEY = 'pendingSyncMonthsList';

// --- Theme Manager ---
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
        ThemeManager.applyTheme(appSettings.theme);
        if (uiRefs.themeToggleBtn) uiRefs.themeToggleBtn.addEventListener('click', ThemeManager.toggleTheme);
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (!localStorage.getItem('theme')) {
                appSettings.theme = e.matches ? 'dark' : 'light';
                ThemeManager.applyTheme(appSettings.theme);
            }
        });
    },
    applyTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        uiRefs.themeIcon.textContent = theme === 'dark' ? 'ÔśÇ´ŞĆ' : '­čîÖ';
        appSettings.theme = theme;
        if (uiRefs.themeMeta) {
            uiRefs.themeMeta.content = getComputedStyle(document.documentElement).getPropertyValue('--theme-color-meta').trim();
        }
    },
    toggleTheme: () => {
        const newTheme = appSettings.theme === 'light' ? 'dark' : 'light';
        ThemeManager.applyTheme(newTheme);
        saveAppSettingToLocalStorage('theme', newTheme);
        debouncedSaveAppSettingsToFirestore();
    }
};

async function updateAppBadge(count) {
    if ('setAppBadge' in navigator) {
        try {
            if (count > 0) { await navigator.setAppBadge(count); }
            else { await navigator.clearAppBadge(); }
        } catch (error) { console.error('Failed to set app badge:', error); }
    }
}

function getPendingSyncMonths() { const stored = localStorage.getItem(PENDING_SYNC_MONTHS_LS_KEY); return stored ? JSON.parse(stored) : []; }
function savePendingSyncMonths(months) { localStorage.setItem(PENDING_SYNC_MONTHS_LS_KEY, JSON.stringify(months)); updateAppBadge(months.length); }
function addMonthToPendingList(monthDocId) { if (!currentUser) return; let pendingMonths = getPendingSyncMonths(); if (!pendingMonths.includes(monthDocId)) { pendingMonths.push(monthDocId); savePendingSyncMonths(pendingMonths); } }
function removeMonthFromPendingList(monthDocId) { let pendingMonths = getPendingSyncMonths(); const index = pendingMonths.indexOf(monthDocId); if (index > -1) { pendingMonths.splice(index, 1); savePendingSyncMonths(pendingMonths); } }
function getPendingSyncCount() { if (!currentUser) return 0; return getPendingSyncMonths().length; }
function getDaysInMonth(month, year) { return new Date(year, month + 1, 0).getDate(); }
function getDayName(year, month, day) { return DAY_NAMES_SHORT[new Date(year, month, day).getDay()]; }
function isWeekend(year, month, day) { const d = new Date(year, month, day).getDay(); return d === 0 || d === 6; }
const debounce = (func, wait) => { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); }; };
function isValidTimeFormat(timeString) { return typeof timeString === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeString); }

function showNotification(id, message, duration = 3500) { const notification = document.getElementById(id); if (!notification) { console.warn(`Notification element with ID '${id}' not found.`); return; } notification.textContent = message; notification.classList.add('show'); setTimeout(() => notification.classList.remove('show'), duration); }
window.showSaveNotification = (message = 'Dáta boli úspešne ulo┼żené.') => showNotification('saveNotification', message);
window.showErrorNotification = (message) => showNotification('errorNotification', message, 5000);
window.showWarningNotification = (message) => showNotification('warningNotification', message, 4500);

function setLoadingState(button, isLoading, textParam = "Spracúvam...") {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        if (!button.dataset.originalText) { button.dataset.originalText = button.textContent; }
        const spinnerSpan = document.createElement('span'); spinnerSpan.className = 'spinner'; spinnerSpan.setAttribute('role', 'status'); spinnerSpan.setAttribute('aria-hidden', 'true');
        button.textContent = ''; button.appendChild(spinnerSpan); button.appendChild(document.createTextNode(` ${textParam}`)); button.classList.add('is-loading');
    } else {
        button.disabled = false;
        if (button.dataset.originalText) { button.textContent = button.dataset.originalText; delete button.dataset.originalText; }
        else { button.textContent = textParam; }
        button.classList.remove('is-loading');
    }
}

function loadAppSettingsFromLocalStorage() {
    appSettings.decimalPlaces = parseInt(localStorage.getItem('decimalPlaces')) || 2;
    appSettings.employeeName = localStorage.getItem('employeeName') || '';
    appSettings.hourlyWage = parseFloat(localStorage.getItem('hourlyWage')) || 10;
    appSettings.taxRate = parseFloat(localStorage.getItem('taxRate')) || 0.02;
    appSettings.theme = localStorage.getItem('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    appSettings.monthlyEarningsGoal = localStorage.getItem('monthlyEarningsGoal') ? parseFloat(localStorage.getItem('monthlyEarningsGoal')) : null;
}
function saveAppSettingToLocalStorage(key, value) { localStorage.setItem(key, value); appSettings[key] = value; }
async function saveAppSettingsToFirestore() { if (!currentUser || !navigator.onLine) return; const userDocRef = doc(db, 'users', currentUser.uid); try { await setDoc(userDocRef, { appSettings: appSettings }, { merge: true }); } catch (error) { console.error("Error saving app settings to Firestore:", error); showErrorNotification("Nepodarilo sa ulo┼żiť nastavenia aplikácie do cloudu."); } }
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
                    if (key === 'decimalPlaces') appSettings[key] = parseInt(fsSettings[key]);
                    else if (key === 'hourlyWage' || key === 'taxRate' || key === 'monthlyEarningsGoal') appSettings[key] = parseFloat(fsSettings[key]);
                    else if (key === 'theme' && (fsSettings[key] === 'light' || fsSettings[key] === 'dark')) appSettings[key] = fsSettings[key];
                    else appSettings[key] = fsSettings[key];
                }
            });
            if (isNaN(appSettings.monthlyEarningsGoal)) appSettings.monthlyEarningsGoal = null;
            Object.entries(appSettings).forEach(([key, value]) => { if (value !== undefined) localStorage.setItem(key, value); });
            updateSettingsUIInputs();
            ThemeManager.applyTheme(appSettings.theme);
            return true;
        }
    } catch (error) { console.error("Error loading app settings from Firestore:", error); showErrorNotification("Chyba nač├ştania nastaven├ş aplikácie z cloudu."); }
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

function initializeUI() {
    loadAppSettingsFromLocalStorage();
    ThemeManager.init();
    MONTH_NAMES.forEach((name, index) => { const option = document.createElement('option'); option.value = index; option.textContent = name; uiRefs.monthSelect.appendChild(option); });
    const startYear = 2020, endYear = currentDate.getFullYear() + 5;
    for (let year = startYear; year <= endYear; year++) { const option = document.createElement('option'); option.value = year; option.textContent = year; uiRefs.yearSelect.appendChild(option); }
    uiRefs.monthSelect.value = currentMonth; uiRefs.yearSelect.value = currentYear;
    updateSettingsUIInputs(); updatePageTitleAndGreeting(); updateLocalStorageSizeIndicator();
    updateAppBadge(getPendingSyncCount());
    attachGlobalEventListeners();
}

const updateEmployeeName = function () { saveAppSettingToLocalStorage('employeeName', uiRefs.employeeNameInput.value.trim()); updatePageTitleAndGreeting(); debouncedSaveAppSettingsToFirestore(); }
const handleNumericInput = function (inputElement) { let value = inputElement.value; value = value.replace(',', '.'); value = value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'); inputElement.value = value; }

// Attach Global Listeners Function
function attachGlobalEventListeners() {
    if (uiRefs.btnLogin) uiRefs.btnLogin.addEventListener('click', loginUser);
    if (uiRefs.btnRegister) uiRefs.btnRegister.addEventListener('click', registerUser);
    if (uiRefs.linkResetPassword) uiRefs.linkResetPassword.addEventListener('click', (e) => { e.preventDefault(); resetUserPassword(); });
    if (uiRefs.btnLogout) uiRefs.btnLogout.addEventListener('click', logoutUser);

    if (uiRefs.monthSelect) uiRefs.monthSelect.addEventListener('change', changeMonth);
    if (uiRefs.yearSelect) uiRefs.yearSelect.addEventListener('change', changeYear);

    if (uiRefs.btnExportPdf) uiRefs.btnExportPdf.addEventListener('click', exportToPDF);
    if (uiRefs.btnSendPdf) uiRefs.btnSendPdf.addEventListener('click', sendPDF);
    if (uiRefs.btnCreateBackup) uiRefs.btnCreateBackup.addEventListener('click', createBackup);
    if (uiRefs.btnRestoreBackup) uiRefs.btnRestoreBackup.addEventListener('click', restoreBackup);
    if (uiRefs.btnClearMonth) uiRefs.btnClearMonth.addEventListener('click', clearMonthData);

    if (uiRefs.employeeNameInput) uiRefs.employeeNameInput.addEventListener('input', updateEmployeeName);

    if (uiRefs.hourlyWageInput) {
        uiRefs.hourlyWageInput.addEventListener('input', () => handleNumericInput(uiRefs.hourlyWageInput));
        uiRefs.hourlyWageInput.addEventListener('blur', () => handleWageOrTaxOrGoalBlur(uiRefs.hourlyWageInput));
    }
    if (uiRefs.taxRateInput) {
        uiRefs.taxRateInput.addEventListener('input', () => handleNumericInput(uiRefs.taxRateInput));
        uiRefs.taxRateInput.addEventListener('blur', () => handleWageOrTaxOrGoalBlur(uiRefs.taxRateInput));
    }
    if (uiRefs.decimalPlacesSelect) uiRefs.decimalPlacesSelect.addEventListener('change', changeDecimalPlaces);
}

const handleWageOrTaxOrGoalBlur = function (inputElement) {
    let valueString = inputElement.value.replace(',', '.'); let value = parseFloat(valueString);
    const id = inputElement.id; let validChange = true;
    inputElement.classList.remove('invalid-value');
    if (id === 'hourlyWageInput') {
        if (!isNaN(value) && value >= 0) {
            appSettings.hourlyWage = value; inputElement.value = value.toFixed(appSettings.decimalPlaces > 0 ? appSettings.decimalPlaces : 1);
            saveAppSettingToLocalStorage('hourlyWage', appSettings.hourlyWage);
        } else { inputElement.value = (appSettings.hourlyWage || 0).toFixed(appSettings.decimalPlaces > 0 ? appSettings.decimalPlaces : 1); showErrorNotification("Neplatná hodinová mzda."); inputElement.classList.add('invalid-value'); validChange = false; }
    } else if (id === 'taxRateInput') {
        if (!isNaN(value) && value >= 0 && value <= 100) {
            appSettings.taxRate = value / 100; inputElement.value = value.toFixed(1);
            saveAppSettingToLocalStorage('taxRate', appSettings.taxRate);
        } else { inputElement.value = ((appSettings.taxRate || 0) * 100).toFixed(1); showErrorNotification("Neplatné daňové percento."); inputElement.classList.add('invalid-value'); validChange = false; }
    }
    if (validChange) { recalculateAllRowsAndUpdateTotal(); debouncedSaveAppSettingsToFirestore(); }
}

window.changeDecimalPlaces = function () {
    saveAppSettingToLocalStorage('decimalPlaces', parseInt(uiRefs.decimalPlacesSelect.value));
    const currentWage = typeof appSettings.hourlyWage === 'number' ? appSettings.hourlyWage : 0;
    uiRefs.hourlyWageInput.value = currentWage.toFixed(appSettings.decimalPlaces > 0 ? appSettings.decimalPlaces : 1);
    recalculateAllRowsAndUpdateTotal(); debouncedSaveAppSettingsToFirestore();
}
function recalculateAllRowsAndUpdateTotal() { const days = getDaysInMonth(currentMonth, currentYear); for (let i = 1; i <= days; i++) calculateRow(i); calculateTotal(); }

function updatePageTitleAndGreeting() {
    const wavingHand = "­čĹő"; const namePart = appSettings.employeeName ? `${appSettings.employeeName.split(' ')[0]}` : "";
    uiRefs.mainTitle.textContent = `Vitaj${namePart ? ' ' + namePart : ''} ${wavingHand}`;
    const monthName = MONTH_NAMES[currentMonth]; const titleNamePart = appSettings.employeeName ? `${appSettings.employeeName} - ` : "";
    document.title = `${titleNamePart}${monthName} ${currentYear} | Bruno's Calc Pro+`; uiRefs.subTitle.textContent = `${monthName} ${currentYear}`;
}
function updateLocalStorageSizeIndicator() {
    let total = 0; for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); total += (key.length + (localStorage.getItem(key)?.length || 0)) * 2; }
    uiRefs.localStorageIndicator.textContent = `Lokálne ulo┼żené: ~${(total / 1024).toFixed(1)}KB`;
}

const authErrorMap = {
    'auth/invalid-email': 'Neplatný formát emailu.', 'auth/user-disabled': 'Tento účet bol deaktivovaný.',
    'auth/user-not-found': 'Pou┼ż├şvate─ż s týmto emailom nebol nájdený.', 'auth/wrong-password': 'Nesprávne heslo.',
    'auth/email-already-in-use': 'Tento email je u┼ż zaregistrovaný.', 'auth/weak-password': 'Heslo je pr├şliš slabé (mus├ş mať aspoň 6 znakov).',
    'auth/requires-recent-login': 'Vy┼żaduje sa nedávne prihlásenie. Odhláste sa a prihláste znova.',
    'auth/network-request-failed': 'Chyba sieťového pripojenia. Skontrolujte internetové pripojenie.',
    'auth/too-many-requests': 'Pr├şliš ve─ża neúspešných pokusov o prihlásenie. Skúste nesk├┤r.', 'auth/missing-email': 'Pros├şm, zadajte emailovú adresu.',
};
function mapFirebaseAuthError(code) { return authErrorMap[code] || `Neznáma chyba (${code}). Skúste pros├şm znova.`; }
window.loginUser = async function () {
    const btn = event.target; setLoadingState(btn, true, "Prihlasujem...");
    if (!navigator.onLine) { showErrorNotification('Ste offline. Prihlásenie je mo┼żné iba v online re┼żime.'); setLoadingState(btn, false, "Prihlásiť sa"); return; }
    const email = document.getElementById('email').value; const password = document.getElementById('password').value;
    if (!email || !password) { showErrorNotification('Pros├şm, zadajte email aj heslo.'); setLoadingState(btn, false, "Prihlásiť sa"); return; }
    try { await signInWithEmailAndPassword(auth, email, password); showSaveNotification('├Üspešne prihlásený.'); }
    catch (error) { showErrorNotification('Chyba pri prihlásen├ş: ' + mapFirebaseAuthError(error.code)); }
    finally { setLoadingState(btn, false, "Prihlásiť sa"); }
};
window.registerUser = async function () {
    const btn = event.target; setLoadingState(btn, true, "Registrujem...");
    if (!navigator.onLine) { showErrorNotification('Ste offline. Registrácia je mo┼żná iba v online re┼żime.'); setLoadingState(btn, false, "Registrovať"); return; }
    const email = document.getElementById('email').value; const password = document.getElementById('password').value;
    if (!email || !password) { showErrorNotification('Pros├şm, zadajte email aj heslo.'); setLoadingState(btn, false, "Registrovať"); return; }
    if (password.length < 6) { showErrorNotification('Heslo mus├ş mať aspoň 6 znakov.'); setLoadingState(btn, false, "Registrovať"); return; }
    try {
        await createUserWithEmailAndPassword(auth, email, password); await createUserCollectionAndSettings();
        showSaveNotification('├Üspešne zaregistrovaný a prihlásený.');
    } catch (error) { showErrorNotification('Chyba pri registrácii: ' + mapFirebaseAuthError(error.code)); }
    finally { setLoadingState(btn, false, "Registrovať"); }
};
async function createUserCollectionAndSettings() {
    if (auth.currentUser) {
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        const initialMonthDocId = getFirestoreDocId(currentYear, currentMonth);
        const initialMonthDocRef = doc(db, 'users', auth.currentUser.uid, 'workData', initialMonthDocId);
        const batch = writeBatch(db);
        batch.set(userDocRef, { email: auth.currentUser.email, createdAt: new Date().toISOString(), appSettings: appSettings }, { merge: true });
        batch.set(initialMonthDocRef, { data: [], lastUpdated: new Date().toISOString() }, { merge: true });
        try { await batch.commit(); }
        catch (error) { console.error("Error creating user collection/settings:", error); showErrorNotification('Nepodarilo sa inicializovať pou┼ż├şvate─żské dáta v cloude.'); }
    }
}
window.logoutUser = async function () {
    const btn = event.target; setLoadingState(btn, true, "Odhlasujem...");
    if (currentListenerUnsubscribe) { currentListenerUnsubscribe(); currentListenerUnsubscribe = null; }
    try { await signOut(auth); showSaveNotification('├Üspešne odhlásený.'); }
    catch (error) { showErrorNotification('Chyba pri odhlásen├ş: ' + error.message); }
    finally { setLoadingState(btn, false, "Odhlásiť sa"); }
};
window.resetUserPassword = async function () {
    if (!navigator.onLine) { showErrorNotification('Ste offline. Obnova hesla je mo┼żná iba v online re┼żime.'); return; }
    const emailInput = document.getElementById('email'); const email = emailInput.value;
    if (!email) { emailInput.style.border = '1px solid red'; showErrorNotification('Pros├şm, zadajte Vašu emailovú adresu pre obnovu hesla.'); setTimeout(() => { emailInput.style.border = ''; }, 3000); return; }
    emailInput.style.border = '';
    try { await sendPasswordResetEmail(auth, email); showSaveNotification(`Email na obnovu hesla bol odoslaný na adresu ${email}. Skontrolujte si doručenú poštu.`); }
    catch (error) { showErrorNotification('Chyba pri odosielan├ş emailu na obnovu hesla: ' + mapFirebaseAuthError(error.code)); }
};
function updateUIForAuthStateChange() {
    const isLoggedIn = !!currentUser;
    if (uiRefs.loginFieldset) uiRefs.loginFieldset.style.display = isLoggedIn ? 'none' : 'block';
    uiRefs.userInfo.style.display = isLoggedIn ? 'flex' : 'none';
    if (isLoggedIn && uiRefs.userEmailSpan) uiRefs.userEmailSpan.textContent = `Prihlásený: ${currentUser.email}`;
    const logoutBtn = uiRefs.userInfo.querySelector('.reset-btn');
    if (logoutBtn && logoutBtn.classList.contains('is-loading')) { setLoadingState(logoutBtn, false, "Odhlásiť sa"); }
    updateAppBadge(getPendingSyncCount());
}

function setupFirestoreWorkDataListener() {
    if (currentListenerUnsubscribe) currentListenerUnsubscribe();
    if (!currentUser) { loadWorkDataFromLocalStorage(); return; }
    if (!navigator.onLine) { loadWorkDataFromLocalStorage(); showWarningNotification("Ste offline. Zobrazujem lokálne dáta. Synchronizácia prebehne po pripojen├ş."); return; }
    const docId = getFirestoreDocId(currentYear, currentMonth);
    const docRef = doc(db, 'users', currentUser.uid, 'workData', docId);
    currentListenerUnsubscribe = onSnapshot(docRef, (docSnap) => {
        const localKey = getLocalStorageKeyForWorkData(docId);
        if (docSnap.exists()) {
            const firestoreData = docSnap.data(); const firestoreDataString = JSON.stringify(firestoreData);
            if (!docSnap.metadata.hasPendingWrites || firestoreDataString !== localStorage.getItem(localKey)) {
                localStorage.setItem(localKey, firestoreDataString);
                if (!docSnap.metadata.hasPendingWrites) { removeMonthFromPendingList(docId); const pendingKey = getPendingSyncKeyForMonth(docId); if (pendingKey) localStorage.removeItem(pendingKey); }
                parseAndApplyWorkData(firestoreDataString);
            } else { calculateTotal(); }
        } else {
            if (localStorage.getItem(localKey)) localStorage.removeItem(localKey);
            const pendingKey = getPendingSyncKeyForMonth(docId); if (pendingKey) localStorage.removeItem(pendingKey);
            removeMonthFromPendingList(docId); parseAndApplyWorkData(null);
        }
    }, (error) => { console.error("Firestore listener error:", error); showErrorNotification(`Chyba synchronizácie dát s cloudom: ${error.message}. Zobrazujem lokálne ulo┼żené dáta.`); loadWorkDataFromLocalStorage(); });
    syncPendingWorkData();
}
function getFirestoreDocId(year, month) { return `${year}-${String(month + 1).padStart(2, '0')}`; }
function getLocalStorageKeyForWorkData(docId) { return currentUser ? `workData-${currentUser.uid}-${docId}` : `workData-guest-${docId}`; }
function getPendingSyncKeyForMonth(docId) { return currentUser ? `pendingSync-workData-${currentUser.uid}-${docId}` : null; }

const _debouncedSaveWorkDataAndSync = debounce(async () => {
    const dataToSave = collectWorkDataForStorage(); const docId = getFirestoreDocId(currentYear, currentMonth);
    const localKey = getLocalStorageKeyForWorkData(docId); const dataToSaveString = JSON.stringify(dataToSave);
    localStorage.setItem(localKey, dataToSaveString); updateLocalStorageSizeIndicator();
    if (currentUser) {
        const pendingKey = getPendingSyncKeyForMonth(docId);
        if (navigator.onLine) {
            try { await saveWorkDataToFirestore(dataToSave, docId); removeMonthFromPendingList(docId); if (pendingKey) localStorage.removeItem(pendingKey); }
            catch (error) { addMonthToPendingList(docId); if (pendingKey) localStorage.setItem(pendingKey, dataToSaveString); }
        } else { addMonthToPendingList(docId); if (pendingKey) localStorage.setItem(pendingKey, dataToSaveString); }
    }
    calculateTotal();
}, 1200);
window.debouncedSaveWorkDataAndSync = _debouncedSaveWorkDataAndSync;

function collectWorkDataForStorage() {
    const saveData = { data: [] }; const days = getDaysInMonth(currentMonth, currentYear);
    for (let i = 1; i <= days; i++) {
        saveData.data.push({
            start: document.getElementById(`start-${i}`)?.value || '',
            end: document.getElementById(`end-${i}`)?.value || '',
            breakTime: document.getElementById(`break-${i}`)?.value || '',
            projectTag: document.getElementById(`project-${i}`)?.value || '',
            note: document.getElementById(`note-${i}`)?.value || ''
        });
    }
    saveData.lastUpdated = new Date().toISOString(); return saveData;
}

async function saveWorkDataToFirestore(dataToSave, docId) {
    if (!currentUser) return Promise.reject(new Error("User not logged in."));
    if (!navigator.onLine) return Promise.reject(new Error("Cannot save to Firestore: App is offline."));
    const docRef = doc(db, 'users', currentUser.uid, 'workData', docId);
    try { await setDoc(docRef, dataToSave, { merge: true }); }
    catch (error) { console.error(`Error saving work data to Firestore for doc ${docId}:`, error); throw error; }
}

async function syncPendingWorkData() {
    if (!currentUser || !navigator.onLine) { updateAppBadge(getPendingSyncCount()); return; }
    const pendingMonths = getPendingSyncMonths(); if (pendingMonths.length === 0) { updateAppBadge(0); return; }
    showNotification('saveNotification', `Synchronizujem ${pendingMonths.length} mesiac(ov) s cloudom...`, 2000);
    const successfullySyncedMonths = []; const failedMonths = [];
    for (const monthId of pendingMonths) {
        const pendingKey = getPendingSyncKeyForMonth(monthId); if (!pendingKey) continue;
        const pendingDataString = localStorage.getItem(pendingKey);
        if (pendingDataString) {
            try { const dataToSync = JSON.parse(pendingDataString); dataToSync.lastUpdated = new Date().toISOString(); await saveWorkDataToFirestore(dataToSync, monthId); localStorage.removeItem(pendingKey); successfullySyncedMonths.push(monthId); }
            catch (error) { console.error(`Chyba synchronizácie dát pre mesiac ${monthId}:`, error); failedMonths.push(monthId); }
        } else { successfullySyncedMonths.push(monthId); }
    }
    if (successfullySyncedMonths.length > 0) { let currentPendingList = getPendingSyncMonths(); currentPendingList = currentPendingList.filter(id => !successfullySyncedMonths.includes(id)); savePendingSyncMonths(currentPendingList); }
    const finalPendingCount = getPendingSyncCount();
    if (pendingMonths.length > 0 && finalPendingCount === 0 && failedMonths.length === 0) { showSaveNotification('Všetky lokálne zmeny boli úspešne synchronizované s cloudom.'); }
    else if (finalPendingCount > 0 || failedMonths.length > 0) { showWarningNotification(`Niektoré dáta sa nepodarilo synchronizovať. Zostáva ${finalPendingCount} mesiac(ov) na synchronizáciu.`); }
    updateAppBadge(finalPendingCount);
}

function loadWorkDataFromLocalStorage() { const docId = getFirestoreDocId(currentYear, currentMonth); const localKey = getLocalStorageKeyForWorkData(docId); const localData = localStorage.getItem(localKey); parseAndApplyWorkData(localData); }

function parseAndApplyWorkData(dataString) {
    if (dataString) {
        try {
            const storedWorkData = JSON.parse(dataString);
            if (storedWorkData.data && Array.isArray(storedWorkData.data)) {
                const daysInTable = getDaysInMonth(currentMonth, currentYear);
                storedWorkData.data.slice(0, daysInTable).forEach((dayData, index) => {
                    const dayNum = index + 1;
                    const startEl = document.getElementById(`start-${dayNum}`); if (startEl) startEl.value = dayData.start || '';
                    const endEl = document.getElementById(`end-${dayNum}`); if (endEl) endEl.value = dayData.end || '';
                    const breakEl = document.getElementById(`break-${dayNum}`); if (breakEl) breakEl.value = dayData.breakTime || '';
                    const projectEl = document.getElementById(`project-${dayNum}`); if (projectEl) projectEl.value = dayData.projectTag || '';
                    const noteEl = document.getElementById(`note-${dayNum}`); if (noteEl) { noteEl.value = dayData.note || ''; autoResizeTextarea(noteEl); }
                    calculateRow(dayNum);
                });
            } else { resetTableInputsOnly(); }
        } catch (error) { console.error("Error parsing work data:", error); showErrorNotification('Chyba pri spracovan├ş ulo┼żených dát: ' + error.message); resetTableInputsOnly(); }
    } else { resetTableInputsOnly(); }
    calculateTotal();
}
function resetTableInputsOnly() {
    const daysInTable = getDaysInMonth(currentMonth, currentYear);
    for (let i = 1; i <= daysInTable; i++) {
        const startEl = document.getElementById(`start-${i}`); if (startEl) startEl.value = '';
        const endEl = document.getElementById(`end-${i}`); if (endEl) endEl.value = '';
        const breakEl = document.getElementById(`break-${i}`); if (breakEl) breakEl.value = '';
        const projectEl = document.getElementById(`project-${i}`); if (projectEl) projectEl.value = '';
        const noteEl = document.getElementById(`note-${i}`); if (noteEl) { noteEl.value = ''; autoResizeTextarea(noteEl); }
        calculateRow(i);
    }
}

function createTable() {
    uiRefs.workDaysTbody.innerHTML = ''; const fragment = document.createDocumentFragment();
    const today = new Date(); const currentDayInMonth = today.getDate(), currentMonthIdx = today.getMonth(), currentFullYear = today.getFullYear();
    const days = getDaysInMonth(currentMonth, currentYear);
    for (let i = 1; i <= days; i++) {
        const row = document.createElement('tr'); const dayStr = String(i);
        const isCurrDay = (i === currentDayInMonth && currentMonth === currentMonthIdx && currentYear === currentFullYear);
        if (isCurrDay) row.classList.add('current-day');
        if (isWeekend(currentYear, currentMonth, i)) row.classList.add('weekend-day');
        row.innerHTML = `
                <td>${i}. ${getDayName(currentYear, currentMonth, i)} ${isCurrDay ? '<span aria-hidden="true" style="font-style: normal; filter: grayscale(0.1) brightness(1.3);"> ⭐</span>' : ''}</td>
                <td><div class="time-input-wrapper">
                    <input type="tel" id="start-${dayStr}" maxlength="5" pattern="[0-9:]*" inputmode="numeric" placeholder="HH:MM" aria-label="Pr├şchod dňa ${dayStr}">
                    <button class="time-btn" id="btn-start-${dayStr}" title="Zadať aktuálny čas" aria-label="Zadať aktuálny čas pre pr├şchod dňa ${dayStr}">🕒</button>
                </div></td>
                <td><div class="time-input-wrapper">
                    <input type="tel" id="end-${dayStr}" maxlength="5" pattern="[0-9:]*" inputmode="numeric" placeholder="HH:MM" aria-label="Odchod dňa ${dayStr}">
                    <button class="time-btn" id="btn-end-${dayStr}" title="Zadať aktuálny čas" aria-label="Zadať aktuálny čas pre odchod dňa ${dayStr}">🕒</button>
                </div></td>
                <td><input type="text" inputmode="decimal" id="break-${dayStr}" placeholder="hod." aria-label="Prestávka v hodinách dňa ${dayStr}"></td>
                <td id="total-${dayStr}">0h 0m (${(0).toFixed(appSettings.decimalPlaces)} h)</td>
                <td><input type="text" id="project-${dayStr}" class="project-input" placeholder="Projekt/├Üloha" aria-label="Projekt alebo úloha pre deň ${dayStr}"></td>
                <td><textarea id="note-${dayStr}" placeholder="Poznámka..." aria-label="Poznámka ku dňu ${dayStr}"></textarea></td>
                <td><input type="number" id="gross-${dayStr}" readonly aria-label="Hrubá mzda dňa ${dayStr}" step="0.01"></td>
                <td><input type="number" id="net-${dayStr}" readonly aria-label="Čistá mzda dňa ${dayStr}" step="0.01"></td>
                <td style="text-align:center;"><button class="btn reset-btn" id="btn-reset-${dayStr}" style="padding:4px 6px; font-size:0.8rem;" aria-label="Resetovať údaje pre deň ${dayStr}">X</button></td>`;
        fragment.appendChild(row);

        const startInput = row.querySelector(`#start-${dayStr}`);
        const endInput = row.querySelector(`#end-${dayStr}`);
        const breakInput = row.querySelector(`#break-${dayStr}`);
        const projectInput = row.querySelector(`#project-${dayStr}`);
        const noteInput = row.querySelector(`#note-${dayStr}`);

        const btnStart = row.querySelector(`#btn-start-${dayStr}`);
        const btnEnd = row.querySelector(`#btn-end-${dayStr}`);
        const btnReset = row.querySelector(`#btn-reset-${dayStr}`);

        if (startInput) {
            startInput.addEventListener('input', (e) => handleTimeInput(e.target, `end-${dayStr}`, i));
            startInput.addEventListener('blur', () => { validateAndFormatTimeBlur(startInput, i); debouncedSaveWorkDataAndSync(); });
        }
        if (endInput) {
            endInput.addEventListener('input', (e) => handleTimeInput(e.target, `break-${dayStr}`, i));
            endInput.addEventListener('blur', () => { validateAndFormatTimeBlur(endInput, i); debouncedSaveWorkDataAndSync(); });
        }
        if (breakInput) {
            breakInput.addEventListener('input', () => { handleNumericInput(breakInput); handleBreakLiveInput(breakInput, i); });
            breakInput.addEventListener('blur', () => { validateBreakInputOnBlur(i); debouncedSaveWorkDataAndSync(); });
        }
        if (projectInput) {
            projectInput.addEventListener('input', debouncedSaveWorkDataAndSync);
            projectInput.addEventListener('blur', debouncedSaveWorkDataAndSync);
        }
        if (noteInput) {
            noteInput.addEventListener('input', () => handleNoteInput(noteInput));
            noteInput.addEventListener('blur', debouncedSaveWorkDataAndSync);
        }

        if (btnStart) btnStart.addEventListener('click', () => setCurrentTime(`start-${dayStr}`, i));
        if (btnEnd) btnEnd.addEventListener('click', () => setCurrentTime(`end-${dayStr}`, i));
        if (btnReset) btnReset.addEventListener('click', () => resetRow(dayStr));
    }

    uiRefs.workDaysTbody.appendChild(fragment);
}

window.setCurrentTime = function (inputId, day) {
    const now = new Date(); const hours = now.getHours().toString().padStart(2, '0'); const minutes = now.getMinutes().toString().padStart(2, '0');
    const targetInput = document.getElementById(inputId);
    if (targetInput) { targetInput.value = `${hours}:${minutes}`; targetInput.dispatchEvent(new Event('input', { bubbles: true })); targetInput.dispatchEvent(new Event('blur', { bubbles: true })); }
}
window.handleTimeInput = function (input, nextId, day) {
    formatTimeInputOnly(input);
    if (input.value.length === 5 && isValidTimeFormat(input.value)) {
        calculateRow(day);
        const nextElement = document.getElementById(nextId);
        if (nextElement && document.activeElement === input) { if (!nextId.startsWith('break-')) { nextElement.focus(); if (typeof nextElement.select === 'function') { nextElement.select(); } } }
    } else if (input.value.length < 5) { calculateRow(day); }
}
window.validateAndFormatTimeBlur = function (input, day) {
    formatTimeInputOnly(input); const isValid = isValidTimeFormat(input.value);
    const isDefaultSettingInput = input.id.startsWith('default');
    if (isDefaultSettingInput) { input.classList.toggle('invalid-time', input.value.length > 0 && !isValid); }
    else { input.classList.toggle('invalid-time', input.value.length > 0 && !isValid); if (input.value.length > 0 && !isValid && day) { showWarningNotification(`Neplatný formát času pre ${input.id.startsWith('start') ? 'pr├şchod' : 'odchod'} dňa ${day}. Pou┼żite formát HH:MM.`); } if (day) { calculateRow(day); } }
}
function formatTimeInputOnly(input) {
    const rawValue = input.value; let digits = rawValue.replace(/[^\d]/g, ''); let formattedValue = "";
    if (digits.length >= 2) { formattedValue = `${digits.substring(0, 2)}:`; if (digits.length > 2) { formattedValue += digits.substring(2, 4); } else if (rawValue.endsWith(':') && digits.length === 2) { /* keep "12:" */ } else if (rawValue.length === 2 && digits.length === 2) { formattedValue = digits; } }
    else { formattedValue = digits; }
    if (input.value !== formattedValue && formattedValue.length <= 5) input.value = formattedValue;
}
window.handleBreakLiveInput = function (inputElement, day) { calculateRow(day); }
window.validateBreakInputOnBlur = function (day) {
    const breakInput = document.getElementById(`break-${day}`); let value = breakInput.value.replace(',', '.'); const numericValue = parseFloat(value); breakInput.classList.remove('invalid-value');
    if (value === '' || (!isNaN(numericValue) && numericValue >= 0)) { /* valid */ }
    else { breakInput.value = ''; breakInput.classList.add('invalid-value'); showWarningNotification(`Neplatná hodnota pre prestávku dňa ${day}.`); }
    calculateRow(day);
}
window.handleNoteInput = function (textarea) { autoResizeTextarea(textarea); }
function autoResizeTextarea(textarea) { textarea.style.height = 'auto'; textarea.style.height = Math.max(38, textarea.scrollHeight) + 'px'; }

function calculateRow(day) {
    const startInput = document.getElementById(`start-${day}`); const endTimeInput = document.getElementById(`end-${day}`);
    const breakTimeInput = document.getElementById(`break-${day}`); const totalCell = document.getElementById(`total-${day}`);
    const grossInput = document.getElementById(`gross-${day}`); const netInput = document.getElementById(`net-${day}`);
    if (!totalCell || !grossInput || !netInput) return;
    if (startInput) startInput.classList.remove('invalid-time'); if (endTimeInput) endTimeInput.classList.remove('invalid-time'); if (breakTimeInput) breakTimeInput.classList.remove('invalid-value');
    const startTime = startInput?.value; const endTime = endTimeInput?.value;
    const breakTimeHoursRaw = breakTimeInput?.value.replace(',', '.'); const breakTimeHours = parseFloat(breakTimeHoursRaw) || 0;
    let decimalHours = 0;
    if (isValidTimeFormat(startTime) && isValidTimeFormat(endTime)) {
        const [sH, sM] = startTime.split(':').map(Number); const [eH, eM] = endTime.split(':').map(Number);
        let startDate = new Date(2000, 0, 1, sH, sM, 0); let endDate = new Date(2000, 0, 1, eH, eM, 0);
        if (endDate < startDate) { endDate.setDate(endDate.getDate() + 1); }
        if (!isNaN(breakTimeHours) && breakTimeHours >= 0) { let diffMillis = endDate.getTime() - startDate.getTime(); let totalWorkMinutes = diffMillis / (1000 * 60); totalWorkMinutes -= (breakTimeHours * 60); if (totalWorkMinutes < 0) totalWorkMinutes = 0; decimalHours = totalWorkMinutes / 60; }
        else { if (breakTimeInput && breakTimeHoursRaw.length > 0) breakTimeInput.classList.add('invalid-value'); }
    } else { if (startInput && startTime && startTime.length > 0 && !isValidTimeFormat(startTime)) startInput.classList.add('invalid-time'); if (endTimeInput && endTime && endTime.length > 0 && !isValidTimeFormat(endTime)) endTimeInput.classList.add('invalid-time'); if (breakTimeInput && breakTimeHoursRaw.length > 0 && (isNaN(breakTimeHours) || breakTimeHours < 0)) breakTimeInput.classList.add('invalid-value'); }
    const hoursPart = Math.floor(decimalHours); const minutesPart = Math.round((decimalHours - hoursPart) * 60);
    totalCell.textContent = `${hoursPart}h ${minutesPart}m (${decimalHours.toFixed(appSettings.decimalPlaces)} h)`;
    const currentHourlyWage = typeof appSettings.hourlyWage === 'number' ? appSettings.hourlyWage : 0;
    const currentTaxRate = typeof appSettings.taxRate === 'number' ? appSettings.taxRate : 0;
    const grossSalary = decimalHours * currentHourlyWage; grossInput.value = Math.max(0, grossSalary).toFixed(appSettings.decimalPlaces);
    const netSalary = grossSalary * (1 - currentTaxRate); netInput.value = Math.max(0, netSalary).toFixed(appSettings.decimalPlaces);
}
window.resetRow = function (day) {
    if (!confirm(`Naozaj chcete vymazať záznam pre ${day}. deň? Táto akcia je nezvratná.`)) return;
    const dayStr = String(day); const startEl = document.getElementById(`start-${dayStr}`); if (startEl) startEl.value = '';
    const endEl = document.getElementById(`end-${dayStr}`); if (endEl) endEl.value = '';
    const breakEl = document.getElementById(`break-${dayStr}`); if (breakEl) breakEl.value = '';
    const projectEl = document.getElementById(`project-${dayStr}`); if (projectEl) projectEl.value = '';
    const noteEl = document.getElementById(`note-${dayStr}`); if (noteEl) { noteEl.value = ''; autoResizeTextarea(noteEl); }
    calculateRow(day); debouncedSaveWorkDataAndSync(); showSaveNotification(`Záznam pre ${day}. deň bol úspešne vymazaný.`);
}
window.clearMonthData = async function () {
    const btn = event.target; if (!confirm(`Naozaj chcete vymazať V┼áETKY dáta pre mesiac ${MONTH_NAMES[currentMonth]} ${currentYear}? Táto akcia je nezvratná!`)) return;
    setLoadingState(btn, true, "Mazanie dát..."); resetTableInputsOnly();
    const emptyMonthData = { data: [], lastUpdated: new Date().toISOString() };
    const docId = getFirestoreDocId(currentYear, currentMonth); const localKey = getLocalStorageKeyForWorkData(docId);
    const emptyDataString = JSON.stringify(emptyMonthData); localStorage.setItem(localKey, emptyDataString); updateLocalStorageSizeIndicator();
    const pendingKey = getPendingSyncKeyForMonth(docId);
    if (currentUser) {
        if (navigator.onLine) { try { await saveWorkDataToFirestore(emptyMonthData, docId); removeMonthFromPendingList(docId); if (pendingKey) localStorage.removeItem(pendingKey); } catch (error) { showErrorNotification('Chyba pri mazan├ş dát v cloude: ' + error.message); addMonthToPendingList(docId); if (pendingKey) localStorage.setItem(pendingKey, emptyDataString); } }
        else { addMonthToPendingList(docId); if (pendingKey) localStorage.setItem(pendingKey, emptyDataString); }
    }
    showSaveNotification(`Všetky dáta pre mesiac ${MONTH_NAMES[currentMonth]} ${currentYear} boli úspešne vymazané.`);
    setLoadingState(btn, false, "Vymazať Mesiac");
}

// UPREVENÁ FUNKCIA calculateTotal()
function calculateTotal() {
    let totalExactDecimalHours = 0;
    let totalGrossSalaryCalculated;
    let totalNetSalaryCalculated;
    let daysWithEntries = 0;

    const days = getDaysInMonth(currentMonth, currentYear);
    for (let i = 1; i <= days; i++) {
        const startTime = document.getElementById(`start-${i}`)?.value;
        const endTime = document.getElementById(`end-${i}`)?.value;
        const breakTimeStr = document.getElementById(`break-${i}`)?.value;
        const noteValue = document.getElementById(`note-${i}`)?.value || "";
        const projectValue = document.getElementById(`project-${i}`)?.value || "";

        let dayDecimalHours = 0;

        if (isValidTimeFormat(startTime) && isValidTimeFormat(endTime)) {
            const [sH, sM] = startTime.split(':').map(Number);
            const [eH, eM] = endTime.split(':').map(Number);
            let sDate = new Date(2000, 0, 1, sH, sM);
            let eDate = new Date(2000, 0, 1, eH, eM);
            if (eDate < sDate) eDate.setDate(eDate.getDate() + 1);

            let diffMillis = eDate.getTime() - sDate.getTime();
            let dayWorkMinutes = diffMillis / (1000 * 60);
            const breakHours = parseFloat(breakTimeStr?.replace(',', '.')) || 0;
            if (!isNaN(breakHours) && breakHours >= 0) dayWorkMinutes -= (breakHours * 60);
            if (dayWorkMinutes < 0) dayWorkMinutes = 0;
            dayDecimalHours = dayWorkMinutes / 60;
        }

        totalExactDecimalHours += dayDecimalHours;

        const dailyGrossFromInput = parseFloat(document.getElementById(`gross-${i}`)?.value) || 0;
        if ((isValidTimeFormat(startTime) && isValidTimeFormat(endTime)) || dayDecimalHours > 0 || dailyGrossFromInput > 0 || noteValue.trim() !== "" || projectValue.trim() !== "") {
            daysWithEntries++;
        }
    }

    const currentHourlyWage = typeof appSettings.hourlyWage === 'number' ? appSettings.hourlyWage : 0;
    const currentTaxRate = typeof appSettings.taxRate === 'number' ? appSettings.taxRate : 0;

    totalGrossSalaryCalculated = totalExactDecimalHours * currentHourlyWage;
    totalNetSalaryCalculated = totalGrossSalaryCalculated * (1 - currentTaxRate);

    const totalHoursPart = Math.floor(totalExactDecimalHours);
    const totalMinutesPart = Math.round((totalExactDecimalHours - totalHoursPart) * 60);

    const avgNetSalary = daysWithEntries > 0 ? totalNetSalaryCalculated / daysWithEntries : 0;
    const avgWorkMinutes = daysWithEntries > 0 ? (totalExactDecimalHours * 60) / daysWithEntries : 0;
    const avgHoursPart = Math.floor(avgWorkMinutes / 60);
    const avgMinutesPart = Math.round(avgWorkMinutes % 60);
    const avgDecimalHours = avgWorkMinutes / 60;

    uiRefs.totalSalaryDiv.innerHTML = `
            Započ├ştaných dn├ş s aktivitou: <strong>${daysWithEntries}</strong><br>
            Celkový odpracovaný čas: <strong>${totalHoursPart}h ${totalMinutesPart}m</strong> (${totalExactDecimalHours.toFixed(appSettings.decimalPlaces)} h)<br>
            Celková hrubá mzda: <strong>${totalGrossSalaryCalculated.toFixed(appSettings.decimalPlaces)} €</strong> | Celková čistá mzda: <strong>${totalNetSalaryCalculated.toFixed(appSettings.decimalPlaces)} €</strong><br>
            Priemerná čistá mzda na deň: <strong>${avgNetSalary.toFixed(appSettings.decimalPlaces)} €</strong> | Priemerný čas na deň: <strong>${avgHoursPart}h ${avgMinutesPart}m</strong> (${avgDecimalHours.toFixed(appSettings.decimalPlaces)} h)`;
}
// KONIEC UPRAVENEJ FUNKCIE calculateTotal()


window.exportToPDF = async function () {
    const btn = event.target; setLoadingState(btn, true, "Exportujem PDF..."); calculateTotal();
    const { jsPDF } = window.jspdf; const doc = new jsPDF();
    try {
        try { doc.addFont('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf', 'Roboto', 'normal'); doc.setFont('Roboto'); }
        catch (e) { console.warn("Roboto font not loaded for PDF, using helvetica."); doc.setFont('helvetica'); }
        doc.setFontSize(16); doc.text(`Výkaz práce - ${MONTH_NAMES[currentMonth]} ${currentYear}`, 14, 22);
        doc.setFontSize(12); doc.text(`Pracovn├şk: ${appSettings.employeeName || 'Nezadané'}`, 14, 30);
        const currentHourlyWage = typeof appSettings.hourlyWage === 'number' ? appSettings.hourlyWage : 0;
        const currentTaxRate = typeof appSettings.taxRate === 'number' ? appSettings.taxRate : 0;
        doc.setFontSize(10); doc.text(`Hodinová mzda: ${currentHourlyWage.toFixed(appSettings.decimalPlaces)} €/h, Daňové percento: ${(currentTaxRate * 100).toFixed(1)}%`, 14, 36);
        const tableData = []; const days = getDaysInMonth(currentMonth, currentYear);
        for (let i = 1; i <= days; i++) {
            const dayName = getDayName(currentYear, currentMonth, i); const startTime = document.getElementById(`start-${i}`)?.value || '';
            const endTime = document.getElementById(`end-${i}`)?.value || ''; const breakTime = document.getElementById(`break-${i}`)?.value || '';
            const projectTag = document.getElementById(`project-${i}`)?.value || '';
            const note = document.getElementById(`note-${i}`)?.value || ''; const totalTimeText = document.getElementById(`total-${i}`)?.textContent.trim() || '';
            const grossSalary = parseFloat(document.getElementById(`gross-${i}`)?.value || '0').toFixed(appSettings.decimalPlaces);
            const netSalary = parseFloat(document.getElementById(`net-${i}`)?.value || '0').toFixed(appSettings.decimalPlaces);
            if (startTime || endTime || (breakTime && parseFloat(breakTime.replace(',', '.')) > 0) || projectTag.trim() !== '' || note.trim() !== "") {
                tableData.push([`${i}. ${dayName}`, startTime, endTime, breakTime || '0', totalTimeText, projectTag, note, `${grossSalary} €`, `${netSalary} €`]);
            }
        }
        doc.autoTable({
            head: [['Deň', 'Pr├şchod', 'Odchod', 'Prestávka (h)', 'Odpracované', 'Projekt', 'Poznámka', 'Hrubá (€)', 'Čistá (€)']],
            body: tableData, startY: 42, theme: 'grid',
            styles: { font: doc.getFont().fontName || 'helvetica', fontSize: 7, cellPadding: 1, valign: 'middle' },
            headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
            columnStyles: {
                0: { cellWidth: 14, halign: 'left' }, 1: { cellWidth: 11, halign: 'center' }, 2: { cellWidth: 11, halign: 'center' },
                3: { cellWidth: 12, halign: 'center' }, 4: { cellWidth: 18, halign: 'center' },
                5: { cellWidth: 25, halign: 'left' }, 6: { cellWidth: 'auto', halign: 'left' },
                7: { cellWidth: 14, halign: 'right' }, 8: { cellWidth: 14, halign: 'right' }
            },
            didParseCell: (data) => { if ((data.column.index === 5 || data.column.index === 6) && data.cell.section === 'body') data.cell.styles.cellWidth = 'wrap'; }
        });
        const totalY = doc.lastAutoTable.finalY + 8; doc.setFontSize(9);
        const totalTextContent = uiRefs.totalSalaryDiv.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<div class="goal-progress.*?>.*?<\/div>/gi, '').replace(/<\/?strong>/gi, '').replace(/&nbsp;/g, ' ').replace(/€/g, 'EUR');
        doc.text(totalTextContent, 14, totalY);
        const safeName = (appSettings.employeeName || 'Pracovnik').replace(/[^a-zA-Z0-9]/g, '_');
        doc.save(`Vykaz_Prace_${safeName}_${MONTH_NAMES[currentMonth]}_${currentYear}.pdf`); showSaveNotification('PDF súbor bol úspešne vygenerovaný.');
    } catch (error) { console.error("Error exporting to PDF:", error); showErrorNotification("Nastala chyba pri exporte do PDF: " + error.message); }
    finally { setLoadingState(btn, false, "Exportovať do PDF"); }
}
window.sendPDF = async function () {
    const btn = event.target; setLoadingState(btn, true, "Pripravujem PDF na odoslanie..."); calculateTotal();
    const { jsPDF } = window.jspdf; const doc = new jsPDF();
    try {
        try { doc.addFont('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf', 'Roboto', 'normal'); doc.setFont('Roboto'); }
        catch (e) { console.warn("Roboto font not loaded for PDF, using helvetica."); doc.setFont('helvetica'); }
        doc.setFontSize(16); doc.text(`Preh─żad dochádzky - ${MONTH_NAMES[currentMonth]} ${currentYear}`, 14, 22);
        doc.setFontSize(12); doc.text(`Pracovn├şk: ${appSettings.employeeName || 'Nezadané'}`, 14, 30);
        const workedDaysMatch = (uiRefs.totalSalaryDiv.textContent || "").match(/Započ├ştaných dn├ş s aktivitou:\s*(\d+)/i);
        const workedDaysCount = workedDaysMatch && workedDaysMatch[1] ? parseInt(workedDaysMatch[1]) : 0;
        doc.setFontSize(10); doc.text(`Celkový počet dn├ş s aktivitou: ${workedDaysCount}`, 14, 36);
        const tableData = []; const days = getDaysInMonth(currentMonth, currentYear);
        for (let i = 1; i <= days; i++) {
            const dayName = getDayName(currentYear, currentMonth, i); const startTime = document.getElementById(`start-${i}`)?.value || '';
            const endTime = document.getElementById(`end-${i}`)?.value || ''; const breakTime = document.getElementById(`break-${i}`)?.value || '';
            const projectTag = document.getElementById(`project-${i}`)?.value || '';
            const note = document.getElementById(`note-${i}`)?.value || '';
            if (startTime || endTime || (breakTime && parseFloat(breakTime.replace(',', '.')) > 0) || projectTag.trim() !== '' || note.trim() !== "") {
                tableData.push([`${i}. ${dayName}`, startTime, endTime, breakTime || '0', projectTag, note]);
            }
        }
        doc.autoTable({
            head: [['Deň', 'Pr├şchod', 'Odchod', 'Prestávka (h)', 'Projekt', 'Poznámka']],
            body: tableData, startY: 42, theme: 'grid',
            styles: { font: doc.getFont().fontName || 'helvetica', fontSize: 8, cellPadding: 1.5, valign: 'middle' },
            headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
            columnStyles: {
                0: { cellWidth: 22 }, 1: { cellWidth: 18, halign: 'center' }, 2: { cellWidth: 18, halign: 'center' },
                3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 30 }, 5: { cellWidth: 'auto' }
            },
            didParseCell: (data) => { if ((data.column.index === 4 || data.column.index === 5) && data.cell.section === 'body') data.cell.styles.cellWidth = 'wrap'; }
        });
        const pdfBlob = doc.output('blob'); const safeName = (appSettings.employeeName || 'Pracovnik').replace(/[^a-zA-Z0-9]/g, '_');
        const pdfFileName = `Dochadzka_${safeName}_${MONTH_NAMES[currentMonth]}_${currentYear}.pdf`; const pdfFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
            await navigator.share({ files: [pdfFile], title: `Dochádzka ${MONTH_NAMES[currentMonth]} ${currentYear}`, text: `Záznam dochádzky pre pracovn├şka ${appSettings.employeeName || 'Nezadané'}.` });
        } else { showWarningNotification('Zdie─żanie súborov nie je podporované. Súbor sa stiahne.'); doc.save(pdfFileName); }
    } catch (error) { if (error.name !== 'AbortError') { console.error("Error sharing PDF:", error); showErrorNotification('Nastala chyba pri zdie─żan├ş PDF: ' + error.message); } }
    finally { setLoadingState(btn, false, "Odoslať PDF (s pozn.)"); }
}

window.createBackup = function () {
    const btn = event.target; setLoadingState(btn, true, "Vytváram zálohu..."); const workData = collectWorkDataForStorage();
    if (!workData.data.some(d => d.start || d.end || d.breakTime || d.projectTag || d.note) && !appSettings.employeeName && Object.values(appSettings).every(val => val === '' || val === 0 || val === 2 || val === null || val === 'light')) {
        showWarningNotification('Nie sú zadané ┼żiadne dáta na vytvorenie zálohy.'); setLoadingState(btn, false, "Vytvoriť zálohu (XLSX)"); return;
    }
    try {
        const wb = XLSX.utils.book_new();
        const settings_ws_data = [["Nastavenie", "Hodnota"]];
        Object.entries(appSettings).forEach(([key, value]) => settings_ws_data.push([key, value === null ? "" : value]));
        const settings_ws = XLSX.utils.aoa_to_sheet(settings_ws_data); settings_ws['!cols'] = [{ wch: 25 }, { wch: 30 }]; XLSX.utils.book_append_sheet(wb, settings_ws, "NastaveniaAplikacie");

        const work_ws_data = [["Deň", "Pr├şchod", "Odchod", "Prestávka (h)", "Projekt/├Üloha", "Poznámka"]];
        if (workData.data && Array.isArray(workData.data)) {
            workData.data.forEach((row, index) => work_ws_data.push([`${index + 1}. ${getDayName(currentYear, currentMonth, index + 1)}`, row.start || "", row.end || "", row.breakTime || "", row.projectTag || "", row.note || ""]));
        }
        work_ws_data.push([]); work_ws_data.push(["Mesiac zálohy (index 0-11)", currentMonth]); work_ws_data.push(["Rok zálohy", currentYear]);
        const work_ws = XLSX.utils.aoa_to_sheet(work_ws_data); work_ws['!cols'] = [{ wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 30 }, { wch: 40 }]; XLSX.utils.book_append_sheet(wb, work_ws, `Vykaz ${MONTH_NAMES[currentMonth]} ${currentYear}`);

        const safeName = (appSettings.employeeName || 'VseobecnaZaloha').replace(/[^a-zA-Z0-9]/g, '_');
        XLSX.writeFile(wb, `Zaloha_BrunoCalcPro_${safeName}_${MONTH_NAMES[currentMonth]}_${currentYear}.xlsx`); showSaveNotification('Záloha bola úspešne vytvorená a stiahnutá.');
    } catch (error) { console.error("Error creating backup:", error); showErrorNotification('Nastala chyba pri vytváran├ş zálohy: ' + error.message); }
    finally { setLoadingState(btn, false, "Vytvoriť zálohu (XLSX)"); }
};
window.restoreBackup = function () {
    const btn = event.target; const input = document.createElement('input'); input.type = 'file'; input.accept = '.xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.onchange = async (event) => {
        setLoadingState(btn, true, "Spracúvam súbor zálohy..."); const file = event.target.files[0];
        if (!file) { setLoadingState(btn, false, "Obnoviť zálohu (XLSX)"); return; }
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const fileData = new Uint8Array(e.target.result); const workbook = XLSX.read(fileData, { type: 'array' });
                let restoredAppSettings = {}, restoredWorkDataArray = [], backupMonth = currentMonth, backupYear = currentYear;

                const settingsSheetName = workbook.SheetNames.find(name => name.toLowerCase().includes("nastaveniaaplikacie"));
                if (settingsSheetName) {
                    const ws = workbook.Sheets[settingsSheetName]; const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
                    for (let i = 1; i < jsonData.length; i++) {
                        const row = jsonData[i]; if (row && row[0] !== undefined && appSettings.hasOwnProperty(row[0])) {
                            const key = row[0]; let value = row[1];
                            if (key === 'hourlyWage' || key === 'taxRate' || key === 'monthlyEarningsGoal') value = (value === "" || value === null) ? null : parseFloat(value);
                            else if (key === 'decimalPlaces') value = parseInt(value);
                            else if (key === 'theme' && (value === 'light' || value === 'dark')) { /* value is already string */ }
                            else if (key === 'employeeName') value = String(value);

                            if ((typeof value === 'number' && !isNaN(value)) || typeof value === 'string' || value === null) {
                                restoredAppSettings[key] = value;
                            }
                        }
                    }
                    if (restoredAppSettings.monthlyEarningsGoal !== undefined && isNaN(restoredAppSettings.monthlyEarningsGoal)) restoredAppSettings.monthlyEarningsGoal = null;

                } else showWarningNotification("List 'NastaveniaAplikacie' nebol nájdený. Nastavenia nebudú obnovené.");

                const workSheetName = workbook.SheetNames.find(name => name.toLowerCase().startsWith("vykaz"));
                if (workSheetName) {
                    const ws = workbook.Sheets[workSheetName]; const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
                    const headerRowIndex = jsonData.findIndex(row => row && row[0] && row[0].toString().toLowerCase().includes("deň"));
                    if (headerRowIndex !== -1) {
                        const colMap = { day: 0, start: 1, end: 2, break: 3, project: 4, note: 5 };
                        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                            const row = jsonData[i];
                            if (!row || !row[colMap.day] || !row[colMap.day].toString().match(/^\d+\./)) {
                                if (row && row[0] && row[0].toString().toLowerCase().includes("mesiac zálohy")) backupMonth = parseInt(row[1]);
                                if (row && row[0] && row[0].toString().toLowerCase().includes("rok zálohy")) backupYear = parseInt(row[1]);
                                if (isNaN(backupMonth) || backupMonth < 0 || backupMonth > 11) backupMonth = currentMonth;
                                if (isNaN(backupYear) || backupYear < 2000) backupYear = currentYear;
                                continue;
                            }
                            restoredWorkDataArray.push({ start: row[colMap.start] || "", end: row[colMap.end] || "", breakTime: row[colMap.break] ? row[colMap.break].toString().replace(',', '.') : "", projectTag: row[colMap.project] || "", note: row[colMap.note] || "" });
                        }
                    } else showWarningNotification(`List '${workSheetName}' nemá správnu hlavičku. Dáta mesiaca nebudú obnovené.`);
                } else showWarningNotification("List s dátami mesiaca ('Vykaz...') nebol nájdený. Dáta nebudú obnovené.");

                if (Object.keys(restoredAppSettings).length === 0 && restoredWorkDataArray.length === 0 && !workSheetName && !settingsSheetName) { showErrorNotification("Záloha neobsahuje platné dáta alebo má nesprávny formát."); setLoadingState(btn, false, "Obnoviť zálohu (XLSX)"); return; }
                const confirmMsg = `Obnoviť dáta? ${Object.keys(restoredAppSettings).length > 0 ? 'Nastavenia budú aktualizované. ' : ''}${restoredWorkDataArray.length > 0 || workSheetName ? `Dáta pre ${MONTH_NAMES[backupMonth]} ${backupYear} budú obnovené (${restoredWorkDataArray.length} dn├ş). ` : ''}Neulo┼żené zmeny m├┤┼żu byť prep├şsané.`;
                if (!confirm(confirmMsg)) { setLoadingState(btn, false, "Obnoviť zálohu (XLSX)"); return; }

                let settingsChanged = false;
                if (Object.keys(restoredAppSettings).length > 0) {
                    Object.assign(appSettings, restoredAppSettings);
                    Object.entries(appSettings).forEach(([key, value]) => localStorage.setItem(key, value));
                    updateSettingsUIInputs();
                    if (restoredAppSettings.theme) ThemeManager.applyTheme(restoredAppSettings.theme);
                    settingsChanged = true;
                    if (currentUser) debouncedSaveAppSettingsToFirestore();
                }

                let monthDataRestored = false;
                if (restoredWorkDataArray.length > 0 || (workSheetName && restoredWorkDataArray.length === 0)) {
                    monthDataRestored = true;
                    if (backupMonth !== currentMonth || backupYear !== currentYear) {
                        currentMonth = backupMonth; currentYear = backupYear;
                        uiRefs.monthSelect.value = currentMonth; uiRefs.yearSelect.value = currentYear;
                        if (parseInt(uiRefs.yearSelect.value) !== backupYear) changeYear();
                        else if (parseInt(uiRefs.monthSelect.value) !== backupMonth) changeMonth();
                        else { createTable(); setupFirestoreWorkDataListener(); updatePageTitleAndGreeting(); }
                    } else { createTable(); if (currentListenerUnsubscribe) currentListenerUnsubscribe(); setupFirestoreWorkDataListener(); }

                    const workDataToApply = { data: restoredWorkDataArray, lastUpdated: new Date().toISOString() };
                    const workDataString = JSON.stringify(workDataToApply);
                    const restoreMonthDocId = getFirestoreDocId(currentYear, currentMonth);
                    localStorage.setItem(getLocalStorageKeyForWorkData(restoreMonthDocId), workDataString);
                    parseAndApplyWorkData(workDataString);
                    const pendingKey = getPendingSyncKeyForMonth(restoreMonthDocId);
                    if (currentUser) {
                        if (navigator.onLine) { try { await saveWorkDataToFirestore(workDataToApply, restoreMonthDocId); removeMonthFromPendingList(restoreMonthDocId); if (pendingKey) localStorage.removeItem(pendingKey); } catch (error) { addMonthToPendingList(restoreMonthDocId); if (pendingKey) localStorage.setItem(pendingKey, workDataString); } }
                        else { addMonthToPendingList(restoreMonthDocId); if (pendingKey) localStorage.setItem(pendingKey, workDataString); }
                    }
                } else if (settingsChanged) { recalculateAllRowsAndUpdateTotal(); }
                showSaveNotification('Záloha bola úspešne obnovená.');
            } catch (error) { console.error("Error restoring backup:", error); showErrorNotification('Chyba pri obnove zálohy: ' + error.message); }
            finally { setLoadingState(btn, false, "Obnoviť zálohu (XLSX)"); input.value = ''; }
        };
        reader.onerror = () => { showErrorNotification('Chyba pri č├ştan├ş súboru.'); setLoadingState(btn, false, "Obnoviť zálohu (XLSX)"); }
        reader.readAsArrayBuffer(file);
    };
    input.click();
};

window.changeMonth = function () { currentMonth = parseInt(uiRefs.monthSelect.value); createTable(); setupFirestoreWorkDataListener(); updatePageTitleAndGreeting(); }
window.changeYear = function () { currentYear = parseInt(uiRefs.yearSelect.value); createTable(); setupFirestoreWorkDataListener(); updatePageTitleAndGreeting(); }

uiRefs.toggleSettingsBtn.addEventListener('click', () => {
    const settingsSection = document.getElementById('settings-section');
    const isVisible = settingsSection.style.display !== 'none';
    settingsSection.style.display = isVisible ? 'none' : 'block';
    uiRefs.toggleSettingsBtn.textContent = isVisible ? 'Zobraziť nastavenia aplikácie ▼' : 'Skryť nastavenia aplikácie ▲';
    uiRefs.toggleSettingsBtn.setAttribute('aria-expanded', !isVisible);
});
window.addEventListener('online', () => { handleOnlineStatusChange(true); if (currentUser) { syncPendingWorkData(); debouncedSaveAppSettingsToFirestore(); } });
window.addEventListener('offline', () => { handleOnlineStatusChange(false); });
function handleOnlineStatusChange(online) { const message = online ? 'Ste opäť online. Synchronizácia dát m├┤┼że prebiehať.' : 'Ste offline. Zmeny sa budú ukladať lokálne a synchronizujú sa po pripojen├ş.'; showNotification(online ? 'saveNotification' : 'warningNotification', message, online ? 3000 : 4000); }

onAuthStateChanged(auth, async (user) => {
    currentUser = user; updateUIForAuthStateChange();
    const authContainerElement = document.getElementById('auth-container');
    if (authContainerElement) { authContainerElement.style.display = 'block'; }
    if (user) {
        const settingsLoadedFromFS = await loadUserAppSettingsFromFirestore();
        if (!settingsLoadedFromFS) {
            loadAppSettingsFromLocalStorage();
            updateSettingsUIInputs();
            ThemeManager.applyTheme(appSettings.theme);
            if (navigator.onLine) await saveAppSettingsToFirestore();
        }
        await syncPendingWorkData();
    } else {
        loadAppSettingsFromLocalStorage(); updateSettingsUIInputs();
        ThemeManager.applyTheme(appSettings.theme);
        localStorage.removeItem(PENDING_SYNC_MONTHS_LS_KEY); updateAppBadge(0);
    }
    createTable(); setupFirestoreWorkDataListener(); updatePageTitleAndGreeting();
    if (uiRefs.appLoader) uiRefs.appLoader.style.display = 'none';
    if (uiRefs.mainContainer) uiRefs.mainContainer.style.display = 'block';
});

initializeUI();
