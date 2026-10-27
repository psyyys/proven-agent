// 雅思写作轨道：从句子到完整作文（单元 id 与旧版一致，学习进度可以延续）
// 卡片类型：text（讲解）| compare（错误 vs 正确）| check（打一句话的小测，自己对照参考答案）
// exercise.gen / focus 是给 AI 的出题与批改要求，只给模型看，所以只写中文
(window.TRACKS = window.TRACKS || []).push({
  id: 'ielts',
  icon: '🎯',
  title: B('雅思写作', 'IELTS Writing'),
  desc: B('从写对一个句子，到 40 分钟完成一篇 Task 2。专为中文母语者设计。', 'From one correct sentence to a full Task 2 essay in 40 minutes. Designed for Chinese speakers.'),
  stages: [
    {
      title: B('句子基本功', 'Sentence foundations'),
      desc: B('先把句子写对。语法分（GRA）里，错误密度比句子复杂度更伤分。', 'Get sentences right first. In GRA, error density hurts more than a lack of complexity.'),
      units: [
        {
          id: 'u1',
          title: B('简单句：英语句子的骨架', 'Simple sentences: the skeleton'),
          goal: B('每句话都有主语 + 谓语动词，掌握五种基本句型', 'Every sentence has a subject and a finite verb; master the five basic patterns'),
          cards: [
            {
              title: B('英文句子不能没有动词', 'No verb, no sentence'),
              body: B(
                `<p>中文可以省略主语，也可以没有动词：「这个问题很重要」。英文<b>每个句子都必须有主语和谓语动词</b>，这是中国考生最常见的丢分点。</p>
<p class="tip">写作原则：<b>先写对，再写复杂</b>。一个准确的简单句，永远好过一个错误的复杂句。</p>`,
                `<p>Chinese can drop the subject and even the verb ("这个问题很重要" has no verb). In English, <b>every sentence needs a subject and a finite verb</b>. This is the most common way Chinese candidates lose marks.</p>
<p class="tip">Rule of thumb: <b>accurate first, complex second</b>. A correct simple sentence always beats a broken complex one.</p>`,
              ),
            },
            {
              title: B('五种基本句型', 'Five basic patterns'),
              body: B(
                `<table><tr><th>句型</th><th>例句</th></tr>
<tr><td>主 + 谓 (SV)</td><td>Prices <u>rose</u>.</td></tr>
<tr><td>主 + 系 + 表 (SVC)</td><td>Technology <u>is</u> essential.</td></tr>
<tr><td>主 + 谓 + 宾 (SVO)</td><td>Governments <u>should fund</u> public transport.</td></tr>
<tr><td>主 + 谓 + 间宾 + 直宾 (SVOO)</td><td>Online courses <u>give</u> students flexibility.</td></tr>
<tr><td>主 + 谓 + 宾 + 宾补 (SVOC)</td><td>Social media <u>makes</u> people anxious.</td></tr></table>`,
                `<table><tr><th>Pattern</th><th>Example</th></tr>
<tr><td>S + V</td><td>Prices <u>rose</u>.</td></tr>
<tr><td>S + V + Complement</td><td>Technology <u>is</u> essential.</td></tr>
<tr><td>S + V + Object</td><td>Governments <u>should fund</u> public transport.</td></tr>
<tr><td>S + V + O + O</td><td>Online courses <u>give</u> students flexibility.</td></tr>
<tr><td>S + V + O + Complement</td><td>Social media <u>makes</u> people anxious.</td></tr></table>`,
              ),
            },
            {
              kind: 'compare',
              title: B('常见错误', 'Common mistakes'),
              rows: [
                ['Technology very important.', 'Technology <b>is</b> very important.', B('缺系动词', 'missing linking verb')],
                ['Many people think is good.', 'Many people think <b>it</b> is good.', B('从句缺主语', 'clause has no subject')],
                ['Use computers can save time.', '<b>Using</b> computers can save time.', B('动词原形不能做主语', 'a bare verb cannot be the subject')],
                ['There are many students like online learning.', 'Many students like online learning.', B('一个句子两个谓语', 'two main verbs in one clause')],
              ],
            },
            {
              kind: 'check',
              title: B('小测', 'Quick check'),
              prompt: B('翻译：「教育对每个孩子都很重要。」', 'Translate: "教育对每个孩子都很重要。" (Education matters for every child.)'),
              answer: 'Education is important for every child.',
            },
          ],
          exercise: {
            kind: 'translate',
            type: 'sentence',
            instruction: B('把下面的中文句子翻译成英文，每句单独一行。', 'Translate the Chinese sentences into English, one per line.'),
            gen: '出 3 句与雅思常见话题（教育、科技、环境、城市、健康、工作）相关的中文句子，长度 10-20 字，适合用简单句表达。题目用编号列出。reference 给出每句的地道英文参考译文。',
            focus: '句子是否完整（有主语和谓语动词）、句型是否正确、是否有中式英语',
          },
        },
        {
          id: 'u2',
          title: B('时态与主谓一致', 'Tense and agreement'),
          goal: B('用对时态，让主语和动词「对得上」', 'Choose the right tense and make subjects and verbs agree'),
          cards: [
            {
              title: B('雅思写作用什么时态', 'Which tense when'),
              body: B(
                `<ul><li><b>Task 2</b>：以<b>一般现在时</b>为主（陈述观点、事实）。描述「到目前为止的变化」用<b>现在完成时</b>：<i>Online shopping <u>has become</u> increasingly popular.</i></li>
<li><b>Task 1</b>：过去的数据用<b>一般过去时</b>（<i>Sales <u>rose</u> in 2010</i>）；预测数据用 <i>is expected to / is predicted to / will</i>。</li></ul>`,
                `<ul><li><b>Task 2</b>: mainly <b>present simple</b> for opinions and facts. Use the <b>present perfect</b> for change up to now: <i>Online shopping <u>has become</u> increasingly popular.</i></li>
<li><b>Task 1</b>: <b>past simple</b> for past data (<i>Sales <u>rose</u> in 2010</i>); <i>is expected to / is predicted to / will</i> for projections.</li></ul>`,
              ),
            },
            {
              kind: 'compare',
              title: B('主谓一致的陷阱', 'Agreement traps'),
              rows: [
                ['The number of cars are increasing.', 'The number of cars <b>is</b> increasing.', B('the number of 看 number，用单数', '"the number" is singular')],
                ['A number of student agrees.', 'A number of student<b>s agree</b>.', B('a number of = many，用复数', '"a number of" means "many"')],
                ['Everyone have their own opinion.', 'Everyone <b>has</b> their own opinion.', B('everyone / each / nobody 用单数', 'everyone / each / nobody are singular')],
                ['The informations are useful.', 'The information <b>is</b> useful.', B('不可数名词没有复数', 'uncountable: no plural')],
                ['One of the reason are ...', 'One of the reason<b>s is</b> ...', B('one of + 复数名词 + 单数谓语', 'one of + plural noun + singular verb')],
              ],
            },
            {
              title: B('检查技巧', 'A checking habit'),
              body: B('<p class="tip">写完每句，找到主语的<b>中心词</b>，问自己：它是单数还是复数？</p>', '<p class="tip">After each sentence, find the <b>head noun</b> of the subject and ask: singular or plural?</p>'),
            },
            {
              kind: 'check',
              title: B('小测', 'Quick check'),
              prompt: B('翻译：「在过去十年里，城市里的汽车数量大幅增加了。」', 'Translate: "在过去十年里，城市里的汽车数量大幅增加了。" (The number of cars in cities has risen sharply over the past decade.)'),
              answer: 'The number of cars in cities has increased dramatically over the past decade.',
            },
          ],
          exercise: {
            kind: 'translate',
            type: 'sentence',
            instruction: B('把下面的中文句子翻译成英文，注意时态和主谓一致，每句单独一行。', 'Translate into English, paying attention to tense and agreement. One sentence per line.'),
            gen: '出 3 句中文句子，分别考察：一般现在时陈述观点、现在完成时描述变化、the number of / one of / everyone 等主谓一致陷阱（三选一或混合）。话题与雅思相关。题目用编号列出。reference 给出参考译文。',
            focus: '时态选择、主谓一致、动词形式',
          },
        },
        {
          id: 'u3',
          title: B('冠词、单复数与可数性', 'Articles, plurals and countability'),
          goal: B('搞定 a / an / the 和名词单复数', 'Get a / an / the and noun number right'),
          cards: [
            {
              title: B('三条核心规则', 'Three core rules'),
              body: B(
                `<ol><li><b>泛指一类事物，用复数（不加 the）</b>：<i><u>Children</u> need guidance.</i></li>
<li><b>可数名词单数不能单独出现</b>，前面必须有 a / the / my / this 等：<i><s>Car is useful.</s> → <u>A car</u> is useful. / <u>Cars</u> are useful.</i></li>
<li><b>the 用于特指</b>：上文提过的、双方都知道的、被后面的修饰限定的：<i>the government, the problems <u>caused by traffic</u></i></li></ol>`,
                `<ol><li><b>For a whole class of things, use the plural with no article</b>: <i><u>Children</u> need guidance.</i></li>
<li><b>A singular countable noun never stands alone</b>; it needs a / the / my / this…: <i><s>Car is useful.</s> → <u>A car</u> is useful. / <u>Cars</u> are useful.</i></li>
<li><b>Use the for specific things</b>: already mentioned, shared knowledge, or defined by what follows: <i>the government, the problems <u>caused by traffic</u></i></li></ol>`,
              ),
            },
            {
              title: B('高频不可数名词', 'High-frequency uncountables'),
              body: B(
                `<p>这些词<b>没有复数、不能加 a</b>：</p><p><i>information, advice, knowledge, research, evidence, equipment, pollution, traffic, homework, progress, employment, transport</i></p>
<ul><li><s>a useful advice</s> → a piece of useful advice / useful advice</li><li><s>many researches</s> → much research / many studies</li></ul>`,
                `<p>These have <b>no plural and take no "a"</b>:</p><p><i>information, advice, knowledge, research, evidence, equipment, pollution, traffic, homework, progress, employment, transport</i></p>
<ul><li><s>a useful advice</s> → a piece of useful advice / useful advice</li><li><s>many researches</s> → much research / many studies</li></ul>`,
              ),
            },
            {
              kind: 'check',
              title: B('小测', 'Quick check'),
              prompt: B('改错：<i>Government should give more supports to the elderly people.</i>', 'Fix it: <i>Government should give more supports to the elderly people.</i>'),
              answer: 'The government should give more support to elderly people.',
            },
          ],
          exercise: {
            kind: 'fix',
            type: 'sentence',
            instruction: B('下面的句子都有错误（冠词、单复数、可数性），把改正后的完整句子打出来，每句单独一行。', 'Each sentence has article / plural / countability errors. Type the corrected sentences, one per line.'),
            gen: '出 4 句雅思话题相关的英文句子，每句含 1-2 个冠词/名词单复数/不可数名词方面的典型中国学生错误。题目用编号列出，不要提示错误在哪。reference 给出改正后的句子并简要说明错在哪里。',
            focus: '学生是否找出并改正了全部错误，是否引入了新的错误',
          },
        },
      ],
    },
    {
      title: B('复杂句与连接', 'Complex sentences and linking'),
      desc: B('学会把句子连起来。6.5 分以上需要多种复杂句结构，而且要准确。', 'Link ideas. Band 6.5+ needs a range of complex structures, used accurately.'),
      units: [
        {
          id: 'u4',
          title: B('并列句与连接词', 'Coordination and linkers'),
          goal: B('正确使用连接词和标点，告别「逗号连句」', 'Use linkers and punctuation correctly; no more comma splices'),
          cards: [
            {
              kind: 'compare',
              title: B('头号错误：逗号连句', 'Enemy no.1: the comma splice'),
              rows: [
                ['It is cheap, however it is not safe.', 'It is cheap<b>; however,</b> it is not safe.', B('however 是副词，不能用逗号连接两个句子', '"however" is an adverb, not a conjunction')],
                ['It is cheap, however it is not safe.', 'It is cheap<b>, but</b> it is not safe.', B('或者换成真正的连词', 'or use a real conjunction')],
              ],
            },
            {
              title: B('按功能分类', 'Linkers by function'),
              body: B(
                `<table><tr><th>功能</th><th>连词（连接两句）</th><th>副词（句首 + 逗号）</th></tr>
<tr><td>递进</td><td>and, not only … but also</td><td>Moreover, Furthermore, In addition,</td></tr>
<tr><td>转折</td><td>but, while, whereas, although</td><td>However, Nevertheless, On the other hand,</td></tr>
<tr><td>因果</td><td>because, so, since</td><td>Therefore, As a result, Consequently,</td></tr>
<tr><td>举例</td><td>such as</td><td>For example, For instance,</td></tr></table>
<p class="tip">不要每句都用连接词开头，也不要机械地 Firstly / Secondly / Thirdly。考官看的是逻辑是否清晰。</p>`,
                `<table><tr><th>Function</th><th>Conjunctions (join clauses)</th><th>Adverbs (start + comma)</th></tr>
<tr><td>Addition</td><td>and, not only … but also</td><td>Moreover, Furthermore, In addition,</td></tr>
<tr><td>Contrast</td><td>but, while, whereas, although</td><td>However, Nevertheless, On the other hand,</td></tr>
<tr><td>Cause / effect</td><td>because, so, since</td><td>Therefore, As a result, Consequently,</td></tr>
<tr><td>Example</td><td>such as</td><td>For example, For instance,</td></tr></table>
<p class="tip">Don't open every sentence with a linker, and avoid mechanical Firstly / Secondly / Thirdly. Examiners reward clear logic, not linker counts.</p>`,
              ),
            },
            {
              kind: 'check',
              title: B('小测', 'Quick check'),
              prompt: B('合并（因果）：<i>Housing is expensive. Many young people live with their parents.</i>', 'Combine (cause/effect): <i>Housing is expensive. Many young people live with their parents.</i>'),
              answer: 'Housing is so expensive that many young people live with their parents. / Housing is expensive; as a result, many young people live with their parents.',
            },
          ],
          exercise: {
            kind: 'combine',
            type: 'sentence',
            instruction: B('把每组的两个句子合并成一句（或用分号/句号 + 连接副词），每组答案单独一行。尽量用不同的连接方式。', 'Combine each pair into one sentence (or use ; / . + a linking adverb). One answer per line; vary your linkers.'),
            gen: '出 3 组英文短句，每组 2 个简单句，雅思话题相关，之间存在转折、因果或递进关系。题目用编号列出，并在每组后用括号标注关系（如：转折 / contrast）。reference 给出 2 种合并写法。',
            focus: '连接词是否符合逻辑关系、标点是否正确（尤其是 comma splice）、句子是否通顺',
          },
        },
        {
          id: 'u5',
          title: B('定语从句', 'Relative clauses'),
          goal: B('用 who / which / that / where 让信息更紧凑', 'Pack information with who / which / that / where'),
          cards: [
            {
              title: B('关系词怎么选', 'Choosing the relative word'),
              body: B(
                `<table><tr><th>关系词</th><th>修饰</th><th>例句</th></tr>
<tr><td>who</td><td>人</td><td>Students <u>who study abroad</u> become more independent.</td></tr>
<tr><td>which / that</td><td>物</td><td>Policies <u>that reduce traffic</u> are needed.</td></tr>
<tr><td>whose</td><td>所属</td><td>Workers <u>whose jobs are automated</u> need retraining.</td></tr>
<tr><td>where</td><td>地点</td><td>Cities <u>where transport is cheap</u> have less congestion.</td></tr></table>`,
                `<table><tr><th>Word</th><th>For</th><th>Example</th></tr>
<tr><td>who</td><td>people</td><td>Students <u>who study abroad</u> become more independent.</td></tr>
<tr><td>which / that</td><td>things</td><td>Policies <u>that reduce traffic</u> are needed.</td></tr>
<tr><td>whose</td><td>possession</td><td>Workers <u>whose jobs are automated</u> need retraining.</td></tr>
<tr><td>where</td><td>places</td><td>Cities <u>where transport is cheap</u> have less congestion.</td></tr></table>`,
              ),
            },
            {
              title: B('限制性 vs 非限制性', 'Defining vs non-defining'),
              body: B(
                `<ul><li>限制性（无逗号）：限定范围。<i>People <u>who exercise regularly</u> live longer.</i></li>
<li>非限制性（有逗号）：补充说明，<b>不能用 that</b>。<i>Online learning, <u>which has grown rapidly</u>, offers flexibility.</i></li>
<li>进阶，简化为分词：<i>People <s>who live</s> <b>living</b> in cities…</i></li></ul>`,
                `<ul><li>Defining (no commas) narrows the group: <i>People <u>who exercise regularly</u> live longer.</i></li>
<li>Non-defining (commas) adds extra information and <b>never uses that</b>: <i>Online learning, <u>which has grown rapidly</u>, offers flexibility.</i></li>
<li>Next level, reduce to a participle: <i>People <s>who live</s> <b>living</b> in cities…</i></li></ul>`,
              ),
            },
            {
              kind: 'compare',
              title: B('常见错误', 'Common mistake'),
              rows: [['Many people who live in cities they feel stressed.', 'Many people who live in cities feel stressed.', B('从句后又重复了主语', 'the subject is repeated after the clause')]],
            },
          ],
          exercise: {
            kind: 'combine',
            type: 'sentence',
            instruction: B('用定语从句（或分词结构）把每组句子合并成一句，每组答案单独一行。', 'Combine each pair using a relative clause (or participle). One answer per line.'),
            gen: '出 3 组英文短句，每组 2 句，第二句可以转化为修饰第一句某个名词的定语从句（涵盖 who/which/where/whose 中至少两种，至少一组适合非限制性从句）。雅思话题相关。题目用编号列出。reference 给出合并后的句子。',
            focus: '关系词选择、逗号使用、从句中是否重复主语/宾语、语义是否正确',
          },
        },
        {
          id: 'u6',
          title: B('状语从句与名词性从句', 'Adverbial and noun clauses'),
          goal: B('表达让步、条件、原因，并用从句做主语和宾语', 'Express concession, condition and cause; use clauses as subjects and objects'),
          cards: [
            {
              title: B('状语从句', 'Adverbial clauses'),
              body: B(
                `<ul><li>让步：<i><u>Although</u> technology brings convenience, it also creates new problems.</i></li>
<li>对比：<i>Some prefer cities, <u>while</u> others enjoy rural life.</i></li>
<li>条件：<i><u>If / Unless / As long as</u> governments invest more, …</i></li>
<li>原因：<i><u>Because / Since / As</u> housing is expensive, …</i></li></ul>`,
                `<ul><li>Concession: <i><u>Although</u> technology brings convenience, it also creates new problems.</i></li>
<li>Contrast: <i>Some prefer cities, <u>while</u> others enjoy rural life.</i></li>
<li>Condition: <i><u>If / Unless / As long as</u> governments invest more, …</i></li>
<li>Reason: <i><u>Because / Since / As</u> housing is expensive, …</i></li></ul>`,
              ),
            },
            {
              kind: 'compare',
              title: B('中式错误', 'Chinese-influenced errors'),
              rows: [
                ['Although it is cheap, but it is slow.', 'Although it is cheap, it is slow.', B('although 和 but 二选一', 'use although OR but, not both')],
                ['Because prices rose, so people bought less.', 'Because prices rose, people bought less.', B('because 和 so 二选一', 'use because OR so, not both')],
              ],
            },
            {
              title: B('名词性从句（高分句型）', 'Noun clauses (high-band patterns)'),
              body: B(
                `<ul><li><i><u>It is widely believed that</u> education is the key to success.</i></li>
<li><i><u>What matters most is</u> whether students can apply their knowledge.</i></li>
<li><i><u>Whether</u> this policy works <u>depends on</u> public support.</i></li></ul>
<p class="tip">一篇作文里有 3-5 个准确的复杂句就足够展示语法多样性，不要每句都堆从句。</p>`,
                `<ul><li><i><u>It is widely believed that</u> education is the key to success.</i></li>
<li><i><u>What matters most is</u> whether students can apply their knowledge.</i></li>
<li><i><u>Whether</u> this policy works <u>depends on</u> public support.</i></li></ul>
<p class="tip">Three to five accurate complex sentences per essay show enough range. Don't stack clauses in every sentence.</p>`,
              ),
            },
          ],
          exercise: {
            kind: 'translate',
            type: 'sentence',
            instruction: B('把中文句子翻译成英文，尽量使用括号里提示的从句类型，每句单独一行。', 'Translate into English using the clause type in brackets. One sentence per line.'),
            gen: '出 3 句雅思话题相关的中文句子，分别适合用 although/while 让步对比、if/unless 条件、It is ... that / What ... is 名词性从句来翻译。每句后用括号提示句型。题目用编号列出。reference 给出参考译文。',
            focus: '从句结构是否正确、是否出现 although...but / because...so、语义是否准确',
          },
        },
      ],
    },
    {
      title: B('词汇与地道表达', 'Vocabulary and natural English'),
      desc: B('词汇分（LR）看的是准确、多样和地道搭配，而不是生僻词。', 'Lexical Resource rewards precision, range and collocation, not rare words.'),
      units: [
        {
          id: 'u7',
          title: B('同义替换与学术表达', 'Paraphrase and academic vocabulary'),
          goal: B('避免重复，用准确的词改写句子', 'Avoid repetition and rewrite with precise words'),
          cards: [
            {
              title: B('高频替换', 'Useful substitutions'),
              body: B(
                `<table><tr><th>基础词</th><th>替换</th></tr>
<tr><td>important</td><td>crucial, vital, essential, significant</td></tr>
<tr><td>problem</td><td>issue, challenge, concern, drawback</td></tr>
<tr><td>increase</td><td>rise, grow, climb, surge（大幅）</td></tr>
<tr><td>many people</td><td>a large proportion of people, a growing number of people</td></tr>
<tr><td>think</td><td>argue, maintain, hold the view that</td></tr>
<tr><td>good / bad</td><td>beneficial / detrimental</td></tr></table>`,
                `<table><tr><th>Basic</th><th>Alternatives</th></tr>
<tr><td>important</td><td>crucial, vital, essential, significant</td></tr>
<tr><td>problem</td><td>issue, challenge, concern, drawback</td></tr>
<tr><td>increase</td><td>rise, grow, climb, surge (sharp)</td></tr>
<tr><td>many people</td><td>a large proportion of people, a growing number of people</td></tr>
<tr><td>think</td><td>argue, maintain, hold the view that</td></tr>
<tr><td>good / bad</td><td>beneficial / detrimental</td></tr></table>`,
              ),
            },
            {
              title: B('名词化让表达更学术', 'Nominalisation'),
              body: B(
                `<p><i>because people use cars more and more</i> → <i>due to <b>the growing reliance on</b> private cars</i></p><p class="tip"><b>准确比高级更重要</b>。用错的「高级词」比用对的简单词更扣分，不确定的词宁可不用。</p>`,
                `<p><i>because people use cars more and more</i> → <i>due to <b>the growing reliance on</b> private cars</i></p><p class="tip"><b>Precise beats fancy.</b> A misused "advanced" word costs more than a correct simple one. If unsure, don't.</p>`,
              ),
            },
            {
              kind: 'check',
              title: B('小测', 'Quick check'),
              prompt: B('改写：<i>A lot of people think the internet is very good for students.</i>', 'Rewrite: <i>A lot of people think the internet is very good for students.</i>'),
              answer: 'Many people believe that the internet is highly beneficial for students.',
            },
          ],
          exercise: {
            kind: 'rewrite',
            type: 'sentence',
            instruction: B('用更准确、更学术的表达改写下面的句子（意思不变），每句单独一行。', 'Rewrite each sentence in more precise, academic English (same meaning). One per line.'),
            gen: '出 3 句用词非常基础、有重复的英文句子（如大量使用 good, bad, very, a lot of, think, important），雅思话题相关。题目用编号列出。reference 给出 1-2 种高质量改写。',
            focus: '改写后是否保持原意、词汇是否准确地道、搭配是否正确、是否过度堆砌生僻词',
          },
        },
        {
          id: 'u8',
          title: B('告别中式英语', 'Beyond Chinglish'),
          goal: B('掌握常见搭配，写出母语者会说的句子', 'Use natural collocations native writers actually use'),
          cards: [
            {
              kind: 'compare',
              title: B('高频中式英语', 'Frequent Chinglish'),
              rows: [
                ['learn knowledge', 'acquire / gain knowledge', B('动宾搭配', 'verb + noun collocation')],
                ["improve people's living standard", 'raise living standards', B('固定搭配', 'fixed collocation')],
                ["people's life", "people's lives", B('复数', 'plural')],
                ['make them to work', 'make them work', B('make sb do', 'make sb do')],
                ['In my opinion, I think …', 'In my opinion, … / I believe …', B('重复', 'redundant')],
                ['solve the pressure', 'relieve / reduce pressure', B('动宾搭配', 'verb + noun collocation')],
              ],
            },
            {
              title: B('从「字对字」到「意对意」', 'Translate meaning, not words'),
              body: B(
                `<p>翻译时先想「英文里描述这件事通常用什么动词」，而不是逐字翻译。动词 + 名词的<b>搭配（collocation）</b>是关键。</p><p class="tip">「With the development of …」这种万能开头考官看过无数次，信息量为零，尽量避免。</p>`,
                `<p>Ask "which verb do English writers use for this?" instead of translating word by word. <b>Verb + noun collocations</b> are the key.</p><p class="tip">"With the development of…" is an examiner's least favourite opener: it says nothing. Be specific instead.</p>`,
              ),
            },
            {
              kind: 'check',
              title: B('小测', 'Quick check'),
              prompt: B('翻译：「运动可以缓解学习压力。」', 'Translate: "运动可以缓解学习压力。" (Exercise can relieve academic pressure.)'),
              answer: 'Exercise can relieve academic stress.',
            },
          ],
          exercise: {
            kind: 'translate',
            type: 'sentence',
            instruction: B('把中文句子翻译成地道的英文（不要逐字翻译），每句单独一行。', 'Translate into natural English (not word for word). One sentence per line.'),
            gen: '出 3 句中文句子，每句都包含一个中国学生容易逐字直译成中式英语的表达（如「学习知识」「提高生活水平」「缓解压力」「随着社会的发展」等），雅思话题相关。题目用编号列出。reference 给出地道译文，并指出容易犯的中式表达。',
            focus: '是否有中式英语、搭配是否地道、语法是否正确',
          },
        },
      ],
    },
    {
      title: B('Task 2 段落写作', 'Task 2 paragraphs'),
      desc: B('一段一段地练：开头、主体、结尾。', 'Build an essay one paragraph at a time.'),
      units: [
        {
          id: 'u9',
          title: B('审题与开头段', 'Question types and introductions'),
          goal: B('看懂题型，写出改写题目 + 明确立场的开头', 'Identify the question type; paraphrase and state your position'),
          cards: [
            {
              title: B('五大题型', 'Five question types'),
              body: B(
                `<table><tr><th>题型</th><th>题目特征</th><th>开头要表明</th></tr>
<tr><td>观点类</td><td>To what extent do you agree?</td><td>明确立场</td></tr>
<tr><td>讨论类</td><td>Discuss both views and give your opinion.</td><td>两方观点 + 你的立场</td></tr>
<tr><td>利弊类</td><td>Do the advantages outweigh the disadvantages?</td><td>利大还是弊大</td></tr>
<tr><td>问题解决类</td><td>What are the causes? What solutions?</td><td>将讨论原因和对策</td></tr>
<tr><td>双问题类</td><td>Why…? Is this positive or negative?</td><td>分别回应两个问题</td></tr></table>`,
                `<table><tr><th>Type</th><th>Typical wording</th><th>Your intro must show</th></tr>
<tr><td>Opinion</td><td>To what extent do you agree?</td><td>a clear position</td></tr>
<tr><td>Discussion</td><td>Discuss both views and give your opinion.</td><td>both views + your view</td></tr>
<tr><td>Advantages</td><td>Do the advantages outweigh the disadvantages?</td><td>which side wins</td></tr>
<tr><td>Problem / solution</td><td>What are the causes? What solutions?</td><td>that you'll cover both</td></tr>
<tr><td>Two-part</td><td>Why…? Is this positive or negative?</td><td>an answer to each part</td></tr></table>`,
              ),
            },
            {
              title: B('开头段 = 改写题目 + 中心论点', 'Intro = paraphrase + thesis'),
              body: B(
                `<p>2-3 句，40-60 词。</p><p><b>题目</b>：Some people believe that university students should pay all the cost of their studies. To what extent do you agree?</p>
<p><b>开头</b>：<i>It is sometimes argued that tertiary students should be fully responsible for funding their own education. While I accept that students benefit personally from a degree, I largely disagree with this view because higher education also serves the wider society.</i></p>
<p class="tip">不要背「Nowadays, there is a heated debate about…」这种空话。改写题目时换词、换句子结构，不要照抄。</p>`,
                `<p>Two or three sentences, 40-60 words.</p><p><b>Question</b>: Some people believe that university students should pay all the cost of their studies. To what extent do you agree?</p>
<p><b>Introduction</b>: <i>It is sometimes argued that tertiary students should be fully responsible for funding their own education. While I accept that students benefit personally from a degree, I largely disagree with this view because higher education also serves the wider society.</i></p>
<p class="tip">Skip memorised filler like "Nowadays, there is a heated debate about…". Paraphrase by changing both words and structure.</p>`,
              ),
            },
          ],
          exercise: {
            kind: 'paragraph',
            type: 'paragraph',
            task: 'task2',
            instruction: B('阅读题目，写一个开头段（2-3 句，40-60 词）：改写题目 + 表明立场。', 'Write an introduction (2-3 sentences, 40-60 words): paraphrase the question and state your position.'),
            gen: '出一道真实风格的雅思 Task 2 题目（随机选择五大题型之一），话题随机。hint 说明这是什么题型以及开头段需要表明什么。reference 给出一个高分开头段范文。',
            focus: '是否正确识别题型、改写是否充分（未照抄题目）、立场是否清晰、语言准确性',
            minWords: 35,
          },
        },
        {
          id: 'u10',
          title: B('主体段：PEEL 结构', 'Body paragraphs: PEEL'),
          goal: B('写出观点清晰、论证充分的主体段', 'Write focused, well-developed body paragraphs'),
          cards: [
            {
              title: B('PEEL 四步', 'The four moves'),
              body: B(
                `<ul><li><b>P</b>oint 主题句：这段的中心观点（一句话）</li><li><b>E</b>xplain 解释：为什么？展开逻辑（1-2 句）</li><li><b>E</b>xample 例子：具体例子或假设场景（1-2 句）</li><li><b>L</b>ink 回扣：总结本段，回到立场（可选）</li></ul>`,
                `<ul><li><b>P</b>oint: the paragraph's single main idea</li><li><b>E</b>xplain: why? develop the logic (1-2 sentences)</li><li><b>E</b>xample: a concrete case or scenario (1-2 sentences)</li><li><b>L</b>ink: tie back to your position (optional)</li></ul>`,
              ),
            },
            {
              title: B('示例', 'Model paragraph'),
              body: B(
                `<p><i><b>[P]</b> The main reason why governments should help fund university education is that society as a whole benefits from a highly educated workforce. <b>[E]</b> Graduates in fields such as medicine and engineering provide essential services, and their skills drive economic growth. <b>[E]</b> For example, many of the doctors who staff public hospitals were trained at subsidised universities. <b>[L]</b> Therefore, it would be unfair to treat higher education as a purely private benefit.</i></p>
<p class="tip">每段只讲<b>一个</b>中心观点，4-6 句、80-120 词。最常见的问题是「观点多但都没展开」，考官更看重展开深度。</p>`,
                `<p><i><b>[P]</b> The main reason why governments should help fund university education is that society as a whole benefits from a highly educated workforce. <b>[E]</b> Graduates in fields such as medicine and engineering provide essential services, and their skills drive economic growth. <b>[E]</b> For example, many of the doctors who staff public hospitals were trained at subsidised universities. <b>[L]</b> Therefore, it would be unfair to treat higher education as a purely private benefit.</i></p>
<p class="tip">One idea per paragraph, 4-6 sentences, 80-120 words. The classic weakness is "many ideas, none developed"; depth scores higher than breadth.</p>`,
              ),
            },
          ],
          exercise: {
            kind: 'paragraph',
            type: 'paragraph',
            task: 'task2',
            instruction: B('根据题目和提示中的观点，用 PEEL 结构写一个主体段（80-120 词）。', 'Using the idea in the hint, write one PEEL body paragraph (80-120 words).'),
            gen: '出一道雅思 Task 2 题目，并在 hint 中给出一个可以写成主体段的分论点（学生需要围绕这个观点写一段）。reference 给出一个 PEEL 结构的高分主体段范文。',
            focus: '主题句是否明确、解释是否有逻辑、例子是否具体相关、段落是否只围绕一个中心、衔接是否自然',
            minWords: 70,
          },
        },
        {
          id: 'u11',
          title: B('结尾段', 'Conclusions'),
          goal: B('简洁有力地收尾，不引入新观点', 'Close cleanly without new ideas'),
          cards: [
            {
              title: B('结尾段 = 重申立场 + 概括理由', 'Conclusion = restated position + summary'),
              body: B(
                `<ul><li>用 <i>In conclusion, / To conclude, / Overall,</i> 开头</li><li>换一种说法重申立场（不要照抄开头段）</li><li>一句话概括主体段的核心理由</li><li><b>不要</b>引入新观点或新例子</li></ul>
<p><i>In conclusion, although graduates do gain personal advantages from their degrees, I believe the cost of university should not fall entirely on students, since a well-educated population benefits the whole of society.</i></p>`,
                `<ul><li>Open with <i>In conclusion, / To conclude, / Overall,</i></li><li>Restate your position in new words</li><li>Summarise the main reasons in one sentence</li><li><b>No</b> new ideas or examples</li></ul>
<p><i>In conclusion, although graduates do gain personal advantages from their degrees, I believe the cost of university should not fall entirely on students, since a well-educated population benefits the whole of society.</i></p>`,
              ),
            },
            {
              title: B('立场一致', 'Stay consistent'),
              body: B('<p class="tip">观点类题目里，开头和结尾的立场必须一致。写着写着改了立场，会直接拉低 Task Response。</p>', '<p class="tip">In opinion essays, your intro and conclusion must agree. Drifting positions pull Task Response down.</p>'),
            },
          ],
          exercise: {
            kind: 'paragraph',
            type: 'paragraph',
            task: 'task2',
            instruction: B('根据题目和提示中的大纲，写一个结尾段（2-3 句，40-60 词）。', 'Using the outline in the hint, write a conclusion (2-3 sentences, 40-60 words).'),
            gen: '出一道雅思 Task 2 题目，并在 hint 中给出一篇文章的简要大纲（立场 + 两个主体段的分论点），学生据此写结尾段。reference 给出高分结尾段范文。',
            focus: '是否重申了与大纲一致的立场、是否概括了主要理由、是否引入了新观点、语言准确性',
            minWords: 30,
          },
        },
      ],
    },
    {
      title: B('完整作文', 'Full essays'),
      desc: B('按考试要求写完整作文，按四项评分标准打分。', 'Write under exam conditions and get scored on all four criteria.'),
      units: [
        {
          id: 'u12',
          title: B('Task 2 完整作文', 'Task 2: the full essay'),
          goal: B('40 分钟内写出 250 词以上、结构完整的议论文', 'A complete 250+ word argument in 40 minutes'),
          cards: [
            {
              title: B('结构与时间', 'Structure and timing'),
              body: B(
                `<ul><li>4-5 段：开头 → 主体段 ×2（或 ×3）→ 结尾，<b>250 词以上</b></li><li><b>5 分钟</b>审题列提纲 → <b>30 分钟</b>写作 → <b>5 分钟</b>检查</li></ul>`,
                `<ul><li>4-5 paragraphs: intro → 2 (or 3) body paragraphs → conclusion, <b>250+ words</b></li><li><b>5 min</b> plan → <b>30 min</b> write → <b>5 min</b> check</li></ul>`,
              ),
            },
            {
              title: B('四项评分标准（各占 25%）', 'Four criteria (25% each)'),
              body: B(
                `<table><tr><th>评分项</th><th>6 分 → 7 分的关键</th></tr>
<tr><td>Task Response</td><td>观点要「展开」而不只是「列出」，全文立场一致</td></tr>
<tr><td>Coherence & Cohesion</td><td>每段一个中心；连接自然不机械；指代清楚</td></tr>
<tr><td>Lexical Resource</td><td>使用不常见词汇且基本准确，有搭配意识</td></tr>
<tr><td>Grammatical Range & Accuracy</td><td>多种复杂句，且<b>大多数句子没有错误</b></td></tr></table>`,
                `<table><tr><th>Criterion</th><th>From 6 to 7</th></tr>
<tr><td>Task Response</td><td>develop ideas, don't just list them; keep one position throughout</td></tr>
<tr><td>Coherence & Cohesion</td><td>one idea per paragraph; natural linking; clear reference</td></tr>
<tr><td>Lexical Resource</td><td>less common vocabulary used with good control and collocation</td></tr>
<tr><td>Grammatical Range & Accuracy</td><td>a variety of complex structures, <b>most sentences error-free</b></td></tr></table>`,
              ),
            },
            {
              title: B('交卷前检查清单', 'Final checklist'),
              body: B(
                '<p>☐ 每句有谓语动词 ☐ 主谓一致 ☐ 名词单复数和冠词 ☐ 没有逗号连句 ☐ 立场前后一致 ☐ 字数 ≥ 250</p><p class="tip">也可以点「用自己的题目」，练习真题集里的题。</p>',
                '<p>☐ every sentence has a verb ☐ agreement ☐ articles and plurals ☐ no comma splices ☐ consistent position ☐ 250+ words</p><p class="tip">Use "My own question" to practise past papers.</p>',
              ),
            },
          ],
          exercise: {
            kind: 'essay',
            type: 'essay',
            task: 'task2',
            instruction: B('40 分钟内完成这篇 Task 2 作文，不少于 250 词。', 'Write this Task 2 essay in 40 minutes, at least 250 words.'),
            gen: '出一道真实风格的雅思 Task 2 题目（随机题型和话题，难度与真题一致）。hint 简要说明题型和审题要点（不要给出完整思路）。reference 留空字符串。',
            focus: '按雅思 Task 2 官方四项评分标准全面评估',
            minWords: 250,
            timeLimit: 40,
          },
        },
        {
          id: 'u13',
          title: B('Task 1：概述与数据描述', 'Task 1: overview and data language'),
          goal: B('写出清晰的 Overview，用准确的趋势词描述数据', 'Write a clear overview and describe data precisely'),
          cards: [
            {
              title: B('Task 1 结构', 'Task 1 structure'),
              body: B(
                `<ol><li><b>开头</b>：改写题目（1 句）</li><li><b>Overview</b>：2 个最主要的特征，<b>不写具体数字</b>。没有 Overview 很难超过 5 分</li><li><b>细节段 ×2</b>：分组描述关键数据，有比较</li></ol><p class="tip">只描述数据，<b>不要</b>推测原因或发表观点。</p>`,
                `<ol><li><b>Introduction</b>: paraphrase the task (1 sentence)</li><li><b>Overview</b>: the 2 main features, <b>no specific numbers</b>. Without it, Band 5 is the ceiling</li><li><b>Two detail paragraphs</b>: grouped data with comparisons</li></ol><p class="tip">Describe only. <b>No</b> causes, no opinions.</p>`,
              ),
            },
            {
              title: B('趋势与比较', 'Trend and comparison language'),
              body: B(
                `<table><tr><th>上升</th><td>rise, increase, climb, surge, peak at</td></tr><tr><th>下降</th><td>fall, decline, drop, plunge, hit a low of</td></tr><tr><th>平稳/波动</th><td>remain stable, level off, plateau, fluctuate</td></tr><tr><th>程度</th><td>dramatically, sharply, steadily, gradually, slightly</td></tr></table>
<p><i>X was twice as high as Y.</i> / <i>X accounted for 30% of the total.</i> / <i>The figure for X was considerably higher than that for Y.</i></p>`,
                `<table><tr><th>Up</th><td>rise, increase, climb, surge, peak at</td></tr><tr><th>Down</th><td>fall, decline, drop, plunge, hit a low of</td></tr><tr><th>Flat / mixed</th><td>remain stable, level off, plateau, fluctuate</td></tr><tr><th>Degree</th><td>dramatically, sharply, steadily, gradually, slightly</td></tr></table>
<p><i>X was twice as high as Y.</i> / <i>X accounted for 30% of the total.</i> / <i>The figure for X was considerably higher than that for Y.</i></p>`,
              ),
            },
          ],
          exercise: {
            kind: 'paragraph',
            type: 'paragraph',
            task: 'task1',
            instruction: B('根据题目中的数据，写出 Task 1 的开头句 + Overview（3-4 句，50-80 词）。', 'From the data, write the Task 1 introduction + overview (3-4 sentences, 50-80 words).'),
            gen: '出一道雅思 Task 1 图表题（线图、柱状图、饼图或表格之一）。因为无法显示图片，在 prompt 中先用一句英文题目描述（如 "The table below shows ..."），然后用 Markdown 表格给出完整数据（4-6 行、3-5 列，数据有明显趋势或对比）。hint 提示该图的主要特征该从哪里找。reference 给出高分的开头 + Overview 范文。',
            focus: '开头是否改写题目、Overview 是否抓住最主要特征且没有罗列数字、趋势词是否准确、时态是否正确',
            minWords: 40,
          },
        },
        {
          id: 'u14',
          title: B('Task 1 完整作文', 'Task 1: the full report'),
          goal: B('20 分钟内完成 150 词以上的小作文', 'A complete 150+ word report in 20 minutes'),
          cards: [
            {
              title: B('写作步骤', 'Process'),
              body: B(
                `<ol><li><b>2 分钟</b>：看图表类型、时间（决定时态）、单位</li><li><b>3 分钟</b>：找出 2 个最主要特征，把数据分成 2 组</li><li><b>13 分钟</b>：写作</li><li><b>2 分钟</b>：检查数字、时态、单位</li></ol>`,
                `<ol><li><b>2 min</b>: chart type, time frame (tense), units</li><li><b>3 min</b>: find the 2 key features; split data into 2 groups</li><li><b>13 min</b>: write</li><li><b>2 min</b>: check numbers, tense, units</li></ol>`,
              ),
            },
            {
              title: B('细节段：分组 + 比较', 'Detail paragraphs: group and compare'),
              body: B(
                `<p>不要逐个罗列数据：</p><p><i>In 2000, Japan had the highest proportion of elderly people at 17%, roughly double the figure for the USA. Over the following two decades, this percentage climbed steadily in all three countries…</i></p><p class="tip">Task 1 的第一项评分是 Task Achievement：是否准确概括并比较了关键信息。</p>`,
                `<p>Don't list numbers one by one:</p><p><i>In 2000, Japan had the highest proportion of elderly people at 17%, roughly double the figure for the USA. Over the following two decades, this percentage climbed steadily in all three countries…</i></p><p class="tip">Task 1 is scored on Task Achievement: did you summarise and compare the key information accurately?</p>`,
              ),
            },
          ],
          exercise: {
            kind: 'essay',
            type: 'essay',
            task: 'task1',
            instruction: B('20 分钟内完成这篇 Task 1 作文，不少于 150 词。', 'Write this Task 1 report in 20 minutes, at least 150 words.'),
            gen: '出一道雅思 Task 1 图表题（线图、柱状图、饼图或表格之一）。因为无法显示图片，在 prompt 中先给出英文题目（如 "The chart below shows ... Summarise the information by selecting and reporting the main features, and make comparisons where relevant."），然后用 Markdown 表格给出完整数据（4-6 行、3-5 列）。hint 提示审题要点。reference 留空字符串。',
            focus: '按雅思 Task 1 官方四项评分标准全面评估（Task Achievement 而非 Task Response）',
            minWords: 150,
            timeLimit: 20,
          },
        },
      ],
    },
  ],
});
