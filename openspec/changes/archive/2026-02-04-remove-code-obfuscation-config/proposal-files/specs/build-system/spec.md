# build-system Specification

## Purpose
定义 Hagico Desktop 项目的构建系统规范,确保构建过程符合开源项目的透明性要求并支持多平台发布。

## ADDED Requirements

### Requirement: 开源透明构建

项目的构建过程 MUST 完全透明,生成的代码 MUST 清晰可读,不得使用代码混淆或其他降低代码可读性的技术。

#### Scenario: 生产构建输出可读代码

**Given** 开发者执行生产构建命令
**When** 构建过程完成
**Then** 生成的 JavaScript 代码保持清晰的变量命名
**And** 代码结构完整,包含合理的换行和缩进
**And** 不包含十六进制标识符 (如 `0x1234`)
**And** 不包含字符串数组混淆模式
**And** 源代码可以通过 ASAR 打包发布,但内容可读

#### Scenario: 构建产物可调试

**Given** 开发者需要调试生产版本
**When** 打开 dist/ 目录下的 JavaScript 文件
**Then** 代码可以正常阅读和理解
**And** 错误堆栈包含有意义的函数名和行号
**And** 开发者可以使用 DevTools 设置断点

---

### Requirement: AGPL-3.0 许可证合规

构建系统 MUST 确保所有发布的代码都符合 AGPL-3.0 开源许可证的透明性要求。

#### Scenario: 源代码可用性

**Given** 用户使用 Hagico Desktop 应用
**When** 用户请求查看源代码
**Then** 用户能够通过 GitHub 仓库获取完整源代码
**And** 发布的安装包中包含可读的源代码
**And** 没有技术手段阻碍用户理解和修改代码

#### Scenario: 代码透明性验证

**Given** 开源社区审查项目代码
**When** 审查者检查构建产物
**Then** 构建产物中的代码与源代码仓库一致
**And** 没有隐藏的混淆或加密
**And** 代码的修改和分发不受技术限制

---

### Requirement: 构建依赖管理

项目的构建依赖 MUST 专注于编译、打包和发布工具,不包含代码保护或混淆相关的依赖。

#### Scenario: 开发依赖列表

**Given** 开发者查看 package.json 的 devDependencies
**When** 列出所有构建依赖
**Then** 包含编译工具 (TypeScript, Vite)
**And** 包含打包工具 (electron-builder)
**And** 包含开发辅助工具 (ESLint, Prettier - 如有)
**And** 不包含代码混淆工具 (如 javascript-obfuscator)

#### Scenario: 依赖安全性

**Given** 项目使用第三方构建依赖
**When** 审计依赖安全性
**Then** 所有依赖来自可信来源
**And** 依赖数量保持在最小必要范围
**And** 定期更新依赖以修复安全漏洞

---

### Requirement: 跨平台构建支持

构建系统 MUST 支持 Windows、macOS 和 Linux 平台的打包和发布。

#### Scenario: Windows 平台构建

**Given** 开发者在 Windows 平台或 CI 环境中
**When** 执行 `npm run build:win`
**Then** 生成 Windows 安装包 (NSIS, AppX)
**And** 生成的代码清晰可读
**And** 安装包可以正常安装和运行

#### Scenario: macOS 平台构建

**Given** 开发者在 macOS 平台或 CI 环境中
**When** 执行 `npm run build:mac`
**Then** 生成 macOS 安装包 (DMG)
**And** 生成的代码清晰可读
**And** 安装包可以正常安装和运行

#### Scenario: Linux 平台构建

**Given** 开发者在 Linux 平台或 CI 环境中
**When** 执行 `npm run build:linux`
**Then** 生成 Linux 安装包 (AppImage, deb, tar.gz)
**And** 生成的代码清晰可读
**And** 安装包可以正常运行

---

### Requirement: 构建脚本组织

构建脚本 MUST 清晰明确,每个脚本专注于单一职责。

#### Scenario: 核心构建脚本

**Given** 开发者查看 scripts/ 目录
**When** 列出所有构建脚本
**Then** `obfuscate.js` 不存在 (已移除)
**And** `ci-build.js` 专注于 CI/CD 构建
**And** `smoke-test.js` 验证构建产物
**And** `bump-version.js` 管理版本号

#### Scenario: NPM Scripts 清晰性

**Given** 开发者查看 package.json 的 scripts 部分
**When** 执行 `npm run` 查看所有可用命令
**Then** 构建命令命名清晰 (build:all, build:renderer 等)
**And** 不包含混淆相关命令 (obfuscate, obfuscate:dry 等)
**And** 生产构建命令直接且易理解

---

### Requirement: 构建验证和质量保证

构建系统 MUST 包含自动化验证步骤,确保构建产物的正确性和质量。

#### Scenario: Smoke Test 验证

**Given** 开发者完成构建
**When** 执行 `npm run smoke-test`
**Then** 验证 dist/ 目录结构正确
**Then** 验证主进程文件存在且语法有效
**Then** 验证渲染进程文件存在
**Then** 验证预加载脚本存在
**Then** 验证 package.json 配置正确
**Then** 验证 electron-builder 配置有效
**And** 所有测试通过后才能发布

#### Scenario: 代码质量检查

**Given** 开发者提交代码或执行构建
**When** 运行质量检查脚本
**Then** TypeScript 类型检查通过
**Then** ESLint 检查通过 (如配置)
**Then** 构建无警告或错误
**And** 不检查代码混淆特征 (已移除此测试)
