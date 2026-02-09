# Hagicode Desktop

[简体中文](./README.zh-CN.md) | English

> Desktop client for Hagicode Server management and monitoring

## Overview

Hagicode Desktop is a modern desktop application built with Electron, React, and TypeScript. It provides a user-friendly interface for managing and monitoring Hagicode Server with features like version management, dependency handling, and web service control.

## Features

- **System Management**: Monitor and manage system resources and services
- **Web Service Control**: Start, stop, and restart embedded web services with ease
- **Version Management**: Install, switch, and manage multiple versions of the web service
- **Dependency Management**: Automatic detection and installation of required dependencies
- **Multi-language Support**: Built-in internationalization (i18n) support for English and Chinese
- **Modern UI**: Beautiful, responsive interface built with shadcn/ui components
- **Tray Integration**: System tray support for quick access to controls
- **Dark Mode**: Theme toggle for light and dark mode preferences

## Tech Stack

- **Framework**: Electron
- **UI**: React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **Components**: shadcn/ui, Radix UI
- **State Management**: Redux Toolkit, Redux Saga
- **Internationalization**: i18next, react-i18next

## Prerequisites

- Node.js 18+
- npm or yarn

## Installation

```bash
# Clone the repository
git clone https://github.com/HagiCode-org/desktop.git
cd desktop

# Install dependencies
npm install
```

## Development

```bash
# Start development mode (runs renderer dev server, compiles main & preload in watch mode, and starts Electron)
npm run dev
```

### Update Source Configuration

By default, HagiCode Desktop uses the official HTTP index source for both development and production builds. For local development, you can override the update source using the `UPDATE_SOURCE_OVERRIDE` environment variable:

```bash
# Use local folder for development
UPDATE_SOURCE_OVERRIDE='{"type":"local-folder","name":"Local","path":"/path/to/packages"}' npm run dev
```

For detailed configuration options and development guidelines, see the [Development Guide](./docs/development.md).

## Building

```bash
# Build for production
npm run build:prod

# Build platform-specific distributables
npm run build:win      # Windows
npm run build:mac      # macOS
npm run build:linux    # Linux
```

## Project Structure

```
desktop/
├── src/
│   ├── main/           # Electron main process code
│   ├── preload/        # Electron preload scripts
│   └── renderer/       # React frontend code
├── resources/          # Static resources (icons, etc.)
├── openspec/           # OpenSpec proposals and specifications
├── scripts/            # Build and utility scripts
└── docs/               # Project documentation
```

## CI/CD

The project uses GitHub Actions for automated building and publishing:

- **Automatic builds**: Triggered on push to main branch or when version tags are created
- **Multi-platform support**: Automatically builds installers for Windows, macOS, and Linux
- **Release sync**: Automatically syncs release files to Azure Storage for CDN acceleration

For detailed Azure configuration instructions, see the [Azure Storage Sync Configuration](./docs/azure-storage-sync.md) document.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](./LICENSE) file for details.

## Links

- [Homepage](https://github.com/HagiCode-org/desktop)
- [Issues](https://github.com/HagiCode-org/desktop/issues)

---

Made with ❤️ by the Hagicode team
