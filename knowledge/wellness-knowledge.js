export const KNOWLEDGE_VERSION = '2026.08.10-v3';

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
  { id: 'niddk-bowel', title: 'NIDDK Constipation', url: 'https://www.niddk.nih.gov/health-information/digestive-diseases/constipation/symptoms-causes', role: '排便记录、生活因素与危险信号' },
  { id: 'uploaded-cycle-report', title: '用户提供的女性月经四期及全周期状态养生调理研究报告', role: '四期阴阳消长、心—肾—子宫轴与八维状态叠加的知识组织框架；其中药物、药膳和强刺激操作不直接进入自动推荐' }
];

export const KNOWLEDGE_GUARDRAILS = [
  '周期阶段只用于组织观察，不等于已经确认排卵或完成中医辨证。',
  '烦躁、疲倦、便秘或疼痛不能自动归因于肝郁、气血虚、肾虚等病机。',
  '自动推荐只使用普通食材量、无创轻按、温和热敷和低强度活动。',
  '不自动推荐藏红花、红花、丹参、当归、黄芪、桂枝等药材配方，不拆用经典方剂。',
  '不推荐自行针刺、艾灸、强刺激穴位、追求强烈得气感或用力推按腹部与经络。'
];

export const STATUS_SIGNAL_RULES = [
  { id: 'emotion-anxiety', tags: ['情绪：焦虑', '焦虑'], signals: ['焦虑', 'stress-high'], note: '先按情绪与压力记录处理，不自动判断肝郁或心神失养。' },
  { id: 'emotion-angry', tags: ['情绪：生气', '生气'], signals: ['生气', 'stress-high'], note: '以降刺激、暂停和表达需求为先。' },
  { id: 'emotion-tired', tags: ['情绪：疲倦', '疲倦', '嗜睡'], signals: ['疲倦', 'low-energy'], note: '优先核对睡眠、进食和活动，不直接归为气血亏虚。' },
  { id: 'late-sleep', tags: ['入睡：23:00后', '23点后入睡'], signals: ['23点后入睡', 'sleep-low'], note: '使用睡前降刺激和次日恢复建议。' },
  { id: 'no-bowel', tags: ['排便：未排便', '未排便'], signals: ['未排便'], note: '先结合连续天数、饮水、纤维与活动观察。' },
  { id: 'lower-abdomen-pain', tags: ['疼痛部位：小腹/盆腔', '小腹/盆腔'], signals: ['小腹/盆腔'], note: '仅提供舒适支持，不推断寒凝或血瘀。' },
  { id: 'breast-pain', tags: ['疼痛部位：乳房/胸部', '乳房胀痛/触痛'], signals: ['乳房胀痛/触痛'], note: '结合周期重复性观察，不替代乳房症状评估。' },
  { id: 'back-pain', tags: ['疼痛部位：腰背', '腰背'], signals: ['腰背'], note: '只推荐舒适体位、轻柔活动或掌心温擦。' },
  { id: 'head-pain', tags: ['疼痛部位：头部', '头部'], signals: ['头部'], note: '先补水、休息并减少屏幕刺激。' }
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
    id: 'pumpkin-walnut-bowl', title: '南瓜核桃燕麦碗', phases: ['pms'], signals: ['焦虑', '生气', 'stress-high', 'low-energy'], priority: 8,
    ingredients: '贝贝南瓜150克、燕麦片30克、核桃仁10克、无糖牛奶或豆奶200毫升。',
    steps: '南瓜蒸熟；燕麦与奶煮软后放入南瓜，撒碎核桃。作为早餐或加餐，不额外加糖。',
    why: '经前压力或精力波动时，用含复合碳水、蛋白质和坚果的正常餐食减少空腹与高糖零食带来的起伏；吸收报告中“经前稳定节律”的思路，不宣称调节激素。',
    skip: '坚果、奶或大豆过敏，吞咽困难，或需要限制碳水、钾、蛋白质时按个人饮食要求调整。', sources: ['uploaded-cycle-report', 'neijing']
  },
  {
    id: 'yam-jujube-congee', title: '山药红枣粥', phases: ['follicular', 'ovulation'], signals: ['low-appetite', 'low-energy'], priority: 6,
    ingredients: '鲜山药80克、去核红枣2枚、粳米40克、清水600毫升。',
    steps: '山药去皮切块，与大米、红枣一同煮沸，转小火25–30分钟至软；一次吃一碗，不加糖。',
    why: '经后恢复或排卵估算阶段胃口一般时，以容易执行的主食维持规律进食；采用报告中的食材组合，但移除“促排、补肾”等治疗性表述。',
    skip: '山药过敏，或医生要求限制淀粉、液体或钾时不选。', sources: ['uploaded-cycle-report', 'neijing', 'shanghan']
  },
  {
    id: 'black-bean-walnut-congee', title: '黑豆核桃芝麻粥', phases: ['follicular'], signals: ['low-energy', '未排便'], priority: 7,
    ingredients: '黑豆20克、核桃仁8克、熟黑芝麻5克、粳米35克、清水650毫升。',
    steps: '黑豆浸泡6小时并先煮20分钟，再加入大米煮至熟软，最后拌入核桃碎和熟黑芝麻。',
    why: '经后阶段若精力偏低或排便减少，用豆类、谷物和坚果组成正常餐食，同时获得蛋白质与膳食纤维；不作为“滋阴补血药膳”。',
    skip: '大豆或坚果过敏、明显腹胀、吞咽困难，或需要限制蛋白质、磷、钾时不选。', sources: ['uploaded-cycle-report', 'niddk-bowel']
  },
  {
    id: 'lily-lotus-soup', title: '百合莲子银耳羹', phases: ['pms', 'follicular'], signals: ['23点后入睡', 'sleep-low', '焦虑'], priority: 7,
    ingredients: '干百合8克、去芯莲子10克、干银耳3克、清水500毫升。',
    steps: '银耳泡发洗净，与莲子小火煮25分钟，再加入百合煮10分钟；不加糖或仅按日常口味少量调味。',
    why: '晚睡或压力偏高时，用温和、低咖啡因的普通食物替代夜间浓茶和甜饮；传统“养心安神”只作为饮食文化脉络。',
    skip: '相关食物过敏、吞咽困难、腹泻或医生要求限制液体时不选；它不能治疗失眠。', sources: ['uploaded-cycle-report', 'nih-sleep', 'wenbing']
  },
  {
    id: 'rose-pear-water', title: '玫瑰雪梨温饮', phases: ['pms'], signals: ['焦虑', '口干', '怕热/潮热'], priority: 7,
    ingredients: '雪梨80克、食用玫瑰花1朵、清水350毫升。',
    steps: '雪梨去核切块，小火煮12分钟，关火后放入玫瑰焖3分钟；温热饮汤并吃梨。',
    why: '经前同时记录口干与情绪紧绷时，提供低浓度、无咖啡因的替代饮品；避免把偏热感受仍机械配姜或过浓陈皮。',
    skip: '花粉过敏、吃梨腹泻、胃肠敏感或医生要求限制液体时改温水。', sources: ['uploaded-cycle-report', 'wenbing']
  }
];

export const ACUPOINTS = [
  { id: 'neiguan', name: '内关', phases: ['period', 'ovulation', 'pms'], signals: ['焦虑', '恶心', 'stress-high'], location: '腕横纹向上约三横指、两条筋之间。', method: '拇指垂直轻按30–60秒，配合缓慢呼气，左右各1–2轮。', why: '用短暂停顿和缓慢呼气帮助放松。', skip: '按压不舒服就停止。', sources: ['natcm-literacy'] },
  { id: 'zusanli', name: '足三里', phases: ['period', 'follicular', 'pms'], signals: ['疲倦', 'low-energy', 'low-appetite'], location: '膝盖外侧凹陷下约四横指、胫骨前嵴外侧一横指。', method: '坐稳后每侧轻按30–60秒，1–2轮，以微酸胀但不痛为度。', why: '传统上与脾胃、体力调护相关；项目中只用于建立放松和规律进食提示。', skip: '位置不确定、局部红肿疼痛或静脉曲张处跳过。', sources: ['natcm-literacy'] },
  { id: 'shenmen', name: '神门', phases: ['follicular', 'ovulation', 'pms'], signals: ['焦虑', '23点后入睡', 'sleep-low'], location: '手腕掌侧、小指一侧腕横纹附近凹陷处。', method: '用另一手拇指轻按30秒，放松10秒，左右各2轮。', why: '用于睡前减少刺激的仪式感；不能替代失眠评估和治疗。', skip: '局部疼痛、皮肤破损或按后不适时停止。', sources: ['natcm-literacy', 'nih-sleep'] },
  { id: 'hegu', name: '合谷（仅轻按）', phases: ['follicular', 'ovulation'], signals: ['头部'], location: '手背虎口，第一、二掌骨之间肌肉隆起处。', method: '仅轻柔按压20–30秒，左右各1轮；不追求强烈酸痛。', why: '作为头面紧张时暂停、放松手部与减少屏幕刺激的提示。', skip: '可能怀孕、局部疼痛或皮肤损伤时跳过；不自行针刺。', sources: ['natcm-literacy'] },
  { id: 'taichong', name: '太冲（轻触定位）', phases: ['pms'], signals: ['生气', '焦虑', 'stress-high'], location: '足背第一、二跖骨之间向上推至凹陷处。', method: '坐稳后轻按20–30秒，左右各1轮，同时做较长呼气。', why: '传统上常从情志与气机角度理解；这里仅作为短暂放松提示。', skip: '足部伤口、肿痛、感觉异常或位置不确定时不按。', sources: ['neijing', 'natcm-literacy'] },
  { id: 'xuehai', name: '血海（轻按）', phases: ['period', 'follicular'], signals: ['小腹/盆腔'], location: '屈膝，大腿内侧、髌骨内上缘上方约三横指处。', method: '坐稳后用指腹轻按30秒、放松10秒，左右各1–2轮；只要轻微酸胀，不追求疼痛。', why: '报告将其归入经期经络调护；项目仅保留无创轻按，用作停下来观察疼痛变化的提示。', skip: '位置不确定、局部红肿疼痛、皮下出血、静脉问题或按后疼痛增加时跳过。', sources: ['uploaded-cycle-report', 'natcm-literacy'] },
  { id: 'danzhong', name: '膻中（掌心轻覆）', phases: ['pms'], signals: ['焦虑', '生气', '乳房胀痛/触痛', 'stress-high'], location: '胸骨正中线、两乳头连线附近的胸骨区域；只在胸骨上操作，不按乳房。', method: '掌心轻覆胸骨，做5轮缓慢呼气；也可用两指在胸骨表面上下轻抚20–30秒。', why: '把报告中的“宽胸理气”转成低刺激的呼吸与身体觉察，不用于处理乳房疾病。', skip: '胸痛、呼吸困难、乳房新肿块、胸骨受伤或触碰不适时停止并按需就医。', sources: ['uploaded-cycle-report', 'natcm-literacy'] },
  { id: 'yongquan', name: '涌泉（足底轻揉）', phases: ['follicular', 'ovulation', 'pms'], signals: ['23点后入睡', 'sleep-low', '焦虑'], location: '脚掌前1/3附近，脚趾弯曲时足底出现的凹陷处。', method: '坐稳后用拇指轻揉20–30秒，左右各1轮；可与睡前降刺激同时进行。', why: '报告用于睡眠与肾经调护；项目只保留短暂足底放松，不宣称治疗失眠或“交通心肾”。', skip: '糖尿病足、足底破损、感觉异常、真菌感染或揉按疼痛时不做。', sources: ['uploaded-cycle-report', 'nih-sleep'] },
  { id: 'shenshu-palm', name: '肾俞区域（掌心温覆）', phases: ['follicular', 'pms'], signals: ['腰背', '怕冷', 'low-energy'], location: '腰部后方、肚脐大致同高的脊柱两侧肌肉区域；无需精确找穴。', method: '双手搓热后轻覆腰部30–60秒，或隔衣缓慢上下摩擦20次，以温暖舒适为度。', why: '吸收报告“腰肾热擦”的可操作部分，并降低为普通腰部舒缓；不作为补肾治疗。', skip: '发热、皮肤破损、急性腰痛、外伤、麻木或动作使疼痛加重时停止。', sources: ['uploaded-cycle-report', 'natcm-literacy'] },
  { id: 'sanyinjiao', name: '三阴交（仅认识位置）', phases: ['period', 'pms'], signals: ['none'], location: '内踝尖上约四横指、胫骨内侧缘后方。', method: '本项目只提供位置认识，不安排强刺激；需要时改选内关或足三里轻按。', why: '经典经络体系中与妇科调护相关，但家庭自行强刺激并不适合作为默认建议。', skip: '可能怀孕时不自行刺激；不针刺、不艾灸。', sources: ['natcm-service', 'natcm-literacy'] }
];

export const CARE_PRACTICES = [
  { id: 'comfortable-heat', title: '舒适热敷', phases: ['period', 'pms'], signals: ['小腹/盆腔', '腰背', '怕冷'], steps: '隔一层衣物或毛巾，温热不烫，15–20分钟；每5分钟检查皮肤，不抱着热源入睡。', why: '仅在腰腹不适且温热后舒服时使用，用于舒适支持。', skip: '皮肤破损或麻木、发热、异常大量出血、热后更痛时停止。' },
  { id: 'baduanjin', title: '八段锦轻练', phases: ['follicular', 'ovulation', 'pms'], signals: ['low-activity', 'stress-high'], steps: '选择前2–4式，缓慢练习8–12分钟，以能自然说话、不憋气为度。', why: '传统导引与现代“少量活动也有益”的原则结合，适合活动偏少但没有明显疼痛的日子。', skip: '头晕、心慌、出血明显、疼痛加重或动作不熟悉时停止。' },
  { id: 'gentle-walk', title: '餐后轻走', phases: ['period', 'follicular', 'ovulation', 'pms'], signals: ['腹胀', '未排便', 'low-activity'], steps: '餐后休息片刻，舒适步行5–15分钟；以不喘、不增加疼痛为度。', why: '近一周排便或活动偏少时，用低门槛活动支持日常节律。', skip: '头晕、明显疼痛、出血异常或医生限制活动时不做。' },
  { id: 'screen-downshift', title: '睡前降刺激', phases: ['period', 'follicular', 'ovulation', 'pms'], signals: ['23点后入睡', 'sleep-low', '焦虑'], steps: '睡前30分钟调暗屏幕，停止处理新任务，准备次日物品；只提前20分钟，不追求一次大改。', why: '近一周晚睡或睡眠评分偏低时，先改善可执行的睡前环境。', skip: '轮班工作或照护责任导致无法固定时间时，改为“睡前30分钟降刺激”。' },
  { id: 'slow-breath', title: '慢呼气停顿', phases: ['period', 'follicular', 'ovulation', 'pms'], signals: ['焦虑', '生气', 'stress-high'], steps: '坐稳，吸气3–4秒、呼气5–6秒，做5轮；感到头晕立即恢复自然呼吸。', why: '把情志调护落实为短暂、可停止的放松行为，不要求“控制情绪”。', skip: '呼吸练习引起不适、恐慌或头晕时停止。' },
  { id: 'warm-palm-lower-abdomen', title: '掌心温覆下腹', phases: ['period'], signals: ['小腹/盆腔', '怕冷'], steps: '坐卧舒适，双手搓热后隔衣轻覆下腹1–2分钟，只停留不按压；手凉时重新搓热。', why: '保留报告“任脉温熨”的温暖与安静休息部分，去掉用力推按、姜油和艾灸。', skip: '异常大量出血、发热、腹部急痛、触碰更痛、可能怀孕或皮肤不适时不做。' },
  { id: 'gentle-inner-leg-glide', title: '小腿内侧轻抚', phases: ['follicular', 'pms'], signals: ['low-activity', 'low-energy'], steps: '坐稳，用掌心隔衣从脚踝上方轻轻向膝内侧滑动6–8次，再换另一侧；力度像涂身体乳，不追求发热或酸痛。', why: '把报告的经络推按改成低刺激身体活动，主要帮助久坐后活动双腿和建立休息节奏。', skip: '单侧腿肿、红、热、明显疼痛，静脉曲张不适、皮肤破损或怀疑血栓时不要按摩。' },
  { id: 'gentle-hip-stretch', title: '髋部与大腿轻伸展', phases: ['follicular', 'ovulation', 'pms'], signals: ['low-activity', '腰背'], steps: '扶稳桌椅，做轻柔髋屈伸或坐姿大腿后侧伸展，每侧20秒，共2轮；保持自然呼吸。', why: '替代报告中每侧50次、以酸痛发热为度的强推肝经，更适合作为日常低风险活动。', skip: '头晕、关节急性损伤、放射痛、麻木或伸展使疼痛增加时停止。' },
  { id: 'warm-foot-routine', title: '温水洗脚放松', phases: ['follicular', 'ovulation', 'pms'], signals: ['23点后入睡', 'sleep-low', '怕冷'], steps: '睡前用舒适温水洗脚5–10分钟，擦干并保暖；水温以手背感到温暖、不烫为准。', why: '把报告的足部与睡眠调护转成普通清洁和睡前降刺激仪式，不宣称治疗失眠。', skip: '糖尿病足、感觉减退、足部伤口、感染、循环问题或医生要求避免泡脚时不做。' }
];

export const PHASE_THEORY = {
  period: { title: '经期 · 舒缓与顾护', rhythm: '经期重点是休息，并观察经血、疼痛和整体感受。', theory: '根据今天的疼痛、冷热感受、胃口和出血情况，选择保暖、轻活动或休息。' },
  follicular: { title: '经后 · 恢复而不骤补', rhythm: '传统调周理论称为“阴长”阶段，可把它理解为经后逐步恢复与积累，而不是骤然进补。', theory: '经后调护可从水谷、睡眠和活动恢复着手；《内经》“食饮有节”和《景岳全书》关于经水与水谷、起居的联系，落实为正常饮食和逐步加量。' },
  ovulation: { title: '排卵估算期 · 平和维持', rhythm: '传统调周理论称为“重阴转阳、动升”的转换窗口；App只把它用作日历组织方式。', theory: '排卵阶段是日历估算，不是生理确认。传统“因人、因时制宜”在这里意味着：没有不适时保持原节奏，不为了阶段额外温补、活血或清热。' },
  pms: { title: '经前 · 观察重复模式', rhythm: '传统调周理论称为“阳长”阶段，更适合提前观察睡眠、情绪、胀感和压力是否形成个人重复模式。', theory: '经前可出现胀、烦、倦、冷等不同表现。传统整体观可帮助组织情志、饮食与起居线索，但必须以连续个人记录为依据，不能用一个体质标签解释所有日子。' }
};

