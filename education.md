# 這個專案該學的東西

一份從零開始、由淺入深的導覽。每一章都指向這個 repo 裡的**真實程式碼**（檔名:行號），
不是通用教學範例。看到 `檔案:行` 就打開來對照著讀。

**讀法建議**：不要一次讀完。一次一章，每章末尾都有「動手做」和「自我檢查」，
做完再往下。前 4 章讀完你就能看懂整個遊戲邏輯了。

---

## 目錄

| 章 | 主題 | 難度 |
|---|---|---|
| 0 | 這個專案到底在幹嘛 | ★ |
| 1 | 先讓它跑起來 | ★ |
| 2 | 資料長什麼樣子 | ★ |
| 3 | 一個 tick 裡發生什麼事 | ★★ |
| 4 | 蛇的身體：deque 與轉向緩衝 | ★★ |
| 5 | 碰撞判定：為什麼尾巴不算 | ★★ |
| 6 | 食物：為什麼不用「隨機猜到好」 | ★★ |
| 7 | WebSocket 到底是什麼 | ★★★ |
| 8 | 並行：thread、mutex、condition_variable | ★★★ |
| 9 | 前端分層：誰可以知道什麼 | ★★ |
| 10 | Canvas 渲染與螢幕解析度 | ★★ |
| 11 | 測試是怎麼寫的 | ★★ |
| 12 | 這個專案「刻意沒做」的事 | ★★★ |
| — | 名詞表 | — |

---

## 第 0 章：這個專案到底在幹嘛

### 一句話

**C++ 寫的伺服器擁有整個遊戲；瀏覽器只負責「畫出來」和「把按鍵送過去」。**

### 為什麼這很重要

想像另一種寫法：整個貪食蛇都用 JavaScript 寫在瀏覽器裡，伺服器只存分數。
這叫 **client-authoritative**（客戶端說了算）。它的問題是：

- 玩家打開 DevTools 就能改分數，因為分數是瀏覽器算的
- 玩家可以狂送訊息讓蛇跑更快，因為「時間」是瀏覽器控制的

這個專案用的是 **server-authoritative**（伺服器說了算）：

- **時鐘在伺服器**。伺服器每 0.12 秒自己走一步，你送再多訊息都不會變快
- **規則在伺服器**。分數、死亡、成長都是 C++ 算的，瀏覽器只是收到結果
- 瀏覽器**完全沒有遊戲狀態**。它收到什麼就畫什麼

> 這不是為了防作弊而過度設計。這是所有連線遊戲的預設架構——
> 從《英雄聯盟》到《Among Us》都是這個原則。

### 資料的流向

```
   你按下 ↑
       │
       ▼
  [瀏覽器] ──── {"type":"turn","direction":"UP"} ───▶ [C++ 伺服器]
       ▲                                                    │
       │                                              每 0.12 秒
       │                                              算一次 tick
       │                                                    │
       └──── {"type":"state","snake":[[12,11],...]} ────────┘
              （每個 tick 推一次，不管你有沒有按鍵）
```

注意兩個方向是**不對稱**的：

- 你送上去的是**意圖**（「我想往上」），不是結果
- 送下來的是**事實**（「蛇現在在這裡」），不是建議

瀏覽器沒有任何權力去「決定」蛇在哪。

### 自我檢查

1. 如果我用程式碼每秒送 1000 次 `{"type":"turn"}`，蛇會跑比較快嗎？為什麼？
2. 如果我在 DevTools 裡把畫面上的分數改成 999，重新整理後會怎樣？

<details>
<summary>參考答案</summary>

1. 不會。移動只發生在 `Game::tick()`，而 `tick()` 只被伺服器的計時執行緒呼叫
   （`main.cpp:84` 那個 ticker thread）。送訊息只會改變「下一步往哪走」。
2. 分數會變回伺服器記的值。因為畫面是 `state.score` 渲染出來的，
   而 `state` 每個 tick 都被伺服器覆蓋一次。
</details>

---

## 第 1 章：先讓它跑起來

看程式碼之前先跑一次，你才有東西可以對照。

```bash
# 終端機 1：遊戲伺服器
cd game-server
cmake -S . -B build      # 產生建置檔（只有第一次、或改了 CMakeLists.txt 才要）
cmake --build build      # 真正編譯
./build/game-server      # 開始監聽 ws://127.0.0.1:8000/ws
```

```bash
# 終端機 2：前端
cd web
npm run build && npm start   # http://127.0.0.1:3000
```

打開 <http://127.0.0.1:3000/game>。

### 這裡有兩個坑，先講清楚免得你以為是自己弄壞的

**坑 1：`npm run dev` 在這台機器上不會動。**
畫面會出現，但永遠停在 "connecting"，而且**完全不報錯**。
原因不是程式碼——連一個 5 行的空白測試頁都一樣不會 hydrate（見第 9 章）。
懷疑是 Node v25（非 LTS 版本）。**開發時請用 `npm run build && npm start`。**

**坑 2：`npm run lint` 壞的。**
Next.js 16 拿掉了 `next lint` 指令，但 `package.json` 裡還留著。
會噴 "no such directory: .../web/lint"。不是你的問題，不用追。

### 為什麼要用 `127.0.0.1` 而不是 `localhost`

伺服器只綁定 loopback（`WebSocketServer.cpp` 裡的 `INADDR_LOOPBACK`），
而且是 IPv4。macOS 上 `localhost` 可能先解析成 IPv6 的 `::1`，就連不上了。
所以 `web/.env.local` 裡寫的是 `ws://127.0.0.1:8000/ws`。

### 動手做

1. 跑 `curl http://127.0.0.1:8000/health`，應該回 `{"status":"ok"}`。
   這證明伺服器活著，而且它會回應**普通 HTTP**，不只是 WebSocket。
2. 用 `PORT=9000 ./build/game-server` 換個埠號跑跑看，然後改 `web/.env.local` 讓前端連過去。

---

## 第 2 章：資料長什麼樣子

在讀任何邏輯之前，先搞懂「資料的形狀」。這是讀懂任何程式碼最快的路。

### 格子座標

整個棋盤是 24×24 的格子。**不是像素**。

```
      x →
  y   (0,0) (1,0) (2,0) ...
  ↓   (0,1) (1,1)
      (0,2)
```

注意 **y 往下增加**，跟數學課相反。這是因為螢幕座標系統就是這樣
（Canvas、CSS 都是），跟著它走可以少一次轉換。

`Direction::Up` 的向量因此是 `{0, -1}`——往上是 y **減少**。
看 `game-server/src/Snake.cpp:9` 的 `vectorOf()`。

### 傳輸格式（wire format）

伺服器每個 tick 推一包 JSON：

```json
{
  "type": "state",
  "width": 24, "height": 24,
  "status": "running",
  "score": 3,
  "ticks": 42,
  "snake": [[12,11],[12,12],[12,13]],
  "direction": "UP",
  "food": [7,2]
}
```

- `snake` 是**頭在前**的陣列。`snake[0]` 永遠是頭
- `food` 可能是 `null`（棋盤被填滿時）
- `status` 有四種：`ready` / `running` / `paused` / `game_over`

瀏覽器送上去的只有四種：

```json
{"type":"turn","direction":"UP"}   {"type":"start"}
{"type":"pause"}                   {"type":"reset"}
```

### ⚠️ 這個專案最重要的一條規則

這份格式被**寫了兩次**：

| 位置 | 語言 |
|---|---|
| `game-server/src/Game.cpp:113` `Game::toJson()` | C++ 產生它 |
| `web/types/game.ts` | TypeScript 描述它 |

**改一邊就必須同時改另一邊。** 沒有 schema、沒有 codegen、沒有任何測試會抓到不一致。
如果你在 C++ 加了一個欄位卻忘了改 TS，TypeScript 不會報錯——它只是不知道那個欄位存在。

> 這是刻意的取捨：為了讓 server 零相依（不裝 JSON 函式庫），
> 代價就是這份契約要靠人工維護。第 12 章會談怎麼改善。

### 動手做

打開兩個檔案並排看：`game-server/src/Game.cpp:113` 和 `web/types/game.ts`。
逐欄位對照一次，確認每個欄位兩邊都有。

---

## 第 3 章：一個 tick 裡發生什麼事

這是整個遊戲的心臟。**只有 25 行**，在 `game-server/src/Game.cpp:63`。

```cpp
void Game::tick() {
    if (status_ != GameStatus::Running) return;          // ① 沒在跑就什麼都不做

    const Cell target = snake_.nextHead();               // ② 先看「下一步會踩到哪」
    if (isFatal(target, snake_.cells(), width_, height_)) {
        status_ = GameStatus::GameOver;                  // ③ 會死就死，不移動
        return;
    }

    const bool eating = food_.has_value() && *food_ == target;
    if (eating) snake_.grow();                           // ④ 先記下要變長

    snake_.move();                                       // ⑤ 才真的移動
    ++ticks_;

    if (eating) {
        ++score_;
        if (!respawnFood()) {                            // ⑥ 放不下新食物 = 贏了
            status_ = GameStatus::GameOver;
        }
    }
}
```

### 每一步為什麼是這個順序

**② 先算再移動。** `nextHead()` 只是「計算」下一格在哪，不會真的動蛇
（`Snake.cpp:55`）。這讓我們可以在移動**之前**問「這一步會不會死」。
如果先移動再檢查，蛇已經穿牆了，你還得把它移回來。

**④ 在 ⑤ 之前。** 這是最容易寫錯的地方。`grow()` 只是把「欠一節」記在
`grow_` 這個計數器上，真正變長發生在 `move()` 裡。

為什麼順序重要？看 `Snake::move()`（`Snake.cpp:61`）：

```cpp
body_.push_front(nextHead());   // 頭往前長一格
if (grow_ > 0) {
    --grow_;                    // 有欠長度 → 尾巴不砍，蛇就變長了
} else {
    body_.pop_back();           // 沒欠 → 砍尾巴，長度不變
}
```

如果先 `move()` 再 `grow()`，尾巴已經被砍掉了，新的一節要等**下一個** tick
才會出現。玩家會看到吃到食物後蛇「慢一拍」才變長。

**⑥ 棋盤填滿 = 通關。** `respawnFood()` 回傳 `false` 代表沒有空格可以放食物了，
也就是蛇塞滿了整個棋盤。目前這被當成 `GameOver` 處理——
雖然實際上是「贏」。第 12 章會談這個。

### 自我檢查

1. 為什麼 `tick()` 第一行要檢查 `status_`？如果拿掉會怎樣？
2. 蛇吃到食物的那一個 tick，身體長度變化是多少？下一個 tick 呢？

<details>
<summary>參考答案</summary>

1. 拿掉的話，暫停和遊戲結束後蛇還是會繼續走。`status_` 是唯一擋住移動的東西。
2. 吃到的那個 tick：`push_front` 但不 `pop_back`，長度 +1。
   下一個 tick：`grow_` 已經歸零，正常砍尾巴，長度不變。
</details>

---

## 第 4 章：蛇的身體：deque 與轉向緩衝

### 為什麼用 `deque` 而不是陣列

蛇每一步都做兩件事：**頭端加一格、尾端砍一格**。

- 用 `std::vector`：從頭插入要把整個陣列往後搬，是 O(n)
- 用 `std::deque`（雙端佇列）：兩端進出都是 O(1)

`Snake.hpp` 裡就是 `std::deque<Cell> body_`。頭是 `body_.front()`。

### 轉向緩衝：一個很細但很重要的 bug 防線

先看一個會出事的寫法。假設蛇正往**右**走，玩家在同一個 tick 內飛快按了 **↑** 然後 **←**：

```
天真的做法（每次按鍵就馬上改方向）：
  按 ↑ → 方向變成 Up
  按 ← → 方向變成 Left   ← 「左」跟「右」是相反的，但因為中間經過了 Up，檢查沒擋住！
  tick → 蛇往左走，直接撞進自己的脖子，瞬間死亡
```

玩家完全沒做錯事，卻莫名其妙死了。

這個專案的解法（`Snake.cpp:48`）：

```cpp
void Snake::turn(Direction direction) {
    if (isOpposite(direction, direction_)) return;   // 注意是 direction_，不是 pending_
    pending_ = direction;
}
```

關鍵有兩個：

1. **按鍵不會馬上生效**，只存進 `pending_`。真正套用是在 `move()` 的第一行
   `direction_ = pending_;`（`Snake.cpp:62`）
2. **比對的對象是 `direction_`**（已經生效的方向），不是 `pending_`

所以上面那個情境：按 ↑ 存進 `pending_`；按 ← 時拿「左」跟**「右」**（`direction_` 還是右）比，
是相反的 → 直接忽略。`pending_` 還是 Up。tick 時蛇往上走。安全。

> ⚠️ 如果有人「順手優化」把 `direction_` 改成 `pending_`，這個保護就沒了。
> 測試 `tests/core_tests.cpp` 裡有一條就是專門守這個
> （"two turns in one tick cannot fold the snake"）。

### 動手做

把 `Snake.cpp:49` 的 `direction_` 改成 `pending_`，重新編譯跑測試：

```bash
cmake --build build && ./build/core_tests
```

看它是不是真的抓到了。**看完記得改回來。**

---

## 第 5 章：碰撞判定：為什麼尾巴不算

`game-server/src/Collision.cpp` 只有三個函式，而且都是**純函式**——
不持有任何狀態，同樣的輸入永遠得到同樣的輸出。這讓它們超好測。

### 撞牆（`Collision.cpp:7`）

```cpp
return cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height;
```

沒什麼玄機。注意是 `>=`：24 格的棋盤合法索引是 0..23，所以 `x == 24` 就出界了。

### 撞自己（`Collision.cpp:11`）—— 這裡有個微妙之處

```cpp
return std::find(body.begin(), std::prev(body.end()), cell) != std::prev(body.end());
```

`std::prev(body.end())` 是「最後一個元素之前」，也就是說**搜尋範圍排除了尾巴那一格**。

為什麼？因為**尾巴會在頭抵達的同一個 tick 讓開**。

```
現在：  [頭][身][尾]
        (5,5)(4,5)(3,5)

蛇往(3,5)移動（也就是尾巴現在的位置）：
  push_front((3,5))  →  [新頭][頭][身][尾]
  pop_back()         →  [新頭][頭][身]      ← 尾巴走了，位置空出來

結果：合法。追著自己的尾巴跑是可以的。
```

如果不排除尾巴，蛇繞一個剛好貼合的圈就會無故死亡。

> **但注意**：如果蛇正在成長（剛吃到食物），尾巴**不會**讓開。
> 這個專案裡不會出問題，因為 `tick()` 是先檢查死亡（`Game.cpp:67`）
> 才處理食物（`Game.cpp:75`），而 `grow_` 在每個 tick 開始時一定是 0。
> 這是一個「因為執行順序而成立」的正確性，改動 `tick()` 順序時要特別小心。

### 自我檢查

長度 3 的蛇 `[(5,5),(4,5),(3,5)]`，往下面這些格子移動，哪些會死？

`(6,5)` / `(4,5)` / `(3,5)` / `(-1,5)`

<details>
<summary>參考答案</summary>

- `(6,5)` 活 —— 空地
- `(4,5)` 死 —— 撞到身體（脖子）
- `(3,5)` 活 —— 那是尾巴，會讓開
- `(-1,5)` 死 —— 撞牆
</details>

---

## 第 6 章：食物：為什麼不用「隨機猜到好」

大部分教學會這樣寫：

```
do {
    位置 = 隨機格子
} while (位置在蛇身上);
```

這在蛇很短時沒問題。但當蛇佔了 99% 的棋盤，每次猜中空格的機率只有 1%，
迴圈平均要跑 100 次。**如果棋盤剛好滿了，這個迴圈永遠不會結束**——遊戲直接凍結。

這個專案的做法（`Game.cpp:89` `respawnFood()`）：

1. 走訪整個棋盤，把**所有空格**收集到一個 `vector`
2. 從這個 vector 裡均勻隨機挑一個
3. 如果 vector 是空的，回傳 `false`（棋盤滿了）

代價是每次都要掃過 576 格，但這是**有上界**的常數成本，而且保證會結束。
對 24×24 的棋盤來說完全不痛。

> 這是個很好的一般性教訓：**「重試到成功」的隨機演算法，
> 在成功機率趨近 0 時會退化成無窮迴圈。**
> 改成「列舉出合法選項再挑」通常更慢一點，但行為可預測。

### 隨機性與可重現性

`Game` 的建構子接受一個 `seed`（`Game.hpp`）。給同樣的 seed，
食物會出現在同樣的位置——這讓測試可以重現。
`tests/core_tests.cpp` 裡有一條就是在驗這個（"a seeded game is deterministic"）。

正式執行時（`main.cpp` 的 `runSession`）不給 seed，
`Game` 就會用 `std::random_device` 取真隨機。

---

## 第 7 章：WebSocket 到底是什麼

這章比較硬，但這是這個專案技術含量最高的部分——
`WebSocketServer.cpp` 是**從零手寫的**，沒有用任何函式庫。

### 為什麼不用普通 HTTP

HTTP 是「你問一句，我答一句」。但遊戲需要**伺服器主動推**——
每 0.12 秒推一次狀態，而不是等瀏覽器來問。

WebSocket 解決這件事：先用一個普通 HTTP 請求「升級」成長連線，
之後雙方都可以隨時傳訊息，連線不會斷。

### 第一步：握手（handshake）

瀏覽器送出一個看起來很普通的 HTTP 請求，但多了幾個標頭：

```http
GET /ws HTTP/1.1
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
```

伺服器必須證明「我真的懂 WebSocket，不是隨便一台 HTTP 伺服器」。
做法是（`WebSocketServer.cpp:174`）：

1. 把收到的 `Sec-WebSocket-Key` 接上一個固定的魔術字串
   `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`（`WebSocketServer.cpp:23`）
2. 對接起來的字串做 **SHA-1**
3. 把 20 bytes 的結果做 **base64**
4. 放進回應的 `Sec-WebSocket-Accept`

```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

那個魔術字串是 RFC 6455 規格寫死的常數，全世界都一樣。
它存在的意義是防止「不小心」把一般 HTTP 伺服器當成 WebSocket 用。

> 上面的 key 和 accept 是 RFC 6455 官方範例裡的值。
> 這個伺服器餵進那個 key 會吐出一模一樣的 accept——
> 這是驗證自己 SHA-1 + base64 寫對了最快的方法。

因為只是為了這 20 bytes，這個專案把 **SHA-1**（`WebSocketServer.cpp:32`）
和 base64 直接手寫在檔案裡，而不是相依 OpenSSL。

### 第二步：資料框（frame）

握手完之後，資料不是裸傳的，而是包在「框」裡。一個框大概長這樣：

```
 位元組 0:  [FIN|3 個保留位|4 位元 opcode]
 位元組 1:  [MASK|7 位元長度]
 (長度是 126 → 後面接 2 bytes 真實長度)
 (長度是 127 → 後面接 8 bytes 真實長度)
 (MASK=1 → 接 4 bytes 遮罩金鑰)
 之後:      payload
```

`opcode` 說明這是什麼：`0x1` 文字、`0x8` 關閉、`0x9` ping、`0xA` pong。
`receiveText()`（`WebSocketServer.cpp:239`）就是在解這個結構，
而且會自己處理 ping/pong 和關閉，不讓它們浮到遊戲邏輯層。

### 最反直覺的一點：遮罩（masking）

**瀏覽器送給伺服器的每一個框，payload 都必須用一組隨機 4 bytes 做 XOR 遮罩。
伺服器送給瀏覽器的則絕對不能遮罩。**

為什麼這麼奇怪？這是為了防禦**快取污染攻擊**。
如果瀏覽器可以送出完全由攻擊者控制的原始位元組，
一個惡意網頁就能讓瀏覽器送出「看起來像一個正常 HTTP 請求」的資料，
中間的代理伺服器可能會誤判並把偽造的回應存進快取。
強制加上瀏覽器隨機產生的遮罩，攻擊者就無法預測實際送出的位元組。

程式碼裡：解遮罩在 `WebSocketServer.cpp:268`，
而 `sendFrame()` 送出時完全不設 MASK 位（`WebSocketServer.cpp:211` 的註解）。

### 動手做

用 `curl` 手動做一次握手，親眼看到 101 回應：

```bash
curl -i --http1.1 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://127.0.0.1:8000/ws
```

你會看到 `Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`，
後面接著一堆二進位亂碼——那就是 frame 包起來的遊戲狀態。

---

## 第 8 章：並行：thread、mutex、condition_variable

### 執行緒模型

```
主執行緒
  └─ accept() 迴圈，等新連線
       └─ 每接到一個連線 → 開一個新 thread（detached）
            └─ runSession()
                 ├─ ticker thread：每 0.12 秒 tick 一次並推送狀態
                 └─ 本身：阻塞在 receiveText()，等玩家的指令
```

也就是**一個連線兩個執行緒**。對這種每個玩家狀態只有幾百 bytes 的遊戲，
這個模型簡單到不會出錯，而且每個 session 的邏輯是各自獨立的。

（如果要撐幾萬個連線，就得換成 epoll/kqueue 事件迴圈——但那是另一個量級的複雜度。）

### 為什麼需要 mutex

兩個執行緒都會碰同一個 `Game` 物件：

- ticker thread 呼叫 `game.tick()`——**寫入**
- 指令 thread 呼叫 `applyCommand()`→`game.turn()`——**寫入**

同時寫入同一塊記憶體就是 **data race**，行為未定義（可能崩潰，可能靜默壞掉）。
所以兩邊都要先鎖 `gameMutex`（`main.cpp:70` 之後的 `runSession`）。

注意鎖的**範圍**要盡量小：

```cpp
std::string state;
{
    std::lock_guard<std::mutex> lock(gameMutex);
    game.tick();
    state = game.toJson();       // 在鎖裡面把資料複製出來
}                                 // 鎖在這裡放掉
connection.sendText(state);      // 送網路（慢）的時候不持有鎖
```

送網路可能會阻塞很久。如果持有鎖去送，玩家的按鍵就會卡住。

### 為什麼用 condition_variable 而不是 sleep

最直覺的寫法是 `std::this_thread::sleep_for(120ms)`。問題是：
玩家關掉分頁時，ticker thread 還在睡，得睡完才會發現要結束。

這個專案用的是（`main.cpp:98`）：

```cpp
wake.wait_for(lock, interval, [&] { return !running.load(); });
```

「等 120 毫秒，**或者** `running` 變成 false 就立刻醒來」。
斷線時主執行緒設 `running = false` 並 `notify_all()`，ticker 立刻結束，
不用等滿一個 tick。

那個 lambda 是**述詞（predicate）**，還順便處理了 spurious wakeup
（condition_variable 有可能無故醒來，有述詞的話會自動再等下去）。

### 自我檢查

如果把 `sendText()` 移到 `lock_guard` 的大括號**裡面**，會發生什麼？

<details>
<summary>參考答案</summary>

網路傳送期間會一直持有 `gameMutex`。指令執行緒想處理玩家按鍵時會被卡住，
按鍵反應變得遲鈍。網路越慢，遊戲越卡。這叫 **holding a lock across I/O**，
是很常見的效能地雷。
</details>

---

## 第 9 章：前端分層：誰可以知道什麼

前端的檔案分層不是隨便放的，而是一條規則：**只有一個檔案同時知道 React 和 socket。**

```
web/
├── lib/                    ← 完全不 import React
│   ├── websocket.ts          WebSocket 客戶端
│   ├── input.ts              鍵盤 → 指令
│   └── renderer.ts           Canvas 繪圖
│
├── hooks/useSnakeGame.ts   ← 唯一的接縫：React ↔ socket
│
└── components/game/        ← 純呈現，只收 props
    ├── GameCanvas.tsx
    └── ScoreBoard.tsx
```

### 為什麼要這樣切

`lib/` 裡的程式碼不依賴 React，所以：

- 可以不啟動瀏覽器就測試
- 如果哪天要換成 Vue 或 Svelte，`lib/` 完全不用動
- 讀它的時候不用同時腦補 React 的生命週期

`hooks/useSnakeGame.ts` 是唯一「翻譯層」：它管 socket 的生死、
把伺服器狀態塞進 React state、綁鍵盤。只有 45 行。

### `useEffect` 的清理函式

`useSnakeGame.ts:24` 的 effect 回傳了一個函式：

```ts
useEffect(() => {
    const socket = new GameSocket(url, { ... });
    socketRef.current = socket;
    socket.connect();

    return () => {              // ← 這個就是清理函式
      socket.disconnect();
      socketRef.current = null;
    };
}, [url]);
```

React 會在元件消失時（或 `url` 改變時）呼叫它。
**沒有這段的話，每次切換頁面都會留下一條沒關掉的 WebSocket**——
連線洩漏，累積久了伺服器會被塞爆。

「開了什麼，就要在清理函式裡關掉」是 `useEffect` 最重要的紀律。
`GameCanvas.tsx:33` 也是同樣的模式（`addEventListener` 配 `removeEventListener`）。

### 自動重連

`websocket.ts:39` 的 `onclose` 裡有個判斷：

```ts
if (!this.closedByUs) {
    this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
}
```

`closedByUs` 這個旗標區分兩種關閉：

- **我們主動關的**（換頁、元件卸載）→ 不要重連
- **意外斷線**（伺服器重啟、網路斷）→ 1 秒後重連

沒有這個旗標的話，離開頁面會觸發無止盡的重連迴圈。

### 補充：hydration 是什麼（第 1 章那個坑的背景）

Next.js 會先在伺服器把 HTML 產生好送給瀏覽器（所以你「看得到」畫面），
然後 JavaScript 載入後再「接手」這份 HTML，把事件監聽器和 state 接上去。
這個接手的過程叫 **hydration（水合）**。

**hydration 失敗時，畫面看起來是好的，但完全沒有互動**——
`useEffect` 不會跑、按鈕沒反應。這正是 `npm run dev` 在這台機器上的症狀：
畫面有，但 socket 從來沒被建立過。

---

## 第 10 章：Canvas 渲染與螢幕解析度

`web/lib/renderer.ts` 的 `Renderer` 有一個重要性質：
**它對遊戲是無狀態的**。它不記得上一幀是什麼，只是把傳進來的 `GameState` 畫出來。

這代表畫面**不可能**跟伺服器不一致——沒有可以「不同步」的本地狀態。

### devicePixelRatio：為什麼字會糊

Retina 螢幕上，1 個 CSS 像素對應 2 個（甚至 3 個）實體像素。
如果 canvas 只按 CSS 尺寸來設，畫出來的東西會被放大而模糊。

`renderer.ts:41` 的處理方式：

```ts
const dpr = window.devicePixelRatio || 1;

this.canvas.style.width  = `${width}px`;    // CSS 尺寸：版面上佔多大
this.canvas.style.height = `${height}px`;
this.canvas.width  = width * dpr;           // 實際像素緩衝區：畫布真正多少點
this.canvas.height = height * dpr;
this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 之後就能用 CSS 座標畫圖
```

關鍵是分清楚兩組尺寸：

| | 意義 |
|---|---|
| `canvas.style.width` | 在版面上顯示多大 |
| `canvas.width` | 內部像素緩衝區有多少點 |

最後那行 `setTransform` 讓後續所有繪圖指令可以用 CSS 座標寫，
瀏覽器自動乘上 dpr。不然每個座標都要手動乘。

### 動手做

把 `setTransform` 那行註解掉，重新 build 跑起來看看。
在 dpr = 2 的螢幕上，畫面會縮到左上角四分之一——因為繪圖指令用的是 CSS 座標，
但緩衝區是 2 倍大。（如果你的螢幕 dpr = 1，畫面不會有變化，這本身就說明了
這行是在補償什麼。用瀏覽器 console 打 `window.devicePixelRatio` 可以查。）

---

## 第 11 章：測試是怎麼寫的

```bash
cd game-server
cmake --build build && ctest --test-dir build --output-on-failure
./build/core_tests        # 直接跑，會印 "64/64 checks passed"
```

### 沒有用測試框架

`tests/core_tests.cpp` 沒有 Google Test、沒有 Catch2。整個框架就是這幾行：

```cpp
void check(bool condition, const std::string& what) {
    ++checks;
    if (!condition) { ++failures; std::cerr << "FAIL: " << what << "\n"; }
}
```

為什麼？因為 game-server 的賣點就是**零第三方相依**。
為了測試而引入一個函式庫，會破壞「只要 CMake + C++20 編譯器就能建」這個性質。

代價是沒有測試篩選功能——不能只跑某一條。
粒度只到 `main()` 裡的三個函式：`testSnake()` / `testCollision()` / `testGame()`。
要單獨跑一組，就把另外兩個註解掉。

### 測試在守什麼

值得注意的是，測試不只是「檢查功能會動」，而是**守住那些容易被「順手優化」破壞的不變式**：

| 測試 | 守住的東西 |
|---|---|
| "two turns in one tick cannot fold the snake" | 第 4 章的轉向緩衝 |
| "following your own tail is legal" | 第 5 章排除尾巴 |
| "eating grows on the same tick" | 第 3 章的執行順序 |
| "a seeded game is deterministic" | 隨機可重現 |
| "the wire format carries ..." | 第 2 章的傳輸契約 |

寫測試時值得問自己：**「如果有人不懂這段程式碼，他會怎麼把它改壞？」**
然後為那個情境寫測試。

---

## 第 12 章：這個專案「刻意沒做」的事

理解一個專案不只要看它做了什麼，也要看它**選擇不做**什麼。
這些都是很好的練習題。

### 1. 傳輸契約靠人工同步

第 2 章提過。改善方向：

- 寫一個測試，開一條真的連線、收一包狀態，驗證欄位齊全
- 或用一份 schema 檔同時產生 C++ 和 TypeScript

### 2. 「贏」和「輸」分不出來

蛇填滿棋盤時 `status` 是 `game_over`，跟撞牆一樣。
**練習**：加一個 `GameStatus::Won`。你需要動的地方：
`Game.hpp` 的 enum、`Game.cpp` 的 `nameOf()`、`Game.cpp:83`、
`web/types/game.ts` 的 `GameStatus`、`renderer.ts` 的 overlay。
（走一遍這條路，你就完全懂第 2 章那條規則的代價了。）

### 3. 分數不會保存

關掉分頁就沒了。沒有資料庫、沒有排行榜。

### 4. 速度不會變快

`kDefaultTickSeconds` 是固定的 0.12 秒。
**練習**：讓 tick 隨分數縮短。注意 `main.cpp` 的 ticker 只在進迴圈前讀了一次
`game.tickSeconds()`——你得改成每圈重讀。

### 5. 沒有多人同房

每條連線有**自己的** `Game`（`runSession` 裡 `snake::Game game;`）。
兩個玩家看到的是完全獨立的棋盤。要做同房需要一個共享的 `Game` 和玩家清單。

### 6. 伺服器只綁 loopback

只有本機連得到。要讓區網其他裝置連進來得改成 `INADDR_ANY`——
但那之前要先想清楚沒有任何驗證機制的後果。

---

## 名詞表

| 名詞 | 意思 |
|---|---|
| **tick** | 遊戲時間的最小單位。這裡是 0.12 秒一次，每次蛇走一格 |
| **server-authoritative** | 伺服器擁有所有遊戲狀態的權威，客戶端只是顯示器 |
| **wire format / 傳輸契約** | 兩端約定好的訊息結構。這裡是 `Game::toJson()` ↔ `types/game.ts` |
| **handshake** | WebSocket 連線建立時，從 HTTP「升級」成長連線的那一次交握 |
| **frame** | WebSocket 傳輸的基本封包單位，含 opcode、長度、遮罩 |
| **masking** | 瀏覽器送出的 payload 必須用隨機 4 bytes XOR，防快取污染攻擊 |
| **opcode** | frame 的類型代碼：`0x1` 文字、`0x8` 關閉、`0x9` ping、`0xA` pong |
| **data race** | 兩個執行緒同時存取同一塊記憶體且至少一個是寫入。行為未定義 |
| **mutex** | 互斥鎖。同一時間只有一個執行緒能持有 |
| **condition_variable** | 讓執行緒等待某個條件成立，可被其他執行緒喚醒 |
| **spurious wakeup** | condition_variable 無故醒來。用述詞（predicate）可自動處理 |
| **hydration** | Next.js 把伺服器產生的靜態 HTML「接手」成可互動 React 的過程 |
| **devicePixelRatio (dpr)** | 一個 CSS 像素對應幾個實體像素。Retina 通常是 2 或 3 |
| **deque** | 雙端佇列。兩端插入刪除都是 O(1) |
| **純函式** | 不持有狀態、同輸入必得同輸出的函式。極易測試 |
| **loopback** | `127.0.0.1`，只有本機能連的網路介面 |

---

## 建議的學習路徑

**第一天**：第 0、1、2 章。跑起來，看懂資料形狀。
**第二天**：第 3、4、5 章。這是遊戲邏輯的核心，讀完你能改遊戲規則了。
**第三天**：第 6、11 章。改一個小功能，然後為它寫測試。
**第四天**：第 9、10 章。前端分層與渲染。
**第五天**：第 7、8 章。最硬的兩章，但也是最有價值的。
**之後**：挑第 12 章裡的一個練習做完。

有任何一段看不懂，直接問我——把章節和困惑點講出來就好。

---

## 延伸資源

- [RFC 6455 — The WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455) —
  第 7 章的一手規格。特別是 §1.3（握手）和 §5（framing）
- [MDN: Writing WebSocket servers](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers) —
  比 RFC 好讀很多的入門版
- [MDN: Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial) — 第 10 章
- [React: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) —
  第 9 章。理解什麼時候**不**該用 `useEffect` 跟知道怎麼用一樣重要
- [cppreference: std::condition_variable](https://en.cppreference.com/w/cpp/thread/condition_variable) — 第 8 章
