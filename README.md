# DeepSeek Harness 任务强提醒

这是一个仅适用于 macOS 的 Host 插件。任务完成、异常结束、达到输出上限，或主会话等待审批、回答问题时，通过 macOS 通知中心发送通知并播放提示音。提醒由 Host 发出，浏览器页面不必保持打开，但 DeepSeek Harness Host 必须仍在运行。

默认只提醒主会话，不为每个子 Agent 单独提醒。完成提醒延迟 800 毫秒；Agent 在此期间重新开始工作时取消该提醒。用户主动中止的轮次不发送完成提醒。

## 安装

本插件适用于 macOS，开发时使用的 DeepSeek Harness 版本为 `0.2.2-rc.5`。先下载本仓库，在插件目录运行 `npm install` 安装依赖，再在 DeepSeek Harness 的“插件”页面选择“添加插件”，选择该目录。安装后可在插件页面启用或停用。

本地目录安装会链接这个目录，因此安装后请保留目录的位置。插件在宿主电脑上执行 `osascript`，系统通知权限和提示音也属于宿主电脑。

## 配置

在插件的 `cordis.patch.yml` 或用户补丁层中调整：

- `onComplete`：任务结束提醒，默认开启。
- `onApproval`：审批提醒，默认开启。
- `onQuestion`：提问提醒，默认开启。
- `includeSubagents`：是否提醒子 Agent，默认关闭。
- `completionDelayMs`：完成提醒去抖时间，默认 800 毫秒。
- `completionSound`：完成提示音，默认 `Glass`。
- `attentionSound`：等待操作提示音，默认 `Sosumi`。
- `commandTimeoutMs`：通知进程超时，默认 10000 毫秒。

提示音名称对应 `/System/Library/Sounds/` 中的 macOS 声音。将声音字段设为空字符串可关闭对应提示音，保留视觉通知。

## 系统设置与限制

首次测试时，macOS 可能要求允许 `osascript` 或“脚本编辑器”发送通知。请在“系统设置 → 通知”中允许通知，并确认专注模式没有屏蔽提醒。通知点击后的会话深链接未实现；收到提醒后回到 DeepSeek Harness 查看对应项目即可。
