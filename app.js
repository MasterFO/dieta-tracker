// ============================================================
// DIETA TRACKER — app.js
// ============================================================

// ---- State ----
let selectedDate = todayStr();
let selectedGiornata = null;
let weekData = {}; // { "YYYY-MM-DD": docData }
let currentUser = null;
let viewMonday = null; // lunedì della settimana visualizzata nella tab Settimana

// ---- DOM ready ----
document.addEventListener('DOMContentLoaded', () => {
  // Ascolta i cambi di stato auth PRIMA di tutto
  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      showApp(user);
    } else {
      currentUser = null;
      showLogin();
    }
  });

  // Bottone login Google
  document.getElementById('btnLoginGoogle').addEventListener('click', loginWithGoogle);

  // Bottone logout
  document.getElementById('btnLogout').addEventListener('click', () => {
    auth.signOut();
  });
});

// ============================================================
// AUTH
// ============================================================

const ALLOWED_EMAIL = 'guerzo.andrea@gmail.com';

async function loginWithGoogle() {
  const btn = document.getElementById('btnLoginGoogle');
  btn.disabled = true;
  btn.textContent = 'Accesso in corso…';
  try {
    const result = await auth.signInWithPopup(googleProvider);
    if (result.user.email !== ALLOWED_EMAIL) {
      await auth.signOut();
      document.getElementById('login-error').textContent = '⛔ Accesso non autorizzato per ' + result.user.email;
      btn.disabled = false;
      btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width:20px;vertical-align:middle;margin-right:8px">Accedi con Google';
    }
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width:20px;vertical-align:middle;margin-right:8px">Accedi con Google';
    document.getElementById('login-error').textContent = 'Errore: ' + e.message;
  }
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
}

function showApp(user) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  document.getElementById('user-name').textContent = user.displayName || user.email;
  document.getElementById('user-avatar').src = user.photoURL || '';
  document.getElementById('user-avatar').style.display = user.photoURL ? 'inline-block' : 'none';
  initUI();
  loadWeek();
}

// Riferimento alla collezione dell'utente corrente
function pastiRef() {
  return db.collection('users').doc(currentUser.uid).collection('pasti');
}

// ============================================================
// UTILITY
// ============================================================

// Crea una Date in ora locale (evita lo shift UTC)
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateToStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMondayOfWeek(dateStr) {
  const d = parseLocalDate(dateStr);
  const day = d.getDay(); // 0=dom, 1=lun, ...
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return dateToStr(d);
}

function getWeekDates(mondayStr) {
  const dates = [];
  const mon = parseLocalDate(mondayStr);
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    dates.push(dateToStr(d));
  }
  return dates;
}

function formatDateIT(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function getDayName(dateStr) {
  const names = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  return names[parseLocalDate(dateStr).getDay()];
}

// ============================================================
// FIREBASE CRUD
// ============================================================
async function loadWeek() {
  if (!viewMonday) viewMonday = getMondayOfWeek(selectedDate);
  const weekDates = getWeekDates(viewMonday);
  showLoading(true);
  try {
    const snapshot = await pastiRef()
      .where('data', 'in', weekDates)
      .get();
    weekData = {};
    snapshot.forEach(doc => {
      weekData[doc.data().data] = { id: doc.id, ...doc.data() };
    });
  } catch (e) {
    showToast('Errore caricamento dati: ' + e.message, true);
  }
  showLoading(false);
  renderWeekView();
  renderFormForDate(selectedDate);
  renderAlerts();
}

// Carica una settimana specifica per la tab Settimana (senza cambiare selectedDate)
async function loadViewWeek(monday) {
  viewMonday = monday;
  const weekDates = getWeekDates(viewMonday);
  showLoading(true);
  try {
    const snapshot = await pastiRef()
      .where('data', 'in', weekDates)
      .get();
    weekData = {};
    snapshot.forEach(doc => {
      weekData[doc.data().data] = { id: doc.id, ...doc.data() };
    });
  } catch (e) {
    showToast('Errore caricamento dati: ' + e.message, true);
  }
  showLoading(false);
  renderWeekView();
  renderAlerts();
}

async function savePasto() {
  const btn = document.getElementById('btnSalva');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvataggio...';

  const data = {
    data: selectedDate,
    giornataTipo: selectedGiornata,
    colazione: document.getElementById('txt-colazione').value.trim(),
    pranzo: document.getElementById('txt-pranzo').value.trim(),
    merenda: document.getElementById('txt-merenda').value.trim(),
    cena: document.getElementById('txt-cena').value.trim(),
    note: document.getElementById('txt-note').value.trim(),
    categorie: getSelectedCategories(),
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const existing = weekData[selectedDate];
    if (existing && existing.id) {
      await pastiRef().doc(existing.id).set(data, { merge: true });
    } else {
      const ref = await pastiRef().add(data);
      data.id = ref.id;
    }
    weekData[selectedDate] = data;
    showToast('✅ Pasto salvato!');
    document.getElementById('save-status').textContent = 'Salvato alle ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    renderWeekView();
    renderAlerts();
  } catch (e) {
    showToast('Errore salvataggio: ' + e.message, true);
  }
  btn.disabled = false;
  btn.innerHTML = '💾 Salva pasto';
}

async function deletePasto() {
  const existing = weekData[selectedDate];
  if (!existing || !existing.id) return;
  if (!confirm(`Eliminare i dati di ${formatDateIT(selectedDate)}?`)) return;
  try {
    await pastiRef().doc(existing.id).delete();
    delete weekData[selectedDate];
    showToast('🗑️ Dati eliminati');
    renderFormForDate(selectedDate);
    renderWeekView();
    renderAlerts();
  } catch (e) {
    showToast('Errore eliminazione: ' + e.message, true);
  }
}

function getSelectedCategories() {
  const cats = {};
  document.querySelectorAll('.cat-chip input[type="checkbox"]').forEach(cb => {
    // If any checkbox with this name is checked, mark it true
    if (cb.checked) cats[cb.name] = true;
    else if (!(cb.name in cats)) cats[cb.name] = false;
  });
  return cats;
}

// ============================================================
// ANALISI SETTIMANALE
// ============================================================
const REGOLE = {
  pesce:      { min: 2, max: null, label: 'Pesce', icon: '🐟' },
  legumi:     { min: 2, max: null, label: 'Legumi', icon: '🫘' },
  verdura:    { min: 14, max: null, label: 'Verdura (porz./gg)', icon: '🥦', info: '2 porzioni/giorno' },
  frutta:     { min: 14, max: null, label: 'Frutta (porz./gg)', icon: '🍎', info: '2 porzioni/giorno' },
  carnebianca:{ min: null, max: 3, label: 'Carne bianca', icon: '🍗' },
  carnerossa: { min: null, max: 1, label: 'Carne rossa', icon: '🥩' },
  uova:       { min: 2, max: 4, label: 'Uova', icon: '🥚' },
  formaggi:   { min: null, max: 2, label: 'Formaggi', icon: '🧀' },
  salumi:     { min: null, max: 2, label: 'Salumi', icon: '🥓' },
  dolci:      { min: null, max: 1, label: 'Dolci', icon: '🍰' },
  pizza:      { min: null, max: 1, label: 'Pizza/Pasto libero', icon: '🍕' },
  birra:      { min: null, max: 2, label: 'Birra', icon: '🍺' },
};

function contaCategorie(pasti) {
  const counts = {};
  Object.keys(REGOLE).forEach(k => counts[k] = 0);
  Object.values(pasti).forEach(giorno => {
    if (!giorno || !giorno.categorie) return;
    Object.keys(REGOLE).forEach(k => {
      if (giorno.categorie[k]) counts[k]++;
    });
  });
  return counts;
}

function analizzaSettimana(pasti) {
  const alerts = [];
  const counts = contaCategorie(pasti);
  const giorni = Object.keys(pasti).length;
  const oggi = new Date();
  const giorno_settimana = oggi.getDay(); // 1=lun, 3=mer, 5=ven
  const metaSettimana = giorno_settimana >= 3; // mercoledì in poi

  Object.entries(REGOLE).forEach(([key, regola]) => {
    const val = counts[key];

    // Supera il massimo → ROSSO
    if (regola.max !== null && val > regola.max) {
      alerts.push({
        tipo: 'rosso',
        icon: regola.icon,
        titolo: `${regola.label}: limite superato`,
        testo: `Consumato ${val} volte (max ${regola.max}/settimana)`
      });
      return;
    }

    // Non raggiunge il minimo → GIALLO (solo da metà settimana)
    if (regola.min !== null && val < regola.min) {
      if (metaSettimana && giorni >= 3) {
        alerts.push({
          tipo: 'giallo',
          icon: regola.icon,
          titolo: `${regola.label}: obiettivo a rischio`,
          testo: `Consumato ${val} volte (min ${regola.min}/settimana) — aumenta!`
        });
      }
      return;
    }

    // Verde: tutto ok (solo se c'è un minimo definito)
    if (regola.min !== null && val >= regola.min) {
      if (regola.max === null || val <= regola.max) {
        alerts.push({
          tipo: 'verde',
          icon: regola.icon,
          titolo: `${regola.label}: obiettivo raggiunto`,
          testo: `${val} volte questa settimana ✓`
        });
      }
    }
  });

  if (alerts.length === 0) {
    alerts.push({
      tipo: 'verde',
      icon: '🎉',
      titolo: 'Ottima settimana!',
      testo: 'Nessun avviso per la settimana corrente.'
    });
  }

  return { alerts, counts };
}

// ============================================================
// UI — INIT
// ============================================================
function initUI() {
  // Date picker
  const datePicker = document.getElementById('datePicker');
  datePicker.value = selectedDate;
  datePicker.addEventListener('change', e => {
    selectedDate = e.target.value;
    const newMonday = getMondayOfWeek(selectedDate);
    const firstKey = Object.keys(weekData).find(k => k.length === 10) || selectedDate;
    const currentMonday = getMondayOfWeek(firstKey);
    if (newMonday !== currentMonday) {
      loadWeek();
    } else {
      renderFormForDate(selectedDate);
      renderWeekView();
    }
  });

  // Giornata tipo buttons
  document.querySelectorAll('.giornata-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedGiornata = parseInt(btn.dataset.tipo);
      document.querySelectorAll('.giornata-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateMerendaVisibility();
    });
  });

  // Meal section toggles
  document.querySelectorAll('.meal-header').forEach(header => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('open');
    });
  });

  // Category chips
  document.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const cb = chip.querySelector('input[type="checkbox"]');
      cb.checked = !cb.checked;
      chip.classList.toggle('checked', cb.checked);
    });
  });

  // Save button
  document.getElementById('btnSalva').addEventListener('click', savePasto);

  // Delete button
  document.getElementById('btnElimina').addEventListener('click', deletePasto);

  // Tab navigation
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });

  // Reference day tabs
  document.querySelectorAll('.ref-day-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ref-day-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.ref-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.ref).classList.add('active');
    });
  });

  // Bottoni navigazione settimana
  document.getElementById('btnWeekPrev').addEventListener('click', () => {
    const d = parseLocalDate(viewMonday);
    d.setDate(d.getDate() - 7);
    loadViewWeek(dateToStr(d));
  });
  document.getElementById('btnWeekNext').addEventListener('click', () => {
    const d = parseLocalDate(viewMonday);
    d.setDate(d.getDate() + 7);
    loadViewWeek(dateToStr(d));
  });

  // Open all meal sections by default
  document.querySelectorAll('.meal-section').forEach(s => s.classList.add('open'));
}

function updateMerendaVisibility() {
  const merende = document.getElementById('section-merenda');
  if (selectedGiornata === 1) {
    merende.style.display = 'none';
  } else {
    merende.style.display = '';
  }
}

function showLoading(show) {
  const el = document.getElementById('loading-indicator');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ============================================================
// UI — RENDER FORM
// ============================================================
function renderFormForDate(dateStr) {
  document.getElementById('form-date-label').textContent = `${getDayName(dateStr)} ${formatDateIT(dateStr)}`;
  document.getElementById('save-status').textContent = '';

  const existing = weekData[dateStr];

  // Fill textareas
  document.getElementById('txt-colazione').value = existing?.colazione || '';
  document.getElementById('txt-pranzo').value = existing?.pranzo || '';
  document.getElementById('txt-merenda').value = existing?.merenda || '';
  document.getElementById('txt-cena').value = existing?.cena || '';
  document.getElementById('txt-note').value = existing?.note || '';

  // Giornata tipo
  const tipo = existing?.giornataTipo || null;
  selectedGiornata = tipo;
  document.querySelectorAll('.giornata-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.tipo) === tipo);
  });
  updateMerendaVisibility();

  // Categories
  const cats = existing?.categorie || {};
  document.querySelectorAll('.cat-chip').forEach(chip => {
    const cb = chip.querySelector('input[type="checkbox"]');
    const checked = cats[cb.name] === true;
    cb.checked = checked;
    chip.classList.toggle('checked', checked);
  });

  // Show/hide delete button
  document.getElementById('btnElimina').style.display = (existing && existing.id) ? 'inline-flex' : 'none';
}

// ============================================================
// UI — WEEKLY VIEW
// ============================================================
function renderWeekView() {
  const monday = viewMonday || getMondayOfWeek(selectedDate);
  const weekDates = getWeekDates(monday);
  const container = document.getElementById('week-grid');
  container.innerHTML = '';

  // Etichetta settimana
  const labelEl = document.getElementById('week-label');
  if (labelEl) {
    const sunday = weekDates[6];
    labelEl.textContent = `${formatDateIT(monday)} – ${formatDateIT(sunday)}`;
  }

  // Disabilita "Succ." se siamo già alla settimana corrente o futura
  const todayMonday = getMondayOfWeek(todayStr());
  const btnNext = document.getElementById('btnWeekNext');
  if (btnNext) btnNext.disabled = monday >= todayMonday;

  const wd = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  weekDates.forEach((dateStr, i) => {
    const data = weekData[dateStr];
    const isToday = dateStr === todayStr();
    const isSelected = dateStr === selectedDate;

    const card = document.createElement('div');
    card.className = 'week-day-card' + (isToday ? ' today' : '') + (data ? ' has-data' : '') + (isSelected ? ' selected' : '');
    card.style.outline = isSelected ? '2px solid var(--primary)' : '';

    const d = dateStr.split('-')[2];
    card.innerHTML = `
      <span class="wd-name">${wd[i]}</span>
      <span class="wd-num">${parseInt(d)}</span>
      ${data && data.giornataTipo ? `<span class="wd-tipo">G${data.giornataTipo}</span>` : '<span style="height:18px"></span>'}
      ${data ? '<span class="wd-dot"></span>' : ''}
    `;
    card.addEventListener('click', () => {
      selectedDate = dateStr;
      document.getElementById('datePicker').value = dateStr;
      renderFormForDate(dateStr);
      renderWeekView();
      // Switch to tab "inserisci" if not there
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-tab="tab-inserisci"]').classList.add('active');
      document.getElementById('tab-inserisci').classList.add('active');
    });
    container.appendChild(card);
  });

  renderWeekStats();
}

// ============================================================
// UI — WEEK STATS
// ============================================================
function renderWeekStats() {
  const { counts } = analizzaSettimana(weekData);
  const container = document.getElementById('week-stats');
  container.innerHTML = '';

  const items = [
    { key: 'pesce',       label: 'Pesce',        icon: '🐟', min: 2, max: null },
    { key: 'legumi',      label: 'Legumi',        icon: '🫘', min: 2, max: null },
    { key: 'carnebianca', label: 'Carne bianca',  icon: '🍗', min: null, max: 3 },
    { key: 'carnerossa',  label: 'Carne rossa',   icon: '🥩', min: null, max: 1 },
    { key: 'uova',        label: 'Uova',          icon: '🥚', min: 2, max: 4 },
    { key: 'formaggi',    label: 'Formaggi',      icon: '🧀', min: null, max: 2 },
    { key: 'salumi',      label: 'Salumi',        icon: '🥓', min: null, max: 2 },
    { key: 'dolci',       label: 'Dolci',         icon: '🍰', min: null, max: 1 },
    { key: 'pizza',       label: 'Pizza/Libero',  icon: '🍕', min: null, max: 1 },
    { key: 'birra',       label: 'Birra',         icon: '🍺', min: null, max: 2 },
  ];

  items.forEach(item => {
    const val = counts[item.key];
    const limit = item.max !== null ? item.max : (item.min || 7);
    const pct = Math.min(100, Math.round((val / limit) * 100));

    let fillClass = 'ok';
    if (item.max && val > item.max) fillClass = 'over';
    else if (item.min && val < item.min) fillClass = 'warn';

    const el = document.createElement('div');
    el.className = 'stat-card';
    el.innerHTML = `
      <div style="font-size:1.4rem">${item.icon}</div>
      <div class="stat-value">${val}</div>
      <div class="stat-label">${item.label}</div>
      <div class="stat-bar"><div class="stat-bar-fill ${fillClass}" style="width:${pct}%"></div></div>
      <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem">
        ${item.min ? `min ${item.min}` : ''}${item.min && item.max ? ' · ' : ''}${item.max ? `max ${item.max}` : ''}
      </div>
    `;
    container.appendChild(el);
  });
}

// ============================================================
// UI — ALERTS
// ============================================================
function renderAlerts() {
  const { alerts } = analizzaSettimana(weekData);
  const container = document.getElementById('alerts-container');
  container.innerHTML = '';

  // Sort: rosso first, then giallo, then verde
  const order = { rosso: 0, giallo: 1, verde: 2 };
  alerts.sort((a, b) => order[a.tipo] - order[b.tipo]);

  alerts.forEach(alert => {
    const el = document.createElement('div');
    el.className = `alert ${alert.tipo}`;
    el.innerHTML = `
      <span class="alert-icon">${alert.icon}</span>
      <div>
        <div class="alert-title">${alert.titolo}</div>
        <div class="alert-text">${alert.testo}</div>
      </div>
    `;
    container.appendChild(el);
  });

  // Badge on alerts tab
  const redCount = alerts.filter(a => a.tipo === 'rosso').length;
  const warnCount = alerts.filter(a => a.tipo === 'giallo').length;
  const badge = document.getElementById('alerts-badge');
  if (badge) {
    if (redCount > 0) {
      badge.textContent = redCount;
      badge.className = 'badge badge-red';
      badge.style.display = 'inline-flex';
    } else if (warnCount > 0) {
      badge.textContent = warnCount;
      badge.className = 'badge badge-yellow';
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }
}
