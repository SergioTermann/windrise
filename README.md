# Windrise LLMWiki

Windrise LLMWiki 是面向风电场运维的本地知识助手与诊断编排系统。项目目标不是做一个新的展示页，而是把风机故障、场站 SOP、厂家手册、历史工单和专家规则组织成可追溯、可验证、可闭环的技术架构。

## 项目定位

- 本地优先：支持 LM Studio / 本地模型接入，知识库和诊断流程可在内网运行。
- LLMWiki 知识底座：统一索引故障码、机型、部件、测点、工单、SOP 和来源文档。
- WindOps 诊断流程：从告警或现场描述生成结构化 Case，再由 Planner 拆解排查路径。
- 证据可追溯：回答必须引用厂家手册、故障码表、场站 SOP、专家规则或历史工单等来源。
- 安全门控：涉及复位、旁路、限电、登塔、停送电等动作时，优先输出风险、前置条件和人工确认点。
- 反馈闭环：工单关闭后沉淀根因、措施、备件、复发率和专家复核结果。

## 技术架构

```text
业务入口
  -> 告警 / 故障码 / 运维提问 / 现场短反馈

数据标准化层
  -> 风机、机型、故障码、部件、测点、时间、工况、现场状态

LLMWiki 知识层
  -> 厂家手册、故障码表、场站 SOP、专家规则、历史工单、图谱路径

诊断编排层
  -> Case 标准化、Planner 路径拆解、候选原因排序、验证动作生成

工具与系统层
  -> CMS、SCADA、EAM、备件、气象、工作票等只读查询接口

安全与合规层
  -> 操作风险识别、强制人工确认、禁止越权执行

反馈学习层
  -> 工单结果、专家复核、短期 TTL 信息、本地项目记忆
```

## 核心能力

### 故障诊断

- 支持故障码精确匹配、品牌/机型限定、短码歧义识别。
- 输出故障含义、可能原因、排查步骤、复位条件和安全提醒。
- 使用 LLMWiki 证据分级：厂家手册/故障码表 > 场站 SOP > 专家规则 > 已关闭历史工单 > 未验证经验。

### 工单生成

- 根据诊断 Case 生成运维工单建议。
- 包含故障对象、现象、影响范围、风险等级、处理步骤、备件建议和验证口径。
- 支持把关闭结果反哺到项目知识和后续诊断流程中。

### 本地记忆

- 当前实现为 Windrise 自研轻量记忆层。
- 会话内保存最近故障对象、已执行动作、用户短反馈和关键上下文。
- 项目级记忆使用本地 JSON 持久化，不依赖 mem0。

## 目录说明

```text
src/commands/llmwiki/       LLMWiki 命令、查询、trace 和知识证据排序
src/skills/bundled/         风电故障诊断与工单生成内置技能
scripts/windrise-chat.mjs   本地聊天入口和 WindOps 架构上下文
scripts/doc-knowledge-server.mjs
                            文档知识服务、会话记忆和项目记忆
scripts/build-wind-llmwiki.mjs
                            构建风电 LLMWiki 知识索引
scripts/build-fault-index.mjs
                            构建结构化故障码索引
scripts/build-fault-mechanism-graph.mjs
                            构建故障机理图谱
wind-llmwiki/               生成后的风电知识库资产
generated-knowledge/        结构化知识、图谱和评估产物
```

## 常用命令

```bash
npm install
npm run build:wind-knowledge
npm run smoke:wind-llmwiki
npm run eval:faults
npm run smoke:skills
npm run serve:doc-knowledge
```

## 本地模型配置

默认面向本地模型服务运行。可通过环境变量配置模型端点：

```bash
export LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1
export LMSTUDIO_MODEL=qwen/qwen3.5-9b
```

然后运行：

```bash
npm run run:lmstudio -- "查询 303804 故障的排查路径"
```

## 验证

推荐在修改诊断架构、LLMWiki 索引或内置技能后执行：

```bash
node --check scripts/windrise-chat.mjs
npm run eval:faults
npm run smoke:skills
npm run smoke:wind-llmwiki
```

## 命名说明

本项目名称为 Windrise LLMWiki。README、包名和运行输出应使用 Windrise / LLMWiki 口径；历史恢复源码中的上游字符串只作为底层代码遗留存在，不代表当前项目定位。
