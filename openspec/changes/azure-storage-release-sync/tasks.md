## 1. 准备工作

- [ ] 1.1 创建 Azure Storage Account（如尚未存在）
- [ ] 1.2 创建 Blob 容器用于存储安装包
- [ ] 1.3 生成 Blob SAS URL（需要 Write、Create、List 权限）
- [ ] 1.4 在 GitHub Repository Settings 中添加 Secret：
  - [ ] `AZURE_BLOB_SAS_URL`

## 2. 创建 GitHub Actions 工作流

- [x] 2.1 创建 `.github/workflows/sync-azure-storage.yml` 文件
- [x] 2.2 配置触发器（release 类型 + workflow_dispatch）
- [x] 2.3 添加 SAS URL 认证逻辑
- [x] 2.4 实现下载 release 资产的逻辑
- [x] 2.5 实现批量上传到 Azure Storage 的逻辑
- [x] 2.6 添加 SAS URL 解析和验证步骤
- [x] 2.7 实现自动生成 index.json 索引文件

## 3. 测试与验证

- [ ] 3.1 手动触发工作流测试（workflow_dispatch）
- [ ] 3.2 验证文件成功上传到 Azure Storage
- [ ] 3.3 验证文件路径和命名规范
- [ ] 3.4 创建测试 release 验证自动触发
- [ ] 3.5 验证所有平台文件都已同步（Windows、macOS、Linux）

## 4. 文档与配置

- [x] 4.1 更新 README 或 docs 目录，说明 Azure 配置步骤
- [x] 4.2 添加 SAS URL 配置说明
- [x] 4.3 记录容器命名规范和目录结构
- [x] 4.4 添加故障排除文档

## 5. 完成检查

- [x] 5.1 运行 `openspec validate azure-storage-release-sync --strict`
- [x] 5.2 确认所有任务已完成
- [ ] 5.3 提交 Pull Request
