#!/bin/bash
# Claude Code hook: runs after conversation compact
# Extracts memories from the compact summary and sends to memord
#
# Install: add to .claude/settings.json hooks.PostToolUse
# Triggers on: Task (compact), which Claude Code uses for summarization

MEMORD_URL="${MEMORD_URL:-http://localhost:7432}"
SUMMARY_FILE="$1"

if [ -z "$SUMMARY_FILE" ] || [ ! -f "$SUMMARY_FILE" ]; then
  exit 0
fi

SUMMARY=$(cat "$SUMMARY_FILE")

# Send to memord extractor endpoint
curl -s -X POST "$MEMORD_URL/extract" \
  -H "Content-Type: application/json" \
  -d "{\"text\": $(echo "$SUMMARY" | jq -Rs .), \"source\": \"claude_compact\", \"app\": \"claude-code\"}" \
  > /dev/null 2>&1 || true
