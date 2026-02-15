#!/bin/bash

# PCode Startup Script for macOS
# This is a template that will be copied to the package root as start.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/lib"

# Check if dotnet runtime is available
if ! command -v dotnet &> /dev/null; then
    echo "Error: .NET runtime not found. Please install .NET 10.0 runtime."
    echo "Visit: https://dotnet.microsoft.com/download/dotnet/10.0"
    exit 1
fi

# Start application
echo "Starting PCode..."
exec dotnet PCode.Web.dll
