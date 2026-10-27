# 领域规则模板（第 2 期审核员使用）

> 这份文档由领域专家填写。规则写成 YAML，放在领域包目录下（如 `proven/packs/water/rules.yaml`）。
> 下面的例子只是格式示范，**内容、阈值和依据请按你掌握的规范和经验修改**。

## 规则的三种类型

| 类型 | 检查什么 | 怎么判断 |
|---|---|---|
| `range` 取值范围 | 某个量必须在合理范围内 | 结论里出现这个量时，数字必须落在范围内 |
| `condition` 适用条件 | 某种方法只能在满足条件时使用 | 结论涉及这种方法时，检查条件是否满足 |
| `consistency` 文字与数字一致 | 某些说法必须有相应的数字支撑 | 结论里出现关键词时，必须同时出现满足条件的数字 |

## 每条规则的字段

```yaml
- id: 规则编号，如 W001
  name: 一句话名称
  type: range | condition | consistency
  severity: error | warning      # error 退回重做；warning 写进"假设与局限"
  applies_when: 结论中出现哪些关键词时检查这条规则
  check: 具体怎么判断（见下面例子）
  message: 不通过时告诉分析员的话
  basis: 依据（规范条文、教材、经验），面试时可以引用
```

## 水利示例（请修改和补充）

```yaml
rules:
  # ---------- 取值范围 ----------
  - id: W001
    name: 径流系数在 0 到 1 之间
    type: range
    severity: error
    applies_when: [径流系数, runoff ratio]
    check: {min: 0, max: 1}
    message: 径流系数超出 0–1，检查径流深与降水的单位和时段是否一致
    basis: 径流系数定义为径流深与同期降水之比（待补充规范或教材出处）

  - id: W002
    name: 年降水量与当地气候常年值偏差
    type: range
    severity: warning
    applies_when: [年降水, 年均降水, 年降雨]
    check: {relative_to: climate_normal, max_deviation: 0.3}   # 与常年值偏差超过 30% 时提示
    message: 年降水量与当地常年值偏差较大，请核对数据来源（站点实测 / 再分析 / 遥感）
    basis: 待补充（如当地气象站多年平均值）

  # ---------- 适用条件 ----------
  - id: W101
    name: 频率分析的样本长度
    type: condition
    severity: warning
    applies_when: [重现期, 设计洪峰, 设计暴雨, 百年一遇, P-III]
    check: {sample_size_min: 30}
    message: 样本少于 30 年，设计值外推不确定性大，必须在结论中说明，不宜直接作为工程设计值
    basis: 待补充（如 SL 44 关于资料系列长度的要求）

  - id: W102
    name: 外推倍数
    type: condition
    severity: error
    applies_when: [重现期]
    check: {max_return_period_over_sample: 5}   # 重现期超过样本年数 5 倍时不允许不加说明地给出
    message: 重现期远超样本长度，请改为"仅供参考"并说明不确定性，或给出置信区间
    basis: 待补充

  - id: W103
    name: 选样方式必须说明
    type: condition
    severity: warning
    applies_when: [年最大, 年最大值序列]
    check: {must_mention_any: [水文年, 日历年]}
    message: 请说明年最大值按日历年还是水文年选样
    basis: 待补充

  # ---------- 文字与数字一致 ----------
  - id: W201
    name: "显著"需要显著性检验支撑
    type: consistency
    severity: error
    applies_when: [显著上升, 显著下降, 显著增加, 显著减少, 显著趋势]
    check: {requires: p_value, max: 0.05}
    message: 写"显著"必须给出 p 值且 p < 0.05；不显著时请写"无显著趋势"
    basis: 统计检验的常规约定

  - id: W202
    name: "预测"需要说明方法
    type: consistency
    severity: warning
    applies_when: [预测, 预估]
    check: {must_mention_any: [情景, 气候平均, 统计外推, 置信区间, 模型]}
    message: 基于历史统计的结果应称为"统计情景"或"气候平均"，并说明不是确定性预报
    basis: 待补充
```

## 商业示例（可选）

```yaml
rules:
  - id: B001
    name: 占比之和
    type: range
    severity: error
    applies_when: [占比, 份额, 比例]
    check: {min: 0, max: 100}
    message: 占比应在 0–100% 之间，检查分母是否正确

  - id: B101
    name: 同比需要两期数据
    type: condition
    severity: error
    applies_when: [同比, YoY]
    check: {must_mention_any: [上年, 去年, 同期]}
    message: 同比结论需要说明对比的基期
```

## 填写建议

1. **先写 5–10 条你最有把握的规则**，不求多；每条都写清依据
2. 优先写"模型最容易犯、但专业人员一眼就能看出"的错误
3. 阈值不确定的，先设为 `warning`，跑几次看误报情况再调整
4. 写完后，我们为每条规则构造 1–2 个"会触发"和"不会触发"的测试用例，确认规则本身是对的
