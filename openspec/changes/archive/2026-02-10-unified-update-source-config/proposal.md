# 统一应用更新源配置

**状态:** 已完成
**创建日期:** 2025-02-09
**完成日期:** 2026-02-09
**变更 ID:** unified-update-source-config

## 概述

统一 HagiCode Desktop 应用的更新源配置，将 HTTP 源（官方网站更新源）设置为开发版本和正式版本的主要更新源，以确保版本一致性和简化维护。

## 背景

### 当前状态

HagiCode Desktop 是一个基于 Electron 的跨平台桌面应用程序，实现了自定义的更新源管理系统，支持以下三种更新源类型：

1. **GitHub 发布源** (`github-release`) - 从 GitHub Releases API 获取版本信息
2. **HTTP 索引源** (`http-index`) - 从自定义 HTTP 服务器获取版本列表
3. **本地文件夹源** (`local-folder`) - 从本地文件夹读取包文件

### 开发/生产环境差异

当前实现根据环境变量自动选择默认源：

| 环境 | 默认源类型 | 配置 |
|------|-----------|------|
| 开发 (`NODE_ENV=development`) | `local-folder` | `/home/newbe36524/repos/newbe36524/pcode/Release/release-packages/` |
| 生产 | `http-index` | `https://server.dl.hagicode.com/index.json` |

### 核心文件

- `src/main/package-source-config-manager.ts` - 包源配置管理器
- `src/main/package-sources/package-source.ts` - 包源接口定义
- `src/main/package-sources/github-release-source.ts` - GitHub 发布源实现
- `src/main/package-sources/http-index-source.ts` - HTTP 索引源实现
- `src/main/package-sources/local-folder-source.ts` - 本地文件夹源实现

## 问题陈述

当前更新源配置存在以下问题：

1. **版本不一致风险**: 开发版本和正式版本使用不同的更新源，可能导致版本差异和测试环境与生产环境行为不一致
2. **维护复杂性**: 多个更新源增加了维护成本和同步难度，需要确保所有源上的版本信息保持一致
3. **用户体验不一致**: 不同构建类型的用户可能获取到不同的更新内容和时机
4. **开发环境路径硬编码**: 开发环境的本地路径硬编码在代码中，不利于团队协作

## 解决方案

将 HTTP 源（`https://server.dl.hagicode.com/index.json`）统一设置为开发版本和正式版本的主要更新源。

### 具体实施

1. **修改默认源配置**:
   - 更新 `package-source-config-manager.ts` 中的 `initializeDefaultSource()` 方法
   - 将开发环境和生产环境的默认源都设置为 HTTP 索引源
   - 使用统一的官方源 URL

2. **保留本地源作为可选项**:
   - 本地文件夹源不作为默认源
   - 用户可通过配置手动添加本地源用于开发和测试

3. **开发模式支持**:
   - 通过环境变量或配置文件允许开发者在需要时覆盖默认源
   - 提供便捷的开发模式切换机制

4. **版本区分机制**:
   - 利用现有索引格式中的 `channel` 或 `prerelease` 字段区分不同构建类型
   - 确保开发版本和正式版本能够从同一源获取正确的更新

## 影响评估

### 优点

- **一致性提升**: 开发版本和正式版本用户获得相同的更新体验
- **维护简化**: 只需维护一个更新源，降低出错风险
- **版本同步**: 确保所有用户都能及时获取到最新的官方发布版本
- **用户体验改善**: 统一更新来源减少混淆，提高用户信任度
- **团队协作**: 移除硬编码路径，改善开发者体验

### 风险

- **开发测试**: 开发版本从官方源获取更新可能影响测试流程
- **网络依赖**: 完全依赖官方网站可用性（需要确保高可用性）
- **发布流程**: 需要严格的发布流程确保更新质量
- **调试困难**: 开发时无法直接使用本地包进行调试

### 缓解措施

1. **保留本地源选项**: 开发者可通过配置添加本地源进行调试
2. **环境变量支持**: 提供 `UPDATE_SOURCE_OVERRIDE` 环境变量用于开发时覆盖源
3. **回退机制**: 如果官方源不可用，提供配置的备用源
4. **发布前测试**: 建立完善的发布前测试流程确保更新质量

## 技术考虑

### 配置修改

需要修改的代码位置：

```typescript
// src/main/package-source-config-manager.ts
private initializeDefaultSource(): void {
  const defaultSource = {
    type: 'http-index',
    name: 'HagiCode 官方源',
    indexUrl: 'https://server.dl.hagicode.com/index.json',
  };

  // 支持通过环境变量覆盖
  if (process.env.UPDATE_SOURCE_OVERRIDE) {
    // 使用覆盖配置
  }
}
```

### 版本区分策略

利用现有的索引格式，通过以下字段区分不同构建类型：

- `channel`: `stable` / `beta` / `alpha`
- `prerelease`: 布尔值标识预发布版本

### 兼容性

- **向后兼容**: 现有配置继续有效
- **配置迁移**: 用户现有的本地源配置不会受影响
- **API 稳定**: 包源接口保持不变

## 依赖项

### 前置条件

- [ ] 官方更新服务器 (`server.dl.hagicode.com`) 支持高可用
- [ ] 确认索引文件格式支持构建类型区分
- [ ] 建立完善的发布测试流程

### 相关变更

此变更是独立的，不依赖于其他变更。

## 成功标准

### 功能验证

- [ ] 开发版本和生产版本默认使用相同的 HTTP 更新源
- [ ] 更新检测和安装功能正常工作
- [ ] 版本区分机制正确过滤不同构建类型

### 质量标准

- [ ] 所有现有测试通过
- [ ] 新增配置相关测试覆盖
- [ ] 代码审查通过

### 用户体验

- [ ] 更新流程对用户透明无感知
- [ ] 开发者可通过配置便捷地使用本地源
- [ ] 更新失败时提供清晰的错误提示

## 替代方案

### 方案 A: 保持当前多源配置

**优点**: 灵活性高，开发调试方便

**缺点**: 维护成本高，版本一致性风险

### 方案 B: 使用 GitHub 作为唯一源

**优点**: 利用 GitHub 基础设施，稳定性高

**缺点**: 访问速度可能较慢，部分地区访问受限

### 方案 C: 统一使用本地源进行开发测试

**优点**: 开发调试最方便

**缺点**: 无法验证实际更新流程，测试覆盖不足

**推荐方案**: 本提案所述的统一 HTTP 源方案，在一致性和可维护性之间取得最佳平衡。

## 时间表

- **提案审查**: 待定
- **实施开发**: 1-2 天
- **测试验证**: 1 天
- **发布上线**: 待定

## 参考资料

- 包源配置管理器: `src/main/package-source-config-manager.ts`
- 包源接口定义: `src/main/package-sources/package-source.ts`
- HTTP 索引源实现: `src/main/package-sources/http-index-source.ts`
