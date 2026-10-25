// 渐进式学习路线：每个单元 = 一段教程 + 一种练习
// exercise.type: sentence（句子级）| paragraph（段落级）| essay（完整作文）
// exercise.gen: 交给 AI 出题的要求；exercise.focus: 批改时重点关注什么
window.CURRICULUM = [
  {
    id: 's1',
    title: '第一阶段 · 句子基本功',
    desc: '先把句子写对。雅思语法分（GRA）里，错误密度比句子复杂度更伤分。',
    units: [
      {
        id: 'u1',
        title: '简单句：英语句子的骨架',
        goal: '每句话都有主语 + 谓语动词，掌握五种基本句型',
        lesson: `
<p>中文可以省略主语、可以没有动词（"这个问题很重要"），英文<b>每个句子都必须有主语和谓语动词</b>。这是中国考生最常见的丢分点。</p>
<h4>五种基本句型</h4>
<table>
<tr><th>句型</th><th>例句</th></tr>
<tr><td>主 + 谓 (SV)</td><td>Prices <u>rose</u>.</td></tr>
<tr><td>主 + 系 + 表 (SVP)</td><td>Technology <u>is</u> essential.</td></tr>
<tr><td>主 + 谓 + 宾 (SVO)</td><td>Governments <u>should fund</u> public transport.</td></tr>
<tr><td>主 + 谓 + 间宾 + 直宾 (SVOO)</td><td>Online courses <u>give</u> students flexibility.</td></tr>
<tr><td>主 + 谓 + 宾 + 宾补 (SVOC)</td><td>Social media <u>makes</u> people anxious.</td></tr>
</table>
<h4>常见错误</h4>
<ul>
<li>❌ Technology very important. → ✅ Technology <b>is</b> very important.（缺系动词）</li>
<li>❌ Many people think is good. → ✅ Many people think <b>it</b> is good.（从句缺主语）</li>
<li>❌ Use computers can save time. → ✅ <b>Using</b> computers can save time.（动词不能直接做主语）</li>
<li>❌ There are many students like online learning. → ✅ Many students like online learning.（一个句子两个谓语）</li>
</ul>
<p class="tip">💡 写作原则：<b>先写对，再写复杂</b>。一个准确的简单句永远好过一个错误的复杂句。</p>`,
        exercise: {
          type: 'sentence',
          instruction: '把下面的中文句子翻译成英文，每句单独一行。',
          gen: '出 3 句与雅思常见话题（教育、科技、环境、城市、健康、工作）相关的中文句子，长度 10-20 字，适合用简单句表达。题目用编号列出。reference 给出每句的地道英文参考译文。',
          focus: '句子是否完整（有主语和谓语动词）、句型是否正确、是否有中式英语',
        },
      },
      {
        id: 'u2',
        title: '时态与主谓一致',
        goal: '用对时态，让主语和动词"对得上"',
        lesson: `
<h4>雅思写作该用什么时态？</h4>
<ul>
<li><b>Task 2 大作文</b>：以<b>一般现在时</b>为主（陈述观点、事实）。描述"至今为止的变化"用<b>现在完成时</b>：<i>Online shopping <u>has become</u> increasingly popular.</i></li>
<li><b>Task 1 小作文</b>：过去的数据用<b>一般过去时</b>（<i>Sales <u>rose</u> in 2010</i>），预测数据用 <i>is expected to / is predicted to / will</i>。</li>
</ul>
<h4>主谓一致高频陷阱</h4>
<table>
<tr><th>❌ 错误</th><th>✅ 正确</th><th>规则</th></tr>
<tr><td>The number of cars are increasing.</td><td>The number of cars <b>is</b> increasing.</td><td>the number of 看 number，单数</td></tr>
<tr><td>A number of student agrees.</td><td>A number of student<b>s agree</b>.</td><td>a number of = many，复数</td></tr>
<tr><td>Everyone have their own opinion.</td><td>Everyone <b>has</b> ...</td><td>everyone / each / nobody 单数</td></tr>
<tr><td>The informations are useful.</td><td>The information <b>is</b> useful.</td><td>不可数名词无复数，谓语单数</td></tr>
<tr><td>One of the reason are ...</td><td>One of the reason<b>s is</b> ...</td><td>one of + 复数名词 + 单数谓语</td></tr>
</table>
<p class="tip">💡 检查技巧：写完每句话，找到主语中心词，问自己"它是单数还是复数？"</p>`,
        exercise: {
          type: 'sentence',
          instruction: '把下面的中文句子翻译成英文，注意时态和主谓一致，每句单独一行。',
          gen: '出 3 句中文句子，分别考察：一般现在时陈述观点、现在完成时描述变化、the number of / one of / everyone 等主谓一致陷阱（三选一或混合）。话题与雅思相关。题目用编号列出。reference 给出参考译文。',
          focus: '时态选择、主谓一致、动词形式',
        },
      },
      {
        id: 'u3',
        title: '冠词、单复数与可数性',
        goal: '搞定 a / an / the 和名词单复数——中国考生错误率最高的地方',
        lesson: `
<h4>三条核心规则</h4>
<ol>
<li><b>泛指一类事物，用复数（不加 the）</b>：<i><u>Children</u> need guidance.</i> 而不是 <i>Child need guidance</i> 或 <i>The children need guidance</i>（除非特指某些孩子）。</li>
<li><b>可数名词单数不能"裸奔"</b>，前面必须有 a/an/the/my/this 等：❌ <i>Car is useful.</i> → ✅ <i>A car is useful.</i> / <i>Cars are useful.</i></li>
<li><b>the 用于特指</b>：上文提过的、双方都知道的、唯一的、被后置修饰限定的：<i><u>the</u> government, <u>the</u> environment, <u>the</u> problems caused by traffic</i></li>
</ol>
<h4>雅思高频不可数名词（没有复数、不能加 a）</h4>
<p>information, advice, knowledge, research, evidence, equipment, pollution, traffic, furniture, homework, progress, employment, transport</p>
<ul>
<li>❌ a useful advice → ✅ a piece of useful advice / useful advice</li>
<li>❌ many researches → ✅ much research / many studies</li>
</ul>
<p class="tip">💡 练习方式：本单元是<b>改错题</b>——AI 会给你含有错误的句子，你把改正后的完整句子打出来。</p>`,
        exercise: {
          type: 'sentence',
          instruction: '下面的句子都有错误（冠词、单复数、可数性），请把改正后的完整句子打出来，每句单独一行。',
          gen: '出 4 句雅思话题相关的英文句子，每句含 1-2 个冠词/名词单复数/不可数名词方面的典型中国学生错误。题目用编号列出，不要提示错误在哪。reference 给出改正后的句子并简要说明错在哪里。',
          focus: '学生是否找出并改正了全部错误，是否引入了新的错误',
        },
      },
    ],
  },
  {
    id: 's2',
    title: '第二阶段 · 复杂句与连接',
    desc: '学会把句子连起来。雅思 6.5+ 需要"多种复杂句结构"，并且要准确。',
    units: [
      {
        id: 'u4',
        title: '并列句与连接词',
        goal: '正确使用连接词和标点，告别"逗号连句"',
        lesson: `
<h4>头号错误：逗号连接两个完整句子（comma splice）</h4>
<ul>
<li>❌ It is cheap, however it is not safe.</li>
<li>✅ It is cheap<b>; however,</b> it is not safe.</li>
<li>✅ It is cheap<b>. However,</b> it is not safe.</li>
<li>✅ It is cheap<b>, but</b> it is not safe.</li>
</ul>
<p><b>however / therefore / moreover</b> 是副词，不能像 but / so / and 那样直接用逗号连接两个句子。</p>
<h4>连接词按功能分类</h4>
<table>
<tr><th>功能</th><th>连词（连接句子）</th><th>副词（句首 + 逗号）</th></tr>
<tr><td>递进</td><td>and, not only ... but also</td><td>Moreover, Furthermore, In addition,</td></tr>
<tr><td>转折</td><td>but, while, whereas, although</td><td>However, Nevertheless, On the other hand,</td></tr>
<tr><td>因果</td><td>because, so, since</td><td>Therefore, As a result, Consequently,</td></tr>
<tr><td>举例</td><td>such as</td><td>For example, For instance,</td></tr>
</table>
<p class="tip">💡 不要每句都以连接词开头，也不要机械地 Firstly / Secondly / Thirdly。考官看的是逻辑是否清晰，而不是连接词的数量。</p>`,
        exercise: {
          type: 'sentence',
          instruction: '把每组的两个句子合并成一个句子（或用分号/句号 + 连接副词），每组的答案单独一行。尽量用不同的连接方式。',
          gen: '出 3 组英文短句，每组 2 个简单句，雅思话题相关，之间存在转折、因果或递进关系，适合用连接词合并。题目用编号列出，并在每组后用括号标注关系（如：转折）。reference 给出 2 种合并写法。',
          focus: '连接词是否符合逻辑关系、标点是否正确（尤其是 comma splice）、句子是否通顺',
        },
      },
      {
        id: 'u5',
        title: '定语从句',
        goal: '用 who / which / that / where 让句子信息更紧凑',
        lesson: `
<h4>关系词怎么选</h4>
<table>
<tr><th>关系词</th><th>修饰</th><th>例句</th></tr>
<tr><td>who</td><td>人</td><td>Students <u>who study abroad</u> become more independent.</td></tr>
<tr><td>which / that</td><td>物</td><td>Policies <u>that reduce traffic</u> are needed.</td></tr>
<tr><td>whose</td><td>所属</td><td>Workers <u>whose jobs are automated</u> need retraining.</td></tr>
<tr><td>where</td><td>地点</td><td>Cities <u>where public transport is cheap</u> have less congestion.</td></tr>
</table>
<h4>限制性 vs 非限制性</h4>
<ul>
<li>限制性（无逗号）：限定范围。<i>People <u>who exercise regularly</u> live longer.</i></li>
<li>非限制性（有逗号）：补充说明，<b>不能用 that</b>。<i>Online learning, <u>which has grown rapidly</u>, offers flexibility.</i></li>
</ul>
<h4>进阶：简化为分词</h4>
<p><i>People <s>who live</s> <b>living</b> in cities ...</i> / <i>Products <s>which are made</s> <b>made</b> locally ...</i></p>
<p class="tip">💡 常见错误：❌ <i>Many people who live in cities they feel stressed.</i>（从句后又重复主语 they）</p>`,
        exercise: {
          type: 'sentence',
          instruction: '用定语从句（或分词结构）把每组句子合并成一句，每组答案单独一行。',
          gen: '出 3 组英文短句，每组 2 句，第二句可以转化为修饰第一句某个名词的定语从句（涵盖 who/which/where/whose 中至少两种，至少一组适合非限制性从句）。雅思话题相关。题目用编号列出。reference 给出合并后的句子。',
          focus: '关系词选择、逗号使用、从句中是否重复主语/宾语、语义是否正确',
        },
      },
      {
        id: 'u6',
        title: '状语从句与名词性从句',
        goal: '表达让步、条件、原因，并学会用从句做主语和宾语',
        lesson: `
<h4>状语从句</h4>
<ul>
<li>让步：<i><u>Although</u> technology brings convenience, it also creates new problems.</i></li>
<li>对比：<i>Some people prefer cities, <u>while</u> others enjoy rural life.</i></li>
<li>条件：<i><u>If / Unless / As long as</u> governments invest more, ...</i></li>
<li>原因：<i><u>Because / Since / As</u> housing is expensive, ...</i></li>
</ul>
<p>⚠️ <b>中式错误</b>：❌ Although ..., <b>but</b> ... ❌ Because ..., <b>so</b> ...（英文二选一，不能同时用）</p>
<h4>名词性从句（高分句型）</h4>
<ul>
<li><i><u>It is widely believed that</u> education is the key to success.</i></li>
<li><i><u>What matters most is</u> whether students can apply their knowledge.</i></li>
<li><i>The problem is <u>that</u> many people cannot afford healthcare.</i></li>
<li><i><u>Whether</u> this policy works <u>depends on</u> public support.</i></li>
</ul>
<p class="tip">💡 一篇作文里有 3-5 个准确的复杂句就足够展示语法多样性，不要每句都堆从句。</p>`,
        exercise: {
          type: 'sentence',
          instruction: '把下面的中文句子翻译成英文，尽量使用题目提示的从句类型，每句单独一行。',
          gen: '出 3 句雅思话题相关的中文句子，分别适合用 although/while 让步对比、if/unless 条件、It is ... that / What ... is 名词性从句来翻译。每句后用括号提示句型。题目用编号列出。reference 给出参考译文。',
          focus: '从句结构是否正确、是否出现 although...but / because...so、语义是否准确',
        },
      },
    ],
  },
  {
    id: 's3',
    title: '第三阶段 · 词汇与地道表达',
    desc: '词汇分（LR）看的是准确、多样和地道搭配，而不是生僻词。',
    units: [
      {
        id: 'u7',
        title: '同义替换与学术表达',
        goal: '避免重复，用准确的词改写句子',
        lesson: `
<h4>为什么要同义替换</h4>
<p>考官会看你能否<b>不重复题目原词</b>来表达同样的意思（paraphrase），这直接影响词汇分。</p>
<h4>高频替换</h4>
<table>
<tr><th>基础词</th><th>替换</th></tr>
<tr><td>important</td><td>crucial, vital, essential, significant</td></tr>
<tr><td>problem</td><td>issue, challenge, concern, drawback</td></tr>
<tr><td>increase</td><td>rise, grow, climb, surge（大幅）</td></tr>
<tr><td>many people</td><td>a large proportion of people, a growing number of people</td></tr>
<tr><td>think</td><td>argue, believe, maintain, hold the view that</td></tr>
<tr><td>good / bad</td><td>beneficial / detrimental, positive / negative</td></tr>
<tr><td>help</td><td>enable, contribute to, facilitate</td></tr>
</table>
<h4>名词化：更学术的表达</h4>
<p><i>because people use cars more and more</i> → <i>due to <b>the growing reliance on</b> private cars</i></p>
<p class="tip">💡 <b>准确 > 高级</b>。用错的"高级词"比用对的简单词更扣分。不确定的词宁可不用。</p>`,
        exercise: {
          type: 'sentence',
          instruction: '用更准确、更学术的表达改写下面的句子（意思不变），每句单独一行。',
          gen: '出 3 句用词非常基础、有重复的英文句子（如大量使用 good, bad, very, a lot of, think, important），雅思话题相关。题目用编号列出。reference 给出 1-2 种高质量改写。',
          focus: '改写后是否保持原意、词汇是否准确地道、搭配是否正确、是否过度堆砌生僻词',
        },
      },
      {
        id: 'u8',
        title: '告别中式英语',
        goal: '掌握常见搭配，写出母语者会说的句子',
        lesson: `
<h4>高频中式英语</h4>
<table>
<tr><th>❌ 中式</th><th>✅ 地道</th></tr>
<tr><td>learn knowledge</td><td>acquire / gain knowledge</td></tr>
<tr><td>improve people's living standard</td><td>raise living standards</td></tr>
<tr><td>people's life</td><td>people's lives</td></tr>
<tr><td>make them to work</td><td>make them work</td></tr>
<tr><td>In my opinion, I think ...</td><td>In my opinion, ... / I believe ...</td></tr>
<tr><td>more and more people</td><td>an increasing number of people</td></tr>
<tr><td>With the development of society, ...</td><td>（直接说具体的变化）As the cost of living rises, ...</td></tr>
<tr><td>It has many advantages and disadvantages.</td><td>（太空泛，直接说具体好处）</td></tr>
<tr><td>solve the pressure</td><td>relieve / reduce pressure</td></tr>
<tr><td>bring many benefits to people</td><td>benefit people considerably</td></tr>
</table>
<h4>思路：从"字对字"到"意对意"</h4>
<p>翻译时先想"英文里描述这件事通常用什么动词"，而不是逐字翻译。动词 + 名词的<b>搭配（collocation）</b>是关键。</p>
<p class="tip">💡 "With the development of ..." 这种万能开头考官看过无数次，信息量为零，尽量避免。</p>`,
        exercise: {
          type: 'sentence',
          instruction: '把下面的中文句子翻译成地道的英文（不要逐字翻译），每句单独一行。',
          gen: '出 3 句中文句子，每句都包含一个中国学生容易逐字直译成中式英语的表达（如"学习知识""提高生活水平""缓解压力""随着社会的发展"等），雅思话题相关。题目用编号列出。reference 给出地道译文，并指出容易犯的中式表达。',
          focus: '是否有中式英语、搭配是否地道、语法是否正确',
        },
      },
    ],
  },
  {
    id: 's4',
    title: '第四阶段 · Task 2 段落写作',
    desc: '一段一段地练：开头、主体、结尾。',
    units: [
      {
        id: 'u9',
        title: '审题与开头段',
        goal: '看懂题型，写出改写题目 + 明确立场的开头',
        lesson: `
<h4>Task 2 五大题型</h4>
<table>
<tr><th>题型</th><th>题目特征</th><th>开头要表明</th></tr>
<tr><td>观点类 Opinion</td><td>To what extent do you agree or disagree?</td><td>你的明确立场</td></tr>
<tr><td>讨论类 Discussion</td><td>Discuss both views and give your opinion.</td><td>两方观点 + 你的立场</td></tr>
<tr><td>利弊类</td><td>Do the advantages outweigh the disadvantages?</td><td>利大还是弊大</td></tr>
<tr><td>问题解决类</td><td>What are the causes/problems? What solutions?</td><td>文章将讨论原因和对策</td></tr>
<tr><td>双问题类</td><td>Why ...? Is this positive or negative?</td><td>分别回应两个问题</td></tr>
</table>
<h4>开头段 = 改写题目 + 中心论点（2-3 句，40-60 词）</h4>
<p><b>题目</b>：Some people believe that university students should pay all the cost of their studies. To what extent do you agree?</p>
<p><b>开头</b>：<i>It is sometimes argued that tertiary students should be fully responsible for funding their own education. While I accept that students benefit personally from a degree, I largely disagree with this view because higher education also serves the wider society.</i></p>
<p class="tip">💡 不要背"Nowadays, there is a heated debate about..."这种空话模板。改写题目时，用同义词和改变句子结构，而不是照抄。</p>`,
        exercise: {
          type: 'paragraph',
          task: 'task2',
          instruction: '阅读题目，写一个开头段（2-3 句，40-60 词）：改写题目 + 表明立场。',
          gen: '出一道真实风格的雅思 Task 2 题目（随机选择五大题型之一），话题随机。hint 用中文说明这是什么题型以及开头段需要表明什么。reference 给出一个高分开头段范文。',
          focus: '是否正确识别题型、改写是否充分（未照抄题目）、立场是否清晰、语言准确性',
          minWords: 35,
        },
      },
      {
        id: 'u10',
        title: '主体段：PEEL 结构',
        goal: '写出观点清晰、论证充分的主体段',
        lesson: `
<h4>PEEL 四步</h4>
<ul>
<li><b>P</b>oint 主题句：这段的中心观点（一句话）</li>
<li><b>E</b>xplain 解释：为什么？展开逻辑（1-2 句）</li>
<li><b>E</b>xample 例子：具体例子或假设场景（1-2 句）</li>
<li><b>L</b>ink 回扣：总结本段，回到题目立场（1 句，可选）</li>
</ul>
<h4>示例（观点：大学教育应由政府部分资助）</h4>
<p><i><b>[P]</b> The main reason why governments should help fund university education is that society as a whole benefits from a highly educated workforce. <b>[E]</b> Graduates in fields such as medicine and engineering provide essential services, and their skills drive economic growth and innovation. <b>[E]</b> For example, many of the doctors who staff public hospitals were trained at subsidised universities. <b>[L]</b> Therefore, it would be unfair to treat higher education as a purely private benefit.</i></p>
<p class="tip">💡 每段只讲<b>一个</b>中心观点，4-6 句、80-120 词。考生最常见的问题是"观点多但都没展开"——考官更看重展开深度（Task Response）。</p>`,
        exercise: {
          type: 'paragraph',
          task: 'task2',
          instruction: '根据题目和给定的观点，用 PEEL 结构写一个主体段（80-120 词）。',
          gen: '出一道雅思 Task 2 题目，并在 hint 中用中文给出一个可以写成主体段的分论点（学生需要围绕这个观点写一段）。reference 给出一个 PEEL 结构的高分主体段范文。',
          focus: '主题句是否明确、解释是否有逻辑、例子是否具体相关、段落是否只围绕一个中心、衔接是否自然',
          minWords: 70,
        },
      },
      {
        id: 'u11',
        title: '结尾段',
        goal: '简洁有力地收尾，不引入新观点',
        lesson: `
<h4>结尾段 = 重申立场 + 概括主要理由（2-3 句）</h4>
<ul>
<li>用 <i>In conclusion, / To conclude, / Overall,</i> 开头</li>
<li>换一种说法重申你的立场（不要照抄开头段）</li>
<li>一句话概括主体段的核心理由</li>
<li><b>不要</b>引入新观点或新例子</li>
</ul>
<h4>示例</h4>
<p><i>In conclusion, although graduates do gain personal advantages from their degrees, I believe the cost of university should not fall entirely on students, since a well-educated population benefits the whole of society.</i></p>
<p class="tip">💡 观点类题目里，开头和结尾的立场必须一致。很多考生写着写着改了立场，这会直接影响 Task Response 分数。</p>`,
        exercise: {
          type: 'paragraph',
          task: 'task2',
          instruction: '根据题目和给出的文章大纲，写一个结尾段（2-3 句，40-60 词）。',
          gen: '出一道雅思 Task 2 题目，并在 hint 中用中文给出一篇文章的简要大纲（立场 + 两个主体段的分论点），学生据此写结尾段。reference 给出高分结尾段范文。',
          focus: '是否重申了与大纲一致的立场、是否概括了主要理由、是否引入了新观点、语言准确性',
          minWords: 30,
        },
      },
    ],
  },
  {
    id: 's5',
    title: '第五阶段 · 完整作文',
    desc: '按考试要求写完整作文，按四项评分标准打分。',
    units: [
      {
        id: 'u12',
        title: 'Task 2 完整作文',
        goal: '40 分钟内写出 250 词以上、结构完整的议论文',
        lesson: `
<h4>结构与时间</h4>
<ul>
<li>4-5 段：开头 → 主体段 ×2（或 ×3）→ 结尾，<b>250 词以上</b></li>
<li>时间分配：<b>5 分钟</b>审题 + 列提纲 → <b>30 分钟</b>写作 → <b>5 分钟</b>检查</li>
</ul>
<h4>四项评分标准（各占 25%）</h4>
<table>
<tr><th>评分项</th><th>看什么</th><th>6 分 → 7 分的关键</th></tr>
<tr><td>Task Response</td><td>是否完整回应题目、立场清晰、论证充分</td><td>观点要"展开"而不只是"列出"，全文立场一致</td></tr>
<tr><td>Coherence & Cohesion</td><td>逻辑和段落组织、衔接</td><td>每段一个中心；连接词自然不机械；指代清楚</td></tr>
<tr><td>Lexical Resource</td><td>词汇范围、准确度、搭配</td><td>使用不常见词汇且基本准确，有搭配意识</td></tr>
<tr><td>Grammatical Range & Accuracy</td><td>句式多样性、语法准确</td><td>多种复杂句，且<b>大多数句子没有错误</b></td></tr>
</table>
<h4>交卷前检查清单</h4>
<p>☐ 每句有谓语动词 ☐ 主谓一致 ☐ 名词单复数和冠词 ☐ 没有 comma splice ☐ 立场前后一致 ☐ 字数 ≥ 250</p>
<p class="tip">💡 这里也可以点「使用自己的题目」，练习你从真题集里找到的题目。</p>`,
        exercise: {
          type: 'essay',
          task: 'task2',
          instruction: '在 40 分钟内完成这篇 Task 2 作文，不少于 250 词。',
          gen: '出一道真实风格的雅思 Task 2 题目（随机题型和话题，难度与真题一致）。hint 用中文简要说明题型和审题要点（不要给出完整思路）。reference 留空字符串。',
          focus: '按雅思 Task 2 官方四项评分标准全面评估',
          minWords: 250,
          timeLimit: 40,
        },
      },
      {
        id: 'u13',
        title: 'Task 1：概述与数据描述',
        goal: '写出清晰的 Overview，用准确的趋势词描述数据',
        lesson: `
<h4>Task 1 结构（150 词以上，20 分钟）</h4>
<ol>
<li><b>开头</b>：改写题目（1 句）</li>
<li><b>Overview 概述</b>：2 个最主要的趋势/特征，<b>不写具体数字</b>——没有 Overview 很难超过 5 分</li>
<li><b>细节段 ×2</b>：分组描述关键数据，有数据支撑和比较</li>
</ol>
<h4>趋势词汇</h4>
<table>
<tr><th>上升</th><td>rise, increase, climb, grow, surge（剧增）, peak at（达到峰值）</td></tr>
<tr><th>下降</th><td>fall, decline, drop, decrease, plunge（骤降）, hit a low of</td></tr>
<tr><th>平稳/波动</th><td>remain stable, level off, plateau, fluctuate</td></tr>
<tr><th>程度</th><td>dramatically, sharply, significantly, steadily, gradually, slightly</td></tr>
</table>
<h4>比较与占比</h4>
<p><i>X was twice as high as Y.</i> / <i>X accounted for 30% of the total.</i> / <i>The figure for X was considerably higher than that for Y.</i></p>
<p class="tip">💡 Task 1 只描述数据，<b>不要</b>写原因推测或个人观点。本单元练习只需写 <b>开头 + Overview</b>。</p>`,
        exercise: {
          type: 'paragraph',
          task: 'task1',
          instruction: '根据题目中的数据，写出 Task 1 的开头句 + Overview（3-4 句，50-80 词）。',
          gen: '出一道雅思 Task 1 图表题（线图、柱状图、饼图或表格之一）。因为无法显示图片，请在 prompt 中先用一句英文题目描述（如 "The table below shows ..."），然后用 Markdown 表格给出完整数据（4-6 行、3-5 列，数据有明显趋势或对比）。hint 用中文提示该图的主要特征该从哪里找。reference 给出高分的开头 + Overview 范文。',
          focus: '开头是否改写题目、Overview 是否抓住最主要特征且没有罗列数字、趋势词是否准确、时态是否正确',
          minWords: 40,
        },
      },
      {
        id: 'u14',
        title: 'Task 1 完整作文',
        goal: '20 分钟内完成 150 词以上的小作文',
        lesson: `
<h4>写作步骤</h4>
<ol>
<li><b>2 分钟</b>：看清图表类型、时间（决定时态）、单位</li>
<li><b>3 分钟</b>：找出 2 个最主要特征（写进 Overview），把数据分成 2 组</li>
<li><b>13 分钟</b>：写作</li>
<li><b>2 分钟</b>：检查数字、时态、单位</li>
</ol>
<h4>细节段写法</h4>
<p>不要逐个罗列数据，要<b>分组 + 比较</b>：</p>
<p><i>In 2000, Japan had the highest proportion of elderly people at 17%, roughly double the figure for the USA. Over the following two decades, this percentage climbed steadily in all three countries, ...</i></p>
<p class="tip">💡 Task 1 的评分标准是 Task Achievement（而不是 Task Response），看的是是否准确概括并比较了关键信息。</p>`,
        exercise: {
          type: 'essay',
          task: 'task1',
          instruction: '在 20 分钟内完成这篇 Task 1 作文，不少于 150 词。',
          gen: '出一道雅思 Task 1 图表题（线图、柱状图、饼图或表格之一）。因为无法显示图片，请在 prompt 中先给出英文题目（如 "The chart below shows ... Summarise the information by selecting and reporting the main features, and make comparisons where relevant."），然后用 Markdown 表格给出完整数据（4-6 行、3-5 列）。hint 用中文提示审题要点。reference 留空字符串。',
          focus: '按雅思 Task 1 官方四项评分标准全面评估（Task Achievement 而非 Task Response）',
          minWords: 150,
          timeLimit: 20,
        },
      },
    ],
  },
];

// 模考使用的练习配置（不属于任何单元）
window.MOCK_EXERCISES = {
  task2: {
    type: 'essay',
    task: 'task2',
    instruction: '模拟考试：40 分钟，不少于 250 词。',
    gen: '出一道真实风格的雅思 Task 2 题目（随机题型和话题，难度与真题一致）。hint 留空字符串。reference 留空字符串。',
    focus: '按雅思 Task 2 官方四项评分标准严格评估，就像真实考官一样打分',
    minWords: 250,
    timeLimit: 40,
  },
  task1: {
    type: 'essay',
    task: 'task1',
    instruction: '模拟考试：20 分钟，不少于 150 词。',
    gen: '出一道雅思 Task 1 图表题（线图、柱状图、饼图或表格之一）。因为无法显示图片，请在 prompt 中先给出英文题目，然后用 Markdown 表格给出完整数据（4-6 行、3-5 列）。hint 留空字符串。reference 留空字符串。',
    focus: '按雅思 Task 1 官方四项评分标准严格评估（Task Achievement 而非 Task Response）',
    minWords: 150,
    timeLimit: 20,
  },
};
