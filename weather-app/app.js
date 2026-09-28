// Owl Weather — uses the free Open-Meteo APIs (no API key required).
// Forecast docs: https://open-meteo.com/en/docs
// Geocoding docs: https://open-meteo.com/en/docs/geocoding-api

// Campus addresses from https://www.fau.edu/about/locations/
// Coordinates geocoded from those addresses via OpenStreetMap Nominatim.
const CAMPUSES = [
  { name: "FAU Boca Raton", address: "777 Glades Road, Boca Raton, FL 33431", lat: 26.3706, lon: -80.1051 },
  { name: "FAU Jupiter (John D. MacArthur Campus)", address: "5353 Parkside Drive, Jupiter, FL 33458", lat: 26.8865, lon: -80.1143 },
  { name: "FAU Davie", address: "3200 College Avenue, Davie, FL 33314", lat: 26.0794, lon: -80.2384 },
  { name: "FAU Harbor Branch", address: "5600 US 1 North, Fort Pierce, FL 34946", lat: 27.5323, lon: -80.3529 },
  { name: "FAU Fort Lauderdale", address: "111 East Las Olas Blvd., Fort Lauderdale, FL 33301", lat: 26.1194, lon: -80.1417 },
  { name: "FAU Dania Beach (SeaTech)", address: "101 North Beach Road, Dania Beach, FL 33004", lat: 26.0552, lon: -80.1136 },
];

// WMO weather codes, per the Open-Meteo docs.
const WMO = {
  0: ["Clear sky", "☀️", "🌙"],
  1: ["Mainly clear", "🌤️", "🌙"],
  2: ["Partly cloudy", "⛅", "☁️"],
  3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"],
  48: ["Depositing rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"],
  53: ["Moderate drizzle", "🌦️"],
  55: ["Dense drizzle", "🌧️"],
  56: ["Light freezing drizzle", "🌧️"],
  57: ["Dense freezing drizzle", "🌧️"],
  61: ["Slight rain", "🌦️"],
  63: ["Moderate rain", "🌧️"],
  65: ["Heavy rain", "🌧️"],
  66: ["Light freezing rain", "🌧️"],
  67: ["Heavy freezing rain", "🌧️"],
  71: ["Slight snowfall", "🌨️"],
  73: ["Moderate snowfall", "🌨️"],
  75: ["Heavy snowfall", "❄️"],
  77: ["Snow grains", "🌨️"],
  80: ["Slight rain showers", "🌦️"],
  81: ["Moderate rain showers", "🌧️"],
  82: ["Violent rain showers", "⛈️"],
  85: ["Slight snow showers", "🌨️"],
  86: ["Heavy snow showers", "❄️"],
  95: ["Thunderstorm", "⛈️"],
  96: ["Thunderstorm with slight hail", "⛈️"],
  97: ["Heavy thunderstorm", "⛈️"],
  99: ["Thunderstorm with heavy hail", "⛈️"],
};

function weather(code, isDay = 1) {
  const w = WMO[code] || ["Unknown", "❔"];
  return { text: w[0], icon: !isDay && w[2] ? w[2] : w[1] };
}

const $ = (id) => document.getElementById(id);
const state = { unit: "fahrenheit", place: null };

function setStatus(msg, isError = false) {
  $("status").textContent = msg;
  $("status").classList.toggle("error", isError);
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

async function loadWeather(place) {
  state.place = place;
  setStatus("Loading forecast…");
  const params = new URLSearchParams({
    latitude: place.lat,
    longitude: place.lon,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    hourly: "temperature_2m,weather_code,precipitation_probability,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset",
    temperature_unit: state.unit,
    wind_speed_unit: "mph",
    precipitation_unit: state.unit === "fahrenheit" ? "inch" : "mm",
    timezone: "auto",
    forecast_days: 7,
  });
  try {
    const data = await getJSON(`https://api.open-meteo.com/v1/forecast?${params}`);
    render(place, data);
    setStatus("");
  } catch (err) {
    setStatus(`Couldn't load weather: ${err.message}`, true);
  }
}

const deg = (v) => `${Math.round(v)}°`;
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function compass(d) {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8];
}

function render(place, d) {
  const c = d.current, u = d.current_units;
  const w = weather(c.weather_code, c.is_day);

  $("place").textContent = place.name;
  $("address").textContent = place.address || "";
  $("updated").textContent = `Updated ${c.time.replace("T", " ")} (${d.timezone_abbreviation})`;
  $("icon").textContent = w.icon;
  $("temp").textContent = deg(c.temperature_2m) + (state.unit === "fahrenheit" ? "F" : "C");
  $("desc").textContent = w.text;
  $("feels").textContent = deg(c.apparent_temperature);
  $("humidity").textContent = `${c.relative_humidity_2m}%`;
  $("wind").textContent = `${Math.round(c.wind_speed_10m)} mph ${compass(c.wind_direction_10m)} (gusts ${Math.round(c.wind_gusts_10m)})`;
  $("precip").textContent = `${c.precipitation} ${u.precipitation}`;
  $("uv").textContent = d.daily.uv_index_max[0] ?? "—";
  $("sun").textContent = `${time(d.daily.sunrise[0])} / ${time(d.daily.sunset[0])}`;

  // Next 24 hours, starting at the current hour.
  const h = d.hourly;
  const start = Math.max(0, h.time.findIndex((t) => t >= c.time.slice(0, 13)));
  $("hourly").innerHTML = h.time.slice(start, start + 24).map((t, i) => {
    const k = start + i;
    const hw = weather(h.weather_code[k], h.is_day[k]);
    const label = i === 0 ? "Now" : new Date(t).toLocaleTimeString([], { hour: "numeric" });
    return `<div class="hour"><div>${label}</div><span class="i" title="${hw.text}">${hw.icon}</span>
      <strong>${deg(h.temperature_2m[k])}</strong><div class="p">💧${h.precipitation_probability[k] ?? 0}%</div></div>`;
  }).join("");

  const dd = d.daily;
  $("daily").innerHTML = dd.time.map((t, i) => {
    const dw = weather(dd.weather_code[i]);
    const name = i === 0 ? "Today" : new Date(t + "T12:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    return `<div class="day"><strong>${name}</strong><span class="i">${dw.icon}</span>
      <span class="d">${dw.text} · 💧${dd.precipitation_probability_max[i] ?? 0}%</span>
      <span class="t">${deg(dd.temperature_2m_max[i])} <span>/ ${deg(dd.temperature_2m_min[i])}</span></span></div>`;
  }).join("");

  ["current", "hourly-card", "daily-card"].forEach((id) => ($(id).hidden = false));
}

async function searchCity(query) {
  const results = $("results");
  results.hidden = true;
  setStatus("Searching…");
  try {
    const params = new URLSearchParams({ name: query, count: 8, language: "en", format: "json" });
    const data = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
    if (!data.results?.length) return setStatus(`No places found for "${query}".`, true);
    setStatus("Pick a location:");
    results.innerHTML = "";
    data.results.forEach((r) => {
      const label = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.onclick = () => {
        results.hidden = true;
        $("campus").value = "";
        loadWeather({ name: r.name, address: label, lat: r.latitude, lon: r.longitude });
      };
      li.appendChild(btn);
      results.appendChild(li);
    });
    results.hidden = false;
  } catch (err) {
    setStatus(`Search failed: ${err.message}`, true);
  }
}

function init() {
  const sel = $("campus");
  sel.innerHTML = `<option value="">— Select —</option>` +
    CAMPUSES.map((c, i) => `<option value="${i}">${c.name}</option>`).join("");
  sel.value = "0";
  sel.onchange = () => sel.value !== "" && loadWeather(CAMPUSES[sel.value]);

  $("search-form").onsubmit = (e) => {
    e.preventDefault();
    const q = $("search").value.trim();
    if (q.length >= 2) searchCity(q);
  };

  $("locate").onclick = () => {
    if (!navigator.geolocation) return setStatus("Geolocation isn't supported by this browser.", true);
    setStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        $("campus").value = "";
        loadWeather({ name: "My location", address: `${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`, lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      (err) => setStatus(`Location unavailable: ${err.message}`, true)
    );
  };

  document.querySelectorAll(".units button").forEach((b) => {
    b.onclick = () => {
      state.unit = b.dataset.unit;
      document.querySelectorAll(".units button").forEach((x) => x.classList.toggle("active", x === b));
      if (state.place) loadWeather(state.place);
    };
  });

  loadWeather(CAMPUSES[0]);
}

init();
