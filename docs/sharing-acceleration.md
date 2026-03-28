# 下载与共享加速

## 默认行为

- 只要 HTTP index 资产提供 `.torrent` sidecar 或等价 torrent metadata，Desktop 即优先走 torrent-first 下载。
- 若种子元数据不可达、sidecar 无效，或握手失败，安装流程会自动回退到 HTTP/WebSeed，不要求用户手工切换。
- `portable mode` 会强制关闭共享加速与对外做种，下载固定走 HTTP/WebSeed 回源链路。

## 可信缓存

- 已完成下载且通过 `sha256` 校验的种子资产会进入可信缓存，供后续安装复用。
- 默认缓存上限为 `5 GiB`，默认保留 `7` 天；已有用户的持久化设置值不会被本次默认值调整覆盖。
- 缓存修剪优先淘汰非 latest 资产；latest desktop 与 latest server 继续作为对外共享加速的主范围。

## 用户可见阶段

安装页会按以下语义投影进度：

1. 获取种子
2. 共享加速下载
3. 回源补块（如需）
4. 校验
5. 解压
6. 完成
