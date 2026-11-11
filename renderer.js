document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // Références DOM
  // =========================
  const taskInput = document.getElementById("task-input");
  const importantInput = document.getElementById("important-input");
  const deadlineInput = document.getElementById("deadline-input");
  const addButton = document.getElementById("add-task");

  const todoZone = document.getElementById("todo-zone");
  const archiveZone = document.getElementById("archive-zone");

  const searchInput = document.getElementById("search-input");
  const filterButtons = document.querySelectorAll(".filter-btn");

  const statsTotal = document.getElementById("stats-total");
  const statsActive = document.getElementById("stats-active");
  const statsArchived = document.getElementById("stats-archived");
  const todoCount = document.getElementById("todo-count");
  const archiveCount = document.getElementById("archive-count");

  // =========================
  // État de l'application
  // =========================

  // Toutes les tâches sont stockées ici.
  let tasks = [];

  // Filtre courant : all / active / archived / important
  let currentFilter = "all";

  // Texte de recherche courant
  let currentSearch = "";

  // IMPORTANT :
  // - null  => on crée une nouvelle tâche
  // - string => on modifie une tâche existante
  //
  // C'est ça qui remplace les prompt().
  let editingTaskId = null;

  // =========================
  // Stockage
  // =========================
   const STORAGE_KEY = "todo-app:v1";
  const LEGACY_KEY = "tasks"; // ancienne clé, lue une fois pour ne rien perdre
  const errorBanner = document.getElementById("error-banner");

  function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
  }

  function hideError() {
    errorBanner.hidden = true;
  }

  // Nettoie ce qu'on lit : on ne fait jamais confiance au stockage.
  function sanitizeTasks(parsed) {
    if (!Array.isArray(parsed)) return [];
    return parsed.map((task) => ({
      id:
        typeof task.id === "string" || typeof task.id === "number"
          ? String(task.id)
          : crypto.randomUUID(),
      text: typeof task.text === "string" ? task.text : "",
      archived: Boolean(task.archived),
      important: Boolean(task.important),
      deadline: typeof task.deadline === "string" ? task.deadline : "",
      createdAt:
        typeof task.createdAt === "string"
          ? task.createdAt
          : new Date().toISOString(),
    }));
  }

  // L'ancien format est un tableau, le nouveau est { version, tasks }.
  function readStored(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : data.tasks;
  }

  function loadTasks() {
    // On essaie dans l'ordre : données actuelles, copie précédente, ancien format.
    for (const key of [STORAGE_KEY, `${STORAGE_KEY}:previous`, LEGACY_KEY]) {
      try {
        const stored = readStored(key);
        if (Array.isArray(stored)) {
          tasks = sanitizeTasks(stored);
          return;
        }
      } catch (error) {
        console.error(`Lecture impossible (${key}) :`, error);
      }
    }
    tasks = [];
  }

  function saveTasks() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current) localStorage.setItem(`${STORAGE_KEY}:previous`, current);

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          savedAt: new Date().toISOString(),
          tasks,
        })
      );
      hideError();
      return true;
    } catch (error) {
      console.error("Sauvegarde impossible :", error);
      showError("Sauvegarde impossible : tes dernières modifications ne sont pas enregistrées.");
      return false;
    }
  }

  // =========================
  // Utilitaires
  // =========================
  function createTask(text, important, deadline) {
    return {
      // randomUUID() est plus propre qu'un Date.now() bricolé
      id: crypto.randomUUID(),
      text: text.trim(),
      archived: false,
      important,
      deadline: deadline || "",
      createdAt: new Date().toISOString(),
    };
  }

  function normalizeDateInput(value) {
    // On accepte seulement YYYY-MM-DD
    if (!value) return "";
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  }

  function isOverdue(task) {
    // Une tâche archivée ne doit pas être considérée "en retard"
    if (!task.deadline || task.archived) return false;

    const dueDate = new Date(`${task.deadline}T00:00:00`);
    if (Number.isNaN(dueDate.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return dueDate < today;
  }

  function formatDeadline(deadline) {
    if (!deadline) return "Pas de deadline";

    const date = new Date(`${deadline}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "Date invalide";

    return date.toLocaleDateString("fr-CH");
  }

  function getTaskById(id) {
    return tasks.find((task) => task.id === id);
  }

  function getVisibleTasks() {
    const search = currentSearch.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesSearch = task.text.toLowerCase().includes(search);

      const matchesFilter =
        currentFilter === "all" ||
        (currentFilter === "active" && !task.archived) ||
        (currentFilter === "archived" && task.archived) ||
        (currentFilter === "important" && task.important);

      return matchesSearch && matchesFilter;
    });
  }

  function resetForm() {
    // On remet le formulaire dans son état normal
    taskInput.value = "";
    importantInput.checked = false;
    deadlineInput.value = "";
    editingTaskId = null;
    addButton.textContent = "Ajouter la tâche";
    taskInput.focus();
  }

  // =========================
  // Logique métier
  // =========================
  function addTask() {
    const text = taskInput.value.trim();
    const important = importantInput.checked;
    const deadline = normalizeDateInput(deadlineInput.value);

    // On refuse une tâche vide
    if (!text) return;

    // MODE ÉDITION
    if (editingTaskId !== null) {
      const task = getTaskById(editingTaskId);
      if (!task) return;

      task.text = text;
      task.important = important;
      task.deadline = deadline;

      // Une fois enregistré, on repasse en mode création
      resetForm();
    } else {
      // MODE CRÉATION
      tasks.unshift(createTask(text, important, deadline));
      resetForm();
    }

    saveTasks();
    renderTasks();
  }

  function startEditingTask(id) {
    const task = getTaskById(id);
    if (!task) return;

    // On remplit le formulaire avec la tâche existante
    taskInput.value = task.text;
    importantInput.checked = task.important;
    deadlineInput.value = task.deadline || "";

    // On passe en mode édition
    editingTaskId = id;
    addButton.textContent = "Enregistrer les modifications";

    taskInput.focus();
  }

  function toggleImportant(id) {
    const task = getTaskById(id);
    if (!task) return;

    task.important = !task.important;
    saveTasks();
    renderTasks();
  }

  function deleteTask(id) {
    // Confirmation minimum avant suppression
    const confirmed = window.confirm("Supprimer cette tâche ?");
    if (!confirmed) return;

    tasks = tasks.filter((task) => task.id !== id);

    // Si on supprimait une tâche qu'on était en train d'éditer,
    // on nettoie aussi le formulaire.
    if (editingTaskId === id) {
      resetForm();
    }

    saveTasks();
    renderTasks();
  }

  function toggleArchive(id, archived) {
    const task = getTaskById(id);
    if (!task) return;

    task.archived = archived;

    // Si on archive une tâche pendant qu'on l'édite,
    // on garde le comportement simple : on quitte l'édition.
    if (editingTaskId === id) {
      resetForm();
    }

    saveTasks();
    renderTasks();
  }

  function moveTask(id, direction) {
    // On travaille sur les tâches visibles,
    // car l'utilisateur déplace ce qu'il voit.
    const visibleTasks = getVisibleTasks();
    const visibleIndex = visibleTasks.findIndex((task) => task.id === id);

    if (visibleIndex === -1) return;

    const targetVisibleIndex =
      direction === "up" ? visibleIndex - 1 : visibleIndex + 1;

    // Si on est déjà tout en haut ou tout en bas, on stoppe.
    if (
      targetVisibleIndex < 0 ||
      targetVisibleIndex >= visibleTasks.length
    ) {
      return;
    }

    const currentTask = visibleTasks[visibleIndex];
    const targetTask = visibleTasks[targetVisibleIndex];

    // On retrouve leur position réelle dans le tableau global tasks
    const realIndex = tasks.findIndex((task) => task.id === currentTask.id);
    const realTargetIndex = tasks.findIndex((task) => task.id === targetTask.id);

    if (realIndex === -1 || realTargetIndex === -1) return;

    // Swap simple
    [tasks[realIndex], tasks[realTargetIndex]] = [
      tasks[realTargetIndex],
      tasks[realIndex],
    ];

    saveTasks();
    renderTasks();
  }

  // =========================
  // Stats
  // =========================
  function updateStats() {
    const total = tasks.length;
    const active = tasks.filter((task) => !task.archived).length;
    const archived = tasks.filter((task) => task.archived).length;

    statsTotal.textContent = `${total} ${total > 1 ? "tâches" : "tâche"}`;
    statsActive.textContent = `${active} active${active > 1 ? "s" : ""}`;
    statsArchived.textContent = `${archived} archivée${archived > 1 ? "s" : ""}`;

    todoCount.textContent = String(active);
    archiveCount.textContent = String(archived);
  }

  // =========================
  // Rendu
  // =========================
  function buildEmptyState(message) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = message;
    return empty;
  }

  function renderTask(task, visibleIndex, visibleLength) {
    const taskCard = document.createElement("article");
    taskCard.className = "task-card";

    if (task.important) taskCard.classList.add("important-task");
    if (isOverdue(task)) taskCard.classList.add("overdue-task");
    if (task.archived) taskCard.classList.add("archived-task");

    const topRow = document.createElement("div");
    topRow.className = "task-top-row";

    const checkboxLabel = document.createElement("label");
    checkboxLabel.className = "checkbox-wrap";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.archived;
    checkbox.setAttribute("aria-label", "Archiver la tâche");
    checkbox.addEventListener("change", () => {
      toggleArchive(task.id, checkbox.checked);
    });

    const checkboxText = document.createElement("span");
    checkboxText.textContent = task.archived ? "Archivée" : "En cours";

    checkboxLabel.appendChild(checkbox);
    checkboxLabel.appendChild(checkboxText);

    const badges = document.createElement("div");
    badges.className = "badges";

    if (task.important) {
      const badge = document.createElement("span");
      badge.className = "badge important-badge";
      badge.textContent = "Important";
      badges.appendChild(badge);
    }

    if (isOverdue(task)) {
      const badge = document.createElement("span");
      badge.className = "badge overdue-badge";
      badge.textContent = "En retard";
      badges.appendChild(badge);
    }

    topRow.appendChild(checkboxLabel);
    topRow.appendChild(badges);

    const text = document.createElement("p");
    text.className = "task-text";
    text.textContent = task.text;

    const meta = document.createElement("div");
    meta.className = "task-meta";

const deadline = document.createElement("span");
deadline.textContent = `Deadline : ${formatDeadline(task.deadline)}`;
meta.appendChild(deadline);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary-btn";
    editBtn.textContent = editingTaskId === task.id ? "En cours d’édition" : "Modifier";
    editBtn.addEventListener("click", () => startEditingTask(task.id));

    const importantBtn = document.createElement("button");
    importantBtn.type = "button";
    importantBtn.className = "secondary-btn";
    importantBtn.textContent = task.important
      ? "Retirer important"
      : "Rendre important";
    importantBtn.addEventListener("click", () => toggleImportant(task.id));

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "icon-btn";
    upBtn.textContent = "↑";
    upBtn.setAttribute("aria-label", "Monter");
    upBtn.disabled = visibleIndex === 0;
    upBtn.addEventListener("click", () => moveTask(task.id, "up"));

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "icon-btn";
    downBtn.textContent = "↓";
    downBtn.setAttribute("aria-label", "Descendre");
    downBtn.disabled = visibleIndex === visibleLength - 1;
    downBtn.addEventListener("click", () => moveTask(task.id, "down"));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger-btn";
    deleteBtn.textContent = "Supprimer";
    deleteBtn.addEventListener("click", () => deleteTask(task.id));

    actions.append(
      editBtn,
      importantBtn,
      upBtn,
      downBtn,
      deleteBtn
    );

    taskCard.append(topRow, text, meta, actions);
    return taskCard;
  }

  function renderTasks() {
    todoZone.innerHTML = "";
    archiveZone.innerHTML = "";

    const visibleTasks = getVisibleTasks();
    const visibleActive = visibleTasks.filter((task) => !task.archived);
    const visibleArchived = visibleTasks.filter((task) => task.archived);

    if (visibleActive.length === 0) {
      todoZone.appendChild(
        buildEmptyState(
          currentSearch || currentFilter !== "all"
            ? "Aucune tâche active ne correspond aux filtres."
            : "Aucune tâche active pour le moment."
        )
      );
    } else {
      visibleActive.forEach((task, index) => {
        todoZone.appendChild(renderTask(task, index, visibleActive.length));
      });
    }

    if (visibleArchived.length === 0) {
      archiveZone.appendChild(
        buildEmptyState(
          currentSearch || currentFilter !== "all"
            ? "Aucune archive ne correspond aux filtres."
            : "Aucune tâche archivée."
        )
      );
    } else {
      visibleArchived.forEach((task, index) => {
        archiveZone.appendChild(renderTask(task, index, visibleArchived.length));
      });
    }

    updateStats();
  }

  // =========================
  // Événements
  // =========================
  addButton.addEventListener("click", addTask);

  taskInput.addEventListener("keydown", (event) => {
    // Raccourci pratique pour valider vite
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      addTask();
    }
  });

  searchInput.addEventListener("input", (event) => {
    currentSearch = event.target.value;
    renderTasks();
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter || "all";

      filterButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      renderTasks();
    });
  });

  // =========================
  // Initialisation
  // =========================
  loadTasks();
  renderTasks();
  resetForm();
});
