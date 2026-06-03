import webview
from pathlib import Path
from metadata_manager import (
    validate_entry,
    add_entry,
    load_entries,
    find_duplicates,
)

# Where the metadata CSV lives. All metadata functions read/write this file.
CSV_PATH = Path(__file__).parent / "recordings.csv"


class API:
    """Thin bridge between the UI and the backend modules.

    Each method just calls a backend function and packages the result so the
    JavaScript side has something simple to display. No validation or audio
    logic lives here — that all stays in the modules.
    """

    def validate(self, entry):
        return validate_entry(entry)

    def save(self, entry):
        try:
            add_entry(entry, CSV_PATH)
            return {"ok": True, "message": "Saved to recordings.csv"}
        except ValueError as error:
            return {"ok": False, "message": str(error)}

    def load(self):
        try:
            return {"ok": True, "entries": load_entries(CSV_PATH)}
        except FileNotFoundError as error:
            return {"ok": False, "message": str(error)}

    def duplicates(self):
        try:
            return {"ok": True, "duplicates": find_duplicates(CSV_PATH)}
        except FileNotFoundError as error:
            return {"ok": False, "message": str(error)}


if __name__ == "__main__":
    api = API()
    html_path = Path(__file__).parent / "ui" / "index.html"
    webview.create_window(
        "Speech Recording Toolkit",
        url=str(html_path),
        js_api=api,
        width=1100,
        height=900,
        background_color="#0A0D12",
    )
    webview.start()
