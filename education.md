# 這個專案該學的東西

一份從零開始、由淺入深的導覽。每一章都指向這個 repo 裡的**真實程式碼**（檔名:行號），
不是通用教學範例。看到 `檔案:行` 就打開來對照著讀。

**讀法建議**：不要一次讀完。一次一章，每章末尾都有「動手做」和「自我檢查」，
做完再往下。前 4 章讀完你就能看懂整個遊戲邏輯了。

> **關於這份文件的歷史**：這個專案的伺服器原本是 **C++** 寫的，後來整個換成
> **Python**。有幾章（特別是第 7、8 章）保留了「換掉之前長什麼樣」的對照——
> 那不是懷舊，是這份教材裡最有價值的部分：同一個問題，兩種語言逼你面對的
> 東西完全不同。

---

## 先講最重要的：這跟「直接用前端做」差在哪

網路上 99% 的貪食蛇教學長這樣：一個 HTML 檔、一個 `<canvas>`、150 行 JavaScript。
`setInterval` 每 120 毫秒跑一次，蛇的座標存在一個陣列裡，撞到就 `alert("Game Over")`。
**一個檔案、零個伺服器、打開就能玩。**

**那個版本更短、更好懂，而且對「自己玩貪食蛇」這件事來說完全夠用。**
如果你的目標只是「會寫貪食蛇」，先去寫那個版本，真的。

這個專案沒有那樣做。差別**不在功能**——兩邊玩起來一模一樣——而在**每一樣東西放在哪裡**。

### 逐項對照

| 一件事 | 純前端版 | 這個專案 |
|---|---|---|
| 蛇的座標存在哪 | 瀏覽器的一個陣列 | 伺服器記憶體裡的 `Snake._body`，瀏覽器只拿到一份快照 |
| 誰在推動時間 | 瀏覽器的 `setInterval` | 伺服器的 asyncio 任務（第 8 章） |
| 撞牆／撞自己誰判定 | 瀏覽器算 | 伺服器算，瀏覽器連判定邏輯都沒有（第 5 章） |
| 分數 | 瀏覽器的一個變數 | 伺服器的 `Game.score` |
| 想把分數改成 999 | DevTools 打一行就好 | 做不到。改了下一個 tick 就被覆蓋回去 |
| 想讓蛇跑快一點 | 改 `setInterval` 的參數 | 做不到。你送再多訊息，時鐘還是伺服器的 |
| 關掉網路 | 沒有網路可以關 | 遊戲停住，一秒後自動重連，然後拿到**全新的一局** |
| 要幾個檔案 | 1 | 31 個主要程式與測試檔（後端 15、前端 16） |
| 要開幾個終端機 | 0 | 2 |
| 按一次方向鍵要多久 | 0 毫秒 | 一趟來回網路 |

### 你付出了什麼

誠實地列出來，因為這些成本是真的：

- **兩個行程要一起活著**。少開一個，畫面就卡在 "connecting"
- **同一份資料格式要寫兩次**（Python 一份、TypeScript 一份），
  而且**沒有任何東西會幫你檢查兩邊一不一致**——這是這個專案最大的弱點，第 2 章和第 13 章都會回來談
- **每個按鍵都要走一趟網路**。本機看不出來，但延遲是真的存在
- **玩不了離線**
- 對一個單機貪食蛇來說，**這是不折不扣的過度設計**

### 你換到了什麼

- **規則測得起來，而且不需要瀏覽器**。這個專案有 81 個測試，
  沒有任何一個需要開瀏覽器、開 socket 或開執行緒（第 11 章）。
  純前端版要測「蛇追自己尾巴合不合法」，你得先想辦法把遊戲邏輯從 DOM 裡挖出來
- **作弊變成做不到，而不是「不建議」**
- **換掉前端不用重寫遊戲**。規則在 Python 裡，不在 React 裡。
  哪天想改用 Vue、或做一個手機 app，遊戲一行都不用動
- **最重要的：它逼你回答「這件事該誰負責」**

最後那點才是這份教材真正的主題。

### 為什麼「那條線畫在哪」是重點

純前端版永遠不會逼你問「這該誰負責」，因為答案永遠是「都是瀏覽器」。

一旦中間多了一條線，**每加一個功能你都得決定它落在線的哪一邊**，
而且常常沒有標準答案。這個專案裡有兩個活生生的例子，兩個的答案還剛好相反：

- **吃到蘋果整個畫面翻色** —— 「翻到第幾組」是伺服器決定的，
  但「第幾組長什麼樣」是瀏覽器的事。伺服器只送一個整數
- **盤面鋪滿整個視窗** —— 「視窗多大」只有瀏覽器知道，
  所以它得往上送；但伺服器收到之後**沒有照單全收**，它會夾在合法範圍內才採用

第 2 章會把這兩個決定拆開講，包括每個被否決的替代方案為什麼被否決。

> 如果你只是想學會寫貪食蛇，純前端版是對的起點。
> 如果你想寫的是**需要多人、需要防作弊、需要伺服器記得什麼**的東西，
> 那條線該畫在哪就是全部的重點——而貪食蛇只是一個小到你能一眼看完的例子。

---

## 目錄

| 章 | 主題 | 難度 |
|---|---|---|
| — | 先講：這跟直接用前端做差在哪 | ★ |
| 0 | 這個專案到底在幹嘛 | ★ |
| 1 | 先讓它跑起來 | ★ |
| 2 | 資料長什麼樣子（以及誰擁有什麼） | ★★ |
| 3 | 一個 tick 裡發生什麼事 | ★★ |
| 4 | 蛇的身體：deque 與轉向緩衝 | ★★ |
| 5 | 碰撞判定：為什麼尾巴不算 | ★★ |
| 6 | 食物：為什麼不用「隨機猜到好」 | ★★ |
| 7 | WebSocket 到底是什麼（以及為什麼你現在看不到它） | ★★★ |
| 8 | 並行：兩條執行緒一把鎖 → 一個事件迴圈零把鎖 | ★★★ |
| 9 | 前端分層：誰可以知道什麼 | ★★ |
| 10 | Canvas 與 DOM 渲染：dpr、滿版、遮罩 | ★★ |
| 11 | 測試是怎麼寫的 | ★★ |
| 12 | 模組設計：介面、接縫、可測試性 | ★★★ |
| 13 | 這個專案「刻意沒做」的事 | ★★★ |
| — | 名詞表 | — |

---

## 第 0 章：這個專案到底在幹嘛

### 一句話

**Python 寫的伺服器擁有整個遊戲；瀏覽器只負責「畫出來」和「把按鍵送過去」。**

### 這個架構叫什麼

前言講的那個純前端版本，正式名稱叫 **client-authoritative**（客戶端說了算）：
遊戲狀態在瀏覽器，伺服器（如果有的話）只負責存檔。

這個專案用的是 **server-authoritative**（伺服器說了算）：

- **時鐘在伺服器**。伺服器每 0.12 秒自己走一步，你送再多訊息都不會變快
- **規則在伺服器**。分數、死亡、成長都是 Python 算的，瀏覽器只是收到結果
- **連顏色也在伺服器**。吃到蘋果整個畫面翻色，那個「翻到第幾組」是伺服器決定的
- 瀏覽器**幾乎沒有遊戲狀態**。它收到什麼就畫什麼

> 前言說過「對單機貪食蛇來說這是過度設計」——那句話仍然成立。
> 但這個架構本身一點也不奇怪：**所有連線遊戲都長這樣**，
> 從《英雄聯盟》到《Among Us》都是這個原則。
> 貪食蛇只是尺寸剛好小到你能一次看完全部。

「幾乎」兩個字很重要。有**一件事只有瀏覽器知道**：視窗多大。
盤面是滿版的，所以格子數必須跟著視窗走，而視窗是瀏覽器那邊的東西。
這條例外怎麼處理，是第 2 章的重點。

### 資料的流向

```
   你按下 ↑
       │
       ▼
  [瀏覽器] ──── {"type":"turn","direction":"UP"} ───▶ [Python 伺服器]
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

1. 不會。移動只發生在 `Game.tick()`，而 `tick()` 只被伺服器的計時任務呼叫
   （`backend/main.py:34` 的 `_push_states`）。送訊息只會改變「下一步往哪走」。
2. 分數會變回伺服器記的值。因為畫面是 `state.score` 渲染出來的，
   而 `state` 每個 tick 都被伺服器覆蓋一次。
</details>

---

## 第 1 章：先讓它跑起來

看程式碼之前先跑一次，你才有東西可以對照。

```bash
# 終端機 1：遊戲伺服器
cd backend
python3 -m venv .venv                       # 第一次才要
.venv/bin/pip install -r requirements.txt   # 第一次才要
./dev.sh                                    # 開始監聽 ws://127.0.0.1:8000/ws
```

```bash
# 終端機 2：前端
cd web
npm run dev              # http://127.0.0.1:3000
```

打開 <http://127.0.0.1:3000>。

### 為什麼要 venv

`python3 -m venv .venv` 建立一個**專屬於這個專案的 Python 環境**。
之後 `pip install` 裝的東西只會進到 `backend/.venv/`，不會污染系統。

這解決的問題是：兩個專案要不同版本的 FastAPI 時，沒有 venv 的話只能二選一。
每個專案一個 venv 之後，它們互不影響。這也是為什麼所有指令都寫成
`.venv/bin/pytest` 而不是 `pytest`——**明確指定用哪個環境的執行檔**，
比依賴「有沒有 activate」可靠。

> `.venv/` 被 gitignore 擋掉了。clone 下來的人要自己重建一次——
> `requirements.txt` 才是被版控的東西，它記錄「要裝什麼」，
> `.venv/` 只是「裝完的結果」。

### 開發時：讓兩邊都自動更新

前端的 `npm run dev` 有 Fast Refresh，存檔就自動更新畫面。

後端的 `./dev.sh` 跑的是 `uvicorn --reload`，它監看整個目錄，
存檔就自己重啟。所以循環是：**存檔 → 自動重啟 → 瀏覽器自己接回來**
（前端的 `GameSocket` 斷線一秒後會自動重連，見第 9 章），連重新整理都不用。

> **對照：這裡以前是 C++。**
> 編譯式語言的執行檔是「建置當下那份程式碼的快照」，改了 `.cpp` 之後
> 正在跑的伺服器完全不受影響——必須重新編譯再重啟。當初的 `dev.sh`
> 是自己寫的檔案監看 + `cmake --build` + 重啟。
>
> 換成 Python 之後這段消失了，因為 Python 是直譯的，重啟就等於載入新程式碼。
> 但**它仍然不是真正的 hot reload**：行程重啟代表 `Game` 重新建立，
> **當前這局會歸零**。這點兩種語言一樣。

### 附帶一課：這裡曾經有三個坑，怎麼修的

這些問題都修好了，但**診斷過程本身很值得學**，所以留在這裡。

#### 坑 1：`npm run dev` 畫面出得來，但完全沒有互動

症狀非常難查：HTML 正常顯示、**console 一個錯誤都沒有**，
但按鈕沒反應、`useEffect` 不執行、狀態永遠停在 "connecting"。
而 `npm run build && npm start`（正式模式）卻完全正常。

診斷的推進過程：

1. 先確認**不是這個專案的程式碼**——寫一個 5 行的空白測試頁，一樣不會 hydrate
2. 排除 Turbopack（換 `--webpack` 也一樣）、dev overlay、React Strict Mode（關掉無效）
3. 一度懷疑 Node 版本，**實際下載可攜式 Node 22 LTS 測試 → 一樣壞**。假設推翻
4. 回頭檢查瀏覽器攔到的 WebSocket：Next 自己的 HMR 連線 `error` + `close:1006`，
   但連我們自己的遊戲伺服器卻正常
5. 用 `curl` 對 HMR 端點發升級請求 → **回 101 成功**。伺服器沒問題，是瀏覽器連不上
6. 找出兩者唯一的差別：**瀏覽器一定會送 `Origin` 標頭，curl 沒送**

驗證：

```bash
# 不送 Origin → 101 Switching Protocols
# 送 Origin   → 400 Bad Request      ← 就是它
```

**根因**：Next.js dev server 預設會擋掉所有帶著「非預期 Origin」的
dev-only 請求（這是防止惡意網站連你本機開發伺服器的安全機制）。
但它連 `http://127.0.0.1:3000` 這種**同源**的請求也一起擋了。
HMR 連不上 → dev client 啟動不完整 → hydration 永遠不會完成 → 畫面靜止不動。

**修法**（`web/next.config.ts`）：

```ts
allowedDevOrigins: ["127.0.0.1", "localhost"],
```

> **教訓**：「沒有錯誤訊息」不代表沒有錯誤。
> 這個 bug 從頭到尾沒有拋出任何例外——因為從程式的角度看，
> 它只是在「等一個永遠不會來的連線」。遇到這種安靜的失敗，
> 要找的是**兩個環境的差異**（dev vs prod、curl vs 瀏覽器），
> 而不是盯著程式碼看。

#### 坑 2：`npm run lint` 直接報錯

Next.js 16 **移除了 `next lint` 指令**，但 `package.json` 裡還留著舊的
`"lint": "next lint"`，於是 `lint` 被當成目錄名稱，噴出
"no such directory: .../web/lint"。

**修法**：改用 ESLint CLI（這也是 Next 官方的遷移建議）。
裝了 `eslint` + `eslint-config-next`，加上 `web/eslint.config.mjs`（flat config），
並把 script 改成 `"lint": "eslint ."`。

#### 坑 3：點過按鈕之後，鍵盤就不聽話了

這個是自己種的。`lib/input.ts` 綁在 `window` 上聽 `keydown`。
問題是：**如果按鈕有焦點，按 Space 會同時觸發按鈕的 click 和這個 listener**，
於是「暫停」和「繼續」在同一次按鍵裡各發生一次，看起來像什麼都沒發生。

第一版的修法是「只要焦點在按鈕上就整個忽略」：

```ts
if (event.target?.closest?.("button, a, input, textarea")) return;   // ← 太寬了
```

它修好了 Space，但**順手廢掉了方向鍵**：點一下 Start，焦點留在按鈕上，
之後所有方向鍵都被這行擋掉，蛇再也轉不了彎。

第二版把範圍收窄到只擋 Space：

```ts
if (key === " " && event.target?.closest?.("button")) return;   // ← 還是錯的
```

方向鍵活了，但 Space 反而被**送給按鈕**了。點過一次 Reset，焦點就留在那顆按鈕上，
之後每次按 Space 都是 reset——畫面上的提示寫著「SPACE TO PAUSE」，
實際行為卻是「重新開始」。這比第一版更難發現：它不是壞掉，是**變成另一個指令**。

**真正的修法**：不要讓瀏覽器有機會處理它。

```ts
const message = keyToMessage(key);
if (!message) return;
event.preventDefault();   // ← 這行同時擋掉「方向鍵捲動頁面」和「Space 按下按鈕」
send(message);
```

關鍵在時序：`<button>` 的 Space 是在 **keyup** 才送出 click 的，
所以在 keydown 取消掉這個事件，那個 click 就永遠不會發生。
Enter 不受影響（它在 keydown 就直接觸發 click），按鈕仍然能純鍵盤操作。

> **教訓**：防護性的 early return 很容易寫得比需要的更寬——但把它收窄也不一定就對。
> 這裡真正的問題不是「該擋哪些輸入」，而是**「誰該回應這個按鍵」**。
> 答案是「一律由遊戲回應」的時候，正確的工具是 `preventDefault()`，
> 而不是想辦法判斷焦點在哪裡。
>
> 附帶條件：這頁沒有任何輸入框。哪天加了 `<input>`，
> 打字打到 `w`、`a`、`s`、`d`、空白鍵就會被吃掉，那時才需要判斷事件來源。

### 為什麼要用 `127.0.0.1` 而不是 `localhost`

伺服器只綁定 loopback（`backend/main.py` 最後的 `uvicorn.run(app, host="127.0.0.1", ...)`），
而且是 IPv4。macOS 上 `localhost` 可能先解析成 IPv6 的 `::1`，就連不上了。
所以 `web/.env.local` 裡寫的是 `ws://127.0.0.1:8000/ws`。

### 動手做

1. 跑 `curl http://127.0.0.1:8000/health`，應該回 `{"status":"ok"}`。
   這證明伺服器活著，而且它會回應**普通 HTTP**，不只是 WebSocket。
2. 用 `PORT=9000 ./dev.sh` 換個埠號跑跑看，然後改 `web/.env.local` 讓前端連過去。

---

## 第 2 章：資料長什麼樣子（以及誰擁有什麼）

在讀任何邏輯之前，先搞懂「資料的形狀」。這是讀懂任何程式碼最快的路。

### 格子座標

整個棋盤是格子的網格。**不是像素**。

```
      x →
  y   (0,0) (1,0) (2,0) ...
  ↓   (0,1) (1,1)
      (0,2)
```

注意 **y 往下增加**，跟數學課相反。這是因為螢幕座標系統就是這樣
（Canvas、CSS 都是），跟著它走可以少一次轉換。

`Direction.UP` 的向量因此是 `(0, -1)`——往上是 y **減少**。
看 `backend/game/snake.py:19`：

```python
class Direction(Enum):
    UP = (0, -1)
    DOWN = (0, 1)
    LEFT = (-1, 0)
    RIGHT = (1, 0)
```

這裡有個小巧思：**enum 的「值」直接就是位移向量**。
不需要另外寫一個 `vector_of(direction)` 對應表——方向和它的意義是同一個東西。
`opposite` 也因此只是把向量取負再查回來：

```python
@property
def opposite(self) -> "Direction":
    dx, dy = self.value
    return Direction((-dx, -dy))
```

### 傳輸格式（wire format）

伺服器每個 tick 推一包 JSON：

```json
{
  "type": "state",
  "width": 69, "height": 30,
  "status": "running",
  "score": 3,
  "ticks": 42,
  "direction": "UP",
  "snake": [[12,11],[12,12],[12,13]],
  "food": [7,2],
  "palette": 3
}
```

- `snake` 是**頭在前**的陣列。`snake[0]` 永遠是頭
- `food` 可能是 `null`（棋盤被填滿時）
- `status` 有四種：`ready` / `running` / `paused` / `game_over`
- `width`/`height` **不是固定的**（見下面）
- `palette` 是**顏色的編號**，不是顏色本身（見下面）

瀏覽器送上去的有五種：

```json
{"type":"turn","direction":"UP"}   {"type":"start"}
{"type":"pause"}                   {"type":"reset"}
{"type":"resize","width":69,"height":30}
```

### ⚠️ 這個專案最重要的一條規則

這份格式被**寫了兩次**：

| 位置 | 語言 |
|---|---|
| `backend/game/game.py:139` `Game.to_dict()` | Python 產生它 |
| `web/types/game.ts` | TypeScript 描述它 |

**改一邊就必須同時改另一邊。** 沒有 schema、沒有 codegen、沒有任何測試會抓到不一致。
如果你在 Python 加了一個欄位卻忘了改 TS，TypeScript 不會報錯——它只是不知道那個欄位存在。

`wire` 那組測試會釘住 Python 這側的形狀（它斷言**完整的欄位集合**，
所以欄位被改名或刪掉一定會被抓到），但沒有東西檢查兩邊是否一致。
第 13 章會談怎麼真正解決。

### 兩個刻意的例外：顏色與棋盤大小

第 0 章說「瀏覽器完全沒有遊戲狀態」。實際上有兩處鬆綁，而且**兩處的鬆綁方向剛好相反**。
搞懂這兩個例子，你就懂「所有權邊界」該畫在哪了。

#### 例外一：顏色 —— 伺服器決定「哪一組」，瀏覽器決定「長什麼樣」

每吃一顆蘋果，整個畫面（背景、蛇）翻成下一組配色。問題是：
「現在是第幾組」算不算遊戲狀態？

算。因為它是從「吃了幾顆」推出來的，而那是伺服器的事。
所以 `Game` 存了一個 `palette` 整數，每吃一顆 `+1` 再對 6 取模
（`backend/game/game.py:27` 的 `PALETTE_COUNT`），然後把**這個整數**送下去。

而那六組色碼住在 `web/lib/palette.ts`：

```ts
export const PALETTES: readonly Palette[] = [
  { bg: "#00D6F0", fg: "#F5001E" },
  ...
];
```

考慮過的另外兩種寫法，以及為什麼被否決：

| 做法 | 問題 |
|---|---|
| 伺服器直接送 `{"bg":"#00D6F0","fg":"#F5001E"}` | 後端變成管 CSS 的。想調一個色相就要改 Python、重啟伺服器、把玩家的那一局弄掉 |
| 瀏覽器自己算 `score % 6` | 破壞「伺服器是唯一真相」。而且哪天想改成「隨機挑下一組」，瀏覽器就算不出來了 |

送索引把**「決定」留在伺服器、「外觀」留在瀏覽器**，兩邊都只管自己該管的。
這是這個專案裡「介面該切在哪」最乾淨的一個例子。

#### 例外二：棋盤大小 —— 瀏覽器測量，伺服器裁決

盤面是滿版的，格子數必須跟著視窗走。而**視窗多大只有瀏覽器知道**——
伺服器不可能猜得到。

所以流向是反的：瀏覽器量完（`web/lib/board.ts` 的 `gridForViewport`，
用「一格大約 28 CSS 像素」回推格數），送一包
`{"type":"resize","width":69,"height":30}` 上去。

但注意**伺服器沒有照單全收**（`backend/game/game.py:68`）：

```python
def resize(self, width: int, height: int) -> None:
    width = min(max(width, MIN_DIMENSION), MAX_DIMENSION)
    height = min(max(height, MIN_DIMENSION), MAX_DIMENSION)
    if width == self.width and height == self.height:
        return
    self.width = width
    self.height = height
    self.reset()
```

三件事值得看：

1. **夾到 8..240**。瀏覽器送什麼都不能讓伺服器配一個 100000×100000 的棋盤。
   「客戶端量測，伺服器裁決」——量測可以外包，**裁決不行**
2. **一樣大就直接 return**。因為改變大小會 `reset()`，不擋掉的話每次
   重新連線都會無故重開一局
3. **改變大小 = 重開一局**。這是刻意的取捨：不 reset 的話，視窗縮小後蛇可能
   有一半在棋盤外，得決定「截斷？傳送？直接判死？」——每個答案都比「重開」更讓人困惑。
   （注意它是呼叫 `reset()`，所以連配色不會歸零這件事也一起繼承了。）

前端那側也配合做了兩件事（`web/hooks/useSnakeGame.ts:51`）：格數**沒真的變**就不送，
以及視窗拖曳時 debounce 250ms 只送最後停下來的尺寸。

> **一般性的教訓**：當某個資訊「只有 A 知道，但決定權該在 B」時，
> 不要把決定權搬給 A，而是讓 A 把**測量結果**送給 B，B 保留裁決權。

### 動手做

1. 打開兩個檔案並排看：`backend/game/game.py:139` 和 `web/types/game.ts`。
   逐欄位對照一次，確認每個欄位兩邊都有。
2. 把瀏覽器視窗拉窄再放開，觀察格子數變了、而且那一局重開了。
   然後看 `useSnakeGame.ts:51` 的 debounce，想想為什麼拖曳過程中不會一直重開。

---

## 第 3 章：一個 tick 裡發生什麼事

這是整個遊戲的心臟，在 `backend/game/game.py:111`。

```python
def tick(self) -> None:
    if self.status is not GameStatus.RUNNING:      # ① 沒在跑就什麼都不做
        return

    target = self.snake.next_head()                # ② 先看「下一步會踩到哪」
    if is_fatal(target, self.snake.cells, self.width, self.height):
        self.status = GameStatus.GAME_OVER         # ③ 會死就死，不移動
        return

    eating = self.food is not None and self.food == target
    if eating:
        self.snake.grow()                          # ④ 先記下要變長

    self.snake.move()                              # ⑤ 才真的移動
    self.ticks += 1

    if eating:
        self.score += 1
        self.palette = (self.palette + 1) % PALETTE_COUNT   # ⑥ 翻色
        if not self._respawn_food():               # ⑦ 放不下新食物 = 贏了
            self.status = GameStatus.GAME_OVER
```

### 每一步為什麼是這個順序

**② 先算再移動。** `next_head()` 只是「計算」下一格在哪，不會真的動蛇
（`snake.py:92`）。這讓我們可以在移動**之前**問「這一步會不會死」。
如果先移動再檢查，蛇已經穿牆了，你還得把它移回來。

這也是為什麼玩家死掉時，蛇是**停在牆邊**而不是有一格露在畫面外的。

**④ 在 ⑤ 之前。** 這是最容易寫錯的地方。`grow()` 只是把「欠一節」記在
`_grow` 這個計數器上，真正變長發生在 `move()` 裡。

為什麼順序重要？看 `Snake.move()`（`snake.py:98`）：

```python
def move(self) -> None:
    self._direction = self._pending          # 提交緩衝中的轉向（第 4 章）
    self._body.appendleft(self.next_head())  # 頭往前長一格
    if self._grow > 0:
        self._grow -= 1                      # 有欠長度 → 尾巴不砍，蛇就變長了
    else:
        self._body.pop()                     # 沒欠 → 砍尾巴，長度不變
```

如果先 `move()` 再 `grow()`，尾巴已經被砍掉了，新的一節要等**下一個** tick
才會出現。玩家會看到吃到食物後蛇「慢一拍」才變長。

**⑥ 分數和顏色綁在同一行。** 兩者都只在 `eating` 為真時發生，
所以「畫面翻色」和「分數 +1」永遠是同一個 tick——玩家會把兩件事看成同一件事的兩個表現，
這正是想要的效果。

> 但**只有分數會被 `reset()` 歸零，顏色不會**。`palette` 是唯一在 `__init__`
> 設定、而 `reset()` 刻意不碰的欄位：按 Reset 是同一個玩家再玩一次，畫面沒有
> 理由跳回第一組顏色。只有「新的連線」才會拿到新的 `Game`、從第 0 組重新開始。
> `test_reset_keeps_the_colours` 釘住這條規則。

**⑦ 棋盤填滿 = 通關。** `_respawn_food()` 回傳 `False` 代表沒有空格可以放食物了，
也就是蛇塞滿了整個棋盤。目前這被當成 `GAME_OVER` 處理——
雖然實際上是「贏」。第 13 章會談這個。

### 自我檢查

1. 為什麼 `tick()` 第一行要檢查 `status`？如果拿掉會怎樣？
2. 蛇吃到食物的那一個 tick，身體長度變化是多少？下一個 tick 呢？
3. 為什麼死亡檢查是在 `eating` 判斷**之前**？（提示：想想食物剛好長在蛇尾巴那格會怎樣）

<details>
<summary>參考答案</summary>

1. 拿掉的話，暫停和遊戲結束後蛇還是會繼續走。`status` 是唯一擋住移動的東西。
2. 吃到的那個 tick：`appendleft` 但不 `pop`，長度 +1。
   下一個 tick：`_grow` 已經歸零，正常砍尾巴，長度不變。
3. 因為死亡優先。不過這個順序還有個微妙的好處：死亡檢查用的
   `is_fatal` 會排除尾巴那一格（第 5 章），而那個排除規則的前提是
   「尾巴這個 tick 會讓開」。如果先處理食物、先 `grow()` 了，
   尾巴就不讓開，排除規則的前提就不成立了。
   目前的順序保證 `_grow` 在檢查當下一定是 0。
</details>

---

## 第 4 章：蛇的身體：deque 與轉向緩衝

### 為什麼用 `deque` 而不是 `list`

蛇每一步都做兩件事：**頭端加一格、尾端砍一格**。

- 用 `list`：`insert(0, x)` 要把整個串列往後搬，是 O(n)
- 用 `collections.deque`（雙端佇列）：兩端進出都是 O(1)

`snake.py:52` 就是 `self._body: deque[Cell] = deque(...)`。頭是 `self._body[0]`。

> 這跟 C++ 版的 `std::deque<Cell>` 是同一個選擇、同一個理由。
> **資料結構的選擇不會因為換語言而改變**——會變的只是它叫什麼名字。

### 轉向緩衝：一個很細但很重要的 bug 防線

先看一個會出事的寫法。假設蛇正往**右**走，玩家在同一個 tick 內飛快按了 **↑** 然後 **←**：

```
天真的做法（每次按鍵就馬上改方向）：
  按 ↑ → 方向變成 UP
  按 ← → 方向變成 LEFT   ← 「左」跟「右」是相反的，但因為中間經過了 UP，檢查沒擋住！
  tick → 蛇往左走，直接撞進自己的脖子，瞬間死亡
```

玩家完全沒做錯事，卻莫名其妙死了。

這個專案的解法（`snake.py:76`）：

```python
def turn(self, direction: Direction) -> None:
    if direction is self._direction.opposite:   # 注意是 _direction，不是 _pending
        return
    self._pending = direction
```

關鍵有兩個：

1. **按鍵不會馬上生效**，只存進 `_pending`。真正套用是在 `move()` 的第一行
   `self._direction = self._pending`
2. **比對的對象是 `_direction`**（已經生效的方向），不是 `_pending`

所以上面那個情境：按 ↑ 存進 `_pending`；按 ← 時拿「左」跟**「右」**（`_direction` 還是右）比，
是相反的 → 直接忽略。`_pending` 還是 UP。tick 時蛇往上走。安全。

> ⚠️ 如果有人「順手優化」把 `_direction` 改成 `_pending`，這個保護就沒了。
> `backend/tests/test_snake.py` 裡有一條就是專門守這個
> （`test_two_turns_in_one_tick_cannot_fold_the_snake_onto_its_neck`）。

### 動手做

把 `snake.py:84` 的 `self._direction.opposite` 改成 `self._pending.opposite`，跑測試：

```bash
cd backend && .venv/bin/pytest -m snake
```

看它是不是真的抓到了。**看完記得改回來。**

> 注意這次不需要重新編譯——存檔就可以跑測試了。這是直譯式語言最實際的好處：
> **改一行到看到結果之間的距離變短了**，而那個距離直接決定你願意做多少次實驗。

---

## 第 5 章：碰撞判定：為什麼尾巴不算

`backend/game/collision.py` 只有三個函式，而且都是**純函式**——
不持有任何狀態，同樣的輸入永遠得到同樣的輸出。這讓它們超好測。

更重要的是它們的**參數形狀**：收的是「一個候選格子」和「一段身體」，
而不是一個 `Snake` 物件。這正是 `Game` 能在移動**之前**問
「如果我走到那裡會不會死」的原因——那個格子當下還不屬於任何一條蛇。

### 撞牆（`collision.py:15`）

```python
def hits_wall(cell: Cell, width: int, height: int) -> bool:
    x, y = cell
    return x < 0 or y < 0 or x >= width or y >= height
```

沒什麼玄機。注意是 `>=`：24 格的棋盤合法索引是 0..23，所以 `x == 24` 就出界了。

### 撞自己（`collision.py:21`）—— 這裡有個微妙之處

```python
def hits_self(cell: Cell, body: Sequence[Cell]) -> bool:
    return cell in list(body)[:-1]
```

`[:-1]` 是「除了最後一個以外」，也就是說**搜尋範圍排除了尾巴那一格**。

為什麼？因為**尾巴會在頭抵達的同一個 tick 讓開**。

```
現在：  [頭][身][尾]
        (5,5)(4,5)(3,5)

蛇往(3,5)移動（也就是尾巴現在的位置）：
  appendleft((3,5))  →  [新頭][頭][身][尾]
  pop()              →  [新頭][頭][身]      ← 尾巴走了，位置空出來

結果：合法。追著自己的尾巴跑是可以的。
```

如果不排除尾巴，蛇繞一個剛好貼合的圈就會無故死亡。

> **但注意**：如果蛇正在成長（剛吃到食物），尾巴**不會**讓開。
> 這個專案裡不會出問題，因為 `tick()` 是先檢查死亡（`game.py:116`）
> 才處理食物（`game.py:123`），而 `_grow` 在每個 tick 開始時一定是 0。
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

`backend/tests/test_collision.py` 裡有一對測試把這件事釘得更死：
同一個 2×2 繞圈動作，長度 4 的蛇活、長度 5 的蛇死——
因為多一節之後，目標格子就不再是尾巴、來不及讓開了。

---

## 第 6 章：食物：為什麼不用「隨機猜到好」

大部分教學會這樣寫：

```
while True:
    位置 = 隨機格子
    if 位置 not in 蛇身上: break
```

這在蛇很短時沒問題。但當蛇佔了 99% 的棋盤，每次猜中空格的機率只有 1%，
迴圈平均要跑 100 次。**如果棋盤剛好滿了，這個迴圈永遠不會結束**——遊戲直接凍結。

這個專案的做法（`game.py:156` `_respawn_food()`）：

```python
free = [
    (x, y)
    for y in range(self.height)
    for x in range(self.width)
    if not self.snake.occupies((x, y))
]
if not free:
    self.food = None
    return False
self.food = self._rng.choice(free)
return True
```

1. 走訪整個棋盤，把**所有空格**收集起來
2. 從裡面均勻隨機挑一個
3. 如果一格都沒有，回傳 `False`（棋盤滿了）

代價是每次都要掃過整個棋盤，但這是**有上界**的成本，而且保證會結束。

> 這是個很好的一般性教訓：**「重試到成功」的隨機演算法，
> 在成功機率趨近 0 時會退化成無窮迴圈。**
> 改成「列舉出合法選項再挑」通常更慢一點，但行為可預測。

### 隨機性與可重現性

`Game` 的建構子接受一個 `seed`，並且用它自己建一個 `random.Random(seed)`
而不是用全域的 `random`：

```python
self._rng = random.Random(seed)
```

這個細節重要。全域的 `random` 是**整個行程共用**的——測試 A 抽了幾次亂數，
測試 B 拿到的序列就變了，於是測試會依執行順序而時好時壞。
每個 `Game` 自己帶一個產生器，就沒有這個耦合。

`backend/tests/` 裡幾乎每個測試都用 `Game(seed=1)`，食物永遠落在同一格。

---

## 第 7 章：WebSocket 到底是什麼（以及為什麼你現在看不到它）

### 為什麼不用普通 HTTP

HTTP 是「你問一句，我答一句」。但遊戲需要**伺服器主動推**——
每 0.12 秒推一次狀態，而不是等瀏覽器來問。

WebSocket 解決這件事：先用一個普通 HTTP 請求「升級」成長連線，
之後雙方都可以隨時傳訊息，連線不會斷。

### 在這個 repo 裡，它現在只有兩行

```python
@app.websocket("/ws")
async def play(websocket: WebSocket) -> None:
    await websocket.accept()
```

`backend/main.py:42`。就這樣。握手、框、遮罩、ping/pong、關閉——全部是
FastAPI 底下的 `websockets` 函式庫在處理。

**但它以前不是這樣。** C++ 版的 `WebSocketServer.cpp` 是**從零手寫的**，
包含自己實作的 SHA-1 和 base64，大約 300 行。下面這幾節講的就是那 300 行在做什麼——
你現在不用寫它了，但你仍然應該知道它在幹嘛，因為**出問題的時候你得看得懂**。

### 第一步：握手（handshake）

瀏覽器送出一個看起來很普通的 HTTP 請求，但多了幾個標頭：

```http
GET /ws HTTP/1.1
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
```

伺服器必須證明「我真的懂 WebSocket，不是隨便一台 HTTP 伺服器」。做法是：

1. 把收到的 `Sec-WebSocket-Key` 接上一個固定的魔術字串
   `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`
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

### 第二步：資料框（frame）

握手完之後，資料不是裸傳的，而是包在「框」裡：

```
 位元組 0:  [FIN|3 個保留位|4 位元 opcode]
 位元組 1:  [MASK|7 位元長度]
 (長度是 126 → 後面接 2 bytes 真實長度)
 (長度是 127 → 後面接 8 bytes 真實長度)
 (MASK=1 → 接 4 bytes 遮罩金鑰)
 之後:      payload
```

`opcode` 說明這是什麼：`0x1` 文字、`0x8` 關閉、`0x9` ping、`0xA` pong。

### 最反直覺的一點：遮罩（masking）

**瀏覽器送給伺服器的每一個框，payload 都必須用一組隨機 4 bytes 做 XOR 遮罩。
伺服器送給瀏覽器的則絕對不能遮罩。**

為什麼這麼奇怪？這是為了防禦**快取污染攻擊**。
如果瀏覽器可以送出完全由攻擊者控制的原始位元組，
一個惡意網頁就能讓瀏覽器送出「看起來像一個正常 HTTP 請求」的資料，
中間的代理伺服器可能會誤判並把偽造的回應存進快取。
強制加上瀏覽器隨機產生的遮罩，攻擊者就無法預測實際送出的位元組。

### 動手做

用 `curl` 手動做一次握手，親眼看到 101 回應：

```bash
curl -i --http1.1 --max-time 3 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://127.0.0.1:8000/ws
```

你會看到 `Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`，
後面接著一堆二進位亂碼——那就是 frame 包起來的遊戲狀態。

三件值得注意的事：

1. 上面那組 key 和 accept 是 **RFC 6455 官方範例**裡的值。當初手寫 SHA-1 時，
   餵進那個 key 能吐出一模一樣的 accept，是驗證自己寫對了最快的方法
2. **換成 Python 之後，這個值一個位元都沒變。** 因為那是協定規定的，
   不是任何一份實作發明的。這就是「照規格寫」的意思
3. 你會看到棋盤是 **24×24**。因為 curl 不是瀏覽器，不會送 `resize`——
   所以你拿到的是第 2 章講的那個「還沒被量測過」的預設棋盤

> **一般性的教訓**：換掉一個手寫實作之前，先確定你**看得懂**它在做什麼。
> 如果你不知道 masking 是什麼，你也不會知道函式庫幫你處理掉了什麼，
> 出事的時候就只能瞎猜。**用函式庫不是不用懂，是不用寫。**

---

## 第 8 章：並行：兩條執行緒一把鎖 → 一個事件迴圈零把鎖

這一章是整個遷移裡差異最大的地方，所以兩個版本都放上來對照。

### 現在：asyncio，一個事件迴圈

```python
@app.websocket("/ws")
async def play(websocket: WebSocket) -> None:
    await websocket.accept()
    game = Game()
    await websocket.send_text(json.dumps(game.to_dict()))

    ticker = asyncio.create_task(_push_states(websocket, game))   # 時鐘
    try:
        while True:                                               # 指令泵
            command = parse_command(await websocket.receive_text())
            if command is None:
                continue
            apply(command, game)
    except WebSocketDisconnect:
        pass
    finally:
        ticker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await ticker
```

一樣是兩件事同時在跑：一個時鐘推狀態，一個迴圈收指令。
但**這裡一把鎖都沒有**，而且那不是疏忽。

### 為什麼可以沒有鎖

因為 asyncio 是**協作式**的：整個事件迴圈只有一條執行緒，
任務只在遇到 `await` 時才交出控制權。

`_push_states` 裡的關鍵段落是：

```python
await asyncio.sleep(game.tick_seconds)   # ← 只有這裡會讓出控制權
game.tick()                              # ← 這兩行中間沒有 await
await websocket.send_text(...)
```

`game.tick()` 從頭跑到尾中間沒有任何 `await`，所以**不可能跑到一半被打斷**。
指令泵不可能在 `tick()` 執行到第三行時插進來改 `self.snake`。

這就是為什麼 C++ 版的 `gameMutex` 在 Python 版裡沒有對應物。

> ⚠️ 這個保證很脆弱。哪天有人在 `tick()` 裡加了一個 `await`
> （例如「順手」把某段改成非同步 I/O），這個不變式就沒了，
> 而且**不會有任何編譯錯誤或測試失敗**——只會偶爾出現無法重現的怪狀態。
>
> **判準**：`Game` 的任何方法都不該是 `async`。它是純同步的資料結構，
> 非同步只存在於 `main.py`。

### 對照：C++ 版是怎麼做的

```
主執行緒
  └─ accept() 迴圈，等新連線
       └─ 每接到一個連線 → 開一個新 thread（detached）
            └─ runSession()
                 ├─ ticker thread：每 0.12 秒 tick 一次並推送狀態
                 └─ 本身：阻塞在 receiveText()，等玩家的指令
```

**一個連線兩條真的作業系統執行緒**，兩條都會寫同一個 `Game`。
同時寫入同一塊記憶體就是 **data race**，行為未定義（可能崩潰，可能靜默壞掉）。
所以兩邊都要先鎖 `gameMutex`：

```cpp
std::string state;
{
    std::lock_guard<std::mutex> lock(gameMutex);
    game.tick();
    state = game.toJson();       // 在鎖裡面把資料複製出來
}                                 // 鎖在這裡放掉
connection.sendText(state);      // 送網路（慢）的時候不持有鎖
```

那個「把資料複製出來再放鎖」的手法，是為了避免
**holding a lock across I/O**——持有鎖去做網路傳送，玩家的按鍵就會卡住。

搬到 asyncio 之後這個問題自己消失了，因為 `await send_text(...)` 讓出控制權時
本來就沒有鎖可以持有。

### 兩者共通的一件事：怎麼結束

**兩個版本都刻意避開了「睡滿一個 tick」。** 最直覺的寫法是無條件睡 120ms，
問題是玩家關掉分頁時，時鐘還在睡，得睡完才會發現要結束。

| 版本 | 做法 |
|---|---|
| C++ | `wake.wait_for(lock, interval, [&]{ return !running.load(); })`——等 120ms **或** 旗標變了就立刻醒 |
| Python | `ticker.cancel()`——直接在 `await asyncio.sleep(...)` 那個點丟出 `CancelledError` |

Python 版乾淨很多，但代價是你得知道 `cancel()` 是**用例外實作的**，
所以要用 `contextlib.suppress(asyncio.CancelledError)` 把它吞掉，
不然關閉連線時 console 會噴一坨紅字。

### 自我檢查

1. 如果把 C++ 版的 `sendText()` 移到 `lock_guard` 的大括號**裡面**，會發生什麼？
2. Python 版如果不呼叫 `ticker.cancel()`，會發生什麼？

<details>
<summary>參考答案</summary>

1. 網路傳送期間會一直持有 `gameMutex`。指令執行緒想處理玩家按鍵時會被卡住，
   按鍵反應變得遲鈍。網路越慢，遊戲越卡。
2. 那個任務會繼續跑，每 0.12 秒對一個**已經關掉的 socket** 呼叫 `send_text`。
   它會拋例外結束，但在那之前每個斷線的玩家都留下一個孤兒任務——
   這是 asyncio 版本的「連線洩漏」。`finally` 區塊就是在防這個。
</details>

---

## 第 9 章：前端分層：誰可以知道什麼

前端的檔案分層不是隨便放的，而是一條規則：**只有一個檔案同時知道 React 和 socket。**

```
web/
├── lib/                    ← 完全不 import React
│   ├── websocket.ts          WebSocket 客戶端
│   ├── input.ts              鍵盤 → 指令
│   ├── renderer.ts           Canvas 繪圖
│   ├── palette.ts            六組色碼（第 2 章）
│   └── board.ts              視窗尺寸 → 格子數（第 2 章）
│
├── hooks/useSnakeGame.ts   ← 唯一的接縫：React ↔ socket
│
└── components/game/        ← 純呈現，只收 props
    ├── GameCanvas.tsx
    ├── Hint.tsx
    ├── LitText.tsx
    ├── ScoreBoard.tsx
    ├── Prompt.tsx
    └── StartPauseButton.tsx
```

### 為什麼要這樣切

`lib/` 裡的程式碼不依賴 React，所以：

- 可以不啟動瀏覽器就測試
- 如果哪天要換成 Vue 或 Svelte，`lib/` 完全不用動
- 讀它的時候不用同時腦補 React 的生命週期

`hooks/useSnakeGame.ts` 是唯一「翻譯層」：它管 socket 的生死、
把伺服器狀態塞進 React state、綁鍵盤、送 `resize`。

`components/game/` 最近多拆了三個元件，但沒有改變這條邊界：

- `StartPauseButton` 從伺服器回傳的 `status` 決定顯示 Start 或 Pause，
  點下去只送意圖；它自己不保存「現在是否暫停」
- `Hint` 只負責底部操作提示
- `LitText` 是共用的視覺效果：分數、狀態和底部提示原本是黑字，
  蛇從字後面經過時，被蛇蓋到的部分會變成白色

這裡很容易誤會：`LitText` 的確會讀 `state.snake`，但它沒有因此接管遊戲規則。
它只拿伺服器已經決定好的座標計算 `clip-path`，不判定碰撞、不移動蛇，
也不把任何結果送回伺服器。**從權威狀態推導外觀，不等於擁有狀態。**

### `useEffect` 的清理函式

`useSnakeGame.ts:28` 的 effect 回傳了一個函式：

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
`useSnakeGame.ts:51` 的 resize effect 也是同樣的模式
（`addEventListener` 配 `removeEventListener`，而且順便 `clearTimeout` 那個 debounce timer）。

### 為什麼 resize effect 的相依是 `[connection]`

```ts
useEffect(() => {
  if (connection !== "open") return;
  ...
}, [connection, send]);
```

不是「掛載時送一次」而是「**每次連上就送一次**」。原因是：
斷線重連時，伺服器那邊是一個**全新的 `Game`**，回到 24×24 的預設棋盤
（`main.py:46` 每個連線都 `game = Game()`）。
如果只在掛載時送，重連之後盤面就會縮回一個小方塊。

> 這是「伺服器不記得你」這個設計的直接後果。
> 每當你決定「連線是無狀態的」，就要問一次：**重連之後，
> 有哪些是客戶端必須重新告訴伺服器的？**

### 自動重連

`websocket.ts:43` 的 `onclose` 裡有個判斷：

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
`useEffect` 不會跑、按鈕沒反應、state 永遠停在初始值。

這正是第 1 章那個 `allowedDevOrigins` bug 的症狀。

判斷有沒有 hydrate 的最快方法，是在 console 檢查 DOM 節點上有沒有 React 掛的內部屬性：

```js
const btn = document.querySelector('button');
Object.keys(btn).some(k => k.startsWith('__react'))   // true = 已 hydrate
```

> 順帶一提：`app/globals.css` 裡的 `:root` 有一組寫死的第 0 組配色。
> 那是給 hydration 之前的 SSR HTML 用的——不然頁面會先閃一下白底。

---

## 第 10 章：Canvas 與 DOM 渲染：dpr、滿版、遮罩

`web/lib/renderer.ts` 的 `Renderer` 有一個重要性質：
**它對遊戲是無狀態的**。它不記得上一幀是什麼，只是把傳進來的 `GameState` 畫出來。

這代表畫面**不可能**跟伺服器不一致——沒有可以「不同步」的本地狀態。

它也**只畫盤面**。分數、提示、按鈕全部是 DOM，浮在 canvas 上面
（`globals.css` 裡 `.ui` 是 `position: fixed` 加 `pointer-events: none`）。
這樣像素字型就是一個真的字型，而不是要用 `fillText` 重新實作一次的東西。

### devicePixelRatio：為什麼 canvas 會糊

Retina 螢幕上，1 個 CSS 像素對應 2 個（甚至 3 個）實體像素。
如果 canvas 只按 CSS 尺寸來設，畫出來的東西會被放大而模糊。

`renderer.ts:67` 的處理方式：

```ts
const dpr = window.devicePixelRatio || 1;

this.canvas.style.width  = `${boxWidth}px`;      // CSS 尺寸：版面上佔多大
this.canvas.style.height = `${boxHeight}px`;
this.canvas.width  = Math.round(boxWidth * dpr); // 實際像素緩衝區：畫布真正多少點
this.canvas.height = Math.round(boxHeight * dpr);
this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);     // 之後就能用 CSS 座標畫圖
```

關鍵是分清楚兩組尺寸：

| | 意義 |
|---|---|
| `canvas.style.width` | 在版面上顯示多大 |
| `canvas.width` | 內部像素緩衝區有多少點 |

最後那行 `setTransform` 讓後續所有繪圖指令可以用 CSS 座標寫，
瀏覽器自動乘上 dpr。不然每個座標都要手動乘。

### 滿版的代價：格子邊界不是整數

盤面要**剛好**鋪滿視窗，所以格子大小是「視窗寬 ÷ 格數」——
1920 ÷ 69 = 27.826…，是小數，而且跟垂直方向的 27.866… 還不完全一樣
（格子微微不是正方形，差不到 2%，看不出來）。

問題是**小數座標會被反鋸齒**。如果直接 `fillRect(x * 27.826, ...)`，
每個方塊的邊都落在半個像素上，瀏覽器會幫你「柔化」——
像素風的硬邊就這樣被磨掉了。

這個計算現在抽到 `board.ts:51` 的 `cellEdges()`，因為不只 canvas 需要它：

```ts
export function cellEdges(cell: number, cellSize: number): [start: number, size: number] {
  const start = Math.round(cell * cellSize);
  return [start, Math.round((cell + 1) * cellSize) - start];
}
```

每一格的四個邊都四捨五入到整數像素。關鍵是**寬度是用「右邊界減左邊界」算出來的**，
不是「格寬四捨五入」。所以第 5 格的右邊界和第 6 格的左邊界必然是同一個整數——
兩格之間**不會有一條一像素的縫，也不會重疊**。

> 如果改成 `width = Math.round(this.cellWidth)`，多數格子看起來一樣，
> 但每隔幾格就會出現一條 1px 的背景色細縫。這種 bug 在截圖上很難發現，
> 在動起來的畫面上會看到「閃爍的格線」。

### 同一套邊界，為什麼 canvas 和 DOM 都要用

`Renderer` 在 canvas 上畫蛇，但分數、狀態和底部提示是 DOM，位在 canvas 上方。
因此 canvas 沒辦法直接把文字切成兩種顏色：它根本碰不到上層 DOM。

`LitText.tsx:57` 的做法是把同一段文字疊兩次：

```tsx
<span className="lit">
  {children}                                  {/* 平常看見的黑字 */}
  <span className="lit__over" style={{ clipPath: `path("${clip}")` }}>
    {children}                                {/* 疊在上面的白字 */}
  </span>
</span>
```

白字副本平常被裁掉；每次收到 state，就把蛇佔的每一格轉成 SVG path，
只有落在那些矩形裡的白字會露出來。結果看起來就像蛇把文字「照亮」。

這也解釋了為什麼 `cellEdges()` 不能繼續私藏在 `Renderer`：canvas 畫出的蛇格
和 DOM 的遮罩只要有一邊用不同的四捨五入方式，就會錯開一個像素。
現在 `renderer.ts:145` 和 `LitText.tsx:43` 都呼叫同一個函式，
把「兩份演算法必須永遠同步」改成「只有一份演算法」。

### 頭和食物不再只是兩個方塊

`renderer.ts:88` 先把食物畫成內縮的黑色方塊，再畫蛇，最後在蛇頭加兩條圓角黑色眼睛。
眼睛跟著 `state.direction` 旋轉；格子小於 10px 時則不畫，避免縮成一團髒掉的像素。
這些都只是 renderer 從同一份 `GameState` 推導出的外觀，後端不需要知道「眼睛」存在。

### 另一個細節：不要每個 tick 都 resize

`GameCanvas.tsx:32` 只在**視窗或棋盤真的變了**的時候才呼叫 `renderer.resize()`：

```ts
if (last.width !== window.innerWidth || last.height !== window.innerHeight
    || last.cols !== state.width || last.rows !== state.height) { ... }
```

因為設定 `canvas.width` 會**重新配置整個像素緩衝區並清空它**。
每秒做 8 次是純粹的浪費，而且在慢的機器上會看到閃爍。

### 動手做

1. 把 `setTransform` 那行註解掉，存檔看看。
   在 dpr = 2 的螢幕上，畫面會縮到左上角四分之一——因為繪圖指令用的是 CSS 座標，
   但緩衝區是 2 倍大。（如果你的螢幕 dpr = 1，畫面不會有變化，這本身就說明了
   這行是在補償什麼。用瀏覽器 console 打 `window.devicePixelRatio` 可以查。）
2. 暫時把 `LitText.tsx:43` 的 `cellEdges(x, cellWidth)` 改成
   `[Math.round(x * cellWidth), Math.round(cellWidth)]`，讓蛇穿過分數文字，
   觀察遮罩邊緣為什麼偶爾會和蛇錯開。看完記得改回來。

---

## 第 11 章：測試是怎麼寫的

```bash
cd backend
.venv/bin/pytest                 # 全部，目前 81 個
.venv/bin/pytest -m command      # 只跑指令解析那一組
.venv/bin/pytest -k "resize"     # 用名稱篩選
.venv/bin/pytest -q              # 安靜模式
```

### 一個檔案一組，順便一個 marker

```
backend/tests/
├── conftest.py          把 backend/ 放進 sys.path
├── test_snake.py        身體、成長、轉向緩衝
├── test_collision.py    撞牆、撞自己
├── test_game.py         狀態機、計分、配色、resize
├── test_wire.py         序列化出來的形狀
└── test_command.py      解析與套用客戶端訊息
```

每個檔案開頭有一行 `pytestmark = pytest.mark.game`（諸如此類），
marker 註冊在 `backend/pyproject.toml`。所以既可以用檔名跑，也可以用 `-m` 跑。

> 這個結構是從 C++ 版的 Catch2 標籤（`[snake]` `[collision]` `[game]` `[wire]` `[command]`）
> 一對一搬過來的。**測試的分組方式跟語言無關**——它反映的是程式碼的分模組方式。

### conftest.py 在做什麼

```python
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
```

`conftest.py` 是 pytest 會**自動載入**的檔案，不需要 import。
這裡用它把 `backend/` 加進 module 搜尋路徑，所以測試裡可以直接
`from game.game import Game`，不用做 packaging（沒有 `setup.py`、沒有 `pip install -e .`）。

對一個本機玩具來說這是對的取捨；如果這東西要發佈成套件，就該改成正式的 packaging。

### 測試在守什麼

值得注意的是，測試不只是「檢查功能會動」，而是**守住那些容易被「順手優化」破壞的不變式**：

| 測試 | 守住的東西 |
|---|---|
| `test_two_turns_in_one_tick_cannot_fold_the_snake_onto_its_neck` | 第 4 章的轉向緩衝 |
| `test_a_coiled_snake_may_move_onto_the_cell_its_tail_is_leaving` | 第 5 章排除尾巴 |
| `test_the_same_loop_kills_a_snake_one_segment_longer` | 上一條的反例，防止排除得太多 |
| `test_growth_score_and_palette_all_land_on_the_eating_tick` | 第 3 章的執行順序 |
| `test_running_into_a_wall_ends_the_game_without_moving` | 死亡檢查在移動之前 |
| `test_a_hostile_board_size_is_clamped_not_honoured` | 第 2 章：伺服器保留裁決權 |
| `test_the_message_has_exactly_the_fields_the_browser_expects` | 第 2 章的傳輸契約 |
| `test_malformed_text_is_rejected_rather_than_raising` | 畸形輸入不能弄掛連線 |

寫測試時值得問自己：**「如果有人不懂這段程式碼，他會怎麼把它改壞？」**
然後為那個情境寫測試。

`test_the_same_loop_kills_a_snake_one_segment_longer` 是這個原則的好例子：
光有「追尾巴合法」那條測試，你可以把 `hits_self` 寫成永遠回傳 `False` 而測試全過。
加上「多一節就會死」那條之後，唯一能同時通過的實作就只剩正確的那個。

---

## 第 12 章：模組設計——介面、接縫、可測試性

前面幾章談的是「這段程式碼在做什麼」。這章談**「為什麼它被放在那裡」**。

### 一個真實的例子：解析指令的程式碼搬過家

`parse_command()` 現在住在 `backend/game/command.py`。
但在 C++ 版裡，它一開始是寫在 `main.cpp` 的一個**匿名 namespace** 裡的——
那是 C++ 用來把符號限制在單一檔案內的寫法。

**它能動，但有一個嚴重問題：測不到。**

匿名 namespace 代表其他檔案無法連結到它。而 `main.cpp` 有 `main()` 函式，
測試程式沒辦法連結它。結果就是：整個專案風險最高的程式碼
（**直接處理來自網路的不受信任輸入的字串解析**），**一個測試都沒有**。

Python 沒有匿名 namespace，但**完全一樣的錯誤照樣寫得出來**：
把 `parse_command` 寫成 `main.py` 裡的一個函式，或加底線變成 `_parse_command`
表示「這是私有的」。測試理論上還是 import 得到，但 import `main.py` 會順便
建立 FastAPI app、跑 module-level 的副作用——你的單元測試就開始需要一個網頁框架了。

> **語言變了，設計壓力沒變。** C++ 是連結器擋著你，Python 是 import 的副作用煩著你，
> 結論都一樣：**風險最高的程式碼要放在自己能被單獨載入的地方。**

### 搬家時做的兩件事

**第一，換位置。** 從入口檔案搬到一個獨立模組，成為有公開介面的東西。
這個「介面所在的位置」有個名字叫 **seam（接縫）**——
你可以在這裡替換行為、觀察行為，而不用去改使用它的地方。

**第二，把「解析」和「執行」拆開。** 原本一個函式一口氣做兩件事：
解析字串、然後改變 game。現在是：

```python
def parse_command(text: str) -> Command | None:   # 純函式，回傳值
def apply(command: Command, game: Game) -> None:  # 唯一有副作用的
```

為什麼這個拆分很重要？因為**回傳值的函式比產生副作用的函式好測太多**：

```python
# 拆開後：不需要 Game、不需要 socket、不需要事件迴圈
assert parse_command('{"type":"turn","direction":"LEFT"}') == Turn(Direction.LEFT)
assert parse_command("not json") is None
```

`test_command.py` 裡光是「畸形輸入」就 parametrize 了 15 種，
包括空字串、陣列、數字、缺欄位、型別錯、以及 `{"width": true}`——
最後那個是因為**Python 的 `bool` 是 `int` 的子類別**，
`isinstance(True, int)` 是 `True`，所以 `_is_dimension`（`command.py:49`）
必須額外排除它。這種只有寫測試才會逼你想到的邊界，就是拆分換來的東西。

### 「深模組」：小介面，大內涵

一個好模組的判準不是「程式碼多短」，而是
**呼叫者需要學多少東西，才能用到多少功能**。

```
    ┌──────────────────┐
    │    小小的介面     │  ← parse_command(text) -> Command | None
    ├──────────────────┤
    │                  │
    │   大量的實作      │  ← JSON 解析、型別檢查、方向名稱對應、
    │                  │     bool/int 陷阱、每一種拒絕情況
    └──────────────────┘
```

`parse_command` 只有一個參數、一個回傳值，但它背後處理了十幾種畸形輸入。
呼叫者（`main.py`）只需要知道「給我字串，還我 `Command` 或 `None`」。

反過來說，**淺模組**是「介面幾乎跟實作一樣複雜」的東西——
呼叫者要學一堆才能用一點點，那還不如把程式碼直接寫在呼叫端。

### 介面比你以為的更大

這是最容易被忽略的一點。「介面」不只是函式簽名，而是
**呼叫者必須知道的每一件事**——包括你沒打算讓他知道的。

C++ 版有個真實案例：有人在 `Game.hpp` 裡寫了 `using namespace std;`。
編譯得過，看起來人畜無害。但標頭檔會被每一個使用者 include，
於是這個模組的介面偷偷多了一條：「而且我會污染你的命名空間」。

Python 的對應物是 `from x import *`，還有一個更常見的版本：
**在模組頂層做副作用**。

```python
# 假設 game.py 頂層有這行
logging.basicConfig(level=logging.DEBUG)   # ← 誰 import 我，誰的 logging 就被我設定了
```

`import` 一個模組會執行它的頂層程式碼。任何寫在頂層的副作用，
都是這個模組介面的一部分，即使它沒出現在任何函式簽名裡。
這也是為什麼 `backend/main.py` 把 `uvicorn.run(...)` 包在
`if __name__ == "__main__":` 裡面——不然 `import main` 就會開始監聽埠號。

同一個道理也適用在「為了測試方便而開的洞」上。C++ 版有一個
`Game::setFood()`，純粹是給測試用的，但因為放在公開介面裡，
**每一個**呼叫者都能拿它把食物放到蛇身上、破壞遊戲的不變式。

Python 版沒有這個方法——測試直接寫 `game.food = (3, 0)`。這不是變乾淨了，
是**變誠實了**：Python 本來就沒有真正的私有，與其假裝有，
不如承認「屬性是可寫的」並且在測試裡直接用。代價一樣存在，
只是不再偽裝成一個經過設計的 API。

### 刪除測試

判斷一個模組值不值得存在，有個好用的思想實驗：
**想像把它刪掉，把程式碼直接貼回呼叫端會怎樣？**

- 如果複雜度就這樣消失了 → 它只是個轉手的空殼，本來就不該存在
- 如果複雜度在 N 個呼叫端各自重新長出來 → 它有在做事

`command.py` 通過這個測試嗎？勉強——目前只有一個呼叫端（`main.py`）。
但它換來的是**可測試性**：把它貼回去，那幾十個關於畸形輸入的斷言就沒地方寫了。
這也是接縫的價值：測試和呼叫者走的是同一道介面。

`collision.py` 也是類似的情況，而且更值得。它可以直接寫成 `Snake` 的方法，
但**參數形狀會因此改變**：方法只能問「我現在有沒有撞到」，
自由函式可以問「如果我走到那一格會不會撞到」。
後者才是 `tick()` 需要的（第 3 章的 ②）。
**是介面形狀在決定模組的位置，不是反過來。**

### 什麼時候**不**該開接縫

一個常見的過度設計是：為了「以後可能會換掉」而先抽象。

這個專案裡有個例子。`play()`（`main.py:42`）收的是具體的 `WebSocket`，
所以那段連線生命週期的邏輯（時鐘任務 + 指令泵 + 取消，也就是第 8 章）
目前**沒有單元測試**。要能測，就得在那裡開一個接縫，讓假的 connection 進得來。

該做嗎？值得，因為那是全專案最微妙的程式碼。但注意判準是
**「測試本身就是第二個實作」**，不是「以後說不定會用別的傳輸層」。
如果只有一個實作、而且看不到第二個，那個接縫就只是想像出來的。

> **判準**：一個實作＝假想的接縫。兩個實作（含測試替身）＝真的接縫。

### 自我檢查

1. `parse_command` 為什麼要回傳 `Command | None`，而不是直接呼叫 `game.turn()`？
2. `Game.to_dict()` 回傳的是 `dict`，而不是 FastAPI 或 pydantic 的某個型別。為什麼這件事重要？

<details>
<summary>參考答案</summary>

1. 回傳值讓它成為純函式：同樣的輸入永遠得到同樣的輸出、沒有副作用，
   所以測試不需要準備一個 `Game`，也能斷言「這串字到底被解析成什麼」。
   直接呼叫 `game.turn()` 的話，你只能透過 game 的狀態間接推斷解析結果。
2. 因為 `game/` 這整個套件**完全不 import FastAPI**。遊戲規則對「它被誰用」
   一無所知，所以測試不需要網頁框架、換掉 FastAPI 也不用動規則。
   這跟 C++ 版把 nlohmann/json 設成 `PRIVATE` 相依是同一件事：
   **不要讓實作用到的函式庫洩漏進你的公開介面。**
</details>

---

## 第 13 章：這個專案「刻意沒做」的事

理解一個專案不只要看它做了什麼，也要看它**選擇不做**什麼。
這些都是很好的練習題。

### 1. 傳輸契約靠人工同步

第 2 章提過。`wire` 那組測試已經釘住 **Python 這一側**的形狀——
它斷言完整的欄位集合，所以欄位被改名或刪掉會被抓到。
但沒有任何東西檢查 `web/types/game.ts` 是否同意，
所以「只在單邊加一個欄位」仍然會靜靜地漏過去。

改善方向：

- 在前端寫一個測試，連真的伺服器收一包狀態，對照 TypeScript 型別驗證
- 或用一份 schema 檔同時產生 Python 和 TypeScript（根治，但要引入工具鏈）
- 用 pydantic 定義 state，再從它產生 JSON Schema，再產生 TS 型別

### 2. 「贏」和「輸」分不出來

蛇填滿棋盤時 `status` 是 `game_over`，跟撞牆一樣。
**練習**：加一個 `GameStatus.WON`。你需要動的地方：
`game.py` 的 enum、`game.py:135` 那行、`web/types/game.ts` 的 `GameStatus`、
`components/game/Prompt.tsx` 的 `PROMPT` 對應表、`ScoreBoard.tsx` 的 `STATUS_LABEL`。
（走一遍這條路，你就完全懂第 2 章那條規則的代價了。）

### 3. 分數不會保存

關掉分頁就沒了。沒有資料庫、沒有排行榜。

### 4. 速度不會變快

`DEFAULT_TICK_SECONDS` 是固定的 0.12 秒。
**練習**：讓 tick 隨分數縮短。注意 `_push_states` 每圈都重讀 `game.tick_seconds`，
所以這次只要改 `Game` 就好——C++ 版那邊反而要先修 ticker 迴圈才行。

### 5. 改變視窗大小會重開一局

第 2 章解釋過為什麼。**練習**：改成「只有變小到裝不下蛇時才重開，
變大就直接沿用」。想想這需要在 `resize()` 裡檢查什麼。

### 6. 配色的順序是寫死的

`palette` 是 `(palette + 1) % PALETTE_COUNT`，永遠照順序輪。
**練習**：改成隨機挑下一組（但不能跟現在同一組）。
注意這件事**只能在伺服器做**——正因為送的是索引而不是顏色，
前端根本不知道下一組是誰，所以這個改動一行前端都不用動。
（如果當初選了「前端自己算 `score % 6`」，這個練習就做不了。）

### 7. 沒有多人同房

每條連線有**自己的** `Game`（`main.py:46` 的 `game = Game()`）。
兩個玩家看到的是完全獨立的棋盤。要做同房需要一個共享的 `Game` 和玩家清單——
而且那一刻起，第 8 章「反正只有一條執行緒」的推論就要重新檢查一次。

### 8. 沒有觸控操作

手機上只能按畫面上的按鈕，沒有滑動手勢。
**練習**：在 `lib/input.ts` 旁邊加一個 `touch.ts`，把滑動方向翻成同樣的
`ClientMessage`。注意它應該和 `input.ts` 一樣**不 import React**。

### 9. 伺服器只綁 loopback

只有本機連得到。要讓區網其他裝置連進來得改成 `host="0.0.0.0"`——
但那之前要先想清楚沒有任何驗證機制的後果。

---

## 名詞表

| 名詞 | 意思 |
|---|---|
| **tick** | 遊戲時間的最小單位。這裡是 0.12 秒一次，每次蛇走一格 |
| **server-authoritative** | 伺服器擁有所有遊戲狀態的權威，客戶端只是顯示器 |
| **wire format / 傳輸契約** | 兩端約定好的訊息結構。這裡是 `Game.to_dict()` ↔ `types/game.ts` |
| **handshake** | WebSocket 連線建立時，從 HTTP「升級」成長連線的那一次交握 |
| **frame** | WebSocket 傳輸的基本封包單位，含 opcode、長度、遮罩 |
| **masking** | 瀏覽器送出的 payload 必須用隨機 4 bytes XOR，防快取污染攻擊 |
| **opcode** | frame 的類型代碼：`0x1` 文字、`0x8` 關閉、`0x9` ping、`0xA` pong |
| **event loop（事件迴圈）** | asyncio 的核心。單執行緒，輪流跑那些「還沒卡在 await」的任務 |
| **coroutine / `async def`** | 可以中途讓出控制權的函式。只在 `await` 的那一刻讓出 |
| **協作式並行** | 任務自己決定什麼時候讓出控制權（對比：作業系統隨時可以搶走的先佔式） |
| **`asyncio.Task`** | 被排進事件迴圈、和呼叫者並行跑的 coroutine。可以 `cancel()` |
| **data race** | 兩個執行緒同時存取同一塊記憶體且至少一個是寫入。行為未定義 |
| **mutex** | 互斥鎖。同一時間只有一個執行緒能持有。asyncio 版本裡沒有 |
| **venv** | 專案專屬的 Python 環境。裝的套件不會污染系統，專案之間互不干擾 |
| **conftest.py** | pytest 自動載入的設定檔，不需要 import |
| **marker** | pytest 的測試標籤，用 `-m` 篩選。這裡對應 C++ 版的 Catch2 tag |
| **hydration** | Next.js 把伺服器產生的靜態 HTML「接手」成可互動 React 的過程 |
| **devicePixelRatio (dpr)** | 一個 CSS 像素對應幾個實體像素。Retina 通常是 2 或 3 |
| **deque** | 雙端佇列。兩端插入刪除都是 O(1) |
| **純函式** | 不持有狀態、同輸入必得同輸出的函式。極易測試 |
| **loopback** | `127.0.0.1`，只有本機能連的網路介面 |
| **seam（接縫）** | 能替換或觀察行為、而不必修改呼叫端的位置。模組介面所在之處 |
| **深模組 / 淺模組** | 深＝小介面藏大量行為；淺＝介面幾乎和實作一樣複雜，等於沒幫上忙 |
| **palette（配色索引）** | 伺服器送的整數，指向 `web/lib/palette.ts` 裡的第幾組顏色 |
| **debounce** | 連續事件只在停下來之後處理最後一次。這裡用在視窗縮放 |
| **hot reload** | 不重啟行程就換掉程式碼。前端有（Fast Refresh）；`uvicorn --reload` 是重啟，不是 hot reload |

---

## 建議的學習路徑

**第一天**：第 0、1、2 章。跑起來，看懂資料形狀和所有權邊界。
**第二天**：第 3、4、5 章。這是遊戲邏輯的核心，讀完你能改遊戲規則了。
**第三天**：第 6、11 章。改一個小功能，然後為它寫測試。
**第四天**：第 9、10 章。前端分層與渲染。
**第五天**：第 7、8 章。最硬的兩章，但也是最有價值的——
特別是第 8 章那兩個版本的對照。
**第六天**：第 12 章。回頭看前面所有章節的程式碼「為什麼被放在那裡」。
**之後**：挑第 13 章裡的一個練習做完。第 6 題（隨機配色）最短，
第 2 題（分出輸贏）最能體會傳輸契約的代價。

有任何一段看不懂，直接問我——把章節和困惑點講出來就好。

---

## 延伸資源

- [RFC 6455 — The WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455) —
  第 7 章的一手規格。特別是 §1.3（握手）和 §5（framing）
- [MDN: Writing WebSocket servers](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers) —
  比 RFC 好讀很多的入門版
- [Python 官方：asyncio 開發指南](https://docs.python.org/3/library/asyncio-dev.html) —
  第 8 章。特別是「並行與多執行緒」那節
- [FastAPI: WebSockets](https://fastapi.tiangolo.com/advanced/websockets/) — 第 7、8 章
- [MDN: Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial) — 第 10 章
- [React: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) —
  第 9 章。理解什麼時候**不**該用 `useEffect` 跟知道怎麼用一樣重要
