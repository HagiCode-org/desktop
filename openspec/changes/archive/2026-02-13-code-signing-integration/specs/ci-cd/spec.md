# CI/CD Specification Delta

## ADDED Requirements

### Requirement: 代码签名集成

项目 MUST 在构建工作流中对所有平台的安装包进行代码签名，以确保应用来源可信且未被篡改。

#### Scenario: Windows 构建自动签名

**Given** GitHub Actions 构建 Windows 平台应用
**When** electron-builder 完成 .exe 和 .appx 包打包
**Then** 自动调用 Azure Artifact Signing 对安装包进行签名
**And** 签名成功后继续上传步骤
**And** 签名失败时标记构建为失败并阻止发布

#### Scenario: macOS 构建自动签名（可选）

**Given** GitHub Actions 构建 macOS 平台应用
**When** electron-builder 完成 .dmg 和 .zip 包打包
**Then** 自动使用 Apple Developer ID 对安装包进行签名
**And** 签名成功后继续上传步骤
**And** 签名失败时标记构建为失败并阻止发布

#### Scenario: Linux 构建自动签名（可选）

**Given** GitHub Actions 构建 Linux 平台应用
**When** electron-builder 完成 .AppImage 包打包
**Then** 自动使用 GPG 密钥对安装包进行签名
**And** 生成 .asc 签名文件
**And** 签名成功后继续上传步骤

#### Scenario: 代码签名失败处理

**Given** 构建工作流执行代码签名步骤
**When** 签名过程失败（证书过期、认证失败等）
**Then** 工作流标记为失败状态
**And** 阻止构建产物上传到 Release
**And** 发送飞书通知，标题包含 "❌ 代码签名失败"
**And** 通知包含失败原因和排查建议
**And** 使用 `if: failure()` 确保通知发送

#### Scenario: 签名验证步骤

**Given** 安装包签名完成
**When** 执行签名验证步骤
**Then** 验证签名是否成功应用到安装包
**And** 验证失败时标记构建为失败
**And** 在日志中显示签名验证详情

---

### Requirement: Azure Artifact Signing 配置

项目 MUST 使用 Azure Artifact Signing 服务实现自动化的代码签名。

#### Scenario: Azure 认证配置

**Given** GitHub Actions 工作流需要访问 Azure Artifact Signing
**When** 工作流启动
**Then** 使用 `AZURE_CLIENT_ID`、`AZURE_CLIENT_SECRET` 和 `AZURE_TENANT_ID` 进行 Azure 认证
**And** 认证成功后继续签名步骤
**And** 认证失败时终止构建并记录错误

#### Scenario: 签名端点配置

**Given** GitHub Actions 工作流准备调用签名服务
**When** 读取 `AZURE_SIGNING_ENDPOINT` 或 `AZURE_SIGNING_KEY_URI` 配置
**Then** 使用配置的端点进行签名请求
**And** 配置缺失时终止构建并提示配置要求

#### Scenario: 签名超时处理

**Given** Azure Artifact Signing 请求已发送
**When** 签名请求超过预设超时时间（默认 5 分钟）
**Then** 标记签名步骤为失败
**And** 在日志中记录超时信息
**And** 发送飞书失败通知

---

### Requirement: 平台特定签名配置

项目 MUST 为每个目标平台配置适当的签名方法和证书。

#### Scenario: Windows Authenticode 签名配置

**Given** 构建目标为 Windows 平台
**When** 配置 Windows 签名
**Then** 使用 Authenticode 格式对 .exe 和 .appx 文件进行签名
**And** 签名包含时间戳以防止证书过期后失效
**And** 配置签名描述和 URL

#### Scenario: macOS Apple Developer ID 签名配置

**Given** 构建目标为 macOS 平台
**When** 配置 macOS 签名
**Then** 使用 Apple Developer ID 对 .dmg 和 .app 进行签名
**And** 配置 `APPLE_ID`、`APPLE_ID_PASSWORD` 和 `APPLE_TEAM_ID`
**And** 可选：提交到 Apple 公证服务（Notarization）

#### Scenario: Linux GPG 签名配置

**Given** 构建目标为 Linux 平台
**When** 配置 Linux 签名
**Then** 使用 GPG 密钥对 .AppImage 文件进行签名
**And** 生成对应的 .asc 签名文件
**And** 上传签名文件到 Release

---

## MODIFIED Requirements

### Requirement: 主分支构建工作流

项目 MUST 在代码合并到主分支或发布标签时自动构建所有平台的应用程序包，并对安装包进行代码签名。

#### Scenario: 主分支推送触发构建

**Given** 代码合并到 `main` 分支
**When** 推送到 `main` 分支完成
**Then** 自动触发 `.github/workflows/build.yml` 工作流
**And** 构建所有平台（Windows、Linux、macOS）的应用包
**And** 对所有安装包进行代码签名
**And** 上传构建产物供下载

#### Scenario: 发布标签触发构建

**Given** 创建新的版本标签（如 `v1.0.0`）
**When** 标签推送到仓库
**Then** 自动触发 `.github/workflows/build.yml` 工作流
**And** 构建所有平台的应用包
**And** 对所有安装包进行代码签名
**And** 验证签名成功后创建 GitHub Release
**And** 上传应用包到 Release
**And** 同步到 Azure Storage

---

### Requirement: 工作流权限配置

CI/CD 工作流 MUST 使用最小必要权限原则配置访问权限，包括代码签名所需的权限。

#### Scenario: 主分支构建工作流权限

**Given** `.github/workflows/build.yml` 工作流
**When** 配置工作流权限
**Then** 授予 `contents: write` 权限以创建 Release
**And** 授予必要权限上传构建产物
**And** 如需要 Azure 签名，配置 Azure 相关的 `secrets: inherit` 权限

---

### Requirement: 代码签名启用控制

项目 MUST 支持通过环境变量控制代码签名的启用/禁用状态，以便在未配置签名服务时仍可正常构建。

#### Scenario: 禁用代码签名时的构建流程

**Given** `ENABLE_CODE_SIGNING` 环境变量未设置为 `"true"`
**When** 构建工作流执行到签名步骤
**Then** 跳过所有代码签名相关步骤
**And** 继续执行常规的上传和发布流程
**And** 在日志中记录"代码签名已禁用"

#### Scenario: 启用代码签名但凭据缺失

**Given** `ENABLE_CODE_SIGNING` 环境变量设置为 `"true"`
**When** Azure 凭据（`AZURE_CLIENT_ID`、`AZURE_CLIENT_SECRET`、`AZURE_TENANT_ID`）未完全配置
**Then** 记录警告信息说明凭据缺失
**And** 跳过签名步骤继续构建
**And** 不因凭据问题导致构建失败

#### Scenario: 启用代码签名且凭据完整

**Given** `ENABLE_CODE_SIGNING` 环境变量设置为 `"true"`
**And** 所有必需的 Azure 凭据已配置
**When** 构建工作流执行到签名步骤
**Then** 执行完整的代码签名流程
**And** 签名失败时标记构建为失败
**And** 发送失败通知到飞书

---

## 配置参考

### GitHub Secrets 配置

#### 必需 Secrets（启用签名时）

| Secret 名称 | 描述 | 示例值 |
|------------|------|--------|
| `AZURE_CLIENT_ID` | Azure 服务主体应用程序（客户端）ID | `12345678-1234-1234-1234-123456789012` |
| `AZURE_CLIENT_SECRET` | Azure 服务主体客户端密钥 | `abc123~xyz789-...` |
| `AZURE_TENANT_ID` | Azure 租户 ID | `87654321-4321-4321-4321-210987654321` |

#### 可选 Secrets（根据签名服务选择）

| Secret 名称 | 描述 | 示例值 |
|------------|------|--------|
| `AZURE_SIGNING_ENDPOINT` | Azure Trusted Signing 端点 URL | `https://signing.azure.com/api/v1/...` |
| `AZURE_SIGNING_KEY_URI` | Azure Key Vault 密钥 URI | `https://vault.azure.net/keys/...` |

#### macOS 签名 Secrets（可选）

| Secret 名称 | 描述 | 示例值 |
|------------|------|--------|
| `APPLE_ID` | Apple Developer 账户邮箱 | `developer@example.com` |
| `APPLE_ID_PASSWORD` | App 专用密码 | `abcd-efgh-ijkl-mnop` |
| `APPLE_TEAM_ID` | Apple 团队 ID | `ABCDEFGHIJ` |

### Environment Variables

| 变量名称 | 描述 | 默认值 |
|---------|------|--------|
| `ENABLE_CODE_SIGNING` | 启用代码签名 | `"false"` |
| `VERIFY_STRICT` | 签名验证严格模式 | `"false"` |

---

## 故障排除指南

### 错误 1: Azure 凭据缺失

**症状**: 工作流输出"凭据缺失"警告，跳过签名

**解决方案**:
1. 在 Azure Portal 中注册应用程序
2. 生成客户端密钥并记录值
3. 在 GitHub 仓库设置中添加 Secrets

### 错误 2: 签名端点不可访问

**症状**: 签名命令失败，显示连接错误

**解决方案**:
1. 验证 `AZURE_SIGNING_ENDPOINT` URL 正确
2. 检查服务主体权限配置
3. 确认网络连接正常

### 错误 3: 证书过期

**症状**: 签名失败，提示证书无效

**解决方案**:
1. 在 Azure Portal 更新证书
2. 或启用自动证书轮换（Azure Trusted Signing）
