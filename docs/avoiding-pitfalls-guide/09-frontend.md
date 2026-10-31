# 9 · 前端样式与设计

> 设计流程产物与工程栈脱节、样式类静默不生成、迁移丢行为；这一章收前端样式链路上“构建全绿但页面不对”的几类失败。

### UI-01 · 设计流程产物与既定技术栈脱节：6 个手写 CSS、1297 行、81 个自定义类名，`tailwindcss` 依赖 0 处

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-d4b12f2c-71ba-4bbe-adc4-1b6875d980ba（dsh--session-d4b12f2c-7…md 第 14–30 行）

**1. 怎么出现的**
`hallmark` 流程产出的是 6 个手写 CSS 文件、1297 行、81 个自定义类名；而仓库既定技术栈是 Tailwind + shadcn：`tailwindcss` 依赖在代码里出现 0 处、shadcn 主题 0 字节、63 个 shadcn 组件全是死代码。首页看起来能跑，但整条组件体系没有接上。

**2. 怎么诊断的**
统计自定义类名与依赖引用后才看清脱节规模：手写 CSS 与组件库是两套并行体系，后续任何页面都要二选一。站主发火后决定整条链路迁移。

**3. 提了什么方案**
继续手写 CSS（否，等于放弃组件库）；把手写样式反向翻译成 Tailwind + shadcn（采用）；两套并存（否，维护成本翻倍）。

**4. 最后怎么处理的**
整条链路迁移，`vite build` EXIT=0、CSS 260865 bytes；迁移后的行为回归另见 UI-03。设计流程的产物必须落在既有工程栈里。

- 📎 excerpt: [evidence.gz](./evidence.gz) → UI-01

### UI-02 · Tailwind v4 少了 `@plugin` 声明：`prose-*` 类静默不生成，`vite build` 仍 EXIT=0

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-d4b12f2c-71ba-4bbe-adc4-1b6875d980ba（dsh--session-d4b12f2c-7…md 第 4163–4179 行）

**1. 怎么出现的**
Markdown 排版全部丢样式，`prose-*` 类在产物里不存在；但 `vite build` 一切正常、EXIT=0，没有任何报错。

**2. 怎么诊断的**
先怀疑内容渲染，再 grep 构建产物里的类名：`prose` 出现次数从 0 变成 1 才确认是 Tailwind v4 缺 `@plugin`（typography 插件）声明——缺插件时工具链不报错，类名被静默丢弃。期间还踩到 grep 转义导致的假 0。

**3. 提了什么方案**
补 `@plugin` 声明（采用）；改成手写排版样式（回到 UI-01 的老路，否）；在构建后加产物类名断言（建议）。

**4. 最后怎么处理的**
补声明后排版恢复，`vite build` 依旧 EXIT=0——所以构建成功不能证明样式生效。构建后用 grep 校验关键类名是否在产物里。

- 📎 excerpt: [evidence.gz](./evidence.gz) → UI-02

### UI-03 · 手写 CSS 到 Tailwind/shadcn 迁移丢了 4 处行为：横向溢出、链接无下划线、点击区 37.7px、加载态不可感知

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-d4b12f2c-71ba-4bbe-adc4-1b6875d980ba、claude-code be2ff72c-f9e2-4e56-986e-c609d82498f3、claude-code aafdb13d-7334-4fd2-ad39-0de7eb348fa4（dsh--session-d4b12f2c-7…md 第 10418–10438 行；claude-code--be2ff72c-f9e2-4e56…md 第 8588–8632 行；claude-code--aafdb13d-7334-4fd2…md 第 7700–7732、8015–8032、8110–8130、8265–8300、8314–8340、8401–8425 行）

**1. 怎么出现的**
迁移完成后，编码侧自查结论是“查找面板没丢东西”；但 375 宽下页面横向溢出 409px、链接看不出是链接、页脚点击区 37.7px、加载态不可感知——四项行为都在迁移里丢了，且没有任何测试覆盖。

**2. 怎么诊断的**
用独立 CDP 走查计算样式与布局：`scrollWidth` 409 vs 375、`text-decoration` 缺失、页脚元素高度 37.7px、加载态无 aria/文案；与迁移前截图和样式逐项对照。编码侧自查之所以没发现，是因为只看了 DOM 存在与否。

**3. 提了什么方案**
只复验“类名都在”（否，已被推翻）；独立计算样式走查 + 修复四项（采用）；给关键布局补截图回归（建议）。

**4. 最后怎么处理的**
修复后 CDP 2000ms 延迟复验 4/4 通过。迁移的验收标准要包含计算样式与可点击区域，而不是“组件都在”。

- 📎 excerpt: [evidence.gz](./evidence.gz) → UI-03
