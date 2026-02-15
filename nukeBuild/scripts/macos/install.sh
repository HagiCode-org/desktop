#!/bin/bash
#
# PCode macOS Dependency Installation Script
# Automatically installs missing dependencies based on version requirements
#

set -e

# Default values
REGION="global"
ARCH=$(uname -m)
DRY_RUN=false
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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
DOTNET_RECOMMENDED_VERSION="${DOTNET_RECOMMENDED_VERSION:-10.0}"
NODE_MIN_VERSION="${NODE_MIN_VERSION:-18.0.0}"
NODE_RECOMMENDED_VERSION="${NODE_RECOMMENDED_VERSION:-24.12.0}"
NPM_MIN_VERSION="${NPM_MIN_VERSION:-9.0.0}"
NPM_RECOMMENDED_VERSION="${NPM_RECOMMENDED_VERSION:-10.9.0}"
CLAUDE_CODE_MIN_VERSION="${CLAUDE_CODE_MIN_VERSION:-1.0.0}"
OPENSPEC_MIN_VERSION="${OPENSPEC_MIN_VERSION:-0.23.0}"
OPENSPEC_MAX_VERSION="${OPENSPEC_MAX_VERSION:-1.0.0}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --region=*)
            REGION="${1#*=}"
            shift
            ;;
        --arch=*)
            ARCH="${1#*=}"
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --region=cn|global    Region selection (default: global)"
            echo "  --arch=x64|arm64     Architecture (default: auto-detected)"
            echo "  --dry-run           Show commands without executing"
            echo "  -v, --verbose       Enable verbose output"
            echo "  -h, --help          Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Normalize architecture names
case $ARCH in
    x86_64|amd64)
        ARCH="x64"
        ;;
    aarch64|arm64)
        ARCH="arm64"
        ;;
    *)
        echo -e "${RED}Unsupported architecture: $ARCH${NC}"
        exit 1
        ;;
esac

echo -e "${BLUE}=== PCode Dependency Installation ===${NC}"
echo -e "Platform: macOS ($ARCH)"
echo -e "Region: $REGION"
echo ""

# Function to execute or dry-run
run_cmd() {
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[DRY RUN]${NC} $*"
    else
        if [ "$VERBOSE" = true ]; then
            echo -e "${GREEN}Executing:${NC} $*"
        fi
        eval "$@"
    fi
}

# Track installed count
INSTALLED_COUNT=0
FAILED_COUNT=0

# Check and install Homebrew if not present
if ! command -v brew &> /dev/null; then
    echo -e "${YELLOW}⚠ Homebrew not found, installing...${NC}"
    run_cmd "/bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""

    if [ "$DRY_RUN" = false ]; then
        echo -e "${GREEN}✓ Homebrew installed${NC}"
        ((INSTALLED_COUNT++))
    fi
fi

# Check and install .NET
echo "Checking .NET runtime..."
if command -v dotnet &> /dev/null; then
    DOTNET_VERSION=$(dotnet --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✓ .NET runtime already installed: $DOTNET_VERSION${NC}"
else
    echo -e "${YELLOW}✗ .NET runtime not found, installing...${NC}"
    run_cmd "brew install dotnet"

    if [ "$DRY_RUN" = false ]; then
        echo -e "${GREEN}✓ .NET runtime installed${NC}"
        ((INSTALLED_COUNT++))
    fi
fi

# Check and install Node.js
echo ""
echo "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✓ Node.js already installed: $NODE_VERSION${NC}"
else
    echo -e "${YELLOW}✗ Node.js not found, installing...${NC}"
    run_cmd "brew install node"

    if [ "$DRY_RUN" = false ]; then
        echo -e "${GREEN}✓ Node.js installed${NC}"
        ((INSTALLED_COUNT++))
    fi
fi

# Check and install NPM
echo ""
echo "Checking NPM..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✓ NPM already installed: v$NPM_VERSION${NC}"
else
    echo -e "${YELLOW}✗ NPM not found, installing...${NC}"

    # Use recommended version for installation
    NPM_INSTALL_VERSION="${NPM_RECOMMENDED_VERSION}"
    if [ "$REGION" = "cn" ]; then
        NPM_REGISTRY="--registry=https://registry.npmmirror.com"
    else
        NPM_REGISTRY=""
    fi

    # Ensure Node.js is available
    if ! command -v npm &> /dev/null && ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js not available. Please install Node.js first.${NC}"
        ((FAILED_COUNT++))
    else
        run_cmd "npm install npm@$NPM_INSTALL_VERSION -g $NPM_REGISTRY"

        if [ "$DRY_RUN" = false ]; then
            echo -e "${GREEN}✓ NPM installed${NC}"
            ((INSTALLED_COUNT++))
        fi
    fi
fi

# Check and install Claude Code (optional)
echo ""
echo "Checking Claude Code (optional)..."
if command -v claude &> /dev/null; then
    CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✓ Claude Code already installed: $CLAUDE_VERSION${NC}"
else
    echo -e "${YELLOW}⚠ Claude Code not found (optional), installing...${NC}"

    if ! command -v npm &> /dev/null; then
        echo -e "${YELLOW}⚠ NPM not available, skipping Claude Code installation${NC}"
    else
        if [ "$REGION" = "cn" ]; then
            NPM_REGISTRY="--registry=https://registry.npmmirror.com"
        else
            NPM_REGISTRY=""
        fi

        run_cmd "npm install @anthropic-ai/claude-code@latest -g $NPM_REGISTRY"

        if [ "$DRY_RUN" = false ]; then
            echo -e "${GREEN}✓ Claude Code installed${NC}"
            ((INSTALLED_COUNT++))
        fi
    fi
fi

# Check and install OpenSpec (optional)
echo ""
echo "Checking OpenSpec (optional)..."
if command -v openspec &> /dev/null; then
    OPENSPEC_VERSION=$(openspec --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✓ OpenSpec already installed: $OPENSPEC_VERSION${NC}"
else
    echo -e "${YELLOW}⚠ OpenSpec not found (optional), installing...${NC}"

    if ! command -v npm &> /dev/null; then
        echo -e "${YELLOW}⚠ NPM not available, skipping OpenSpec installation${NC}"
    else
        if [ "$REGION" = "cn" ]; then
            NPM_REGISTRY="--registry=https://registry.npmmirror.com"
        else
            NPM_REGISTRY=""
        fi

        # Install OpenSpec at the minimum version
        run_cmd "npm install @fission-ai/openspec@${OPENSPEC_MIN_VERSION} -g $NPM_REGISTRY"

        if [ "$DRY_RUN" = false ]; then
            echo -e "${GREEN}✓ OpenSpec installed${NC}"
            ((INSTALLED_COUNT++))
        fi
    fi
fi

# Summary
echo ""
echo -e "${BLUE}=== Installation Summary ===${NC}"
echo -e "Components installed/updated: ${GREEN}$INSTALLED_COUNT${NC}"
echo -e "Components failed: ${RED}$FAILED_COUNT${NC}"

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}[DRY RUN] No actual changes made${NC}"
else
    echo -e "${GREEN}✓ Installation completed${NC}"
    echo ""
    echo "If this is your first installation, please restart your terminal."
fi

exit 0
