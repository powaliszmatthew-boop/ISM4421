# SongForge

One-page AI music generator built on the [Suno API](https://docs.sunoapi.org).

## Features
- **Simple mode** – describe a song + pick a style; Suno writes the lyrics
- **Custom mode** – your own title, style, lyrics, vocal gender, length, styles to avoid, style/weirdness sliders
- **AI lyrics writer** – generate lyric options and drop one into Custom mode
- Instrumental toggle and model picker (V6, V6 Mini, V6 Wild)
- Live status, in-page players (streams as soon as the first track is ready), MP3 download, "Reuse" a track's settings
- Remaining-credits display and song history (saved in your browser)

## API keys
Each user enters their **own** Suno API key (get one at [sunoapi.org/api-key](https://sunoapi.org/api-key)).
The key is kept only in the user's browser (session only, or "Remember on this device").
The Netlify function `netlify/functions/suno.mjs` forwards it to `api.sunoapi.org` per request and never stores or logs it.
No server-side key or environment variable is needed.

## Deploy to Netlify
1. New site → import this repo.
2. **Base directory:** `music-app` (Netlify then uses `music-app/netlify.toml`).
3. Leave build command empty. Deploy.

Local dev: `npx netlify-cli dev` from `music-app/` (the function must run, so opening `index.html` directly won't work).

## Notes
- Each generation returns 2 tracks and costs Suno credits.
- Suno keeps generated files ~14 days — download what you want to keep.
