## ADDED Requirements

### Requirement: HTTP索引包源支持

系统SHALL支持从HTTP服务器获取包索引和下载包文件的能力，允许用户配置自定义HTTP服务器作为包源。

#### Scenario: 用户添加HTTP索引源

- **GIVEN** 用户在包源管理页面
- **WHEN** 用户选择"HTTP 索引源"类型并输入有效的索引URL
- **THEN** 系统SHALL验证索引文件可访问
- **AND** 系统SHALL将配置保存到持久化存储

#### Scenario: 从HTTP索引源获取版本列表

- **GIVEN** 已配置有效的HTTP索引源
- **WHEN** 系统需要获取可用版本列表
- **THEN** 系统SHALL从配置的索引URL获取JSON索引文件
- **AND** 系统SHALL解析索引文件中的版本信息
- **AND** 系统SHALL仅返回与当前平台兼容的版本

#### Scenario: 从HTTP索引源下载包

- **GIVEN** 用户选择从HTTP索引源下载特定版本
- **WHEN** 下载操作开始
- **THEN** 系统SHALL使用配置的基础URL(如果提供)和资产路径构建下载URL
- **AND** 系统SHALL提供下载进度反馈
- **AND** 系统SHALL将下载的文件保存到指定缓存路径

#### Scenario: HTTP索引源配置验证

- **GIVEN** 用户尝试添加或更新HTTP索引源配置
- **WHEN** 用户提交配置
- **THEN** 系统SHALL验证索引URL是否为有效URL格式
- **AND** 系统SHALL尝试从索引URL获取数据以验证可访问性
- **AND** 如果验证失败，系统SHALL返回具体的错误信息

#### Scenario: HTTP索引源认证支持

- **GIVEN** HTTP服务器需要认证
- **WHEN** 用户配置了认证令牌
- **THEN** 系统SHALL在所有HTTP请求中包含认证令牌
- **AND** 认证令牌SHALL安全存储在配置中

#### Scenario: 索引文件格式解析

- **GIVEN** HTTP服务器返回的索引文件
- **WHEN** 系统解析索引文件
- **THEN** 系统SHALL支持包含 `versions` 数组和 `assets` 信息的JSON格式
- **AND** 系统SHALL从资产文件名中提取版本号和平台信息
- **AND** 如果索引格式无效，系统SHALL返回明确的错误信息

#### Scenario: 切换到HTTP索引源

- **GIVEN** 系统当前使用其他类型的包源
- **WHEN** 用户切换到已配置的HTTP索引源
- **THEN** 系统SHALL更新活动包源配置
- **AND** 系统SHALL清除之前源的版本缓存
- **AND** 系统SHALL显示成功切换的确认消息
