## 1. Nuke GitHub Token 集成配置

### 参考实现
参考 `/home/newbe36524/repos/newbe36524/hagicode-release/` 项目：

- `Build.cs:26` - GitHubActions 特性配置
- `Build.Partial.cs:100` - EffectiveGitHubToken 计算属性
- `Build.Targets.GitHub.cs:26,66` - EffectiveGitHubToken 使用方式

- [ ] 1.1 在 `Build.cs` 的 GitHubActions 特性中添加 `EnableGitHubToken = true`
- [ ] 1.2 在 `Build.Partial.cs` 中添加 `EffectiveGitHubToken` 计算属性
- [ ] 1.3 更新 `Build.AzureStorage.cs` 使用 `EffectiveGitHubToken` 替代直接使用 `GitHubToken`

## 2. 环境变量配置修复

- [ ] 2.1 在 `sync-azure-storage.yml` 中添加 `GITHUB_TOKEN` 环境变量
- [ ] 2.2 验证 GitHub Actions 工作流权限配置（`permissions: contents: read`）
- [ ] 2.3 在工作流中添加配置注释，说明 Token 的用途和权限要求

## 3. GitHub CLI 环境变量修正

### 参考实现
参考 `/home/newbe36524/repos/newbe36524/hagicode-release/nukeBuild/Build.Targets.GitHub.cs:66`：
```csharp
["GH_TOKEN"] = token
```

- [ ] 3.1 在 `Build.AzureStorage.cs` 中使用 `GH_TOKEN` 环境变量传递给 GitHub CLI（而非 `GITHUB_TOKEN`）
- [ ] 3.2 确保所有 `gh release download` 和 `gh release view` 命令都通过 `GH_TOKEN` 环境变量认证

## 4. 错误提示改进

- [ ] 4.1 修改 `Build.AzureStorage.cs` 中的 GitHub Token 检查逻辑，使用 `EffectiveGitHubToken`
- [ ] 4.2 添加详细的配置指引信息（变量名称、配置位置、权限要求）
- [ ] 4.3 确保错误信息在 CI 日志中清晰可见

## 5. 验证测试

- [ ] 5.1 本地测试：手动设置 GITHUB_TOKEN 环境变量后运行 Nuke 构建
- [ ] 5.2 CI 测试：推送代码到 `fff` 分支触发工作流
- [ ] 5.3 验证 `PublishToAzureBlob` 目标能够成功执行
- [ ] 5.4 确认 GitHub Release 资产能够正常下载
- [ ] 5.5 确认构建产物能够成功上传到 Azure Blob Storage
- [ ] 5.6 验证 `EnableGitHubToken = true` 配置生效，GitHubActions.Instance.Token 可用

## 6. 文档更新

- [ ] 6.1 在项目文档中更新 GitHub Token 配置说明（如果存在）
- [ ] 6.2 在工作流文件中添加清晰的注释说明配置方式
- [ ] 6.3 添加参考实现链接到 hagicode-release 项目
