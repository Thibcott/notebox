let state = {
  projects: [],
  currentProjectId: null,
  currentTabId: null,
  saveTimer: null,
  dirty: false,
  previewVisible: true,
  tabStates: {}
};

const $ = (id) => document.getElementById(id);

function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return ""; }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(url, opts = {}) {
  // Force absolute path for the reverse proxy routing
  if (!url.startsWith('/notebox/') && url.startsWith('api/')) {
    url = '/notebox/' + url;
  }
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

async function uploadImageFile(file) {
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch("/notebox/api/upload", {
    method: "POST",
    body: fd
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // {url}
}

async function loadProjects() {
  state.projects = await api("api/projects");
  sortProjects();
  if (!state.currentProjectId && state.projects.length > 0) {
    state.currentProjectId = state.projects[0].id;
    state.currentTabId = state.projects[0].tabs[0]?.id || null;
  }
  render();
}

function maxUpdatedAt(p) {
  if (!p.tabs || p.tabs.length === 0) return p.createdAt;
  return p.tabs.reduce((max, tab) => (tab.updatedAt > max ? tab.updatedAt : max), p.tabs[0].updatedAt) || p.createdAt;
}

function sortProjects() {
  state.projects.sort((a, b) => new Date(maxUpdatedAt(b)) - new Date(maxUpdatedAt(a)));
}

function getCurrentProject() {
  return state.projects.find(p => p.id === state.currentProjectId) || null;
}
function getCurrentTab() {
  const p = getCurrentProject();
  if (!p) return null;
  return p.tabs.find(t => t.id === state.currentTabId) || null;
}

function setSaveState(text) {
  $("saveState").textContent = text ? `• ${text}` : "";
}

function renderProjects() {
  const wrap = $("projects");
  wrap.innerHTML = "";
  for (const p of state.projects) {
    const div = document.createElement("div");
    div.className = "project" + (p.id === state.currentProjectId ? " active" : "");
    div.innerHTML = `
      <div><strong>${escapeHtml(p.name)}</strong></div>
      <div class="meta">${fmtDate(p.createdAt)}</div>
    `;
    div.onclick = () => {
      saveCurrentTabState();
      state.currentProjectId = p.id;
      state.currentTabId = p.tabs[0]?.id || null;
      state.dirty = false;
      setSaveState("");
      render();
    };
    wrap.appendChild(div);
  }
}

function saveCurrentTabState() {
  const t = getCurrentTab();
  const ta = $("content");
  if (t && ta) {
    state.tabStates[t.id] = {
      selectionStart: ta.selectionStart,
      selectionEnd: ta.selectionEnd,
      scrollTop: ta.scrollTop
    };
  }
}

function restoreCurrentTabState() {
  const t = getCurrentTab();
  const ta = $("content");
  if (t && ta) {
    const s = state.tabStates[t.id];
    if (s) {
      ta.selectionStart = s.selectionStart;
      ta.selectionEnd = s.selectionEnd;
      ta.scrollTop = s.scrollTop;
    } else {
      ta.scrollTop = 0;
      ta.selectionStart = ta.selectionEnd = 0;
    }
  }
}



function configureMarked() {
  if (!window.marked) return;
  marked.setOptions({
    gfm: true,
    breaks: true,
    highlight: function (code, lang) {
      try {
        if (window.hljs) {
          if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
          return hljs.highlightAuto(code).value;
        }
      } catch { }
      return code;
    }
  });
}

function openPreviewWindow(md) {
  let html = "";
  try {
    html = marked.parse(md || "");
  } catch {
    html = "<p>(Erreur Markdown)</p>";
  }
  // sanitize
  if (window.DOMPurify) {
    html = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
        'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
        'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'iframe', 'img'],
      ALLOWED_ATTR: ['href', 'name', 'target', 'src', 'alt', 'class']
    });
  }

  const win = window.open("", "_blank");
  if (!win) {
    alert("Le navigateur a bloqué l'ouverture de la fenêtre. Veuillez autoriser les popups pour Notebox.");
    return;
  }
  win.document.write(`
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Aperçu Notebox</title>
  <link rel="stylesheet" href="/notebox/styles.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css">
</head>
<body class="previewBody" style="padding: 40px; max-width: 900px; margin: 0 auto; display: block; height: auto;">
  ${html}
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/highlight.min.js"><\/script>
  <script>
    if (window.hljs) {
      document.querySelectorAll("pre code").forEach((el) => hljs.highlightElement(el));
    }
  <\/script>
</body>
</html>
  `);
  win.document.close();
}

function renderEditor() {
  const p = getCurrentProject();
  const t = getCurrentTab();
  $("currentProjectName").textContent = p ? p.name : "—";

  const ta = $("content");
  ta.value = t ? (t.content || "") : "";

  // Use timeout to allow textarea to render before restoring scroll
  setTimeout(restoreCurrentTabState, 0);
}

function scheduleSave() {
  const p = getCurrentProject();
  const t = getCurrentTab();
  if (!p || !t) return;

  state.dirty = true;
  setSaveState("modifié…");

  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    try {
      const content = $("content").value;
      const res = await api(`api/projects/${p.id}/tabs/${t.id}/content`, {
        method: "PUT",
        body: JSON.stringify({ content })
      });
      if (res && res.updatedAt) {
        t.updatedAt = res.updatedAt;
      } else {
        t.updatedAt = new Date().toISOString();
      }
      t.content = content;
      sortProjects();
      renderProjects();
      
      state.dirty = false;
      setSaveState("enregistré");
    } catch (e) {
      setSaveState("erreur sauvegarde");
      console.error(e);
    }
  }, 500);
}

function looksLikeCode(text) {
  if (!text) return false;
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return false;
  const codey = /[;{}()[\]=<>]|=>|function\s|\bclass\b|\bconst\b|\blet\b|\bvar\b|#include|import\s|SELECT\s|INSERT\s|UPDATE\s/i;
  const hasIndent = lines.some(l => /^\s{2,}\S/.test(l));
  return codey.test(text) || hasIndent;
}

function wrapSelectionInCode() {
  const ta = $("content");
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  if (start === end) {
    // no selection: insert fenced block
    const insert = "```js\n\n```\n";
    ta.setRangeText(insert, start, end, "end");
    ta.selectionStart = ta.selectionEnd = start + "```js\n".length;
  } else {
    const selected = ta.value.slice(start, end);
    const wrapped = "```js\n" + selected + "\n```\n";
    ta.setRangeText(wrapped, start, end, "end");
  }
  scheduleSave();
}

function insertAtCursor(text) {
  const ta = $("content");
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  ta.setRangeText(text, start, end, "end");
  scheduleSave();
}

async function handlePaste(e) {
  const ta = $("content");
  const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];

  // 1) If image in clipboard: upload and insert markdown
  const imgItem = items.find(it => it.type && it.type.startsWith("image/"));
  if (imgItem) {
    e.preventDefault();
    const file = imgItem.getAsFile();
    if (!file) return;
    setSaveState("upload image…");
    try {
      const { url } = await uploadImageFile(file);
      insertAtCursor(`\n![capture](${url})\n`);
      setSaveState("image ajoutée");
    } catch (err) {
      console.error(err);
      setSaveState("upload échoué");
    }
    return;
  }

  // 2) If pasted text looks like code and not already inside ``` : auto-wrap
  const text = e.clipboardData?.getData("text/plain");
  if (text && looksLikeCode(text)) {
    // if user is already in a code fence nearby, don't wrap
    const before = ta.value.slice(0, ta.selectionStart);
    const fencesBefore = (before.match(/```/g) || []).length;
    const inFence = fencesBefore % 2 === 1;
    if (!inFence) {
      e.preventDefault();
      insertAtCursor("\n```js\n" + text.replace(/\s+$/, "") + "\n```\n");
    }
  }
}

function bindEvents() {
  const btnToggleSidebar = $("btnToggleSidebar");
  if (btnToggleSidebar) {
    btnToggleSidebar.onclick = (e) => {
      e.stopPropagation();
      document.querySelector(".app").classList.toggle("show-sidebar");
    };
  }
  document.querySelector(".main").addEventListener("click", (e) => {
    if (!e.target.closest('#btnToggleSidebar')) {
      document.querySelector(".app").classList.remove("show-sidebar");
    }
  });

  $("btnCreateProject").onclick = async () => {
    const name = $("newProjectName").value.trim();
    if (!name) return;
    await api("api/projects", { method: "POST", body: JSON.stringify({ name }) });
    $("newProjectName").value = "";
    await loadProjects();
  };

  $("btnDeleteProject").onclick = async () => {
    const p = getCurrentProject();
    if (!p) return;
    if (!confirm(`Supprimer la note "${p.name}" ?`)) return;
    await api(`api/projects/${p.id}`, { method: "DELETE" });
    state.currentProjectId = null;
    state.currentTabId = null;
    await loadProjects();
  };

  const btnExport = $("btnExportProject");
  if (btnExport) {
    btnExport.onclick = () => {
      const p = getCurrentProject();
      const t = getCurrentTab();
      if (!p || !t) return;
      const blob = new Blob([t.content || ""], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${p.name}.md`;
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  $("content").addEventListener("input", () => {
    scheduleSave();
  });

  $("content").addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      insertAtCursor("  "); // Insert 2 spaces for tab
    }
  });

  $("content").addEventListener("paste", handlePaste);

  $("btnWrapCode").onclick = wrapSelectionInCode;

  $("btnTogglePreview").onclick = () => {
    openPreviewWindow($("content").value);
  };

  $("imageInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveState("upload image…");
    try {
      const { url } = await uploadImageFile(file);
      insertAtCursor(`\n![image](${url})\n`);
      setSaveState("image ajoutée");
    } catch (err) {
      console.error(err);
      setSaveState("upload échoué");
    } finally {
      e.target.value = "";
    }
  });
}

function render() {
  renderProjects();
  renderEditor();
}

(async function init() {
  configureMarked();
  bindEvents();
  await loadProjects();
})();
