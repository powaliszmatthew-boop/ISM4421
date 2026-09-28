// Relays browser requests to the Suno API (https://docs.sunoapi.org).
// The API key comes from each user's request (X-Suno-Key header) and is
// never stored or logged. Only a fixed set of endpoints can be reached.

const BASE = "https://api.sunoapi.org/api/v1";

const ROUTES = {
  generate:        { method: "POST", path: "/generate" },
  "generate-info": { method: "GET",  path: "/generate/record-info" },
  lyrics:          { method: "POST", path: "/lyrics" },
  "lyrics-info":   { method: "GET",  path: "/lyrics/record-info" },
  credits:         { method: "GET",  path: "/generate/credit" },
};

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export default async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // Suno requires a callBackUrl; we poll instead, so just acknowledge callbacks.
  if (action === "callback") return json(200, { status: "received" });

  const route = ROUTES[action];
  if (!route) return json(404, { code: 404, msg: "Unknown action" });
  if (req.method !== route.method) return json(405, { code: 405, msg: "Method not allowed" });

  const key = (req.headers.get("x-suno-key") || "").trim();
  if (!key) return json(401, { code: 401, msg: "Missing API key. Add your Suno API key in the app." });

  const headers = { Authorization: `Bearer ${key}` };
  let target = BASE + route.path;
  let body;

  if (route.method === "GET") {
    const taskId = url.searchParams.get("taskId");
    if (taskId) target += `?taskId=${encodeURIComponent(taskId)}`;
  } else {
    let payload;
    try {
      payload = await req.json();
    } catch {
      return json(400, { code: 400, msg: "Invalid JSON body" });
    }
    payload.callBackUrl = `${url.origin}/.netlify/functions/suno?action=callback`;
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(payload);
  }

  try {
    const res = await fetch(target, { method: route.method, headers, body });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return json(502, { code: 502, msg: "Could not reach the Suno API." });
  }
};
