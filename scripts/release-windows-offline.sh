#!/usr/bin/env bash
set -euo pipefail

readonly CADDY_VERSION="2.11.4"
readonly CADDY_ARCHIVE_NAME="caddy_${CADDY_VERSION}_windows_amd64.zip"
readonly CADDY_ARCHIVE_SHA256="1708333f79e274c7697285afe6d592ab39314e0b131e9ec6bea08ad27df62ebf"
readonly CADDY_URL="https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/${CADDY_ARCHIVE_NAME}"

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly RELEASE_DIR="${REPO_ROOT}/release"
readonly CACHE_DIR="${REPO_ROOT}/.cache/delivery"
readonly TEMPLATE_DIR="${REPO_ROOT}/delivery/windows-offline"
readonly CADDY_ARCHIVE="${CACHE_DIR}/${CADDY_ARCHIVE_NAME}"

for command_name in node npm git curl unzip zip sha256sum; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is missing: ${command_name}" >&2
    exit 1
  fi
done

cd "${REPO_ROOT}"

readonly APP_VERSION="$(node -p "require('./package.json').version")"
readonly PACKAGE_NAME="prism-chariot-amhs-v${APP_VERSION}-windows-x64"
readonly LEGACY_PACKAGE_DIR="${RELEASE_DIR}/${PACKAGE_NAME}"
readonly FINAL_ZIP="${RELEASE_DIR}/${PACKAGE_NAME}.zip"
readonly FINAL_ZIP_SHA="${FINAL_ZIP}.sha256"
readonly BUILD_DATE="$(TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M:%S %Z')"

git_commit="$(git rev-parse --short HEAD)"
if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  git_commit="${git_commit}-dirty"
fi
readonly GIT_COMMIT="${git_commit}"

mkdir -p "${RELEASE_DIR}" "${CACHE_DIR}"
readonly STAGE_ROOT="$(mktemp -d "${RELEASE_DIR}/.windows-release.XXXXXX")"
readonly STAGE_PACKAGE_DIR="${STAGE_ROOT}/${PACKAGE_NAME}"
readonly STAGE_ZIP="${STAGE_ROOT}/${PACKAGE_NAME}.zip"
trap 'rm -rf "${STAGE_ROOT}"' EXIT

echo "[1/7] Running tests"
npm test

echo "[2/7] Building production application"
npm run build

echo "[3/7] Preparing Caddy ${CADDY_VERSION}"
if [[ ! -f "${CADDY_ARCHIVE}" ]] || ! echo "${CADDY_ARCHIVE_SHA256}  ${CADDY_ARCHIVE}" | sha256sum -c --status; then
  temp_archive="${CADDY_ARCHIVE}.download"
  rm -f "${temp_archive}"
  curl -L --fail --retry 3 --connect-timeout 15 --max-time 180 -o "${temp_archive}" "${CADDY_URL}"
  echo "${CADDY_ARCHIVE_SHA256}  ${temp_archive}" | sha256sum -c --status
  mv "${temp_archive}" "${CADDY_ARCHIVE}"
fi

echo "[4/7] Assembling ${PACKAGE_NAME}"
mkdir -p "${STAGE_PACKAGE_DIR}/app" "${STAGE_PACKAGE_DIR}/server" "${STAGE_PACKAGE_DIR}/third-party"
cp -a "${REPO_ROOT}/dist/." "${STAGE_PACKAGE_DIR}/app/"
cp "${TEMPLATE_DIR}/start.ps1" "${TEMPLATE_DIR}/stop.ps1" "${STAGE_PACKAGE_DIR}/server/"
cp "${TEMPLATE_DIR}/启动系统.bat" "${TEMPLATE_DIR}/停止系统.bat" "${TEMPLATE_DIR}/使用说明.txt" "${TEMPLATE_DIR}/验收清单.txt" "${STAGE_PACKAGE_DIR}/"
unzip -jq "${CADDY_ARCHIVE}" caddy.exe -d "${STAGE_PACKAGE_DIR}/server"
unzip -jq "${CADDY_ARCHIVE}" LICENSE README.md -d "${STAGE_PACKAGE_DIR}/third-party"
mv "${STAGE_PACKAGE_DIR}/third-party/LICENSE" "${STAGE_PACKAGE_DIR}/third-party/Caddy-LICENSE.txt"
mv "${STAGE_PACKAGE_DIR}/third-party/README.md" "${STAGE_PACKAGE_DIR}/third-party/Caddy-README.md"

cat > "${STAGE_PACKAGE_DIR}/版本信息.txt" <<EOF
产品名称：光棱战车:AMHS轨道影像辨识系统
应用版本：${APP_VERSION}
Git 提交：${GIT_COMMIT}
构建日期：${BUILD_DATE}
目标平台：Windows 10/11 x64
推荐浏览器：Microsoft Edge / Google Chrome
本地地址：http://127.0.0.1:18080/
离线服务器：Caddy ${CADDY_VERSION}

本交付包由当前工作区构建；提交号含 -dirty 表示构建时存在未提交修改。
压缩包完整性请使用同目录的 .sha256 文件校验。
EOF

echo "[5/7] Generating internal checksums"
(
  cd "${STAGE_PACKAGE_DIR}"
  find . -type f ! -name SHA256SUMS.txt -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS.txt
  sha256sum -c SHA256SUMS.txt >/dev/null
)

echo "[6/7] Creating and verifying ZIP"
(
  cd "${STAGE_ROOT}"
  zip -rq -6 "${STAGE_ZIP}" "${PACKAGE_NAME}"
)
unzip -tq "${STAGE_ZIP}" >/dev/null

echo "[7/7] Publishing release artifacts"
# Older versions of this script also published an expanded directory. Keep the
# release directory limited to the complete ZIP and its checksum.
rm -rf "${LEGACY_PACKAGE_DIR}"
rm -f "${FINAL_ZIP}" "${FINAL_ZIP_SHA}"
mv "${STAGE_ZIP}" "${FINAL_ZIP}"
(
  cd "${RELEASE_DIR}"
  sha256sum "$(basename "${FINAL_ZIP}")" > "$(basename "${FINAL_ZIP_SHA}")"
)

echo
echo "Release complete"
echo "ZIP: ${FINAL_ZIP}"
echo "SHA256: $(cut -d ' ' -f 1 "${FINAL_ZIP_SHA}")"
