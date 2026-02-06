# 实施任务清单

## 1. 后端实现

- [x] 1.1 在 `src/main/main.ts` 中添加 `open-external` IPC 处理器
- [x] 1.2 在 IPC 处理器中实现 URL 安全验证（防止打开恶意链接）
- [x] 1.3 调用 Electron 的 `shell.openExternal()` API 打开外部链接
- [x] 1.4 添加错误处理，处理链接打开失败的情况
- [x] 1.5 验证 IPC 处理器能正确处理外部链接打开请求

## 2. Preload API 实现

- [x] 2.1 在 `src/preload/index.ts` 中添加 `openExternal` API
- [x] 2.2 定义 `openExternal` 函数的类型签名（接收 URL 字符串，返回 Promise）
- [x] 2.3 在 ElectronAPI 接口中声明 `openExternal` 方法
- [x] 2.4 验证 preload API 在渲染进程中可用

## 3. 国际化翻译

- [x] 3.1 在 `src/renderer/i18n/locales/en-US/common.json` 中添加导航菜单翻译
  - `navigation.officialWebsite`: "Official Website"
  - `navigation.officialWebsiteDesc`: "Visit Hagicode official website for latest news and documentation"
  - `navigation.techSupport`: "Technical Support"
  - `navigation.techSupportDesc`: "Join our QQ group for technical support (Group: 610394020)"
  - `navigation.githubProject`: "GitHub Project"
  - `navigation.githubProjectDesc`: "View source code and star us on GitHub"
- [x] 3.2 在 `src/renderer/i18n/locales/zh-CN/common.json` 中添加导航菜单翻译
  - `navigation.officialWebsite`: "官方网站"
  - `navigation.officialWebsiteDesc`: "访问 Hagicode 官方网站获取最新资讯和文档"
  - `navigation.techSupport`: "技术支持群"
  - `navigation.techSupportDesc`: "加入 QQ 技术交流群获取帮助（群号：610394020）"
  - `navigation.githubProject`: "GitHub 项目"
  - `navigation.githubProjectDesc`: "在 GitHub 上查看源码并给我们 Star"
- [x] 3.3 验证翻译文件格式正确且无语法错误

## 4. 侧边栏导航更新

- [x] 4.1 从 lucide-react 导入所需图标（Globe、Users、Star）
- [x] 4.2 在 `src/renderer/components/SidebarNavigation.tsx` 的 `navigationItems` 数组中添加三个外部链接菜单项
- [x] 4.3 为每个菜单项配置：
  - `type: 'external-link'` 标识类型
  - 唯一的 `id` 标识符
  - 对应的 `icon` 组件
  - 使用 `t()` 函数的 `label` 翻译键
  - 目标 URL 的 `url` 属性
  - 使用 `t()` 函数的 `description` 翻译键（用于 tooltip 或辅助文本）
- [x] 4.4 实现外部链接菜单项的点击处理逻辑
  - 调用 `openExternal` API
  - 传递配置的 URL
  - 处理可能的错误情况
- [x] 4.5 为外部链接菜单项添加视觉样式（区别于视图切换菜单项）
- [x] 4.6 验证新菜单项显示正确且可点击

## 5. 图标和样式

- [x] 5.1 确认官方网站使用 Globe 图标
- [x] 5.2 确认技术支持群使用 Users 或 MessageCircle 图标
- [x] 5.3 确认 GitHub 项目使用 Star 或 GitHub 图标
- [x] 5.4 为外部链接菜单项添加悬停效果
- [x] 5.5 添加可选的 tooltip 显示链接描述
- [x] 5.6 确保在不同主题下的视觉效果

## 6. 安全性考虑

- [x] 6.1 实现 URL 白名单验证（可选但推荐）
- [x] 6.2 验证 URL 协议仅允许 https:// 和 http://
- [x] 6.3 添加 URL 格式验证，防止无效 URL
- [x] 6.4 记录外部链接打开失败的错误日志

## 7. 测试与验证

- [x] 7.1 测试点击"官方网站"菜单项能在默认浏览器中打开 https://hagicode.com/
- [x] 7.2 测试点击"技术支持群"菜单项能在默认浏览器中打开 QQ 加群页面
- [x] 7.3 测试点击"GitHub项目"菜单项能在默认浏览器中打开 GitHub 仓库页面
- [x] 7.4 测试中英文语言切换时菜单项显示正确的翻译内容
- [x] 7.5 测试菜单项悬停时显示描述信息（如果实现）
- [x] 7.6 测试点击外部链接菜单项不会切换应用视图
- [x] 7.7 测试网络离线时打开链接的错误处理
- [x] 7.8 验证不影响现有功能的正常运行
- [x] 7.9 在不同操作系统（Windows、macOS、Linux）上测试外部链接打开行为

## 8. 可选增强功能

- [ ] 8.1 添加链接点击统计（如果需要）
- [ ] 8.2 实现外部链接配置化（便于后续维护）
- [x] 8.3 添加菜单项分隔线或分组
- [ ] 8.4 添加外部链接菜单项的快捷键支持
