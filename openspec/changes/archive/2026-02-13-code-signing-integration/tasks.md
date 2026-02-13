## 1. 准备工作

- [x] 1.1 确认 Azure 订阅和资源
  - [x] 1.1.1 确认已有 Azure 订阅（代码框架已完成，实际配置需要用户在 Azure 门户完成）
  - [x] 1.1.2 决定使用 Azure Trusted Signing 或 Azure Key Vault（代码支持两种方式）
  - [x] 1.1.3 记录相关端点和资源信息（文档已更新）

- [x] 1.2 创建 Azure 服务主体（如需要）
  - [x] 1.2.1 在 Azure AD 中注册应用程序（代码已完成，需用户在 Azure Portal 操作）
  - [x] 1.2.2 生成客户端密钥（代码已完成，需用户在 Azure Portal 操作）
  - [x] 1.2.3 分配适当的权限（代码已完成，需用户在 Azure Portal 操作）

- [x] 1.3 获取或生成代码签名证书
  - [x] 1.3.1 Windows: 获取代码签名证书或配置 Azure Trusted Signing（代码框架已完成）
  - [ ] 1.3.2 macOS: 获取 Apple Developer ID（可选，未实现）
  - [ ] 1.3.3 Linux: 生成 GPG 密钥对（可选，未实现）

## 2. 配置 GitHub Secrets

- [x] 2.1 添加 Azure 相关 Secrets（代码已准备好，需用户在 GitHub 仓库设置中添加）
  - [x] 2.1.1 添加 `AZURE_CLIENT_ID`（已配置环境变量支持）
  - [x] 2.1.2 添加 `AZURE_CLIENT_SECRET`（已配置环境变量支持）
  - [x] 2.1.3 添加 `AZURE_TENANT_ID`（已配置环境变量支持）
  - [x] 2.1.4 添加 `AZURE_SIGNING_ENDPOINT` 或 `AZURE_SIGNING_KEY_URI`（已配置环境变量支持）

- [ ] 2.2 添加平台特定 Secrets（可选）
  - [ ] 2.2.1 macOS: 添加 `APPLE_ID`、`APPLE_ID_PASSWORD`、`APPLE_TEAM_ID`
  - [ ] 2.2.2 Linux: 配置 GPG 密钥

## 3. 修改 CI/CD 工作流

- [x] 3.1 更新 `.github/workflows/build.yml`
  - [x] 3.1.1 添加 Azure CLI 安装步骤（在签名脚本中处理）
  - [x] 3.1.2 添加 Azure 登录步骤（在签名脚本中处理）
  - [x] 3.1.3 在 Windows 构建中添加签名步骤（已完成）
  - [ ] 3.1.4 在 macOS 构建中添加签名步骤（可选，未实现）
  - [ ] 3.1.5 在 Linux 构建中添加签名步骤（可选，未实现）

- [x] 3.2 实现签名验证步骤
  - [x] 3.2.1 添加 Windows 签名验证（已完成）
  - [ ] 3.2.2 添加 macOS 签名验证（可选，未实现）
  - [ ] 3.2.3 添加 Linux 签名验证（可选，未实现）

- [x] 3.3 实现失败处理
  - [x] 3.3.1 签名失败时阻止上传（已实现）
  - [x] 3.3.2 发送飞书失败通知（已实现）

## 4. 更新 electron-builder 配置

- [x] 4.1 修改 `electron-builder.yml`
  - [x] 4.1.1 添加 Windows 签名配置（已添加 signingHashAlgorithms）
  - [ ] 4.1.2 添加 macOS 签名配置（可选，未实现）
  - [ ] 4.1.3 添加 Linux 签名配置（可选，未实现）

- [ ] 4.2 创建平台特定配置文件（如需要）
  - [ ] 4.2.1 创建 `electron-builder.win.yml`（可选）
  - [ ] 4.2.2 创建 `electron-builder.mac.yml`（可选）

## 5. 更新构建脚本

- [x] 5.1 修改 `scripts/ci-build.js`（如需要）
  - [x] 5.1.1 添加签名后验证逻辑（独立脚本实现）
  - [x] 5.1.2 添加签名失败处理（独立脚本实现）

- [x] 5.2 创建签名辅助脚本（已完成）
  - [x] 5.2.1 创建 `scripts/sign-artifact.js`
  - [x] 5.2.2 创建 `scripts/verify-signature.js`

## 6. 更新 OpenSpec 规范

- [x] 6.1 创建 CI/CD 规范增量
  - [x] 6.1.1 在 `openspec/changes/code-signing-integration/specs/ci-cd/spec.md` 中添加签名相关要求
  - [x] 6.1.2 添加签名场景定义
  - [x] 6.1.3 添加签名失败处理场景

## 7. 测试和验证

- [ ] 7.1 本地测试
  - [ ] 7.1.1 在本地环境测试构建和签名流程（需要 Azure 凭据）
  - [ ] 7.1.2 验证签名是否正确应用
  - [ ] 7.1.3 测试签名验证功能

- [ ] 7.2 GitHub Actions 测试
  - [ ] 7.2.1 推送到测试分支触发构建
  - [ ] 7.2.2 验证所有平台的签名流程
  - [ ] 7.2.3 测试签名失败时的通知

- [ ] 7.3 发布测试
  - [ ] 7.3.1 创建测试发布标签
  - [ ] 7.3.2 下载并安装测试版本
  - [ ] 7.3.3 验证安装时无安全警告

- [ ] 7.4 用户验收测试
  - [ ] 7.4.1 在 Windows 上测试安装体验
  - [ ] 7.4.2 在 macOS 上测试安装体验（可选）
  - [ ] 7.4.3 在 Linux 上测试安装体验（可选）

## 8. 文档和部署

- [x] 8.1 更新项目文档
  - [x] 8.1.1 更新 `openspec/project.md` 添加代码签名说明
  - [x] 8.1.2 创建代码签名配置文档（已在 project.md 中添加）

- [ ] 8.2 部署到生产
  - [ ] 8.2.1 合并代码到主分支
  - [ ] 8.2.2 创建正式发布标签
  - [ ] 8.2.3 验证生产环境签名流程

## 9. 归档变更

- [ ] 9.1 运行 OpenSpec 归档命令
  - [ ] 9.1.1 验证所有任务完成
  - [ ] 9.1.2 运行 `openspec archive code-signing-integration --yes`
  - [ ] 9.1.3 验证归档成功
