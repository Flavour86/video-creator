# Milestone 0 — Environment Verification

> **Read first**: `00_OVERVIEW.md`, `CONVENTIONS.md`, `STATE.md`.
>
> **Goal**: Confirm the host machine has every prerequisite installed at the right version. Resolve any gaps. Do not start coding tasks until every check below passes.
>
> **Platforms supported**: Windows 11 (PowerShell + winget) and macOS 13+ (Bash/Zsh + Homebrew). Each task below has parallel commands for both.

---

## Pre-flight: detect platform

At the start of any session, an agent should determine which platform it is on. Save the result for use throughout this milestone.

**PowerShell (Windows)**:
```powershell
$IsWindowsHost = ($PSVersionTable.PSVersion.Major -ge 5) -and ($env:OS -eq "Windows_NT")
$IsMacHost = $false
```

**Bash (macOS)**:
```bash
case "$(uname -s)" in
  Darwin) IS_MAC=1; IS_WIN=0 ;;
  *)      IS_MAC=0; IS_WIN=0 ;;
esac
```

**Homebrew on macOS**: required for installing system tools. If `brew` is missing:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
After install, follow the printed PATH instructions (`eval "$(/opt/homebrew/bin/brew shellenv)"` on Apple Silicon, `/usr/local/bin/brew` on Intel).

---

## Tasks at a glance

| ID | Title | Time |
|---|---|---|
| T0.1 | Verify Node.js 22+ | 5 min |
| T0.2 | Verify Python 3.11 | 5 min |
| T0.3 | Verify ffmpeg ≥ 6.0 | 5 min |
| T0.4 | Verify Git | 2 min |
| T0.5 | Detect GPU and install correct PyTorch | 10–30 min |

---

## T0.1 — Verify Node.js 22+

### Goal
Confirm Node.js ≥ 22 is on PATH.

### Skip-detection check
```powershell
node --version
```
If the output starts with `v22.` or higher (`v23`, `v24`, etc.), the task is already satisfied. Mark `[s]` in STATE.md with no commit (this is environment, not code).

### Steps
1. Run the version check above.
2. If Node is missing or < 22:
   - **Windows**: instruct the user to install via `winget install OpenJS.NodeJS.LTS` or download from https://nodejs.org. Do not auto-install on the user's behalf.
   - Add a `## Blocked` entry: "Node.js < 22 detected, user action needed."
   - Stop.
3. If `pnpm` is missing:
   ```powershell
   corepack enable
   corepack prepare pnpm@latest --activate
   pnpm --version
   ```

### Verification
```powershell
node --version    # v22.x or higher
pnpm --version    # any 9.x or 10.x
```

### Common failures
- **`pnpm: command not found`**: corepack not enabled. Run `corepack enable` (may require admin shell on Windows).
- **`v18.x` returned**: an older Node installation is shadowing 22+ on PATH. Diagnose with `Get-Command node | Select-Object -ExpandProperty Source` and ask the user to fix PATH.

---

## T0.2 — Verify Python 3.11

### Goal
Confirm Python 3.11 is on PATH (3.10 and 3.12 are **not** acceptable — WhisperX + Blackwell PyTorch wheels target 3.11 specifically as of this guide's writing).

### Skip-detection check
```powershell
python --version
```
If output is exactly `Python 3.11.x`, satisfied.

### Steps
1. Run the check.
2. If Python is missing or wrong version:
   - **Windows**: instruct user to install via `winget install Python.Python.3.11` or from https://python.org.
   - Make sure "Add Python to PATH" was checked during install.
   - Add `## Blocked` if user action is needed.
3. Confirm `pip` works:
   ```powershell
   python -m pip --version
   ```

### Verification
```powershell
python --version       # Python 3.11.x
python -m pip --version
```

### Common failures
- **Multiple Pythons on PATH**: the `py` launcher (Windows) helps. Use `py -3.11 --version`. If only `py -3.11` resolves correctly, set up a venv that pins the right one (T1.3 will do this).
- **`Python 3.12` returned**: 3.12 is not supported by some upstream deps yet. Ask user to install 3.11 alongside.

---

## T0.3 — Verify ffmpeg ≥ 6.0

### Goal
Confirm `ffmpeg` is on PATH with H.264 + libass (subtitles) support.

### Skip-detection check
```powershell
ffmpeg -version
```
First line should show `ffmpeg version 6.x` or `7.x`.

### Steps
1. Run the version check.
2. Verify required codecs/filters:
   ```powershell
   ffmpeg -hide_banner -encoders | Select-String "libx264"
   ffmpeg -hide_banner -encoders | Select-String "aac"
   ffmpeg -hide_banner -filters | Select-String "subtitles"
   ffmpeg -hide_banner -filters | Select-String "overlay"
   ```
   All four must return at least one line.
3. If ffmpeg is missing or below 6.0:
   - **Windows**: `winget install Gyan.FFmpeg` (Gyan's full build includes libass).
   - Re-open the shell after install (PATH refresh).

### Verification
```powershell
ffmpeg -version | Select-String "version"
ffprobe -version | Select-String "version"
```
Both must succeed.

### Common failures
- **`libx264` not in encoders**: a stripped-down ffmpeg build is installed. Reinstall using the full Gyan build.
- **PATH lookup wrong**: there are two ffmpegs and the wrong one is first. Use `Get-Command ffmpeg`.

---

## T0.4 — Verify Git

### Goal
Confirm Git is installed and identity is configured.

### Skip-detection check
```powershell
git --version
git config --global user.name
git config --global user.email
```
All three must return non-empty output.

### Steps
1. If Git missing: `winget install Git.Git`.
2. If identity unset:
   - Ask the user (do not invent values):
     ```powershell
     git config --global user.name "<user's name>"
     git config --global user.email "<user's email>"
     ```
   - Per `CONVENTIONS.md`, do **not** add Co-Authored-By trailers — even if you are an AI agent.

### Verification
```powershell
git --version
git config --global user.name
git config --global user.email
```

---

## T0.5 — Detect GPU and install correct PyTorch (preparation only)

### Goal
Determine whether an NVIDIA GPU is available, identify its compute capability, and **note** which PyTorch wheel to install. Actual installation happens in T1.3 (Python venv setup).

### Skip-detection check
```powershell
Test-Path apps/server/.venv
```
If the server venv already exists, this task is likely already done — verify by running:
```powershell
& apps/server/.venv/Scripts/python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'cpu')"
```
If CUDA is `True` and a device name appears, mark `[x]`.

### Steps

#### 1. Detect NVIDIA GPU
```powershell
nvidia-smi
```

If this fails with "command not found" → no NVIDIA GPU or driver is installed. Skip to step 4 (CPU-only path).

If it succeeds, record:
- GPU name (e.g., "RTX 5070 Ti").
- CUDA Driver Version (top-right of `nvidia-smi` output).
- Compute Capability — look up here: https://developer.nvidia.com/cuda-gpus.

#### 2. Identify the right PyTorch wheel index

| GPU compute capability | PyTorch wheel | Install URL |
|---|---|---|
| sm_120 (RTX 50-series, Blackwell) | `cu128` | `https://download.pytorch.org/whl/cu128` |
| sm_90 (H100, H200) | `cu124` | `https://download.pytorch.org/whl/cu124` |
| sm_89 (RTX 40-series) | `cu124` | `https://download.pytorch.org/whl/cu124` |
| sm_86 (RTX 30-series) | `cu121` or `cu124` | `https://download.pytorch.org/whl/cu124` |
| sm_75 (RTX 20-series, T4) | `cu121` | `https://download.pytorch.org/whl/cu121` |
| no GPU | CPU-only | (default index) |

Record the chosen URL — T1.3 will use it.

#### 3. Verify driver supports the chosen CUDA toolkit
The CUDA Driver Version reported by `nvidia-smi` must be **≥** the toolkit version of the wheel. Mapping:

| Wheel | Required driver |
|---|---|
| `cu128` | ≥ 555.85 |
| `cu124` | ≥ 535.54 |
| `cu121` | ≥ 525.60 |

If driver is too old, ask the user to update GeForce Game Ready / Studio Driver. Add `## Blocked` if so.

#### 4. CPU-only path
If no GPU detected: record `INSTALL_PYTORCH_FROM = (default PyPI)`. WhisperX will run on CPU. Note this is acceptable but slower.

#### 5. Persist the decision
Create `scripts/.env-detect` with:
```
PYTORCH_INDEX=https://download.pytorch.org/whl/cu128
HAS_GPU=1
GPU_NAME=NVIDIA GeForce RTX 5070 Ti
```
(or `HAS_GPU=0` and no `PYTORCH_INDEX` for CPU-only).

This file is read by T1.3.

### Verification
```powershell
Test-Path scripts/.env-detect
Get-Content scripts/.env-detect
```
Must show valid contents.

### Common failures
- **`nvidia-smi` works but reports 0 devices**: driver issue. Reboot, then re-check.
- **Two GPUs (e.g., integrated + discrete)**: prefer the discrete one. Most laptops/desktops handle this automatically; if not, set `CUDA_VISIBLE_DEVICES=0` in `.env-detect`.

---

## Milestone 0 verification (run all)

```powershell
node --version
pnpm --version
python --version
ffmpeg -version | Select-String "version" | Select-Object -First 1
git --version
git config --global user.name
git config --global user.email
Test-Path scripts/.env-detect
```

All commands must succeed.

When complete, update `STATE.md`:
- T0.1 through T0.5 → `[s]` (skipped, environment-only, no commit).
- Note in **Current focus**: "Environment verified. Begin T1.1."
