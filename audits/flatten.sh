#!/bin/sh
# Flatten the v2 contracts into the one file the QoreChain dashboard's Contract
# Auditor takes (paste source), and print what to record for the audit.
#
#   npm run flatten            write audits/flattened/PealTenderV2.flat.sol
#   npm run flatten -- --check fail if the committed file is out of date (CI)
#
# The flattened file holds PealTenderV2 and everything it compiles with:
# TenderBook, TenderClearing, ISealedAuction, qore-pq-kit v0.3.0's PqAuth and
# PqAuthSet, and the OpenZeppelin pieces.
set -eu
cd "$(dirname "$0")/.."
out=audits/flattened/PealTenderV2.flat.sol
tmp=$(mktemp)
forge flatten src/PealTenderV2.sol > "$tmp"
if [ "${1:-}" = "--check" ]; then
  if cmp -s "$tmp" "$out"; then
    echo "audits: $out is up to date"
    rm -f "$tmp"
    exit 0
  fi
  echo "audits: $out is out of date; run npm run flatten and commit it" >&2
  rm -f "$tmp"
  exit 1
fi
mv "$tmp" "$out"
echo "wrote $out"
echo "  lines:  $(wc -l < "$out" | tr -d ' ')"
echo "  sha256: $(shasum -a 256 "$out" | cut -d' ' -f1)"
echo "  source commit: $(git rev-parse HEAD)$(git diff --quiet -- src || echo ' (with uncommitted changes in src/)')"
