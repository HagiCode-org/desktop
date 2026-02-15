# ci-cd Specification

## Purpose
定义项目 CI/CD 工作流的规范和要求，确保代码质量和构建一致性。

## Requirements

### Requirement: PR 检查工作流

项目 MUST 在 Pull Request 创建或更新时自动执行质量检查，确保只有通过所有检查的代码才能合并到主分支。

#### Scenario: PR 创建时触发检查

**Given** 开发者创建新的 Pull Request
**When** PR 打开到目标分支
**Then** 自动触发 `.github/workflows/pr-checks.yml` 工作流
**And** 执行依赖安装、类型检查、构建和测试验证

#### Scenario: PR 更新时重新触发检查

**Given** 存在活跃的 Pull Request
**When** 开发者推送新提交到 PR 分支
**Then** 自动重新触发 `.github/workflows/pr-checks.yml` 工作流
**And** 对最新代码执行完整验证

#### Scenario: 依赖安装检查

**Given** PR 检查工作流开始执行
**When** 运行 `npm ci` 安装依赖
**Then** 依赖安装成功后继续后续步骤
**And** 依赖安装失败时标记检查为失败
**And** 阻止 PR 合并

#### Scenario: TypeScript 类型检查

**Given** 依赖安装成功
**When** 运行 `npm run build:tsc:check` 进行类型检查
**Then** 类型检查通过后继续构建步骤
**And** 类型错误时标记检查为失败
**And** 显示具体的类型错误信息
**And** 阻止 PR 合并

#### Scenario: 生产构建检查

**Given** TypeScript 类型检查通过
**When** 运行 `npm run build:prod` 执行生产构建
**Then** 构建成功后继续测试步骤
**And** 构建失败时标记检查为失败
**And** 显示构建错误信息
**And** 阻止 PR 合并

#### Scenario: 冒烟测试检查

**Given** 生产构建成功
**When** 运行 `npm run smoke-test` 执行冒烟测试
**Then** 测试通过后标记所有检查成功
**And** 测试失败时标记检查为失败
**And** 显示测试失败信息
**And** 阻止 PR 合并

---

### Requirement: 主分支构建工作流

项目 MUST 在代码合并到主分支或发布标签时自动构建所有平台的应用程序包。

#### Scenario: 主分支推送触发构建

**Given** 代码合并到 `main` 分支
**When** 推送到 `main` 分支完成
**Then** 自动触发 `.github/workflows/build.yml` 工作流
**And** 构建所有平台（Windows、Linux、macOS）的应用包
**And** 上传构建产物供下载

#### Scenario: 发布标签触发构建

**Given** 创建新的版本标签（如 `v1.0.0`）
**When** 标签推送到仓库
**Then** 自动触发 `.github/workflows/build.yml` 工作流
**And** 构建所有平台的应用包
**And** 创建 GitHub Release
**And** 上传应用包到 Release
**And** 同步到 Azure Storage

---

### Requirement: Node.js 版本一致性

所有 CI/CD 工作流 MUST 使用相同版本的 Node.js，确保构建结果一致性。

#### Scenario: PR 检查使用 Node.js 22

**Given** PR 检查工作流执行
**When** 设置 Node.js 环境
**Then** 使用 Node.js 版本 22
**And** 启用 npm 缓存加速依赖安装

#### Scenario: 主分支构建使用 Node.js 22

**Given** 主分支构建工作流执行
**When** 设置 Node.js 环境
**Then** 所有平台构建使用 Node.js 版本 22
**And** 启用 npm 缓存加速依赖安装

---

### Requirement: 检查失败处理

PR 检查工作流 MUST 在任何步骤失败时提供清晰的错误信息和恢复建议。

#### Scenario: 依赖安装失败时的错误提示

**Given** PR 检查工作流执行
**When** `npm ci` 步骤失败
**Then** 工作流标记为失败状态
**And** 在 GitHub Actions 日志中显示依赖安装错误
**And** PR 页面显示检查失败标记
**And** 阻止 PR 合并

#### Scenario: 类型检查失败时的错误提示

**Given** 依赖安装成功
**When** `npm run build:tsc:check` 步骤失败
**Then** 工作流标记为失败状态
**And** 在 GitHub Actions 日志中显示类型错误详情
**And** PR 页面显示检查失败标记
**And** 阻止 PR 合并

#### Scenario: 构建失败时的错误提示

**Given** 类型检查通过
**When** `npm run build:prod` 步骤失败
**Then** 工作流标记为失败状态
**And** 在 GitHub Actions 日志中显示构建错误详情
**And** PR 页面显示检查失败标记
**And** 阻止 PR 合并

#### Scenario: 测试失败时的错误提示

**Given** 生产构建成功
**When** `npm run smoke-test` 步骤失败
**Then** 工作流标记为失败状态
**And** 在 GitHub Actions 日志中显示测试失败详情
**And** PR 页面显示检查失败标记
**And** 阻止 PR 合并

---

### Requirement: 检查摘要显示

PR 检查工作流 MUST 在 Actions 摘要页面提供清晰的检查状态摘要。

#### Scenario: 检查通过摘要

**Given** 所有 PR 检查步骤成功完成
**When** 生成检查摘要
**Then** 显示 ✅ 通过状态图标
**And** 显示目标分支名称
**And** 显示提交 SHA
**And** 显示触发者信息
**And** 提供查看详情链接

#### Scenario: 检查失败摘要

**Given** 任一 PR 检查步骤失败
**When** 生成检查摘要
**Then** 显示 ❌ 失败状态图标
**And** 显示目标分支名称
**And** 显示提交 SHA
**And** 显示触发者信息
**And** 提供查看详情链接
**And** 在日志顶部显示错误通知

---

### Requirement: GitHub 仓库配置

仓库管理员 MUST 配置 GitHub 仓库设置，将 PR 检查设置为合并的必需条件。

#### Scenario: 配置必需的状态检查

**Given** 仓库管理员访问仓库设置
**When** 进入 Branches > Branch protection rules
**Then** 添加或编辑 `main` 分支保护规则
**And** 启用 "Require status checks to pass before merging"
**And** 添加 "PR Checks" 工作流到必需检查列表
**And** 启用 "Require branches to be up to date before merging"

#### Scenario: 配置阻止未通过的合并

**Given** 仓库管理员配置分支保护
**When** 启用必需状态检查
**Then** PR 检查未通过时无法点击 "Merge" 按钮
**And** PR 检查通过后才允许合并
**And** 过时的分支（未更新到最新 main）无法合并

---

### Requirement: 工作流权限配置

CI/CD 工作流 MUST 使用最小必要权限原则配置访问权限。

#### Scenario: PR 检查工作流权限

**Given** `.github/workflows/pr-checks.yml` 工作流
**When** 配置工作流权限
**Then** 仅授予 `contents: read` 权限读取代码
**And** 仅授予 `pull-requests: read` 权限读取 PR 信息
**And** 不授予写入权限以防止安全风险

#### Scenario: 主分支构建工作流权限

**Given** `.github/workflows/build.yml` 工作流
**When** 配置工作流权限
**Then** 授予 `contents: write` 权限以创建 Release
**And** 授予必要权限上传构建产物

---

### Requirement: Azure Storage 同步工作流

项目 MUST 在发布标签创建后自动将发布资源同步到 Azure Storage，并在同步完成后发送飞书通知。

#### Scenario: 发布标签触发 Azure 同步

**Given** 创建新的版本标签（如 `v1.0.0`）
**When** 标签推送到仓库且构建完成
**Then** 自动触发 `.github/workflows/sync-azure-storage.yml` 工作流
**And** 下载发布资源到临时目录
**And** 上传资源到 Azure Storage 对应版本目录
**And** 生成并上传 index.json 文件
**And** 发送同步结果通知到飞书

#### Scenario: Azure 同步成功通知

**Given** Azure Storage 同步工作流执行
**When** 所有资源成功上传到 Azure Storage
**Then** 发送飞书通知，标题包含 "✅ Azure 同步成功"
**And** 通知包含版本信息
**And** 通知包含上传文件数量
**And** 通知包含 Azure Storage 路径
**And** 通知包含提交 SHA 和触发者信息
**And** 通知包含 GitHub Actions 查看链接

#### Scenario: Azure 同步失败通知

**Given** Azure Storage 同步工作流执行
**When** 同步过程中发生错误
**Then** 发送飞书通知，标题包含 "❌ Azure 同步失败"
**And** 通知包含版本信息
**And** 通知提供错误排查建议
**And** 通知包含 GitHub Actions 查看链接
**And** 使用 `if: always()` 确保无论成功失败都发送通知

#### Scenario: 手动触发 Azure 同步

**Given** 存在已发布的版本
**When** 通过 workflow_dispatch 手动触发 sync-azure-storage.yml
**Then** 使用指定的版本标签或最新版本进行同步
**And** 执行完整的同步流程
**And** 发送同步结果通知到飞书

---

### Requirement: 飞书通知集成

项目 MUST 使用统一的飞书通知基础设施发送构建和同步状态通知。

#### Scenario: 复用现有通知配置

**Given** 项目已配置 FEISHU_WEBHOOK_URL 密钥
**When** Azure 同步工作流需要发送通知
**Then** 使用 HagiCode-org/haginotifier@v1.0.0 工作流
**And** 通过 secrets: inherit 继承 FEISHU_WEBHOOK_URL
**And** 使用 msg_type: 'post' 发送富文本消息

#### Scenario: 通知消息格式

**Given** 需要发送 Azure 同步通知
**When** 构建通知消息内容
**Then** 消息标题包含状态图标（✅ 成功 / ❌ 失败）
**Then** 消息内容包含版本、文件数量、存储路径
**Then** 消息包含提交 SHA、触发者和查看链接
**And** 通知不包含敏感信息（如 SAS URL 完整内容）

---

### Requirement: 发布渠道配置支持

CI/CD 工作流 MUST 支持在发布过程中指定渠道（channel）参数，用于区分 stable、beta、dev 等不同发布渠道的版本。

#### Scenario: 主分支发布自动设置 stable 渠道

**Given** 代码合并到 `main` 分支并创建版本标签（如 `v1.0.0`）
**When** 触发构建和发布工作流
**Then** 自动设置渠道为 `stable`
**And** 生成的 index.json 中对应版本标记为 `stable` 渠道

#### Scenario: 预发布版本设置 beta 渠道

**Given** 创建预发布版本标签（如 `v1.0.0-beta.1`）
**WHEN** 触发构建和发布工作流
**THEN** 自动设置渠道为 `beta`
**AND** 生成的 index.json 中对应版本标记为 `beta` 渠道

#### Scenario: 手动指定渠道参数

**Given** 通过 workflow_dispatch 手动触发发布
**WHEN** 用户在触发时指定渠道参数
**THEN** 使用指定的渠道值
**AND** 生成的 index.json 中对应版本使用指定渠道

---

### Requirement: index.json 渠道结构生成

Azure Storage 同步工作流 MUST 在生成 index.json 时包含完整的渠道结构信息。

#### Scenario: 生成包含 channels 对象的 index.json

**Given** 发布资源已上传到 Azure Storage
**WHEN** 执行 index.json 生成步骤
**THEN** 生成的 index.json 包含 `channels` 对象
**AND** `channels` 对象包含所有活跃渠道（stable、beta、dev 等）
**AND** 每个渠道包含 `latest` 和 `versions` 字段

#### Scenario: 版本正确映射到对应渠道

**Given** 存在多个不同渠道的版本
**WHEN** 生成 index.json
**THEN** 每个版本对象包含 `channel` 字段
**AND** 版本根据其版本号标识正确归类到对应渠道
**AND** stable 渠道包含不含预发布标识的版本
**AND** beta 渠道包含含 beta 标识的版本

#### Scenario: 更新 channels 对象的 latest 版本

**Given** 某渠道有多个版本
**WHEN** 生成 channels 对象
**THEN** 每个渠道的 `latest` 字段指向该渠道最新版本
**AND** `versions` 数组包含该渠道所有版本列表

---

### Requirement: index.json 向后兼容性

生成的 index.json MUST 保持与现有解析逻辑的向后兼容性。

#### Scenario: 不含 channels 的旧版本兼容

**Given** Desktop 客户端的 http-index-source.ts 解析 index.json
**WHEN** 读取包含 channels 对象的 index.json
**THEN** 正确解析 channels 对象结构
**AND** 为每个版本映射正确的 channel 信息
**AND** 当 channels 不存在时，将所有版本默认为 `beta` 渠道

#### Scenario: 渠道信息可选字段处理

**Given** index.json 包含 channels 对象
**WHEN** 某些版本未在 channels.versions 中列出
**THEN** 这些版本的 channel 字段为空或 undefined
**AND** 客户端容错处理，不影响版本列表显示

---

### Requirement: 飞书通知渠道信息

Azure 同步完成的飞书通知 MUST 包含发布渠道信息。

#### Scenario: 成功通知包含渠道信息

**Given** Azure Storage 同步工作流成功完成
**WHEN** 发送飞书通知
**THEN** 通知消息包含发布的渠道信息
**AND** 消息格式包含渠道名称（如 "正式版"、"测试版"）

#### Scenario: 不同渠道的版本统计

**Given** 发布包含多个渠道的版本
**WHEN** 发送飞书通知
**THEN** 通知消息按渠道分组显示版本统计
**AND** 显示每个渠道的最新版本信息
