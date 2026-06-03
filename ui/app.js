// ============================================================
//  Sidebar navigation (pure display — no backend involved)
// ============================================================
document.querySelectorAll(".nav-item[data-tab]").forEach(function (item) {
    item.addEventListener("click", function () {
        const target = item.dataset.tab;

        document.querySelectorAll(".nav-item[data-tab]").forEach(i => i.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));

        item.classList.add("active");
        document.getElementById("tab-" + target).classList.add("active");
    });
});

// ============================================================
//  Decorative "sound" visual — a continuously scrolling spectrogram
// ============================================================

// Pick a warm spectrogram colour: mostly orange/amber with pink/magenta
// highlights, and a fraction of near-black "quiet" cells.
function spectroColor() {
    const energy = Math.random();
    if (energy < 0.32) return "#0a0406"; // quiet region — near black
    const hue = Math.random() < 0.62
        ? 14 + Math.random() * 34    // 14–48   (orange/amber)
        : 300 + Math.random() * 38;  // 300–338 (pink/magenta)
    const light = 36 + energy * 30;
    return "hsl(" + hue + " 92% " + light + "%)";
}

// Build a static spectrogram grid (decorative — it does not animate).
function buildSpectro() {
    const el = document.getElementById("spectro");
    if (!el) return;
    const cols = 96;
    const rows = 8;
    el.style.gridTemplateColumns = "repeat(" + cols + ", 1fr)";

    for (let i = 0; i < cols * rows; i++) {
        const cell = document.createElement("span");
        cell.className = "cell";
        cell.style.background = spectroColor();
        el.appendChild(cell);
    }
}

function toggleTheme() {
    const light = document.body.classList.toggle("light");
    log(light ? "Switched to light mode." : "Switched to dark mode.");
}

// ============================================================
//  Status monitor — a continuously scrolling step line that sits flat,
//  then "jumps" high for a moment every time you click or interact with
//  the UI (and stays high while a backend call is running).
// ============================================================
let busyTasks = 0;     // running backend ops keep the line high
let pulseUntil = 0;    // brief high pulse after each interaction

// Make the line jump for a short window. Called on any click / interaction.
function activityPulse(ms) {
    // A quick reactive burst on the meter when you click / interact.
    pulseUntil = Math.max(pulseUntil, performance.now() + (ms || 220));
}

// A process is running: hold the line high for its duration AND guarantee a
// visible jump even if it completes in a single frame.
function activityStart() {
    busyTasks++;
    activityPulse();
}
function activityStop()  { busyTasks = Math.max(0, busyTasks - 1); }

function initActivityMonitor() {
    const eq = document.getElementById("eq");

    // Build the equalizer bars (alternating blue / pink).
    const COUNT = 18;
    const COLORS = ["#2E7DF6", "#EC4899"];
    const bars = [];
    if (eq) {
        for (let i = 0; i < COUNT; i++) {
            const bar = document.createElement("span");
            bar.className = "eq-bar";
            bar.style.background = COLORS[i % 2];
            eq.appendChild(bar);
            bars.push(bar);
        }

        // Clicking / interacting (or a running process) makes the meter react.
        document.addEventListener("click", function () { activityPulse(); });
        document.addEventListener("input", function () { activityPulse(); });

        // Set new bar targets; the CSS transition smooths the motion at 60 Hz+.
        function update() {
            const active = busyTasks > 0 || performance.now() < pulseUntil;
            for (let i = 0; i < COUNT; i++) {
                const s = active ? 0.2 + Math.random() * 0.8 : 0.05;
                bars[i].style.transform = "scaleY(" + s.toFixed(3) + ")";
            }
        }
        update();
        setInterval(update, 80);
    }
}

// Open a URL in the system browser (via the Python bridge when available).
function openUrl(url) {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.open_url) {
        window.pywebview.api.open_url(url);
    } else {
        window.open(url, "_blank");
    }
}

// ============================================================
//  Bottom log console
// ============================================================

// Append one timestamped line. `level`: "info" (default), "success", "error", "warn".
function log(message, level) {
    const body = document.getElementById("log-body");

    const placeholder = body.querySelector(".log-empty");
    if (placeholder) placeholder.remove();

    const now = new Date();
    const time = now.toTimeString().slice(0, 8); // HH:MM:SS

    const line = document.createElement("div");
    line.className = "log-line log-" + (level || "info");

    const stamp = document.createElement("span");
    stamp.className = "log-time";
    stamp.textContent = "[" + time + "]";

    line.appendChild(stamp);
    line.appendChild(document.createTextNode(message));
    body.appendChild(line);

    body.scrollTop = body.scrollHeight;
}

function clearLog() {
    const body = document.getElementById("log-body");
    body.innerHTML = '<div class="log-empty">Console cleared.</div>';
}

// Collapse / expand the console (the "Console" label is the toggle).
function toggleLog() {
    const collapsed = document.getElementById("log-console").classList.toggle("collapsed");
    document.body.classList.toggle("log-collapsed", collapsed);
}

// ============================================================
//  Save gating — Save to CSV is locked until validation passes
// ============================================================
let entryValidated = false;

function setSaveEnabled(enabled) {
    entryValidated = enabled;
    document.getElementById("save-btn").disabled = !enabled;
    const hint = document.getElementById("save-hint");
    hint.textContent = enabled ? "Entry validated — ready to save" : "Validate to unlock saving";
    hint.style.color = enabled ? "#34D399" : "";
}

// Any edit to the form invalidates the previous validation, so re-lock Save.
document.getElementById("entry-form").addEventListener("input", function () {
    if (entryValidated) {
        setSaveEnabled(false);
        log("Entry changed — re-validate before saving.", "warn");
    }
});

// Read every form field into one entry dict that matches FIELDS.
function collectEntry() {
    const ids = [
        "speaker_id", "language", "accent", "age_range", "gender",
        "mic_type", "gain_db", "room_id", "session_date",
        "file_name", "sample_rate", "bit_depth", "duration_sec",
        "qc_status", "notes",
    ];
    const entry = {};
    ids.forEach(id => entry[id] = document.getElementById(id).value);
    return entry;
}

// ============================================================
//  Backend calls — each just calls Python and logs the result
// ============================================================

// validate_entry(entry) -> list[str]
async function runValidation() {
    const entry = collectEntry();
    log("Validating entry…");
    activityStart();
    try {
        const errors = await window.pywebview.api.validate(entry);

        if (errors.length === 0) {
            log("✓  Entry is valid — Save to CSV unlocked.", "success");
            setSaveEnabled(true);
        } else {
            log("✗  " + errors.length + " problem(s):", "error");
            errors.forEach(e => log("    • " + e, "error"));
            setSaveEnabled(false);
        }
    } finally {
        activityStop();
    }
}

// add_entry(entry, path) -> None  (wrapped to return a status dict)
async function saveEntry() {
    if (!entryValidated) {
        log("✗  Validate the entry before saving.", "error");
        return;
    }

    const entry = collectEntry();
    log("Saving entry to CSV…");
    activityStart();
    try {
        const result = await window.pywebview.api.save(entry);

        if (result.ok) {
            log("✓  " + result.message, "success");
        } else {
            log("✗  " + result.message, "error");
        }
        setSaveEnabled(false);
    } finally {
        activityStop();
    }
}

// load_entries(path) -> list[dict]  (wrapped to return a status dict)
async function loadEntries() {
    log("Loading entries…");
    activityStart();
    try {
        const result = await window.pywebview.api.load();

        if (!result.ok) {
            log("✗  " + result.message, "error");
            return;
        }

        const entries = result.entries;
        if (entries.length === 0) {
            log("No entries yet.", "warn");
            return;
        }

        log("✓  " + entries.length + " entr" + (entries.length === 1 ? "y" : "ies") + ":", "success");
        entries.forEach(function (e, i) {
            log("    " + (i + 1) + ".  " + e.file_name + "   [" + e.qc_status + "]");
        });
    } finally {
        activityStop();
    }
}

// find_duplicates(path) -> list[str]  (wrapped to return a status dict)
async function findDuplicates() {
    log("Scanning for duplicate file names…");
    activityStart();
    try {
        const result = await window.pywebview.api.duplicates();

        if (!result.ok) {
            log("✗  " + result.message, "error");
            return;
        }

        const dups = result.duplicates;
        if (dups.length === 0) {
            log("✓  No duplicate file names found.", "success");
        } else {
            log("✗  Duplicate file names:", "error");
            dups.forEach(d => log("    • " + d, "error"));
        }
    } finally {
        activityStop();
    }
}

// ============================================================
//  Initial state
// ============================================================
document.addEventListener("DOMContentLoaded", function () {
    buildSpectro();
    initActivityMonitor();
    clearLog();
    document.querySelector(".log-empty").textContent = "Ready. Backend output appears here.";
});
