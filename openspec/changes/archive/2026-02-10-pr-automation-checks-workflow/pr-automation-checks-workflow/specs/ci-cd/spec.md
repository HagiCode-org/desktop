## ADDED Requirements

### Requirement: Pull Request Quality Checks

The application MUST enforce automated quality checks on Pull Requests before merging to ensure code quality and prevent issues from reaching the main branch.

#### Scenario: PR 创建时自动触发检查

**Given** 开发者创建新的 Pull Request
**When** PR 打开或更新
**Then** GitHub Actions 自动触发 pr-checks.yml 工作流
**And** 工作流在 ubuntu-latest 运行器上执行
**And** 检查状态显示在 PR 页面

#### Scenario: 依赖安装验证

**Given** PR 检查工作流开始执行
**When** 运行 `npm ci` 安装依赖
**Then** 所有项目依赖成功安装
**And** npm 缓存被用于加速后续构建
**And** 如果依赖安装失败，检查状态为失败

#### Scenario: TypeScript 类型检查验证

**Given** 依赖安装成功
**When** 运行 `npm run build:tsc:check` 进行类型检查
**Then** TypeScript 编译器验证所有类型定义
**And** 如果存在类型错误，检查失败并显示错误信息
**And** 如果类型检查通过，继续下一步检查

#### Scenario: 生产构建验证

**Given** TypeScript 类型检查通过
**When** 运行 `npm run build:prod` 进行生产构建
**Then** 执行完整的构建流程（tsc、preload、renderer）
**And** 运行 smoke-test.js 验证构建产物
**And** 如果构建失败，检查失败并显示错误信息
**And** 如果构建成功，继续下一步检查

#### Scenario: 冒烟测试验证

**Given** 生产构建成功
**When** 运行 `npm run smoke-test` 执行冒烟测试
**Then** 验证 dist 目录结构正确
**And** 验证 main.js、renderer、preload 文件存在
**And** 验证 package.json 配置正确
**And** 验证 electron-builder 配置有效
**And** 如果任何测试失败，检查失败并显示详细结果

#### Scenario: 检查通过允许合并

**Given** PR 的所有检查都通过
**When** 开发者审查代码无误
**Then** GitHub 允许合并 PR
**And** 合并后触发主分支的 build.yml 工作流

#### Scenario: 检查失败阻止合并

**Given** PR 的任一检查失败
**When** 开发者尝试合并 PR
**Then** GitHub 阻止合并操作
**And** 开发者必须修复问题后重新提交
**And** 修复后的提交重新触发检查工作流

#### Scenario: 工作流配置

**Given** PR 检查工作流已配置
**When** 查看工作流配置
**Then** 使用 Node.js 22（与主构建保持一致）
**And** 缓存 npm 依赖以加速构建
**And** 仅在 pull_request 事件时触发
**And** 不在 push 事件时触发（避免与 build.yml 重复）
