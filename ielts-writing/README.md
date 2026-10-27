# ✍️ 雅思写作练习

一个帮你练习雅思写作的本地小网页。你只需要**打字**：读教程 → 写答案 → AI 纠错、分析句子、打分 → 追问老师 → 进入下一单元。

接入任何 **OpenAI 兼容接口**（DeepSeek、Kimi、通义千问、智谱、OpenAI、各类中转站）。

## 功能

| 模块 | 说明 |
| --- | --- |
| 📚 学习路线 | 5 个阶段、14 个单元，从「简单句」到「Task 2 完整作文」。每单元有中文教程 + 一种练习，得分 ≥ 70 即为掌握，并推荐下一单元 |
| ✏️ 打字练习 | AI 根据单元自动出题（中译英、改错、合并句子、改写、段落、完整作文），也可以粘贴自己的题目；字数统计、计时、草稿自动保存 |
| 🔍 纠错 | 在你的原文中标出每处错误，逐条给出改正和中文规则讲解 |
| 🧩 句子分析 | 拆解句子结构，点评，并给出升级写法；另有独立的「句子分析」页面，可分析任意长难句 |
| 📊 打分 | 完整作文按雅思四项标准（TR/TA、CC、LR、GRA）给分并估算总分 |
| 💬 追问老师 | 对批改有疑问可以继续提问，或让老师出针对性练习 |
| 📝 模考 | Task 1 / Task 2 计时模拟考试 |
| 📈 记录 | 历史练习、常见错误统计，以及「AI 分析我的弱点」 |
| ⚡ 打字特效 | 类似 VS Code Power Mode：光标处粒子、连击计数、震动，可选按键音；练习框下方一键开关 |

## 使用方法

需要 [Node.js](https://nodejs.org/) 18 或以上版本（装 LTS 版即可），不需要安装任何依赖。

### 最快：双击启动

- **Windows**：双击 `启动.bat`
- **macOS**：双击 `启动.command`（第一次如果提示无法打开，右键 → 打开）

会弹出一个黑色窗口并自动打开浏览器。**练习时别关这个窗口**，关掉它就停止运行了。

想更方便：Windows 右键 `启动.bat` → 发送到 → 桌面快捷方式；macOS 把 `启动.command` 按住 ⌘+⌥ 拖到桌面生成替身。以后从桌面双击即可。

第一次打开后，点网页右上角 **⚙️ 设置** 填写接口地址、API Key 和模型名，保存后在这个浏览器里会一直记住。

### 命令行启动

```bash
cd ielts-writing
npm start          # 启动并自动打开浏览器
#  浏览器打开 http://localhost:3000
```

也可以把 `.env.example` 复制为 `.env`，在里面填写 API 配置，效果和网页「设置」一样。

### 配置示例

| 服务 | API_BASE_URL | MODEL |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-32k` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-plus` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |

> 批改质量取决于模型能力，建议用各家较强的模型。推理模型（如 `deepseek-reasoner`）也可以用，只是批改会慢一些。

## 文件结构

以下路径都在 `ielts-writing/` 文件夹内：

```
启动.bat / 启动.command  双击启动（Windows / macOS）
server.js            本地服务：提供网页 + 转发请求到你的 API（Key 不会暴露给浏览器以外的地方）
public/index.html    页面
public/app.js        练习流程、批改展示、提示词
public/curriculum.js 学习路线与教程内容（想加单元或改教程就改这里）
public/style.css     样式
public/powermode.js  打字特效（粒子、连击、震动、按键音）
```

练习记录和进度保存在浏览器的 localStorage 中，换浏览器或清除网站数据会丢失。
