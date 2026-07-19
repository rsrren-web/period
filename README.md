# 周期生活助手

一个公开、离线优先、无需账户的经期与生活方式记录 Web App。代码和经期历史存放在 GitHub；本设备新增的症状和敏感记录默认只保存在浏览器中。

## 第一版功能

- 146 次美柚历史经期记录（2014-11 至 2026-07）
- 动态经期范围、PMS 和日历法排卵窗口估算
- 周期长度、经期长度和异常间隔趋势
- 情绪、睡眠、精力、活动、疼痛和压力记录
- 可选基础体温、分泌物和性生活记录
- 家人只读视图；不展示性生活和分泌物
- 传统中医证候线索和食物级调养建议，不诊断、不推荐中药
- PWA 离线缓存、JSON 导入导出、本设备编辑口令和 GitHub 自动同步
- GitHub Actions Gmail 提醒模板

## 数据边界

公开仓库中的经期日期任何人都可能访问。本地症状、自由备注、性生活、分泌物和基础体温不会自动上传。家人查看地址可使用 `?view=family`。

## Gmail 提醒配置

在仓库 `Settings → Secrets and variables → Actions` 添加：

- `GMAIL_USER`：专用 Gmail 发件邮箱
- `GMAIL_APP_PASSWORD`：开启两步验证后生成的 Gmail 应用密码
- `OWNER_EMAIL`：本人收件邮箱
- `PARTNER_EMAIL`：伴侣收件邮箱

不要把应用密码写入代码、Issue 或普通仓库文件。定时任务每天 17:17 UTC 运行，对应温哥华约上午 9:17（冬令时）或 10:17（夏令时）。只有日期等于中心预测日前一天才发信。

## 自动同步

手机记录先保存在浏览器，然后由 `period-sync` Cloudflare Worker 验证共享编辑口令，并把新增数据合并写入 `data/user-data.json`。GitHub Token 和编辑口令只存在 Cloudflare Secrets 中，不进入公开网页或仓库。离线时记录保留在本机，恢复网络后重试；JSON 导出继续作为独立备份。

Worker 源码和非敏感配置位于 `worker/`，网页端地址位于 `sync-config.js`。GitHub Actions 邮件提醒同时读取截图历史和已同步的正式月经记录。

## 本地检查

```bash
npm run check
```

排卵和经期预测仅供生活安排参考，不用于避孕或医疗诊断。
