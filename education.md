# Snake Game 專案學習指南

這份文件不是逐行解說，而是幫你抓住這個專案最值得學的設計。建議先玩一局，再依照文中的檔案順序閱讀程式碼。

## 先記住三件事

1. **伺服器決定事實，瀏覽器只送意圖。** 玩家只能說「我要轉向」，不能決定座標、分數或勝負。
2. **多人遊戲必須在同一份快照上結算。** 所有蛇先計算下一格，再一起判定死亡，不能讓訊息抵達順序影響結果。
3. **網路協定是前後端共同的介面。** Python 與 TypeScript 各自定義一次資料格式，任何欄位變更都要同步修改與測試。

這三點比「怎麼畫一條蛇」更重要，也是這個專案和一般單檔 Canvas 貪食蛇最大的差別。

---

## 專案全貌

這是一個 server-authoritative（伺服器權威）的即時遊戲：

- 單人模式：48 × 27 棋盤、暫停與重置、配色循環、SQLite 排行榜。
- 多人模式：2–5 人、房間碼、房主開局、同步倒數、64 × 36 共用棋盤、存活排名。
- 後端：Python、FastAPI、WebSocket、asyncio、pytest。
- 前端：Next.js、React、TypeScript、Canvas 2D。

資料流如下：

```text
鍵盤輸入
   ↓
ClientMessage：玩家意圖
   ↓ WebSocket
Python 解析指令 → 遊戲或房間更新 → server tick
   ↓ WebSocket
ServerMessage：權威狀態快照
   ↓
React 選擇畫面 → Canvas 繪製棋盤
```

前端不預測下一格，也不自己加分。這讓規則集中、較難作弊，也讓多人玩家看到同一套結果；代價則是遊戲依賴網路，輸入需要等待伺服器的下一次狀態更新。

## 先把專案跑起來

需要兩個終端機。

後端：

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
./dev.sh
```

前端：

```bash
cd web
npm install
npm run dev
```

打開 <http://127.0.0.1:3000>。WebSocket 預設位於 `ws://127.0.0.1:8000/ws`。

請使用 `127.0.0.1`；部分環境會把 `localhost` 優先解析成 IPv6 的 `::1`，但後端開發伺服器只綁定 IPv4 loopback。

---

## 建議閱讀順序

| 階段 | 重點 | 先讀這些檔案 |
| --- | --- | --- |
| 1 | 一條蛇如何移動 | `backend/game/snake.py`、`collision.py` |
| 2 | 單人一個 tick | `backend/game/game.py` |
| 3 | 多人公平結算 | `backend/game/multiplayer.py`、`spawns.py` |
| 4 | 房間與時間 | `backend/room/room.py`、`clock.py`、`manager.py` |
| 5 | 網路邊界 | `backend/protocol.py`、`connection.py`、`transport.py` |
| 6 | 前端資料流 | `web/types/game.ts`、`hooks/useGameSession.ts` |
| 7 | 畫面與視野 | `web/lib/renderer.ts`、`vision.ts`、`board.ts` |
| 8 | 持久化與驗證 | `backend/leaderboard/repository.py`、`backend/tests/` |

完整訊息格式請查 `docs/protocol.md`；專案啟動與玩法則以 `README.md` 為準。

---

## 重點一：狀態的擁有權

### 瀏覽器送「意圖」

```json
{"type":"turn","direction":"UP"}
```

這個訊息只代表玩家想轉向。伺服器仍會檢查：

- 方向是否合法；
- 玩家是否仍存活；
- 遊戲是否處於可操作狀態；
- 多人模式中，這個 tick 是否已接受過一次轉向。

### 伺服器送「事實」

單人狀態使用 `state`，多人狀態使用 `game_state`。其中包含棋盤大小、蛇身、食物、分數、狀態與 tick 數，前端拿到後直接渲染。

因此：

- 在 DevTools 改畫面分數，下一個快照就會覆蓋回來。
- 每秒送一千次轉向也不會讓蛇加速，移動頻率由伺服器時鐘決定。
- 玩家中途斷線時，伺服器擁有的那一局與房間狀態不會被瀏覽器偷偷保留。

### 外觀不等於規則

有些資料適合留在前端：

- 伺服器只送 `palette` 索引，實際色碼在 `web/lib/palette.ts`。
- 棋盤格數由伺服器決定，視窗只決定每格畫幾個像素。
- 迷霧與敵人可見範圍在 `web/lib/vision.ts`，屬於顯示效果，不是安全機制；完整位置仍已送到瀏覽器。

判斷原則很簡單：**會影響勝負或可信資料的放後端，只影響呈現的放前端。**

---

## 重點二：一條蛇的資料結構

`backend/game/snake.py` 使用 `deque` 儲存蛇身，頭在最前面：

```text
head → [(8, 5), (7, 5), (6, 5)] ← tail
```

每次移動做兩件事：

1. `appendleft()` 加入新頭；
2. 沒有成長需求時，以 `pop()` 移除尾巴。

兩端操作都很直接，也符合蛇「頭加入、尾離開」的模型。

### 為什麼要緩衝轉向

蛇同時保留：

- `_direction`：已生效的方向；
- `_pending`：下一個 tick 要採用的方向。

假設蛇正向右，玩家在一個 tick 內快速按「上、左」。若第二次判定拿「上」當目前方向，「左」看似合法，但合併起來等於立刻反向撞進脖子。

本專案始終拿已生效的 `_direction` 判斷反方向，並在 `move()` 時才提交 `_pending`。多人模式再多一層限制：每位玩家每個 tick 最多接受一次有效轉向。

這裡值得學的不是 `deque` 語法，而是：**輸入發生的時間與狀態生效的時間不同時，要明確建模。**

---

## 重點三：單人 tick 的順序

`backend/game/game.py` 的 `Game.tick()` 是單人規則核心：

```text
不是 running → 不處理
計算 next_head
檢查牆壁與自身碰撞
判斷是否吃到食物
需要時先標記 grow
移動蛇
更新 ticks、score、palette
補生食物
```

順序不能隨便交換：

- **先碰撞、後移動**：死亡時不會先把蛇畫進非法位置。
- **先成長、後移動**：吃到食物的同一個 tick 就保留尾巴，長度立即增加。
- **尾巴不算自身碰撞**：正常移動時尾巴會在同一 tick 離開，所以頭可以走進它原本所在的格子。
- **從空格清單抽食物**：不反覆隨機猜座標，棋盤接近填滿時仍保證結束。
- **注入亂數 seed**：測試可重現食物位置，不依賴運氣。

注意跨蛇碰撞不適用「尾巴即將離開」的豁免。另一條蛇可能在同一 tick 吃東西而保留尾巴，因此多人規則選擇以 tick 開始時的完整身體為準。

---

## 重點四：多人遊戲為什麼要分階段

多人模式最關鍵的程式在 `backend/game/multiplayer.py`。

錯誤做法是依序處理玩家：A 先移動、B 再碰撞。這會使結果依賴玩家順序，甚至依賴網路訊息誰先抵達。

正確做法是 lockstep：

```text
1. 從同一份舊狀態計算所有 next_head
2. 從同一份舊狀態判定所有死亡
3. 只替存活者結算食物
4. 所有存活者一起移動
5. 更新死亡、分數並補生食物
6. 清除本 tick 的轉向額度
```

這個模型明確處理四種死亡：

- 撞牆或撞自己；
- 撞上其他蛇的身體；
- 多個頭進入同一格；
- 兩條蛇互換頭部位置。

同一 tick 撞向同一顆蘋果的蛇會先因頭對頭碰撞死亡，所以沒有人得分。所有判定都基於同一張快照，玩家加入順序和封包抵達順序不會改變死亡結果。

### 排名也要保存事實

死亡時記錄 `died_at_tick`，結算時再依「存活時間優先、分數其次」排序。不要事後從剩餘蛇身猜測誰先死亡；會影響排名的事件應在發生當下記錄。

同條件玩家共享名次，採競賽排名：`1, 1, 3`。

---

## 重點五：房間、遊戲與非同步要分開

後端刻意分成三層：

| 層次 | 責任 | 不該知道的事 |
| --- | --- | --- |
| `game/` | 移動、碰撞、食物、分數、排名 | WebSocket、React、房間碼 |
| `room/` | 玩家名單、房主、倒數、回合生命週期 | JSON 解析、Canvas |
| `connection.py` | 將一條連線的命令路由到單人或房間 | 遊戲規則細節 |

`GameRoom` 本身是同步物件；真正的等待只集中在 `backend/room/clock.py`。一個房間一個 clock task，依序完成倒數、開始遊戲、固定間隔 tick、廣播狀態與結果。

在單一 asyncio event loop 中，沒有 `await` 的同步規則區段不會被其他 coroutine 插入，因此核心遊戲不需要執行緒鎖。耗時的 SQLite 操作則應移到 worker thread，避免阻塞所有房間的時鐘。

房間狀態只存在記憶體：最後一人離開便移除，閒置等待中的房間也會過期。排行榜才是需要持久化的資料。

---

## 重點六：協定就是跨語言 API

協定的主要接縫是：

```text
backend/protocol.py          解析命令、建立伺服器訊息
backend/game/game.py         單人 state
backend/game/multiplayer.py  多人 game_state
backend/room/room.py         lobby_state、results
web/types/game.ts            前端的訊息型別
docs/protocol.md             完整文件
```

目前沒有共用 schema 或 code generation，所以 Python 與 TypeScript 不會自動保持一致。變更欄位時至少要一起檢查：

1. 後端序列化輸出；
2. `web/types/game.ts`；
3. `useGameSession` 的 reducer；
4. 使用該欄位的畫面或 renderer；
5. wire 與 protocol 測試；
6. `docs/protocol.md`。

### 把網路輸入當成不可信資料

`backend/protocol.py` 的 `parse()` 是無副作用的純函式。它會：

- 限制訊息大小；
- 捕捉無效 JSON；
- 驗證物件形狀與欄位型別；
- 拒絕未知命令與方向；
- 回傳命令值或 `None`，而不是讓例外中斷連線。

特別注意 Python 的 `bool` 是 `int` 的子類別，所以整數欄位不能只使用 `isinstance(value, int)`。這是邊界驗證中很典型的語言細節。

---

## 重點七：前端的分層

前端的核心路徑是：

```text
web/lib/input.ts
  鍵盤 → ClientMessage
        ↓
web/lib/websocket.ts
  只處理連線、JSON 與重連
        ↓
web/hooks/useGameSession.ts
  ServerMessage → React session state / phase
        ↓
web/app/page.tsx
  依 phase 選畫面
        ↓
web/components/game/GameCanvas.tsx
        ↓
web/lib/renderer.ts
  根據快照重畫 Canvas
```

`useGameSession` 是 React 與 framework-free 模組之間唯一主要接縫。它用 reducer 一次套用一個伺服器訊息，避免同一訊息造成的多個 state setter 在不同 render 才完成。

`phase` 是前端擁有的 UI 狀態，但它由伺服器訊息推導；它決定顯示 menu、lobby、playing 或 results，不自行判斷遊戲輸贏。

WebSocket 斷線後會嘗試重連，但原本的 run 或房間歸伺服器所有，因此 UI 先回 loading，重連後取得新的 session，而不是假裝本地舊狀態仍有效。

### Canvas 與 DOM 各做什麼

- Canvas：棋盤、蛇、食物、迷霧等每幀重畫的內容。
- DOM/React：按鈕、表單、分數、玩家名單、狀態提示等互動介面。

棋盤保持 16:9，`useBoardRect` 計算能放進視窗的最大矩形；Canvas backing store 再乘上 `devicePixelRatio`，避免高密度螢幕模糊。所有 UI 以 cell 尺寸作為共同尺度，因此視窗縮放只改變呈現大小，不改變遊戲規則。

---

## 重點八：持久化邊界

只有單人排行榜會寫入資料庫。`backend/leaderboard/repository.py` 用 `LeaderboardRepository` Protocol 隔離儲存實作，現在提供 SQLite；若要加入 PostgreSQL，應新增 repository 實作，而不是改動遊戲或 WebSocket 協定。

排行榜的規則包括：

- 分數只能從伺服器執行完的 `Game.score` 寫入，客戶端沒有「提交分數」訊息；
- 每個暱稱只保留最佳成績；
- 同分時較早達成者在前；
- 0 分局不記錄；
- 最多保存 100 名，主畫面顯示前 10 名；
- 可見前 10 名的暱稱會被保留，避免冒名。

這層即使只接收內部呼叫，仍會驗證暱稱與分數。模組邊界的價值之一，就是不把正確性建立在「呼叫者應該小心」上。

---

## 測試策略

後端規則大多是同步物件或純函式，所以不需要啟動瀏覽器或真實 socket 就能驗證。測試依責任分組：

```text
snake        身體、成長、轉向緩衝
collision    牆與自身碰撞
game         單人 tick、食物、分數、狀態
multiplayer  多蛇同步結算與排名
room         房間碼、房主、名單、生命週期
leaderboard  排行榜持久化規則
wire         單人序列化格式
command      單人命令
protocol     完整訊息契約與真實 WebSocket
```

執行後端測試：

```bash
cd backend
.venv/bin/pytest
.venv/bin/pytest -m multiplayer
.venv/bin/pytest -k "two_heads"
```

目前後端共收集 346 個測試；數字會隨專案演進，應以 `pytest --collect-only -q` 的結果為準。

前端把容易測的數學與規則抽離 React，目前涵蓋棋盤縮放、配色與視野：

```bash
cd web
npm test
npm run typecheck
npm run lint
npm run build
```

測試最重要的不是數量，而是守住「順序敏感」和「跨邊界」的行為，例如：

- 一個 tick 內連按兩次不能反向；
- 多蛇死亡判定不受玩家處理順序影響；
- 同一格的頭對頭碰撞全部死亡；
- Python 輸出的 wire shape 與 TypeScript 預期一致；
- 垃圾輸入不會關閉 WebSocket；
- 客戶端無法提交自己的分數。

---

## 動手練習

### 1. 追一個方向鍵

從 `web/lib/input.ts` 開始，追到 `Game.turn()` 或 `GameRoom.turn()`，再找到下一個 `tick()` 如何把 pending direction 變成新座標。完成後你應能解釋「為什麼按鍵不會直接移動蛇」。

### 2. 手算一次多人 tick

畫兩條相向的蛇，列出舊座標、各自 target、doomed 集合、移動後座標。再把它改成兩蛇互換頭部位置，確認兩者都會死亡。

### 3. 新增一個協定欄位

先不要寫程式，列出所有需要修改的檔案與測試。若只想到 Python 或只想到 TypeScript，表示尚未掌握跨語言契約的維護成本。

### 4. 區分規則與外觀

思考以下需求應放哪裡，並說明理由：

- 蘋果改成星形；
- 吃到蘋果加 2 分；
- 敵人超過 5 格不顯示；
- 超過 5 格的敵人不能碰撞你。

前兩組答案不完全相同：形狀與顯示範圍是外觀，分數與碰撞則是伺服器規則。

---

## 常見修改的落點

| 想改的功能 | 主要位置 | 容易漏掉 |
| --- | --- | --- |
| 蛇移動或成長 | `backend/game/snake.py` | `test_snake.py` |
| 單人計分或食物 | `backend/game/game.py` | wire 格式與排行榜 |
| 多人碰撞 | `backend/game/multiplayer.py` | 同 tick 公平性測試 |
| 房間人數或流程 | `backend/room/` | server config、前端 lobby |
| 新增訊息 | `backend/protocol.py` | `web/types/game.ts`、協定文件 |
| 新增畫面階段 | `useGameSession.ts`、`page.tsx` | 斷線與重賽流程 |
| 棋盤視覺 | `web/lib/renderer.ts`、`vision.ts` | DPR、效能、前端測試 |
| 排行榜規則 | `leaderboard/repository.py` | 資料遷移與保留暱稱 |

## 最後的自我檢查

讀完後，應該能回答：

1. 為什麼客戶端送的是方向，而不是新座標？
2. 為什麼單人模式能直接處理一條蛇，多人模式卻必須先收集所有 target？
3. 為什麼自己的尾巴可以豁免碰撞，別人的尾巴不行？
4. 為什麼 `useGameSession` 可以擁有 `phase`，卻不應擁有勝負規則？
5. 新增一個 wire 欄位時，哪些檔案必須同步？
6. 哪些資料需要持久化，哪些只適合留在記憶體？

若這六題都能用專案中的實際檔案回答，就已掌握這個 repo 最重要的設計。
