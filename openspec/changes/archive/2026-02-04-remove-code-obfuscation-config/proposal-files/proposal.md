# 提案: 移除代码混淆配置

**变更 ID**: `remove-code-obfuscation-config`
**状态**: 📋 待审议
**创建时间**: 2025-02-04
**作者**: AI Assistant
**类型**: 🔧 配置清理 / 🎯 许可证对齐

---

## Why

Hagico Desktop 采用 AGPL-3.0 开源许可证,要求代码公开透明。然而当前项目配置了 JavaScript 代码混淆,这直接违反了开源许可证的核心原则。代码混淆增加了构建复杂度,降低了可维护性,阻碍了社区贡献,并且与 AGPL-3.0 要求的"代码必须以可理解和可修改的形式提供"相冲突。

移除代码混淆配置将:
1. 确保项目符合 AGPL-3.0 许可证的透明性要求
2. 简化构建流程,减少构建时间
3. 提升代码可读性和可调试性
4. 降低社区贡献的门槛
5. 符合开源项目的最佳实践

## What

从 Hagico Desktop 项目中完全移除 JavaScript 代码混淆相关的配置、依赖和脚本,使项目符合 AGPL-3.0 开源许可证的透明性要求。

## 概述

从 Hagico Desktop 项目中完全移除 JavaScript 代码混淆相关的配置、依赖和脚本,使项目符合 AGPL-3.0 开源许可证的透明性要求。

## 背景

### 当前状态

Hagico Desktop 是一个开源的 Electron 桌面应用程序,使用 **AGPL-3.0** 许可证。当前项目的构建配置中包含了 `javascript-obfuscator 5.1.0` 依赖,用于在打包时对 JavaScript 代码进行混淆处理。

**相关配置**:
- **构建工具**: electron-builder 26.0.12
- **代码混淆工具**: javascript-obfuscator 5.1.0
- **许可证**: AGPL-3.0 (开源许可证)

### 问题分析

当前项目配置中存在代码混淆功能,这与开源项目的本质相矛盾:

1. **许可证冲突**: 项目使用 AGPL-3.0 开源许可证,要求代码公开透明,而代码混淆违背了这一原则
2. **开发成本**: 代码混淆增加了构建时间和复杂度
3. **调试困难**: 混淆后的代码难以调试和排查问题
4. **社区贡献障碍**: 混淆代码阻碍了社区成员理解和贡献代码

## 目标

### 主要目标

- 完全移除 `javascript-obfuscator` 依赖及相关配置
- 简化构建流程,移除混淆相关脚本和命令
- 更新 CI/CD 配置,移除混淆步骤
- 确保移除后应用功能正常运行

### 非目标

- 不修改应用的核心功能
- 不改变其他构建配置(如 electron-builder 配置)
- 不影响现有的开发和调试工作流

## 变更范围

### 需要移除的内容

#### 1. 依赖清理

- **package.json**
  - 移除 `devDependencies` 中的 `javascript-obfuscator: ^5.1.0`

#### 2. 脚本清理

- **scripts/obfuscate.js** (完全删除)
  - 288 行的混淆脚本
  - 使用 worker threads 并行处理
  - 依赖 `obfuscator.config.js` 配置文件

- **scripts/ci-build.js** (修改)
  - 移除 `--skip-obfuscate` 选项
  - 移除混淆相关的日志输出
  - 简化构建逻辑

- **scripts/smoke-test.js** (修改)
  - 移除 "code shows obfuscation indicators" 测试
  - 保留其他功能性测试

#### 3. NPM Scripts 清理

从 `package.json` 的 `scripts` 中移除:
- `obfuscate`: `node scripts/obfuscate.js`
- `obfuscate:dry`: `node scripts/obfuscate.js --dry-run`
- `obfuscate:verbose`: `node scripts/obfuscate.js --verbose`
- `build:prod`: `npm run build:all && npm run obfuscate && npm run smoke-test` → 修改为 `npm run build:all && npm run smoke-test`

#### 4. 构建脚本更新

受影响的构建命令:
- `build:win`: 移除混淆步骤
- `build:appx`: 移除混淆步骤
- `build:appx:prod`: 移除混淆步骤
- `build:mac`: 移除混淆步骤
- `build:linux`: 移除混淆步骤
- `dist`: 移除混淆步骤
- `build:local`: 移除混淆步骤
- `build:local:publish`: 移除混淆步骤

## 影响分析

### 积极影响

1. **符合开源精神**: 代码完全透明,符合 AGPL-3.0 许可证要求
2. **简化构建流程**: 减少构建步骤和时间(预计减少 10-30 秒)
3. **提升可维护性**: 代码更易调试和维护
4. **促进社区贡献**: 降低贡献者理解代码的门槛
5. **减少依赖**: 移除一个开发依赖,减少潜在的安全风险

### 潜在风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 构建失败 | 低 | 中 | 执行完整构建测试验证 |
| 功能回归 | 极低 | 高 | 保留 smoke-test 确保功能正常 |
| CI/CD 流程中断 | 低 | 中 | 更新 CI 配置文件 |

**总体评估**: 风险可控,变更不会影响应用的运行时功能。

## 受影响的文件

### 需要修改的文件

1. `package.json`
   - 移除依赖项
   - 更新 scripts

2. `scripts/ci-build.js`
   - 移除混淆选项
   - 简化逻辑

3. `scripts/smoke-test.js`
   - 移除混淆检测测试

### 需要删除的文件

1. `scripts/obfuscate.js`
2. `obfuscator.config.js` (如果存在)

### 不需要修改的文件

- `electron-builder.yml` (不包含混淆配置)
- 应用源代码 (`src/` 目录)
- 其他构建配置

## 验证计划

### 验证步骤

1. **依赖清理验证**
   - [ ] 运行 `npm install` 确保依赖正确移除
   - [ ] 检查 `node_modules` 中不存在 `javascript-obfuscator`

2. **构建验证**
   - [ ] 执行 `npm run build:all` 成功
   - [ ] 执行 `npm run smoke-test` 通过
   - [ ] 执行平台特定构建 (Windows/macOS/Linux)

3. **功能验证**
   - [ ] 应用正常启动
   - [ ] 核心功能正常运行
   - [ ] 代码可读性检查

### 成功标准

- ✓ 所有构建命令成功执行
- ✓ 所有 smoke-test 通过
- ✓ 应用功能无回归
- ✓ 代码完全可读,无混淆痕迹

## 实施时间线

预计实施时间: **1-2 小时**

1. **提案审批**: 待定
2. **实施阶段**:
   - 依赖清理: 5 分钟
   - 脚本更新: 15 分钟
   - 构建测试: 15-30 分钟
   - 功能验证: 15-30 分钟

## 替代方案

### 方案 A: 完全移除 (推荐)

移除所有混淆相关代码和依赖,使代码完全透明。

**优点**:
- 完全符合开源精神
- 最大化简化
- 零维护成本

**缺点**:
- 代码完全暴露

### 方案 B: 条件混淆

保留混淆能力,但仅在特定条件下启用(如发布时)。

**优点**:
- 提供混淆选项

**缺点**:
- 增加复杂度
- 维护成本高
- 仍与许可证精神不符

### 方案 C: 使用打包替代

依赖 ASAR 打包提供基本保护,不使用代码混淆。

**优点**:
- ASAR 已启用
- 提供基本保护
- 符合开源实践

**缺点**:
- 保护程度有限

**选择**: 方案 A (完全移除)

## 依赖关系

### 前置条件

- 无

### 后续工作

- 可能需要更新 CI/CD 文档
- 可能需要更新开发者文档

## 参考资料

- [AGPL-3.0 许可证文本](https://www.gnu.org/licenses/agpl-3.0.html)
- [javascript-obfuscator 文档](https://github.com/javascript-obfuscator/javascript-obfuscator)
- [开源代码最佳实践](https://opensource.guide/)

## 附录

### AGPL-3.0 许可证相关条款

AGPL-3.0 要求:

> 1. 源代码可用性: 当你通过网络提供 AGPL 软件时,必须向用户提供源代码
> 2. 透明性要求: 代码必须以可理解和可修改的形式提供
> 3. 衍生作品: 基于该软件的修改版本也必须使用相同许可证

代码混淆与这些要求直接冲突,因为它:
- 使代码难以理解
- 增加修改难度
- 降低代码透明度

### 代码混淆在开源项目中的讨论

参考社区讨论:
- [Should open source projects be obfuscated?](https://stackoverflow.com/questions/49433102)
- [Code obfuscation and open source licensing](https://opensource.stackexchange.com/)

**共识**: 代码混淆与开源许可证的精神不符,不建议在开源项目中使用。
