import statistics
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
        "rms_dBfs": round(audio.dBFS, 2),
        "peak_dBfs": round(audio.max_dBFS, 2),
    }

def check_format_consistency(infos: list[dict]) -> dict:
    # researched and found that this might be a case worth handling
    if not infos:
            return {"consistent": True, "outliers": []}
    reference = infos[0]
    result = {
        "consistent": False,
        "sample_rate": reference["sample_rate"],
        "bit_depth": reference["bit_depth"],
        "channels": reference["channels"],
        "outliers": []
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
    # if there are no outliers, then the files are consistent
    if len(result["outliers"]) == 0:
        result["consistent"] = True
    else:
        result["consistent"] = False
    return result


def check_levels(infos: list[dict]) -> list[dict]:
    
    result = []

    for info in infos:
        if info["rms_dBfs"] < -30:
            errors = {}
            errors["file_name"] = info["file_name"]
            errors["issue"] = f"rms {info['rms_dBfs']} dBFS is below the -30 dBfS threshold"
            result.append(errors)

    for info in infos:
        if info["peak_dBfs"] > 0: 
            errors = {}
            errors["file_name"] = info["file_name"]
            errors["issue"] = f"clipping {info['peak_dBfs']} above the dBFS threshold"
            result.append(errors)

    rms_list = []
    for info in infos:
        rms_list.append(info["rms_dBfs"])

    average = statistics.median(rms_list)
    for info in infos:
        if abs(info["rms_dBfs"] - average) > 6:
            errors = {}
            errors["file_name"] = info["file_name"]
            errors["issue"] = f"loudness outlier: {info['rms_dBfs']} dBFS, {abs(info['rms_dBfs'] - average):.1f} dB from group average" 
            result.append(errors)


    return result


def check_silence(path: Path, threshold_sec: float = 3.0) -> str | None:
    
    audio = AudioSegment.from_file(path)

    leading_silence = detect_leading_silence(audio) / 1000
    trailing_silence = detect_leading_silence(audio.reverse()) / 1000

    message = ""
    if leading_silence > threshold_sec:
        message += f"leading silence {leading_silence:.1f}s exceeds threshold of {threshold_sec}s"
    if trailing_silence > threshold_sec:
        message += f"\ntrailing silence {trailing_silence:.1f}s exceeds threshold of {threshold_sec}s"
    if message:
        return message
    return None


def check_filenames(paths: list[Path]) -> list[str]:

    faulty_filenames = []

    for path in paths:
        if validate_file_name(path.name) is False:
            faulty_filenames.append(path.name)
    
    return faulty_filenames


def run_checks(folder: Path) -> dict:

    files = []
    for file in folder.glob("*.wav"):
        files.append(file)

    analyzed_files = []
    for file in files:
        analyzed_files.append(read_file_info(file))

    format_consistency = check_format_consistency(analyzed_files)
    level_checks = check_levels(analyzed_files)
    silence_check = []
    for file in files: 
        result = check_silence(file)
        if result is not None:
            silence_check.append(result)
    filename_check = check_filenames(files)

    result = {
        "folder": str(folder),
        "files_checked": len(files),
        "format": format_consistency,
        "level_issues": level_checks,
        "silence_issues": silence_check,
        "naming_issues": filename_check,
    }

    return result



