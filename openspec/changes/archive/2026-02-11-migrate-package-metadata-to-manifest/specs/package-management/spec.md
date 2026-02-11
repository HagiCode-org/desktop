# package-management Specification Delta

## MODIFIED Requirements

### Requirement: 包元数据来源

应用 MUST 从已安装版本的 Manifest 文件中读取包元数据，移除代码中的硬编码包信息。

#### Scenario: 从 Manifest 读取包基本信息

**Given** 应用启动并加载已安装版本
**When** 应用需要显示包信息
**Then** 从 manifest.json 的 `package` 字段读取基本信息
**And** 包括：name、version、buildTimestamp、gitCommit
**And** 使用这些信息更新 UI 显示

#### Scenario: 从 Manifest 读取包元数据

**Given** 应用需要显示包的详细元数据
**When** 应用读取 manifest.json
**Then** 从 `metadata` 字段读取详细信息
**And** 包括：description、author、license、homepage、documentation、repository
**And** 在关于页面和帮助界面显示这些信息

#### Scenario: 包名匹配逻辑使用 Manifest 数据

**Given** 应用需要验证 NORT 包文件名
**When** 应用解析包文件名
**Then** 从 manifest.package.name 读取包名前缀
**Then** 使用包名前缀验证文件名格式
**And** 不再硬编码 "hagicode-" 前缀

---

### Requirement: 包源配置默认值

应用 MUST 从已安装版本的 Manifest 文件中读取默认包源配置，移除硬编码的包源 URL。

#### Scenario: 从 Manifest 读取默认包源配置

**Given** 应用首次启动或重置包源配置
**When** 应用初始化默认包源
**Then** 从 manifest.json 的 `packageSources` 字段读取配置
**And** 包括：defaultHttpIndex、defaultGithubRelease 等
**And** 使用读取的 URL 初始化包源

#### Scenario: Manifest 缺失时的降级行为

**Given** manifest.json 不存在或未定义 packageSources 字段
**When** 应用初始化默认包源
**Then** 使用硬编码的默认包源 URL
**And** HTTP Index: `https://server.dl.hagicode.com/index.json`
**And** GitHub: `HagiCode-org/releases`
**And** 记录降级日志
