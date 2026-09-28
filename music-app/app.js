// SongForge — a one-page front end for the Suno API (docs.sunoapi.org).
// All API calls go through /.netlify/functions/suno, which forwards the
// user's own key. The key never leaves this browser except on those calls.

const API = "/.netlify/functions/suno";
const KEY_STORE = "songforge.apiKey";
const HISTORY_STORE = "songforge.history";
const POLL_MS = 8000;
const POLL_LIMIT_MS = 15 * 60 * 1000;
const FAILED = ["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "GENERATE_LYRICS_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR", "FAILED"];

const ERROR_TEXT = {
  400: "Invalid request — check your inputs.",
  401: "API key rejected. Check that it's correct.",
  405: "Rate limit hit. Wait a moment and try again.",
  413: "Prompt or lyrics are too long.",
  429: "Not enough credits on your Suno API account.",
  430: "Too many requests. Please slow down and retry shortly.",
  455: "Suno API is under maintenance. Try again later.",
  500: "Suno API server error. Try again.",
};

const IDEAS = [
  ["Road-trip pop", "An upbeat summer pop song about a road trip with best friends", "pop, upbeat, catchy"],
  ["Lo-fi study", "Mellow lo-fi beat for studying late at night", "lo-fi hip hop, chill, jazzy piano"],
  ["Epic trailer", "Cinematic orchestral build-up for a movie trailer", "epic orchestral, cinematic, choir"],
  ["Country heartbreak", "A heartfelt country ballad about leaving your hometown", "country, acoustic guitar, emotional"],
  ["Synthwave night", "Driving through a neon city at midnight", "synthwave, retro 80s, dreamy"],
];

const $ = (id) => document.getElementById(id);
let mode = "simple";
let history = load(HISTORY_STORE, []);
const polling = new Set();

/* ---------- storage (never trust it to exist) ---------- */
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
function getKey() {
  try { return sessionStorage.getItem(KEY_STORE) || localStorage.getItem(KEY_STORE) || ""; } catch { return window.__sunoKey || ""; }
}
function setKey(key, remember) {
  window.__sunoKey = key;
  try {
    sessionStorage.removeItem(KEY_STORE);
    localStorage.removeItem(KEY_STORE);
    if (key) (remember ? localStorage : sessionStorage).setItem(KEY_STORE, key);
  } catch { /* keep in memory only */ }
}

/* ---------- API ---------- */
async function api(action, { body, taskId } = {}) {
  const key = getKey();
  if (!key) throw new Error("Add your Suno API key first.");
  const qs = new URLSearchParams({ action });
  if (taskId) qs.set("taskId", taskId);
  let res, data;
  try {
    res = await fetch(`${API}?${qs}`, {
      method: body ? "POST" : "GET",
      headers: { "X-Suno-Key": key, ...(body && { "Content-Type": "application/json" }) },
      body: body && JSON.stringify(body),
    });
    data = await res.json();
  } catch {
    throw new Error(res ? `Unexpected response (HTTP ${res.status}).` : "Network error — check your connection.");
  }
  const code = data?.code ?? res.status;
  if (code !== 200) throw new Error(ERROR_TEXT[code] ? `${ERROR_TEXT[code]}${data?.msg ? ` (${data.msg})` : ""}` : data?.msg || `Request failed (${code}).`);
  return data.data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setStatus(el, text, kind = "") {
  el.textContent = text;
  el.className = `status ${kind}`;
}

async function refreshCredits() {
  try {
    const credits = await api("credits");
    $("creditsValue").textContent = typeof credits === "object" ? credits?.credits ?? "–" : credits;
    $("credits").hidden = false;
    return true;
  } catch (err) {
    $("credits").hidden = true;
    throw err;
  }
}

/* ---------- API key card ---------- */
$("keyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = $("apiKey").value.trim();
  if (!key) return;
  setKey(key, $("rememberKey").checked);
  setStatus($("keyStatus"), "Checking key…");
  try {
    await refreshCredits();
    setStatus($("keyStatus"), "Key saved and verified.", "ok");
    resumePolling();
  } catch (err) {
    setStatus($("keyStatus"), err.message, "error");
  }
});
$("clearKey").addEventListener("click", () => {
  setKey("");
  $("apiKey").value = "";
  $("credits").hidden = true;
  setStatus($("keyStatus"), "Key removed from this browser.");
});

/* ---------- mode tabs & inputs ---------- */
document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => setMode(tab.dataset.mode)));

function setMode(m) {
  mode = m;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.mode === m));
  document.querySelector(".mode-simple").hidden = m !== "simple";
  document.querySelector(".mode-custom").hidden = m !== "custom";
}

IDEAS.forEach(([label, prompt, style]) => {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip";
  chip.textContent = label;
  chip.addEventListener("click", () => {
    $("prompt").value = prompt;
    $("simpleStyle").value = style;
  });
  $("ideaChips").append(chip);
});

for (const [input, out] of [["styleWeight", "styleWeightOut"], ["weirdness", "weirdnessOut"]]) {
  $(input).addEventListener("input", () => { $(out).textContent = Number($(input).value).toFixed(2); });
}
$("instrumental").addEventListener("change", () => {
  $("lyrics").disabled = $("instrumental").checked;
  $("vocalGender").disabled = $("instrumental").checked;
});

/* ---------- generate music ---------- */
function buildRequest() {
  const instrumental = $("instrumental").checked;
  const model = $("model").value;

  if (mode === "simple") {
    const prompt = $("prompt").value.trim();
    const style = $("simpleStyle").value.trim();
    if (!prompt) throw new Error("Describe the song you want.");
    if (!style) throw new Error("Add a style or genre (or pick an idea).");
    return { label: prompt, body: { customMode: false, instrumental, model, prompt, style } };
  }

  const style = $("style").value.trim();
  const lyrics = instrumental ? "" : $("lyrics").value.trim();
  const negativeTags = $("negativeTags").value.trim();
  if (!style && !lyrics) throw new Error(instrumental ? "Add a style for your instrumental." : "Add a style and/or lyrics.");
  const body = {
    customMode: true, instrumental, model,
    styleWeight: Number($("styleWeight").value),
    weirdnessConstraint: Number($("weirdness").value),
  };
  const title = $("title").value.trim();
  if (title) body.title = title;
  if (style) body.style = style;
  if (lyrics) body.lyrics = lyrics;
  if (negativeTags) body.negativeTags = negativeTags;
  if (!instrumental && $("vocalGender").value) body.vocalGender = $("vocalGender").value;
  const duration = parseInt($("duration").value, 10);
  if (duration) {
    if (duration < 10 || duration > 360) throw new Error("Length must be 10–360 seconds.");
    body.duration = duration;
  }
  return { label: title || style || "Custom song", body };
}

$("genForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("genStatus");
  let req;
  try { req = buildRequest(); } catch (err) { return setStatus(status, err.message, "error"); }

  $("genBtn").disabled = true;
  setStatus(status, "Sending to Suno…");
  try {
    const { taskId } = await api("generate", { body: req.body });
    const task = { taskId, label: req.label, model: req.body.model, createdAt: Date.now(), status: "PENDING", tracks: [] };
    history.unshift(task);
    save(HISTORY_STORE, history);
    render();
    setStatus(status, "Started! Your songs will appear below (usually 1–3 minutes).", "ok");
    pollTask(task);
  } catch (err) {
    setStatus(status, err.message, "error");
  } finally {
    $("genBtn").disabled = false;
  }
});

function normalizeTracks(response) {
  const list = response?.sunoData || response?.data || [];
  return list.map((t) => ({
    id: t.id,
    title: t.title || "Untitled",
    tags: t.tags || "",
    lyrics: t.prompt || "",
    duration: t.duration,
    image: t.imageUrl || t.image_url || "",
    audio: t.audioUrl || t.audio_url || "",
    stream: t.streamAudioUrl || t.stream_audio_url || "",
  }));
}

async function pollTask(task) {
  if (polling.has(task.taskId)) return;
  polling.add(task.taskId);
  const start = Date.now();
  try {
    while (Date.now() - start < POLL_LIMIT_MS) {
      try {
        const info = await api("generate-info", { taskId: task.taskId });
        const tracks = normalizeTracks(info?.response);
        if (tracks.length) task.tracks = tracks;
        task.status = info?.status || task.status;
        if (FAILED.includes(task.status)) task.error = info?.errorMessage || task.status.replace(/_/g, " ").toLowerCase();
        save(HISTORY_STORE, history);
        render();
        if (task.status === "SUCCESS" || FAILED.includes(task.status)) break;
      } catch (err) {
        if (/key|credits/i.test(err.message)) { task.error = err.message; render(); break; }
        // transient error: keep polling
      }
      await sleep(POLL_MS);
    }
    if (task.status !== "SUCCESS" && !FAILED.includes(task.status) && !task.error) {
      task.error = "Still processing — reload the page later to check again.";
      render();
    }
  } finally {
    polling.delete(task.taskId);
    if (task.status === "SUCCESS") refreshCredits().catch(() => {});
  }
}

function resumePolling() {
  history.filter((t) => t.status !== "SUCCESS" && !FAILED.includes(t.status)).forEach((t) => {
    delete t.error;
    pollTask(t);
  });
}

/* ---------- rendering ---------- */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...children.filter((c) => c != null && c !== false));
  return el;
}
const fmtTime = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
const STATUS_LABEL = { PENDING: "Queued", TEXT_SUCCESS: "Writing lyrics", FIRST_SUCCESS: "First track ready", SUCCESS: "Done" };

function render() {
  const root = $("results");
  const sig = JSON.stringify(history);
  if (sig === render.last) return;
  render.last = sig;
  // reuse existing <audio> nodes so playback isn't interrupted by status updates
  const audios = new Map([...root.querySelectorAll("audio")].map((a) => [`${a.dataset.key}|${a.src}`, a]));
  root.replaceChildren();
  $("emptyMsg").hidden = history.length > 0;

  for (const task of history) {
    const failed = FAILED.includes(task.status) || task.error;
    const done = task.status === "SUCCESS";
    const badge = h("span", {
      className: `badge ${failed ? "failed" : done ? "" : "working"}`,
      textContent: failed ? "Failed" : STATUS_LABEL[task.status] || task.status,
    });
    const head = h("div", { className: "task-head" },
      h("span", { className: "prompt", textContent: task.label }),
      h("span", { textContent: `${task.model} · ${new Date(task.createdAt).toLocaleString()}` }),
      badge);

    const tracks = h("div", { className: "tracks" });
    for (const t of task.tracks) {
      const src = t.audio || t.stream;
      let audio = null;
      if (src) {
        const key = `${task.taskId}:${t.id}`;
        const mapKey = `${key}|${new URL(src, location.href).href}`;
        audio = audios.get(mapKey) || h("audio", { controls: true, preload: "none", src });
        audios.delete(mapKey);
        audio.dataset.key = key;
      }
      tracks.append(h("div", { className: "track" },
        t.image ? h("img", { src: t.image, alt: "", loading: "lazy" }) : h("div", { className: "ph" }),
        h("div", { className: "track-body" },
          h("div", { className: "track-title", textContent: t.title, title: t.title }),
          h("div", { className: "track-meta", textContent: [fmtTime(t.duration), t.tags].filter(Boolean).join(" · ") }),
          audio || h("div", { className: "track-meta", textContent: "Rendering audio…" }),
          h("div", { className: "track-actions" },
            t.audio && h("a", { className: "btn small ghost", href: t.audio, target: "_blank", rel: "noopener", download: `${t.title}.mp3`, textContent: "⬇ MP3" }),
            h("button", { type: "button", className: "btn small ghost", textContent: "Reuse", onclick: () => reuse(t) })),
          t.lyrics && h("details", {}, h("summary", { textContent: "Lyrics" }), h("pre", { textContent: t.lyrics })))));
    }

    root.append(h("article", { className: "task" }, head,
      task.tracks.length ? tracks : null,
      task.error && h("p", { className: "status error", textContent: task.error })));
  }
}

function reuse(track) {
  setMode("custom");
  $("title").value = track.title.slice(0, 80);
  $("style").value = track.tags;
  $("lyrics").value = track.lyrics;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("clearHistory").addEventListener("click", () => {
  if (!history.length || !confirm("Remove all songs from this list? (Files stay on Suno for ~14 days.)")) return;
  history = [];
  save(HISTORY_STORE, history);
  render();
});

/* ---------- AI lyrics ---------- */
$("openLyrics").addEventListener("click", () => {
  $("lyricsDialog").showModal();
  $("lyricsPrompt").focus();
});

$("lyricsGo").addEventListener("click", async () => {
  const prompt = $("lyricsPrompt").value.trim();
  const status = $("lyricsStatus");
  const out = $("lyricsResults");
  if (!prompt) return setStatus(status, "Tell the AI what the song is about.", "error");
  $("lyricsGo").disabled = true;
  out.replaceChildren();
  setStatus(status, "Writing lyrics…");
  try {
    const { taskId } = await api("lyrics", { body: { prompt } });
    const start = Date.now();
    let info;
    while (Date.now() - start < 5 * 60 * 1000) {
      await sleep(4000);
      info = await api("lyrics-info", { taskId });
      if (info?.status === "SUCCESS" || FAILED.includes(info?.status)) break;
    }
    if (info?.status !== "SUCCESS") throw new Error(info?.errorMessage || "Lyrics generation didn't finish. Try again.");
    const options = (info.response?.data || []).filter((o) => o.status !== "failed" && o.text);
    if (!options.length) throw new Error("No lyrics came back. Try a different prompt.");
    setStatus(status, "Pick a version:", "ok");
    options.forEach((o, i) => out.append(h("div", { className: "lyric-opt" },
      h("strong", { textContent: o.title || `Option ${i + 1}` }),
      h("pre", { textContent: o.text }),
      h("button", {
        type: "button", className: "btn small", textContent: "Use these lyrics",
        onclick: () => {
          setMode("custom");
          $("lyrics").value = o.text;
          if (o.title && !$("title").value) $("title").value = o.title.slice(0, 80);
          $("instrumental").checked = false;
          $("instrumental").dispatchEvent(new Event("change"));
          $("lyricsDialog").close();
        },
      }))));
  } catch (err) {
    setStatus(status, err.message, "error");
  } finally {
    $("lyricsGo").disabled = false;
  }
});

/* ---------- init ---------- */
(function init() {
  const key = getKey();
  if (key) {
    $("apiKey").value = key;
    try { $("rememberKey").checked = !!localStorage.getItem(KEY_STORE); } catch { /* ignore */ }
    setStatus($("keyStatus"), "Using your saved key.", "ok");
    refreshCredits().catch((err) => setStatus($("keyStatus"), err.message, "error"));
    resumePolling();
  }
  render();
})();
