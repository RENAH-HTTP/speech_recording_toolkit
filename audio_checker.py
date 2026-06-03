from pathlib import Path
from pydub import AudioSegment
from pydub.silence import detect_leading_silence
from metadata_manager import validate_file_name

def read_file_info(path: Path) -> dict:
    audio = AudioSegment.from_file(path)
    return {
        "file_name": path.name,
        "sample_rate": audio.frame_rate,
        "bit_depth": audio.sample_width * 8,
        "channels": audio.channels,
        "duration_sec": len(audio) / 1000.0,
        "rms_dbfs": round(audio.dBFS, 2),
        "peak_dbfs": round(audio.max_dBFS, 2),
    }

def check_format_consistency(infos: list[dict]) -> dict:
    reference = infos[0]
    result = {
        "consistent": ...,
        "sample_rate": reference["sample_rate"],
        "bit_depth": reference["bit_depth"],
        "channels": reference["channels"],
        "outliers": [...]
    }
    for info in infos:
        mismatches = []
        if info["sample_rate"] != reference["sample_rate"]:
            mismatches.append("sample_rate")
        if info["bit_depth"] != reference["bit_depth"]:
            mismatches.append("bit_depth")
        if info["channels"] != reference["channels"]:
            mismatches.append("channels")
        # if one of the fields is different, add to outliers list
        if len(mismatches) > 0:
            result["outliers"].append({
                "file_name": info["file_name"],
                "mismatched_fields": mismatches
            })
    result["consistent"] = len(result["outliers"]) == 0
    return result


def check_levels(infos: list[dict]) -> list[dict]:
    ...


def check_silence(path: Path, threshold_sec: float = 3.0) -> str | None:
    ...


def check_filenames(paths: list[Path]) -> list[str]:
    ...


def run_checks(folder: Path) -> dict:
    ...
