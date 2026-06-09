import math
import webbrowser
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

    def pick_folder(self):
        # Open a native folder-picker so the user can choose the directory of
        # .wav files to run quality-control checks against.
        window = webview.active_window()
        if window is None:
            return {"ok": False, "message": "No active window."}
        result = window.create_file_dialog(webview.FileDialog.FOLDER)
        if not result:
            return {"ok": False}
        return {"ok": True, "folder": result[0]}

    def list_files(self, folder):
        # Return the names of every .wav file in the folder so the UI can show
        # the full file list (run_checks only reports the *problem* files).
        try:
            names = sorted(p.name for p in Path(folder).glob("*.wav"))
            return {"ok": True, "files": names}
        except OSError as error:
            return {"ok": False, "message": str(error)}

    def file_metrics(self, folder):
        # Per-file audio metrics for the QC line charts (levels, format fields,
        # leading/trailing silence). Uses pydub directly so audio_checker stays
        # untouched; imported lazily so a missing audio backend doesn't stop the
        # app from launching. dBFS is -inf for digital silence, which isn't
        # valid JSON, so non-finite values are floored to -120.
        try:
            from pydub import AudioSegment
            from pydub.silence import detect_leading_silence
        except Exception as error:
            return {"ok": False, "message": "Audio backend unavailable: " + str(error)}

        def finite(value):
            return round(value, 2) if math.isfinite(value) else -120.0

        try:
            metrics = []
            for path in sorted(Path(folder).glob("*.wav")):
                audio = AudioSegment.from_file(path)
                metrics.append({
                    "file_name": path.name,
                    "sample_rate": audio.frame_rate,
                    "bit_depth": audio.sample_width * 8,
                    "channels": audio.channels,
                    "duration_sec": round(len(audio) / 1000.0, 2),
                    "rms_dBfs": finite(audio.dBFS),
                    "peak_dBfs": finite(audio.max_dBFS),
                    "leading_silence_sec": round(detect_leading_silence(audio) / 1000.0, 2),
                    "trailing_silence_sec": round(detect_leading_silence(audio.reverse()) / 1000.0, 2),
                })
            return {"ok": True, "metrics": metrics}
        except Exception as error:
            return {"ok": False, "message": str(error)}

    def run_qc(self, folder):
        # Run the audio_checker pipeline on the chosen folder and hand the raw
        # result dict to the UI to chart. audio_checker is imported lazily so a
        # broken audio backend (e.g. missing pydub) doesn't stop the app from
        # launching — only this action surfaces the error.
        try:
            from audio_checker import run_checks
        except Exception as error:
            return {"ok": False, "message": "Audio backend unavailable: " + str(error)}
        try:
            return {"ok": True, "result": run_checks(Path(folder))}
        except Exception as error:
            return {"ok": False, "message": str(error)}

    def open_url(self, url):
        # Open external links (e.g. the GitHub repo) in the system browser
        # rather than navigating inside the app window.
        webbrowser.open(url)
        return {"ok": True}


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
