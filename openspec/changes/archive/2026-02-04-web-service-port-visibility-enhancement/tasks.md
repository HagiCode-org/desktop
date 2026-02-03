# Implementation Tasks

## 1. 类型定义更新
- [x] 1.1 更新 `src/main/web-service-manager.ts` 中的 `ProcessInfo` 接口，添加 `port: number` 字段
- [x] 1.2 更新 `src/renderer/store/slices/webServiceSlice.ts` 中的 `ProcessInfo` 接口，添加 `port: number` 字段
- [x] 1.3 更新 `src/renderer/store/slices/webServiceSlice.ts` 中的 `WebServiceState` 接口，添加 `port: number` 字段
- [x] 1.4 验证 TypeScript 编译无错误

## 2. 日志增强
- [x] 2.1 在 `start()` 方法开始处添加端口配置日志
- [x] 2.2 在端口检查后添加可用性检查结果日志
- [x] 2.3 在服务启动成功后添加最终端口日志
- [x] 2.4 验证日志格式统一，便于解析

## 3. IPC 通信扩展
- [x] 3.1 更新 `getStatus()` 方法，在返回的 `ProcessInfo` 中包含 `port` 字段
- [x] 3.2 更新 `emitPhase()` 方法，确保端口信息在阶段更新时传递
- [x] 3.3 验证主进程到渲染进程的 IPC 通信包含端口信息

## 4. Redux Store 更新
- [x] 4.1 在 `initialState` 中添加 `port: number` 字段（默认值 36556）
- [x] 4.2 添加 `setPort` action
- [x] 4.3 更新 `setProcessInfo` reducer，处理 `port` 字段
- [x] 4.4 添加 `selectWebServicePort` selector
- [x] 4.5 更新 `selectWebServiceInfo` selector，在返回对象中包含 `port` 字段
- [x] 4.6 验证 Redux 状态管理正确工作

## 5. UI 组件更新
- [x] 5.1 在 `WebServiceStatusCard.tsx` 中添加端口信息展示项
- [x] 5.2 更新服务详情网格布局，调整为 5 列（包含端口）
- [x] 5.3 添加端口信息样式和图标
- [x] 5.4 确保端口信息仅在服务运行或启动中时显示
- [x] 5.5 验证 UI 响应式布局正常工作

## 6. 国际化支持
- [x] 6.1 在 `src/renderer/i18n/locales/en-US/components.json` 中添加端口相关翻译
- [x] 6.2 在 `src/renderer/i18n/locales/zh-CN/components.json` 中添加端口相关翻译
- [x] 6.3 验证中英文切换时端口信息正确显示

## 7. 测试与验证
- [ ] 7.1 在 Windows 平台测试端口信息显示
- [ ] 7.2 在 macOS 平台测试端口信息显示
- [ ] 7.3 在 Linux 平台测试端口信息显示
- [ ] 7.4 验证服务启动、停止、重启过程中端口信息正确更新
- [ ] 7.5 验证日志记录包含完整的端口信息
- [ ] 7.6 验证 IPC 通信正确传递端口信息
- [x] 7.7 运行 TypeScript 类型检查，确保无错误
- [ ] 7.8 运行应用构建，确保跨平台构建成功

## 8. 文档更新
- [ ] 8.1 更新代码注释，说明端口信息的用途
- [ ] 8.2 确保变更记录在 CHANGELOG 中（如果存在）
