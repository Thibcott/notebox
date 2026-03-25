let state = {
  projects: [],
  currentProjectId: null
};

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(url, opts = {}) {
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

async function loadProjects() {
  state.projects = await api("api/projects");
  sortProjects();
  if (!state.currentProjectId && state.projects.length > 0) {
    state.currentProjectId = state.projects[0].id;
  }
  render();
}

function sortProjects() {
  state.projects.sort((a, b) => new Date(maxUpdatedAt(b)) - new Date(maxUpdatedAt(a)));
}

function maxUpdatedAt(p) {
  if (!p.tabs || p.tabs.length === 0) return p.createdAt;
  return p.tabs.reduce((max, tab) => (tab.updatedAt > max ? tab.updatedAt : max), p.tabs[0].updatedAt) || p.createdAt;
}

function getCurrentProject() {
  return state.projects.find(p => p.id === state.currentProjectId) || null;
}

function renderProjects() {
  const wrap = $("projects");
  wrap.innerHTML = "";
  for (const p of state.projects) {
    const defaultTasks = p.tasks || [];
    const pendingCount = defaultTasks.filter(t => !t.completed).length;
    
    const div = document.createElement("div");
    div.className = "project" + (p.id === state.currentProjectId ? " active" : "");
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${escapeHtml(p.name)}</strong>
        ${pendingCount > 0 ? `<span style="background:#0078d4; color:#fff; font-size:10px; padding:2px 6px; border-radius:10px;">${pendingCount}</span>` : ''}
      </div>
    `;
    div.onclick = () => {
      state.currentProjectId = p.id;
      render();
    };
    wrap.appendChild(div);
  }
}

function renderTasks() {
  const p = getCurrentProject();
  if (!p) {
    $("currentProjectName").textContent = "—";
    $("taskList").innerHTML = "<div class='hint' style='display:block;'>Aucun projet sélectionné</div>";
    return;
  }

  $("currentProjectName").textContent = p.name;
  
  const tasks = p.tasks || [];
  const list = $("taskList");
  list.innerHTML = "";
  
  if (tasks.length === 0) {
    list.innerHTML = "<div class='hint' style='display:block; opacity:0.7; padding:20px;'>Aucune tâche pour ce projet.</div>";
    return;
  }

  // Sort tasks: pending first, completed last
  const sortedTasks = [...tasks].sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1));

  sortedTasks.forEach(task => {
    const div = document.createElement("div");
    div.className = "task-item" + (task.completed ? " completed" : "");
    div.innerHTML = `
      <div style="display:flex; align-items:center; flex:1; min-width:0;">
        <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} />
        <span class="task-title">${escapeHtml(task.title)}</span>
      </div>
      <button class="danger btnDeleteTask" style="padding:4px 8px; font-size:12px;">Suppr</button>
    `;
    
    // Toggle completion
    const checkbox = div.querySelector('.task-checkbox');
    checkbox.onchange = async () => {
      task.completed = checkbox.checked;
      renderTasks(); // optimistic ui update
      renderProjects(); // update count
      await api(`api/projects/${p.id}/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: task.completed })
      });
      await loadProjects(); // reload fully from db to be safe
    };
    
    // Delete task
    const btnDel = div.querySelector('.btnDeleteTask');
    btnDel.onclick = async () => {
      if (!confirm("Supprimer cette tâche ?")) return;
      await api(`api/projects/${p.id}/tasks/${task.id}`, { method: "DELETE" });
      await loadProjects();
    };
    
    list.appendChild(div);
  });
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

  const addTask = async () => {
    const p = getCurrentProject();
    if (!p) return;
    
    const input = $("newTaskTitle");
    const title = input.value.trim();
    if (!title) return;
    
    input.value = ""; // clear early
    await api(`api/projects/${p.id}/tasks`, {
      method: "POST",
      body: JSON.stringify({ title })
    });
    
    await loadProjects();
  };

  $("btnAddTask").onclick = addTask;
  $("newTaskTitle").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      addTask();
    }
  });
}

function render() {
  renderProjects();
  renderTasks();
}

(async function init() {
  bindEvents();
  await loadProjects();
})();
