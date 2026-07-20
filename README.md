# 周期生活助手

一个公开、离线优先、无需账户的经期与生活方式记录 Web App。代码、经期历史和主动同步的记录存放在 GitHub。

## 第一版功能

- 146 次美柚历史经期记录（2014-11 至 2026-07）
- 动态经期范围、PMS 和日历法排卵窗口估算
- 周期长度、经期长度和异常间隔趋势
- 情绪、睡眠、精力、活动、疼痛和压力记录
- 可选基础体温、分泌物和性生活记录
- 家人只读视图；不展示性生活和分泌物
- 传统中医证候线索和食物级调养建议，不诊断、不推荐中药
- PWA 离线缓存、标准安装图标、JSON 导入导出、设备凭证和 GitHub 自动同步
- 白色主题、手机底部导航、分层快速记录和日期详情
- 每天一篇周期随笔，支持10,000字、标题、标签、本机草稿、搜索、筛选和单篇家人可见
- GitHub Actions Gmail 提醒模板

## 数据边界

公开仓库中的经期日期和同步记录任何人都可能访问。家人查看地址可使用 `?view=family`；该只读界面不显示性生活和分泌物，但公开 JSON 数据本身不提供保密性。

## Gmail 提醒配置

在仓库 `Settings → Secrets and variables → Actions` 添加：

- `GMAIL_USER`：专用 Gmail 发件邮箱
- `GMAIL_APP_PASSWORD`：开启两步验证后生成的 Gmail 应用密码
- `OWNER_EMAIL`：本人收件邮箱
- `PARTNER_EMAIL`：伴侣收件邮箱

不要把应用密码写入代码、Issue 或普通仓库文件。定时任务每天 17:17 UTC 运行，对应温哥华约上午 9:17（冬令时）或 10:17（夏令时）。只有日期等于中心预测日前一天才发信。

## 自动同步

手机记录先保存在浏览器，然后由 `period-sync` Cloudflare Worker 验证共享编辑口令，并把变更合并写入 `data/user-data.json`。每台设备首次验证后获得180天签名凭证，浏览器不保存口令。Worker 对口令验证和同步分别限流；删除使用墓碑同步，避免旧设备恢复已删除记录。GitHub Token、签名密钥和编辑口令只存在 Cloudflare Secrets 中，不进入公开网页或仓库。离线时记录保留在本机，恢复网络后重试；JSON 导出继续作为独立备份。

GitHub Token 当前到期日配置为 `2026-10-17`。网页在到期前30天显示提醒，`.github/workflows/maintenance.yml` 每周检查 Worker 与 Token，并在失败或临近到期时创建 GitHub Issue。Token 无法自动续期；更换后应同时更新 Cloudflare Secret `GITHUB_TOKEN` 和 `GITHUB_TOKEN_EXPIRES_AT` 配置并重新部署 Worker。

同步失败日志只记录时间、操作和粗略状态，不记录症状、备注、口令、Token或邮件密码。邮件任务失败同样只创建不含敏感数据的 GitHub Issue。

Worker 源码和非敏感配置位于 `worker/`，网页端地址位于 `sync-config.js`。GitHub Actions 邮件提醒同时读取截图历史和已同步的正式月经记录。

周期随笔按月存放在 `data/journals/YYYY/YYYY-MM.json`，避免长期使用时让主数据文件持续膨胀。随笔默认不在家人只读页面展示，且邮件程序不读取随笔文件；用户主动打开“家人可见”后，只读页面才显示该篇随笔。由于仓库公开，界面隐藏不等同于数据保密。

## 本地检查

```bash
npm run check
```

排卵和经期预测仅供生活安排参考，不用于避孕或医疗诊断。
