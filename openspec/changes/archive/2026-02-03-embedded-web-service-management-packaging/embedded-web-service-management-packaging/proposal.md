# Proposal: 集成内嵌Web服务的管理与打包功能

## Overview

为 Hagico Desktop 添加内嵌 .NET Web 服务（PCode.Web）的完整生命周期管理能力，实现单一发布包分发，采用 self-contained 部署模式，消除外部运行时依赖。

## Problem Statement

当前 Hagico Desktop 应用存在以下核心问题：

1. **缺少进程管理能力**：应用无法启动、停止或监控内嵌的 .NET Web 程序
2. **状态可见性不足**：用户无法查看 Web 服务的运行状态或访问地址
3. **打包集成缺失**：desktop 程序与 .NET Web 程序未整合为单一发布单元
4. **运行时依赖**：未采用 self-contained 模式，依赖外部 .NET 运行时
5. **版本管理缺失**：缺乏版本文件的读取和版本更新机制

## Proposed Solution

### 核心功能模块

#### 1. 进程管理模块 (Process Management)
在 Electron 主进程中实现 .NET Web 程序的进程管理：

- **启动控制**：执行 .NET Web 程序，传递必要的配置参数
- **停止控制**：优雅地终止进程，清理资源
- **状态监控**：实时跟踪进程运行状态（运行中/已停止/异常）
- **异常处理**：检测进程崩溃并提供恢复机制
- **端口检测**：确保服务端口可用性

#### 2. 首页管理界面增强
扩展当前首页 UI，添加 Web 服务管理面板：

- **服务状态显示**：
  - 运行状态指示器（运行中/已停止/异常）
  - 服务访问地址（URL 和端口）
  - 运行时间统计
- **控制按钮**：
  - 启动按钮（服务未运行时可用）
  - 停止按钮（服务运行时可用）
  - 重启按钮（服务运行时可用）
- **实时状态更新**：通过 IPC 通信实现状态变化推送

#### 3. 软件包拉取和管理方案
采用动态软件包拉取模式，而非一体化打包：

- **包管理架构**：
  - Desktop 应用不内置 .NET Web 程序
  - 用户首次启动时，desktop 应用根据操作系统拉取对应的软件包
  - 本地开发使用 `/home/newbe36524/repos/newbe36524/pcode/Release/release-packages/` 目录
  - 生产环境从线上源下载（未来功能）

- **软件包格式**：
  ```
  release-packages/
    hagicode-{version}-linux-x64.zip        # Linux 完整包
    hagicode-{version}-linux-x64-nort.zip   # Linux 无运行时包
    hagicode-{version}-win-x64.zip          # Windows 完整包
    hagicode-{version}-win-x64-nort.zip     # Windows 无运行时包
    hagicode-{version}-osx-x64.zip          # macOS 完整包
    hagicode-{version}-osx-x64-nort.zip     # macOS 无运行时包
  ```

- **包安装流程**：
  1. 检测用户操作系统平台
  2. 检查本地是否已安装对应平台的软件包
  3. 如未安装，从本地开发目录或线上源拉取对应包
  4. 解压软件包到用户数据目录（`userData/pcode-web/`）
  5. 验证包完整性（可选：校验和验证）
  6. 从安装目录启动 Web 服务

- **目录结构设计**（安装后）：
  ```
  userData/
    pcode-web/
      installed/
        linux-x64/
          start.sh
          lib/
            PCode.Web.dll
            ... (self-contained 依赖)
        win-x64/
          PCode.Web.exe
          ... (self-contained 依赖)
        osx-x64/
          PCode.Web
          ... (self-contained 依赖)
      cache/
        hagicode-0.1.0-alpha.8-linux-x64.zip
      meta.json  # 记录当前安装的版本和平台信息
  ```

- **版本管理**：
  - 读取已安装包的版本信息
  - 检测是否有新版本可用
  - 支持版本升级和降级（未来功能）
  - 多版本共存管理（未来扩展）

#### 4. 版本管理系统
实现软件包版本的读取、显示和更新管理：

- **版本元数据**：
  - 从 `userData/pcode-web/meta.json` 读取已安装版本信息
  - 从包内的 `appsettings.yml` 或 `version.txt` 读取详细版本
  - 显示当前安装的版本和可用版本（如果不同）

- **版本检测机制**：
  - 启动时检查本地包是否存在
  - 定期检查线上源是否有新版本（未来功能）
  - 显示版本更新提示

- **后续扩展准备**：
  - 设计自动更新下载流程
  - 支持版本回滚功能
  - 为未来的自动更新功能预留接口

### 技术实施细节

#### 进程管理架构
使用 Node.js `child_process` 模块：

```typescript
// 新增：src/main/web-service-manager.ts
export class PCodeWebServiceManager {
  private process: ChildProcess | null = null;
  private config: WebServiceConfig;

  async start(): Promise<boolean>;
  async stop(): Promise<boolean>;
  async getStatus(): Promise<ProcessStatus>;
  private getExecutablePath(): string;
  private getPlatformSpecificArgs(): string[];
}
```

#### IPC 通信扩展
新增 IPC handlers：

- `get-web-service-status`：获取 Web 服务进程状态
- `start-web-service`：启动 Web 服务
- `stop-web-service`：停止 Web 服务
- `restart-web-service`：重启 Web 服务
- `get-web-service-version`：获取 Web 服务版本
- `check-package-installation`：检查软件包是否已安装
- `install-web-service-package`：安装或更新软件包

#### 软件包管理架构
实现软件包的拉取、安装和管理功能：

```typescript
// 新增：src/main/package-manager.ts
export class PCodePackageManager {
  private packageSource: string;  // 本地开发路径或线上 URL

  async checkInstalled(): Promise<PackageInfo>;
  async downloadPackage(version: string): Promise<string>;  // 下载到 cache
  async extractPackage(zipPath: string): Promise<void>;     // 解压到 installed
  async installPackage(version: string): Promise<boolean>;   // 完整安装流程
  async getAvailableVersions(): Promise<string[]>;          // 获取可用版本
  private getPackageUrl(version: string, platform: string): string;
}

interface PackageInfo {
  version: string;
  platform: string;
  installedPath: string;
  isInstalled: boolean;
}
```

**开发环境配置**：
- 本地开发包路径：`/home/newbe36524/repos/newbe36524/pcode/Release/release-packages/`
- 使用文件系统复制而非下载

**生产环境配置**（未来）：
- 从线上源下载 zip 包
- 支持断点续传
- 校验包完整性（SHA256）

#### Redux 状态管理架构
使用 Redux Toolkit + Redux Saga 管理内嵌 Web 服务的状态和副作用：

**State Slice 设计**（`src/renderer/store/slices/webServiceSlice.ts`）：
```typescript
interface WebServiceState {
  status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping';
  pid: number | null;
  url: string | null;
  version: string | null;
  lastError: string | null;
  isOperating: boolean;  // 启动/停止操作进行中
  restartCount: number;
  startTime: number | null;
}

const webServiceSlice = createSlice({
  name: 'webService',
  initialState,
  reducers: {
    setStatus: (state, action) => { /* ... */ },
    setOperating: (state, action) => { /* ... */ },
    setError: (state, action) => { /* ... */ },
    clearError: (state) => { /* ... */ },
  },
});
```

**Saga Effects 设计**（`src/renderer/store/sagas/webServiceSaga.ts`）：
- `watchWebServiceStatusChanges`：监听主进程推送的状态变化
- `startWebService`：处理启动 Web 服务的副作用
- `stopWebService`：处理停止 Web 服务的副作用
- `restartWebService`：处理重启 Web 服务的副作用
- `pollWebServiceStatus`：定期轮询服务状态（作为备份机制）

**优势**：
- 集中管理所有 Web 服务相关状态
- 副作用（IPC 调用）与 UI 逻辑解耦
- 支持复杂的状态转换（如 starting → running 或 error）
- 易于测试和维护
- 与项目现有的 Redux 架构一致

#### UI 组件设计
使用 React-Redux hooks 连接组件：

```typescript
// 在 src/renderer/components/WebServiceStatusCard.tsx 中
const { status, url, version, isOperating, lastError } = useSelector(
  (state: RootState) => state.webService
);
const dispatch = useDispatch();

// 组件通过 dispatch actions 触发 saga effects
dispatch(startWebService());
```

## Scope

### In Scope
1. Web 服务进程的启动、停止、监控功能
2. 首页 UI 集成服务管理面板
3. **软件包拉取和管理系统**（本地开发环境）
4. 跨平台软件包安装（检测平台并安装对应包）
5. 版本信息读取和显示
6. 进程异常处理和日志记录
7. 软件包缓存管理

### Out of Scope
1. **从线上源下载软件包**（后续迭代）
2. Web 服务的自动更新功能（后续迭代）
3. 日志查看器（后续迭代）
4. 高级配置编辑（如端口修改）（后续迭代）
5. 多实例管理（后续迭代）
6. 版本回滚功能（后续迭代）

## Impact

### 用户体验改进
- 用户可通过桌面应用直接管理 Web 服务，无需手动操作
- 清晰的状态反馈和控制界面
- 一键式启动/停止操作

### 运维效率提升
- **动态软件包管理减少初始安装体积**
- Self-contained 模式降低环境配置复杂度
- 跨平台一致性体验
- 本地开发环境快速迭代

### 可扩展性增强
- **软件包管理架构为自动更新奠定基础**
- 建立的进程管理框架为后续功能奠定基础
- 支持未来添加更多高级管理功能
- 版本管理系统为自动更新功能做准备

## Dependencies

### 内部依赖
- Electron 主进程架构（已存在）
- IPC 通信机制（已存在）
- React 前端框架（已存在）
- Redux Toolkit 状态管理（已存在）
- React-Redux hooks（已存在）
- 配置管理系统（已存在）

### 外部依赖
- **软件包源**：`/home/newbe36524/repos/newbe36524/pcode/Release/release-packages/`（本地开发）
- Node.js `child_process` 模块
- Node.js `fs` 和 `path` 模块（文件操作）
- **`adm-zip`** 或 `extract-zip`（需要新增安装，用于解压 zip 包）
- **`redux-saga`**（需要新增安装，用于处理异步副作用）

### 平台特定要求
- Windows：需要 `.exe` 可执行文件，从 `hagicode-{version}-win-x64.zip` 安装
- macOS：需要无扩展名的可执行文件，从 `hagicode-{version}-osx-x64.zip` 安装
- Linux：需要可执行的 shell 脚本，从 `hagicode-{version}-linux-x64.zip` 安装

## Risks and Mitigations

### 风险 1：进程权限问题
- **风险**：在不同操作系统上，进程启动可能受权限限制
- **缓解**：在打包时正确设置文件权限，确保可执行文件有执行权限

### 风险 2：端口冲突
- **风险**：Web 服务端口可能被其他应用占用
- **缓解**：实现端口检测和自动选择备用端口机制

### 风险 3：跨平台兼容性
- **风险**：不同平台的启动脚本和可执行文件格式差异
- **缓解**：为每个平台单独测试和验证，使用平台特定的启动逻辑

### 风险 4：进程僵尸问题
- **风险**：进程可能无法正常终止，导致资源泄漏
- **缓解**：实现进程树终止逻辑，强制清理子进程

### 风险 5：软件包下载失败
- **风险**：网络问题或源不可用导致软件包下载失败
- **缓解**：
  - 本地开发环境使用文件系统复制
  - 生产环境实现重试机制和断点续传
  - 提供手动安装包的备选方案

### 风险 6：软件包版本不匹配
- **风险**：安装的软件包版本与 desktop 应用不兼容
- **缓解**：
  - 在 meta.json 中记录兼容的 desktop 版本
  - 启动时验证版本兼容性
  - 提供版本降级或升级选项

### 风险 7：解压失败或磁盘空间不足
- **风险**：解压软件包时失败或用户磁盘空间不足
- **缓解**：
  - 安装前检查可用磁盘空间（需要 ~300MB）
  - 实现解压失败回滚机制
  - 提供清晰的错误提示和解决方案

## Alternatives Considered

### 方案 A：一体化打包（Embedded）
- **优点**：部署简单，无需额外下载
- **缺点**：初始安装体积大（增加 ~300MB），各平台需分别打包
- **决策**：不采用，改用动态拉取方案减少初始体积

### 方案 B：使用外部 .NET 运行时（FDD）
- **优点**：打包体积小
- **缺点**：依赖外部运行时，增加用户配置复杂度
- **决策**：不采用，优先考虑用户体验

### 方案 C：将 Web 服务集成为独立进程
- **优点**：解耦合，便于独立开发和测试
- **缺点**：增加部署复杂度
- **决策**：部分采用，Web 服务作为独立进程但通过软件包管理

### 方案 D：使用 Node.js 重写 Web 服务
- **优点**：技术栈统一
- **缺点**：工作量大，现有 .NET 代码无法复用
- **决策**：不采用，保持现有技术栈

## Success Criteria

### 功能验收标准
1. [ ] 用户可在首页启动和停止 Web 服务
2. [ ] 服务状态实时更新并正确显示
3. [ ] **软件包自动检测并安装到正确平台**
4. [ ] **版本信息正确显示，包括已安装版本和可用版本**
5. [ ] 各平台（Windows、macOS、Linux）均能正常启动和管理 Web 服务

### 性能标准
- Web 服务启动时间 < 5 秒
- 状态轮询间隔 = 5 秒（已实现）
- UI 响应时间 < 500ms

### 质量标准
- 进程异常恢复成功率 > 95%
- 日志记录完整率 100%
- 跨平台一致性通过所有平台测试

## Timeline Estimate

### 阶段 1：进程管理模块（1-2 天）
- 实现 `PCodeWebServiceManager` 类
- 添加 IPC handlers
- 单元测试

### 阶段 2：软件包管理器（1.5 天）
- 实现 `PCodePackageManager` 类
- 添加包检测、下载、解压功能
- 本地开发环境配置

### 阶段 3：Redux 状态管理（1 天）
- 创建 webService slice
- 实现 Redux sagas
- 集成到 store

### 阶段 4：UI 集成（1 天）
- 扩展首页组件
- 添加状态显示和控制按钮
- 添加软件包管理界面（安装进度、版本显示）
- 样式优化

### 阶段 5：版本管理（0.5 天）
- 实现版本读取逻辑
- UI 显示集成

### 阶段 6：测试和优化（1 天）
- 跨平台测试
- 异常处理测试
- 性能优化

**总计：约 6 - 7 天**

## Related Changes

- **依赖变更**：
  - 新增 `redux-saga`（异步副作用管理）
  - 新增 `adm-zip` 或 `extract-zip`（解压软件包）
- **影响的其他功能**：
  - 可能影响现有的 `HagicoServerClient`（远程服务器客户端）
  - 需要区分内嵌 Web 服务和远程服务器
- **破坏性变更**：无

## Open Questions

1. **软件包源配置**：生产环境的软件包下载 URL 是什么？是否需要 CDN 加速？
2. **端口配置**：Web 服务默认端口是否可配置？是否需要实现自动端口选择？
3. **多实例支持**：是否需要支持同时运行多个 Web 服务实例？
4. **日志策略**：Web 服务的日志如何管理？是否需要在桌面应用中显示？
5. **更新策略**：后续版本的 Web 服务如何更新？是否需要内置更新机制？
6. **包管理 UI**：是否需要专门的软件包管理界面（显示下载进度、可用版本等）？
7. **离线模式**：用户离线时如何处理？是否需要预装某个版本的软件包？

## References

- .NET 自包含部署文档：https://learn.microsoft.com/en-us/dotnet/core/deploying/
- electron-builder 配置文档：https://www.electron.build/
- Node.js child_process 文档：https://nodejs.org/api/child_process.html
- Node.js fs/promises 文档：https://nodejs.org/api/fs.html
- adm-zip 文档：https://www.npmjs.com/package/adm-zip
- 现有 `electron-app` 规范：`openspec/specs/electron-app/spec.md`
