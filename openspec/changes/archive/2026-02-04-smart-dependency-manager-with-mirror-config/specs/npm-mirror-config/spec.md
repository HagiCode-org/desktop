# npm-mirror-config Specification

## Purpose

定义 Hagicode Desktop 的 npm 镜像自动配置功能，为不同地区的用户提供最优的 NPM 工具安装体验。

## ADDED Requirements

### Requirement: 基于系统语言的地区自动检测

应用 MUST 能够基于系统语言自动检测用户地区，判断用户是否可能在中国大陆，并缓存检测结果。

#### Scenario: 首次启动时自动检测地区

**Given** 应用首次启动
**And** 用户未配置过镜像源
**When** 应用主窗口加载完成
**Then** 应用在后台异步执行地区检测
**And** 检测过程不阻塞应用启动
**And** 检测在 1 秒内完成（系统语言检测）
**And** 检测结果被缓存到 electron-store

#### Scenario: 使用系统语言检测地区

**Given** 应用执行地区检测
**When** 通过 `app.getLocale()` 获取系统语言
**Then** 解析系统语言代码
**And** 判断是否为中文语言代码（zh-CN, zh-TW, zh-HK, zh-SG）
**And** 如果是中文语言，返回 `{ region: 'CN', method: 'locale' }`
**And** 否则返回 `{ region: 'INTERNATIONAL', method: 'locale' }`

#### Scenario: 使用缓存的检测结果

**Given** 应用非首次启动
**And** 距离上次检测未超过 7 天
**When** 应用启动时
**Then** 直接使用缓存的检测结果
**And** 不执行新的检测
**And** 返回 `{ region: 'CN' | 'INTERNATIONAL', method: 'cache' }`

#### Scenario: 缓存过期后重新检测

**Given** 应用非首次启动
**And** 距离上次检测已超过 7 天
**When** 应用启动时
**Then** 缓存被认为已过期
**And** 执行新的地区检测
**And** 更新缓存中的检测结果和时间戳

---

### Requirement: npm 镜像自动配置

应用 MUST 在安装 NPM 工具时，根据地区检测结果自动使用合适的镜像源。

#### Scenario: 中国地区用户自动使用淘宝镜像

**Given** 检测到用户地区为 CN（中国大陆）
**When** 用户安装 Claude Code、OpenSpec 等 NPM 工具
**Then** 自动在 npm install 命令中添加淘宝镜像参数
**And** 镜像 URL 为 `https://registry.npmmirror.com`
**And** 安装命令为 `npm install --registry https://registry.npmmirror.com -g <package>`
**And** 不修改用户的全局 .npmrc 配置

#### Scenario: 国际地区用户使用官方源

**Given** 检测到用户地区为 INTERNATIONAL
**When** 用户安装 Claude Code、OpenSpec 等 NPM 工具
**Then** 使用 npm 官方源
**And** 安装命令为 `npm install -g <package>`
**And** 不添加任何镜像参数

#### Scenario: 安装日志记录使用的镜像源

**Given** 用户正在安装 NPM 工具
**When** npm install 命令执行前
**Then** 记录日志：`Installing <package> with mirror: <mirror_url_or_official>`
**And** 如果使用淘宝镜像，显示完整镜像 URL
**And** 如果使用官方源，显示 "official"
**And** 便于用户和开发者排查安装问题

---

### Requirement: NPM 工具集成

应用 MUST 支持 Claude Code 和 OpenSpec 等 NPM 工具的自动安装，并集成镜像配置。

#### Scenario: Claude Code 安装使用镜像

**Given** 用户需要安装 Claude Code
**And** 检测到的地区为 CN
**When** 触发 Claude Code 安装
**Then** 检查 Claude Code 是否已安装
**And** 如果未安装，使用淘宝镜像执行 `npm install -g @anthropic-ai/claude-code`
**And** 验证安装结果
**And** 更新依赖状态

#### Scenario: OpenSpec 安装使用镜像

**Given** 用户需要安装 OpenSpec
**And** 检测到的地区为 CN
**When** 触发 OpenSpec 安装
**Then** 检查 OpenSpec 是否已安装
**And** 如果未安装，使用淘宝镜像执行 `npm install -g @openspec/cli`
**And** 验证安装结果
**And** 更新依赖状态

#### Scenario: 检查 NPM 工具安装状态

**Given** 应用启动或用户查看依赖状态
**When** 执行依赖检查
**Then** 对每个 NPM 工具执行 `npm list -g <package> --depth=0`
**And** 解析输出判断工具是否已安装
**And** 如果已安装，尝试提取版本号
**And** 返回安装状态信息

---

### Requirement: 配置持久化与缓存（可选）

应用 SHOULD 将检测结果持久化存储，避免重复检测。

#### Scenario: 保存检测结果到缓存

**Given** 应用完成地区检测
**When** 检测结果有效
**Then** 将结果保存到 electron-store
**And** 配置键名为 `npmRegionDetection`
**And** 配置包含：
  - `region`: 'CN' | 'INTERNATIONAL'
  - `detectedAt`: ISO timestamp
  - `method`: 'locale' | 'cache'
**And** 缓存有效期为 7 天

#### Scenario: 清除检测缓存

**Given** 用户希望重新检测地区
**When** 用户触发"重新检测"操作（可选 UI 功能）
**Then** 从 electron-store 删除 `npmRegionDetection` 配置
**And** 执行新的地区检测
**And** 保存新的检测结果

---

### Requirement: 错误处理与日志

应用 MUST 在检测和安装过程中提供详细的日志记录，便于排查问题。

#### Scenario: 地区检测失败时降级

**Given** 应用执行地区检测
**When** 系统语言检测失败或抛出异常
**Then** 记录警告日志：`Failed to detect system locale, defaulting to INTERNATIONAL`
**And** 返回 `{ region: 'INTERNATIONAL', method: 'locale' }`
**And** 不阻塞应用启动
**And** 继续正常流程

#### Scenario: npm 安装失败时记录错误

**Given** 用户正在安装 NPM 工具
**When** npm install 命令执行失败
**Then** 记录错误日志：`Failed to install <package>: <error_details>`
**And** 向用户显示友好的错误提示
**And** 不影响应用其他功能

#### Scenario: 镜像连接失败的降级处理（未实现）

**Given** 淘宝镜像可能不可用
**When** npm install 使用淘宝镜像时连接失败
**Then** 记录错误日志
**And** 建议用户检查网络连接
**And** 未来可添加自动重试或切换到官方源的机制

---

### Requirement: 国际化支持（可选）

镜像配置功能 SHOULD 支持中文和英文界面语言。

#### Scenario: 中文界面显示

**Given** 用户选择中文语言
**When** 显示镜像状态信息（如果实现 UI）
**Then** 地区标签为"中国"、"国际"
**And** 镜像名称为"官方 npm 源"、"淘宝 npm 镜像"
**And** 说明文字为中文

#### Scenario: 英文界面显示

**Given** 用户选择英文语言
**When** 显示镜像状态信息（如果实现 UI）
**Then** 地区标签为"China"、"International"
**And** 镜像名称为"Official npm"、"Taobao NPM Mirror"
**And** 说明文字为英文

---

## Implementation Notes

### 核心模块

1. **NpmMirrorHelper** (`src/main/npm-mirror-helper.ts`)
   - 基于系统语言检测地区
   - 提供 npm 安装所需的镜像参数
   - 缓存检测结果（7 天有效期）
   - 支持清除缓存和重新检测

2. **DependencyManager** (`src/main/dependency-manager.ts`)
   - 扩展支持 Claude Code 和 OpenSpec 等NPM 工具
   - 集成 NpmMirrorHelper 获取镜像配置
   - 自动使用镜像参数执行 npm install

3. **应用启动集成** (`src/main/main.ts`)
   - 在 `app.whenReady()` 中初始化 NpmMirrorHelper
   - 执行地区检测并记录结果
   - 将 NpmMirrorHelper 和 store 传递给 DependencyManager

### 数据模型

```typescript
type Region = 'CN' | 'INTERNATIONAL';

interface DetectionResult {
  region: Region;
  detectedAt: Date;
  method: 'locale' | 'cache';
}

interface AppConfig {
  // ... 其他配置 ...

  npmRegionDetection?: {
    region: Region;
    detectedAt: string; // ISO timestamp
    method: 'locale' | 'cache';
  };
}
```

### 简化说明

**相比原始设计的简化**：

1. **仅使用系统语言检测** - 不使用 IP 地址或时区检测
2. **完全自动化** - 无需用户手动配置或确认
3. **临时镜像配置** - 仅在 npm install 命令中添加参数，不修改 .npmrc
4. **零 UI 需求** - 核心功能无需 UI，状态显示为可选功能
5. **聚焦 NPM 工具** - 仅支持 Claude Code、OpenSpec 等通过 npm 安装的工具

### 未来扩展

1. 添加 IP 地址检测作为系统语言的补充
2. 实现镜像连接测试和自动切换
3. 提供完整的 UI 配置界面
4. 支持更多镜像源和手动配置
5. 添加镜像速度测试和推荐
