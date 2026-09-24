#!/usr/bin/env bash
# Checks the local prerequisites for hotjar-pattern-finder and installs the
# one thing it safely can (the docx npm package, into this scripts/ folder).
# Usage: bash <skill-dir>/scripts/check_setup.sh
set -u
cd "$(dirname "$0")"
ok=1

check() { # name, command, fix hint
  if eval "$2" >/dev/null 2>&1; then echo "  ok   $1"; else echo "  MISSING  $1  ->  $3"; ok=0; fi
}

echo "Required"
check "python3"            "command -v python3"                       "install Python 3 (https://www.python.org or 'brew install python')"
check "Pillow (python)"    "python3 -c 'import PIL'"                  "python3 -m pip install --user pillow"
check "node (>=18)"        "node -e 'process.exit(+process.versions.node.split(\".\")[0] >= 18 ? 0 : 1)'" "install Node 18+ (https://nodejs.org or 'brew install node')"

if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  if ! node -e "require('docx')" >/dev/null 2>&1; then
    echo "  ...  installing docx npm package into $(pwd)/node_modules"
    npm install --silent --no-audit --no-fund >/dev/null 2>&1
  fi
  check "docx (npm)"       "node -e \"require('docx')\""              "run 'npm install' in $(pwd)"
fi

echo "Optional (only for the report layout check)"
check "soffice (LibreOffice)" "command -v soffice"                    "'brew install --cask libreoffice' — without it, skip the PDF render check"
check "pdftoppm (Poppler)"    "command -v pdftoppm"                   "'brew install poppler'"

echo "Not checkable here: Claude in Chrome extension connected, and Hotjar logged in in that Chrome."
if [ "$ok" = 1 ]; then echo "READY"; else echo "NOT READY — fix the MISSING items above"; exit 1; fi
