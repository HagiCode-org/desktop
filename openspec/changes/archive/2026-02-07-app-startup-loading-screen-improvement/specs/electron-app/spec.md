## ADDED Requirements

### Requirement: Application Startup Loading Screen

The application SHALL display a branded loading screen during application startup to provide visual feedback before the React application is fully loaded and rendered.

#### Scenario: 用户启动应用时看到品牌化加载界面

**Given** 用户启动 Hagicode Desktop 应用
**When** index.html 加载完成但 React 应用尚未挂载
**Then** 显示深色渐变背景的加载界面
**And** 加载界面包含 "Hagicode Desktop" 品牌标识
**And** 显示旋转的加载动画
**And** 显示 "正在加载..." 文字提示

#### Scenario: React 应用挂载后加载界面消失

**Given** 加载界面正在显示
**When** React 应用成功挂载到 #root 元素
**Then** 加载容器从 DOM 中移除
**And** 主应用界面正常显示
**And** 用户看到完整的应用界面

#### Scenario: 加载界面样式与主题一致

**Given** 应用正在显示启动加载界面
**When** 用户查看加载界面
**Then** 背景使用深色渐变（#0f172a 到 #1e293b）
**And** 文字颜色与 shadcn/ui 主题一致
**And** 整体视觉风格与应用主界面协调

#### Scenario: 加载动画流畅运行

**Given** 加载界面正在显示
**When** React 应用正在加载
**Then** 加载动画以 1 秒为周期持续旋转
**And** 动画使用纯 CSS 实现，不阻塞主线程
**And** 动画在加载完成后随容器一起移除
