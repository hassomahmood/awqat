document.addEventListener("DOMContentLoaded", function() {

// ── Config ───────────────────────────────────────────────────────────────────
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001'
  : 'https://awqat-chi.vercel.app';

const PRAYERS = [
  { key:'fajr',    ar:'الفجر',  en:'Fajr',    color:'#7eb8d4', theme:'fajr'    },
  { key:'sunrise', ar:'الشروق', en:'Sunrise',  color:'#f6c958', theme:'sunrise' },
  { key:'dhuhr',   ar:'الظهر',  en:'Dhuhr',   color:'#8ab87e', theme:'dhuhr'   },
  { key:'asr',     ar:'العصر',  en:'Asr',     color:'#e8a85a', theme:'asr'     },
  { key:'maghrib', ar:'المغرب', en:'Maghrib',  color:'#e8856a', theme:'maghrib' },
  { key:'isha',    ar:'العشاء', en:'Isha',    color:'#9b8fcf', theme:'isha'    },
];

// ── State ────────────────────────────────────────────────────────────────────
let appData      = null;
let activeFiqh   = 'hanafi';
let currentCity, currentCountry;
let clockInterval;
let notifEnabled = false;
let notifGranted = false;
let firedToday   = new Set();
let cityTimezone = null;
let lastTheme    = null;
let lastActiveI  = -1;

// ── Timezone helpers ─────────────────────────────────────────────────────────
function nowInTZ(tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz || Intl.DateTimeFormat().resolvedOptions().timeZone,
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(new Date());
  const get = (t) => parseInt(parts.find(p => p.type === t).value);
  return { h: get('hour'), m: get('minute'), s: get('second') };
}
function nowMinsInTZ(tz) {
  const { h, m } = nowInTZ(tz);
  return h * 60 + m;
}
function nowHHMMInTZ(tz) {
  const { h, m } = nowInTZ(tz);
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
}

// ── City list ────────────────────────────────────────────────────────────────
let allCities = [];
async function loadCityList() {
  try {
    const res = await fetch(API_BASE + '/api/cities');
    allCities = await res.json();
  } catch { allCities = []; }
  renderCityList(allCities);
}

function renderCityList(cities) {
  const el = document.getElementById('city-list');
  if (!cities.length) {
    el.innerHTML = '<div style="padding:16px;color:#7a8e7c;font-size:13px;text-align:center">No cities found</div>';
    return;
  }
  const groups = {};
  cities.forEach(function(c) {
    if (!groups[c.region]) groups[c.region] = [];
    groups[c.region].push(c);
  });
  var html = '';
  Object.entries(groups).forEach(function(entry) {
    var region = entry[0], list = entry[1];
    html += '<div class="city-group-label">' + region + '</div>';
    list.forEach(function(c) {
      html += '<div class="city-item" data-city="' + c.city + '" data-country="' + c.country + '"><span class="city-name">' + c.label + '</span><span class="city-arrow">›</span></div>';
    });
  });
  el.innerHTML = html;
  el.querySelectorAll('.city-item').forEach(function(item) {
    item.addEventListener('click', function() { selectCity(item.dataset.city, item.dataset.country); });
  });
}

// ── City picker ──────────────────────────────────────────────────────────────
document.getElementById('city-search').addEventListener('input', function() {
  var q = this.value.toLowerCase();
  renderCityList(allCities.filter(function(c) {
    return c.city.toLowerCase().includes(q) || c.region.toLowerCase().includes(q);
  }));
});
document.getElementById('manual-go').addEventListener('click', function() {
  var city    = document.getElementById('manual-city').value.trim();
  var country = document.getElementById('manual-country').value.trim().toUpperCase() || 'PK';
  if (city) selectCity(city, country);
});
document.getElementById('manual-city').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('manual-go').click();
});
document.getElementById('change-city-btn').addEventListener('click', function() {
  document.getElementById('city-overlay').classList.remove('hidden');
  document.getElementById('city-search').value = '';
  renderCityList(allCities);
  setTimeout(function() { document.getElementById('city-search').focus(); }, 100);
});
document.getElementById('retry-btn').addEventListener('click', function() {
  if (currentCity) fetchTimes(currentCity, currentCountry);
});
function selectCity(city, country) {
  document.getElementById('city-overlay').classList.add('hidden');
  currentCity    = city;
  currentCountry = country;
  fetchTimes(city, country);
}

// ── Fetch ────────────────────────────────────────────────────────────────────
async function fetchTimes(city, country) {
  showState('loading');
  document.getElementById('current-city-label').textContent = city;
  try {
    var res  = await fetch(API_BASE + '/api/times?city=' + encodeURIComponent(city) + '&country=' + encodeURIComponent(country));
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch');
    appData = data;
    lastActiveI = -1;
    renderAll(data);
    showState('data');
    startClock(data);
  } catch(err) {
    document.getElementById('error-msg').textContent = err.message;
    showState('error');
  }
}

// ── Tahajjud calculation ─────────────────────────────────────────────────────
function calcTahajjud(src) {
  var ishaM    = toMins(src.isha);
  var fajrM    = toMins(src.fajr);
  var maghM    = toMins(src.maghrib);
  var nightDur = fajrM - maghM;
  if (nightDur < 0) nightDur += 1440;
  var startM     = (ishaM + 60) % 1440;
  var lastThirdM = (maghM + Math.floor(nightDur * 2 / 3)) % 1440;
  var endM       = (fajrM - 15 + 1440) % 1440;
  return { start: minsToHHMM(startM), lastThird: minsToHHMM(lastThirdM), end: minsToHHMM(endM), startM: startM, lastThirdM: lastThirdM, endM: endM };
}

function minsToHHMM(m) {
  var h = Math.floor(m / 60) % 24;
  var min = m % 60;
  return String(h).padStart(2,'0') + ':' + String(min).padStart(2,'0');
}

function isTahajjudActive(t, nowMins) {
  var s = t.startM, e = t.endM;
  if (s > e) return nowMins >= s || nowMins <= e;
  return nowMins >= s && nowMins <= e;
}

// ── Render all ───────────────────────────────────────────────────────────────
function renderAll(data) {
  cityTimezone = data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  document.getElementById('hero-city').textContent = data.city;
  document.getElementById('hero-city-sub').textContent = data.country + '  ·  ' + cityTimezone;
  renderHijri(data);
  renderRamadan(data);
  renderTahajjud(data);
  renderPrayerCards();
  renderCompareTable();
}

function renderHijri(data) {
  var h = data.date.hijri;
  document.getElementById('hijri-date').textContent = h.day + ' ' + h.month.en + ' ' + h.year + ' AH';
  var note = h.adjustment !== 0
    ? '  ·  Local moon sighting (' + (h.adjustment > 0 ? '+' : '') + h.adjustment + 'd from Saudi)' : '';
  document.getElementById('hijri-en').textContent =
    h.month.ar + ' ' + h.year + '  ·  ' + data.date.gregorian.weekday + ', ' + data.date.gregorian.day + ' ' + data.date.gregorian.month + ' ' + data.date.gregorian.year + note;
}

function renderRamadan(data) {
  var h = data.date.hijri;
  if (h.isRamadan) {
    document.getElementById('ramadan-banner').classList.add('visible');
    document.getElementById('ramadan-day-ar').textContent = 'اليوم ' + h.day + ' من رمضان';
    document.getElementById('sehr-hanafi').textContent     = data.hanafi.imsak;
    document.getElementById('sehr-hanafi-12').textContent  = to12(data.hanafi.imsak);
    document.getElementById('sehr-jafari').textContent     = data.jafari.imsak;
    document.getElementById('sehr-jafari-12').textContent  = to12(data.jafari.imsak);
    document.getElementById('iftar-hanafi').textContent    = data.hanafi.maghrib;
    document.getElementById('iftar-hanafi-12').textContent = to12(data.hanafi.maghrib);
    document.getElementById('iftar-jafari').textContent    = data.jafari.maghrib;
    document.getElementById('iftar-jafari-12').textContent = to12(data.jafari.maghrib);
  } else {
    document.getElementById('ramadan-banner').classList.remove('visible');
  }
}

function renderTahajjud(data) {
  var t = calcTahajjud(data.hanafi);
  document.getElementById('tahajjud-start').textContent         = t.start;
  document.getElementById('tahajjud-start-12').textContent      = to12(t.start);
  document.getElementById('tahajjud-last-third').textContent    = t.lastThird;
  document.getElementById('tahajjud-last-third-12').textContent = to12(t.lastThird);
  document.getElementById('tahajjud-end').textContent           = t.end;
  document.getElementById('tahajjud-end-12').textContent        = to12(t.end);
  document.getElementById('tahajjud-card').classList.add('visible');
}

// ── Prayer cards ─────────────────────────────────────────────────────────────
function renderPrayerCards() {
  if (!appData) return;
  var nowMins = nowMinsInTZ(cityTimezone);
  var src     = activeFiqh === 'jafari' ? appData.jafari : appData.hanafi;
  var src2    = activeFiqh === 'both'   ? appData.jafari : null;
  var activeI = getActiveIndex(src, nowMins);

  if (activeI === lastActiveI && document.getElementById('prayers-grid').children.length === PRAYERS.length) {
    updateCardStates(activeI);
    return;
  }
  lastActiveI = activeI;

  var grid = document.getElementById('prayers-grid');
  grid.innerHTML = PRAYERS.map(function(p, i) {
    var t      = src[p.key] || '--:--';
    var t2     = src2 ? src2[p.key] : null;
    var active = i === activeI;
    var passed = i < activeI;
    var t2html = t2 ? '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px"><span class="fiqh-badge hanafi" style="margin-right:4px">H</span>' + src[p.key] + ' &nbsp;&nbsp; <span class="fiqh-badge jafari" style="margin-right:4px">J</span>' + t2 + '</div>' : '';
    return '<div class="prayer-card ' + (active?'active':'') + ' ' + (passed?'passed':'') + '" data-idx="' + i + '" style="--prayer-color:' + p.color + '">' +
      (active ? '<div class="now-badge">NOW</div>' : '') +
      '<div class="prayer-arabic">' + p.ar + '</div>' +
      '<div class="prayer-en">' + p.en + '</div>' +
      '<div class="prayer-time24" style="color:' + p.color + '">' + t + '</div>' +
      '<div class="prayer-time12">' + to12(t) + '</div>' +
      t2html + '</div>';
  }).join('');
}

function updateCardStates(activeI) {
  document.querySelectorAll('.prayer-card').forEach(function(card, i) {
    var wasActive = card.classList.contains('active');
    var nowActive = i === activeI;
    if (wasActive !== nowActive) {
      card.classList.toggle('active', nowActive);
      card.classList.toggle('passed', i < activeI);
      if (nowActive && !card.querySelector('.now-badge')) {
        var badge = document.createElement('div');
        badge.className = 'now-badge'; badge.textContent = 'NOW';
        card.prepend(badge);
      } else if (!nowActive) {
        var badge = card.querySelector('.now-badge');
        if (badge) badge.remove();
      }
    }
  });
}

// ── Compare table ─────────────────────────────────────────────────────────────
function renderCompareTable() {
  if (!appData) return;
  var nowMins = nowMinsInTZ(cityTimezone);
  var activeI = getActiveIndex(appData.hanafi, nowMins);
  var tbody   = document.getElementById('compare-tbody');
  tbody.innerHTML = PRAYERS.map(function(p, i) {
    var ht   = appData.hanafi[p.key] || '--:--';
    var jt   = appData.jafari[p.key] || '--:--';
    var diff = timeDiff(ht, jt);
    return '<tr class="' + (i === activeI ? 'active-row' : '') + '">' +
      '<td><div style="display:flex;align-items:center;gap:10px"><div class="prayer-dot" style="background:' + p.color + '"></div><div><div style="font-weight:500">' + p.en + '</div><div class="arabic-small">' + p.ar + '</div></div></div></td>' +
      '<td class="time-cell hanafi-cell">' + ht + '<div style="font-size:11px;color:var(--text3)">' + to12(ht) + '</div></td>' +
      '<td class="time-cell jafari-cell">' + jt + '<div style="font-size:11px;color:var(--text3)">' + to12(jt) + '</div></td>' +
      '<td class="diff-cell">' + diff + '</td></tr>';
  }).join('');
}

// ── Theme engine ──────────────────────────────────────────────────────────────
var THEME_COLORS = {
  tahajjud:'#8090e0', fajr:'#a080d0', sunrise:'#e8a050',
  morning:'#c8940a', dhuhr:'#b8900a', asr:'#e8a040',
  maghrib:'#e06080', isha:'#50a0a8'
};

function getTheme(src, nowMins) {
  if (!src) return 'morning';
  var fajrM    = toMins(src.fajr);
  var sunriseM = toMins(src.sunrise);
  var dhuhrM   = toMins(src.dhuhr);
  var asrM     = toMins(src.asr);
  var maghribM = toMins(src.maghrib);
  var ishaM    = toMins(src.isha);
  var tahStart = (ishaM + 60) % 1440;
  var tahEnd   = (fajrM - 15 + 1440) % 1440;
  var inTah    = tahStart > tahEnd ? (nowMins >= tahStart || nowMins <= tahEnd) : (nowMins >= tahStart && nowMins <= tahEnd);
  if (inTah)                   return 'tahajjud';
  if (nowMins < fajrM)         return 'tahajjud';
  if (nowMins < sunriseM)      return 'fajr';
  if (nowMins < sunriseM + 45) return 'sunrise';
  if (nowMins < dhuhrM)        return 'morning';
  if (nowMins < asrM)          return 'dhuhr';
  if (nowMins < maghribM)      return 'asr';
  if (nowMins < ishaM)         return 'maghrib';
  if (nowMins < ishaM + 60)    return 'isha';
  return 'tahajjud';
}

function applyTheme(theme) {
  if (theme === lastTheme) return;
  lastTheme = theme;
  document.body.setAttribute('data-theme', theme);
  document.body.style.setProperty('--progress-color', THEME_COLORS[theme] || '#d4a017');
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function updateProgressBar(src, nowMins) {
  if (!src) return;
  var activeI = getActiveIndex(src, nowMins);
  var nextI   = (activeI + 1) % PRAYERS.length;
  var fromM   = toMins(src[PRAYERS[activeI].key] || '0:00');
  var toM     = toMins(src[PRAYERS[nextI].key]   || '0:00');
  if (toM <= fromM) toM += 1440;
  var nowAdj = nowMins < fromM ? nowMins + 1440 : nowMins;
  var pct = Math.min(100, Math.max(0, Math.round((nowAdj - fromM) / (toM - fromM) * 100)));
  document.getElementById('prayer-progress-bar').style.setProperty('--progress-pct', pct + '%');
  document.getElementById('progress-from').textContent = PRAYERS[activeI].en;
  document.getElementById('progress-to').textContent   = PRAYERS[nextI].en;
  document.getElementById('progress-pct').textContent  = pct + '%';
}

// ── Ramadan day flip at Maghrib ───────────────────────────────────────────────
function updateRamadanDay(data, nowMins) {
  if (!data.date.hijri.isRamadan) return;
  var maghribM  = toMins(data.hanafi.maghrib);
  var displayDay = nowMins >= maghribM
    ? parseInt(data.date.hijri.day) + 1
    : parseInt(data.date.hijri.day);
  document.getElementById('ramadan-day-ar').textContent = 'اليوم ' + displayDay + ' من رمضان';
}

// ── Tahajjud badge ────────────────────────────────────────────────────────────
function updateTahajjudBadge(data, nowMins) {
  var t      = calcTahajjud(data.hanafi);
  var active = isTahajjudActive(t, nowMins);
  document.getElementById('tahajjud-now-badge').classList.toggle('visible', active);
}

// ── Fiqh tabs ─────────────────────────────────────────────────────────────────
document.querySelectorAll('.fiqh-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.fiqh-tab').forEach(function(b) { b.classList.remove('active','hanafi','jafari'); });
    this.classList.add('active');
    if (this.dataset.fiqh !== 'both') this.classList.add(this.dataset.fiqh);
    activeFiqh = this.dataset.fiqh;
    lastActiveI = -1;
    renderPrayerCards();
  });
});

// ── Clock — drives all real-time updates ─────────────────────────────────────
function startClock(data) {
  if (clockInterval) clearInterval(clockInterval);
  updateClock(data);
  clockInterval = setInterval(function() { updateClock(data); }, 1000);
}

function updateClock(data) {
  var tz = cityTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  var tParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false
  }).formatToParts(new Date());
  var dParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, weekday:'long', day:'numeric', month:'long', year:'numeric'
  }).formatToParts(new Date());

  document.getElementById('hero-clock').textContent =
    tParts.filter(function(p) { return p.type !== 'literal' || p.value === ':'; }).map(function(p) { return p.value; }).join('');
  document.getElementById('hero-date').textContent = dParts.map(function(p) { return p.value; }).join('');

  var sec = parseInt(tParts.find(function(p) { return p.type === 'second'; }).value);
  if (sec === 0) checkAndNotify(appData);
  if (!data) return;

  var nowMins = nowMinsInTZ(tz);
  var src     = appData.hanafi;
  var activeI = getActiveIndex(src, nowMins);
  var nextI   = (activeI + 1) % PRAYERS.length;
  var nextP   = PRAYERS[nextI];
  var nextT   = src[nextP.key] || '--:--';
  var nextM   = toMins(nextT);
  if (nextM <= nowMins) nextM += 1440;
  var diff = nextM - nowMins;
  var h = Math.floor(diff / 60), m = diff % 60;

  document.getElementById('next-name').textContent     = nextP.ar + '  ' + nextP.en;
  document.getElementById('next-time').textContent     = nextT + '  ·  ' + to12(nextT);
  document.getElementById('countdown-val').textContent = h > 0 ? h + 'h ' + m + 'm' : m + 'm';

  // Real-time widget updates every tick
  renderPrayerCards();
  renderCompareTable();
  updateProgressBar(src, nowMins);
  applyTheme(getTheme(src, nowMins));
  updateTahajjudBadge(data, nowMins);
  if (data.date.hijri.isRamadan) updateRamadanDay(data, nowMins);

  // Re-fetch data at Maghrib for next Islamic day
  if (sec === 0 && toMins(src.maghrib) === nowMins) {
    setTimeout(function() { fetchTimes(currentCity, currentCountry); }, 5000);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function to12(t) {
  if (!t || t === '--:--') return '';
  var parts = t.split(':').map(Number);
  var h = parts[0], m = parts[1];
  return (h%12||12) + ':' + String(m).padStart(2,'0') + ' ' + (h >= 12 ? 'PM' : 'AM');
}
function toMins(t) {
  if (!t || t.length < 5) return 0;
  var parts = t.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}
function timeDiff(a, b) {
  var d = toMins(b) - toMins(a);
  if (d === 0) return '—';
  return (d > 0 ? '+' : '−') + Math.abs(d) + 'm';
}
function getActiveIndex(timings, nowMins) {
  var keys = PRAYERS.map(function(p) { return toMins(timings[p.key] || '0:00'); });
  var idx = -1;
  for (var i = keys.length - 1; i >= 0; i--) {
    if (nowMins >= keys[i]) { idx = i; break; }
  }
  return idx === -1 ? keys.length - 1 : idx;
}
function showState(state) {
  document.getElementById('loading-state').style.display = state === 'loading' ? 'flex'  : 'none';
  document.getElementById('error-state').style.display   = state === 'error'   ? 'block' : 'none';
  document.getElementById('data-content').style.display  = state === 'data'    ? 'block' : 'none';
  if (state === 'data') document.getElementById('main-wrap').classList.add('visible');
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadCityList();
initNotifications();

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, duration) {
  duration = duration || 4000;
  var container = document.getElementById('toast-container');
  var toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(function() {
    toast.classList.add('out');
    setTimeout(function() { toast.remove(); }, 350);
  }, duration);
}

// ── Notifications ─────────────────────────────────────────────────────────────
function initNotifications() {
  var btn = document.getElementById('notif-btn');
  if (!('Notification' in window)) { btn.style.display = 'none'; return; }
  if (Notification.permission === 'granted') {
    notifGranted = true; notifEnabled = true; setNotifBtnState('active');
  } else if (Notification.permission === 'denied') {
    setNotifBtnState('denied');
  }
  btn.addEventListener('click', toggleNotifications);
}
async function toggleNotifications() {
  if (Notification.permission === 'denied') {
    showToast('Notifications blocked. Please enable in browser site settings.'); return;
  }
  if (Notification.permission === 'granted') {
    notifGranted = true;
    if (!notifEnabled) {
      notifEnabled = true; setNotifBtnState('active'); showToast('Prayer notifications enabled!');
    } else {
      notifEnabled = false; setNotifBtnState(''); showToast('Notifications disabled.');
    }
    return;
  }
  var perm = await Notification.requestPermission();
  if (perm === 'granted') {
    notifGranted = true; notifEnabled = true; setNotifBtnState('active');
    showToast('Prayer notifications enabled!');
  } else {
    setNotifBtnState('denied'); showToast('Notifications permission denied.');
  }
}
function setNotifBtnState(state) {
  var btn  = document.getElementById('notif-btn');
  var icon = document.getElementById('notif-icon');
  var lbl  = document.getElementById('notif-label');
  btn.className = 'notif-btn' + (state ? ' ' + state : '');
  if (state === 'active')      { icon.textContent = '🔔'; if(lbl) lbl.textContent = 'On'; }
  else if (state === 'denied') { icon.textContent = '🔕'; if(lbl) lbl.textContent = 'Blocked'; }
  else                         { icon.textContent = '🔔'; if(lbl) lbl.textContent = 'Notify'; }
}
function checkAndNotify(data) {
  if (!notifEnabled || !notifGranted || !data) return;
  var tz       = cityTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  var hhmm     = nowHHMMInTZ(tz);
  var todayKey = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit'
  }).format(new Date());
  if (!firedToday._day || firedToday._day !== todayKey) {
    firedToday = new Set(); firedToday._day = todayKey;
  }
  var isRamadan = data.date && data.date.hijri && data.date.hijri.isRamadan;
  var checks = [
    { key:'fajr_h',    time:data.hanafi.fajr,    title:'Fajr (Hanafi)',    body:'Time for Fajr prayer — Hanafi' },
    { key:'fajr_j',    time:data.jafari.fajr,    title:'Fajr (Jafari)',    body:'Time for Fajr prayer — Jafari' },
    { key:'dhuhr_h',   time:data.hanafi.dhuhr,   title:'Dhuhr (Hanafi)',   body:'Time for Dhuhr prayer — Hanafi' },
    { key:'dhuhr_j',   time:data.jafari.dhuhr,   title:'Dhuhr (Jafari)',   body:'Time for Dhuhr prayer — Jafari' },
    { key:'asr_h',     time:data.hanafi.asr,     title:'Asr (Hanafi)',     body:'Time for Asr prayer — Hanafi' },
    { key:'asr_j',     time:data.jafari.asr,     title:'Asr (Jafari)',     body:'Time for Asr prayer — Jafari' },
    { key:'maghrib_h', time:data.hanafi.maghrib,  title:'Maghrib (Hanafi)', body:'Time for Maghrib prayer — Hanafi' },
    { key:'maghrib_j', time:data.jafari.maghrib,  title:'Maghrib (Jafari)', body:'Time for Maghrib prayer — Jafari' },
    { key:'isha_h',    time:data.hanafi.isha,    title:'Isha (Hanafi)',    body:'Time for Isha prayer — Hanafi' },
    { key:'isha_j',    time:data.jafari.isha,    title:'Isha (Jafari)',    body:'Time for Isha prayer — Jafari' },
  ];
  if (isRamadan) {
    checks.push(
      { key:'sehr_h',  time:data.hanafi.imsak,  title:'Sehr ends (Hanafi)',  body:'Suhoor time is ending — Hanafi' },
      { key:'sehr_j',  time:data.jafari.imsak,  title:'Sehr ends (Jafari)',  body:'Suhoor time is ending — Jafari' },
      { key:'iftar_h', time:data.hanafi.maghrib, title:'Iftar time (Hanafi)', body:'Time to break your fast — Hanafi' },
      { key:'iftar_j', time:data.jafari.maghrib, title:'Iftar time (Jafari)', body:'Time to break your fast — Jafari' }
    );
  }
  checks.forEach(function(c) {
    if (!c.time || c.time === '--:--') return;
    var t = c.time.substring(0, 5);
    if (t === hhmm && !firedToday.has(c.key)) {
      firedToday.add(c.key);
      showToast(c.title + ' — ' + t, 6000);
      try { new Notification(c.title, { body:c.body, icon:'icons/icon-192x192.png', tag:c.key }); } catch(e) {}
    }
  });
}

}); // DOMContentLoaded
