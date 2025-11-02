import React, { useState } from "react";
import "./WeatherApp.css";

import { addSearchRecord } from "../../lib/firebase";

import searchIcon from "../Assets/search.png";
import clearIcon from "../Assets/clear.png";
import cloudIcon from "../Assets/cloud.png";
import drizzleIcon from "../Assets/drizzle.png";
import rainIcon from "../Assets/rain.png";
import snowIcon from "../Assets/snow.png";
import windPng from "../Assets/wind.png";
import humidityPng from "../Assets/humidity.png";
import loadingGif from "../Assets/WeatherIcons.gif";
import sunPng from "../Assets/sun.png";

import Clock from "react-live-clock";

/* ---------- helpers ---------- */
const formatDate = (d) => {
  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const iconForOWM = (code) => {
  if (code?.startsWith("01")) return clearIcon;
  if (code?.startsWith("02")) return cloudIcon;
  if (code?.startsWith("03")) return drizzleIcon;
  if (code?.startsWith("04")) return drizzleIcon;
  if (code?.startsWith("09")) return rainIcon;
  if (code?.startsWith("10")) return cloudIcon;
  if (code?.startsWith("13")) return snowIcon;
  return clearIcon;
};

// Open-Meteo weathercode mapping -> description + icon
const OM_MAP = {
  0:  { d: "clear sky",             i: clearIcon },
  1:  { d: "mainly clear",          i: clearIcon },
  2:  { d: "partly cloudy",         i: cloudIcon },
  3:  { d: "overcast",              i: cloudIcon },
  45: { d: "fog",                   i: cloudIcon },
  48: { d: "depositing rime fog",   i: cloudIcon },
  51: { d: "light drizzle",         i: drizzleIcon },
  53: { d: "moderate drizzle",      i: drizzleIcon },
  55: { d: "dense drizzle",         i: drizzleIcon },
  61: { d: "slight rain",           i: rainIcon },
  63: { d: "moderate rain",         i: rainIcon },
  65: { d: "heavy rain",            i: rainIcon },
  71: { d: "slight snow",           i: snowIcon },
  73: { d: "moderate snow",         i: snowIcon },
  75: { d: "heavy snow",            i: snowIcon },
  80: { d: "rain showers",          i: rainIcon },
  81: { d: "heavy rain showers",    i: rainIcon },
  82: { d: "violent rain showers",  i: rainIcon },
  85: { d: "snow showers",          i: snowIcon },
  86: { d: "heavy snow showers",    i: snowIcon },
  95: { d: "thunderstorm",          i: rainIcon },
  96: { d: "thunderstorm (hail)",   i: rainIcon },
  99: { d: "thunderstorm (hail)",   i: rainIcon }
};

/* ---------- API helpers ---------- */
// OpenWeather geocoding (needs key)
async function geocodeOWM(q, apiKey) {
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${apiKey}`;
  const res = await fetch(url);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(text || "Geocoding parse error"); }
  if (!res.ok) throw new Error(json?.message || `Geocoding failed (${res.status})`);
  if (!Array.isArray(json) || json.length === 0) throw new Error(`City not found: "${q}"`);
  const { lat, lon, name, country, state } = json[0];
  return { lat, lon, name, country, state };
}

// OpenWeather current by lat/lon (needs key)
async function currentOWM(lat, lon, apiKey) {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
  const res = await fetch(url);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(text || "Weather parse error"); }
  if (!res.ok) throw new Error(json?.message || `Weather failed (${res.status})`);
  return json;
}

// Open-Meteo geocoding (no key)
async function geocodeOM(q) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || !json?.results?.length) throw new Error(`City not found: "${q}"`);
  const r = json.results[0];
  return { lat: r.latitude, lon: r.longitude, name: r.name, country: r.country_code, state: r.admin1 };
}

// Open-Meteo current (no key). Windspeed is already km/h
async function currentOM(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || !json?.current_weather) throw new Error("Failed to fetch current weather");
  return json;
}

/* ---------- component ---------- */
export default function WeatherApp() {
  // If you have an OpenWeather key, paste it here; otherwise leave "" and it will use Open-Meteo.
  const apiKey = ""; // e.g. "1191e67d98a083d9a4845cf5f295502d"

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null); // unified data

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setErr("");
    setData(null);

    try {
      if (apiKey) {
        // Try OpenWeather path first
        const place = await geocodeOWM(q, apiKey);
        const w = await currentOWM(place.lat, place.lon, apiKey);

        const norm = {
          source: "owm",
          name: `${place.name}${place.state ? ", " + place.state : ""}, ${place.country}`,
          temp: Number(w.main.temp),
          feels: Number(w.main.feels_like),
          tMin: Number(w.main.temp_min),
          tMax: Number(w.main.temp_max),
          windKmh: Math.round(w.wind.speed * 3.6), // m/s -> km/h
          humidity: Number(w.main.humidity),
          pressure: Number(w.main.pressure),
          desc: w.weather?.[0]?.description || "",
          icon: iconForOWM(w.weather?.[0]?.icon)
        };
        setData(norm);

        // store to Firestore (no UI list)
        await addSearchRecord({
          city: place.name,
          country: place.country,
          temp: norm.temp,
          source: "owm",
        });

      } else {
        // Fallback: Open-Meteo (no key)
        const place = await geocodeOM(q);
        const w = await currentOM(place.lat, place.lon);
        const cw = w.current_weather;
        const info = OM_MAP[cw.weathercode] || { d: "current weather", i: clearIcon };

        const norm = {
          source: "open-meteo",
          name: `${place.name}${place.state ? ", " + place.state : ""}, ${place.country}`,
          temp: Number(cw.temperature),
          feels: null,
          tMin: null,
          tMax: null,
          windKmh: Math.round(Number(cw.windspeed)), // already km/h
          humidity: null,
          pressure: null,
          desc: info.d,
          icon: info.i
        };
        setData(norm);

        // store to Firestore (no UI list)
        await addSearchRecord({
          city: place.name,
          country: place.country,
          temp: norm.temp,
          source: "open-meteo",
        });
      }
    } catch (e) {
      setErr(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="wx-page">
      <div className="wx-container">
        {/* Header */}
        <header className="wx-header">
          <div className="wx-title">
            <img src={sunPng} alt="sun illustration" className="wx-sun" />
            <h1>Weather App</h1>
          </div>
          <div className="wx-datetime">
            <div className="wx-time">
              <Clock format="HH:mm:ss" interval={1000} ticking />
            </div>
            <div className="wx-date">{formatDate(new Date())}</div>
          </div>
        </header>

        {/* Search */}
        <div className="wx-search card">
          <input
            className="wx-input"
            type="text"
            placeholder="Search a city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="City name"
          />
          <button className="wx-btn" onClick={handleSearch} aria-label="Search">
            <img src={searchIcon} alt="search" />
          </button>
        </div>

        {/* Messages */}
        {err && <div className="wx-error card">⚠️ {err}</div>}
        {loading && (
          <div className="wx-loading card">
            <img src={loadingGif} alt="loading" />
            <span>Fetching weather…</span>
          </div>
        )}

        {/* Weather card */}
        {data && !loading && !err && (
          <section className="wx-grid">
            <div className="wx-hero card">
              <div className="wx-hero-left">
                <img className="wx-hero-icon" src={data.icon} alt="weather icon" />
                <div className="wx-temp">{data.temp.toFixed(1)}°C</div>
                <div className="wx-location">{data.name}</div>
                <div className="wx-desc">
                  {data.desc}
                  {data.feels !== null ? ` • feels like ${data.feels.toFixed(1)}°C` : ""}
                </div>
              </div>

              <div className="wx-hero-right">
                <h3>Location Details</h3>
                <ul>
                  <li><strong>Location:</strong> {data.name}</li>
                  {data.tMin !== null && <li><strong>Temp min:</strong> {data.tMin.toFixed(1)}°C</li>}
                  {data.tMax !== null && <li><strong>Temp max:</strong> {data.tMax.toFixed(1)}°C</li>}
                  {data.pressure !== null && <li><strong>Pressure:</strong> {data.pressure} hPa</li>}
                  {data.source && <li><strong>Source:</strong> {data.source}</li>}
                </ul>
              </div>
            </div>

            <div className="wx-cards">
              {data.humidity !== null && (
                <div className="wx-card card">
                  <img src={humidityPng} alt="humidity" className="wx-mini-icon" />
                  <div>
                    <div className="wx-card-value">{data.humidity}%</div>
                    <div className="wx-card-label">Humidity</div>
                  </div>
                </div>
              )}

              <div className="wx-card card">
                <img src={windPng} alt="wind" className="wx-mini-icon" />
                <div>
                  <div className="wx-card-value">{data.windKmh} km/h</div>
                  <div className="wx-card-label">Wind</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {!data && !loading && !err && (
          <div className="wx-empty muted card">Start by searching for a city above.</div>
        )}

        {/* Footer credits */}
        <div className="wx-credits">
          <div><b>Created by:</b> Kartik Tyagi</div>
          <div><b>Guided by:</b> Dr. R.K Nadesh</div>
        </div>
      </div>
    </div>
  );
}
