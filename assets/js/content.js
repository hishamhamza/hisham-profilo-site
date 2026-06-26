/* =====================================================================
   content.js — renders the editable sections (publications, projects,
   experience, internships, education) from assets/data/content.json.
   Re-renders on language change so it stays in sync with i18n.js.
   The admin panel (admin.html) edits the same content.json file.
   ===================================================================== */
(function () {
  const DATA_URL = "assets/data/content.json";
  let DATA = null;

  function lang() {
    return window.HHLang || localStorage.getItem("hh_lang") || "en";
  }

  // pick the right language string from a {en,tr,ar} object, falling back to en
  function t(field) {
    if (field == null) return "";
    if (typeof field === "string") return field;
    return field[lang()] || field.en || "";
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null && text !== "") node.textContent = text;
    return node;
  }

  function renderPublications(list) {
    const host = document.getElementById("pub-list");
    if (!host) return;
    host.textContent = "";
    list.forEach((p) => {
      const card = el("a", "pub-card reveal");
      card.href = p.link || "#";
      card.target = "_blank";
      card.rel = "noopener";
      card.appendChild(el("div", "pub-tag", t(p.tag)));
      card.appendChild(el("h3", null, t(p.title)));
      card.appendChild(el("p", null, t(p.desc)));
      const meta = el("div", "pub-meta");
      meta.appendChild(el("span", null, t(p.meta)));
      const arrow = el("span", "pub-arrow", " ↗");
      arrow.setAttribute("aria-hidden", "true");
      meta.appendChild(arrow);
      card.appendChild(meta);
      host.appendChild(card);
    });
  }

  function renderProjects(list) {
    const host = document.getElementById("proj-grid");
    if (!host) return;
    host.textContent = "";
    list.forEach((p) => {
      const card = el("article", "proj-card reveal");
      card.appendChild(el("h3", null, t(p.title)));
      card.appendChild(el("p", null, t(p.desc)));
      const tags = el("div", "tags");
      (p.tags || []).forEach((tag) => tags.appendChild(el("span", null, tag)));
      card.appendChild(tags);
      host.appendChild(card);
    });
  }

  function renderExperience(list) {
    const host = document.getElementById("timeline");
    if (!host) return;
    host.textContent = "";
    list.forEach((x) => {
      const item = el("div", "tl-item reveal");
      item.appendChild(el("div", "tl-dot"));
      const content = el("div", "tl-content");
      content.appendChild(el("div", "tl-date", x.date));
      content.appendChild(el("h3", null, t(x.role)));
      content.appendChild(el("div", "tl-org", x.org));
      content.appendChild(el("p", null, t(x.desc)));
      item.appendChild(content);
      host.appendChild(item);
    });
  }

  function renderInternships(list) {
    const host = document.getElementById("intern-grid");
    if (!host) return;
    host.textContent = "";
    list.forEach((i) => {
      const card = el("div", "intern-card reveal");
      card.appendChild(el("strong", null, i.org));
      card.appendChild(el("span", null, t(i.text)));
      host.appendChild(card);
    });
  }

  function renderEducation(list) {
    const host = document.getElementById("edu-grid");
    if (!host) return;
    host.textContent = "";
    list.forEach((d) => {
      const card = el("div", "edu-card reveal");
      card.appendChild(el("div", "edu-date", d.date));
      card.appendChild(el("h3", null, t(d.deg)));
      card.appendChild(el("div", "edu-org", d.org));
      const grade = t(d.grade);
      if (grade) card.appendChild(el("div", "edu-grade", grade));
      host.appendChild(card);
    });
  }

  function render() {
    if (!DATA) return;
    renderPublications(DATA.publications || []);
    renderProjects(DATA.projects || []);
    renderExperience(DATA.experience || []);
    renderInternships(DATA.internships || []);
    renderEducation(DATA.education || []);
    // register the freshly created cards with the scroll-reveal observer
    if (typeof window.HHObserveReveals === "function") window.HHObserveReveals();
  }

  // no-store so admin edits show up immediately (content.json must not be
  // served from the long-lived immutable cache used for other assets)
  fetch(DATA_URL, { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error("Could not load content.json");
      return res.json();
    })
    .then((data) => {
      DATA = data;
      render();
    })
    .catch((err) => console.error("[content.js]", err));

  // re-render in the selected language whenever the user switches language
  window.addEventListener("hh:langchange", render);
})();
