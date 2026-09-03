# TCM 功能—UI 合同

本文件是个人中医观察与调养系统的实现合同。面向用户的能力必须形成“记录或配置 → 本地保存 → 设备同步 → 标准化 → 分析 → UI 解释 → 可执行操作 → 反馈学习”的闭环。中医状态和模式只用于整理个人记录，不构成诊断。

| 功能 | 数据生产者 | 存储字段 | 标准化 feature | 分析/推荐消费者 | 记录或配置入口 | 结果入口 | 用户操作与空状态 | 测试 | 当前状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 每日 TCM 体感 | 每日记录弹窗 | `tcm:*` | `cold_sensation`、`warmth_relief`、`nausea`、`diarrhea`、`bloating`、`appetite_low`、`body_heaviness` | 统一 careContext、推荐、数据质量、cluster、趋势 | Today → 每日记录 → 身体体感 | Today 调养、趋势 TCM | 可明确“没有以上体感”；未操作为未记录 | daily semantics、careContext、cluster | 已统一接入；可见进度仍待补 |
| pain detail | 每日记录弹窗 | `detail:pain_nature:*`、`detail:pain_response:*`、`painLocations`、`pain` | `pain_quality.*`、`pain_response.*`、`pain.*` | 统一 careContext、推荐、数据质量、多状态趋势 | Today → 每日记录 → 疼痛 | Today、当天详情、趋势 | 可明确无疼痛表现；未操作为未记录 | daily detail、careContext、state cluster | 已统一接入；更多规则待扩展 |
| sleep detail | 每日记录弹窗 | `detail:sleep_issue:*`、`sleep`、`bedtime` | `sleep_onset_difficulty`、`sleep_fragmentation`、`dream_disturbed_sleep`、`early_waking`、`unrefreshed_sleep` | 统一 careContext、推荐、数据质量、多状态趋势 | Today → 每日记录 → 睡眠与排便 | Today、趋势 | 可明确无所列睡眠表现；未操作为未记录 | daily detail、careContext、state cluster | 已统一接入 |
| bowel detail | 每日记录弹窗 | `detail:bowel:*`、`bowelMovement` | `bowel_normal`、`stool_hard`、`stool_loose`、`stool_sticky`、`diarrhea`、`no_bowel_movement` | careContext、持续事件、推荐 | Today → 每日记录 → 睡眠与排便 | Today、趋势 | 单选包含“未排便”；不选择为未记录 | daily detail、recommendation | 已接通 |
| menstrual detail | 经期日期 + 每日记录弹窗 | `menstrual_status`、`flow_level`、`blood_color`、`clot_*` | `menstrual_status`、`flow_level`、`blood_color`、`clot_level` | 周期模型、careContext、推荐、趋势 | Today 首页设置日期；经期日弹窗记录表现 | Today、日历、趋势 | 非经期隐藏；历史扩展枚举保留兼容 | menstrual UI、sync | 已接通 |
| 近期中医状态 | `tcm-state-engine` | 派生，不写回每日记录 | 7 个 `TcmState`，含支持证据、反证、频率、趋势和可信度 | Today、趋势、推荐排序与解释 | 来源于每日记录 | Today 最多3项；趋势常驻模块 | 无数据时显示用途、有效记录天数、门槛和记录入口 | state engine、recommendation、orchestrator、UI contract | 已闭环接通 |
| TCM pattern/cluster | `tcm-cluster-engine` | 派生分析快照 | 9 个 `TcmPattern`，含支持条件、反证、加权分数、组成项、近期出现和跨周期支持 | 趋势、推荐排序与解释 | 来源于每日记录 | 趋势 → 反复模式 | 无成熟结果时常驻显示继续记录；有结果时可展开支持与反向证据 | pattern engine、recommendation、orchestrator、UI contract | 已闭环接通 |
| 周期特异性 | `tcm-cluster-engine` | 派生分析快照 | `phase_specificity`：经期、经前5天、经后恢复期、全周期或未集中 | 趋势、推荐阶段加权 | 来源于周期和每日记录 | 趋势 → 反复模式；Today 推荐“周期原因” | 每个已识别模式显示主要周期位置；与今天一致时小幅加权 | pattern phase、recommendation tests | 已接通 |
| 长期体质 | 待建 ConstitutionProfile | 待定 profile schema | `constitutionBaseline`、`constitutionEvidence90d` | 推荐低权重、趋势 | More → 调养档案 | 趋势“长期体质” | 无人工基线时明确“尚未建立” | 待建 migration/UI | 未实现 |
| 调养推荐 | RecommendationEngine + intervention 库 | 派生 | `CareRecommendation` | Today renderer | 自动生成 | Today 针对性调养 | 无证据不推荐；当天记录优先于近期状态和跨周期模式 | recommendation、TCM ranking tests | state/pattern/persistence/phase 已接通；安全档案待后续阶段 |
| 推荐解释 | RecommendationEngine | `why_matched`、`matched_states`、`matched_patterns`、`score_components` 等派生数据 | today、state、pattern、phase、history、contradiction | Today renderer | 无单独入口 | 建议卡“为什么”、近期状态、重复模式、周期原因、个人效果 | 反向信息参与扣分且在卡片说明 | explanation、TCM recommendation tests | 已接通；context feedback 待后续阶段 |
| 固定阶段食养 | DailyNourishment | 不保存推荐 | phase nourishment | Today renderer | 自动生成 | Today 每日阶段食养 | 当前无反馈入口 | nourishment tests | 部分接通 |
| 调养反馈 | 反馈弹窗 | 独立 `period-intervention-usage-v1` | 总体有效率 | 推荐排序、趋势 | Today 建议卡 | 趋势“对我有效” | 同日去重；尚无 context 和安全不适 | feedback tests | 部分接通 |
| 个人效果排序 | InterventionEngine | 读取独立反馈 | `feedback_adjustment` | 推荐排序 | 来源于反馈 | 趋势 + 推荐理由待完善 | 3 次开始使用，5 次前标记数据少 | intervention tests | 部分接通 |
| 安全信息和禁忌 | intervention exclusions；无完整用户生产者 | 尚无统一 profile | `safety_event`、`contraindication.*`、`medication.*` | InterventionEngine | 待建 More → 调养安全信息 | 建议卡安全提醒 | 未知字段目前未可靠阻断高风险建议 | safety tests | 未实现/高风险 |
| 导入导出及同步 | App + Worker | schemaVersion 3 state | periods、logs、settings | 全应用 | More → 备份/同步 | More 同步状态 | feedback、未来 profile 尚未进入统一 state | sync/device tests | 部分接通 |

## 字段处置规则

- 当前 UI 生产：每日表单和经期编辑器能明确产生的字段。
- 可可靠推导：如 `bowel_days_since_last`、`post_menstrual_days`，必须由统一 context 计算并保留证据。
- 历史/导入兼容：`very_heavy`、`brown`、`other`、`medium` clot 暂不扩充当前精简 UI，不得删除历史值。
- external/profile：怀孕、过敏、用药相互作用等必须进入安全档案或明确 external；未知不能静默视为安全。
- retired：没有可靠生产者、也没有产品入口的规则字段必须暂停对应规则，不允许永久不可命中。

## 分阶段完成条件

1. 未触碰字段保持 `null/not_recorded`，明确“没有”与未记录不同。
2. ✅ 所有分析、建议和详情展示消费者读取 `tcm:*`、`detail:*` 时统一经过 `buildCareContext()`；表单模型只负责读写存储编码。
3. ✅ 近期状态已独立为 `TcmState`；跨周期 pattern 已扩展为 9 类并加入反证、周期特异性和跨周期验证；长期体质和调养决策仍保持独立。
4. ✅ state/pattern 已真实影响推荐排序和解释；当天记录优先，反向证据扣分，周期集中与今天一致时小幅加权。
5. 反馈、安全档案和长期体质进入备份、导入、同步、迁移和去重。
6. 数据不足时展示进度与记录入口，不隐藏用户可见功能。
