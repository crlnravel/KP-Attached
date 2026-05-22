# web

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

## Local Model Runtime

The app runs the ATTACHED model locally from `../data_model_KP`. During packaging,
`electron-builder.yml` copies that folder into the release resources as
`data_model_KP`, together with the cross-platform launcher in
`resources/model-launchers`.

Windows releases require Windows-compatible Python environments inside the model
bundle:

- `data_model_KP/run_model/.venv/Scripts/python.exe`
- `data_model_KP/run_model/.venv-mmaction-modern/Scripts/python.exe`

The launcher used on Windows is:

```powershell
python resources/model-launchers/run_raw_pipeline_cross_platform.py
```

It reads the same environment variables used by the Electron backend:
`EXPOSURE_INPUT_DIR`, `VIDEO_INPUT_DIR`, `AUDIO_SOURCE_DIR`, `QUIZ_CSV`,
`OUTPUT_ROOT`, and `ATTACHMENT_EXPERIMENT`.

To build a Windows installer from Windows:

```powershell
pnpm install
pnpm build:win
```

If the model bundle is stored outside the default layout, set
`ATTACHED_MODEL_ROOT` to the absolute `data_model_KP` path before launching the
app.

## Local Sample Data

In development mode, the test-data shortcut will use the local Nabila fixture
when available. By default the app looks for:

```text
../Nabila Dhiya Permatasari
```

You can override that location with:

```powershell
$env:ATTACHED_SAMPLE_DATA_DIR="D:\ATTACHED\samples\Nabila Dhiya Permatasari"
```

The fixture is copied into the active session folder using the same raw media
layout as a real assessment. The app reads the 36 ECR-RS answers directly from
`Hasil Kuesioner Nabila.xlsx`. The raw participant media is not bundled into
release builds by default.
