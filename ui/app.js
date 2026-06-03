// ============================================================
//  Tab switching (pure display — no backend involved)
// ============================================================
document.querySelectorAll(".nav-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
        const target = tab.dataset.tab;

        document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));

        tab.classList.add("active");
        document.getElementById("tab-" + target).classList.add("active");
    });
});

// ============================================================
//  Helpers
// ============================================================

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

// Show text in the output panel with an optional colour state.
function showResult(text, state) {
    const panel = document.getElementById("result-panel");
    panel.classList.remove("result-valid", "result-error");
    if (state) panel.classList.add(state);
    panel.textContent = text;
}

// ============================================================
//  Backend calls — each just calls Python and displays the result
// ============================================================

// validate_entry(entry) -> list[str]
async function runValidation() {
    const entry = collectEntry();
    const errors = await window.pywebview.api.validate(entry);

    if (errors.length === 0) {
        showResult("✓  Entry is valid", "result-valid");
    } else {
        showResult("✗  " + errors.length + " problem(s):\n\n" + errors.join("\n"), "result-error");
    }
}

// add_entry(entry, path) -> None  (wrapped to return a status dict)
async function saveEntry() {
    const entry = collectEntry();
    const result = await window.pywebview.api.save(entry);

    if (result.ok) {
        showResult("✓  " + result.message, "result-valid");
    } else {
        showResult("✗  " + result.message, "result-error");
    }
}

// load_entries(path) -> list[dict]  (wrapped to return a status dict)
async function loadEntries() {
    const result = await window.pywebview.api.load();

    if (!result.ok) {
        showResult("✗  " + result.message, "result-error");
        return;
    }

    const entries = result.entries;
    if (entries.length === 0) {
        showResult("No entries yet.", null);
        return;
    }

    // Display each row as file_name + qc_status, one per line.
    const lines = entries.map(function (e, i) {
        return (i + 1) + ".  " + e.file_name + "   [" + e.qc_status + "]";
    });
    showResult(entries.length + " entries:\n\n" + lines.join("\n"), null);
}

// find_duplicates(path) -> list[str]  (wrapped to return a status dict)
async function findDuplicates() {
    const result = await window.pywebview.api.duplicates();

    if (!result.ok) {
        showResult("✗  " + result.message, "result-error");
        return;
    }

    const dups = result.duplicates;
    if (dups.length === 0) {
        showResult("✓  No duplicate file names found.", "result-valid");
    } else {
        showResult("✗  Duplicate file names:\n\n" + dups.join("\n"), "result-error");
    }
}
