/* =====================================================================
   /api/content — Vercel serverless function backing the admin panel.

   The GitHub token lives ONLY here, as a server environment variable, so
   it is never exposed to the browser. The admin page authenticates with a
   simple username + password (also env vars); on success this function
   reads or commits assets/data/content.json on GitHub, which triggers a
   Vercel redeploy.

   Required environment variables (set in the Vercel project settings):
     ADMIN_USER     – login username
     ADMIN_PASS     – login password
     GITHUB_TOKEN   – PAT with "Contents: Read and write" on the repo
   Optional (defaults shown):
     GH_OWNER  = hishamhamza
     GH_REPO   = hisham-profilo-site
     GH_BRANCH = main
   ===================================================================== */

const FILE_PATH = "assets/data/content.json";

function ghConfig() {
  return {
    owner: process.env.GH_OWNER || "hishamhamza",
    repo: process.env.GH_REPO || "hisham-profilo-site",
    branch: process.env.GH_BRANCH || "main",
    token: process.env.GITHUB_TOKEN,
  };
}

// constant-time-ish string comparison to avoid trivial timing leaks
function safeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authOk(body) {
  const u = process.env.ADMIN_USER;
  const p = process.env.ADMIN_PASS;
  if (!u || !p) return false; // not configured → deny
  return safeEqual(body.user, u) && safeEqual(body.pass, p);
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "hisham-site-admin",
  };
}

async function getFile(cfg) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${FILE_PATH}?ref=${cfg.branch}`;
  const res = await fetch(url, { headers: ghHeaders(cfg.token) });
  if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
  const json = await res.json();
  const content = Buffer.from(json.content, "base64").toString("utf8");
  return { sha: json.sha, data: JSON.parse(content) };
}

async function putFile(cfg, sha, contentStr, message) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${FILE_PATH}`;
  const body = {
    message,
    content: Buffer.from(contentStr, "utf8").toString("base64"),
    branch: cfg.branch,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: "PUT", headers: ghHeaders(cfg.token), body: JSON.stringify(body) });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).message; } catch (e) {}
    throw new Error(`GitHub write failed (${res.status}). ${detail}`);
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Vercel parses JSON bodies automatically; guard just in case.
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const cfg = ghConfig();
  if (!cfg.token) {
    res.status(500).json({ error: "Server not configured (GITHUB_TOKEN missing)." });
    return;
  }
  if (!authOk(body)) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  try {
    if (body.action === "load") {
      const { data } = await getFile(cfg);
      res.status(200).json({ ok: true, content: data });
      return;
    }
    if (body.action === "save") {
      if (!body.content || typeof body.content !== "object") {
        res.status(400).json({ error: "Missing content." });
        return;
      }
      const { sha } = await getFile(cfg); // fresh sha avoids conflicts
      const str = JSON.stringify(body.content, null, 2) + "\n";
      await putFile(cfg, sha, str, "Update site content via admin panel");
      res.status(200).json({ ok: true });
      return;
    }
    res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error" });
  }
};
