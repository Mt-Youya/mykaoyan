# API 涓婁簯鎿嶄綔鎵嬪唽锛堟柟妗?B锛歐orker 鍓嶇 + ECS API锛?

> 閫傜敤锛歚mykaoyan.cn` 鍓嶇缁х画璺?Cloudflare Worker锛宍api.mykaoyan.cn` 璺戝箍宸?ECS 涓婄殑 NestJS API銆?
> 鏈枃鍙啓鎿嶄綔姝ラ涓庡彇鍊兼潵婧愶紝涓嶈褰曚换浣曠湡瀹炲瘑閽ャ€佽处鍙枫€両P銆俉indows 11 涓?macOS 鍛戒护鍒嗗紑鍐欍€?

## 1. 褰撳墠鐘舵€?

| 椤?| 鐘舵€?|
| --- | --- |
| 骞垮窞 ECS | 宸茶喘涔帮紝澶囨宸叉彁浜よ嚦绠″眬瀹℃牳 |
| 澶囨 | 绠″眬瀹℃牳涓紙棰勪及 10 涓伐浣滄棩锛屾渶闀?20锛?|
| mykaoyan.cn DNS | 浠嶅湪闃块噷浜?hichina锛?*澶囨閫氳繃鍓嶄笉鍔?*锛岀綉绔欐殏涓嶅澶?|
| 鍓嶇 Worker | 宸查儴缃?`mykaoyan-web`锛岀瓑 NS 鍒囨崲鍚庣敓鏁?|
| ACR 浠撳簱 | **宸插純鐢紙2026-10-31锛?*锛氫釜浜虹増鍩熷悕 `crpi-鈥ersonal.cr.aliyuncs.com` 鍏綉 NXDOMAIN锛岄儴缃叉敼涓?registry-less锛歳unner 鏋勫缓闀滃儚鍚?`docker save | gzip | ssh docker load` 鍒?ECS |
| GitHub `production` | 閮ㄧ讲鍙渶 `DEPLOY_HOST`銆乣DEPLOY_USER`銆乣DEPLOY_SSH_KEY` 涓変釜 secrets锛沗DEPLOY_KNOWN_HOSTS` 宸茬Щ闄わ紙閮ㄧ讲鏃惰嚜鍔ㄦ姄鍙栦富鏈哄叕閽ワ級锛汚CR 鍙橀噺淇濈暀浣嗕笉鍐嶄娇鐢?|
| API 閮ㄧ讲宸ヤ綔娴?| 宸叉洿鏂?[.github/workflows/deploy-api.yml](../deploy-api.yml)锛氭瀯寤?`api` 闀滃儚銆丼SH 涓婁紶銆乣docker load`銆乧ompose 鏇存柊涓庡鍣ㄥ仴搴锋鏌?|
| 2026-10-31 閮ㄧ讲鐘舵€?| 闀滃儚宸插湪 GitHub runner 鏋勫缓骞堕€氳繃 SSH `docker load` 鍒?ECS锛泈eb/caddy 瀹瑰櫒宸插惎鍔紝**api 瀹瑰櫒鍥?ECS `/opt/mykaoyan-api/.env` 缂虹敓浜х煭淇￠厤缃€岄噸鍚?*锛坄SMS_PROVIDER` 绛夛級锛涜ˉ `.env` 鍚庨噸鍚嵆鍙紝鏃犻渶閲嶆柊鏋勫缓 |
| 鍩熷悕/DNS | `mykaoyan.cn`銆乣api.mykaoyan.cn` 鏆傛棤 A 璁板綍锛堝妗堟湭瀹屾垚锛夛紱Caddy 鐢宠璇佷功浼氭寔缁け璐ワ紝灞為鏈燂紝涓嶅奖鍝嶅鍣ㄨ繍琛?|
| API 闀滃儚鍏ュ彛 | 宸叉敼涓哄鍣ㄥ唴 `node --import tsx src/main.ts`锛坄apps/api` 鐨?`build` 鏄被鍨嬫鏌ワ紝涓嶅啀渚濊禆 `dist`锛?|
| Worker `/api` 鍙嶄唬 | 宸插姞鍒?`apps/web/worker-entry.ts`锛宍/api/**` 杞彂鍒?`https://api.mykaoyan.cn` |

## 2. GitHub `production` environment 閰嶇疆鎬昏〃

浣嶇疆锛氫粨搴?鈫?Settings 鈫?Environments 鈫?`production`銆?

| 鍚嶇О | 绫诲瀷 | 鍙栧€兼潵婧?| 鐘舵€?|
| --- | --- | --- | --- |
| `ACR_REGISTRY` | Variable | 宸插純鐢紙閮ㄧ讲涓嶅啀鎺ㄩ€侀暅鍍忎粨搴擄紱淇濈暀浠呬负鍘嗗彶璁板綍锛?| 鏈娇鐢?|
| `ACR_NAMESPACE` | Variable | 宸插純鐢?| 鏈娇鐢?|
| `ACR_USERNAME` | Secret | 宸插純鐢?| 鏈娇鐢?|
| `ACR_PASSWORD` | Secret | 宸插純鐢?| 鏈娇鐢?|
| `DEPLOY_HOST` | Secret | ECS 鍏綉 IP 鎴栫粦瀹氱殑 EIP锛?*鍏堝～ IP**锛屼笉瑕佸～鍩熷悕锛?| 宸查厤 |
| `DEPLOY_USER` | Secret | SSH 鐧诲綍 ECS 鐨勭敤鎴凤紙`whoami` 纭锛屽父瑙?`root` / `ubuntu`锛?| 宸查厤 |
| `DEPLOY_SSH_KEY` | Secret | 閮ㄧ讲绉侀挜鏂囦欢鍏ㄦ枃锛堝惈 BEGIN/END 琛岋級 | 宸查厤 |

閮ㄧ讲闀滃儚涓嶅啀缁忚繃浠讳綍 registry锛欸itHub runner 鐢?`deploy/Dockerfile` 鏋勫缓 `mykaoyan-web:<sha>` / `mykaoyan-api:<sha>`锛宍docker save` 鍚庣粡 SSH锛坓zip 娴侊級鍦?ECS 涓?`docker load`锛屽啀 `docker compose up -d`銆傚洜姝?ACR 瀹炰緥涓嶅瓨鍦?杩囨湡涓嶅奖鍝嶉儴缃诧紱浠ｄ环鏄瘡娆￠儴缃插浼犵害鏁扮櫨 MB銆佽€楁椂鏇撮暱銆?

### ECS 杩愯鏃?`.env`锛圓PI 蹇呴渶锛?

涓荤珯 compose 涓?api compose 鍏辩敤 `/opt/mykaoyan-api/.env`锛堜富绔欓€氳繃 `/opt/mykaoyan/.env` 绗﹀彿閾炬帴澶嶇敤锛夈€傜敓浜х幆澧?API 鍚姩鏃跺己鍒惰姹備互涓嬪彉閲忥紝缂轰换涓€椤逛細鐩存帴閫€鍑猴細

| 鍙橀噺 | 璇存槑 |
| --- | --- |
| `DATABASE_URL`銆乣DATABASE_CA` | Supabase 鐩磋繛涓?CA |
| `BETTER_AUTH_SECRET`銆乣BETTER_AUTH_URL` | 浼氳瘽绛惧悕涓庣珯鐐瑰湴鍧€ |
| `SMS_PROVIDER` | 鐢熶骇鍙兘鏄?`aliyun` |
| `ALIYUN_ACCESS_KEY_ID` / `ALIYUN_ACCESS_KEY_SECRET` | 闃块噷浜戠煭淇¤璇?AccessKey |
| `ALIYUN_SMS_SIGN_NAME` / `ALIYUN_SMS_TEMPLATE_CODE` | 鐭俊绛惧悕涓庢ā鏉?|
| `R2_*`銆乣MEDIA_SIGNING_KEY` | 濯掍綋涓庢挱鏀句护鐗?|
| `COMMUNITY_ENABLED` | 璇勮/鎶曠/璇勫垎寮€鍏筹紙鏈缃粯璁ゅ叧闂級 |

缂虹煭淇￠厤缃椂瀹瑰櫒鏃ュ織涓?`璁よ瘉鍚姩閰嶇疆缂哄け鎴栨棤鏁堬細SMS_PROVIDER`锛涜ˉ鍏ㄥ悗 `docker compose up -d` 閲嶅惎鍗冲彲銆?

`DEPLOY_KNOWN_HOSTS` 涓嶅啀鏄繀闇€ secret锛氶儴缃插伐浣滄祦鍦?ECS 涓婃墽琛屽墠鐢?`ssh-keyscan -H "$DEPLOY_HOST"` 鎶撳彇涓绘満鍏挜鍐欏叆 `~/.ssh/known_hosts`锛圱OFU锛夛紝骞剁敤 SSH 杩涘叆瀹瑰櫒鍋氬仴搴锋鏌ャ€傝嫢瑕佸浐瀹氭寚绾癸紝鍙彟鍔犱竴涓彲閫夌殑 `DEPLOY_KNOWN_HOSTS` secret锛屽苟鍦ㄥ伐浣滄祦閲屼紭鍏堜娇鐢ㄥ畠銆?

## 3. 涓绘満鍏挜锛堣嚜鍔ㄥ鐞嗭級

- 宸ヤ綔娴佸湪銆屾洿鏂?ECS compose銆嶆楠ゅ唴鎵ц `ssh-keyscan`锛屽け璐ヤ細閲嶈瘯 10 娆°€佹瘡娆￠棿闅?3 绉掞紱浠嶅彇涓嶅埌鍒欓儴缃插け璐ュ苟鎻愮ず妫€鏌ュ畨鍏ㄧ粍 22 绔彛銆?
- 棣栨閮ㄧ讲鍗充俊浠诲綋娆℃姄鍒扮殑鍏挜锛圱OFU锛夛紱鎹㈠疄渚?閲嶈绯荤粺/鎹?IP 鍚庢棤闇€鏀?secret锛屼笅涓€娆￠儴缃茶嚜鍔ㄦ洿鏂般€?
- 瀹夊叏杈圭晫锛歍OFU 涓嶈兘闃插尽閮ㄧ讲鏈轰笌 ECS 涔嬮棿鐨勪富鍔?MITM锛涜嫢闇€瑕佸己鏍￠獙锛屾妸 `ssh-keyscan` 杈撳嚭淇濆瓨涓?`DEPLOY_KNOWN_HOSTS` secret锛屽苟鍦ㄥ伐浣滄祦閲屾敼涓轰紭鍏堜娇鐢ㄨ鏂囦欢銆?

## 4. 濡傛灉杩橀渶瑕侀噸鏂扮敓鎴愰儴缃?SSH 瀵嗛挜

### Windows 11

```powershell
# 鐢熸垚锛堝彛浠ょ暀绌猴紝CI 鏃犳硶浜や簰杈撳叆鍙ｄ护锛?
ssh-keygen -t ed25519 -C "github-actions-mykaoyan" -f "$env:USERPROFILE\.ssh\mykaoyan-deploy"

# 鍏挜瑁呭埌 ECS锛堟妸 root 鎹㈡垚 DEPLOY_USER锛?
Get-Content "$env:USERPROFILE\.ssh\mykaoyan-deploy.pub" |
  ssh root@<ECS鍏綉IP> "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

# 楠岃瘉
ssh -i "$env:USERPROFILE\.ssh\mykaoyan-deploy" root@<ECS鍏綉IP> "whoami && docker --version"
```

鍙栫閽ュ唴瀹癸紙閬垮厤 CRLF 瀵艰嚧 CI 瑙ｆ瀽澶辫触锛夛細

```powershell
$key = Get-Content "$env:USERPROFILE\.ssh\mykaoyan-deploy" -Raw
$key = $key -replace "`r`n", "`n"
$key | Set-Clipboard
```

绮樿创杩?`DEPLOY_SSH_KEY`銆?

### macOS

```bash
ssh-keygen -t ed25519 -C "github-actions-mykaoyan" -f ~/.ssh/mykaoyan-deploy -N ""
ssh-copy-id -i ~/.ssh/mykaoyan-deploy.pub root@<ECS鍏綉IP>
ssh -i ~/.ssh/mykaoyan-deploy root@<ECS鍏綉IP> "whoami && docker --version"
cat ~/.ssh/mykaoyan-deploy   # 鍏ㄦ枃濉?DEPLOY_SSH_KEY
```

## 5. ECS 鍑嗗锛堝妗堥€氳繃鍓嶅氨鑳藉仛锛?

```bash
docker --version
docker compose version          # 蹇呴』鏄?v2锛涙病鏈夊氨 sudo apt-get install -y docker-compose-v2
sudo mkdir -p /opt/mykaoyan-api
sudo chown -R "$USER":"$USER" /opt/mykaoyan-api
```

瀹夊叏缁勶細

- 22锛氭斁琛岋紙鍔″繀鍙厑璁稿瘑閽ョ櫥褰曪紝绂佺敤瀵嗙爜鐧诲綍锛?
- 80/443锛?*澶囨閫氳繃鍚庡啀鏀捐**
- 80 杩樿鐣欑粰 Caddy 鐢宠 Let's Encrypt 璇佷功锛圚TTP-01锛?

## 6. ECS 涓婄殑 `/opt/mykaoyan-api/.env`

瀹屾暣鐨勫垱寤烘楠ゃ€佸彉閲忔ā鏉夸笌鏍￠獙鍛戒护瑙?[ECS API 杩愯鏃堕厤缃甝(./ecs-api-env.md)銆?

`chmod 600`锛屽彧鏀惧湪 ECS锛屼笉杩涗粨搴撱€佷笉杩涢暅鍍忋€?

| 鍙橀噺 | 鏉ユ簮 | 璇存槑 |
| --- | --- | --- |
| `NODE_ENV` | 鍥哄畾 | `production` |
| `PORT` | 鍥哄畾 | `3001` |
| `DATABASE_URL` | Supabase 鈫?Project Settings 鈫?Database 鈫?Connection string 鈫?**Transaction pooler锛?543锛?* | 蹇呴』鏄?6543 涓斿甫 `sslmode=verify-full`锛涘瘑鐮佹浛鎹㈡垚椤圭洰瀵嗙爜 |
| `DATABASE_CA` | Supabase 鈫?Database 鈫?SSL Configuration 鐨?CA 璇佷功 | 鍙€夛紱`verify-full` 鏍￠獙澶辫触鏃跺啀濉紝涓嶈兘濉┖涓?|
| `MEDIA_SIGNING_KEY` | 涓庡獟浣?Worker 鐨?secret 鐩稿悓 | 鈮?2 瀛楃锛孉PI 绛惧彂銆乄orker 楠岀 |
| `MEDIA_BASE_URL` | 濯掍綋 Worker 鐨勮嚜瀹氫箟鍩熷悕 | 鍙€夛紱鐢ㄤ簬鎷兼帴鎾斁鍦板潃 |
| `BETTER_AUTH_SECRET` | 鑷繁鐢熸垚 | 鈮?2 瀛楃锛沗openssl rand -hex 32` 鎴?PowerShell 闅忔満 64 浣?hex |
| `BETTER_AUTH_URL` | `https://mykaoyan.cn` | 鍓嶇鍏紑鍦板潃锛堢櫥褰曡蛋鍚屾簮 `/api` 浠ｇ悊锛?|
| `AUTH_TRUSTED_ORIGINS` | `https://mykaoyan.cn` | 鍏佽鎼哄甫 cookie 璋冭璇佹帴鍙ｇ殑 origin |
| `AUTH_COOKIE_DOMAIN` | `mykaoyan.cn` | 浼氳瘽 cookie 鏀惧埌鏍瑰煙锛岄〉闈笌 API 璺ㄥ瓙鍩熷叡浜櫥褰曟€?|
| `SMS_PROVIDER` | 鍥哄畾 | 鐢熶骇蹇呴』鏄?`aliyun` |
| `ALIYUN_ACCESS_KEY_ID` / `ALIYUN_ACCESS_KEY_SECRET` | RAM 鎺у埗鍙板垱寤哄瓙璐﹀彿 AK | 鍙巿浜堢煭淇?鍙风爜璁よ瘉鏉冮檺 |
| `ALIYUN_SMS_SIGN_NAME` | 闃块噷浜戠煭淇℃帶鍒跺彴 | 宸插鏍搁€氳繃鐨勭鍚?|
| `ALIYUN_SMS_TEMPLATE_CODE` | 闃块噷浜戠煭淇℃帶鍒跺彴 | 楠岃瘉鐮佹ā鏉?CODE |
| `ALIYUN_SMS_TEMPLATE_PARAM` | 榛樿 `{"code":"##code##","min":"5"}` | 涓庢ā鏉垮彉閲忓悕涓€鑷?|

> 浠ｇ爜渚т細琛?Better Auth 鐨勮法瀛愬煙 cookie锛圖omain=`.mykaoyan.cn`锛夛紝鍚﹀垯 `api.mykaoyan.cn` 涓婅缃殑 cookie 娴忚鍣ㄤ笉浼氬甫鍒?`mykaoyan.cn`銆?

## 7. 鏁版嵁搴撹縼绉伙紙API 涓婄嚎鍓嶏級

宸ヤ綔娴侊細[.github/workflows/migrations.yml](../.github/workflows/migrations.yml)锛屾墜鍔ㄨЕ鍙戯紝浣跨敤鐜 `database-dev` / `database-prod`锛屽悇闇€瑕佷竴涓?secret锛?

| Environment | Secret | 鍙栧€?|
| --- | --- | --- |
| `database-dev` | `MIGRATION_DATABASE_URL` | Supabase **Session/Direct锛?432锛?* 杩炴帴涓诧紝鏇挎崲瀵嗙爜 |
| `database-prod` | `MIGRATION_DATABASE_URL` | 鍚屼笂锛涙寮忓簱鎵嶅～ |

娉ㄦ剰锛?

- 涓嶈鎷垮悓涓€涓簱杩炶窇 dev 鍜?prod 涓ら亶锛涘彧鏈変竴濂?Supabase 鏃讹紝鍙厤 `database-prod` 鎴栧彧璺戜竴娆″苟鏍稿 `migration list`銆?
- 杩佺Щ鐢?5432锛屼笉瑕佺敤 6543锛堜簨鍔℃睜涓嶆敮鎸?DDL锛夈€?

## 8. 澶囨閫氳繃鍚庣殑涓婄嚎椤哄簭

1. **鍒?NS**锛氶樋閲屼簯鍩熷悕鎺у埗鍙?鈫?mykaoyan.cn 鈫?DNS 淇敼 鈫?濉?Cloudflare 缁欑殑涓ゅ彴锛?
   `micah.ns.cloudflare.com`銆乣sandra.ns.cloudflare.com`
2. 绛夎В鏋愮敓鏁堬細`curl -s 'https://dns.google/resolve?name=mykaoyan.cn&type=NS'` 搴旇繑鍥炰笂闈袱鍙般€?
3. Cloudflare DNS 鍔?`api` 璁板綍锛欰 鈫?ECS 鍏綉 IP锛?*浠?DNS锛堢伆浜戯級**锛汣addy 瑕佺敤 HTTP-01 绛捐瘉涔︺€?
4. 瀹夊叏缁勬斁琛?80銆?43銆?
5. 璺?`migrations.yml`锛堝厛鏍稿 migration list锛夈€?
6. 鍦?`/opt/mykaoyan-api/.env` 鏀惧ソ杩愯鏃跺彉閲忥紙瑙佺 6 鑺傦級锛岀劧鍚庤窇 `deploy-api.yml`锛?
   - 鏋勫缓 `api` 闀滃儚骞舵帹 ACR
   - 鎶?`deploy/api-compose.yaml` 澶嶅埗涓?`/opt/mykaoyan-api/api-compose.yaml`銆乣deploy/api-Caddyfile` 澶嶅埗涓?`/opt/mykaoyan-api/Caddyfile`
   - `docker compose -f api-compose.yaml pull && up -d`锛屽啋鐑?`/api/health`
7. 楠屾敹 API锛?

```bash
curl -s https://api.mykaoyan.cn/api/health
# 鏈熸湜 {"status":"ok","database":"connected"}
```

8. 閲嶆柊鍙戝竷 Worker锛堣 `/api` 鍙嶄唬鐢熸晥锛夛細

```bash
pnpm --filter @mykaoyan/web build:workers
pnpm --filter @mykaoyan/web deploy:workers
```

鍐嶆墦寮€ `https://mykaoyan.cn`锛岃瘯鎷涚敓鏌ヨ銆佽绋?璁蹭箟銆佺櫥褰曘€?

9. 澶囨閫氳繃鍚庤ˉ鍓嶇搴曢儴澶囨鍙凤紙閾炬帴 `https://beian.miit.gov.cn/`锛夈€?

## 9. 楠岃瘉涓庡洖婊?

- 閮ㄧ讲 workflow 鍐掔儫澶辫触浼氱孩锛屼絾涓嶄細鑷姩鍥炴粴锛涙寜涓婁竴娆￠暅鍍?tag 閲嶆柊 `docker compose up -d`銆?
- ECS 涓婃煡鐪嬶細`cd /opt/mykaoyan-api && docker compose ps && docker compose logs --tail=100 api`銆?
- 鏁版嵁搴撹縼绉讳笉鑷姩鍥炴粴锛涜縼绉诲墠纭澶囦唤锛坄operations.yml` 鐨勫浠芥祦绋嬶級銆?

## 10. 甯歌闂

| 鐜拌薄 | 鍘熷洜 | 澶勭悊 |
| --- | --- | --- |
| `ssh-keyscan` 杈撳嚭涓虹┖ | 22 鏈斁琛?/ 缃戠粶鎷︽埅 | 瀹夊叏缁勬斁琛?22锛涙垨鐢?ECS 涓婄殑鍏挜鎷?known_hosts |
| CI 鎶?`Permission denied (publickey)` | 绉侀挜涓?ECS `authorized_keys` 涓嶅尮閰?/ 鐢ㄦ埛閿?| 閲嶆柊 `ssh-copy-id`锛岀‘璁?`DEPLOY_USER` |
| CI 鎶ヤ富鏈烘牎楠屽け璐?| known_hosts 涓庡綋鍓?IP 涓嶇 | 閲嶆柊鐢熸垚 `DEPLOY_KNOWN_HOSTS` |
| `docker login` 澶辫触 | 鐢ㄦ垚浜嗛樋閲屼簯鐧诲綍瀵嗙爜 | 鐢?ACR銆岃闂嚟璇併€嶉噷鐨勫浐瀹氬瘑鐮?|
| `docker compose` 涓嶅瓨鍦?| 鍙浜?Docker | `sudo apt-get install -y docker-compose-v2` |
| API 瀹瑰櫒璧蜂笉鏉?| 鏌ョ湅 `docker compose logs api`锛涘叆鍙ｆ槸 `node --import tsx src/main.ts`锛岄渶瑕侀暅鍍忓唴 `tsx` 渚濊禆锛堝凡澹版槑鍦?`apps/api` dependencies锛?| 鎸夋棩蹇椾慨鐜鍙橀噺鎴栦緷璧?|
| `api.mykaoyan.cn` 404/瓒呮椂 | DNS 鏈寚鍚?ECS銆?43 鏈斁琛屻€丆addy 璇佷功鏈 | 鎸夌 8 鑺傞『搴忔鏌?|
| 鐧诲綍鍚庣珛鍒绘帀绾?| cookie 鍙湪 `api` 瀛愬煙 | 浠ｇ爜渚ц法瀛愬煙 cookie 閰嶇疆 |

## 11. Windows 11 涓€娆℃€ф鏌ヨ剼鏈紙PowerShell锛?

```powershell
Get-Command ssh, ssh-keygen, ssh-keyscan
ssh -i "$env:USERPROFILE\.ssh\mykaoyan-deploy" <DEPLOY_USER>@<ECS鍏綉IP> "whoami; docker --version; docker compose version"
ssh-keyscan -H <ECS鍏綉IP> 2>$null | Out-File -Encoding ascii "$env:USERPROFILE\known_hosts.txt"
Get-Content "$env:USERPROFILE\known_hosts.txt"
```
