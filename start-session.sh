#!/bin/bash
# start-session.sh — fitness monorepo
# Usage: ./start-session.sh [small|medium|debug|review|large|planning]
# Default: medium
TIER=${1:-medium}
BASE="--read CONTEXT.md --read memory-bank/activeContext.md"
FULL="$BASE --read memory-bank/progress.md"
ALL="$FULL --read memory-bank/techStack.md --read memory-bank/systemPatterns.md"
case $TIER in
  small)    aider --model ollama/mistral-small3.2 --read CONTEXT.md ;;
  medium)   aider --model ollama/qwen2.5-coder:32b $FULL ;;
  debug)    aider --model ollama/deepseek-r1:32b $FULL ;;
  review)   aider --model ollama/gemma4:31b $FULL ;;
  large)    aider --model ollama/qwen3.6:35b $ALL ;;
  planning) echo "⚠ Close other models first (42GB)"; read -p "Continue? (y/n): " c; [ "$c" = "y" ] && aider --model ollama/llama3.3:70b $ALL ;;
  *)
    echo "Usage: ./start-session.sh [small|medium|debug|review|large|planning]"
    echo ""
    echo "  small    mistral-small3.2  — quick tasks"
    echo "  medium   qwen2.5-coder:32b — daily coding (DEFAULT)"
    echo "  debug    deepseek-r1:32b   — hard bugs"
    echo "  review   gemma4:31b        — code review"
    echo "  large    qwen3.6:35b       — full context"
    echo "  planning llama3.3:70b      — architecture (run alone)"
    ;;
esac
