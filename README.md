# 澹板０缃戠粶鎬濇斂宸ヤ綔瀹ょ綉绔?
杩欐槸涓€涓潰鍚戝伐浣滃浣跨敤鐨勪綆鎴愭湰缃戠珯鏂规锛?
- `Node + Express` 鎻愪緵鍓嶅悗绔竴浣撴湇鍔?- `SQLite` 淇濆瓨璐﹀彿銆佺礌鏉愬厓鏁版嵁銆佸鐗囥€佸緟鍔炪€佸洟闃熷拰鏃ュ織
- 鍥剧墖鍜岃棰戠洿鎺ュ瓨鏀惧湪鏈嶅姟鍣ㄧ鐩?- 閫傚悎涓€鍙伴樋閲屼簯 ECS 鐩存帴閮ㄧ讲

## 鍔熻兘

- 绱犳潗搴擄細娴忚銆佺瓫閫夈€佹悳绱㈠浘鐗囧拰瑙嗛
- 瀹＄墖涓績锛氶€氳繃銆侀€€鍥炪€佸娉?- 寰呭姙浜嬮」锛氭柊澧炪€佸畬鎴愩€佸垹闄?- 鏈嶅姟鍣ㄧ収鐗囧悓姝ワ細鎵弿 `server/uploads/inbox`
- 绠＄悊鍛樼櫥褰曪細淇濇姢鍐欐搷浣?- 杩愮淮鐘舵€侊細鏄剧ず鍚屾鐘舵€併€佺櫥褰曠姸鎬佸拰鍩虹杩愯淇℃伅

## 鏈湴杩愯

1. 瀹夎渚濊禆

```bash
npm install
```

2. 閰嶇疆鐜鍙橀噺

```bash
copy .env.example .env
```

3. 鍚姩

```bash
npm run dev
```

鎵撳紑 `http://127.0.0.1:3001`

如果要让同一局域网里的手机或电脑访问，请直接打开 `http://<本机局域网IP>:3001`。默认服务已经监听 `0.0.0.0`，如果外部设备连不上，优先检查系统防火墙是否放行 `3001` 端口。

## 排障日志

日志默认写在 `server/logs/`，按天分文件，文件名形如 `2026-05-21.log`。

先按这条顺序查：
- 先看启动日志，确认端口、环境变量、数据库路径是否已经成功加载
- 再看请求日志里的 `statusCode` 和 `durationMs`，判断是静态资源、接口还是鉴权链路卡住了
- 然后看 `login_failure`、`upload_error`、`database_*` 这些事件，快速缩小到登录、上传或数据库层
- 最后看 `client_log`，确认是不是前端脚本报错

常见字段说明：
- `timestamp`：日志时间
- `level`：日志级别，通常是 `info`、`warn`、`error`、`fatal`
- `event`：事件名，例如 `startup`、`http_request`、`login_failure`
- `method`：请求方法
- `path`：请求路径
- `statusCode`：响应状态码
- `role`：当前用户角色
- `durationMs`：请求耗时
- `error.stack`：错误堆栈，定位数据库异常、未捕获异常最有用
- `category`：前端错误分类，通常用于 `client_log`

## 闃块噷浜?ECS 閮ㄧ讲

1. 鍑嗗涓€鍙?ECS锛屽畨瑁?Node.js 18+
2. 涓婁紶椤圭洰浠ｇ爜
3. 閰嶇疆 `.env`
4. 瀹夎渚濊禆锛歚npm install --omit=dev`
5. 鍚姩锛?
```bash
npm run start
```

鎴栬€呬娇鐢?PM2锛?
```bash
npm run pm2:start
```

## 杩愯鐩綍

- 鏁版嵁搴擄細`server/data/studio.sqlite`
- 涓婁紶鍥剧墖锛歚server/uploads/media`
- 鏈嶅姟鍣?inbox锛歚server/uploads/inbox`

## 澶囦唤寤鸿

鍙渶瑕佸浠借繖涓ゆ牱锛?
- `server/data/studio.sqlite`
- `server/uploads/`

## 棣栨璐﹀彿

榛樿绠＄悊鍛樿处鍙风敱 `.env` 閲岀殑杩欎袱涓€煎喅瀹氾細

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

涓婄嚎鍓嶈鍔″繀淇敼瀵嗙爜銆?
