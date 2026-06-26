/* =====================================================================
   admin.js — simple content manager for the portfolio.
   Logs in with a username + password and talks to /api/content, a Vercel
   serverless function that holds the GitHub token server-side and commits
   assets/data/content.json. A commit triggers an automatic Vercel
   redeploy, so edits go live. No tokens ever touch the browser.
   ===================================================================== */
(function () {
  "use strict";

  const API = "/api/content";
  const LANGS = ["en", "tr", "ar"];
  const LS = { user: "hh_admin_user", pass: "hh_admin_pass" };

  // ---- schema describing every editable section ----
  const blankI18n = () => ({ en: "", tr: "", ar: "" });
  const SCHEMA = [
    {
      key: "publications",
      label: "Publications",
      hint: "Papers shown in “Research & Publications”. The link opens when a card is clicked.",
      titleOf: (it) => it.title && it.title.en,
      blank: () => ({ link: "", tag: blankI18n(), title: blankI18n(), desc: blankI18n(), meta: blankI18n() }),
      fields: [
        { key: "link", label: "Link (URL)", type: "url" },
        { key: "tag", label: "Tag / badge", type: "i18n" },
        { key: "title", label: "Title", type: "i18n", textarea: true },
        { key: "desc", label: "Description", type: "i18n", textarea: true },
        { key: "meta", label: "Footnote (e.g. Journal article · IEEE Access)", type: "i18n" },
      ],
    },
    {
      key: "projects",
      label: "Projects",
      hint: "Cards shown in the “Projects” section.",
      titleOf: (it) => it.title && it.title.en,
      blank: () => ({ tags: [], title: blankI18n(), desc: blankI18n() }),
      fields: [
        { key: "title", label: "Title", type: "i18n" },
        { key: "desc", label: "Description", type: "i18n", textarea: true },
        { key: "tags", label: "Tags (comma separated)", type: "tags" },
      ],
    },
    {
      key: "experience",
      label: "Experience",
      hint: "Timeline entries in the “Experience” section.",
      titleOf: (it) => it.role && it.role.en,
      blank: () => ({ date: "", org: "", role: blankI18n(), desc: blankI18n() }),
      fields: [
        { key: "date", label: "Date range", type: "text" },
        { key: "org", label: "Organisation", type: "text" },
        { key: "role", label: "Role", type: "i18n" },
        { key: "desc", label: "Description", type: "i18n", textarea: true },
      ],
    },
    {
      key: "internships",
      label: "Internships",
      hint: "Small cards under the experience timeline.",
      titleOf: (it) => it.org,
      blank: () => ({ org: "", text: blankI18n() }),
      fields: [
        { key: "org", label: "Organisation", type: "text" },
        { key: "text", label: "Description", type: "i18n" },
      ],
    },
    {
      key: "education",
      label: "Education",
      hint: "Cards in the “Education” section. Leave grade empty to hide it.",
      titleOf: (it) => it.deg && it.deg.en,
      blank: () => ({ date: "", org: "", deg: blankI18n(), grade: blankI18n() }),
      fields: [
        { key: "date", label: "Date range", type: "text" },
        { key: "org", label: "Organisation", type: "text" },
        { key: "deg", label: "Degree / title", type: "i18n" },
        { key: "grade", label: "Grade / honour (optional)", type: "i18n" },
      ],
    },
  ];

  // ---- tiny DOM helpers ----
  const $ = (id) => document.getElementById(id);
  function el(tag, props, children) {
    const n = document.createElement(tag);
    if (props) Object.entries(props).forEach(([k, v]) => {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (v != null) n.setAttribute(k, v);
    });
    (children || []).forEach((c) => n.appendChild(c));
    return n;
  }
  function setStatus(node, text, cls) {
    node.textContent = text;
    node.className = "status" + (cls ? " " + cls : "");
  }

  // ---- state ----
  let DATA = null;
  let CREDS = null; // { user, pass }

  // ========================= API =========================
  async function callApi(action, extra) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ action, user: CREDS.user, pass: CREDS.pass }, extra || {})),
    });
    let json = {};
    try { json = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
  }

  // ========================= editor UI =========================
  function i18nField(obj, field) {
    const grid = el("div", { class: "i18n-grid" });
    LANGS.forEach((lng) => {
      const inputProps = { value: obj[lng] || "", class: lng };
      const input = field.textarea ? el("textarea", inputProps) : el("input", { ...inputProps, type: "text" });
      input.addEventListener("input", () => { obj[lng] = input.value; });
      grid.appendChild(el("div", { class: "lang-row" }, [
        el("span", { class: "lang-tag", text: lng }),
        input,
      ]));
    });
    return grid;
  }

  function plainField(item, field) {
    if (field.type === "tags") {
      const input = el("input", { type: "text", value: (item[field.key] || []).join(", ") });
      input.addEventListener("input", () => {
        item[field.key] = input.value.split(",").map((s) => s.trim()).filter(Boolean);
      });
      return input;
    }
    const input = el("input", { type: field.type === "url" ? "url" : "text", value: item[field.key] || "" });
    if (field.type === "url") input.placeholder = "https://…";
    input.addEventListener("input", () => { item[field.key] = input.value; });
    return input;
  }

  function renderItem(section, list, item, index) {
    const head = el("div", { class: "item-head" }, [
      el("span", { class: "title", text: `${index + 1}. ${section.titleOf(item) || "—"}` }),
      el("button", { class: "btn ghost sm", title: "Move up", text: "↑", onclick: () => move(list, index, -1) }),
      el("button", { class: "btn ghost sm", title: "Move down", text: "↓", onclick: () => move(list, index, 1) }),
      el("button", { class: "btn ghost sm danger", text: "Delete", onclick: () => removeItem(list, index) }),
    ]);
    const fields = section.fields.map((field) => {
      const control = field.type === "i18n" ? i18nField(item[field.key], field) : plainField(item, field);
      return el("div", { class: "field" }, [el("label", { text: field.label }), control]);
    });
    return el("div", { class: "item" }, [head, ...fields]);
  }

  function renderSection(section) {
    const list = DATA[section.key] || (DATA[section.key] = []);
    const body = el("div", {}, list.map((item, i) => renderItem(section, list, item, i)));
    const add = el("div", { class: "add-row" }, [
      el("button", {
        class: "btn", text: `+ Add ${section.label.replace(/s$/, "").toLowerCase()}`,
        onclick: () => { list.push(section.blank()); rerender(); },
      }),
    ]);
    return el("div", { class: "panel" }, [
      el("h2", { text: section.label }),
      el("p", { class: "hint", text: section.hint }),
      body,
      add,
    ]);
  }

  function move(list, index, dir) {
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    rerender();
  }
  function removeItem(list, index) {
    if (!confirm("Delete this item?")) return;
    list.splice(index, 1);
    rerender();
  }
  function rerender() {
    const editor = $("editor");
    editor.textContent = "";
    SCHEMA.forEach((section) => editor.appendChild(renderSection(section)));
  }

  // ========================= flows =========================
  async function load() {
    setStatus($("status"), "Loading…", "busy");
    try {
      const { content } = await callApi("load");
      DATA = content || {};
      rerender();
      setStatus($("status"), "Loaded latest content", "ok");
    } catch (e) {
      setStatus($("status"), e.message, "err");
    }
  }

  async function save() {
    const btn = $("saveBtn");
    btn.disabled = true;
    setStatus($("status"), "Publishing…", "busy");
    try {
      await callApi("save", { content: DATA });
      setStatus($("status"), "Published ✓ — the site will redeploy shortly", "ok");
    } catch (e) {
      setStatus($("status"), e.message, "err");
    } finally {
      btn.disabled = false;
    }
  }

  function showApp() {
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
    load();
  }

  // ========================= login gate =========================
  function rememberedCreds() {
    const store = localStorage;
    const user = store.getItem(LS.user);
    const pass = store.getItem(LS.pass);
    return user && pass ? { user, pass } : null;
  }

  async function attemptLogin(creds, remember, statusNode, onError) {
    CREDS = creds;
    setStatus(statusNode, "Verifying…", "busy");
    try {
      const { content } = await callApi("load");
      DATA = content || {};
      if (remember) {
        localStorage.setItem(LS.user, creds.user);
        localStorage.setItem(LS.pass, creds.pass);
      }
      setStatus(statusNode, "", "");
      $("gate").classList.add("hidden");
      $("app").classList.remove("hidden");
      rerender();
      setStatus($("status"), "Loaded latest content", "ok");
    } catch (e) {
      CREDS = null;
      onError(e);
    }
  }

  function initGate() {
    $("loginBtn").addEventListener("click", () => {
      const user = $("user").value.trim();
      const pass = $("pass").value;
      if (!user || !pass) { setStatus($("gateStatus"), "Enter username and password.", "err"); return; }
      attemptLogin({ user, pass }, $("remember").checked, $("gateStatus"), (e) =>
        setStatus($("gateStatus"), e.message, "err")
      );
    });
    $("pass").addEventListener("keydown", (ev) => { if (ev.key === "Enter") $("loginBtn").click(); });
    $("user").addEventListener("keydown", (ev) => { if (ev.key === "Enter") $("pass").focus(); });
  }

  function logout() {
    localStorage.removeItem(LS.user);
    localStorage.removeItem(LS.pass);
    CREDS = null;
    location.reload();
  }

  // ========================= boot =========================
  $("reloadBtn").addEventListener("click", load);
  $("saveBtn").addEventListener("click", save);
  $("logoutBtn").addEventListener("click", logout);
  initGate();

  const saved = rememberedCreds();
  if (saved) {
    attemptLogin(saved, false, $("gateStatus"), () => {
      // stale/invalid saved creds → clear and show login form
      localStorage.removeItem(LS.user);
      localStorage.removeItem(LS.pass);
    });
  }
})();
