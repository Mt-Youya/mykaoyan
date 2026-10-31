# 7 · Windows 本地工具链

> 这台 Windows 机器上的 PowerShell 5.1/7、编码、Python、Postgres、安装脚本与退出码，构成了本仓库最高频的“假失败/假成功”来源。

### TOOL-01 · 用 PowerShell 批量改写源码：中文写坏、`-NoNewline` 并行、重写又引入新错

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh 6d56461f-a76c-4d68-a5c8-f585666ec968、dsh c7c56444-856a-40c3-9b85-3d33259f4f37（第 5544–5600 行；第 8212–8258、8364–8397 行）

**1. 怎么出现的**
为了把 `new TextEncoder().encode(value).length` 换成新函数，用一条 `$s = Get-Content … -Raw; $s = $s.Replace(...); Set-Content -Path … -Value $s` 同时改两个含中文注释的 TS 文件：读工具随后报 `invalid UTF-8 text`，文件里出现字面量 `` `n ``；`Format-Hex -Count` 也不被当前 PowerShell 支持。另一个会话用 `(Get-Content …) -replace … | Set-Content … -NoNewline` 调 import 顺序，结果两个 service 文件首行被合并成 `from "@nestjs/common"import {`，oxlint 报“binary or inaccessible”，删除重写后 typecheck 又报 `Cannot find name 'letcandidate'`。

**2. 怎么诊断的**
读工具回读判断编码非法 → 判断文件损坏 → 删除并用 write 全量重写 → 重写时漏空格，typecheck 抓出 → 想 edit 修又被 oxfmt 改写后的版本守卫拒绝，重读后才成功。整个过程每一步都比“直接用 edit 逐处替换”更费时。

**3. 提了什么方案**
源码编辑一律用 edit/write 工具（最终等价做法）；必须 shell 时只用 `[IO.File]::WriteAllText(..., UTF8Encoding($false))` 并写后逐文件核对首行/中文/`git diff`（`mk/TOOL-11`）；“删除重写”不是恢复手段（本例引入新错）。

**4. 最后怎么处理的**
两个文件重写后 `packages/core` typecheck/build 通过、173 项测试全过；另一个会话 API typecheck=0、oxlint 0 errors。规则早就写在 `docs/pitfalls.md`，但“快一点”的诱惑会让它被绕过。

- 📎 excerpt: [evidence.gz](./evidence.gz) → TOOL-01

### TOOL-02 · 跑过 fmt/oxfmt 之后再 edit：`file changed since it was read` 与 `offset out of range`

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-3e13f3f8-c07f-4994-986a-bf61291eeb27、dsh 90b5dc58-9060-41b1-9584-c25a2c8e08f2（第 16643–16679、23760–23774 行；第 8060–8119 行）

**1. 怎么出现的**
在 `cargo fmt` / `pnpm exec oxfmt --write` 之后，直接沿用旧的 read 结果 edit，报 `Error: cannot edit "...": file changed since it was read — re-read the file, then retry`；改完文件行数变化后仍用旧 offset 读，报 `offset 245 is out of range for "...service.ts" (241 lines)`。同一会话里这类错误出现五六次。

**2. 怎么诊断的**
错误信息本身已给出修复方法：重新 read 目标区间再 edit。三次会话的恢复方式完全一致，只是每次都多花一次往返。

**3. 提了什么方案**
先编辑、最后统一格式化；格式化后对要改的文件重新 read 再 edit（采用）；`old_string` 只取格式化不会动的语义片段。

**4. 最后怎么处理的**
所有 edit 最终成功，没有文件丢失。格式化器也是写入者，跑完要重新读。

- 📎 excerpt: [evidence.gz](./evidence.gz) → TOOL-02

### TOOL-03 · PowerShell 写文件带 BOM，`JSON.parse` 直接抛 `Unexpected token '﻿'`

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-3e13f3f8-c07f-4994-986a-bf61291eeb27、dsh 887627e1-5f5d-474a-8d9c-994f169faadc（第 7800–7828、24755–24781 行；第 1278–1319 行）

**1. 怎么出现的**
`Set-Content -Encoding utf8` 写出的 JSON 带 BOM，Node 脚本 `JSON.parse` 报 `SyntaxError: Unexpected token '﻿', "﻿{..." is not valid JSON`；另一处 `Set-Content -Encoding utf8NoBOM` 在旧版 PowerShell 直接参数绑定失败：`无法将值“utf8NoBOM”转换为类型 Microsoft.PowerShell.Commands.FileSystemCmdletProviderEncoding`。`Get-Content -Raw | ConvertFrom-Json` 不指定编码读 UTF-8 文件也会把中文按 GB18030 解成乱码并破坏 JSON 结构（`ConvertFrom-Json : 传入的对象无效…`）。

**2. 怎么诊断的**
用 `Format-Hex` 看到 BOM 字节；写文件改 `[IO.File]::WriteAllText(..., New-Object Text.UTF8Encoding($false))`；读 JSON 前 `.replace(/^\uFEFF/,"")`；读文件改 `-Encoding UTF8`。

**3. 提了什么方案**
统一 .NET 无 BOM 写法（采用）；读 JSON 先去 BOM；彻底不用 PowerShell 写源码（`mk/TOOL-11` 建议）。`chcp 65001` 对管道/重定向不可靠。

**4. 最后怎么处理的**
verify 脚本在去掉 BOM 后 `failures: 0`；后续文件写入正常。编码是 PowerShell 的默认值问题，不是文件内容问题。

- 📎 excerpt: [evidence.gz](./evidence.gz) → TOOL-03

### TOOL-04 · Windows 跑 Python 的三个固定坑：Store 存根、控制台乱码、here-string 丢反斜杠

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh 887627e1-5f5d-474a-8d9c-994f169faadc、dsh 20f62822-1181-4cdb-86e2-6b4d40c35ffe（第 4056–4082、4110–4133、4493–4512 行；第 4237–4257 行）

**1. 怎么出现的**
`python --version` 返回 `Python was not found; run without arguments to install from the Microsoft Store…`，`py` 不存在——`python.exe` 只是 App Execution Alias 存根。两个会话首跑脚本输出都是乱码（`[ok] 2007: questions=24 types={'��ѡ': …}`）。另一个会话把多行 Python 用 `& $py -c @'...'@` 传入，`r"D:\..."` 变成 `rD:\...`，报 `SyntaxError: invalid syntax`。

**2. 怎么诊断的**
用 `load_workspace_dependencies` 拿到托管 Python 绝对路径，所有脚本改用该路径；乱码方案一：`[Console]::OutputEncoding` + `$env:PYTHONIOENCODING='utf-8'`；方案二：Python 只打印 ASCII、中文写文件再用 read 读；多行脚本改为 here-string 存变量后 `$code | & $py -`（stdin），或写临时 `.py` 再执行。

**3. 提了什么方案**
托管 Python + 双设编码（采用）；ASCII 输出 + 文件读回（采用，多一次 IO）；`chcp 65001`（不可靠，未采用）。

**4. 最后怎么处理的**
20 套/5 套转换脚本全部跑通；`types` 输出恢复中文。Windows 上不要相信 `python`/`py` 命令名，也不要从控制台中文判断数据对错。

- 📎 excerpt: [evidence.gz](./evidence.gz) → TOOL-04

### TOOL-05 · 环境探测误判：PostgreSQL 装在 `D:\DevelopmentTools`，不在 PATH、不在 Program Files

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh 7a61d060-c547-4b14-8cf4-d637aaa30195、dsh c7c56444-856a-40c3-9b85-3d33259f4f37（第 9025–9035、9516–9590 行；第 6015–6084 行）

**1. 怎么出现的**
两个会话得出“本机没有 Postgres/psql/Docker/WSL，无法跑集成测试”，把测试交给 Lead；但同一时段另外两个会话用 `@embedded-postgres` 在临时目录起了 55439/55441 两个实例并跑通全量。用户回：“posgresql 已经安装了”。实际安装在 `D:\DevelopmentTools\PostgreSQL\18`，不在 PATH，也不在 `C:\Program Files`。

**2. 怎么诊断的**
`Get-Command psql,initdb,pg_ctl` 无输出、`C:\Program Files\PostgreSQL` 为空之后没有继续查；后来用 `Get-Service` 发现 `postgresql-x64-18 Running`，再用 `Get-CimInstance Win32_Service` 与注册表 `HKLM\SOFTWARE\PostgreSQL\Installations` 拿到 `Base Directory`，然后用 `initdb -A trust` 起独立临时集群跑全量。

**3. 提了什么方案**
把 PG bin 加 PATH（改本机环境，越界）；用绝对路径调用（采用）；continue 用 Lead 临时库（跨会话依赖，不可持续）；以及“Windows 无系统 Postgres 时用 @embedded-postgres + 端口发现”（另一批采用）。

**4. 最后怎么处理的**
临时集群跑完 db 16/16、api 194/196、web 114/114、仓库级 108/109，跑完停库删目录。否定结论要写范围：“本次在 PATH/常见安装位置未查到”，不是“本机没有”。

- 📎 excerpt: [evidence.gz](./evidence.gz) → TOOL-05

### TOOL-06 · 固定手机号触发验证码 60 秒冷却，全量测试随机 429（规则第二次被复现）

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh b07bfb1d-c53e-4638-8607-34fa7f1921f4、dsh 90b5dc58-9060-41b1-9584-c25a2c8e08f2（第 8400–8475、8560–8636 行；第 9972–9993 行）

**1. 怎么出现的**
全量 API 跑出 `AssertionError: expected 429 to be 200`，指向 `login src/comments/submission-comments.test.ts:46:77`；同一时期另一个会话的材料测试也撞到同一断言。同一号 60 秒内重复发码会返回 `OTP_SEND_TOO_SEND 429`，窗口内次数上限返回另一个 429。

**2. 怎么诊断的**
grep `429|TooManyRequests|rate|limit`，读 `apps/api/src/auth/phone/phone.service.ts` 确认冷却与窗口限流；把测试固定号改成随机号并在 `afterAll` 清理账号；另一个会话则把自身材料测试的号段整体避让。

**3. 提了什么方案**
每个测试文件用全仓库唯一号段（`mk/TOOL-09` 已有）；只串行执行（不能解决跨文件清表依赖，否）；新增登录测试前 grep 全仓手机号（应作为动作，而不只是规则）。

**4. 最后怎么处理的**
全量 API 30 文件 193 passed、新增 7/7、材料测试 5/5。这条规则在 `docs/pitfalls.md` 已有，但下一批仍复现——说明规则要变成派单前置检查。

- 📎 excerpt: [evidence.gz](./evidence.gz) → TOOL-06

### TOOL-07 · sarch 在 Windows 的安装与退出码语义：make/gcc 不可用，scan/export exit 1 也不代表缺少会话

`batch` 2026-10-31 · `severity` low · `status` resolved · `source` dsh session-fa6fc042-a021-41fc-b735-2955b3a1321c（dsh--session-fa6fc042…md 第 810–885、1148–1206、1421–1499、2299–2317 行）

**1. 怎么出现的**
技能要求 `command -v sarch`、`make install-local`，本机 `sarch` 不在 PATH；`cargo/rustc` 有，`make`、`gcc`、`cl`、`zstd` 全缺失，Python 只有 WindowsApps 存根。按技能提示想 `make install-local` 直接走不通。之后 `sessions scan/export` 每次都 `[exit code: 1]`、`incomplete: true`，日志写 “session inventory/export is incomplete; inspect diagnostics and registry differences”，看起来像会话丢失。

**2. 怎么诊断的**
`rustc -vV` 显示 host `x86_64-pc-windows-msvc`，`vswhere` 找到 BuildTools 18；用 `cmd /c "VsDevCmd.bat -arch=x64 -host_arch=x64 && cargo build --release --locked"` 成功（53s），再手工把 `target/release/sarch.exe` 复制到 `%USERPROFILE%\.local\bin`。退出码问题查 JSON：`registry.dsh_expected=5`、`dsh_found=17`、`missing=[]`，`incomplete` 来自 registry 差异，不是会话缺失——按 `missing=[]` + 17 个已解析会话继续。

**3. 提了什么方案**
用 VsDevCmd 环境构建并手工安装（采用）；只信技能里的 make 步骤（不可行）；把 exit 1 当致命错误重跑（浪费时间）。

**4. 最后怎么处理的**
`doctor` 列出 4 个可用来源（claude-code/dsh/codex/copilot），17 个 DSH + 1 个 Codex 会话全部解析到 EOF，`incomplete` 如实写进覆盖记录。跨平台工具的安装说明与退出码语义都要按本机实际校准。

- 📎 excerpt: [evidence.gz](./evidence.gz) → TOOL-07

### TOOL-08 · 第三方安装脚本注释与代码不一致；装完 PATH 不刷新

`batch` 2026-10-31 · `severity` low · `status` resolved · `source` dsh session-aec02ff6-d93d-4d5a-b94d-fd330bcf9d08（dsh--session-aec02ff6…md 第 1300–1343、1492–1508、1569–1577 行）

**1. 怎么出现的**
阿里云 Workbench 官方 `install.ps1` 注释写 “Normal user: installs to `%LOCALAPPDATA%\Programs\workbench\`”，代码却 `$InstallDir = Join-Path $env:ProgramFiles "workbench"`；普通用户执行必然 `对路径“workbench”的访问被拒绝`。用户按官方一行命令重试仍失败。安装后用户在新窗口执行 `workbench config` 又是 `CommandNotFoundException`——PATH 注册表已写，但现有终端/VSCode 集成终端继承旧环境。

**2. 怎么诊断的**
执行前先人工审阅脚本，失败后判断“注释说 LOCALAPPDATA、代码写死 ProgramFiles”，于是手动下载 zip、核对 `checksums.sha256`、解压到 `%LOCALAPPDATA%\Programs\workbench`、写用户 PATH；PATH 未生效时用 `$env:PATH += …` 或绝对路径，并解释 IDE 需完全重启才继承新环境。

**3. 提了什么方案**
管理员提权跑官方脚本（改系统目录，否）；手动复刻下载/校验/装用户目录（采用，无提权且可验证 SHA256）；给脚本传参数（改不了写死的 ProgramFiles）。

**4. 最后怎么处理的**
`workbench version` 输出 `v1.0.4`、checksum 校验通过；用户自行配置凭据成功。安装脚本要读代码，不能只读注释。

- 📎 excerpt: [evidence.gz](./evidence.gz) → TOOL-08

### TOOL-09 · Windows PowerShell 向远程 Linux 传多行命令：引号会被吃掉，改用 base64

`batch` 2026-10-31 · `severity` low · `status` resolved · `source` dsh session-aec02ff6-d93d-4d5a-b94d-fd330bcf9d08（dsh--session-aec02ff6…md 第 1686–1703、1705–1728 行）

**1. 怎么出现的**
用 here-string 拼多行 shell 传给 `workbench exec -c`，报 `Error: bad flag syntax: ---; grep -E '^(PRETTY_NAME|VERSION_ID)=' /etc/os-release`，回显退化成 `echo ---`、`[exit code: 1]`。PowerShell 的引号/换行拆分把 `---` 当成了参数。

**2. 怎么诊断的**
没有继续调转义，而是换传输层：PowerShell 只生成一个不含引号问题的 base64 字符串，远端 `echo <b64> | base64 -d | bash` 执行，一次拿到 OS/地域/磁盘/内存/监听端口。

**3. 提了什么方案**
逐条命令单独 `exec`（往返多、环境不保留）；PowerShell 转义/`--%`/参数数组（容易继续踩引号）；base64 包裹（采用，代价是命令不可读）。

**4. 最后怎么处理的**
base64 版本 `exit_code: 0`，同时拿到 `region-id=cn-guangzhou` 与系统信息。跨 shell 传脚本，走编码层比调引号稳。

- 📎 excerpt: [evidence.gz](./evidence.gz) → TOOL-09

### TOOL-10 · pnpm 往 stderr 写日志，PowerShell 报 exit 1 的假失败

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh 7a61d060-c547-4b14-8cf4-d637aaa30195（dsh--7a61d060…md 第 10940–10971 行）

**1. 怎么出现的**
`pnpm exec vitest run` 实际通过，工具却报 `[exit code: 1]`，输出里有 `NativeCommandError` / “程序 ‘pnpm’ 已退出”；紧接着 `$LASTEXITCODE` 是 0。这和 VER-02 的假绿正好相反：一个把失败报成成功，一个把成功报成失败。

**2. 怎么诊断的**
PowerShell 5.1 对原生命令写 stderr 的默认处理会按错误记录；pnpm 把进度/警告写到 stderr。改用 `cmd /c` 包裹并只信 `$LASTEXITCODE`，或把输出重定向到文件再 grep 结论。

**3. 提了什么方案**
`$LASTEXITCODE` 作为唯一判据（采用）；关 `$ErrorActionPreference`（只影响 PowerShell 错误，不改原生命令退出码，不彻底）；`2>&1 | Out-String` 后判 `$LASTEXITCODE`（常用）。

**4. 最后怎么处理的**
复核后 `exit=0`，同批测试全过。在 Windows 上，工具输出的 `[exit code: N]` 与真实退出码要分开看。

- 📎 excerpt: [evidence.gz](./evidence.gz) → TOOL-10

### TOOL-11 · `pg_ctl -w start` 在 PowerShell 后台 job 里挂住，`job_kill` 会连带杀掉临时集群

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh 7a61d060-c547-4b14-8cf4-d637aaa30195（dsh--7a61d060…md 第 9781–9850 行）

**1. 怎么出现的**
为了跑集成测试，在后台 job 里启动本机 PostgreSQL 临时集群：`pg_ctl -w start` 一直不返回，job 显示运行中；等不及用 `job_kill` 结束，结果把 `postgres` 进程树一并杀掉，临时库不可用，后续测试报连接失败。

**2. 怎么诊断的**
`pg_ctl -w` 等的是“服务器已启动”，但 PowerShell job 的管道句柄让子进程无法按预期脱离；`job_kill` 结束的是整个作业棵树。改用 `cmd /c` 启动并 `pg_isready -h 127.0.0.1 -p <port>` 轮询就绪，再跑测试。

**3. 提了什么方案**
`cmd /c start /b` 或 `Start-Process` 脱离（采用）+ `pg_isready` 轮询（采用）；直接 `pg_ctl -w` 等（失败）；结束后按 PID/数据目录精确清理。

**4. 最后怎么处理的**
临时集群正常起来、db 16/16 通过，跑完按 PID 停库并删除数据目录。长驻服务要脱离 job 树，否则收尾动作会反噬。

- 📎 excerpt: [evidence.gz](./evidence.gz) → TOOL-11
