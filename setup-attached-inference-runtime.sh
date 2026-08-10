#!/usr/bin/env bash

set -Eeuo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
runtime_url="${ATTACHED_RUNTIME_URL:-https://object.carlravel.tech/attached-inference-runtime.zip}"
archive_path="${ATTACHED_RUNTIME_ARCHIVE:-${script_dir}/attached-inference-runtime.zip}"
runtime_root="${ATTACHED_RUNTIME_ROOT:-${script_dir}/attached-inference-runtime}"
expected_sha256="${ATTACHED_RUNTIME_SHA256:-b47a4699825b6aaf44bdc822a0ed82a408e4ada72129486beb98119840dff449}"
setup_python_spec="${ATTACHED_SETUP_PYTHON:-}"
mmaction_python_spec="${ATTACHED_MMACTION_SETUP_PYTHON:-}"
uv_bin="${ATTACHED_SETUP_UV:-}"
skip_download="${ATTACHED_SETUP_SKIP_DOWNLOAD:-0}"
skip_install="${ATTACHED_SETUP_SKIP_INSTALL:-0}"

usage() {
  cat <<'USAGE'
Usage:
  ./setup-attached-inference-runtime.sh [OPTIONS]

Options:
  --skip-download  Use the existing local archive and do not contact object storage
  --skip-install   Download and extract only; do not create Python environments
  -h, --help       Show this help

Environment overrides:
  ATTACHED_RUNTIME_URL              Runtime archive URL
  ATTACHED_RUNTIME_ARCHIVE          Local archive path
  ATTACHED_RUNTIME_ROOT             Extraction path; must end in attached-inference-runtime
  ATTACHED_RUNTIME_SHA256           Expected archive SHA-256
  ATTACHED_SETUP_PYTHON              Python executable or uv Python version for .venv
  ATTACHED_MMACTION_SETUP_PYTHON     Python executable or uv Python version for MMAction
  ATTACHED_SETUP_UV                  uv executable path
  ATTACHED_SETUP_SKIP_DOWNLOAD       Set to 1 instead of --skip-download
  ATTACHED_SETUP_SKIP_INSTALL        Set to 1 instead of --skip-install

The default setup uses Python 3.11 for the attachment and modern MMAction
environments. If uv is installed, it can obtain that Python version. On Linux,
the MMAction environment defaults to Python 3.8; override it with
ATTACHED_MMACTION_SETUP_PYTHON when a compatible interpreter is required.
USAGE
}

die() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required but was not found"
}

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    die 'shasum or sha256sum is required to verify the runtime archive'
  fi
}

verify_archive() {
  local archive=$1
  local actual
  actual=$(sha256_of "$archive")
  [[ "$actual" == "$expected_sha256" ]] || {
    printf 'Expected: %s\nActual:   %s\n' "$expected_sha256" "$actual" >&2
    return 1
  }
}

resolve_local_python() {
  local candidate candidate_path
  for candidate in "$@"; do
    [[ -n "$candidate" ]] || continue
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
    candidate_path=$(command -v "$candidate" 2>/dev/null || true)
    if [[ -n "$candidate_path" && -x "$candidate_path" ]]; then
      printf '%s\n' "$candidate_path"
      return 0
    fi
  done
  return 1
}

validate_python_version() {
  local python_path=$1
  local version
  version=$("$python_path" -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")')
  case "$version" in
    3.8|3.9|3.10|3.11|3.12) ;;
    *)
      die "Unsupported Python ${version} at ${python_path}; use Python 3.8-3.12 or install uv"
      ;;
  esac
}

venv_python() {
  local env_dir=$1
  if [[ -x "$env_dir/bin/python" ]]; then
    printf '%s\n' "$env_dir/bin/python"
  elif [[ -x "$env_dir/Scripts/python.exe" ]]; then
    printf '%s\n' "$env_dir/Scripts/python.exe"
  else
    return 1
  fi
}

create_env() {
  local env_dir=$1
  local python_spec=$2

  if venv_python "$env_dir" >/dev/null 2>&1; then
    printf 'Reusing Python environment: %s\n' "$env_dir"
    return
  fi

  [[ ! -e "$env_dir" ]] || die "Environment exists but has no usable Python: $env_dir"
  mkdir -p "$(dirname "$env_dir")"

  if [[ -n "$uv_bin" ]]; then
    "$uv_bin" venv "$env_dir" --python "$python_spec"
  else
    [[ -x "$python_spec" ]] || die "Python executable not found: $python_spec"
    "$python_spec" -m venv "$env_dir"
  fi

  venv_python "$env_dir" >/dev/null 2>&1 || die "Python environment creation failed: $env_dir"
}

install_requirements() {
  local env_dir=$1
  local requirements_file=$2
  local extra_package=${3:-}
  local python_path
  python_path=$(venv_python "$env_dir")

  printf 'Installing %s into %s\n' "$(basename "$requirements_file")" "$env_dir"
  if [[ -n "$uv_bin" ]]; then
    "$uv_bin" pip install --python "$python_path" -r "$requirements_file"
    if [[ -n "$extra_package" ]]; then
      "$uv_bin" pip install --python "$python_path" --no-deps "$extra_package"
    fi
  else
    "$python_path" -m ensurepip --upgrade >/dev/null 2>&1 || true
    "$python_path" -m pip --version >/dev/null 2>&1 || die "pip is unavailable in $env_dir"
    "$python_path" -m pip install --upgrade pip setuptools wheel
    "$python_path" -m pip install -r "$requirements_file"
    if [[ -n "$extra_package" ]]; then
      "$python_path" -m pip install --no-deps "$extra_package"
    fi
  fi
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-download) skip_download=1 ;;
    --skip-install) skip_install=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "Unknown option: $1" ;;
  esac
  shift
done

require_command curl
require_command unzip

[[ "$(basename "$runtime_root")" == 'attached-inference-runtime' ]] || \
  die 'ATTACHED_RUNTIME_ROOT must end in attached-inference-runtime'

if [[ -z "$uv_bin" ]] && command -v uv >/dev/null 2>&1; then
  uv_bin=$(command -v uv)
fi
if [[ -n "$uv_bin" ]]; then
  [[ -x "$uv_bin" ]] || die "uv executable not found: $uv_bin"
fi

mkdir -p "$(dirname "$archive_path")"

if [[ "$skip_download" == '1' ]]; then
  [[ -f "$archive_path" ]] || die "Archive not found with --skip-download: $archive_path"
elif [[ -f "$archive_path" ]] && verify_archive "$archive_path"; then
  printf 'Using verified archive: %s\n' "$archive_path"
else
  partial_path="${archive_path}.part"
  printf 'Downloading runtime archive from %s\n' "$runtime_url"
  printf 'Download path: %s\n' "$partial_path"
  curl \
    --fail-with-body \
    --location \
    --show-error \
    --progress-bar \
    --retry 3 \
    --retry-all-errors \
    --retry-delay 5 \
    --continue-at - \
    --output "$partial_path" \
    "$runtime_url"
  verify_archive "$partial_path" || die "Archive checksum mismatch; partial file kept at $partial_path"
  mv "$partial_path" "$archive_path"
fi

verify_archive "$archive_path" || die "Archive checksum mismatch: $archive_path"
unzip -t "$archive_path" >/dev/null || die "Archive integrity check failed: $archive_path"

mkdir -p "$(dirname "$runtime_root")"
unzip -oq "$archive_path" -d "$(dirname "$runtime_root")"
[[ -f "$runtime_root/run_model/requirements.txt" ]] || die "Extracted runtime is incomplete: $runtime_root"
chmod +x "$runtime_root"/run_model/*.sh 2>/dev/null || true

printf 'Runtime extracted to: %s\n' "$runtime_root"

if [[ "$skip_install" == '1' ]]; then
  printf '%s\n' 'Skipping Python environment setup.'
  exit 0
fi

if [[ -n "$uv_bin" ]]; then
  setup_python_spec=${setup_python_spec:-3.11}
else
  setup_python_spec=$(resolve_local_python "$setup_python_spec" python3.11 python3.10 python3.9 python3.8 python3) || \
    die 'No compatible Python found; install Python 3.11 or uv'
  validate_python_version "$setup_python_spec"
fi

platform_name=$(uname -s)
case "$platform_name" in
  Darwin*|MINGW*|MSYS*|CYGWIN*)
    mmaction_requirements="$runtime_root/run_model/mmaction_mac_requirements.txt"
    mmaction_env_name='.venv-mmaction-modern'
    mmaction_extra_package='mmaction2==1.2.0'
    mmaction_python_spec=${mmaction_python_spec:-$setup_python_spec}
    ;;
  Linux*)
    mmaction_requirements="$runtime_root/run_model/mmaction_requirements.txt"
    mmaction_env_name='.venv-mmaction'
    mmaction_extra_package=''
    if [[ -n "$uv_bin" ]]; then
      mmaction_python_spec=${mmaction_python_spec:-3.8}
    else
      mmaction_python_spec=$(resolve_local_python "$mmaction_python_spec" python3.9 python3.8) || \
        die 'Linux MMAction requires Python 3.8 or 3.9; install uv or set ATTACHED_MMACTION_SETUP_PYTHON'
      validate_python_version "$mmaction_python_spec"
    fi
    ;;
  *)
    die "Unsupported platform: $platform_name"
    ;;
esac

create_env "$runtime_root/run_model/.venv" "$setup_python_spec"
install_requirements "$runtime_root/run_model/.venv" "$runtime_root/run_model/requirements.txt"

create_env "$runtime_root/run_model/$mmaction_env_name" "$mmaction_python_spec"
install_requirements "$runtime_root/run_model/$mmaction_env_name" "$mmaction_requirements" "$mmaction_extra_package"

attachment_python=$(venv_python "$runtime_root/run_model/.venv")
mmaction_python=$(venv_python "$runtime_root/run_model/$mmaction_env_name")

"$attachment_python" -c 'import pytorch_lightning, torch, torchvision' || die 'Attachment environment verification failed'
"$mmaction_python" -c 'import mmcv, mmaction, mmengine, torch' || die 'MMAction environment verification failed'

printf '\nSetup complete.\n'
printf 'Runtime root:       %s\n' "$runtime_root"
printf 'Attachment Python:  %s\n' "$attachment_python"
printf 'MMAction Python:    %s\n' "$mmaction_python"
