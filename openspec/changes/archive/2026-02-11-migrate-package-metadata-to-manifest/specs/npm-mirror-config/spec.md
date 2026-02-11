# npm-mirror-config Specification

## ADDED Requirements

### Requirement: Manifest 驱动的 NPM 镜像配置

应用 MUST 支持从已安装版本的 Manifest 文件中读取 NPM 镜像配置，实现配置驱动的镜像源管理。

#### Scenario: 从 Manifest 读取默认镜像配置

**Given** 已安装版本包含 manifest.json
**And** manifest.json 中定义了 `npmConfig` 字段
**When** 应用初始化 NPM 镜像配置
**Then** 从 `npmConfig.mirrors` 读取镜像配置
**And** 根据 detectedRegion 选择对应的镜像源
**And** 使用选择的镜像源执行 NPM 安装

#### Scenario: Manifest 中定义区域化镜像配置

**Given** manifest.json 中的 `npmConfig.mirrors` 包含以下结构：
```json
{
  "china": "https://registry.npmmirror.com",
  "global": "https://registry.npmjs.org"
}
```
**When** 用户位于中国区域
**Then** 应用使用 china 镜像源
**When** 用户位于国际区域
**Then** 应用使用 global 镜像源

#### Scenario: Manifest 缺失时的降级行为

**Given** manifest.json 不存在或未定义 npmConfig 字段
**When** 应用初始化 NPM 镜像配置
**Then** 应用使用硬编码的默认镜像配置
**And** China 区域使用 `https://registry.npmmirror.com`
**And** 国际区域使用 `https://registry.npmjs.org`
**And** 记录降级日志

---

### Requirement: NPM 安装命令的镜像参数注入

应用 MUST 在执行 NPM 安装命令时自动注入正确的 `--registry` 参数。

#### Scenario: 安装依赖时使用配置的镜像源

**Given** 用户点击安装 NPM 依赖
**And** 当前配置使用 npmmirror 镜像源
**When** 应用执行 NPM 安装命令
**Then** 命令包含 `--registry https://registry.npmmirror.com` 参数
**And** 或命令包含 `--registry https://registry.npmjs.org` 参数（国际区域）
**And** 镜像源参数位于 install 命令之前

#### Scenario: 镜像源状态查询

**Given** 用户在设置界面查看 NPM 镜像配置
**When** 应用查询当前镜像状态
**Then** 显示当前使用的镜像名称
**And** 显示镜像 URL
**And** 显示区域检测结果
**And** 显示检测时间
