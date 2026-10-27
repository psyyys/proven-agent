// 学术写作轨道：通用的英文学术写作能力，每个单元标注对雅思哪一项评分有帮助（helps）
(window.TRACKS = window.TRACKS || []).push({
  id: 'academic',
  icon: '🎓',
  title: B('学术写作', 'Academic Writing'),
  desc: B('不只为了考试：学会真正的英文学术写作。每个单元都标注了它能提升的雅思评分项。', 'Beyond the exam: real academic English. Each unit shows which IELTS criteria it strengthens.'),
  stages: [
    {
      title: B('学术语体', 'Academic style'),
      desc: B('学术英语的「声音」：正式、精确、克制。', 'The academic voice: formal, precise, measured.'),
      units: [
        {
          id: 'a1',
          helps: ['LR', 'GRA'],
          title: B('正式语体', 'Formal register'),
          goal: B('把口语化表达改成学术书面语', 'Turn conversational English into academic prose'),
          cards: [
            {
              title: B('学术语体的四个习惯', 'Four habits of academic register'),
              body: B(
                `<ul><li><b>不用缩写</b>：don't → do not, it's → it is</li>
<li><b>短语动词换成单个动词</b>：look into → investigate, cut down → reduce, go up → increase</li>
<li><b>避免模糊词</b>：thing, stuff, a lot of, really, nice, get</li>
<li><b>少用 you / I</b>：用 <i>people, individuals, this essay</i> 或被动语态</li></ul>`,
                `<ul><li><b>No contractions</b>: don't → do not, it's → it is</li>
<li><b>Single verbs over phrasal verbs</b>: look into → investigate, cut down → reduce, go up → increase</li>
<li><b>Avoid vague words</b>: thing, stuff, a lot of, really, nice, get</li>
<li><b>Limit "you" / "I"</b>: prefer <i>people, individuals, this essay</i>, or the passive</li></ul>`,
              ),
            },
            {
              kind: 'compare',
              title: B('口语 → 学术', 'Spoken → academic'),
              rows: [
                ["You can't really fix pollution by yourself.", 'Individuals cannot solve pollution alone.', B('去掉 you、can\'t、really', 'no "you", contraction or "really"')],
                ['Scientists are looking into the problem.', 'Scientists are investigating the problem.', B('短语动词 → 单个动词', 'phrasal verb → single verb')],
                ['Prices went up a lot.', 'Prices rose considerably.', B('精确的动词和副词', 'precise verb and adverb')],
              ],
            },
            {
              kind: 'check',
              title: B('小测', 'Quick check'),
              prompt: B('改写成学术语体：<i>Lots of kids get stuff online that isn\'t good for them.</i>', 'Make it academic: <i>Lots of kids get stuff online that isn\'t good for them.</i>'),
              answer: 'Many children are exposed to harmful content online.',
            },
          ],
          exercise: {
            kind: 'rewrite',
            type: 'sentence',
            instruction: B('把下面的口语化句子改写成正式的学术英语，每句单独一行。', 'Rewrite each informal sentence in formal academic English. One per line.'),
            gen: '出 4 句非常口语化的英文句子（含缩写、短语动词、you、thing/stuff/a lot of/really 等），话题为教育、社会、科技、环境。题目用编号列出。reference 给出学术化改写。',
            focus: '是否去除了口语特征（缩写、短语动词、模糊词、第二人称）、意思是否保持、用词是否准确自然，不要为了正式而写得生硬',
          },
        },
        {
          id: 'a2',
          helps: ['LR', 'CC'],
          title: B('名词化与简洁', 'Nominalisation and concision'),
          goal: B('用更少的词表达更多信息', 'Say more with fewer words'),
          cards: [
            {
              title: B('名词化', 'Nominalisation'),
              body: B(
                `<p>把动词、形容词变成名词，句子更紧凑、更学术：</p><p><i>Because the population <u>grew quickly</u>, cities <u>expanded</u>.</i><br>→ <i><u>Rapid population growth</u> led to <u>urban expansion</u>.</i></p>`,
                `<p>Turning verbs and adjectives into nouns makes sentences denser and more academic:</p><p><i>Because the population <u>grew quickly</u>, cities <u>expanded</u>.</i><br>→ <i><u>Rapid population growth</u> led to <u>urban expansion</u>.</i></p>`,
              ),
            },
            {
              kind: 'compare',
              title: B('删掉冗余', 'Cut the padding'),
              rows: [
                ['due to the fact that', 'because', B('', '')],
                ['in order to', 'to', B('', '')],
                ['at this point in time', 'now / currently', B('', '')],
                ['It is important to note that X is …', 'X is …', B('多数时候可以直接删', 'usually removable')],
                ['completely eliminate / past history', 'eliminate / history', B('重复修饰', 'redundant modifier')],
              ],
            },
            {
              title: B('但别过度', 'But don\'t overdo it'),
              body: B('<p class="tip">名词化过多会让句子难读。目标是<b>清楚 + 紧凑</b>，不是堆名词。</p>', '<p class="tip">Too many nouns make prose heavy. Aim for <b>clear and compact</b>, not a pile of nouns.</p>'),
            },
          ],
          exercise: {
            kind: 'shrink',
            type: 'sentence',
            instruction: B('精简下面的句子：保留意思，尽量用更少的词（可以用名词化），每句单独一行。', 'Shrink each sentence: keep the meaning, use fewer words (nominalise where useful). One per line.'),
            gen: '出 3 句冗长啰嗦的英文句子（每句 25-40 词，含 due to the fact that / in order to / it is important to note that 等冗余表达，以及可以名词化的结构），学术话题。每句后用括号标注原词数和目标词数上限（约为原来的 60%）。题目用编号列出。reference 给出精简版本。',
            focus: '是否保留了全部关键信息、是否达到目标词数、名词化是否自然、语法是否正确',
          },
        },
        {
          id: 'a3',
          helps: ['TR', 'LR'],
          title: B('语气缓和与强调', 'Hedging and boosting'),
          goal: B('学会谨慎地表达观点，让论证更可信', 'Make claims with the right level of certainty'),
          cards: [
            {
              title: B('为什么要 hedge', 'Why hedge'),
              body: B(
                `<p>学术写作很少说绝对的话。<i>Social media <s>causes</s> depression.</i> 太绝对，一个反例就能推翻。<br><i>Social media <u>may contribute to</u> depression <u>in some young people</u>.</i> 更准确，也更可信。</p>`,
                `<p>Academic writing rarely makes absolute claims. <i>Social media <s>causes</s> depression.</i> One counter-example breaks it.<br><i>Social media <u>may contribute to</u> depression <u>in some young people</u>.</i> More accurate, more credible.</p>`,
              ),
            },
            {
              title: B('工具箱', 'Toolkit'),
              body: B(
                `<table><tr><th>情态动词</th><td>may, might, could, can</td></tr><tr><th>动词</th><td>suggest, appear to, tend to, indicate</td></tr><tr><th>副词</th><td>arguably, possibly, generally, largely</td></tr><tr><th>限定范围</th><td>in many cases, to some extent, for most people</td></tr><tr><th>强调（有把握时）</th><td>clearly, undoubtedly, it is evident that</td></tr></table>
<p class="tip">雅思里写「all / always / never / everyone」很容易被判逻辑不严谨。</p>`,
                `<table><tr><th>Modals</th><td>may, might, could, can</td></tr><tr><th>Verbs</th><td>suggest, appear to, tend to, indicate</td></tr><tr><th>Adverbs</th><td>arguably, possibly, generally, largely</td></tr><tr><th>Scope</th><td>in many cases, to some extent, for most people</td></tr><tr><th>Boosters (when sure)</th><td>clearly, undoubtedly, it is evident that</td></tr></table>
<p class="tip">In IELTS, "all / always / never / everyone" often reads as weak reasoning.</p>`,
              ),
            },
            {
              kind: 'check',
              title: B('小测', 'Quick check'),
              prompt: B('缓和语气：<i>Online learning is worse than classroom learning.</i>', 'Hedge it: <i>Online learning is worse than classroom learning.</i>'),
              answer: 'Online learning may be less effective than classroom learning for some students.',
            },
          ],
          exercise: {
            kind: 'hedge',
            type: 'sentence',
            instruction: B('把下面过于绝对的说法改写成谨慎、学术的说法，每句单独一行。', 'Rewrite each overconfident claim as a careful academic one. One per line.'),
            gen: '出 4 句过于绝对的英文论断（含 always/never/all/everyone/causes/proves 等），雅思常见话题。题目用编号列出。reference 给出恰当缓和后的版本，并说明用了什么手段。',
            focus: '缓和是否恰当（不过度也不不足）、手段是否多样（情态动词、动词、副词、限定范围）、意思是否保持、语法是否正确',
          },
        },
      ],
    },
    {
      title: B('构建论证', 'Building an argument'),
      desc: B('论点、段落、证据、反驳：学术论证的四块积木。', 'Thesis, paragraph, evidence, rebuttal: the four building blocks.'),
      units: [
        {
          id: 'a4',
          helps: ['TR'],
          title: B('论点句', 'Thesis statements'),
          goal: B('写出可争辩、具体、有方向的论点句', 'Write arguable, specific thesis statements with a roadmap'),
          cards: [
            {
              title: B('好的论点句', 'A strong thesis is…'),
              body: B(
                `<ul><li><b>可争辩</b>：有人会不同意（不是事实陈述）</li><li><b>具体</b>：说清楚立场和范围</li><li><b>有方向</b>：暗示文章将从哪几个方面论证</li></ul>`,
                `<ul><li><b>Arguable</b>: someone could disagree (not a fact)</li><li><b>Specific</b>: clear position and scope</li><li><b>Directional</b>: signals the lines of argument</li></ul>`,
              ),
            },
            {
              kind: 'compare',
              title: B('弱 → 强', 'Weak → strong'),
              rows: [
                ['Technology has advantages and disadvantages.', 'Although technology can isolate people, its benefits for education and healthcare outweigh this cost.', B('立场明确 + 两条理由', 'clear position + two reasons')],
                ['This essay will talk about pollution.', 'Governments, rather than individuals, should bear primary responsibility for reducing air pollution.', B('从话题变成主张', 'topic → claim')],
              ],
            },
            {
              kind: 'check',
              title: B('小测', 'Quick check'),
              prompt: B('为话题写一个论点句：<i>Should homework be banned in primary schools?</i>', 'Write a thesis for: <i>Should homework be banned in primary schools?</i>'),
              answer: 'Homework should be limited rather than banned in primary schools, as short tasks build routine without taking away time for play and family.',
            },
          ],
          exercise: {
            kind: 'thesis',
            type: 'sentence',
            instruction: B('为每个话题写一个论点句（1-2 句），每个话题单独一行。', 'Write a thesis statement (1-2 sentences) for each topic. One per line.'),
            gen: '出 3 个可以展开讨论的话题（用英文问题形式，教育、科技、社会、环境各不相同）。题目用编号列出。reference 为每个话题给出一个高质量论点句示例。',
            focus: '论点是否可争辩、是否具体、是否预示论证方向、语言是否准确简洁',
          },
        },
        {
          id: 'a5',
          helps: ['CC', 'TR'],
          title: B('主题句与段落统一', 'Topic sentences and unity'),
          goal: B('让每一句都服务于段落的中心', 'Make every sentence serve the paragraph\'s point'),
          cards: [
            {
              title: B('段落 = 一个主张', 'One paragraph, one claim'),
              body: B(
                `<p>主题句给出段落的主张，后面每一句都要回答「这句如何支持主题句」。离题的句子，哪怕写得再好，也会削弱段落。</p>
<p>检查方法：只读每段第一句，能不能看出全文的论证脉络？</p>`,
                `<p>The topic sentence makes the paragraph's claim; every later sentence must answer "how does this support it?". A sentence that drifts, however well written, weakens the paragraph.</p>
<p>Test: read only the first sentence of each paragraph. Can you follow the whole argument?</p>`,
              ),
            },
            {
              title: B('主题句的写法', 'Shaping a topic sentence'),
              body: B(
                `<p><b>话题 + 观点</b>：<i>Public libraries <u>remain essential because they offer free access to knowledge</u>.</i></p><p class="tip">主题句太宽（Libraries are good）没有方向；太窄（Libraries open at 9 am）无法展开。</p>`,
                `<p><b>Topic + controlling idea</b>: <i>Public libraries <u>remain essential because they offer free access to knowledge</u>.</i></p><p class="tip">Too broad ("Libraries are good") gives no direction; too narrow ("Libraries open at 9 am") cannot be developed.</p>`,
              ),
            },
          ],
          exercise: {
            kind: 'continue',
            type: 'paragraph',
            instruction: B('根据给出的主题句，接着写完这一段（4-5 句，80-110 词），每一句都要支持主题句。', 'Continue the paragraph from the topic sentence (4-5 sentences, 80-110 words). Every sentence must support it.'),
            gen: '给出一个学术话题的段落主题句（英文，话题 + 观点明确，例如关于城市规划、教育、公共健康、科技伦理）。prompt 中只放这个主题句，并注明 "Continue this paragraph."。hint 提示可以从哪些角度展开。reference 给出一个高质量的完整段落。',
            focus: '是否紧扣主题句（段落统一性）、解释和例子是否充分、句间衔接是否自然、学术语体',
            minWords: 70,
          },
        },
        {
          id: 'a6',
          helps: ['TR', 'CC'],
          title: B('让步与反驳', 'Concession and rebuttal'),
          goal: B('承认对方观点，再说明为什么你的观点更有力', 'Acknowledge the other side, then show why yours is stronger'),
          cards: [
            {
              title: B('三步结构', 'Three moves'),
              body: B(
                `<ol><li><b>让步</b>：承认对方观点的合理之处 <i>Admittedly, … / It is true that …</i></li><li><b>转折</b>：<i>However, … / Nevertheless, …</i></li><li><b>反驳</b>：给出理由说明你的观点更有力</li></ol>`,
                `<ol><li><b>Concede</b>: grant what is reasonable <i>Admittedly, … / It is true that …</i></li><li><b>Turn</b>: <i>However, … / Nevertheless, …</i></li><li><b>Rebut</b>: give reasons why your view still holds</li></ol>`,
              ),
            },
            {
              title: B('示例', 'Example'),
              body: B(
                `<p><i>Admittedly, online courses lack the face-to-face interaction of a classroom. However, discussion forums and video seminars can recreate much of this contact, and the flexibility they offer allows working adults to study at all.</i></p><p class="tip">在雅思观点类、讨论类作文里，一段好的让步反驳能明显提升 Task Response：说明你考虑过不同观点。</p>`,
                `<p><i>Admittedly, online courses lack the face-to-face interaction of a classroom. However, discussion forums and video seminars can recreate much of this contact, and the flexibility they offer allows working adults to study at all.</i></p><p class="tip">In IELTS opinion and discussion essays, a good concession-rebuttal lifts Task Response: it shows you have weighed other views.</p>`,
              ),
            },
          ],
          exercise: {
            kind: 'paragraph',
            type: 'paragraph',
            instruction: B('针对给出的观点，写一段「让步 + 转折 + 反驳」（3-5 句，60-100 词）。', 'Respond to the claim with concession + turn + rebuttal (3-5 sentences, 60-100 words).'),
            gen: '给出一个有争议的英文观点（雅思常见话题），并在 prompt 中注明学生需要反驳它："Write a concession and rebuttal against this view."。hint 给出可以让步的点和可以反驳的方向。reference 给出一个高质量范例段落。',
            focus: '让步是否真诚合理、转折是否清晰、反驳是否有理由支撑而不是简单否定、逻辑与衔接',
            minWords: 50,
          },
        },
        {
          id: 'a7',
          helps: ['TR'],
          title: B('证据与解释', 'Evidence and commentary'),
          goal: B('举具体的例子，并解释它为什么能支持观点', 'Use specific evidence and explain why it matters'),
          cards: [
            {
              title: B('证据不会自己说话', 'Evidence doesn\'t speak for itself'),
              body: B(
                `<p>常见问题是举完例子就结束。好的段落会<b>解释证据的意义</b>：</p><p><i>For example, Finland gives pupils less homework than most OECD countries yet ranks highly in reading. <u>This suggests that</u> the amount of homework matters less than the quality of teaching.</i></p>`,
                `<p>A common weakness is stopping right after the example. Strong paragraphs <b>explain what the evidence shows</b>:</p><p><i>For example, Finland gives pupils less homework than most OECD countries yet ranks highly in reading. <u>This suggests that</u> the amount of homework matters less than the quality of teaching.</i></p>`,
              ),
            },
            {
              title: B('解释句式', 'Commentary phrases'),
              body: B(
                `<p><i>This suggests / indicates / demonstrates that …</i><br><i>This is significant because …</i><br><i>As a result, …</i></p><p class="tip">雅思考试里可以用合理的假设例子（<i>For instance, a student who…</i>），但要具体，不要编造精确的统计数字。</p>`,
                `<p><i>This suggests / indicates / demonstrates that …</i><br><i>This is significant because …</i><br><i>As a result, …</i></p><p class="tip">In IELTS, a realistic hypothetical (<i>For instance, a student who…</i>) is fine, but keep it concrete and don't invent precise statistics.</p>`,
              ),
            },
          ],
          exercise: {
            kind: 'paragraph',
            type: 'paragraph',
            instruction: B('为给出的观点写「证据 + 解释」（3-4 句，60-90 词）：一个具体的例子，再解释它说明了什么。', 'Support the claim with evidence + commentary (3-4 sentences, 60-90 words).'),
            gen: '给出一个英文学术观点句（雅思常见话题），prompt 中注明 "Support this claim with a specific example and explain its significance."。hint 提示可以用什么类型的例子。reference 给出范例。',
            focus: '例子是否具体相关、是否解释了例子的意义（commentary）、逻辑链是否完整、是否编造了不合理的数据',
            minWords: 45,
          },
        },
      ],
    },
    {
      title: B('行文与转述', 'Flow and sources'),
      desc: B('让文章读起来顺，并学会用自己的话转述别人的观点。', 'Make prose flow and restate ideas in your own words.'),
      units: [
        {
          id: 'a8',
          helps: ['CC'],
          title: B('衔接：已知到新知', 'Cohesion: given to new'),
          goal: B('让句子自然地接上，而不是靠堆连接词', 'Make sentences connect naturally, not through linker overload'),
          cards: [
            {
              title: B('已知信息在前，新信息在后', 'Given before new'),
              body: B(
                `<p>每句话的开头接住上一句的结尾，读者就不会迷路：</p><p><i>Many cities are introducing <u>congestion charges</u>. <u>These charges</u> reduce traffic, but <u>this reduction</u> often comes at a cost to low-income drivers.</i></p>`,
                `<p>Start each sentence with what the reader already knows, end with what is new:</p><p><i>Many cities are introducing <u>congestion charges</u>. <u>These charges</u> reduce traffic, but <u>this reduction</u> often comes at a cost to low-income drivers.</i></p>`,
              ),
            },
            {
              title: B('衔接手段', 'Cohesive devices beyond linkers'),
              body: B(
                `<ul><li><b>指代</b>：this, these, such, the former / the latter</li><li><b>概括名词</b>：this <u>trend</u>, this <u>approach</u>, such <u>measures</u></li><li><b>同义重复</b>：cars → vehicles → private transport</li></ul><p class="tip">雅思 CC 7 分要求「衔接手段使用得当，但有时过多或不足」，自然的指代比 Moreover 更高级。</p>`,
                `<ul><li><b>Reference</b>: this, these, such, the former / the latter</li><li><b>Summary nouns</b>: this <u>trend</u>, this <u>approach</u>, such <u>measures</u></li><li><b>Lexical chains</b>: cars → vehicles → private transport</li></ul><p class="tip">Natural reference and summary nouns signal Band 7+ cohesion far better than another "Moreover".</p>`,
              ),
            },
          ],
          exercise: {
            kind: 'rewrite',
            type: 'paragraph',
            instruction: B('改写这段不连贯的文字，让它读起来流畅（用指代、概括名词、已知到新知），不要只是加连接词。', 'Rewrite the choppy paragraph so it flows (reference, summary nouns, given→new), not just by adding linkers.'),
            gen: '写一段 5-6 句、话题明确但非常不连贯的英文段落（句子都是孤立的简单句，频繁重复同一名词，没有指代，信息顺序混乱），学术话题。prompt 中放这段文字。reference 给出改写后的流畅版本。',
            focus: '衔接是否自然（指代、概括名词、信息顺序），是否过度依赖连接词，原意是否保留，语法准确',
            minWords: 50,
          },
        },
        {
          id: 'a9',
          helps: ['LR', 'TR'],
          title: B('转述', 'Paraphrasing'),
          goal: B('换词 + 换结构，用自己的话说同一件事', 'Change words and structure to restate an idea'),
          cards: [
            {
              title: B('三种手段一起用', 'Combine three techniques'),
              body: B(
                `<ol><li><b>换词</b>：rise → increase, children → young people</li><li><b>换词性</b>：<i>grew rapidly</i> → <i>rapid growth</i></li><li><b>换结构</b>：主动 ↔ 被动、从句 ↔ 短语、调整信息顺序</li></ol>`,
                `<ol><li><b>Synonyms</b>: rise → increase, children → young people</li><li><b>Word class</b>: <i>grew rapidly</i> → <i>rapid growth</i></li><li><b>Structure</b>: active ↔ passive, clause ↔ phrase, reorder information</li></ol>`,
              ),
            },
            {
              kind: 'compare',
              title: B('示例', 'Example'),
              rows: [
                ['Original: Governments should spend more money on public transport.', 'Greater public investment in transport networks is needed.', B('三种手段都用上了', 'all three techniques')],
                ['Too close: Governments ought to spend more money on public transport.', '—', B('只换了一个词，不算转述', 'one synonym ≠ paraphrase')],
              ],
            },
            {
              title: B('在雅思里的用处', 'Why it matters in IELTS'),
              body: B('<p class="tip">Task 2 开头段、Task 1 开头句都要求改写题目。照抄题目原句的部分不计入字数。</p>', '<p class="tip">Both the Task 2 introduction and Task 1 opening require paraphrasing the question. Copied wording is not counted.</p>'),
            },
          ],
          exercise: {
            kind: 'rewrite',
            type: 'sentence',
            instruction: B('转述下面的句子（意思不变，同时换词和换结构），每句单独一行。', 'Paraphrase each sentence: same meaning, different words and structure. One per line.'),
            gen: '出 3 句学术风格的英文句子（可以是雅思题目句或学术观点句）。题目用编号列出。reference 给出高质量转述，并标注用了哪些手段。',
            focus: '意思是否准确保留、是否同时改变了词汇和结构（只换一两个词算不合格）、用词是否准确自然',
          },
        },
        {
          id: 'a10',
          helps: ['TR', 'CC'],
          title: B('概括与摘要', 'Summarising'),
          goal: B('抓住主旨，用很少的词概括一段文字', 'Capture the main point in very few words'),
          cards: [
            {
              title: B('摘要的步骤', 'How to summarise'),
              body: B(
                `<ol><li>读完问自己：作者<b>最想说的一句话</b>是什么？</li><li>找出支撑这句话的 1-2 个关键理由</li><li>删掉例子、数字细节、重复</li><li>用自己的话写出来（转述，不要摘抄）</li></ol>`,
                `<ol><li>Ask: what is the <b>one thing</b> the writer wants to say?</li><li>Find the 1-2 key supporting reasons</li><li>Drop examples, number details and repetition</li><li>Write it in your own words (paraphrase, don't copy)</li></ol>`,
              ),
            },
            {
              title: B('和雅思的关系', 'The IELTS link'),
              body: B('<p class="tip">Task 1 的 Overview 本质就是摘要：只写最主要的特征，不罗列数字。</p>', '<p class="tip">The Task 1 overview is a summary: main features only, no lists of numbers.</p>'),
            },
          ],
          exercise: {
            kind: 'summary',
            type: 'paragraph',
            instruction: B('用 40-60 个词概括下面这段文字的主旨。', 'Summarise the passage in 40-60 words.'),
            gen: '写一段 150-200 词的英文学术短文（话题如城市化、气候、教育、科技与就业），有清晰主旨、2-3 个支撑理由和一些例子细节。prompt 中放这段文字。reference 给出一个 50 词左右的高质量摘要。',
            focus: '是否抓住主旨和关键理由、是否删掉了细节、是否用自己的话（而非摘抄）、字数是否合适、语言准确',
            minWords: 35,
          },
        },
        {
          id: 'a11',
          helps: ['CC'],
          title: B('反向提纲与自我修改', 'Reverse outlining and self-editing'),
          goal: B('读懂好段落的结构，再用同样的眼光修改自己的文章', 'See the structure of good writing, then apply it to your own'),
          cards: [
            {
              title: B('什么是反向提纲', 'What is a reverse outline'),
              body: B(
                `<p>写完（或读完）一段后，用几个词写出<b>每一句在做什么</b>：</p><p>1. 主张：在线学习扩大了教育机会 → 2. 解释：不受地点限制 → 3. 例子：偏远地区学生 → 4. 意义：减少不平等</p><p>如果某句说不清在做什么，或者顺序不合理，就该改了。</p>`,
                `<p>After writing (or reading) a paragraph, note in a few words <b>what each sentence does</b>:</p><p>1. Claim: online learning widens access → 2. Reason: location no longer matters → 3. Example: rural students → 4. Significance: less inequality</p><p>If you can't say what a sentence does, or the order feels wrong, revise it.</p>`,
              ),
            },
            {
              title: B('考场上的自检', 'In the exam'),
              body: B('<p class="tip">最后 5 分钟检查时，快速对每段做一次反向提纲，能发现离题和逻辑跳跃。</p>', '<p class="tip">In your final 5 minutes, a quick reverse outline of each paragraph catches drift and logical gaps.</p>'),
            },
          ],
          exercise: {
            kind: 'outline',
            type: 'paragraph',
            instruction: B('阅读下面的段落，为每一句写出它的功能和要点（每句一行，如：1. Claim: …），最后一行写出你认为可以改进的地方。', 'Reverse-outline the paragraph: one line per sentence (e.g. 1. Claim: …), then one line on what could be improved.'),
            gen: '写一段 5-6 句的英文议论段落（雅思话题），结构基本清晰，但故意包含一处小的离题或逻辑跳跃。prompt 中放这段文字，句子前标上编号 (1)(2)...。reference 给出标准的反向提纲并指出那处问题。',
            focus: '是否准确识别每句的功能（主张/解释/例子/意义/过渡等）、是否发现了离题或逻辑跳跃、表达是否简洁准确',
            minWords: 30,
          },
        },
      ],
    },
  ],
});
