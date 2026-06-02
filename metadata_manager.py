import re
import csv
from pathlib import Path

FIELDS = {
    "speaker_id":   None,
    "language":     {"en", "de", "fr", "ro", "es", "it", "nl", "pt"},
    "accent":       {"general", "northern", "southern", "regional", "non-native"},
    "age_range":    {"child", "teen", "18-29", "30-44", "45-59", "60+"},
    "gender":       {"female", "male", "nonbinary", "unspecified"},
    "mic_type":     {"condenser", "dynamic", "lavalier", "headset", "shotgun", "usb"},
    "gain_db":      {0, 6, 12, 18, 24, 30, 36, 42, 48},
    "room_id":      {"booth_a", "booth_b", "studio_1", "studio_2", "field"},
    "session_date": None,
    "file_name":    None,
    "sample_rate":  {44100, 48000, 96000, 192000},
    "bit_depth":    {16, 24, 32},
    "duration_sec": None,
    "qc_status":    {"pass", "flagged", "rejected", "pending"},
    "notes":        None,
}

### build a regex pattern for validating file names 
### speaker_XXX_lang_sessionYY.wav (pattern: speaker_001_en_session01.wav)
filename_regex = re.compile(r"^speaker_\d{3}_[a-z]{2}_session\d{2}\.wav$")

def validate_file_name(name: str) -> bool:
    result = filename_regex.match(name)
    if result is None:
        return False
    else:
        return True

def validate_entry(entry: dict) -> list[str]:
    errors = []
    for key in FIELDS.keys():
        if key not in entry:
            errors.append(f"Missing field: {key}")
        else:
            value = entry[key]
            allowed = FIELDS[key]
            if allowed is None:
                pass
            elif value not in allowed:
                errors.append(f"Invalid value for {key}: {value}")
    return errors

def add_entry(entry: dict, path: Path) -> None:
    errors = validate_entry(entry)  
    file_exists = path.exists()
    if len(errors) > 0:
        raise ValueError(f"Entry validation failed: {errors}")
    with open(path, mode="a", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS.keys())
        if not file_exists:
            writer.writeheader()
        writer.writerow(entry)


def load_entries(path: Path) -> list[dict]:
    file_exists = path.exists()
    if not file_exists:
        raise FileNotFoundError(f"Metadata file not found: {path}")
    with open(path, mode="r", newline="") as file:
        reader = csv.DictReader(file)
        return list(reader)
    

    