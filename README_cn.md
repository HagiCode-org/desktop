# Hagicode Desktop

[![license](https://img.shields.io/badge/license-AGPL--3.0-ffd43b)](./LICENSE)
[![build](https://img.shields.io/github/actions/workflow/status/HagiCode-org/desktop/build.yml?branch=main&label=build)](https://github.com/HagiCode-org/desktop/actions/workflows/build.yml)

[English](./README.md)

Hagicode Desktop 帮助开发者通过桌面应用完成 HagiCode Server 的安装、启动和日常管理。

## 产品概览

Hagicode Desktop 把常用 HagiCode 操作集中到一个入口：首次配置、日常启动、服务检查、版本更新、包管理和 AI 执行器选择。

## 核心能力

- 引导首次配置，简化日常服务启动
- 在桌面端启动、停止、重启和切换 HagiCode Server 版本
- 在仪表盘中查看本机资源、服务状态和健康信息
- 管理包源、依赖项、许可证信息和运行时更新
- 选择 Claude Code、Codex、GitHub Copilot CLI 等执行器
- 通过系统托盘获得快捷的后台入口
- 界面支持 10 种语言，包括英文和简体中文

## 相关文档

- `docs/development.md` - 本地开发说明与更新源配置
- `docs/artifact-signing.md` - Windows 签名配置
- `docs/r2-storage-sync.md` - 后续发布同步说明
- `docs/i18n-hagi18n.md` - 使用 hagi18n YAML 源和生成的运行时 JSON 维护 Desktop 语言包
