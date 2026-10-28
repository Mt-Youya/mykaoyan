<!-- HIGHEST PRIORITY RULE -->

## 🔴 语言规则（最高优先级）

**必须用简体中文回答所有问题，无例外。**

- 代码注释可以用英文
- 所有解释、分析、建议必须是中文
- 即使用户用英文提问，也用中文回答

# [CLAUDE.md](https://github.com/forrestchang/andrej-karpathy-skills/blob/main/CLAUDE.md)

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

> ⚠️ Reminder: Always respond in Simplified Chinese.

---

# mykaoyan 项目规则

## 先读什么

每次新会话按任务读取，不全量导入：

| 任务 | 先读 |
| --- | --- |
| 任何任务 | [GLOSSARY.md](GLOSSARY.md)（术语，代码和文案都用这里的词）、[docs/PLAN.md](docs/PLAN.md) §1–§2（目标与红线） |
| 写代码、加目录、加依赖 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、相关 [docs/adr/](docs/adr/) |
| 数据库、认证、媒体、部署、契约 | [docs/pitfalls.md](docs/pitfalls.md) 的对应章节 |
| 某个里程碑的功能 | [docs/PLAN.md](docs/PLAN.md) §4–§5 与 [docs/specs/](docs/specs/) |

改了术语就改 GLOSSARY；做了难以撤回、有真实取舍的决定就加一份 ADR；踩到新坑就按 pitfalls.md 的格式追加 `mk/` 条目。

## 红线

见 [docs/PLAN.md §2](docs/PLAN.md)。要点：仓库公开，不提交任何密钥、项目 ID、连接串、IP、真实个人数据；不转载真题原文与答案；课程内容不进仓库；答案不出现在任何可见载体上。

## 动手规则

- commit、push、部署、创建或修改云资源（Supabase、Cloudflare、阿里云）都要用户在本轮明确同意。只读任务不跑会写文件的命令。
- 同一工作区同一时间只有一个会话写入；接手前先看 `git status`。
- 包特定依赖由各包自己声明；`tsx`、`@types/node`、`oxfmt`、`oxlint`、`typescript`、`vitest` 这些全仓库工具只在根声明；不改 `packages/ui/components/ui/*` 这些 shadcn 生成物。
- 交付前运行（M0 建好后生效）：

  ```bash
  pnpm fmt && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  ```

  报告时把静态检查、构建、本地运行、浏览器实测、真机实测分开写，跳过的写跳过。

## 技能使用

先读对应 SKILL.md 再动手。

| 场景 | Skill |
| --- | --- |
| 设计：探索方向 | `huashu-design`：先出三个方向的 HTML 原型给站主挑，原型放 `design/explorations/`，不进生产代码 |
| 设计：锁定方向（PRODUCT.md、DESIGN.md） | `impeccable`（`init`、`shape`），以站主选中的原型为输入 |
| 设计：新页面（首页、落地页、新栏目） | `hallmark`，它把根目录 DESIGN.md 当作锁定的设计系统；交付前跑它的 `sloplint --render` 并修完所有 FAIL。`design-taste-frontend` 作为备选，同一页面只用一个 |
| 设计：改已有页面 | 不用 hallmark（除非站主点名 `/hallmark redesign`），按 DESIGN.md 与现有组件改 |
| 设计系统与组件 | `shadcn`、`good-css`（只约束手写样式） |
| 动效 | `emil-design-eng` 写、`review-animations` 审；GSAP 用 `gsap-core`、`gsap-react`、`gsap-timeline`、`gsap-scrolltrigger`、`gsap-plugins`、`gsap-performance`、`gsap-utils`、`gsap-frameworks` |
| 审查打磨 | `impeccable`（`audit`、`polish`）、`web-design-guidelines` |
| 数据库 | `supabase`、`supabase-postgres-best-practices` |
| 认证 | `better-auth-best-practices`、`better-auth-security-best-practices` |
| 媒体 Worker、R2、DNS | `cloudflare`、`wrangler`、`workers-best-practices` |
| 阿里云（备案、DNS、ECS、云监控） | `alibabacloud-domain`、`alibabacloud-cli-guidance`、`alibabacloud-dns-resolve-diagnose-customer`、`alibabacloud-ecs-diagnose`、`alibabacloud-ecs-health-inspection`、`alibabacloud-cms-alert-rule-create`；完整清单与前置条件见 [docs/agents/alibabacloud-skills.md](docs/agents/alibabacloud-skills.md) |
| skill 与 CLI | `skill-creator`（遵循 agentskills.io 规范）、`cli-creator`（Rust CLI 参考 Rust CLI Book） |
| 规格、工单、测试 | `to-spec`、`to-tickets`、`tdd`、`code-review` |

**不启用**：`baseline-ui`、`frontend-design`（与 impeccable、emil-design-eng 的规则冲突）、`ui-ux-pro-max`（本机已失效）。`migrate-radix-to-base` 只在从 radix 模板复制了代码时使用。

设计规则的本地放宽：中文字体不强制自托管；shadcn 默认卡片的边框与阴影可以保留；没有合适照片时用数据、界面截图或插画，不用图库照片。

动效分工：Motion（`motion/react`）负责界面小动效（进出场、布局、手势、弹层）；GSAP 负责时间轴和滚动驱动的动画，只在用到的页面加载。两者不驱动同一个元素。遵守 `prefers-reduced-motion`，只动 `transform` 和 `opacity`。
