#!/usr/bin/env python3
"""Cross-platform raw-media inference launcher for ATTACHED.

This script mirrors run_model/run_raw_pipeline.sh without relying on zsh.
It is intended for Windows builds, but it also works on POSIX hosts when the
expected Python environments are available.
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
import zipfile
from pathlib import Path


def env_value(name: str, default: str) -> str:
    return os.environ.get(name, default)


def env_path(name: str, default: Path) -> Path:
    return Path(os.environ.get(name, str(default))).expanduser()


def venv_python(run_dir: Path, venv_name: str) -> Path:
    if os.name == "nt":
        return run_dir / venv_name / "Scripts" / "python.exe"
    return run_dir / venv_name / "bin" / "python"


def resolve_run_dir() -> Path:
    script_path = Path(__file__).resolve()
    cwd = Path.cwd().resolve()
    candidates: list[Path] = []

    explicit_run_dir = os.environ.get("ATTACHED_RUN_MODEL_DIR", "")
    explicit_model_root = os.environ.get("ATTACHED_MODEL_ROOT", "")
    if explicit_run_dir:
        candidates.append(Path(explicit_run_dir).expanduser())
    if explicit_model_root:
        candidates.append(Path(explicit_model_root).expanduser() / "run_model")

    candidates.extend(
        [
            cwd / "run_model",
            cwd / "data_model_KP" / "run_model",
            script_path.parents[1],
            script_path.parents[1] / "data_model_KP" / "run_model",
            script_path.parents[2] / "data_model_KP" / "run_model",
        ]
    )

    for candidate in candidates:
        run_dir = candidate.resolve()
        if (run_dir / "scripts" / "build_fused_dataset.py").is_file():
            return run_dir

    checked = "\n".join(f"- {candidate}" for candidate in candidates)
    raise FileNotFoundError(f"ATTACHED run_model directory not found. Checked:\n{checked}")


def require_file(path: Path, label: str) -> None:
    if not path.is_file():
        raise FileNotFoundError(f"{label} not found: {path}")


def require_dir(path: Path, label: str) -> None:
    if not path.is_dir():
        raise FileNotFoundError(f"{label} not found: {path}")


def run(command: list[str | Path], *, cwd: Path, env: dict[str, str] | None = None) -> None:
    printable = " ".join(shlex.quote(str(part)) for part in command)
    print(f"[attached-pipeline] {printable}", flush=True)
    subprocess.run([str(part) for part in command], cwd=str(cwd), env=env, check=True)


def run_capture(command: list[str | Path], *, cwd: Path) -> str:
    printable = " ".join(shlex.quote(str(part)) for part in command)
    print(f"[attached-pipeline] {printable}", flush=True)
    completed = subprocess.run(
        [str(part) for part in command],
        cwd=str(cwd),
        check=True,
        text=True,
        stdout=subprocess.PIPE,
    )
    return completed.stdout.strip()


def extract_if_needed(zip_path: Path, dest_dir: Path) -> None:
    if dest_dir.is_dir() and any(dest_dir.iterdir()):
        return

    require_file(zip_path, "Archive")
    dest_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(dest_dir)


def resolve_media_dir(explicit_dir: str, zip_path: Path, cache_dir: Path) -> Path:
    if explicit_dir:
        directory = Path(explicit_dir).expanduser()
        require_dir(directory, "Input directory")
        return directory

    extract_if_needed(zip_path, cache_dir)
    return cache_dir


def split_subjects(value: str) -> list[str]:
    return shlex.split(value) if value.strip() else []


def main() -> None:
    run_dir = resolve_run_dir()
    root_dir = run_dir.parent

    raw_cache_dir = env_path("RAW_CACHE_DIR", run_dir / "raw_cache")
    workdir_cache_dir = env_path("WORKDIR_CACHE_DIR", run_dir / "work_dirs_cache")
    output_root = env_path("OUTPUT_ROOT", run_dir / "raw_pipeline")

    mmaction_python = env_path("MMACTION_PYTHON", venv_python(run_dir, ".venv-mmaction-modern"))
    mmaction_runner_script = env_path(
        "MMACTION_RUNNER_SCRIPT", run_dir / "scripts" / "run_mmaction_mac_inference.py"
    )
    attachment_python = env_path("ATTACHMENT_PYTHON", venv_python(run_dir, ".venv"))

    require_file(mmaction_python, "MMAction Python runtime")
    require_file(mmaction_runner_script, "MMAction runner")
    require_file(attachment_python, "Attachment Python runtime")

    exposure_dir = resolve_media_dir(
        env_value("EXPOSURE_INPUT_DIR", ""),
        env_path("EXPOSURE_ZIP", root_dir / "data" / "exposure.zip"),
        raw_cache_dir / "exposure",
    )
    video_dir = resolve_media_dir(
        env_value("VIDEO_INPUT_DIR", ""),
        env_path("VIDEO_ZIP", root_dir / "data" / "response_video.zip"),
        raw_cache_dir / "response_video",
    )

    audio_input_dir = env_value("AUDIO_INPUT_DIR", "")
    audio_source_dir = env_value("AUDIO_SOURCE_DIR", "")
    if audio_input_dir:
        audio_dir = Path(audio_input_dir).expanduser()
        require_dir(audio_dir, "Audio mel directory")
    elif audio_source_dir:
        source_dir = Path(audio_source_dir).expanduser()
        require_dir(source_dir, "Raw audio directory")
        audio_dir = output_root / "generated_mels"
        audio_dir.mkdir(parents=True, exist_ok=True)
        mel_command: list[str | Path] = [
            attachment_python,
            run_dir / "scripts" / "convert_audio_to_mel.py",
            "--input-dir",
            source_dir,
            "--output-dir",
            audio_dir,
            "--sample-rate",
            env_value("MEL_SAMPLE_RATE", "16000"),
            "--n-mels",
            env_value("MEL_N_MELS", "80"),
            "--n-fft",
            env_value("MEL_N_FFT", "1024"),
            "--hop-length",
            env_value("MEL_HOP_LENGTH", "320"),
            "--win-length",
            env_value("MEL_WIN_LENGTH", "1024"),
            "--fmin",
            env_value("MEL_FMIN", "0"),
            "--top-db",
            env_value("MEL_TOP_DB", "80"),
        ]
        mel_fmax = env_value("MEL_FMAX", "")
        if mel_fmax:
            mel_command.extend(["--fmax", mel_fmax])
        if env_value("MEL_TRIM_SILENCE", "0") == "1":
            mel_command.append("--trim-silence")
        run(mel_command, cwd=root_dir)
    else:
        audio_dir = raw_cache_dir / "mels"
        extract_if_needed(env_path("AUDIO_ZIP", root_dir / "data" / "mels.zip"), audio_dir)

    exposure_workdir_name = env_value("EXPOSURE_WORKDIR_NAME", "65exposure_small_cl512_fi2_b8_ep30")
    video_workdir_name = env_value("VIDEO_WORKDIR_NAME", "65_response_video_base_cl512_fi2_b8_ep30")
    audio_workdir_name = env_value("AUDIO_WORKDIR_NAME", "inc_response_audio_cl32_fi2_ep100")

    extract_if_needed(
        env_path("EXPOSURE_WORKDIR_ZIP", root_dir / "work_dirs" / f"{exposure_workdir_name}.zip"),
        workdir_cache_dir / exposure_workdir_name,
    )
    extract_if_needed(
        env_path("VIDEO_WORKDIR_ZIP", root_dir / "work_dirs" / f"{video_workdir_name}.zip"),
        workdir_cache_dir / video_workdir_name,
    )
    extract_if_needed(
        env_path("AUDIO_WORKDIR_ZIP", root_dir / "work_dirs" / f"{audio_workdir_name}.zip"),
        workdir_cache_dir / audio_workdir_name,
    )

    output_root.mkdir(parents=True, exist_ok=True)
    device = env_value("MODALITY_DEVICE", "cpu")

    modality_jobs = [
        (
            "exposure",
            exposure_dir,
            workdir_cache_dir / exposure_workdir_name,
            env_value("EXPOSURE_CONFIG_NAME", "65exposure_small_cl512_fi2.py"),
            env_value("EXPOSURE_CKPT_NAME", "latest.pth"),
            output_root / "exposure_predictions.jsonl",
        ),
        (
            "video",
            video_dir,
            workdir_cache_dir / video_workdir_name,
            env_value("VIDEO_CONFIG_NAME", "65_response_video_base_cl512_fi2.py"),
            env_value("VIDEO_CKPT_NAME", "latest.pth"),
            output_root / "video_predictions.jsonl",
        ),
        (
            "audio",
            audio_dir,
            workdir_cache_dir / audio_workdir_name,
            env_value("AUDIO_CONFIG_NAME", "inc_response_audio_cl32_fi2.py"),
            env_value("AUDIO_CKPT_NAME", "latest.pth"),
            output_root / "audio_predictions.jsonl",
        ),
    ]

    for modality, input_dir, workdir, config_name, checkpoint_name, output_jsonl in modality_jobs:
        run(
            [
                mmaction_python,
                mmaction_runner_script,
                "--config",
                workdir / config_name,
                "--checkpoint",
                workdir / checkpoint_name,
                "--input-dir",
                input_dir,
                "--output-jsonl",
                output_jsonl,
                "--modality",
                modality,
                "--device",
                device,
            ],
            cwd=root_dir,
        )

    aggregate_flags: list[str] = []
    if env_value("ALLOW_MISSING_SLOTS", "1") == "1":
        aggregate_flags.append("--allow-missing-slots")

    feature_dirs = {
        "exposure": output_root / "exposure_subject_features",
        "video": output_root / "video_subject_features",
        "audio": output_root / "audio_subject_features",
    }
    for modality in ("exposure", "video", "audio"):
        run(
            [
                attachment_python,
                run_dir / "scripts" / "aggregate_trial_predictions.py",
                "--input-jsonl",
                output_root / f"{modality if modality != 'video' else 'video'}_predictions.jsonl",
                "--output-dir",
                feature_dirs[modality],
                *aggregate_flags,
            ],
            cwd=root_dir,
        )

    attachment_modality = env_value("ATTACHMENT_MODALITY", "evaq")
    attachment_experiment = env_value("ATTACHMENT_EXPERIMENT", "rerunacc6522b22_evaq")
    attachment_ckpt = env_value("ATTACHMENT_CKPT", "")
    if not attachment_ckpt:
        attachment_ckpt = run_capture(
            [
                attachment_python,
                run_dir / "scripts" / "discover_attachment_ckpt.py",
                "--experiment",
                attachment_experiment,
                "--modality",
                attachment_modality,
            ],
            cwd=root_dir,
        )

    fused_dataset_dir = output_root / "fused_dataset"
    build_command: list[str | Path] = [
        attachment_python,
        run_dir / "scripts" / "build_fused_dataset.py",
        "--exposure-dir",
        feature_dirs["exposure"],
        "--video-dir",
        feature_dirs["video"],
        "--audio-dir",
        feature_dirs["audio"],
        "--quiz-csv",
        env_path("QUIZ_CSV", root_dir / "data" / "ecrrs_recap.csv"),
        "--output-dir",
        fused_dataset_dir,
        "--split",
        env_value("SPLIT", "test"),
    ]
    labels_csv = env_value("LABELS_CSV", "")
    if labels_csv:
        build_command.extend(["--labels-csv", Path(labels_csv).expanduser()])
    subjects = split_subjects(env_value("SUBJECTS", ""))
    if subjects:
        build_command.extend(["--subjects", *subjects])
    run(build_command, cwd=root_dir)

    split = env_value("SPLIT", "test")
    predictions_path = Path(
        env_value("OUTPUT_PREDICTIONS", str(fused_dataset_dir / f"{split}_predictions.csv"))
    )
    logs_dir = env_path("LOGS_DIR", output_root / "logs")
    inference_env = os.environ.copy()
    inference_env.update(
        {
            "OMP_NUM_THREADS": env_value("OMP_NUM_THREADS", "1"),
            "MKL_NUM_THREADS": env_value("MKL_NUM_THREADS", "1"),
            "KMP_DUPLICATE_LIB_OK": env_value("KMP_DUPLICATE_LIB_OK", "TRUE"),
            "KMP_INIT_AT_FORK": env_value("KMP_INIT_AT_FORK", "FALSE"),
        }
    )
    run(
        [
            attachment_python,
            root_dir / "attachment_classifier" / "main_binary.py",
            "--mode",
            "predict",
            "--data_dir",
            fused_dataset_dir,
            "--modality",
            attachment_modality,
            "--batch_size",
            env_value("BATCH_SIZE", "18"),
            "--num_workers",
            env_value("NUM_WORKERS", "0"),
            "--accelerator",
            env_value("ACCELERATOR", "cpu"),
            "--logs_dir",
            logs_dir,
            "--predict_manifest",
            fused_dataset_dir / f"{split}.csv",
            "--predict_root",
            fused_dataset_dir / split,
            "--predictions_out",
            predictions_path,
            "--ckpt_path",
            attachment_ckpt,
            "--log",
        ],
        cwd=root_dir / "attachment_classifier",
        env=inference_env,
    )

    print(
        json.dumps(
            {
                "output_dir": str(output_root),
                "predictions": str(predictions_path),
                "platform": sys.platform,
            },
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
