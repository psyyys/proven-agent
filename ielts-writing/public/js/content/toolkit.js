// 微技能工具箱：5 分钟一个的小练习，随时刷；外加范文跟打用的范文和模考配置
(window.TRACKS = window.TRACKS || []).push({
  id: 'toolkit',
  icon: '🧰',
  title: B('微技能工具箱', 'Toolkit'),
  desc: B('5 分钟一个的小练习。没时间写整篇的时候，来这里刷一题。', 'Five-minute drills for days when there is no time for a full essay.'),
  stages: [
    {
      title: B('快练', 'Quick drills'),
      desc: B('每题都由 AI 现出，可以无限刷。', 'Every drill is freshly generated, so you can repeat them endlessly.'),
      units: [
        {
          id: 't1',
          minutes: 5,
          title: B('升级句子', 'Upgrade it'),
          goal: B('把 B1 水平的句子升级成 C1', 'Lift B1 sentences to C1'),
          cards: [
            {
              title: B('升级的四个方向', 'Four ways to upgrade'),
              body: B(
                `<ul><li><b>更精确的动词</b>：make better → enhance, get → obtain</li><li><b>名词化</b>：because people use phones → due to smartphone use</li><li><b>复杂句</b>：用从句或分词把两句信息合并</li><li><b>搭配</b>：big problem → pressing issue</li></ul>`,
                `<ul><li><b>Precise verbs</b>: make better → enhance, get → obtain</li><li><b>Nominalisation</b>: because people use phones → due to smartphone use</li><li><b>Complex structures</b>: merge ideas with clauses or participles</li><li><b>Collocations</b>: big problem → pressing issue</li></ul>`,
              ),
            },
          ],
          exercise: {
            kind: 'upgrade',
            type: 'sentence',
            instruction: B('把每个句子升级到 C1 水平（意思不变），每句单独一行。', 'Upgrade each sentence to C1 level (same meaning). One per line.'),
            gen: '出 3 句 B1 水平、用词简单但语法正确的英文句子，雅思话题。题目用编号列出。reference 给出 C1 水平的升级版本，并说明升级点。',
            focus: '是否真正提升了词汇和句式、是否准确自然、意思是否保持、有没有为了「高级」而用错词',
          },
        },
        {
          id: 't2',
          minutes: 5,
          title: B('精简句子', 'Shrink it'),
          goal: B('删掉一半的词，信息一个不丢', 'Cut half the words, keep all the meaning'),
          cards: [
            {
              title: B('精简技巧', 'Shrinking moves'),
              body: B(
                `<ul><li>删冗余短语：due to the fact that → because</li><li>删空主语：There are many students who… → Many students…</li><li>名词化合并两句</li><li>删掉不增加信息的副词：very, really, actually</li></ul>`,
                `<ul><li>Cut padding: due to the fact that → because</li><li>Cut empty openers: There are many students who… → Many students…</li><li>Merge with nominalisation</li><li>Drop empty adverbs: very, really, actually</li></ul>`,
              ),
            },
          ],
          exercise: {
            kind: 'shrink',
            type: 'sentence',
            instruction: B('在括号里的词数上限内重写每个句子，每句单独一行。', 'Rewrite each sentence within the word limit in brackets. One per line.'),
            gen: '出 3 句冗长的英文句子（每句 25-40 词），每句后用括号标注词数上限（约为原来的一半）。题目用编号列出。reference 给出精简版本。',
            focus: '是否在词数上限内、关键信息是否完整、语法是否正确、表达是否自然',
          },
        },
        {
          id: 't3',
          minutes: 5,
          title: B('缓和语气', 'Hedge it'),
          goal: B('把绝对的说法改得谨慎可信', 'Turn absolute claims into credible ones'),
          cards: [
            {
              title: B('提醒', 'Reminder'),
              body: B('<p>情态动词（may, can）、动词（suggest, tend to）、副词（arguably, largely）、限定范围（in many cases）。<b>混着用，不要每句都用 may</b>。</p>', '<p>Modals (may, can), verbs (suggest, tend to), adverbs (arguably, largely), scope (in many cases). <b>Mix them; don\'t put "may" in every sentence.</b></p>'),
            },
          ],
          exercise: {
            kind: 'hedge',
            type: 'sentence',
            instruction: B('把每个绝对化的说法改写得谨慎可信，每句单独一行。', 'Hedge each absolute claim. One per line.'),
            gen: '出 4 句过于绝对的英文论断，话题各不相同。题目用编号列出。reference 给出缓和后的版本。',
            focus: '缓和是否恰当、手段是否多样、语法是否正确',
          },
        },
        {
          id: 't4',
          minutes: 5,
          title: B('仿写', 'Imitate'),
          goal: B('学一个好句型，换个话题写出自己的句子', 'Borrow a strong sentence pattern for a new topic'),
          cards: [
            {
              title: B('为什么要仿写', 'Why imitate'),
              body: B('<p>背范文不如<b>仿写句型</b>：你记住的是结构，而不是具体内容，换什么话题都能用。</p>', '<p>Imitating <b>patterns</b> beats memorising essays: you keep the structure, which transfers to any topic.</p>'),
            },
          ],
          exercise: {
            kind: 'imitate',
            type: 'sentence',
            instruction: B('模仿每个范句的句型，用括号里的新话题写一句自己的句子，每句单独一行。', 'Write your own sentence on the bracketed topic, copying each model\'s pattern. One per line.'),
            gen: '给出 3 个高分英文范句（句型各不相同，如 While…, …; Not only… but also…; What… is…; The more…, the more…），每句后用括号给一个不同的新话题。题目用编号列出。reference 给出每题的仿写示例。',
            focus: '是否准确使用了范句的句型结构、是否切合新话题、语法和用词是否准确',
          },
        },
        {
          id: 't5',
          minutes: 5,
          title: B('找错', 'Error hunt'),
          goal: B('快速找出并改正典型错误', 'Spot and fix typical errors fast'),
          cards: [
            {
              title: B('检查顺序', 'Checking order'),
              body: B('<p>谓语动词 → 主谓一致 → 时态 → 冠词和单复数 → 标点（逗号连句）→ 搭配</p>', '<p>Verb present → agreement → tense → articles and plurals → punctuation (comma splices) → collocation</p>'),
            },
          ],
          exercise: {
            kind: 'fix',
            type: 'sentence',
            instruction: B('每句都有 1-2 个错误，打出改正后的句子，每句单独一行。', 'Each sentence has 1-2 errors. Type the corrected sentences, one per line.'),
            gen: '出 5 句雅思话题英文句子，每句含 1-2 个中国学生典型错误（类型混合：主谓一致、时态、冠词、逗号连句、中式搭配、词性）。题目用编号列出。reference 给出改正版本和错误类型。',
            focus: '是否找出并改正全部错误、是否引入新错误',
          },
        },
        {
          id: 't6',
          minutes: 5,
          title: B('搭配', 'Collocations'),
          goal: B('给名词配上地道的动词和形容词', 'Pair nouns with natural verbs and adjectives'),
          cards: [
            {
              title: B('搭配比单词更重要', 'Collocations over single words'),
              body: B('<p><i>make a decision, pose a threat, raise awareness, address an issue, heavy traffic, a pressing concern</i></p><p class="tip">LR 7 分要求「有搭配意识」。记单词时，连着它常用的动词一起记。</p>', '<p><i>make a decision, pose a threat, raise awareness, address an issue, heavy traffic, a pressing concern</i></p><p class="tip">Band 7 LR expects awareness of collocation. Learn nouns together with their usual verbs.</p>'),
            },
          ],
          exercise: {
            kind: 'collocation',
            type: 'sentence',
            instruction: B('为每个名词写一个包含地道搭配的完整句子（雅思话题），每句单独一行。', 'For each noun, write a full sentence using a natural collocation (IELTS topics). One per line.'),
            gen: '给出 4 个雅思写作高频名词（如 awareness, pressure, threat, issue, impact, measure, burden, gap），题目用编号列出，每个名词后用括号提示一个话题。reference 给出每个名词的 2-3 个常见搭配和例句。',
            focus: '搭配是否地道准确、句子是否完整正确、是否切合话题',
          },
        },
        {
          id: 't7',
          minutes: 5,
          title: B('限时冲刺', 'Sprint'),
          goal: B('5 分钟写一段，练速度和流畅度', 'One paragraph in 5 minutes: speed and fluency'),
          cards: [
            {
              title: B('冲刺规则', 'Sprint rules'),
              body: B('<p>不要停下来修改，先把想法写完。计时结束后提交，再看批改。</p><p class="tip">考场上最大的问题往往是写不完。这个练习帮你建立「先写出来」的节奏。</p>', '<p>Don\'t stop to edit; get the ideas down. Submit when time\'s up, then read the feedback.</p><p class="tip">Running out of time is the most common exam problem. Sprints build a "draft first" rhythm.</p>'),
            },
          ],
          exercise: {
            kind: 'sprint',
            type: 'paragraph',
            instruction: B('5 分钟内针对题目写一段（60 词以上），中途不要停下来修改。', 'Write one paragraph (60+ words) in 5 minutes. Don\'t stop to edit.'),
            gen: '出一个简短的雅思 Task 2 风格问题（一句话），适合用一段话回答。hint 给一个可以写的角度。reference 留空字符串。',
            focus: '在时间压力下的论证清晰度和语言准确性；点评时考虑这是 5 分钟限时写作，重点指出最影响分数的 3 个问题',
            minWords: 60,
            timeLimit: 5,
          },
        },
        {
          id: 't8',
          minutes: 5,
          title: B('范文跟打', 'Copy typing'),
          goal: B('跟着打高分范文，边打边积累句型', 'Type out model paragraphs and absorb their patterns'),
          cards: [
            {
              title: B('怎么练', 'How it works'),
              body: B('<p>上面是范文，下面打字。打对是墨色，打错会标红。打完会显示速度、准确率和这段范文里值得记住的表达。</p><p class="tip">不需要 AI，不消耗 API。也可以点「AI 新范文」生成新的段落。</p>', '<p>The model text sits above; type it below. Correct characters turn ink-dark, mistakes turn red. At the end you get speed, accuracy and the phrases worth keeping.</p><p class="tip">No AI needed, so it costs nothing. Use "New AI passage" for fresh text.</p>'),
            },
          ],
          exercise: {
            kind: 'copy',
            type: 'copy',
            instruction: B('照着范文打字，注意标点和大小写。', 'Type the model text exactly, including punctuation and capitals.'),
            gen: '写一段 90-130 词的雅思 Task 2 高分主体段范文（话题随机），使用多样的句型和地道搭配。',
          },
        },
      ],
    },
  ],
});

// 范文跟打的内置范文（全部为原创示例段落）
window.PASSAGES = [
  {
    topic: B('教育经费', 'Funding education'),
    text: 'The main reason why governments should help fund university education is that society as a whole benefits from a highly educated workforce. Graduates in fields such as medicine and engineering provide essential services, and their skills drive economic growth and innovation. For example, many of the doctors who staff public hospitals were trained at subsidised universities. Therefore, it would be unfair to treat higher education as a purely private benefit.',
    phrases: ['society as a whole', 'a highly educated workforce', 'drive economic growth', 'a purely private benefit'],
  },
  {
    topic: B('远程办公', 'Remote work'),
    text: 'Working from home offers employees a degree of flexibility that traditional offices rarely provide. Without a daily commute, staff can devote more time to their families and to their own wellbeing, which often translates into higher productivity. However, this arrangement is not without drawbacks. Employees who rarely meet their colleagues may feel isolated, and younger workers in particular can miss out on the informal learning that takes place in a shared workplace.',
    phrases: ['a degree of flexibility', 'devote more time to', 'translates into higher productivity', 'is not without drawbacks', 'miss out on'],
  },
  {
    topic: B('城市交通', 'Urban transport'),
    text: 'Investing in public transport is arguably the most effective way to tackle urban congestion. A reliable network of buses and trains can move far more people than private cars on the same amount of road space. Moreover, when public transport is affordable and frequent, many commuters choose to leave their cars at home, which reduces both traffic and air pollution. Cities such as Singapore demonstrate that well-planned systems can keep traffic moving even as populations grow.',
    phrases: ['arguably the most effective way', 'tackle urban congestion', 'on the same amount of road space', 'keep traffic moving'],
  },
  {
    topic: B('气候责任', 'Climate responsibility'),
    text: 'While individuals can make a difference by changing their habits, the primary responsibility for addressing climate change lies with governments and large corporations. A single household that recycles or cycles to work has a limited impact compared with a national policy on renewable energy. Only governments have the power to set binding targets, and only major companies can transform the way energy is produced on a large scale.',
    phrases: ['make a difference', 'the primary responsibility lies with', 'have a limited impact', 'set binding targets', 'on a large scale'],
  },
  {
    topic: B('儿童与科技', 'Children and technology'),
    text: 'Although digital devices can support learning, excessive screen time may harm children\'s development. Young children learn language and social skills mainly through face-to-face interaction, and hours spent in front of a screen inevitably reduce these opportunities. It is therefore essential that parents set clear limits and encourage activities such as reading, outdoor play and conversation, which tend to have a more lasting effect on a child\'s wellbeing.',
    phrases: ['excessive screen time', 'face-to-face interaction', 'set clear limits', 'have a more lasting effect on'],
  },
  {
    topic: B('旅游业', 'Tourism'),
    text: 'International tourism brings considerable economic benefits to many developing countries. It creates jobs in hotels, restaurants and transport, and the income it generates can be invested in local infrastructure. Nevertheless, unregulated tourism can place a heavy burden on fragile environments and traditional communities. A sensible approach would be to limit visitor numbers at the most vulnerable sites while ensuring that local people share in the profits.',
    phrases: ['considerable economic benefits', 'the income it generates', 'place a heavy burden on', 'a sensible approach would be to', 'share in the profits'],
  },
  {
    topic: B('人口老龄化', 'Ageing populations'),
    text: 'An ageing population presents a serious challenge for public finances. As the proportion of retired people rises, fewer workers are left to pay the taxes that fund pensions and healthcare. One possible solution is to raise the retirement age gradually, which would keep experienced employees in the workforce for longer. In addition, policies that support working parents could encourage higher birth rates in the long term.',
    phrases: ['presents a serious challenge for', 'as the proportion of … rises', 'raise the retirement age gradually', 'in the long term'],
  },
  {
    topic: B('Task 1 概述', 'Task 1 overview'),
    text: 'The line graph illustrates the percentage of households with internet access in three countries between 2000 and 2020. Overall, internet access rose significantly in all three nations over the period, although the rate of growth varied considerably. Canada consistently had the highest proportion of connected households, whereas India started from a very low base but experienced the most dramatic increase in the final decade.',
    phrases: ['The line graph illustrates', 'Overall,', 'the rate of growth varied considerably', 'started from a very low base', 'the most dramatic increase'],
  },
];

// 模考配置（不属于任何单元）
window.MOCK_EXERCISES = {
  task2: {
    kind: 'essay',
    type: 'essay',
    task: 'task2',
    instruction: B('模拟考试：40 分钟，不少于 250 词。', 'Mock exam: 40 minutes, at least 250 words.'),
    gen: '出一道真实风格的雅思 Task 2 题目（随机题型和话题，难度与真题一致）。hint 留空字符串。reference 留空字符串。',
    focus: '按雅思 Task 2 官方四项评分标准严格评估，就像真实考官一样打分',
    minWords: 250,
    timeLimit: 40,
  },
  task1: {
    kind: 'essay',
    type: 'essay',
    task: 'task1',
    instruction: B('模拟考试：20 分钟，不少于 150 词。', 'Mock exam: 20 minutes, at least 150 words.'),
    gen: '出一道雅思 Task 1 图表题（线图、柱状图、饼图或表格之一）。因为无法显示图片，在 prompt 中先给出英文题目，然后用 Markdown 表格给出完整数据（4-6 行、3-5 列）。hint 留空字符串。reference 留空字符串。',
    focus: '按雅思 Task 1 官方四项评分标准严格评估（Task Achievement 而非 Task Response）',
    minWords: 150,
    timeLimit: 20,
  },
};

// 模考左栏的考试提示卡片
window.MOCK_TIPS = {
  task2: [
    { title: B('时间分配', 'Timing'), body: B('<p><b>5 分钟</b>审题列提纲 → <b>30 分钟</b>写作 → <b>5 分钟</b>检查。</p>', '<p><b>5 min</b> plan → <b>30 min</b> write → <b>5 min</b> check.</p>') },
    { title: B('结构', 'Structure'), body: B('<p>开头（改写 + 立场）→ 主体段 ×2-3（PEEL）→ 结尾（重申 + 概括）。</p>', '<p>Intro (paraphrase + position) → 2-3 PEEL body paragraphs → conclusion (restate + summarise).</p>') },
    { title: B('检查清单', 'Checklist'), body: B('<p>☐ 谓语动词 ☐ 主谓一致 ☐ 冠词单复数 ☐ 逗号连句 ☐ 立场一致 ☐ ≥ 250 词</p>', '<p>☐ verbs ☐ agreement ☐ articles/plurals ☐ comma splices ☐ consistent position ☐ 250+ words</p>') },
  ],
  task1: [
    { title: B('时间分配', 'Timing'), body: B('<p><b>5 分钟</b>读图找特征 → <b>13 分钟</b>写作 → <b>2 分钟</b>检查。</p>', '<p><b>5 min</b> read and find features → <b>13 min</b> write → <b>2 min</b> check.</p>') },
    { title: B('结构', 'Structure'), body: B('<p>开头（改写题目）→ Overview（2 个主要特征，不写数字）→ 细节段 ×2（分组 + 比较）。</p>', '<p>Intro (paraphrase) → overview (2 main features, no numbers) → 2 detail paragraphs (grouped, compared).</p>') },
    { title: B('注意', 'Remember'), body: B('<p>只描述数据，不推测原因；注意时态和单位。</p>', '<p>Describe only, no causes; watch tense and units.</p>') },
  ],
};
