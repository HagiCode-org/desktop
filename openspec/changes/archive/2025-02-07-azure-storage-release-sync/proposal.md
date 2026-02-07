# Change: Automatic Release File Sync to Azure Storage

## Why

当前每次发布新版本后，构建产生的安装包文件仅存储在 GitHub Release 页面，缺乏冗余备份和 CDN 加速能力。手动同步到 Azure Storage 效率低下且容易出错。

## What Changes

- **新增** GitHub Actions 工作流，在 release 发布后自动同步安装包到 Azure Storage
- **执行顺序**: 在 `build.yml` 工作流完成后执行，确保所有平台构建完成
- **支持** 自动触发（release published 事件）和手动触发（workflow_dispatch）
- **同步** 多平台安装包：Windows (.exe, .appx)、macOS (.dmg, .zip)、Linux (.AppImage, .deb, .tar.gz)
- **配置** 使用单个 Azure Blob SAS URL 进行认证，简化配置
- **自动生成** index.json 索引文件，包含所有版本和文件元数据

## Impact

- **受影响的规范**: `ci-cd`（新增规范）
- **受影响的代码**:
  - `.github/workflows/sync-azure-storage.yml`（新建）
  - GitHub Secrets 配置：`AZURE_BLOB_SAS_URL`
- **用户体验**: 通过 Azure CDN 加速下载，提升可靠性
- **开发维护**: 自动化文件分发流程，减少手动操作，只需配置一个 Secret
