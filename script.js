//script.js — Personal Dashboard application logic

// =============================================================================
// STORAGE LAYER
// =============================================================================

/**
 * Keys used for all localStorage reads and writes.
 * Prefixed with "pd_" to avoid collisions with other apps on the same origin.
 */
const STORAGE_KEYS = {
  NAME: "pd_name",
  TASKS: "pd_tasks",
  LINKS: "pd_links",
  DURATION: "pd_duration",
  THEME: "pd_theme"
};

/**
 * Serialises `value` to JSON and writes it to localStorage under `key`.
 * Silently swallows any error (e.g. storage quota exceeded, private-browsing
 * restrictions) so the rest of the application can continue with in-memory
 * state for the current session.
 *
 * @param {string} key   - A STORAGE_KEYS value.
 * @param {*}      value - Any JSON-serialisable value.
 */
function saveKey(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_err) {
    // Storage unavailable — fail silently.
  }
}

/**
 * Reads the value stored under `key` from localStorage and deserialises it
 * from JSON. Returns `defaultValue` when:
 *   - the key is absent (getItem returns null),
 *   - the stored string is not valid JSON (parse error), or
 *   - localStorage itself throws (storage unavailable).
 *
 * @param {string} key          - A STORAGE_KEYS value.
 * @param {*}      defaultValue - Fallback returned on any failure.
 * @returns {*} The parsed value, or `defaultValue`.
 */
function loadKey(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return defaultValue;
    }
    return JSON.parse(raw);
  } catch (_err) {
    return defaultValue;
  }
}

// =============================================================================
// THEME (Requirement 7)
// =============================================================================

/**
 * Applies the given theme by setting the `data-theme` attribute on the
 * `<html>` element.
 *
 * @param {"light"|"dark"} theme - The theme to apply.
 */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Reads the persisted theme preference from localStorage (defaulting to
 * "light") and immediately applies it via `applyTheme()`.
 * Called synchronously at the top of this file, before DOMContentLoaded,
 * so the correct theme is in place before first paint (prevents FOUC).
 */
function initTheme() {
  const theme = loadKey(STORAGE_KEYS.THEME, "light");
  applyTheme(theme);
}

/**
 * Reads the current `data-theme` attribute from `<html>`, flips it between
 * "light" and "dark", persists the new value to localStorage, and applies it.
 */
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const newTheme = current === "dark" ? "light" : "dark";
  saveKey(STORAGE_KEYS.THEME, newTheme);
  applyTheme(newTheme);
}

// Initialise theme immediately — before DOMContentLoaded — to prevent FOUC.
initTheme();

// =============================================================================
// GREETING WIDGET (Requirements 1, 2)
// =============================================================================

/**
 * Returns a time-appropriate greeting string based on the given hour (0–23).
 *
 * Ranges:
 *   05–11 → "Good morning"
 *   12–17 → "Good afternoon"
 *   18–21 → "Good evening"
 *   22–23, 0–4 → "Good night"
 *
 * @param {number} hour - Integer hour in the range 0–23.
 * @returns {"Good morning"|"Good afternoon"|"Good evening"|"Good night"}
 */
function getGreeting(hour) {
  if (hour >= 5 && hour <= 11) return "Good morning";
  if (hour >= 12 && hour <= 17) return "Good afternoon";
  if (hour >= 18 && hour <= 21) return "Good evening";
  return "Good night"; // 22–23 and 0–4
}

/**
 * Formats a Date object as a zero-padded 24-hour "HH:MM:SS" string.
 *
 * @param {Date} date - The date/time to format.
 * @returns {string} e.g. "09:05" or "14:30"
 */
function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Formats a Date object as a "Weekday, Month Day" string.
 *
 * @param {Date} date - The date to format.
 * @returns {string} e.g. "Monday, July 14"
 */
function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

/**
 * Reads the current Date, derives the greeting/time/date strings, and updates
 * the corresponding DOM elements. Appends the saved name (if any) to the
 * greeting. Called on page load and every 60 seconds via setInterval.
 */
function updateGreetingWidget() {
  const date = new Date();
  const greeting = getGreeting(date.getHours());
  const name = loadKey(STORAGE_KEYS.NAME, "");

  const greetingText = name ? `${greeting}, ${name}` : greeting;

  document.getElementById("greeting-text").textContent = greetingText;
  document.getElementById("time-display").textContent = formatTime(date);
  document.getElementById("date-display").textContent = formatDate(date);
}

/**
 * Reads the value from `#name-input`, trims whitespace, persists it to
 * localStorage, and refreshes the greeting widget.
 */
function saveName() {
  const input = document.getElementById("name-input");
  const trimmedName = input.value.trim();
  saveKey(STORAGE_KEYS.NAME, trimmedName);
  updateGreetingWidget();
}

/**
 * Clears the saved name from localStorage, empties the `#name-input` field,
 * and refreshes the greeting widget.
 */
function clearName() {
  saveKey(STORAGE_KEYS.NAME, "");
  document.getElementById("name-input").value = "";
  updateGreetingWidget();
}

// =============================================================================
// FOCUS TIMER WIDGET (Requirements 3, 4)
// =============================================================================

/**
 * Formats a total number of seconds as a zero-padded "MM:SS" string.
 *
 * @param {number} seconds - Non-negative integer number of seconds (0–7200).
 * @returns {string} e.g. "00:00", "01:30", "25:00"
 */
function formatTimerDisplay(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
}

/**
 * Creates and returns a timer controller object (closure).
 * Encapsulates `intervalId` and `remainingSeconds` as private state.
 *
 * Exposes:
 *   start()              — begin countdown; no-op if already running
 *   stop()               — pause countdown, retain remaining time
 *   reset()              — stop and restore to full duration
 *   setDuration(minutes) — set duration; updates display if not running
 *
 * Timer state machine:
 *   IDLE ──start()──► RUNNING ──stop()──► PAUSED
 *     ▲                  │                  │
 *     └──reset()─────────┘                  │
 *     ▲                                     │
 *     └──────────────reset()────────────────┘
 *   RUNNING ──reaches 00:00──► COMPLETE (auto-stop + notification)
 *
 * @returns {{ start: Function, stop: Function, reset: Function, setDuration: Function }}
 */
function createTimer() {
  let intervalId = null;
  let remainingSeconds = 25 * 60; // default 25 minutes
  let durationSeconds = 25 * 60;  // full duration for reset

  /**
   * Updates the #timer-display element with the current remainingSeconds.
   */
  function updateDisplay() {
    const el = document.getElementById("timer-display");
    if (el) {
      el.textContent = formatTimerDisplay(remainingSeconds);
    }
  }

  /**
   * Handles timer completion: stops interval, shows notification, plays beep.
   */
  function onComplete() {
    clearInterval(intervalId);
    intervalId = null;

    // Show completion message
    const msg = document.getElementById("timer-complete-msg");
    if (msg) {
      msg.style.display = "";
    }

    // Attempt to play a short audio beep (silent on failure)
    try {
      // Minimal valid WAV: 44-byte header + 1 sample of silence, encoded as base64
      const audio = new Audio(
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="
      );
      audio.play();
    } catch (_e) {
      // Silent — audio not supported or blocked
    }
  }

  return {
    /**
     * Starts the countdown. No-op if the timer is already running.
     */
    start() {
      if (intervalId !== null) {
        return; // Guard against double-click
      }
      intervalId = setInterval(function () {
        remainingSeconds -= 1;
        updateDisplay();
        if (remainingSeconds <= 0) {
          remainingSeconds = 0;
          updateDisplay();
          onComplete();
        }
      }, 1000);
    },

    /**
     * Pauses the countdown, retaining the remaining time.
     */
    stop() {
      clearInterval(intervalId);
      intervalId = null;
    },

    /**
     * Stops the countdown, restores remainingSeconds to the full duration,
     * updates the display, and hides the completion message.
     */
    reset() {
      clearInterval(intervalId);
      intervalId = null;
      remainingSeconds = durationSeconds;
      updateDisplay();
      const msg = document.getElementById("timer-complete-msg");
      if (msg) {
        msg.style.display = "none";
      }
    },

    /**
     * Sets the timer duration. If the timer is not currently running,
     * also updates remainingSeconds and refreshes the display.
     *
     * @param {number} minutes - Integer minutes (1–120).
     */
    setDuration(minutes) {
      durationSeconds = minutes * 60;
      if (intervalId === null) {
        remainingSeconds = durationSeconds;
        updateDisplay();
      }
    }
  };
}

/** Global timer instance used by all timer UI controls. */
const timer = createTimer();

/**
 * Reads `#duration-input`, validates that the value is a whole number in the
 * range 1–120, and either:
 *   - Shows `#duration-error` and returns (on failure), or
 *   - Hides `#duration-error`, persists the value, calls timer.setDuration(),
 *     and resets the display (on success).
 */
function saveDuration() {
  const input = document.getElementById("duration-input");
  const errorEl = document.getElementById("duration-error");
  const raw = input ? input.value : "";
  const parsed = Number(raw);

  // Must be a finite integer in the range 1–120
  const isValid =
    raw.trim() !== "" &&
    Number.isInteger(parsed) &&
    parsed >= 1 &&
    parsed <= 120;

  if (!isValid) {
    if (errorEl) {
      errorEl.style.display = "";
      errorEl.textContent = "Please enter a whole number between 1 and 120";
    }
    return;
  }

  if (errorEl) {
    errorEl.style.display = "none";
  }

  const minutes = parsed;
  saveKey(STORAGE_KEYS.DURATION, minutes);
  timer.setDuration(minutes);
  timer.reset();
}

/**
 * Reads the persisted Pomodoro duration from localStorage (default 25),
 * initialises the timer, and updates the display.
 */
function initTimer() {
  const duration = loadKey(STORAGE_KEYS.DURATION, 25);
  timer.setDuration(duration);
  const displayEl = document.getElementById("timer-display");
  if (displayEl) {
    displayEl.textContent = formatTimerDisplay(duration * 60);
  }
}

// =============================================================================
// TO-DO LIST WIDGET (Requirement 5)
// =============================================================================

/** In-memory tasks array. Populated by loadTasks() on page load. */
let tasks = [];

/**
 * Reads the tasks array from localStorage (default []) and assigns it to the
 * module-level `tasks` variable.
 *
 * @returns {Array} The loaded tasks array.
 */
function loadTasks() {
  tasks = loadKey(STORAGE_KEYS.TASKS, []);
  return tasks;
}

/**
 * Rebuilds the `#todo-list` <ul> element from the current in-memory `tasks`
 * array. Each <li> contains:
 *   - A checkbox (checked when task.completed)
 *   - A <span> for task text (class="completed" when task.completed)
 *   - An Edit / Save button
 *   - A Delete button
 *
 * Inline edit: clicking Edit replaces the span with a pre-filled <input> and
 * changes the button label to "Save". Clicking Save calls editTask(id, newText).
 */
function renderTasks() {
  const list = document.getElementById("todo-list");
  if (!list) return;

  list.innerHTML = "";

  tasks.forEach(function (task) {
    const li = document.createElement("li");
    li.className = "todo-item";

    // --- Checkbox ---
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", "Mark task complete: " + task.text);
    checkbox.onchange = function () {
      toggleTask(task.id);
    };

    // --- Text span ---
    const span = document.createElement("span");
    span.textContent = task.text;
    if (task.completed) {
      span.className = "completed";
    }

    // --- Edit button ---
    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.setAttribute("aria-label", "Edit task: " + task.text);
    editBtn.onclick = function () {
      if (editBtn.textContent === "Edit") {
        // Switch to edit mode: replace span with input
        const editInput = document.createElement("input");
        editInput.type = "text";
        editInput.value = task.text;
        editInput.setAttribute("aria-label", "Edit text for task: " + task.text);
        li.replaceChild(editInput, span);
        editBtn.textContent = "Save";
        editInput.focus();
      } else {
        // Save mode: read new text and persist
        const editInput = li.querySelector("input[type='text']");
        const newText = editInput ? editInput.value : task.text;
        editTask(task.id, newText);
      }
    };

    // --- Delete button ---
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.setAttribute("aria-label", "Delete task: " + task.text);
    deleteBtn.onclick = function () {
      deleteTask(task.id);
    };

    li.appendChild(checkbox);
    li.appendChild(span);
    li.appendChild(editBtn);
    li.appendChild(deleteBtn);
    list.appendChild(li);
  });
}

/**
 * Reads the `#todo-input` value, trims whitespace, and rejects empty/whitespace
 * input (keeping focus on the input). Otherwise creates a new task object,
 * appends it to the tasks array, persists to localStorage, clears the input,
 * and re-renders the list.
 */
function addTask() {
  const input = document.getElementById("todo-input");
  if (!input) return;

  const trimmedText = input.value.trim();
  if (!trimmedText) {
    input.focus();
    return;
  }

  const id = Date.now().toString();
  const newTask = { id: id, text: trimmedText, completed: false };
  tasks.push(newTask);
  saveKey(STORAGE_KEYS.TASKS, tasks);
  input.value = "";
  renderTasks();
}

/**
 * Removes the task with the given id from the tasks array, persists the
 * updated array to localStorage, and re-renders the list.
 *
 * @param {string} id - The id of the task to remove.
 */
function deleteTask(id) {
  tasks = tasks.filter(function (t) { return t.id !== id; });
  saveKey(STORAGE_KEYS.TASKS, tasks);
  renderTasks();
}

/**
 * Flips the `completed` boolean of the task with the given id, persists the
 * updated array to localStorage, and re-renders the list.
 *
 * @param {string} id - The id of the task to toggle.
 */
function toggleTask(id) {
  const task = tasks.find(function (t) { return t.id === id; });
  if (task) {
    task.completed = !task.completed;
    saveKey(STORAGE_KEYS.TASKS, tasks);
    renderTasks();
  }
}

/**
 * Updates the text of the task with the given id, persists the updated array
 * to localStorage, and re-renders the list.
 *
 * @param {string} id      - The id of the task to edit.
 * @param {string} newText - The replacement text.
 */
function editTask(id, newText) {
  const task = tasks.find(function (t) { return t.id === id; });
  if (task) {
    task.text = newText;
    saveKey(STORAGE_KEYS.TASKS, tasks);
    renderTasks();
  }
}

// =============================================================================
// QUICK LINKS WIDGET (Requirement 6)
// =============================================================================

/** In-memory links array. Populated by loadLinks() on page load. */
let links = [];

/**
 * Reads the links array from localStorage (default []) and assigns it to the
 * module-level `links` variable.
 *
 * @returns {Array} The loaded links array.
 */
function loadLinks() {
  links = loadKey(STORAGE_KEYS.LINKS, []);
  return links;
}

/**
 * Rebuilds the `#links-container` element from the current in-memory `links`
 * array. Each entry renders as a `<div class="link-item">` containing:
 *   - An `<a>` element with href, target="_blank", rel="noopener noreferrer",
 *     and text equal to link.label (or link.url if label is absent).
 *   - A Delete `<button>` wired to deleteLink(link.id).
 */
function renderLinks() {
  const container = document.getElementById("links-container");
  if (!container) return;

  container.innerHTML = "";

  links.forEach(function (link) {
    const item = document.createElement("div");
    item.className = "link-item";

    // --- Anchor ---
    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.label || link.url;

    // --- Delete button ---
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.setAttribute("aria-label", "Delete link: " + (link.label || link.url));
    deleteBtn.onclick = function () {
      deleteLink(link.id);
    };

    item.appendChild(anchor);
    item.appendChild(deleteBtn);
    container.appendChild(item);
  });
}

/**
 * Reads `#link-label-input` and `#link-url-input`, trims both values, and
 * rejects an empty/whitespace URL (keeping focus on the URL input). If the
 * label is empty, the URL is used as the label. Creates a new link object,
 * appends it to the links array, persists to localStorage, clears both inputs,
 * and re-renders the links container.
 */
function addLink() {
  const labelInput = document.getElementById("link-label-input");
  const urlInput = document.getElementById("link-url-input");
  if (!urlInput) return;

  const trimmedUrl = urlInput.value.trim();
  const trimmedLabel = labelInput ? labelInput.value.trim() : "";

  if (!trimmedUrl) {
    urlInput.focus();
    return;
  }

  const id = Date.now().toString();
  const newLink = {
    id: id,
    label: trimmedLabel || trimmedUrl,
    url: trimmedUrl
  };

  links.push(newLink);
  saveKey(STORAGE_KEYS.LINKS, links);

  if (labelInput) labelInput.value = "";
  urlInput.value = "";

  renderLinks();
}

/**
 * Removes the link with the given id from the links array, persists the
 * updated array to localStorage, and re-renders the links container.
 *
 * @param {string} id - The id of the link to remove.
 */
function deleteLink(id) {
  links = links.filter(function (l) { return l.id !== id; });
  saveKey(STORAGE_KEYS.LINKS, links);
  renderLinks();
}

// =============================================================================
// INITIALISATION AND WIRING (Requirement 1.1)
// =============================================================================

document.addEventListener("DOMContentLoaded", function () {
  // --- Timer ---
  initTimer();

  // --- To-do list ---
  loadTasks();
  renderTasks();

  // --- Quick links ---
  loadLinks();
  renderLinks();

  // --- Greeting widget ---
  updateGreetingWidget();
  setInterval(updateGreetingWidget, 60000); // Requirement 1.1: update every 60 seconds

  // --- Restore saved name into the input field ---
  document.getElementById("name-input").value = loadKey(STORAGE_KEYS.NAME, "");

  // --- Timer control buttons (no inline onclick in HTML) ---
  document.getElementById("timer-start-btn").addEventListener("click", function () {
    timer.start();
  });
  document.getElementById("timer-stop-btn").addEventListener("click", function () {
    timer.stop();
  });
  document.getElementById("timer-reset-btn").addEventListener("click", function () {
    timer.reset();
  });

  // --- Enter key support for inputs ---
  document.getElementById("todo-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      addTask();
    }
  });

  document.getElementById("name-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      saveName();
    }
  });

  document.getElementById("link-url-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      addLink();
    }
  });
});
