## 1. Implementation

- [ ] 1.1 在 `src/main/main.ts` 顶部添加单实例锁定逻辑
- [ ] 1.2 使用 `app.requestSingleInstanceLock()` 获取实例锁
- [ ] 1.3 添加锁失败时的退出逻辑（`app.quit()`）
- [ ] 1.4 实现 `second-instance` 事件监听器
- [ ] 1.5 在 `second-instance` 中实现窗口聚焦逻辑
- [ ] 1.6 添加日志记录（使用 electron-log）
- [ ] 1.7 确保 development 模式下不受影响（可选）

## 2. Testing

- [ ] 2.1 在 Windows 上测试单实例锁定
- [ ] 2.2 在 macOS 上测试单实例锁定
- [ ] 2.3 在 Linux 上测试单实例锁定
- [ ] 2.4 验证第二次启动时窗口正确聚焦
- [ ] 2.5 验证托盘图标不会重复
- [ ] 2.6 验证 Web 服务端口不会冲突
- [ ] 2.7 验证开发模式下热重载仍然可用

## 3. Documentation

- [ ] 3.1 更新国际化文件（如需添加用户提示消息）
- [ ] 3.2 更新相关规范文档
