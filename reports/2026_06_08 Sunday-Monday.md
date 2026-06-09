## Day 3-4 — Sunday-Monday June 7th-8th

- built out audio_checker — read_file_info pulls the per-file stuff with pydub (rms/peak dBFS, sample rate, bit depth, duration)

- wrote the four checks: format consistency (outliers vs the reference file), levels (rms under -30, clipping over 0, loudness outliers off the median), silence (lead/trail over 3s), and filename validation

- run_checks ties it together — globs the folder, runs every check, spits out one result dict

- pydub wouldn't load on py3.14 (audioop got dropped from stdlib) — fixed with audioop-lts. README tidy + dropped a stray .pyc

- added UI to view it

> **Total hours: ~7h (19:00am → 2am)**

|               |                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Situation** | had the metadata side done but audio_checker was still bare — no real QC logic.                                                                                   |
| **Task**      | build out the four audio checks and run_checks.                                                                                                                   |
| **Action**    | wrote read_file_info + format/level/silence/filename checks in audio_checker, run_checks to tie them together, sorted out pydub on py3.14, README + housekeeping. |
| **Result**    | audio_checker runs the full QC pass on a folder and returns one result dict.                                                                                      |
