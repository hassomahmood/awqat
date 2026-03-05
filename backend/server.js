const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── AlAdhan method IDs ────────────────────────────────────────────────────────
// Hanafi  → Method 1  (Univ. of Islamic Sciences, Karachi) + Hanafi Asr (school=1)
// Jafari  → Method 7  (Institute of Geophysics, Tehran — Shia/Jafari standard)
const HANAFI_METHOD = 1;
const JAFARI_METHOD = 7;

// ── Helper: fetch timings from AlAdhan ────────────────────────────────────────
async function fetchTimings(city, country, method, school = 0) {
  const today = new Date();
  const dd    = String(today.getDate()).padStart(2, "0");
  const mm    = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy  = today.getFullYear();

  const url =
    `https://api.aladhan.com/v1/timingsByCity/${dd}-${mm}-${yyyy}` +
    `?city=${encodeURIComponent(city)}` +
    `&country=${encodeURIComponent(country)}` +
    `&method=${method}` +
    `&school=${school}`;         // 0 = Shafi (standard Asr), 1 = Hanafi Asr

  const res  = await fetch(url, { timeout: 10000 });
  const json = await res.json();

  if (!res.ok || json.code !== 200) {
    throw new Error(json.data || `AlAdhan returned code ${json.code}`);
  }

  return json.data;
}

// ── GET /api/times?city=Islamabad&country=PK ──────────────────────────────────
app.get("/api/times", async (req, res) => {
  const city    = (req.query.city    || "").trim();
  const country = (req.query.country || "").trim();

  if (!city) {
    return res.status(400).json({ error: "city parameter is required" });
  }

  try {
    // Fetch both fiqhs in parallel
    const [hanafiData, jafariData] = await Promise.all([
      fetchTimings(city, country, HANAFI_METHOD, 1),   // school=1 → Hanafi Asr
      fetchTimings(city, country, JAFARI_METHOD, 0),   // school=0 → Shafi/Jafari Asr
    ]);

    const strip = (t) => (t ? t.substring(0, 5) : "--:--");

    // Shared date info (same for both)
    const hijri     = hanafiData.date.hijri;
    const gregorian = hanafiData.date.gregorian;
    const isRamadan = parseInt(hijri.month.number) === 9;
    const meta      = hanafiData.meta;

    res.json({
      city,
      country,
      date: {
        gregorian: {
          date:    gregorian.date,
          weekday: gregorian.weekday.en,
          day:     gregorian.day,
          month:   gregorian.month.en,
          year:    gregorian.year,
        },
        hijri: {
          day:   hijri.day,
          month: { number: hijri.month.number, en: hijri.month.en, ar: hijri.month.ar },
          year:  hijri.year,
          isRamadan,
        },
      },
      timezone: meta.timezone,
      hanafi: {
        fajr:    strip(hanafiData.timings.Fajr),
        sunrise: strip(hanafiData.timings.Sunrise),
        dhuhr:   strip(hanafiData.timings.Dhuhr),
        asr:     strip(hanafiData.timings.Asr),       // Hanafi Asr (later)
        maghrib: strip(hanafiData.timings.Maghrib),
        isha:    strip(hanafiData.timings.Isha),
        imsak:   strip(hanafiData.timings.Imsak),
        midnight:strip(hanafiData.timings.Midnight),
      },
      jafari: {
        fajr:    strip(jafariData.timings.Fajr),
        sunrise: strip(jafariData.timings.Sunrise),
        dhuhr:   strip(jafariData.timings.Dhuhr),
        asr:     strip(jafariData.timings.Asr),       // Jafari Asr (earlier)
        maghrib: strip(jafariData.timings.Maghrib),   // Jafari Maghrib (slightly later)
        isha:    strip(jafariData.timings.Isha),
        imsak:   strip(jafariData.timings.Imsak),
        midnight:strip(jafariData.timings.Midnight),
      },
    });
  } catch (err) {
    console.error("Error fetching prayer times:", err.message);
    res.status(500).json({ error: err.message || "Failed to fetch prayer times" });
  }
});

// ── GET /api/cities — searchable city list ────────────────────────────────────
app.get("/api/cities", (req, res) => {
  res.json(CITIES);
});

// ── GET / — health check ──────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "Awqat Al-Salat API" });
});

// Local dev
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Awqat API running on http://localhost:${PORT}`);
  });
}

// Vercel serverless export
module.exports = app;

// ── City list ─────────────────────────────────────────────────────────────────
const CITIES = [
  // Pakistan
  { city: "Islamabad",      country: "PK", label: "Islamabad",      region: "Pakistan" },
  { city: "Karachi",        country: "PK", label: "Karachi",        region: "Pakistan" },
  { city: "Lahore",         country: "PK", label: "Lahore",         region: "Pakistan" },
  { city: "Peshawar",       country: "PK", label: "Peshawar",       region: "Pakistan" },
  { city: "Quetta",         country: "PK", label: "Quetta",         region: "Pakistan" },
  { city: "Multan",         country: "PK", label: "Multan",         region: "Pakistan" },
  { city: "Faisalabad",     country: "PK", label: "Faisalabad",     region: "Pakistan" },
  { city: "Rawalpindi",     country: "PK", label: "Rawalpindi",     region: "Pakistan" },
  // Middle East
  { city: "Makkah",         country: "SA", label: "Makkah",         region: "Saudi Arabia" },
  { city: "Madinah",        country: "SA", label: "Madinah",        region: "Saudi Arabia" },
  { city: "Riyadh",         country: "SA", label: "Riyadh",         region: "Saudi Arabia" },
  { city: "Jeddah",         country: "SA", label: "Jeddah",         region: "Saudi Arabia" },
  { city: "Dubai",          country: "AE", label: "Dubai",          region: "UAE" },
  { city: "Abu Dhabi",      country: "AE", label: "Abu Dhabi",      region: "UAE" },
  { city: "Kuwait City",    country: "KW", label: "Kuwait City",    region: "Kuwait" },
  { city: "Doha",           country: "QA", label: "Doha",           region: "Qatar" },
  { city: "Tehran",         country: "IR", label: "Tehran",         region: "Iran" },
  { city: "Baghdad",        country: "IQ", label: "Baghdad",        region: "Iraq" },
  { city: "Amman",          country: "JO", label: "Amman",          region: "Jordan" },
  { city: "Istanbul",       country: "TR", label: "Istanbul",       region: "Turkey" },
  { city: "Ankara",         country: "TR", label: "Ankara",         region: "Turkey" },
  // South Asia
  { city: "Dhaka",          country: "BD", label: "Dhaka",          region: "Bangladesh" },
  { city: "Mumbai",         country: "IN", label: "Mumbai",         region: "India" },
  { city: "Delhi",          country: "IN", label: "Delhi",          region: "India" },
  { city: "Colombo",        country: "LK", label: "Colombo",        region: "Sri Lanka" },
  // Southeast Asia
  { city: "Kuala Lumpur",   country: "MY", label: "Kuala Lumpur",   region: "Malaysia" },
  { city: "Jakarta",        country: "ID", label: "Jakarta",        region: "Indonesia" },
  { city: "Singapore",      country: "SG", label: "Singapore",      region: "Singapore" },
  // Africa
  { city: "Cairo",          country: "EG", label: "Cairo",          region: "Egypt" },
  { city: "Casablanca",     country: "MA", label: "Casablanca",     region: "Morocco" },
  { city: "Lagos",          country: "NG", label: "Lagos",          region: "Nigeria" },
  { city: "Nairobi",        country: "KE", label: "Nairobi",        region: "Kenya" },
  // Europe
  { city: "London",         country: "GB", label: "London",         region: "UK" },
  { city: "Paris",          country: "FR", label: "Paris",          region: "France" },
  { city: "Berlin",         country: "DE", label: "Berlin",         region: "Germany" },
  { city: "Amsterdam",      country: "NL", label: "Amsterdam",      region: "Netherlands" },
  // Americas
  { city: "New York",       country: "US", label: "New York",       region: "USA" },
  { city: "Chicago",        country: "US", label: "Chicago",        region: "USA" },
  { city: "Los Angeles",    country: "US", label: "Los Angeles",    region: "USA" },
  { city: "Toronto",        country: "CA", label: "Toronto",        region: "Canada" },
];
