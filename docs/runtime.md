# Runtime Contract

This document describes the contract between the Electron app and the external Python runtime in `attached-inference-runtime`.

## Runtime location

By default, ATTACHED expects the model bundle to exist at:

```text
attached-inference-runtime
```

You can override discovery with:

- `ATTACHED_MODEL_ROOT`
- `ATTACHED_PROJECT_ROOT`

## Runtime discovery

At startup, the backend searches for a project root that contains one of these launchers:

- `attached-inference-runtime/run_model/run_inference.sh`
- `web/resources/model-launchers/run_raw_pipeline_cross_platform.py` for Windows

If no valid runtime is found:

- the dashboard still loads
- inference is blocked
- the UI warns that the local analysis runtime is not ready

The distributed bundle is named `attached-inference-runtime.zip`. The checked-in
setup helper extracts it as `attached-inference-runtime/` in the project root, or
you can set `ATTACHED_MODEL_ROOT` to another extracted directory.

The bundle contains only the runtime code, selected model checkpoints/configurations, and requirement files. Its
Python virtual environments are created separately during deployment.

## Launchers by platform

- Windows
  - runs `run_raw_pipeline_cross_platform.py`
- macOS
  - expects `run_raw_pipeline_mac.sh`
- Linux
  - expects `run_raw_pipeline.sh`

## Python environments

The backend resolves two Python interpreters:

- attachment pipeline environment
- MMACTION environment

You can override them with:

- `ATTACHMENT_PYTHON`
- `MMACTION_PYTHON`

## Inputs passed to the runtime

When a session starts inference, ATTACHED passes:

- `EXPOSURE_INPUT_DIR`
- `VIDEO_INPUT_DIR`
- `AUDIO_SOURCE_DIR`
- `QUIZ_CSV`
- `OUTPUT_ROOT`
- `ATTACHED_MODEL_ROOT`
- `ATTACHMENT_EXPERIMENT`

## Session inputs prepared by the app

The app generates:

- raw exposure files
- raw response-video files
- raw audio files
- `input/quiz.csv`

`quiz.csv` is written in this format:

```csv
name,quest_score
sessionlabel,1:2:3:4:...
```

## Required outputs

The Electron backend requires:

- `fused_dataset/test_predictions.csv`

It also records the path to:

- `fused_dataset/test_summary.json`

## Prediction CSV expectations

The first data row in `test_predictions.csv` must contain at least:

- `pred_label`
- `prob_secure`
- `prob_insecure`

Label mapping:

```text
1 -> insecure
0 -> secure
```

Any non-`1` value is treated as `secure`.

## Inference behavior in the app

- max attempts: `3`
- low-confidence threshold: `0.6`
- session result states:
  - `completed`
  - `low_confidence`
  - `failed`

If the runtime exits unsuccessfully, the backend stores the failure message and marks the session as failed.
