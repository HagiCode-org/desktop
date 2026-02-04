# electron-app Specification Deltas

## ADDED Requirements

### Requirement: Web Service Port Information Visibility

The application MUST provide clear visibility of the port number used by the embedded web service in both the user interface and application logs, ensuring users can identify which port the service is listening on before and after startup.

#### Scenario: 用户查看服务启动日志

**Given** 用户启动嵌入式 Web 服务
**When** 服务开始启动流程
**Then** 日志记录配置的端口号（如 "Starting with configured port: 36556"）
**And** 日志记录端口可用性检查结果
**And** 服务启动成功后记录最终使用的端口号

#### Scenario: 用户在界面中查看端口信息

**Given** Web 服务正在运行或启动中
**When** 用户查看主窗口的服务状态卡片
**Then** 显示服务使用的端口号
**And** 端口信息以清晰的格式展示（如 "localhost:36556" 或单独显示端口号 "36556"）
**And** 端口信息随服务状态更新而变化

#### Scenario: 端口信息通过 IPC 正确传递

**Given** 主进程更新服务状态
**When** 主进程向渲染进程发送状态更新
**Then** IPC 消息包含 `port` 字段
**And** 渲染进程接收到正确的端口号
**And** Redux Store 存储端口信息

#### Scenario: 端口信息在服务生命周期中保持一致

**Given** Web 服务已成功启动
**When** 服务状态从 starting 变为 running
**Then** UI 中显示的端口号保持一致
**And** 日志中记录的端口号与 UI 显示一致
**And** IPC 传递的端口号与配置一致

#### Scenario: 用户使用不同语言查看端口信息

**Given** 应用设置为中文或英文
**When** 用户查看服务状态卡片
**Then** 端口信息的标签文本使用对应的语言
**And** 端口号本身不受语言影响

---

## MODIFIED Requirements

### Requirement: Server Status Monitoring

The application MUST connect to a local or remote Hagico Server, query its running status in real-time, and display it in the main window and system tray. The status information MUST include the port number the service is listening on.

#### Scenario: 查询服务器运行状态（含端口信息）

**Given** Hagico Server 已安装并运行
**When** 应用启动或用户手动刷新
**Then** 应用通过 HTTP API 查询服务器状态
**And** 状态结果在 3 秒内返回
**And** 主窗口显示服务器状态（运行中/已停止/错误）
**And** 主窗口显示服务使用的端口号
**And** 状态信息在服务启动前就包含即将使用的端口

#### Scenario: 服务状态信息包含端口详情

**Given** 应用正在显示 Web 服务状态
**When** 查看服务详情信息
**Then** 显示服务监听的端口号
**And** 显示完整的访问 URL（包含端口）
**And** 显示进程 ID、运行时间、重启次数等其他信息
**And** 所有信息保持同步更新

---

## Implementation Notes

### Type Definition Changes

The following interfaces MUST be updated to include port information:

**ProcessInfo interface** (in both main and renderer process):
```typescript
export interface ProcessInfo {
  status: ProcessStatus;
  pid: number | null;
  uptime: number;
  startTime: number | null;
  url: string | null;
  restartCount: number;
  phase: StartupPhase;
  phaseMessage?: string;
  port: number; // ADDED: Current port number
}
```

**WebServiceState interface** (in Redux store):
```typescript
export interface WebServiceState {
  // ... existing fields ...
  port: number; // ADDED: Current port number
}
```

### Logging Requirements

The application MUST log the following port-related information:

1. **Service Start**: `[WebService] Starting with configured port: <port>`
2. **Port Check**: `[WebService] Port availability check: <available|in use>`
3. **Success**: `[WebService] Service started successfully on port: <port>`

All logs MUST use the `info` level and follow the format shown above for consistency.

### UI Layout Changes

The service details grid in `WebServiceStatusCard` component SHOULD be updated from 4 columns to 5 columns to accommodate the port information:

```
Current: Service URL | Process ID | Uptime | Restart Count
Updated: Service URL | Process ID | Uptime | Restart Count | Port
```

The port information MAY also be integrated into the Service URL display if preferred.
