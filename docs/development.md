# Development Guide

## Requirements

- Node.js 22+
- `pnpm`
- Electron-compatible build tooling for your platform
- the local Python runtime bundle at `attached-inference-runtime`, unless you set `ATTACHED_MODEL_ROOT`

The backend uses `node:sqlite`, Electron 39, and the checked-in runtime setup helper, so a current Node 22+ environment is the safest setup.

## Install

```bash
./setup-attached-inference-runtime.sh
pnpm install
```

## Run in development

```bash
pnpm dev
```

## Typecheck and build

```bash
pnpm typecheck
pnpm build
```

## Platform packaging

```bash
pnpm build:win
pnpm build:mac
pnpm build:linux
```

## Debug mode

Set `DEBUG=true` in `.env` to enable debug helpers such as seeded test data during the assessment flow.

The repo already includes:

- [`.env.example`](../.env.example)

## Sample data

In debug mode, the assessment flow exposes a "Gunakan data uji" shortcut.

The app prefers the local Nabila sample fixture when available:

- default path: `../Nabila Dhiya Permatasari`
- override: `ATTACHED_SAMPLE_DATA_DIR`

Expected fixture content includes:

- `Hasil Kuesioner Nabila.xlsx`
- exposure media such as `nabila_exposure1.mp4`
- response media for the 14 stimulus steps

If the Nabila fixture is not present, the app falls back to a minimal built-in debug fixture.

## Smoke testing

The repo includes an Electron smoke test:

```bash
ATTACHED_SMOKE_TEST_EMAIL=<approved-psychologist-email> \
ATTACHED_SMOKE_TEST_PASSWORD=<approved-psychologist-password> \
pnpm smoke:electron
```

The smoke test verifies:

- sign-in
- dashboard load
- active-session reopen behavior
- debug seeding into the review step
- model-runtime readiness wiring
- full inference flow when the runtime is available

Use an approved psychologist account for this flow, not the local admin account.

## Packaging note for Windows

Windows builds require Windows-compatible Python environments inside the extracted `attached-inference-runtime` bundle:

- `attached-inference-runtime/run_model/.venv/Scripts/python.exe`
- `attached-inference-runtime/run_model/.venv-mmaction-modern/Scripts/python.exe`

The packaged app uses the cross-platform launcher script from `resources/model-launchers/`.

See [Inference Runtime Bundle](./model-runtime-bundle.md) for the archive contents and deployment handoff.
