# Inference Runtime Bundle

The web application depends on a separately distributed Python/model bundle named:

```text
attached-inference-runtime.zip
```

After extraction, the directory should be named:

```text
attached-inference-runtime/
```

Place it beside the web project for automatic discovery, or point `ATTACHED_MODEL_ROOT` at the extracted directory.

## Included files

The archive contains only the files used by the local raw-media inference path:

- `attachment_classifier/`
  - the binary classifier entry point, data module, dataset loader, and model definition
- `lightning_logs/rerunacc6522b22_evaq/version_0/checkpoints/epoch=12-step=26.ckpt`
  - the selected attachment classifier checkpoint
- `run_model/scripts/`
  - modality inference, audio conversion, feature aggregation, fused-dataset building, and checkpoint discovery
- `run_model/work_dirs_cache/`
  - the exposure, response-video, and audio model configs with one `latest.pth` checkpoint each
- `run_model/`
  - the platform launchers and Python requirement files

## Deliberately excluded

The archive does not include Python virtual environments, package caches, raw media, prepared training datasets, TensorBoard logs, temporary files, duplicate epoch checkpoints, or unrelated model variants. These are not read by the web inference path and would make the download substantially larger.

## Deployment handoff

The archive is available at `https://object.carlravel.tech/attached-inference-runtime.zip`. The root-level `setup-attached-inference-runtime.sh` script downloads it, verifies its SHA-256, extracts it, and creates the platform-specific Python environments from the bundled requirement files.

The archive currently verifies as `1,763,924,217` bytes with SHA-256:

```text
b47a4699825b6aaf44bdc822a0ed82a408e4ada72129486beb98119840dff449
```

## Setup helper

Run this from the project root:

```bash
./setup-attached-inference-runtime.sh
```

The script uses Python 3.11 for the attachment classifier and modern MMAction environment. If `uv` is installed, it can provision Python 3.11 automatically. On Linux, the legacy MMAction environment defaults to Python 3.8; set `ATTACHED_MMACTION_SETUP_PYTHON` if a different compatible interpreter is required.

Use `--skip-download` when the verified archive is already present, or `--skip-install` when only extraction is needed. The script does not modify the original source checkout.

## Upload helper

The project root contains `upload-attached-inference-runtime.sh`. It uploads the archive through the R2 S3 API. The helper prefers AWS CLI multipart upload for large files and falls back to a signed `curl` `PutObject` request when AWS CLI is unavailable.

Set credentials in the shell rather than placing them in source files. If you run
the helper interactively, it prompts for any missing required values and hides the
secret access key while you type:

```bash
export R2_ACCOUNT_ID='<cloudflare-account-id>'
export R2_BUCKET='<bucket-name>'
export R2_ACCESS_KEY_ID='<r2-access-key-id>'
export R2_SECRET_ACCESS_KEY='<r2-secret-access-key>'

./upload-attached-inference-runtime.sh
```

The default S3 API endpoint is `https://<account-id>.r2.cloudflarestorage.com`, the signing region is `auto`, and the printed public URL uses `https://object.carlravel.tech`. Override `R2_ENDPOINT`, `R2_REGION`, `R2_OBJECT_KEY`, or `R2_PUBLIC_BASE_URL` when needed. Use `--dry-run` to inspect the target without uploading.

See [Runtime Contract](./runtime.md) and [Environment Variables](./environment.md) for discovery and override behavior.
