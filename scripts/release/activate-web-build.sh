#!/usr/bin/env bash

set -euo pipefail

app_root="${1:-/opt/huoqiu}"
service_name="huoqiu.service"
web_root="${app_root}/apps/web"
current_build="${web_root}/.next"
candidate_build="${web_root}/.next-release"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
previous_build="${web_root}/.next-rollback-${timestamp}"
failed_build="${web_root}/.next-failed-${timestamp}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ACTIVATE_WEB_BUILD_REQUIRES_ROOT" >&2
  exit 1
fi

case "${app_root}" in
  /*) ;;
  *)
    echo "ACTIVATE_WEB_BUILD_ROOT_MUST_BE_ABSOLUTE" >&2
    exit 1
    ;;
esac

if [[ ! -f "${current_build}/BUILD_ID" ]]; then
  echo "ACTIVATE_WEB_BUILD_CURRENT_MISSING" >&2
  exit 1
fi

if [[ ! -f "${candidate_build}/BUILD_ID" ]]; then
  echo "ACTIVATE_WEB_BUILD_CANDIDATE_MISSING" >&2
  exit 1
fi

if [[ ! -f "${candidate_build}/HUOQIU_PRODUCT_SHA" ]]; then
  echo "ACTIVATE_WEB_BUILD_CANDIDATE_UNSTAMPED" >&2
  exit 1
fi

if [[ "$(stat -c %U "${candidate_build}")" != "huoqiu" ]]; then
  echo "ACTIVATE_WEB_BUILD_CANDIDATE_OWNER_INVALID" >&2
  exit 1
fi

if ! find "${candidate_build}/static/css" -maxdepth 1 -type f -name '*.css' -print -quit | grep -q .; then
  echo "ACTIVATE_WEB_BUILD_CSS_MISSING" >&2
  exit 1
fi

systemctl stop "${service_name}"
mv "${current_build}" "${previous_build}"
mv "${candidate_build}" "${current_build}"

if systemctl start "${service_name}"; then
  echo "ACTIVATE_WEB_BUILD_OK"
  echo "ROLLBACK_BUILD=${previous_build}"
  exit 0
fi

systemctl stop "${service_name}" || true
mv "${current_build}" "${failed_build}"
mv "${previous_build}" "${current_build}"
systemctl start "${service_name}"
echo "ACTIVATE_WEB_BUILD_ROLLED_BACK" >&2
echo "FAILED_BUILD=${failed_build}" >&2
exit 1
