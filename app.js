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
  try { localStorage.setItem('awqat_city', JSON.stringify({city, country})); } catch(e) {}
  fetchTimes(city, country);
}
// ── GPS / Current Location ────────────────────────────────────────────────────
document.getElementById('gps-btn').addEventListener('click', function() {
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser.');
    return;
  }
  var btn   = document.getElementById('gps-btn');
  var label = document.getElementById('gps-label');
  btn.classList.add('loading');
  label.textContent = 'Detecting location…';

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      // Reverse-geocode using a free public API
      fetch('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          btn.classList.remove('loading');
          label.textContent = 'Use my current location';
          var addr    = data.address || {};
          // Pick the most specific city-level name available
          var city    = addr.city || addr.town || addr.village || addr.county || addr.state || 'Unknown';
          var country = addr.country_code ? addr.country_code.toUpperCase() : 'PK';
          showToast('Location detected: ' + city + ', ' + country);
          selectCity(city, country);
        })
        .catch(function() {
          btn.classList.remove('loading');
          label.textContent = 'Use my current location';
          showToast('Could not identify your location. Please select manually.');
        });
    },
    function(err) {
      btn.classList.remove('loading');
      label.textContent = 'Use my current location';
      var msg = err.code === 1
        ? 'Location permission denied. Please allow access in browser settings.'
        : 'Could not get your location. Please select manually.';
      showToast(msg);
    },
    { timeout: 10000, maximumAge: 60000 }
  );
});



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
  renderDuas();
  renderTracker();
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

var THEME_META = {"tahajjud":{icon:"☪",label:"Tahajjud"}, "fajr":{icon:"🌌",label:"Fajr"}, "sunrise":{icon:"🌅",label:"Sunrise"}, "morning":{icon:"☀️",label:"Morning"}, "dhuhr":{icon:"🌞",label:"Dhuhr"}, "asr":{icon:"🌇",label:"Asr"}, "maghrib":{icon:"🌆",label:"Maghrib"}, "isha":{icon:"🌙",label:"Isha"}};

function applyTheme(theme) {
  if (theme === lastTheme) return;
  lastTheme = theme;
  document.body.setAttribute('data-theme', theme);
  document.body.style.setProperty('--progress-color', THEME_COLORS[theme] || '#d4a017');
  // Update top-bar indicator
  var meta = THEME_META[theme];
  if (meta) {
    var el = document.getElementById('theme-indicator');
    var ic = document.getElementById('theme-icon');
    var lb = document.getElementById('theme-label');
    if (el) el.style.display = 'flex';
    if (ic) ic.textContent = meta.icon;
    if (lb) lb.textContent = meta.label;
  }
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
initTracker();
initChartYearSel();
initCalendarSelectors();

// Auto-load last city
(function() {
  try {
    var saved = localStorage.getItem('awqat_city');
    if (saved) {
      var c = JSON.parse(saved);
      if (c && c.city && c.country) {
        document.getElementById('city-overlay').classList.add('hidden');
        currentCity    = c.city;
        currentCountry = c.country;
        document.getElementById('current-city-label').textContent = c.city;
        fetchTimes(c.city, c.country);
      }
    }
  } catch(e) {}
})();

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

// ═══════════════════════════════════════════════════════════════
// QIBLA COMPASS
// ═══════════════════════════════════════════════════════════════
var qiblaFetched = false;
function fetchQibla(lat, lng) {
  if (qiblaFetched) return;
  qiblaFetched = true;
  fetch(API_BASE + '/api/qibla?lat=' + lat + '&lng=' + lng)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var deg = data.direction != null ? Math.round(data.direction) : null;
      if (deg === null) return;
      document.getElementById('qibla-section').style.display = 'block';
      document.getElementById('qibla-deg').textContent = deg + '°';
      document.getElementById('qibla-city-from').textContent = 'from ' + (currentCity || '');
      // Rotate needle: needle points to Qibla bearing
      document.getElementById('compass-needle').style.transform = 'rotate(' + deg + 'deg)';
      document.getElementById('compass-kaaba').style.transform =
        'rotate(' + deg + 'deg) translateY(-76px) rotate(-' + deg + 'deg)';
    })
    .catch(function() {});
}

// Try to get Qibla coords from GPS on city load, fallback to geocoding city
function tryFetchQibla() {
  if (!appData) return;
  qiblaFetched = false;
  document.getElementById('qibla-section').style.display = 'none';
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function(pos) { fetchQibla(pos.coords.latitude, pos.coords.longitude); },
      function()    {
        // fallback: use Nominatim to get coords for currentCity
        fetch('https://nominatim.openstreetmap.org/search?city=' + encodeURIComponent(currentCity) +
              '&country=' + encodeURIComponent(currentCountry) + '&format=json&limit=1')
          .then(function(r) { return r.json(); })
          .then(function(d) {
            if (d && d[0]) fetchQibla(d[0].lat, d[0].lon);
          }).catch(function() {});
      },
      { timeout: 5000 }
    );
  } else {
    fetch('https://nominatim.openstreetmap.org/search?city=' + encodeURIComponent(currentCity) +
          '&country=' + encodeURIComponent(currentCountry) + '&format=json&limit=1')
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d && d[0]) fetchQibla(d[0].lat, d[0].lon); })
      .catch(function() {});
  }
}

// ═══════════════════════════════════════════════════════════════
// CONTEXTUAL DUAS
// ═══════════════════════════════════════════════════════════════
var DUAS = {
  tahajjud: [
    { ar: 'اللَّهُمَّ لَكَ الْحَمْدُ أَنْتَ نُورُ السَّمَاوَاتِ وَالْأَرْضِ', en: 'O Allah, to You belongs all praise; You are the Light of the heavens and the earth.', occasion: 'Tahajjud opening' },
    { ar: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً', en: 'Our Lord, give us good in this world and good in the Hereafter.', occasion: 'General supplication' },
    { ar: 'سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا أَنْتَ', en: 'Glory be to You, O Allah, and by Your praise; I testify there is no god but You.', occasion: 'Night dhikr' }
  ],
  fajr: [
    { ar: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا وَرِزْقًا طَيِّبًا وَعَمَلًا مُتَقَبَّلًا', en: 'O Allah, I ask You for beneficial knowledge, pure sustenance, and accepted deeds.', occasion: 'Morning supplication' },
    { ar: 'اللَّهُمَّ بِكَ أَصْبَحْنَا وَبِكَ أَمْسَيْنَا', en: 'O Allah, by Your grace we have reached the morning and the evening.', occasion: 'Morning dhikr' },
    { ar: 'أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ', en: 'I seek refuge in Allah from the accursed devil.', occasion: 'Before Fajr salah' }
  ],
  morning: [
    { ar: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ', en: 'In the name of Allah with Whose name nothing can cause harm.', occasion: 'Morning protection' },
    { ar: 'اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ', en: 'O Allah, You are my Lord. There is no god but You. You created me and I am Your servant.', occasion: 'Sayyid al-Istighfar' },
    { ar: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', en: 'Glory be to Allah and by His praise.', occasion: 'Morning tasbih — 100×' }
  ],
  dhuhr: [
    { ar: 'اللَّهُمَّ اغْفِرْ لِي وَتُبْ عَلَيَّ إِنَّكَ أَنْتَ التَّوَّابُ الرَّحِيمُ', en: 'O Allah, forgive me and accept my repentance; You are the Most Relenting, Most Merciful.', occasion: 'Midday repentance' },
    { ar: 'رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي', en: 'My Lord, expand my chest and ease my affairs.', occasion: 'Dua of Prophet Musa' }
  ],
  asr: [
    { ar: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ', en: 'O Allah, send blessings upon Muhammad and the family of Muhammad.', occasion: 'Salawat — before Asr' },
    { ar: 'حَسْبِيَ اللَّهُ لَا إِلَهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ', en: 'Allah is sufficient for me; there is no god but Him, in Him I place my trust.', occasion: 'Afternoon dhikr — 7×' }
  ],
  maghrib: [
    { ar: 'اللَّهُمَّ لَكَ أَمْسَيْنَا وَلَكَ أَحْيَيْنَا وَلَكَ نَمُوتُ', en: 'O Allah, by You we enter the evening, by You we live and by You we die.', occasion: 'Evening dhikr' },
    { ar: 'اللَّهُمَّ مَا أَمْسَى بِي مِنْ نِعْمَةٍ فَمِنْكَ وَحْدَكَ', en: 'O Allah, whatever blessing I have received at evening is from You alone.', occasion: 'Evening gratitude' },
    { ar: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ', en: 'I seek refuge in the perfect words of Allah from the evil of what He has created.', occasion: 'Evening protection — 3×' }
  ],
  isha: [
    { ar: 'اللَّهُمَّ بِاسْمِكَ أَمُوتُ وَأَحْيَا', en: 'O Allah, in Your name I die and I live.', occasion: 'Before sleep' },
    { ar: 'سُبْحَانَ اللَّهِ — ٣٣ · الْحَمْدُ لِلَّهِ — ٣٣ · اللَّهُ أَكْبَرُ — ٣٤', en: 'SubhanAllah 33× · Alhamdulillah 33× · Allahu Akbar 34× — recite before sleep.', occasion: 'Tasbeeh of Fatima' },
    { ar: 'الآيَةُ الْكُرْسِيُّ ﴿اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ﴾', en: 'Ayat al-Kursi — recite before sleep for protection.', occasion: 'Before sleep protection' }
  ],
  sunrise: [
    { ar: 'اللَّهُمَّ أَقِمِ الصَّلَاةَ وَأَدِمِ عَلَيْهَا', en: 'O Allah, establish prayer and make it constant.', occasion: 'After Fajr, awaiting sunrise' },
    { ar: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ عَدَدَ خَلْقِهِ', en: 'Glory be to Allah and by His praise, as many times as the number of His creation.', occasion: 'Post-Fajr dhikr' }
  ]
};
var DUAS_META = {
  tahajjud: { label:'Tahajjud · Night', color:'#8090e0' },
  fajr:     { label:'Fajr · Pre-Dawn', color:'#b090e0' },
  sunrise:  { label:'Sunrise · Ishraq', color:'#f0b050' },
  morning:  { label:'Morning · Duha', color:'#c09010' },
  dhuhr:    { label:'Dhuhr · Midday', color:'#a07800' },
  asr:      { label:'Asr · Afternoon', color:'#e09030' },
  maghrib:  { label:'Maghrib · Evening', color:'#e06080' },
  isha:     { label:'Isha · Night', color:'#50a0a8' }
};

function renderDuas() {
  var theme = lastTheme || 'morning';
  var duas  = DUAS[theme] || DUAS.morning;
  var meta  = DUAS_META[theme] || DUAS_META.morning;
  var badge = document.getElementById('duas-theme-badge');
  if (badge) { badge.textContent = meta.label; badge.style.background = meta.color + '22'; badge.style.color = meta.color; }
  var grid = document.getElementById('duas-grid');
  if (!grid) return;
  grid.innerHTML = duas.map(function(d) {
    return '<div class="dua-card">' +
      '<div class="dua-occasion">' + d.occasion + '</div>' +
      '<div class="dua-arabic">' + d.ar + '</div>' +
      '<div class="dua-english">' + d.en + '</div>' +
    '</div>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// PRAYER HABIT TRACKER
// ═══════════════════════════════════════════════════════════════
var TRACKER_PRAYERS = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
var TRACKER_KEY = 'awqat_tracker_v1';

function getTrackerData() {
  try { return JSON.parse(localStorage.getItem(TRACKER_KEY)) || {}; } catch(e) { return {}; }
}
function saveTrackerData(data) {
  try { localStorage.setItem(TRACKER_KEY, JSON.stringify(data)); } catch(e) {}
}
function getWeekDates() {
  var days = [];
  var today = new Date();
  var dow = today.getDay(); // 0=Sun
  var monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));
  for (var i = 0; i < 7; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d.toISOString().slice(0,10));
  }
  return days;
}
function initTracker() {
  document.getElementById('tracker-reset-btn').addEventListener('click', function() {
    if (confirm('Reset this week\'s prayer tracker? This cannot be undone.')) {
      var data = getTrackerData();
      getWeekDates().forEach(function(d) { delete data[d]; });
      saveTrackerData(data);
      renderTracker();
    }
  });
}
function renderTracker() {
  var grid = document.getElementById('tracker-grid');
  if (!grid) return;
  var data  = getTrackerData();
  var dates = getWeekDates();
  var dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var today = new Date().toISOString().slice(0,10);

  var html = '<div class="tracker-header"><div class="tracker-prayer-col"></div>';
  dates.forEach(function(d, i) {
    var isToday = d === today;
    html += '<div class="tracker-day-col' + (isToday ? ' today' : '') + '">' +
      '<div class="tracker-day-name">' + dayNames[i] + '</div>' +
      '<div class="tracker-day-date">' + d.slice(8) + '</div>' +
    '</div>';
  });
  html += '</div>';

  TRACKER_PRAYERS.forEach(function(p) {
    html += '<div class="tracker-row">';
    html += '<div class="tracker-prayer-col">' + p + '</div>';
    dates.forEach(function(d) {
      var key  = d + ':' + p;
      var done = data[key] === true;
      var isFuture = d > today;
      html += '<div class="tracker-cell' + (done ? ' done' : '') + (isFuture ? ' future' : '') +
        '" data-key="' + key + '" data-date="' + d + '">' +
        (done ? '✓' : '') +
        '</div>';
    });
    html += '</div>';
  });

  grid.innerHTML = html;
  grid.querySelectorAll('.tracker-cell:not(.future)').forEach(function(cell) {
    cell.addEventListener('click', function() {
      var key  = this.dataset.key;
      var data = getTrackerData();
      data[key] = !data[key];
      saveTrackerData(data);
      renderTracker();
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// ANNUAL PRAYER TIME CHART
// ═══════════════════════════════════════════════════════════════
var chartInstance = null;
function initChartYearSel() {
  var sel = document.getElementById('chart-year-sel');
  if (!sel) return;
  var now = new Date().getFullYear();
  for (var y = now - 5; y <= now + 2; y++) {
    var opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === now) opt.selected = true;
    sel.appendChild(opt);
  }
  document.getElementById('chart-load-btn').addEventListener('click', function() {
    if (!currentCity) { showToast('Please select a city first.'); return; }
    loadAnnualChart(parseInt(document.getElementById('chart-year-sel').value));
  });
}

async function loadAnnualChart(year) {
  if (!currentCity) return;
  document.getElementById('chart-loading').style.display = 'flex';
  var canvas = document.getElementById('annual-chart');
  canvas.style.display = 'none';

  // Fetch one data point per month (day 15)
  var months = [], fajrData = [], sunriseData = [], maghribData = [], ishaData = [];
  var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  try {
    for (var m = 1; m <= 12; m++) {
      var dateStr = '15-' + String(m).padStart(2,'0') + '-' + year;
      var url = API_BASE + '/api/timings-by-date?date=' + encodeURIComponent(dateStr) +
                '&city=' + encodeURIComponent(currentCity) +
                '&country=' + encodeURIComponent(currentCountry);
      var res  = await fetch(url);
      var t    = await res.json();
      if (!t || t.error) continue;
      months.push(MONTH_NAMES[m-1]);
      fajrData.push(toMins(t.fajr));
      sunriseData.push(toMins(t.sunrise));
      maghribData.push(toMins(t.maghrib));
      ishaData.push(toMins(t.isha));
    }
  } catch(e) {
    showToast('Could not load chart data.');
    document.getElementById('chart-loading').style.display = 'none';
    canvas.style.display = 'block';
    return;
  }

  document.getElementById('chart-loading').style.display = 'none';
  canvas.style.display = 'block';

  function minsToLabel(m) {
    var h = Math.floor(m/60), mn = m%60;
    return (h%12||12) + ':' + String(mn).padStart(2,'0') + (h>=12?'pm':'am');
  }

  if (chartInstance) chartInstance.destroy();

  // Draw manually on canvas — no Chart.js dependency
  var ctx  = canvas.getContext('2d');
  var W    = canvas.offsetWidth || 700;
  canvas.width  = W;
  canvas.height = 280;
  var H    = canvas.height;
  var PAD  = { top:30, right:20, bottom:40, left:56 };
  var gW   = W - PAD.left - PAD.right;
  var gH   = H - PAD.top  - PAD.bottom;

  var allVals = fajrData.concat(sunriseData).concat(maghribData).concat(ishaData);
  var minV = Math.min.apply(null, allVals) - 15;
  var maxV = Math.max.apply(null, allVals) + 15;
  var range = maxV - minV;

  function xPos(i) { return PAD.left + (i / (months.length - 1)) * gW; }
  function yPos(v) { return PAD.top  + gH - ((v - minV) / range) * gH; }

  ctx.clearRect(0, 0, W, H);

  // grid lines
  ctx.strokeStyle = 'rgba(128,128,128,0.12)';
  ctx.lineWidth   = 1;
  for (var gi = 0; gi <= 4; gi++) {
    var gy = PAD.top + (gi/4)*gH;
    ctx.beginPath(); ctx.moveTo(PAD.left, gy); ctx.lineTo(W - PAD.right, gy); ctx.stroke();
    var gv = maxV - (gi/4)*range;
    ctx.fillStyle = 'rgba(128,128,128,0.55)';
    ctx.font = '10px Outfit, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(minsToLabel(Math.round(gv)), PAD.left - 6, gy + 4);
  }

  // x labels
  ctx.fillStyle = 'rgba(128,128,128,0.7)';
  ctx.font = '11px Outfit, sans-serif';
  ctx.textAlign = 'center';
  months.forEach(function(mn, i) {
    ctx.fillText(mn, xPos(i), H - PAD.bottom + 18);
  });

  // draw line
  function drawLine(vals, color) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    vals.forEach(function(v, i) {
      if (i === 0) ctx.moveTo(xPos(i), yPos(v));
      else         ctx.lineTo(xPos(i), yPos(v));
    });
    ctx.stroke();
    // dots
    ctx.fillStyle = color;
    vals.forEach(function(v, i) {
      ctx.beginPath();
      ctx.arc(xPos(i), yPos(v), 3.5, 0, Math.PI*2);
      ctx.fill();
    });
  }

  drawLine(fajrData,    '#7eb8d4');
  drawLine(sunriseData, '#f6c958');
  drawLine(maghribData, '#e8856a');
  drawLine(ishaData,    '#9b8fcf');

  chartInstance = { destroy: function() { ctx.clearRect(0,0,W,H); } };
}

// ═══════════════════════════════════════════════════════════════
// HIJRI <-> GREGORIAN DATE CONVERTER
// ═══════════════════════════════════════════════════════════════
var convDir = 'toHijri';
document.querySelectorAll('.conv-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.conv-tab').forEach(function(b) { b.classList.remove('active'); });
    this.classList.add('active');
    convDir = this.dataset.dir;
    document.getElementById('conv-inputs-toHijri').style.display = convDir === 'toHijri' ? 'flex' : 'none';
    document.getElementById('conv-inputs-toGreg').style.display  = convDir === 'toGreg'  ? 'flex' : 'none';
    document.getElementById('conv-result').innerHTML = '';
  });
});
document.getElementById('conv-btn').addEventListener('click', async function() {
  var result = document.getElementById('conv-result');
  result.innerHTML = '<span style="opacity:.5">Converting…</span>';
  try {
    var convType, convDate;
    if (convDir === 'toHijri') {
      var d = document.getElementById('conv-greg-day').value.trim();
      var m = document.getElementById('conv-greg-month').value;
      var y = document.getElementById('conv-greg-year').value.trim();
      if (!d || !m || !y) { result.innerHTML = '<span class="conv-err">Please fill all fields.</span>'; return; }
      convType = 'gToH';
      convDate = String(d).padStart(2,'0') + '-' + String(m).padStart(2,'0') + '-' + y;
    } else {
      var d = document.getElementById('conv-hij-day').value.trim();
      var m = document.getElementById('conv-hij-month').value;
      var y = document.getElementById('conv-hij-year').value.trim();
      if (!d || !m || !y) { result.innerHTML = '<span class="conv-err">Please fill all fields.</span>'; return; }
      convType = 'hToG';
      convDate = String(d).padStart(2,'0') + '-' + String(m).padStart(2,'0') + '-' + y;
    }
    var url  = API_BASE + '/api/convert?type=' + convType + '&date=' + encodeURIComponent(convDate);
    var res  = await fetch(url);
    var data = await res.json();
    if (!res.ok || data.error) { result.innerHTML = '<span class="conv-err">Invalid date.</span>'; return; }
    var dt = data;
    if (convDir === 'toHijri') {
      var h = dt.hijri;
      result.innerHTML =
        '<div class="conv-result-main">' + h.day + ' ' + h.month.en + ' ' + h.year + ' AH</div>' +
        '<div class="conv-result-sub">' + h.month.ar + ' · Day ' + h.weekday.en + '</div>';
    } else {
      var g = dt.gregorian;
      result.innerHTML =
        '<div class="conv-result-main">' + g.day + ' ' + g.month.en + ' ' + g.year + ' CE</div>' +
        '<div class="conv-result-sub">' + g.weekday.en + '</div>';
    }
  } catch(e) {
    result.innerHTML = '<span class="conv-err">Error. Check connection.</span>';
  }
});

// ═══════════════════════════════════════════════════════════════
// RAMADAN CALENDAR + ISLAMIC MONTHLY CALENDAR
// ═══════════════════════════════════════════════════════════════
var HIJRI_MONTHS = ['Muharram','Safar','Rabi al-Awwal','Rabi al-Thani','Jumada al-Awwal','Jumada al-Thani','Rajab','Sha\'ban','Ramadan','Shawwal','Dhul Qa\'dah','Dhul Hijjah'];

function initCalendarSelectors() {
  // Ramadan calendar year selector (Hijri years ~1430–1450)
  var rcSel = document.getElementById('ramcal-year-sel');
  var curHijriYear = 1446; // approximate
  try {
    // try to get from appData later; for now seed from today
    var approx = new Date().getFullYear() - 579;
    curHijriYear = approx;
  } catch(e) {}
  for (var y = curHijriYear - 5; y <= curHijriYear + 5; y++) {
    var opt = document.createElement('option');
    opt.value = y; opt.textContent = y + ' AH';
    if (y === curHijriYear) opt.selected = true;
    rcSel.appendChild(opt);
  }

  // Islamic calendar month selector
  var imSel = document.getElementById('islamcal-month-sel');
  HIJRI_MONTHS.forEach(function(mn, i) {
    var opt = document.createElement('option');
    opt.value = i + 1; opt.textContent = mn;
    imSel.appendChild(opt);
  });
  var iySel = document.getElementById('islamcal-year-sel');
  for (var y = curHijriYear - 10; y <= curHijriYear + 5; y++) {
    var opt = document.createElement('option');
    opt.value = y; opt.textContent = y + ' AH';
    if (y === curHijriYear) opt.selected = true;
    iySel.appendChild(opt);
  }

  document.getElementById('ramcal-load-btn').addEventListener('click', function() {
    if (!currentCity) { showToast('Please select a city first.'); return; }
    loadRamadanCalendar(parseInt(document.getElementById('ramcal-year-sel').value));
  });
  document.getElementById('islamcal-load-btn').addEventListener('click', function() {
    if (!currentCity) { showToast('Please select a city first.'); return; }
    loadIslamicCalendar(
      parseInt(document.getElementById('islamcal-month-sel').value),
      parseInt(document.getElementById('islamcal-year-sel').value)
    );
  });
}

async function loadRamadanCalendar(hijriYear) {
  var container = document.getElementById('ramcal-container');
  container.innerHTML = '<div class="cal-loading"><div class="loader"></div><span>Loading Ramadan ' + hijriYear + ' AH…</span></div>';
  try {
    var url = API_BASE + '/api/calendar?hijriYear=' + hijriYear + '&hijriMonth=9' +
              '&city=' + encodeURIComponent(currentCity) +
              '&country=' + encodeURIComponent(currentCountry);
    var res  = await fetch(url);
    var data = await res.json();
    if (!res.ok || !data.data) throw new Error('No data');
    var days = data.data;

    var html = '<div class="ramcal-table-wrap"><table class="ramcal-table">';
    html += '<thead><tr><th>Day</th><th>Date</th><th>Hijri</th>' +
            '<th class="sehr-col">Sehr (Hanafi)</th><th class="sehr-col">Sehr (Jafari)</th>' +
            '<th class="iftar-col">Iftar (Hanafi)</th><th class="iftar-col">Iftar (Jafari)</th>' +
            '</tr></thead><tbody>';

    days.forEach(function(day, i) {
      var t  = day.timings;
      // For Hanafi imsak/maghrib — use Imsak and Maghrib from the standard data
      // Jafari: method 7 gives slightly different timings; AlAdhan calendar doesn't split by school here
      // so we display Hanafi times and note Jafari approx
      var sehr_h  = t.Imsak   ? t.Imsak.replace(' (+05:30)','').replace(/\s*\(\+.+?\)/,'') : '--:--';
      var iftar_h = t.Maghrib  ? t.Maghrib.replace(/\s*\(\+.+?\)/,'') : '--:--';
      var g = day.date && day.date.gregorian;
      var gregDate = g ? (g.day + ' ' + g.month.en.slice(0,3)) : '';
      html += '<tr>' +
        '<td class="day-num">' + (i+1) + '</td>' +
        '<td class="greg-date">' + gregDate + '</td>' +
        '<td class="hij-date">' + (i+1) + ' رمضان</td>' +
        '<td class="sehr-cell">' + sehr_h + '<div class="t12">' + to12(sehr_h) + '</div></td>' +
        '<td class="sehr-cell t-muted">approx<div class="t12">see daily</div></td>' +
        '<td class="iftar-cell">' + iftar_h + '<div class="t12">' + to12(iftar_h) + '</div></td>' +
        '<td class="iftar-cell t-muted">approx<div class="t12">see daily</div></td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    html += '<div class="cal-note">Sehr = Imsak time (Hanafi, Method 1). Jafari times differ slightly — check daily view for both fiqh.</div>';
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<div class="cal-empty">Could not load calendar. Please check connection.</div>';
  }
}

async function loadIslamicCalendar(hijriMonth, hijriYear) {
  var container = document.getElementById('islamcal-container');
  container.innerHTML = '<div class="cal-loading"><div class="loader"></div><span>Loading ' + HIJRI_MONTHS[hijriMonth-1] + ' ' + hijriYear + ' AH…</span></div>';
  try {
    var url = API_BASE + '/api/calendar?hijriYear=' + hijriYear + '&hijriMonth=' + hijriMonth +
              '&city=' + encodeURIComponent(currentCity) +
              '&country=' + encodeURIComponent(currentCountry);
    var res  = await fetch(url);
    var data = await res.json();
    if (!res.ok || !data.data) throw new Error('No data');
    var days = data.data;

    var html = '<div class="cal-month-header">' + HIJRI_MONTHS[hijriMonth-1] + ' ' + hijriYear + ' AH</div>';
    html += '<div class="islamcal-table-wrap"><table class="islamcal-table">';
    html += '<thead><tr><th>Hijri</th><th>Gregorian</th><th>Day</th>' +
            '<th style="color:#7eb8d4">Fajr</th><th style="color:#f6c958">Sunrise</th>' +
            '<th style="color:#8ab87e">Dhuhr</th><th style="color:#e8a85a">Asr</th>' +
            '<th style="color:#e8856a">Maghrib</th><th style="color:#9b8fcf">Isha</th>' +
            '</tr></thead><tbody>';

    var today = new Date().toISOString().slice(0,10);
    days.forEach(function(day) {
      var t  = day.timings;
      var g  = day.date && day.date.gregorian;
      var gd = g ? (g.year + '-' + String(g.month.number).padStart(2,'0') + '-' + String(g.day).padStart(2,'0')) : '';
      var isToday = gd === today;
      var gregStr = g ? (g.day + ' ' + g.month.en.slice(0,3) + ' ' + g.year) : '';
      var hijStr  = day.date.hijri.day;
      var dow     = g ? g.weekday.en.slice(0,3) : '';
      function clean(s) { return s ? s.replace(/\s*\(\+.+?\)/,'') : '--:--'; }
      html += '<tr' + (isToday ? ' class="today-row"' : '') + '>' +
        '<td class="day-num">' + hijStr + '</td>' +
        '<td class="greg-date">' + gregStr + '</td>' +
        '<td class="dow">' + dow + '</td>' +
        '<td>' + clean(t.Fajr)    + '</td>' +
        '<td>' + clean(t.Sunrise) + '</td>' +
        '<td>' + clean(t.Dhuhr)   + '</td>' +
        '<td>' + clean(t.Asr)     + '</td>' +
        '<td>' + clean(t.Maghrib) + '</td>' +
        '<td>' + clean(t.Isha)    + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<div class="cal-empty">Could not load calendar. Please check connection.</div>';
  }
}

// ═══════════════════════════════════════════════════════════════
// HOOK Qibla into fetchTimes
// ═══════════════════════════════════════════════════════════════
// Monkey-patch renderAll to also trigger Qibla
var _origRenderAll = renderAll;
renderAll = function(data) {
  _origRenderAll(data);
  setTimeout(tryFetchQibla, 500);
};

