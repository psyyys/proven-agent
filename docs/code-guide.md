# 代码阅读指南

核心代码约 2200 行 Python。不用从头到尾读，按下面的顺序读，每一站都能独立看懂。

## 先看全貌：一次提问经过哪些代码

```
用户提问
  └─ service.py  start_run()                       创建一次运行
       └─ agent/orchestrator.py  run()              整个流程的入口（38 行起）
            ├─ _plan()      生成计划，等用户确认         ← Plan-and-Execute
            ├─ _execute()   ReAct 循环                 ← ReAct
            │    ├─ llm.py  chat()                     调模型，拿回工具调用
            │    └─ _dispatch()                        执行工具
            │         └─ tools/builtin.py
            │              ├─ run_python()  → sandbox/jupyter.py 运行代码   ← CodeAct
            │              ├─ search_knowledge() → rag/index.py 检索         ← RAG
            │              └─ record_finding() → findings.py 核对证据        ← 证据约束
            ├─ _review()    审核结论 → rules.py 领域规则 + 模型审核，错误退回一次  ← Reflection
            └─ _report()    写报告 → findings.py check_report() 核查数字      ← 程序化核验
```

## 范式与代码的对应

| 范式 | 一句话 | 去哪里看 |
|---|---|---|
| Plan-and-Execute | 先列计划给人确认，再执行 | `agent/orchestrator.py` → `_plan()` |
| ReAct | 思考 → 调工具 → 看结果，循环 | `agent/orchestrator.py` → `_execute()`、`_dispatch()` |
| Function Calling | 用 JSON Schema 描述工具，模型返回结构化调用 | `tools/registry.py` → `Tool.schema()`；`llm.py` → `chat()` |
| CodeAct | 模型的主要动作是写代码并运行 | `tools/builtin.py` → `run_python()`；`sandbox/jupyter.py` → `_run()` |
| Agentic RAG | 模型需要时自己调用检索 | `tools/builtin.py` → `search_knowledge()`；`rag/index.py` → `search()` |
| 证据约束 | 结论必须绑定证据，数字必须出现在证据里 | `tools/builtin.py` → `record_finding()`；`findings.py` → `unsupported_numbers()` |
| 程序化核验 | 程序检查报告里每个数字的来源 | `findings.py` → `check_report()`；`orchestrator.py` → `_report()` |
| Reflection | 另一个角色检查结论，有错退回重做 | `orchestrator.py` → `_review()`；`rules.py` → `evaluate()`；`agent/review.py` |

## 阅读顺序

### 第 0 站：先看它跑起来（10 分钟）

不需要 API Key。测试用"脚本模型"代替真模型，但内核、数据、核查都是真实运行的：

```powershell
pytest tests/test_agent_e2e.py -v
```

然后打开 `tests/test_agent_e2e.py`，看第一个测试 `test_full_run_with_rejected_finding_and_report_fix`。它用几行 `say(...)`、`tool(...)` 模拟了模型的每一步回复，包括一次故意登记错误数字、一次报告里编造数字。**读懂这个测试，就读懂了整个流程。**

### 第 1 站：Agent 的骨架（约 1 小时）

| 顺序 | 文件 | 重点看 | 想清楚的问题 |
|---|---|---|---|
| 1 | `proven/llm.py` | `ToolCall`、`LLMResponse`、`OpenAICompatibleChat.chat()` | 模型返回的工具调用长什么样？为什么不把 `reasoning` 发回给模型？ |
| 2 | `proven/tools/registry.py` | 全文（60 行） | 一个工具由哪几部分组成？`schema()` 发给模型的是什么？ |
| 3 | `proven/tools/builtin.py` | 文件末尾的 `builtin_tools()`，再看 `run_python()` | 工具的描述文字写给谁看？ |
| 4 | `proven/agent/orchestrator.py` | `run()` → `_plan()` → `_execute()` → `_dispatch()` | 循环什么时候结束？工具报错时发生了什么？ |

读完这一站，你就理解了一个完整的 ReAct Agent。

### 第 2 站：项目的特色——防编造（约 1 小时）

| 顺序 | 文件 | 重点看 | 想清楚的问题 |
|---|---|---|---|
| 5 | `proven/tools/builtin.py` | `record_finding()`、`_where_else()` | 登记一条结论时，程序检查了什么？什么情况会被拒？ |
| 6 | `proven/findings.py` | `extract_numbers()` → `matches()` → `unsupported_numbers()` → `check_report()` | 为什么 "23.4%" 能匹配 0.2341？为什么要跳过日期和"前 5 名"？ |
| 7 | `proven/agent/orchestrator.py` | `_report()` | 核查不通过时，程序怎么让模型重写？ |
| 8 | `tests/test_findings.py` | 全文 | 每个测试对应一个边界情况 |

### 第 2.5 站：多 Agent 模式（约 30 分钟）

| 顺序 | 文件 | 重点看 | 想清楚的问题 |
|---|---|---|---|
| 1 | `proven/agent/orchestrator.py` | `_react()`：单 Agent 和每个分析员共用的 ReAct 循环 | 循环在哪几种情况下结束？ |
| 2 | `proven/agent/orchestrator.py` | `_execute_multi()`、`_step_result()` | 分析员之间传递了什么，没传递什么？超出轮数时怎么处理？ |
| 3 | `proven/agent/prompts.py` | `ANALYST_ROLE`、`handoff()` | 交接单里有哪几部分？ |
| 4 | `proven/tools/builtin.py` | `submit_step()`、`_cell_result()` | 为什么没登记结论就不能标记"完成"？大输出存到哪里？ |
| 5 | `tests/test_multi_agent.py` | 第一个测试 | 测试怎么证明第二个分析员看不到第一个分析员的代码？ |

设计理由见 [multi-agent.md](multi-agent.md)。

### 第 2.6 站：审核员（约 40 分钟，规则部分是你的专业内容）

| 顺序 | 文件 | 重点看 | 想清楚的问题 |
|---|---|---|---|
| 1 | `proven/packs/water/rules.yaml` | 全文 | 每条规则拦的是什么错误？依据对不对？阈值你认同吗？ |
| 2 | `proven/rules.py` | `evaluate()`、`_values_after()`、`find_fact()` | 四种 check 分别怎么判断？"径流系数与干旱指数的相关系数为 -0.75"为什么不会误拦？ |
| 3 | `proven/agent/orchestrator.py` | `_review()`，以及 `_execute_multi()` 里调用它的部分 | 什么情况下退回？退回给谁？为什么只退回一次？ |
| 4 | `proven/agent/review.py`、`prompts.py` 的 `REVIEW` | 模型审核员看到了什么 | 为什么把规则已发现的问题也给它看？ |
| 5 | `proven/tools/builtin.py` | `record_finding()` 的 `replaces` 参数 | 被替换的结论去哪了？报告还能引用它吗？ |
| 6 | `proven/packs/water/evals/review_cases.yaml`、`proven/review_eval.py` | 陷阱测试 | 拦截率和误拦率分别怎么算？为什么 100% 还不能说明效果？ |
| 7 | `tests/test_review.py` | 第一个测试 | 一次"退回 → 更正 → 复审"在事件里是什么样子？ |

格式说明见 [domain-rules-template.md](domain-rules-template.md)。

### 第 3 站：能力层（按兴趣挑着看）

| 文件 | 内容 | 重点 |
|---|---|---|
| `proven/sandbox/jupyter.py` | 代码执行 | `_run()`：怎么收集输出、表格、图表和报错；超时怎么中断 |
| `proven/sandbox/base.py` | 执行结果 | `for_model()`：给模型看的输出怎么截断 |
| `proven/rag/parse.py` | 文档切块 | `chunk_sections()`：按句子切、带重叠 |
| `proven/rag/index.py` | 混合检索 | `search()`：BM25 和向量的排名怎么用 RRF 合并 |
| `proven/semantic.py` | 语义层 | `lookup()` 和 `summary()` |
| `proven/kit/water.py` | 水文函数 | `p3_fit()`、`p3_design_values()`，你的专业内容，可以检查公式对不对 |
| `proven/agent/prompts.py` | 全部提示词 | 改 Agent 的行为，多数时候改这里就够了 |

### 第 4 站：外围（不影响理解 Agent，可以跳过）

`service.py`（会话管理）、`api/app.py`（网页接口）、`cli.py`（命令行）、`evals.py`（评测）、`frontend/`（界面）。

前端的关键是 `frontend/src/lib/derive.ts`：后端推送的是一条条事件（`run.started`、`tool.call`、`cell.executed`……），`deriveRun()` 把事件序列转换成界面需要的状态（时间线条目、结论、报告、用量）。界面本身不保存分析状态，所以历史运行可以通过重放事件完整还原。

## 动手练习

读代码最快的办法是改一点东西，看测试有什么变化。

1. **改提示词**：在 `agent/prompts.py` 的 `SYSTEM` 里加一条规则，比如"所有金额保留整数"，用 `proven ask` 跑一个问题看效果
2. **加一个工具**：在 `tools/builtin.py` 里仿照 `inspect_data` 写一个 `list_tables`，只返回所有表名，再注册到 `builtin_tools()` 里
3. **写一个测试**：仿照 `tests/test_agent_e2e.py`，用 `ScriptedChat` 模拟模型在报告里写一个没登记过的数字，断言核查不通过
4. **加一个水文函数**：在 `kit/water.py` 里加一个计算径流系数的函数，在 `packs/water/prompt.md` 里告诉模型它的用法
5. **加一条领域规则**：在 `packs/water/rules.yaml` 里加一条你最有把握的规则（比如"多年平均蒸发量不能超过……"），在 `evals/review_cases.yaml` 里加一条该拦的、一条不该拦的用例，运行 `proven review-eval --pack water` 看结果

## 调试技巧

- **单步跟踪**：VS Code 中打开测试文件，在 `orchestrator.py` 的 `_execute()` 里打断点，点测试函数上方的"Debug Test"，可以一步步看 `messages` 是怎么变长的
- **看真实运行**：`proven logs latest` 导出最近一次运行的完整日志
- **看模型收到了什么**：`ScriptedChat.calls` 里记录了每次调用时发给模型的全部消息
