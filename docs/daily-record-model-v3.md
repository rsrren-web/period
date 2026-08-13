# 每日健康记录模型 v3

## 缺失值规则

- `null` 只表示未记录，禁止转换成 `false`、0或任意默认枚举。
- 布尔字段以 `true / false / null` 区分“是 / 否 / 未记录”。
- 可多选字段以非空数组表示已选择项目，空数组仅在用户明确选择“没有”时使用，`null` 表示未记录。
- 每个业务字段同时在 `fieldStatus` 中记录来源：`reported`、`not_recorded`、`legacy_uncertain`、`legacy_inferred`、`system_generated`、`user_corrected` 或 `legacy_manual`。

## 新增字段

| 字段 | 类型与稳定 ID | 未记录形式 |
|---|---|---|
| `menstrual_status` | `on_period / spotting_only / not_on_period` | `null` + `fieldStatus.not_recorded` |
| `cycle_day` | 1–366整数 | `null` |
| `cycle_day_source` | `auto_calculated / user_corrected / legacy_manual / not_recorded` | `not_recorded` |
| `cycle_day_anchor_start` | `YYYY-MM-DD` | `null` |
| `flow_level` | `spotting / light / medium / heavy / very_heavy` | `null` |
| `blood_color` | `bright_red / dark_red / brown / pink / other` | `null` |
| `clot_presence` | `yes / no / not_recorded` | `not_recorded` |
| `clot_level` | `small / medium / large` | `null` |
| `spotting_context` | `period_start_transition / period_end_transition / intermenstrual / uncertain` | `null` |
| `period_episode_id` | 对应正式月经事件ID | `null` |

颜色只保存观察值，不绑定诊断、体质或健康含义。完整机器约束见 `schemas/daily-record-v3.schema.json`。

## 字段关系

1. `flow_level`、`blood_color`、`clot_presence` 只有 `menstrual_status` 为 `on_period` 或 `spotting_only` 时可记录；其他状态统一保持未记录。
2. `clot_level` 只有 `clot_presence = yes` 时可记录。`no` 与 `not_recorded` 均要求 `clot_level = null`。
3. `spotting_only` 必须同时选择 `spotting_context`，系统不从日期、颜色或流量猜测上下文。
4. `period_start_transition`、`period_end_transition` 应关联 `period_episode_id`；`intermenstrual` 不得创建或移动正式月经起点；`uncertain` 在用户确认前也不得改变起点。

## cycle_day 逻辑

### 自动计算

1. 只使用经期事件表中 `type = period` 且未删除的最近一个明确起始日作为锚点。
2. `cycle_day = 记录日期 - 锚点日期 + 1`。
3. 保存 `cycle_day_source = auto_calculated`、`cycle_day_anchor_start = 锚点`，并将 `fieldStatus.cycle_day` 设为 `system_generated`。
4. `spotting_only + intermenstrual/uncertain` 永远不成为锚点。经期首尾点滴仅附着到既有经期事件，也不独立建立新周期。

### 手动修正

1. 用户可修改为1–366的整数；必须同时保留当时采用的锚点日期。
2. 保存 `cycle_day_source = user_corrected`，后续自动重算不得覆盖，除非用户明确选择“恢复自动计算”。
3. 修改正式月经起始日时，只重算 `auto_calculated` 记录；`user_corrected` 和 `legacy_manual` 保持原值并提示可能与新锚点不同。

### 历史手填

若旧记录确有“周期第N天/第N天”原始文本，则保留为 `cycle_day = N`、`cycle_day_source = legacy_manual`、`fieldStatus.cycle_day = legacy_manual`；绝不改标为自动计算。当前25条历史每日记录没有这类原始值。

## spotting 判定边界

`spotting_only` 只描述当日出血量形态，不能单独决定它是否属于本次月经。UI必须继续询问：

- 本次月经开始时的过渡点滴；
- 本次月经结束时的过渡点滴；
- 两次月经之间的点滴；
- 暂时不确定。

只有前两项可关联既有正式月经事件；中段与不确定点滴不改变周期起点。系统不依据相邻天数自行归类。

## v2 → v3 迁移

1. 保留全部 v2 字段、原始 `legacySymptoms`、时间戳和字段来源。
2. 所有历史记录的新月经字段设为未记录：`menstrual_status/flow_level/blood_color/clot_level/spotting_context/period_episode_id = null`，`clot_presence = not_recorded`，`cycle_day = null`，`cycle_day_source = not_recorded`。
3. 禁止根据当天是否落在旧经期日期范围内反填 `menstrual_status`，也禁止默认 `flow_level = medium`。
4. 迁移幂等；Worker 在同步边界兼容 v1/v2，并统一规范化成 v3。

## 已完成的 UI 联动

- 每日记录弹窗提供 `月经中 / 仅点滴出血 / 不在经期 / 暂不记录`。最后一项映射为 `null`，不会混同于明确的 `not_on_period`。
- 只有经期或点滴状态显示流量、颜色和血块；只有明确“有血块”时显示血块大小。
- 点滴状态必须继续选择四种上下文；经期首尾过渡必须关联既有正式月经，中段或不确定点滴不会建立或移动周期锚点。
- 周期日显示数值和来源，支持手动修正与恢复自动计算；历史手填值默认保留，不会因打开或保存记录被覆盖。
- 日历当天详情展示月经状态、周期日来源、出血量、颜色、血块与点滴上下文；所有缺失值明确显示“未记录”。
- 月经开始、结束与日期修改仍维护正式经期事件；保存后只重算 `auto_calculated` 周期日，`user_corrected` 和 `legacy_manual` 保持不变。
