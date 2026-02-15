#!/bin/bash
#
# PCode Linux Dependency Verification Script
# Checks all dependencies and generates JSON result file
#

# Note: set -e is disabled to allow arithmetic operations that may return non-zero
# set +e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Locate and source dependencies.env file
# The env file contains version requirements auto-generated from manifest.json
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/dependencies.env"

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: dependencies.env file not found at $ENV_FILE${NC}"
    echo "This file is auto-generated during build. Please ensure you have a complete package."
    exit 1
fi

# Source the version requirements
# shellcheck source=dependencies.env
source "$ENV_FILE"

# Set default values in case env file is missing some variables
DOTNET_MIN_VERSION="${DOTNET_MIN_VERSION:-10.0}"
NODE_MIN_VERSION="${NODE_MIN_VERSION:-18.0.0}"
NPM_MIN_VERSION="${NPM_MIN_VERSION:-9.0.0}"
CLAUDE_CODE_MIN_VERSION="${CLAUDE_CODE_MIN_VERSION:-1.0.0}"
OPENSPEC_MIN_VERSION="${OPENSPEC_MIN_VERSION:-0.23.0}"
OPENSPEC_MAX_VERSION="${OPENSPEC_MAX_VERSION:-1.0.0}"

echo -e "${GREEN}=== PCode Dependency Check ===${NC}"
echo ""

# Initialize JSON result
RESULT_FILE="check-result.json"

# Function to check version comparison (simplified)
version_ge() {
    if [ -z "$1" ] || [ -z "$2" ]; then
        return 1
    fi
    # Remove 'v' prefix if present
    local v1=$(echo "$1" | sed 's/^v//')
    local v2=$(echo "$2" | sed 's/^v//')
    # Simple string comparison for now (can be improved with proper version comparison)
    [ "$v1" != "$v2" ] && [ "$v1" \> "$v2" ] || [ "$v1" = "$v2" ]
}

# Check .NET
echo "Checking .NET runtime..."
if command -v dotnet &> /dev/null; then
    DOTNET_VERSION=$(dotnet --version 2>/dev/null || echo "unknown")
    DOTNET_PATH=$(which dotnet 2>/dev/null || echo "")
    echo -e "${GREEN}✓ .NET runtime found: $DOTNET_VERSION${NC}"
    DOTNET_STATUS="\"status\": \"installed\", \"version\": \"$DOTNET_VERSION\", \"path\": \"$DOTNET_PATH\""
else
    echo -e "${RED}✗ .NET runtime not found (min: $DOTNET_MIN_VERSION)${NC}"
    DOTNET_STATUS="\"status\": \"not_installed\", \"version\": null, \"path\": null"
fi

# Check Node.js
echo "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version 2>/dev/null | sed 's/^v//' || echo "unknown")
    NODE_PATH=$(which node 2>/dev/null || echo "")
    echo -e "${GREEN}✓ Node.js found: v$NODE_VERSION${NC}"
    NODE_STATUS="\"status\": \"installed\", \"version\": \"v$NODE_VERSION\", \"path\": \"$NODE_PATH\""
else
    echo -e "${RED}✗ Node.js not found (min: v$NODE_MIN_VERSION)${NC}"
    NODE_STATUS="\"status\": \"not_installed\", \"version\": null, \"path\": null"
fi

# Check NPM
echo "Checking NPM..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version 2>/dev/null || echo "unknown")
    NPM_PATH=$(which npm 2>/dev/null || echo "")
    echo -e "${GREEN}✓ NPM found: v$NPM_VERSION${NC}"
    NPM_STATUS="\"status\": \"installed\", \"version\": \"v$NPM_VERSION\", \"path\": \"$NPM_PATH\""
else
    echo -e "${RED}✗ NPM not found (min: v$NPM_MIN_VERSION)${NC}"
    NPM_STATUS="\"status\": \"not_installed\", \"version\": null, \"path\": null"
fi

# Check Claude Code
echo "Checking Claude Code..."
if command -v claude &> /dev/null; then
    CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
    CLAUDE_PATH=$(which claude 2>/dev/null || echo "")
    echo -e "${GREEN}✓ Claude Code found: $CLAUDE_VERSION${NC}"
    CLAUDE_STATUS="\"status\": \"installed\", \"version\": \"$CLAUDE_VERSION\", \"path\": \"$CLAUDE_PATH\""
else
    echo -e "${YELLOW}⚠ Claude Code not found (optional)${NC}"
    CLAUDE_STATUS="\"status\": \"not_installed\", \"version\": null, \"path\": null"
fi

# Check OpenSpec
echo "Checking OpenSpec..."
if command -v openspec &> /dev/null; then
    OPENSPEC_VERSION=$(openspec --version 2>/dev/null || echo "unknown")
    OPENSPEC_PATH=$(which openspec 2>/dev/null || echo "")

    # Extract version number (remove 'v' prefix if present, format like "0.23.0")
    VERSION_NUM=$(echo "$OPENSPEC_VERSION" | sed 's/^v//' | sed 's/[^0-9.]//g')

    # Simple version comparison: check if version is within range [min, max)
    # This uses string comparison which works for semver-like versions
    if [[ "$VERSION_NUM" > "$OPENSPEC_MIN_VERSION" || "$VERSION_NUM" == "$OPENSPEC_MIN_VERSION" ]] && [[ "$VERSION_NUM" < "$OPENSPEC_MAX_VERSION" ]]; then
        echo -e "${GREEN}✓ OpenSpec found: $OPENSPEC_VERSION${NC}"
        OPENSPEC_STATUS="\"status\": \"installed\", \"version\": \"$OPENSPEC_VERSION\", \"path\": \"$OPENSPEC_PATH\""
    else
        echo -e "${RED}✗ OpenSpec version $OPENSPEC_VERSION is out of range (min: $OPENSPEC_MIN_VERSION, max: $OPENSPEC_MAX_VERSION)${NC}"
        OPENSPEC_STATUS="\"status\": \"version_mismatch\", \"version\": \"$OPENSPEC_VERSION\", \"path\": \"$OPENSPEC_PATH\", \"error\": \"Version must be between $OPENSPEC_MIN_VERSION and $OPENSPEC_MAX_VERSION\""
    fi
else
    echo -e "${YELLOW}⚠ OpenSpec not found (optional)${NC}"
    OPENSPEC_STATUS="\"status\": \"not_installed\", \"version\": null, \"path\": null"
fi

# Calculate installed counts before generating JSON
TOTAL_INSTALLED=0
REQUIRED_INSTALLED=0
READY=false

[ -n "$DOTNET_VERSION" ] && TOTAL_INSTALLED=$((TOTAL_INSTALLED + 1)) && REQUIRED_INSTALLED=$((REQUIRED_INSTALLED + 1))
[ -n "$NODE_VERSION" ] && TOTAL_INSTALLED=$((TOTAL_INSTALLED + 1)) && REQUIRED_INSTALLED=$((REQUIRED_INSTALLED + 1))
[ -n "$NPM_VERSION" ] && TOTAL_INSTALLED=$((TOTAL_INSTALLED + 1)) && REQUIRED_INSTALLED=$((REQUIRED_INSTALLED + 1))
[ -n "$CLAUDE_VERSION" ] && TOTAL_INSTALLED=$((TOTAL_INSTALLED + 1))
[ -n "$OPENSPEC_VERSION" ] && TOTAL_INSTALLED=$((TOTAL_INSTALLED + 1))

# Check if ready (all required dependencies installed)
[ -n "$DOTNET_VERSION" ] && [ -n "$NODE_VERSION" ] && [ -n "$NPM_VERSION" ] && READY=true || READY=false

# Generate JSON result
cat > "$RESULT_FILE" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "platform": "linux",
  "dependencies": {
    "dotnet": { $DOTNET_STATUS, "required": true, "minVersion": "$DOTNET_MIN_VERSION" },
    "node": { $NODE_STATUS, "required": true, "minVersion": "$NODE_MIN_VERSION" },
    "npm": { $NPM_STATUS, "required": true, "minVersion": "$NPM_MIN_VERSION" },
    "claude-code": { $CLAUDE_STATUS, "required": false, "minVersion": "$CLAUDE_CODE_MIN_VERSION" },
    "openspec": { $OPENSPEC_STATUS, "required": false, "minVersion": "$OPENSPEC_MIN_VERSION", "maxVersion": "$OPENSPEC_MAX_VERSION" }
  },
  "summary": {
    "total": 5,
    "installed": $TOTAL_INSTALLED,
    "requiredInstalled": $REQUIRED_INSTALLED,
    "ready": $READY
  }
}
EOF

echo ""
echo -e "${GREEN}✓ Check complete. Results written to: $RESULT_FILE${NC}"
echo ""
cat "$RESULT_FILE" | grep -E '"status"|"ready"'

exit 0
