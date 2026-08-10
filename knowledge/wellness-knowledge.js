export const KNOWLEDGE_VERSION = '2026.08.10-v1';

export const KNOWLEDGE_SOURCES = [
  { id: 'neijing', title: '《黄帝内经》', role: '食饮有节、起居有常、因时调护与整体观的理论脉络' },
  { id: 'jinkui', title: '《金匮要略》', role: '重视饮食起居、寒热虚实与同症异治的理论脉络' },
  { id: 'shanghan', title: '《伤寒论》', role: '辨寒热、顾护胃气及不机械套用单一方法的理论脉络' },
  { id: 'wenbing', title: '《温病条辨》', role: '顾护津液、避免一概温补的理论脉络' },
  { id: 'jingyue', title: '《景岳全书》', role: '经水与气血、水谷、情志、起居相关的理论脉络' },
  { id: 'shennong', title: '《神农本草经》', role: '认识传统食药材料的历史来源，不直接转换为现代处方' },
  { id: 'natcm-literacy', title: '《中国公民中医养生保健素养》', url: 'https://www.natcm.gov.cn/bangongshi/gongzuodongtai/2018-03-25/5248.html', role: '药食两用材料、经穴养生和安全养生边界' },
  { id: 'natcm-service', title: '《中医养生保健服务规范（试行）》', url: 'https://www.natcm.gov.cn/zxyjhyssmzyys/gongzuodongtai/2023-05-06/30455.html', role: '养生不等于诊疗，不开方、不做侵入性操作' },
  { id: 'acog-pms', title: 'ACOG Premenstrual Syndrome', url: 'https://www.acog.org/womens-health/faqs/premenstrual-syndrome', role: '经前模式需要连续每日记录，生活影响需要专业评估' },
  { id: 'acog-pain', title: 'ACOG Painful Periods', url: 'https://www.acog.org/womens-health/faqs/painful-periods', role: '经期疼痛观察与需要就医的边界' },
  { id: 'nih-sleep', title: 'NIH Healthy Sleep', url: 'https://www.nhlbi.nih.gov/health/sleep/how-much-sleep', role: '成人睡眠和规律作息的现代健康依据' },
  { id: 'cdc-activity', title: 'CDC Adult Physical Activity', url: 'https://www.cdc.gov/physical-activity-basics/guidelines/adults.html', role: '活动量与循序渐进的现代健康依据' },
  { id: 'niddk-bowel', title: 'NIDDK Constipation', url: 'https://www.niddk.nih.gov/health-information/digestive-diseases/constipation/symptoms-causes', role: '排便记录、生活因素与危险信号' }
];

export const CONSTITUTION_OBSERVATIONS = [
  { id: 'cold-leaning', name: '偏寒感受倾向', signals: ['怕冷', '温热后舒服'], needs: 3, explanation: '近期多次记录怕冷或温热后更舒服，只表示当下感受倾向，不能替代望闻问切。', avoid: '若同时口干、咽痛、胃灼热、热敷后更痛，不按偏寒处理。' },
  { id: 'heat-leaning', name: '偏热感受倾向', signals: ['怕热/潮热', '口干', '热敷后更痛'], needs: 3, explanation: '近期反复出现热感或口干，建议减少过热刺激；不能据此判断具体证型。', avoid: '突然发热、持续潮热或影响睡眠时应记录并考虑专业评估。' },
  { id: 'stagnation-leaning', name: '情志郁滞线索', signals: ['焦虑', '生气', '腹胀', '乳房胀痛/触痛'], needs: 3, explanation: '压力、情绪与胀感在近一周多次同现，传统上可从情志与气机角度理解，现代上仍只视为个人相关模式。', avoid: '不据此自行服用疏肝类中药或经方。' },
  { id: 'fatigue-leaning', name: '恢复不足线索', signals: ['疲倦', '嗜睡', '23点后入睡'], needs: 3, explanation: '近一周睡眠或精力记录提示恢复不足，先从睡眠、进食和活动节律调整，不直接归为“气血虚”。', avoid: '持续明显乏力、心悸、气短或影响日常生活时应专业评估。' }
];

export const FOOD_RECIPES = [
  {
    id: 'millet-yam', title: '小米山药粥', phases: ['period'], signals: ['low-appetite', 'neutral'], priority: 5,
    ingredients: '小米30克、鲜山药50克、清水500毫升。',
    steps: '小米洗净，山药去皮切小块；煮沸后转小火25–30分钟，温热吃一碗，不额外加糖。',
    why: '经期胃口一般或需要清淡主食时，以规律进食和顾护胃口为先。传统脉络取“食饮有节、顾护胃气”，不是用粥治疗月经问题。',
    skip: '山药过敏，或医生要求限制淀粉、液体或钾时按原饮食要求调整。', sources: ['neijing', 'shanghan']
  },
  {
    id: 'ginger-jujube', title: '淡姜枣饮', phases: ['period', 'pms'], signals: ['怕冷'], priority: 8,
    ingredients: '鲜姜2薄片（约3克）、去核红枣2枚、清水350毫升。',
    steps: '材料小火煮10分钟，放温后饮用；一天1次，不额外加糖。',
    why: '仅在近期记录怕冷、喜温且热后更舒服时，少量温热饮品用于舒适支持；不等同于“驱寒治痛”。',
    skip: '胃灼热、口干咽痛、腹泻、热饮后更不舒服或出血异常增多时改温水。', sources: ['neijing', 'jinkui', 'natcm-literacy']
  },
  {
    id: 'rose-chenpi', title: '玫瑰陈皮饮', phases: ['pms', 'ovulation'], signals: ['焦虑', '生气', '腹胀', '乳房胀痛/触痛', 'stress-high'], priority: 8,
    ingredients: '食用玫瑰花2朵、陈皮1小块（约1克）、热水300毫升。',
    steps: '快速冲洗后加热水焖8–10分钟，温热时一次饮用；当天不反复续泡、不隔夜。',
    why: '近期压力、情绪或胀感反复时，用低浓度无咖啡因饮品代替浓茶。传统脉络取情志与气机的整体观察，仅作舒适支持。',
    skip: '胃酸反流、花粉或柑橘过敏、正在服药且不清楚相互作用时改温水。', sources: ['neijing', 'jingyue', 'natcm-literacy']
  },
  {
    id: 'black-soy-milk', title: '无糖黑豆浆', phases: ['follicular'], signals: ['疲倦', 'low-energy'], priority: 8,
    ingredients: '黑大豆20克、黄豆20克、清水500–600毫升；搭配一份主食。',
    steps: '豆类浸泡6–8小时后打浆，煮沸并继续小火充分煮熟8–10分钟；早餐饮250–300毫升。',
    why: '经后恢复阶段且精力偏低时，先用含蛋白质的正常早餐支持恢复；这不是“补血方”。',
    skip: '大豆过敏、饮后明显腹胀，或因肾脏疾病被要求限制蛋白质或钾时不选。', sources: ['neijing', 'jingyue']
  },
  {
    id: 'black-bean-bowl', title: '黑豆煮水并吃豆', phases: ['follicular'], signals: ['neutral'], priority: 4,
    ingredients: '黑大豆20克、清水500毫升。',
    steps: '浸泡4–6小时后，小火煮25–30分钟至熟软；饮250毫升煮豆水，并将熟豆随餐吃掉。',
    why: '经后阶段用大豆作为正常饮食的一部分；只喝豆水营养有限，因此建议连熟豆一起吃。',
    skip: '大豆过敏、容易明显胀气或需要限制蛋白质、钾时不选。豆类必须熟透。', sources: ['neijing']
  },
  {
    id: 'pear-lily', title: '雪梨百合饮', phases: ['ovulation', 'pms'], signals: ['怕热/潮热', '口干', 'neutral'], priority: 7,
    ingredients: '雪梨半个（约100克）、干百合8克、清水400毫升。',
    steps: '雪梨去核切块，与百合小火煮15分钟；放温后饮汤并吃食材，不额外加糖。',
    why: '近期反复有口干或热感时，以清淡含水食物维持补水；不因阶段自行“清热”。',
    skip: '腹泻、胃肠敏感或吃梨不舒服时改温水。', sources: ['wenbing', 'natcm-literacy']
  },
  {
    id: 'oat-sesame', title: '燕麦黑芝麻早餐碗', phases: ['follicular', 'pms'], signals: ['未排便', 'low-activity'], priority: 7,
    ingredients: '燕麦片40克、熟黑芝麻5克、牛奶或无糖豆奶200毫升、温水适量。',
    steps: '燕麦与奶煮至软，撒熟黑芝麻；同时分次补水。',
    why: '近几天排便减少或活动偏少时，优先增加正常膳食纤维、液体与活动，不把单一食材当作通便药。',
    skip: '吞咽困难、相关食物过敏或医生要求限制纤维、液体时调整。', sources: ['natcm-literacy', 'niddk-bowel']
  },
  {
    id: 'red-bean-pumpkin', title: '红豆南瓜小米饭', phases: ['period', 'follicular'], signals: ['low-appetite', 'fatigue'], priority: 5,
    ingredients: '熟红豆30克、南瓜80克、小米20克、大米30克、水适量。',
    steps: '红豆提前煮熟；与南瓜、小米、大米一起按日常米饭方式煮熟，作为一餐主食的一部分。',
    why: '胃口允许时，用正常复合主食保持能量摄入，比高糖“补品”更稳妥。',
    skip: '豆类引起明显腹胀或需控制碳水、钾时按个人饮食要求调整。', sources: ['neijing', 'jingyue']
  },
  {
    id: 'warm-water', title: '分次温水', phases: ['period', 'follicular', 'ovulation', 'pms'], signals: ['neutral'], priority: 1,
    ingredients: '温水200–300毫升。', steps: '按口渴分次饮用，不强迫大量灌水。',
    why: '没有明确适配的食养条件时，温水是低负担的默认选择，不用为了阶段强行喝功能茶。',
    skip: '医生要求限制液体时遵循原医嘱。', sources: ['neijing']
  }
];

export const ACUPOINTS = [
  { id: 'neiguan', name: '内关', phases: ['period', 'ovulation', 'pms'], signals: ['焦虑', '恶心', 'stress-high'], location: '腕横纹向上约三横指、两条筋之间。', method: '拇指垂直轻按30–60秒，配合缓慢呼气，左右各1–2轮。', why: '作为暂停与放松提示；传统经络脉络用于和胃、宁心的日常按揉表达。', skip: '皮肤破损、麻木或刺痛处不按；不自行针刺。', sources: ['natcm-literacy'] },
  { id: 'zusanli', name: '足三里', phases: ['period', 'follicular', 'pms'], signals: ['疲倦', 'low-energy', 'low-appetite'], location: '膝盖外侧凹陷下约四横指、胫骨前嵴外侧一横指。', method: '坐稳后每侧轻按30–60秒，1–2轮，以微酸胀但不痛为度。', why: '传统上与脾胃、体力调护相关；项目中只用于建立放松和规律进食提示。', skip: '位置不确定、局部红肿疼痛或静脉曲张处跳过。', sources: ['natcm-literacy'] },
  { id: 'shenmen', name: '神门', phases: ['follicular', 'ovulation', 'pms'], signals: ['焦虑', '23点后入睡', 'sleep-low'], location: '手腕掌侧、小指一侧腕横纹附近凹陷处。', method: '用另一手拇指轻按30秒，放松10秒，左右各2轮。', why: '用于睡前减少刺激的仪式感；不能替代失眠评估和治疗。', skip: '局部疼痛、皮肤破损或按后不适时停止。', sources: ['natcm-literacy', 'nih-sleep'] },
  { id: 'hegu', name: '合谷（仅轻按）', phases: ['follicular', 'ovulation'], signals: ['头部'], location: '手背虎口，第一、二掌骨之间肌肉隆起处。', method: '仅轻柔按压20–30秒，左右各1轮；不追求强烈酸痛。', why: '作为头面紧张时暂停、放松手部与减少屏幕刺激的提示。', skip: '可能怀孕、局部疼痛或皮肤损伤时跳过；不自行针刺。', sources: ['natcm-literacy'] },
  { id: 'taichong', name: '太冲（轻触定位）', phases: ['pms'], signals: ['生气', '焦虑', 'stress-high'], location: '足背第一、二跖骨之间向上推至凹陷处。', method: '坐稳后轻按20–30秒，左右各1轮，同时做较长呼气。', why: '传统上常从情志与气机角度理解；这里仅作为短暂放松提示。', skip: '足部伤口、肿痛、感觉异常或位置不确定时不按。', sources: ['neijing', 'natcm-literacy'] },
  { id: 'sanyinjiao', name: '三阴交（仅认识位置）', phases: ['period', 'pms'], signals: ['none'], location: '内踝尖上约四横指、胫骨内侧缘后方。', method: '本项目只提供位置认识，不安排强刺激；需要时改选内关或足三里轻按。', why: '经典经络体系中与妇科调护相关，但家庭自行强刺激并不适合作为默认建议。', skip: '可能怀孕时不自行刺激；不针刺、不艾灸。', sources: ['natcm-service', 'natcm-literacy'] }
];

export const CARE_PRACTICES = [
  { id: 'comfortable-heat', title: '舒适热敷', phases: ['period', 'pms'], signals: ['小腹/盆腔', '腰背', '怕冷'], steps: '隔一层衣物或毛巾，温热不烫，15–20分钟；每5分钟检查皮肤，不抱着热源入睡。', why: '仅在腰腹不适且温热后舒服时使用，用于舒适支持。', skip: '皮肤破损或麻木、发热、异常大量出血、热后更痛时停止。' },
  { id: 'baduanjin', title: '八段锦轻练', phases: ['follicular', 'ovulation', 'pms'], signals: ['low-activity', 'stress-high'], steps: '选择前2–4式，缓慢练习8–12分钟，以能自然说话、不憋气为度。', why: '传统导引与现代“少量活动也有益”的原则结合，适合活动偏少但没有明显疼痛的日子。', skip: '头晕、心慌、出血明显、疼痛加重或动作不熟悉时停止。' },
  { id: 'gentle-walk', title: '餐后轻走', phases: ['period', 'follicular', 'ovulation', 'pms'], signals: ['腹胀', '未排便', 'low-activity'], steps: '餐后休息片刻，舒适步行5–15分钟；以不喘、不增加疼痛为度。', why: '近一周排便或活动偏少时，用低门槛活动支持日常节律。', skip: '头晕、明显疼痛、出血异常或医生限制活动时不做。' },
  { id: 'screen-downshift', title: '睡前降刺激', phases: ['period', 'follicular', 'ovulation', 'pms'], signals: ['23点后入睡', 'sleep-low', '焦虑'], steps: '睡前30分钟调暗屏幕，停止处理新任务，准备次日物品；只提前20分钟，不追求一次大改。', why: '近一周晚睡或睡眠评分偏低时，先改善可执行的睡前环境。', skip: '轮班工作或照护责任导致无法固定时间时，改为“睡前30分钟降刺激”。' },
  { id: 'slow-breath', title: '慢呼气停顿', phases: ['period', 'follicular', 'ovulation', 'pms'], signals: ['焦虑', '生气', 'stress-high'], steps: '坐稳，吸气3–4秒、呼气5–6秒，做5轮；感到头晕立即恢复自然呼吸。', why: '把情志调护落实为短暂、可停止的放松行为，不要求“控制情绪”。', skip: '呼吸练习引起不适、恐慌或头晕时停止。' }
];

export const PHASE_THEORY = {
  period: { title: '经期 · 舒缓与顾护', theory: '传统脉络重视经行时气血变化，但不把所有经期不适都归为寒。今天以疼痛、寒热感受、胃口和出血情况决定是否保暖、活动或只做休息。' },
  follicular: { title: '经后 · 恢复而不骤补', theory: '经后调护可从水谷、睡眠和活动恢复着手；《内经》“食饮有节”和《景岳全书》关于经水与水谷、起居的联系，落实为正常饮食和逐步加量。' },
  ovulation: { title: '排卵估算期 · 平和维持', theory: '排卵阶段是日历估算，不是生理确认。传统“因人、因时制宜”在这里意味着：没有不适时保持原节奏，不为了阶段额外温补或清热。' },
  pms: { title: '经前 · 观察重复模式', theory: '经前可出现胀、烦、倦、冷等不同表现。传统整体观可帮助组织情志、饮食与起居线索，但必须以连续个人记录为依据，不能用一个体质标签解释所有日子。' }
};
