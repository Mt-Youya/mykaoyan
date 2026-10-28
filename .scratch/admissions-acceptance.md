# 研招网硕士专业目录（apps/api/src/admissions）只读验收

- 验收时间：2026-10-27 17:14–17:27（Asia/Shanghai）
- 范围：只读验收；未提交、未 push、未部署；未登录学信网；未保存或输出 Cookie/令牌。
- 上游请求统计：curl 12 次（第二节 9 次 + 补充核对 2 次 + pageSize 探测 1 次），服务层 4 次，合计 16 次 ≤ 40 次。
- 上游请求间隔：curl 每次之间 sleep 2s；服务层在调用之间额外 sleep 1.6s（客户端内部默认 1200ms，叠加后实测响应间隔 1.617–1.637s），均 ≥ 1.5s。
- 所有 curl 请求均带：`X-Requested-With: XMLHttpRequest`、`Referer: https://yz.chsi.com.cn/zsml/`、`User-Agent: mykaoyan-check/0.1 (+https://mykaoyan.cn)`。

## 一、接口测试

命令（指定命令）：

```bash
cd apps/api && pnpm exec vitest run src/admissions
```

结果：

```text
 RUN  v5.0.5 /Users/yonjay/codes/hubs/mykaoyan/apps/api
 ✓ src/admissions/admissions.test.ts (17 tests) 179ms

 Test Files  1 passed (1)
      Tests  17 passed (17)
```

- 通过数：**17**
- 失败数：**0**
- 失败用例：无

环境说明（影响复现，不影响结论）：

1. 项目在根 `package.json` 固定 `pnpm@12.15.0/12.15.1`，本机全局 pnpm 为 12.5.1，沙箱内无法下载固定版本，直接执行 `pnpm exec` 会报
   `create the temporary package manager install directory: Operation not permitted`。
   首次运行用 `npm_config_manage_package_manager_versions=false pnpm exec vitest run src/admissions` 绕过，得到上面的 17 passed。
2. 验收过程中根 `package.json` 的 `packageManager` 被改为 `pnpm@12.15.1`；该版本在公共源 `https://registry.npmjs.org` 返回 **404**，内网镜像也没有，于是 `pnpm exec` 进一步报
   `ERR_PNPM_BAD_CONFIG_DEP: Failed to resolve config dependency pnpm@12.15.1`。
3. 为不改动仓库配置，改用等价方式复跑（`pnpm exec vitest` 本质就是执行这个二进制）：

   ```bash
   cd apps/api && ../../node_modules/.bin/vitest run src/admissions
   ```

   结果同为 17 passed / 0 failed（2026-10-27 17:26:34）。
4. 建议（本次未改）：把根 `package.json` 的 `packageManager` 与 `devEngines.packageManager.version` 统一改成 `12.5.1`，并让 npm 源指向 `https://registry.npmjs.org`，`pnpm exec` 即可直接复现。

## 二、真实上游核对（curl）

未登录、匿名请求；未带 Cookie。

### 1. GET https://yz.chsi.com.cn/zsml/

- HTTP 状态：**200**
- 页面内 `curYear`：**`"2027"`**（匹配片段 `curYear: "2027"`）

### 2. POST /zsml/rs/dwzys.do，dwdm=10001&start=0&curPage=1&pageSize=10

- HTTP 状态：**200**
- flag：**true**
- totalCount：**91**
- 返回行数：**10**（pageCount=10，curPage=1）
- 前 10 行 zydm / yjxkdm：

| # | zydm | yjxkdm | zymc |
| --- | --- | --- | --- |
| 1 | 010101 | 0101 | 马克思主义哲学 |
| 2 | 010102 | 0101 | 中国哲学 |
| 3 | 010103 | 0101 | 外国哲学 |
| 4 | 010104 | 0101 | 逻辑学 |
| 5 | 010106 | 0101 | 美学 |
| 6 | 010107 | 0101 | 宗教学 |
| 7 | 010108 | 0101 | 科学技术哲学 |
| 8 | 020101 | 0201 | 政治经济学 |
| 9 | 020104 | 0201 | 西方经济学 |
| 10 | 025100 | 0251 | 金融 |

### 3. POST /zsml/rs/dwzys.do，dwdm=10001&start=10&curPage=2&pageSize=10

- HTTP 状态：**200**
- 响应体：**`{"flag":false,"msg":"请登录"}`**
- 结论：第二页确实要求登录（与预期一致）。

### 4. 同一接口追加筛选参数

基础请求体：`dwdm=10001&start=0&curPage=1&pageSize=10`，分别追加：

| 追加参数 | HTTP | flag | totalCount | 行数 | 返回内容 | 是否筛选 |
| --- | --- | --- | --- | --- | --- | --- |
| `yjxkdm=0854` | 200 | true | **1** | 1 | 085400 / 0854 电子信息 | 是 |
| `mldm=08` | 200 | true | **10** | 10 | 0805J6/0805、080900/0809、081000/0810、081200/0812、0812J6/0812、085400/0854、085500/0855、085600/0856、085700/0857、086200/0862 | 是 |
| `zydm=081200` | 200 | true | **1** | 1 | 081200 / 0812 计算机科学与技术 | 是 |

- 未加筛选时 totalCount=91；加 `yjxkdm`/`mldm`/`zydm` 后分别变为 1/10/1，且返回行全部落在筛选类别内。
- 结论：**dwzys.do 支持按学科类别（门类 mldm、一级学科 yjxkdm、专业 zydm）筛选，可以借此缩小专业列表。**
- 补充探测：`pageSize=20` 仍只返回 **10 行**（flag=true，totalCount=91），说明 10 行是匿名上限，不是 `pageSize=10` 的巧合。

### 5. POST /zsml/rs/yjfxs.do，dwdm=10006&zydm=030103&start=0&pageSize=10

- HTTP 状态：**200**
- flag：**true**
- totalCount：**1**
- 返回行数：**1**
- `kskmz` 组数：**2 组**

| 组 | km1Vo | km2Vo | km3Vo | km4Vo |
| --- | --- | --- | --- | --- |
| 1 | 101 思想政治理论 | 201 英语（一） | 761 法学专业综合 | 861 法学基础综合 |
| 2 | 101 思想政治理论 | 203 日语 | 761 法学专业综合 | 861 法学基础综合 |

两组仅外语科目不同（201 英语（一） / 203 日语），其余三门相同。

### 6. POST /zsml/rs/yjfxs.do，dwdm=10001&zydm=125100&start=0&pageSize=10

- HTTP 状态：**200**
- flag：**true**
- totalCount：**9**
- 返回行数：**9**
- `kskmz` 组数：每行 **1 组**（9 行内容一致）
- 科目位：

| 位置 | kskmdm | kskmmc |
| --- | --- | --- |
| km1Vo | 199 | 管理类综合能力 |
| km2Vo | 204 | 英语（二） |
| km3Vo | **`-`** | **无** |
| km4Vo | **`--`** | **无** |

与预期一致：km3/km4 是占位符，不是真实科目。

### 7. GET /zsml/code/autodw.do?q=北京工业（URL 编码为 `q=%E5%8C%97%E4%BA%AC%E5%B7%A5%E4%B8%9A`）

- HTTP 状态：**200**
- 返回数组长度：**1**（因此"前 3 项"实际只有 1 项）
- 前 3 项：

```json
[
  {
    "dwmc": "北京工业大学",
    "dwdm": "10005",
    "syl": "0",
    "szssm": "11",
    "zhx": "",
    "yjsy": "",
    "schid": "",
    "bs": "",
    "b985": "",
    "ylgx": "",
    "b211": "",
    "ylxk": ""
  }
]
```

## 三、用真实上游跑本仓库服务层

临时文件 `apps/api/src/admissions/live.tmp.test.ts` 按指定方式创建：`Test.createTestingModule({ imports: [AdmissionsModule] }).compile()`，**未覆盖 `CHSI_CLIENT`**（即真实 fetch），取出 `AdmissionsController` 后依次调用。运行后已删除该文件。

指定命令：

```bash
cd apps/api && pnpm exec vitest run src/admissions/live.tmp.test.ts --silent=false
```

由于上述 `pnpm@12.15.1` 解析失败，实际用等价方式运行：

```bash
cd apps/api && ../../node_modules/.bin/vitest run src/admissions/live.tmp.test.ts --silent=false
```

运行结果：`Test Files 1 passed (1)`，`Tests 1 passed (1)`，耗时 6.66s。上游请求 4 次（GET `/zsml/`、GET `autodw.do`、POST `dwzys.do`、POST `yjfxs.do`；2026 年度在 `requireYear` 阶段直接返回 409，未发上游请求）。

### 输出（节选）

`year()`：

```json
{ "year": 2027, "checkedAt": "2026-10-27T09:23:18.074Z", "stale": false }
```

`units("北京工业")`：

```json
{
  "units": [{ "code": "10005", "name": "北京工业大学" }],
  "checkedAt": "2026-10-27T09:23:19.691Z",
  "stale": false
}
```

`majors("10005", "2027")`（10 条，节选）：

```json
{
  "year": 2027,
  "majors": [
    { "code": "020200", "name": "应用经济学", "degree": "academic", "discipline": { "code": "0202", "name": "应用经济学" } },
    { "code": "0202J1", "name": "资源环境与循环经济", "degree": "academic", "discipline": { "code": "0202", "name": "应用经济学" } },
    { "code": "025100", "name": "金融", "degree": "professional", "discipline": { "code": "0251", "name": "金融" } },
    { "code": "035102", "name": "法律（法学）", "degree": "professional", "discipline": { "code": "0351", "name": "法律" } },
    { "code": "040100", "name": "教育学", "degree": "academic", "discipline": { "code": "0401", "name": "教育学" } }
  ],
  "coverage": { "total": 71, "returned": 10, "truncated": true },
  "checkedAt": "2026-10-27T09:23:21.319Z",
  "stale": false
}
```

全部 10 条 code：`020200, 0202J1, 025100, 025200, 030300, 030500, 035102, 035200, 035400, 040100`。

`records("2027", "10005", "085404", undefined)`（只打印前 2 条）：

```json
{
  "year": 2027,
  "records": [
    {
      "id": "430e38596b27b601cccb23d86e4b0e6f",
      "unit": { "code": "10005", "name": "北京工业大学" },
      "college": { "code": "088", "name": "计算机学院" },
      "major": { "code": "085404", "name": "计算机技术" },
      "direction": { "code": "01", "name": "计算机网络技术" },
      "mode": "full_time",
      "groups": [
        { "subjects": [
          { "code": "101", "name": "思想政治理论" },
          { "code": "204", "name": "英语（二）" },
          { "code": "302", "name": "数学（二）" },
          { "code": "408", "name": "计算机学科专业基础" }
        ] }
      ],
      "sourceUrl": "https://yz.chsi.com.cn/zsml/yjfxdetail?id=430e38596b27b601cccb23d86e4b0e6f"
    },
    {
      "id": "6c5e64981ae9bbe41cc6fd8b123ac3d9",
      "college": { "code": "088", "name": "计算机学院" },
      "major": { "code": "085404", "name": "计算机技术" },
      "direction": { "code": "02", "name": "计算机软件技术" },
      "mode": "full_time",
      "groups": [
        { "subjects": [
          { "code": "101", "name": "思想政治理论" },
          { "code": "204", "name": "英语（二）" },
          { "code": "302", "name": "数学（二）" },
          { "code": "408", "name": "计算机学科专业基础" }
        ] }
      ],
      "sourceUrl": "https://yz.chsi.com.cn/zsml/yjfxdetail?id=6c5e64981ae9bbe41cc6fd8b123ac3d9"
    }
  ],
  "coverage": { "total": 3, "returned": 3, "truncated": false },
  "checkedAt": "2026-10-27T09:23:22.956Z",
  "stale": false
}
```

`records("2026", "10005", "085404", undefined)`：

```json
{
  "status": 409,
  "message": "研招网目前只提供 2027 年度的招生目录，无法查询 2026 年度"
}
```

### 与 curl 原始数据的逐项核对

为核对 `10005`（第二节 curl 未采样这个单位），补充了 2 次同参数 curl：`dwzys.do dwdm=10005...`、`yjfxs.do dwdm=10005&zydm=085404...`。

| 服务层输出 | 对应 curl 原始数据 | 是否一致 |
| --- | --- | --- |
| `year()` = 2027 | `/zsml/` 的 `curYear: "2027"` | 一致 |
| `units("北京工业")` = 10005 北京工业大学 | `autodw.do?q=北京工业` 返回 `dwdm=10005, dwmc=北京工业大学` | 一致 |
| `majors(10005, 2027)` 10 条，coverage.total=71 | `dwzys.do dwdm=10005`：totalCount=71、10 行，zydm/zymc/yjxkdm/yjxkmc 逐条相同 | 一致 |
| `records(2027,10005,085404)` coverage.total=3、前两条 | `yjfxs.do dwdm=10005&zydm=085404`：totalCount=3、3 行；前两条 id/学院/方向/学习方式/科目组逐字段相同（第 3 条 curl 为 `c999e...`/03 计算机应用技术） | 一致 |
| `records(2026,...)` 抛 409 | 与 `curYear=2027` 及服务层"只提供当前年度"的约定一致 | 一致 |

预期内的差异（适配层设计，不是数据不一致）：

- 服务层不返回上游内部字段（如 `zyyjfxdm`、`schId`、`sign` 等）；
- 服务层把 `xwlx` 归一化为 `degree`（`xs`→`academic`、`zyxw`→`professional`），把 `xxfs` 归一化为 `mode`（`1`→`full_time`、`2`→`part_time`）；
- 服务层 UA 为代码内置的 `mykaoyan-api (+https://mykaoyan.cn)`，与第二节验收用的 `mykaoyan-check/0.1` 不同；两者都是匿名请求。

### 临时文件清理

运行后已删除 `apps/api/src/admissions/live.tmp.test.ts`。`git status` 中该路径已不存在（确认命令与结果见文末）。

## 结论

| # | 验收结论 | 判定 | 依据 |
| --- | --- | --- | --- |
| 1 | 年度是 2027 | **符合** | 页面 `curYear: "2027"`；服务层 `year()` 返回 2027 |
| 2 | 匿名只返回 10 行，第二页返回"请登录" | **符合** | 第一页 10 行（`pageSize=20` 仍 10 行）；第二页 `{"flag":false,"msg":"请登录"}` |
| 3 | 多个科目组之间是"或"关系 | **符合** | 10006/030103 返回 2 组，仅外语位不同（201 英语（一）/203 日语），属二选一；上游无显式标签，关系由数据结构推断 |
| 4 | 管理类联考的后两位是占位，不是科目 | **符合** | 125100 的 km3Vo=`-`/无、km4Vo=`--`/无；服务层已过滤，仅保留 199、204 两门 |
| 5 | dwzys.do 是否支持按学科类别筛选 | **是** | `yjxkdm=0854`→totalCount 1；`mldm=08`→10；`zydm=081200`→1；未筛选 91 |
| 6 | 服务层输出是否与 curl 原始数据一致 | **符合** | 逐字段核对 year/units/majors/records 全部一致；归一化与内部字段剥离属预期 |

## 其他说明与风险

- 本次为只读验收：未提交、未 push、未部署；未登录学信网；未保存或输出 Cookie/令牌。
- 上游是非公开的内部接口，以上样本仅代表 2026-10-27 当次响应。
- 验收过程中工作区出现其他会话/终端的 `git add`（暂存了当时的改动，含我生成的临时文件）；我没有执行任何 `git add`/commit，并已把自己的临时文件从索引移除、删除 `live.tmp.test.ts` 与临时采集目录。
- `pnpm exec` 当前无法启动（根 `package.json` 固定 `pnpm@12.15.1`，公共源 404）；建议改为 12.5.1 后复现指定命令。
