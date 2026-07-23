function carePlan(phase, log = {}) {
  const symptoms = log.symptoms || [];
  const painLocations = (log.symptoms || []).filter((item) => item.startsWith('疼痛部位：')).map((item) => item.slice(5));
  const pain = Number(log.pain) || 0;
  const stress = Number(log.stress) || 3;
  const sleep = Number(log.sleep) || 3;
  const has = (name) => symptoms.includes(name);
  const hurts = (name) => painLocations.includes(name);
  const plans = {
    period: {
      title: '经期 · 因感受而调护',
      observation: '以舒缓、适度保暖和不扰胃口为主；有热感、口干或热敷更痛时，不按“经期必寒”处理。',
      tea: {
        title: '温水为主，怕冷时才选淡姜水',
        steps: '普通温水每次200–300 mL，按口渴分次喝。若同时怕冷、喜热饮且平时耐受姜：鲜姜2–3薄片，加300–400 mL热水浸5–10分钟，当天1杯即可。',
        fit: '更适合怕冷、温热后更舒服的人。',
        skip: '胃灼热、腹泻、口干咽痛明显、出血异常增多，或正在服药且不清楚相互作用时，跳过姜水。'
      },
      care: {
        title: '下腹或腰背舒适热敷',
        steps: '隔一层衣物或毛巾，温热不烫，15–20分钟；每5分钟摸一下皮肤，不抱着热源入睡。',
        fit: '仅在腰腹不适且热后舒服时使用。',
        skip: '皮肤破损或麻木、发热、异常大量出血，或热敷后更痛时立即停止。'
      },
      point: {
        title: '内关轻按，必要时配合足三里',
        steps: '内关：手腕掌侧横纹向上约三横指、两条筋之间；拇指垂直轻按30–60秒，左右各1–2轮。足三里：膝盖外侧凹陷下约四横指、胫骨前嵴外侧一横指，同样轻按。',
        fit: '以放松、微酸胀但不痛为度。',
        skip: '皮肤破损、红肿、静脉曲张处不按；不自行针刺或艾灸。'
      }
    },
    follicular: {
      title: '经后 · 先恢复，再加量',
      observation: '《景岳全书》把经水与水谷、起居相联系；这里落实为规律吃饭和逐步恢复，不用甜饮或药材“猛补”。',
      tea: {
        title: '清淡补水，不必专门进补',
        steps: '温水每次200–300 mL；想喝茶可用平常茶叶的一半浓度，先随餐或餐后饮用，避免用高糖饮品代替正餐。',
        fit: '适合月经刚结束、胃口正常的恢复阶段。',
        skip: '心悸、失眠、胃部不适时改喝温水；缺铁或正在补铁时，茶与正餐或铁剂错开。'
      },
      care: {
        title: '温热淋浴 + 缓慢恢复活动',
        steps: '温热淋浴5–10分钟，之后做5分钟舒展或散步；运动量每次只增加一点，以次日不明显疲劳为准。',
        fit: '适合精力逐步回升、没有明显疼痛时。',
        skip: '头晕、心慌、明显乏力时先坐下补水进食，不用高温泡澡硬撑。'
      },
      point: {
        title: '足三里轻按作为放松提示',
        steps: '膝盖外侧凹陷下约四横指、胫骨前嵴外侧一横指；坐稳后每侧轻按30–60秒，1–2轮。',
        fit: '按后感觉放松即可，不追求强烈酸胀。',
        skip: '位置不确定或按压会痛就跳过；不自行针刺或艾灸。'
      }
    },
    ovulation: {
      title: '排卵估算期 · 平和维持',
      observation: '这是日历估算，不是已确认排卵。传统“寒热有别”的思路在这里意味着：没有不适就不额外温补或清热。',
      tea: {
        title: '按口渴补水，淡茶不过量',
        steps: '每次温水200–300 mL；如喝普通茶，冲淡并尽量放在白天，下午易失眠的人改为温水。',
        fit: '适合没有明显不适、维持平常节奏。',
        skip: '心悸、失眠、胃酸不适时不喝含咖啡因茶；不因“排卵”自行加草药。'
      },
      care: {
        title: '久坐后活动，不例行热敷',
        steps: '每坐45–60分钟起身2–5分钟，活动肩颈和髋部；只有腰腹不适且温热后舒服时才短时热敷。',
        fit: '适合工作日维持活动和舒适。',
        skip: '单侧突发剧痛、晕厥或异常出血，不用热敷掩盖症状。'
      },
      point: {
        title: '内关轻按用于安静放松',
        steps: '手腕掌侧横纹上约三横指、两筋之间；配合慢呼气，左右各轻按30–60秒，1–2轮。',
        fit: '压力偏高或久坐时可尝试。',
        skip: '麻木、刺痛或皮肤不适立即停止；不自行针刺或艾灸。'
      }
    },
    pms: {
      title: '经前 · 疏缓而不过度刺激',
      observation: '经前表现可偏胀、偏烦、偏倦或偏冷，不用一个“体质”解释所有日子；先依据当天重复出现的感受调整。',
      tea: {
        title: '低浓度、低咖啡因，优先不扰睡眠',
        steps: '白天可喝半浓度普通茶150–250 mL；若下午后容易失眠、烦躁或心悸，改为温水。怕冷且没有胃灼热时，才按经期方法选1杯淡姜水。',
        fit: '适合经前想喝热饮但不需要“功能茶”的时候。',
        skip: '睡眠差、心悸、胃酸不适时跳过含咖啡因饮品；不把经方拆成日常茶饮。'
      },
      care: {
        title: '睡前降刺激，腰腹不适再热敷',
        steps: '睡前30分钟调暗屏幕、准备次日用品；腰腹不适且喜温时，隔布热敷15–20分钟。',
        fit: '适合经前紧张、疲倦或腰腹发紧。',
        skip: '烦热、口干明显或热敷更不舒服时不敷；不要高温泡澡后立即入睡。'
      },
      point: {
        title: '内关 + 足三里轻按',
        steps: '先按内关：腕横纹上约三横指、两筋间；再按足三里：膝外侧凹陷下约四横指、胫骨前嵴外一横指。每侧30–60秒，各1–2轮。',
        fit: '用于放松和建立睡前停顿，不追求“通经”感。',
        skip: '不强刺激合谷或三阴交；不自行针刺或艾灸。'
      }
    }
  };
  const plan = plans[phase.key];
  const notes = [];
  if (has('怕冷')) notes.push('你记录了怕冷：今天可优先保暖、温水；只有没有胃灼热、腹泻或明显热感时才考虑淡姜水。');
  if (has('腹胀')) notes.push('你记录了腹胀：正餐减慢速度，餐后轻走5–10分钟，不用力揉腹，也不靠浓茶“消胀”。');
  if (has('头痛') || hurts('头部')) notes.push('你记录了头部疼痛：先补水、减少屏幕刺激并安静休息；不热敷头部。突然出现或异常剧烈的头痛应及时求助。');
  if (has('烦躁') || has('情绪敏感') || has('焦虑') || has('生气') || has('害怕/紧张') || stress >= 4) notes.push('今天情绪紧张或压力较高：下午后减少咖啡因，把轻按配合缓慢呼气使用，不加辛辣、浓姜等刺激。');
  if (has('嗜睡') || sleep <= 2) notes.push('今天嗜睡或睡眠不足：不靠浓茶硬撑；午后若小睡，尽量控制在20–30分钟，并优先提早入睡。');
  if (has('食欲变化')) notes.push('你记录了食欲变化：少量、规律进食比“补品”更重要；持续吃不下、反复呕吐或明显体重变化时应评估。');
  if ((has('腰腹不适') || hurts('腰背') || hurts('小腹/盆腔')) && !has('头痛') && !hurts('头部')) notes.push('你记录了腰腹部疼痛：可先试舒适热敷；若热后更痛就停止，不把“喜热”当作诊断。');
  const urgent = pain >= 7
    ? '疼痛已达7分或以上，若影响日常活动、越来越重或止痛与热敷仍无效，请尽快进行专业评估。'
    : '若出现晕厥、发热、突发单侧剧痛、异常大量出血，或疼痛持续加重，请停止自我调养并及时求助。';
  return { ...plan, notes: notes.slice(0, 3), urgent };
}

function card(kind, item, phaseKey) {
  const icons = { tea: '茶', care: '暖', point: '按' };
  const teaReasons = {
    period: '以温热、低浓度饮品补水和获得舒适感为目的；不是治疗痛经或“驱寒”的配方。',
    follicular: '经后恢复期更适合用淡茶或温水维持饮水与进食节奏，不把甜饮或药材当作“猛补”。',
    ovulation: '没有明显不适时，温水或淡茶足以维持日常水分；不需要因日历估算阶段额外进补。',
    pms: '经前更看重不扰睡眠；低浓度、低咖啡因饮品能保留热饮习惯，同时减少对休息的干扰。'
  };
  const reason = kind === 'tea' ? `<div><dt>为什么推荐</dt><dd>${teaReasons[phaseKey]}</dd></div>` : '';
  return `<section class="traditional-card traditional-${kind}"><div class="traditional-card-head"><span aria-hidden="true">${icons[kind]}</span><h3>${item.title}</h3></div><p class="traditional-steps">${item.steps}</p><dl>${reason}<div><dt>适合</dt><dd>${item.fit}</dd></div><div><dt>先跳过</dt><dd>${item.skip}</dd></div></dl></section>`;
}

globalThis.renderTraditionalAdvice = (phase, log) => {
  const plan = carePlan(phase, log);
  document.querySelector('#tcmPhaseTitle').textContent = plan.title;
  document.querySelector('#tcmPhaseDot').className = `phase-dot phase-${phase.key}`;
  document.querySelector('#tcmAdvice').innerHTML = `
    <div class="classic-basis"><strong>今天的调护思路</strong><p>${plan.observation}</p></div>
    ${plan.notes.length ? `<div class="symptom-guidance"><strong>结合今天的记录</strong>${plan.notes.map((note) => `<p>${note}</p>`).join('')}</div>` : ''}
    <div class="traditional-plan">${card('tea', plan.tea, phase.key)}${card('care', plan.care, phase.key)}${card('point', plan.point, phase.key)}</div>
    <details class="traditional-basis-details"><summary>经典依据与使用边界 <span>展开</span></summary><div class="details-body"><p>《黄帝内经》强调“食饮有节、起居有常”，并指出同样是痛，寒热、按压后的反应并不相同；中医基础理论的整体观与辨证思路，以及《伤寒论》《金匮要略》《温病条辨》所体现的辨寒热、顾护津液、同症不一法，决定了这里不会按阶段一律温补；《景岳全书》把经水与饮食起居、气血变化联系起来。</p><p>《神农本草经》和《汤头歌诀》涉及药性与方剂配伍，因此本产品不把古方拆成茶饮，也不推荐经方、中药剂量或自行辨证。这里只把传统原则转成低风险、可停止的日常动作，并用现代安全资料校正禁忌。</p></div></details>`;
};
