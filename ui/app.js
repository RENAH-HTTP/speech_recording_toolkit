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
//  QC Check — folder picker, run, and four donut graphs
// ============================================================
let qcFolder = null;          // path of the currently selected folder
let qcAllFilesData = [];      // every .wav name in the folder (for the list)

// Enable the Run button only once a folder is chosen.
function setQcRunEnabled(enabled) {
    document.getElementById("qc-run-btn").disabled = !enabled;
}

// Ask Python to open a native folder dialog, then preload the file list.
async function pickQcFolder() {
    log("Opening folder picker…");
    activityStart();
    try {
        const result = await window.pywebview.api.pick_folder();
        if (!result.ok) {
            log("No folder selected.", "warn");
            return;
        }
        qcFolder = result.folder;
        document.getElementById("qc-folder").textContent = qcFolder;
        log("Folder selected: " + qcFolder, "success");
        setQcRunEnabled(true);

        // Preload the full .wav list so "Files checked" and the listing work
        // even before a check is run.
        const listed = await window.pywebview.api.list_files(qcFolder);
        if (listed.ok) {
            qcAllFilesData = listed.files;
            document.getElementById("qc-total").textContent = listed.files.length;
            renderQcAllFiles();
            document.getElementById("qc-files-panel").hidden = false;
            log(listed.files.length + " .wav file(s) found.", "info");
        }
    } finally {
        activityStop();
    }
}

// Run the audio_checker pipeline and draw the four graphs.
async function runQc() {
    if (!qcFolder) {
        log("✗  Choose a folder first.", "error");
        return;
    }
    log("Running QC checks on " + qcFolder + " …");
    activityStart();
    try {
        // run_qc gives the authoritative issue lists; file_metrics gives the
        // per-file numbers the line charts plot.
        const [response, metricsResp] = await Promise.all([
            window.pywebview.api.run_qc(qcFolder),
            window.pywebview.api.file_metrics(qcFolder),
        ]);
        if (!response.ok) {
            log("✗  " + response.message, "error");
            return;
        }
        if (!metricsResp.ok) {
            log("✗  " + metricsResp.message, "error");
            return;
        }
        renderQc(response.result, metricsResp.metrics);
    } finally {
        activityStop();
    }
}

// Build a real SVG line chart. config:
//   series:     [{ values:[…|null], color, dashed? }]  one polyline each
//   thresholds: [{ value, color, label }]              dashed horizontal lines
//   flagged:    Set of point indices to mark red (failed files)
//   yFormat:    fn(value) -> axis label string
function buildLineChart(config) {
    const W = 320, H = 150;
    const padL = 34, padR = 12, padT = 10, padB = 18;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;

    const series = config.series || [];
    const thresholds = config.thresholds || [];
    const flagged = config.flagged || new Set();
    const fmt = config.yFormat || (v => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(1)));

    // Number of points = longest series.
    const n = series.reduce((m, s) => Math.max(m, s.values.length), 0);
    if (n === 0) {
        return '<svg viewBox="0 0 ' + W + ' ' + H + '">' +
            '<text class="qc-empty-text" x="' + (W / 2) + '" y="' + (H / 2) +
            '" text-anchor="middle">No files to plot</text></svg>';
    }

    // Y range across all finite series values and thresholds.
    let lo = Infinity, hi = -Infinity;
    series.forEach(s => s.values.forEach(v => {
        if (v !== null && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }));
    thresholds.forEach(t => { lo = Math.min(lo, t.value); hi = Math.max(hi, t.value); });
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;

    const xFor = i => n > 1 ? x0 + (x1 - x0) * (i / (n - 1)) : (x0 + x1) / 2;
    const yFor = v => y1 - (y1 - y0) * ((v - lo) / (hi - lo));

    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '">';

    // Horizontal gridlines + y-axis labels (3 rows).
    for (let g = 0; g <= 2; g++) {
        const val = lo + (hi - lo) * (g / 2);
        const y = yFor(val);
        svg += '<line class="qc-grid-line" x1="' + x0 + '" y1="' + y.toFixed(1) +
            '" x2="' + x1 + '" y2="' + y.toFixed(1) + '"></line>';
        svg += '<text class="qc-axis-text" x="' + (x0 - 4) + '" y="' + (y + 3).toFixed(1) +
            '" text-anchor="end">' + escapeHtml(fmt(val)) + '</text>';
    }

    // Threshold lines.
    thresholds.forEach(function (t) {
        const y = yFor(t.value);
        svg += '<line class="qc-threshold" x1="' + x0 + '" y1="' + y.toFixed(1) +
            '" x2="' + x1 + '" y2="' + y.toFixed(1) + '" stroke="' + t.color + '"></line>';
        if (t.label) {
            svg += '<text class="qc-axis-text" x="' + (x1 - 2) + '" y="' + (y - 3).toFixed(1) +
                '" text-anchor="end" fill="' + t.color + '">' + escapeHtml(t.label) + '</text>';
        }
    });

    // Series polylines.
    series.forEach(function (s) {
        const pts = [];
        s.values.forEach(function (v, i) {
            if (v !== null && isFinite(v)) pts.push(xFor(i).toFixed(1) + "," + yFor(v).toFixed(1));
        });
        if (pts.length > 1) {
            svg += '<polyline class="qc-series" points="' + pts.join(" ") +
                '" stroke="' + s.color + '"' + (s.dashed ? ' stroke-dasharray="4 3"' : '') + '></polyline>';
        }
    });

    // Points on the primary (first) series, red where the file is flagged.
    if (series.length) {
        series[0].values.forEach(function (v, i) {
            if (v === null || !isFinite(v)) return;
            const bad = flagged.has(i);
            svg += '<circle cx="' + xFor(i).toFixed(1) + '" cy="' + yFor(v).toFixed(1) +
                '" r="' + (bad ? 3 : 2.2) + '" fill="' + (bad ? "#F87171" : series[0].color) + '"></circle>';
        });
    }

    return svg + '</svg>';
}

// Render one card: chart, legend, badge, subtitle, and the affected-file list.
function renderLineCard(key, opts) {
    const card = document.querySelector('.qc-card[data-key="' + key + '"]');
    card.querySelector("[data-chart]").innerHTML = buildLineChart(opts.chart);

    // Legend swatches.
    card.querySelector("[data-legend]").innerHTML = (opts.legend || []).map(function (item) {
        return '<span class="qc-swatch' + (item.dashed ? " dash" : "") +
            '" style="color:' + item.color + '">' + escapeHtml(item.label) + "</span>";
    }).join("");

    const badge = card.querySelector("[data-badge]");
    badge.textContent = opts.issues === 0 ? "Pass" : "Flagged";
    badge.className = "qc-badge " + (opts.issues === 0 ? "pass" : "fail");

    card.querySelector("[data-sub]").textContent = opts.subText;

    const list = card.querySelector("[data-list]");
    if (opts.listItems.length === 0) {
        list.innerHTML = '<li class="qc-list-empty">No problems found.</li>';
    } else {
        list.innerHTML = opts.listItems.map(function (item) {
            if (typeof item === "string") {
                return "<li>" + escapeHtml(item) + "</li>";
            }
            return "<li>" + escapeHtml(item.name) +
                '<span class="qc-issue">' + escapeHtml(item.issue) + "</span></li>";
        }).join("");
    }
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
}

// Turn run_checks() + per-file metrics into the four line charts + summary.
function renderQc(result, metrics) {
    const total = result.files_checked;
    document.getElementById("qc-total").textContent = total;
    document.getElementById("qc-folder").textContent = result.folder;

    document.getElementById("qc-grid").hidden = false;
    document.getElementById("qc-files-panel").hidden = false;

    // metrics are sorted by file name; map name -> index for flag overlays.
    const names = metrics.map(m => m.file_name);
    const indexOf = {};
    names.forEach((nm, i) => { indexOf[nm] = i; });
    const idxSet = nameList => new Set(nameList.map(nm => indexOf[nm]).filter(i => i !== undefined));

    // 1) Format — sample rate per file; reference line; outliers flagged red.
    const outliers = result.format.outliers;
    renderLineCard("format", {
        chart: {
            series: [{ values: metrics.map(m => m.sample_rate), color: "#2E7DF6" }],
            thresholds: [{ value: result.format.sample_rate, color: "#34D399", label: "reference" }],
            flagged: idxSet(outliers.map(o => o.file_name)),
            yFormat: v => (v / 1000).toFixed(1) + "k",
        },
        legend: [
            { label: "sample rate", color: "#2E7DF6" },
            { label: "reference " + (result.format.sample_rate / 1000).toFixed(1) + "k Hz", color: "#34D399" },
        ],
        issues: outliers.length,
        subText: outliers.length + " of " + total + " files inconsistent",
        listItems: outliers.map(o => ({ name: o.file_name, issue: "mismatched: " + o.mismatched_fields.join(", ") })),
    });

    // 2) Levels — RMS and peak dBFS per file; -30 and 0 thresholds; issues red.
    const levelIssues = result.level_issues;
    const levelFiles = new Set(levelIssues.map(i => i.file_name));
    renderLineCard("level", {
        chart: {
            series: [
                { values: metrics.map(m => m.rms_dBfs), color: "#2E7DF6" },
                { values: metrics.map(m => m.peak_dBfs), color: "#8A8F9A", dashed: true },
            ],
            thresholds: [
                { value: -30, color: "#FBBF24", label: "-30 RMS" },
                { value: 0, color: "#F87171", label: "0 clip" },
            ],
            flagged: idxSet([...levelFiles]),
            yFormat: v => v.toFixed(0),
        },
        legend: [
            { label: "RMS dBFS", color: "#2E7DF6" },
            { label: "peak dBFS", color: "#8A8F9A", dashed: true },
        ],
        issues: levelFiles.size,
        subText: levelIssues.length + " issue(s) across " + levelFiles.size + " file(s)",
        listItems: levelIssues.map(i => ({ name: i.file_name, issue: i.issue })),
    });

    // 3) Silence — leading & trailing seconds per file; 3s threshold. Computed
    //    from metrics (the backend silence check returns no file names), so the
    //    chart, count, and list all agree.
    const silenceFlagged = [];
    metrics.forEach(function (m) {
        if (m.leading_silence_sec > 3 || m.trailing_silence_sec > 3) {
            silenceFlagged.push({
                name: m.file_name,
                issue: "leading " + m.leading_silence_sec + "s · trailing " + m.trailing_silence_sec + "s",
            });
        }
    });
    renderLineCard("silence", {
        chart: {
            series: [
                { values: metrics.map(m => m.leading_silence_sec), color: "#2E7DF6" },
                { values: metrics.map(m => m.trailing_silence_sec), color: "#EC4899", dashed: true },
            ],
            thresholds: [{ value: 3, color: "#FBBF24", label: "3s limit" }],
            flagged: idxSet(silenceFlagged.map(s => s.name)),
            yFormat: v => v.toFixed(1) + "s",
        },
        legend: [
            { label: "leading", color: "#2E7DF6" },
            { label: "trailing", color: "#EC4899", dashed: true },
        ],
        issues: silenceFlagged.length,
        subText: silenceFlagged.length + " of " + total + " files exceed 3s silence",
        listItems: silenceFlagged,
    });

    // 4) Naming — valid(1)/invalid(0) per file; invalid files flagged red.
    const naming = result.naming_issues;
    const namingBad = new Set(naming);
    renderLineCard("naming", {
        chart: {
            series: [{ values: metrics.map(m => (namingBad.has(m.file_name) ? 0 : 1)), color: "#2E7DF6" }],
            thresholds: [],
            flagged: idxSet(naming),
            yFormat: v => (v >= 0.5 ? "valid" : "bad"),
        },
        legend: [{ label: "1 = valid name · 0 = invalid", color: "#2E7DF6" }],
        issues: naming.length,
        subText: naming.length + " of " + total + " file names invalid",
        listItems: naming,
    });

    const totalIssues = outliers.length + levelFiles.size + silenceFlagged.length + naming.length;
    if (totalIssues === 0) {
        log("✓  QC complete — all " + total + " files passed.", "success");
    } else {
        log("✗  QC complete — " + totalIssues + " issue group(s) flagged. See graphs.", "warn");
    }
}

// Expand / collapse a card's file list.
function toggleQcList(key) {
    const list = document.querySelector('.qc-card[data-key="' + key + '"] [data-list]');
    const btn = document.querySelector('.qc-card[data-key="' + key + '"] [data-view]');
    list.hidden = !list.hidden;
    btn.textContent = list.hidden
        ? (key === "silence" ? "View details" : "View files")
        : "Hide";
}

// Render the full .wav listing.
function renderQcAllFiles() {
    const list = document.getElementById("qc-all-files");
    if (qcAllFilesData.length === 0) {
        list.innerHTML = '<li class="qc-list-empty">No .wav files in this folder.</li>';
        return;
    }
    list.innerHTML = qcAllFilesData
        .map(name => "<li>" + escapeHtml(name) + "</li>")
        .join("");
}

function toggleQcAllFiles() {
    const list = document.getElementById("qc-all-files");
    list.hidden = !list.hidden;
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
