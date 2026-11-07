# 痛點小故事 15 秒：A5 Historical Cartoon 畫風，現代版提示詞

工具：kaomei/stickman-video-director，A · Director / Style 5（Historical Cartoon）。時代改成現代，畫法照 A5 不變：白色圓頭＋短白脖子、黑色細四肢、實心黑色圓手掌、2D 賽璐璐上色、彩色繪畫風背景。

- 比例 16:9，兩段，每段約 10 秒，剪成 8 秒 + 7 秒 = 15 秒
- 畫面不放任何字；不配旁白，只有配樂和音效（第二步 shotcraft 再決定要留、換掉還是靜音）
- 角色名字沿用三分鐘腳本：屋主 Maria、師傅 Luis

## 用法

1. 到 Gemini 開影片生成，**片段 1、片段 2 各開一次**，把下面整段英文提示詞原封不動貼進去（不要刪減，角色描述要完整）。
2. 若你有做角色參考圖，每段都要附上；沒有也可以，人物一致性會差一點。
3. 每段可以多生成幾次，挑人物最完整的那一版（頭和脖子連著、手是黑色圓手掌、沒有多出來的手腳、畫面沒有字）。
4. 把挑好的檔案放到 `D:\paypal\done\video\in\pain15\`，檔名 `clip1.mp4`、`clip2.mp4`，再跟我說。

## 中文對照（只給你看，不用貼）

**片段 1：Maria 先付錢，師傅跑了**
- 0–3 秒：深夜廚房，水龍頭一直滴進鍋子，Maria 皺眉；門鈴響，她開門，一個師傅拎著紅色工具箱站在門口。
- 3–7 秒：Maria 先把一個鼓鼓的信封交出去，師傅笑著收進外套、點頭，轉身沿走廊快步走掉，回頭瞄一眼，消失在畫面外。
- 7–10 秒：時間跳到早上，水龍頭還在滴，鍋子滿出來流到流理台，Maria 垂著肩站著，兩手空空。

**片段 2：Luis 先做完，收不到錢**
- 0–3 秒：另一間明亮的廚房，Luis 躺在水槽下鎖緊水管，滑出來打開水龍頭，水流乾淨、不再滴，他擦汗微笑。
- 3–7 秒：Luis 在大門口攤開手掌要工錢；屋主看了一眼手機，笑一笑聳肩，揮手表示「改天」，把門關上。
- 7–10 秒：黃昏，Luis 一個人坐在門廊台階上、工具箱放旁邊，攤著空手掌，路燈亮起，一片落葉飄過，他嘆一口氣，停在這個畫面。

---

## 片段 1 提示詞（貼這段）

```text
A 10-second 16:9 stickman animated video, landscape, smooth 2D cel animation, the highest resolution the tool supports.

STYLE: Polished 2D cel-shaded cartoon in a modern-day setting, clean thick black outlines, softly shaded modern everyday clothing, and warm painterly full-color surroundings.
CHARACTER: Each character is a 2D cartoon adult with a round white head and a short, sturdy white neck growing naturally from the clothed shoulders and supporting the jaw. The white head and neck form one continuous filled silhouette. The lower jaw flows directly into the short white neck; the bottom of that neck enters the shirt neckline. The visible connection is white, with black outlines only along its two sides. Keep this white connection visible during walking, turns, tilts and camera cuts. Use balanced adult stickman proportions rather than a big-headed chibi: the complete standing figure is roughly four head-heights tall, the round head is visibly narrower than the clothed shoulder span, the torso is slightly longer than the head, and the thin black legs provide a natural lower-body length. The exposed neck is short, about one tenth of the head diameter tall. Thin black arms and legs, exactly two of each.
FACE: An appealing, expressive storybook-cartoon face on the round white head. Two solid black vertical oval eyes; character-specific eyebrows, nose and mouth defined in the cast card, not a universal template face. Subtle cheek shading gives the face warmth without realistic skin texture. Expressions react to the action while the eye shape, nose shape, face proportions and identity remain unchanged. Hair and facial hair, when present in the cast, have a few clearly shaped locks and soft cel shading, not flat featureless patches. Keep this readable cartoon richness, not a blank symbolic face, photorealism or detailed irises.
PALMS: Each thin black wrist ends in one compact, solid black rounded oval palm with a subtle integrated thumb bump. Use the same palm-to-head proportion in both hands and all shots: total palm silhouette about 18% of head diameter long and 10% wide, including the thumb bump. It is visibly wider than the wrist, neither a wrist-tip dot nor an enlarged glove. No separate fingers, finger lines or white fill. The empty indicating gesture keeps this compact silhouette; change the arm angle instead of spreading or enlarging the palm.
EXPOSED LIMBS: Every uncovered arm, forearm, wrist and shin is one slender solid black stroke. Face and short neck use white fill; the limbs use solid black strokes. Preserve the character proportions and costume colors throughout.

PALETTE: warm cream walls, teal blue, tomato red, sunny yellow, olive green, soft dusk purple.

SETTING: A small modern apartment at night. A cozy kitchen with cream walls, a teal tiled backsplash, a stainless steel sink with a chrome faucet, and a short hallway leading to a wooden front door. Warm lamp light inside, rain-blue darkness outside the window. All surfaces are blank, with no writing anywhere.

CAST:
- MARIA (homeowner): adult woman in her thirties, round white head with the continuous white jaw-to-short-neck connection entering the round neckline of her white t-shirt. Dark brown shoulder-length wavy hair with a few clearly shaped locks, visible on both sides of the head. Arched expressive eyebrows, one short shallow curved nose line, small mouth. Two solid black vertical oval eyes. Mustard-yellow knit cardigan over the white t-shirt, blue jeans, grey house slippers. Thin black exposed wrists and ankles, compact solid black mitten-shaped palms continuous with the wrists, one subtle integrated thumb lobe, no individual fingers.
- THE SLICK PLUMBER: lean adult man, round white head with the continuous white jaw-to-short-neck connection entering the collar of his jacket. Slicked-back black hair with a few shaped locks, a thin black mustache, narrow half-lidded sly eyebrows, a wide toothy grin. Red baseball cap worn backward, grey zip-up work jacket with one chest pocket, black cargo pants, black boots. Thin black exposed wrists, compact solid black mitten-shaped palms with one subtle thumb lobe, no individual fingers.

PROPS: one stainless steel cooking pot sitting under the faucet in the sink; one red metal toolbox owned by the plumber, held in his left hand; one thick plain white paper envelope of money, completely blank, held by Maria at the start.

OPENING LAYOUT: Close-medium shot of the sink on the left of frame; Maria stands at the sink on the right, facing left, holding the blank envelope in her right hand against her chest.

[0-3s] Close-up: a single drop falls from the faucet and plinks into the pot, ripples spread; cut to Maria looking up at the faucet with a worried frown. The doorbell sound rings; she turns and walks right down the hallway and opens the front door. The slick plumber stands in the doorway, toolbox in his left hand, and gives a big friendly grin.
[3-7s] Medium shot at the door: Maria holds out the blank envelope with her right hand before any work is done. The plumber takes it with his right palm, taps it to his forehead in a little salute, and tucks it into his jacket chest pocket. He turns away to the right, walks quickly down the outside corridor with the toolbox, glances back once over his shoulder with a sly grin, speeds up, and exits frame right. Maria stands in the open doorway with her empty right palm still half raised.
[7-10s] Planned time cut to morning: pale sunlight fills the same kitchen. The faucet is still dripping; the pot has overflowed and a small puddle spreads across the counter. Maria stands beside the sink in the same clothes, shoulders slumped, both empty palms turned up, staring at the drip with tired eyes. Slow push-in on her face. End on this held pose.

AUDIO: No voiceover, no narration, no speech, no dialogue, no singing. Light comic score from the first frame: plucked pizzicato strings and a soft marimba, one consistent playful-melancholy theme. Timed SFX: water drip plinks at 0s and through the clip, a two-tone doorbell at 2s, quick footsteps fading at 5-6s, a small sad descending marimba note at 8s.

NO VISIBLE TEXT, LETTERS, NUMBERS, SUBTITLES, LOGOS OR WATERMARKS (blank paper or abstract brush strokes only), NO SPEECH BUBBLES, NO BLOOD OR GORE, NO PHOTOREALISTIC FACES, NO 3D CGI, NO PAPER TEXTURE, NO EXTRA LIMBS, NO FUSED OR DUPLICATE HEADS, NO COSTUME CHANGES, NO EXTRA CHARACTERS, NO INDIVIDUAL FINGERS, NO FINGER SEPARATIONS, NO WHITE HANDS OR GLOVES, NO FLOATING HEAD, NO BACKGROUND GAP BETWEEN HEAD AND NECKLINE.
```

## 片段 2 提示詞（貼這段）

```text
A 10-second 16:9 stickman animated video, landscape, smooth 2D cel animation, the highest resolution the tool supports.

STYLE: Polished 2D cel-shaded cartoon in a modern-day setting, clean thick black outlines, softly shaded modern everyday clothing, and warm painterly full-color surroundings.
CHARACTER: Each character is a 2D cartoon adult with a round white head and a short, sturdy white neck growing naturally from the clothed shoulders and supporting the jaw. The white head and neck form one continuous filled silhouette. The lower jaw flows directly into the short white neck; the bottom of that neck enters the shirt neckline. The visible connection is white, with black outlines only along its two sides. Keep this white connection visible during walking, turns, tilts and camera cuts. Use balanced adult stickman proportions rather than a big-headed chibi: the complete standing figure is roughly four head-heights tall, the round head is visibly narrower than the clothed shoulder span, the torso is slightly longer than the head, and the thin black legs provide a natural lower-body length. The exposed neck is short, about one tenth of the head diameter tall. Thin black arms and legs, exactly two of each.
FACE: An appealing, expressive storybook-cartoon face on the round white head. Two solid black vertical oval eyes; character-specific eyebrows, nose and mouth defined in the cast card, not a universal template face. Subtle cheek shading gives the face warmth without realistic skin texture. Expressions react to the action while the eye shape, nose shape, face proportions and identity remain unchanged. Hair and facial hair, when present in the cast, have a few clearly shaped locks and soft cel shading, not flat featureless patches. Keep this readable cartoon richness, not a blank symbolic face, photorealism or detailed irises.
PALMS: Each thin black wrist ends in one compact, solid black rounded oval palm with a subtle integrated thumb bump. Use the same palm-to-head proportion in both hands and all shots: total palm silhouette about 18% of head diameter long and 10% wide, including the thumb bump. It is visibly wider than the wrist, neither a wrist-tip dot nor an enlarged glove. No separate fingers, finger lines or white fill. The empty indicating gesture keeps this compact silhouette; change the arm angle instead of spreading or enlarging the palm.
EXPOSED LIMBS: Every uncovered arm, forearm, wrist and shin is one slender solid black stroke. Face and short neck use white fill; the limbs use solid black strokes. Preserve the character proportions and costume colors throughout.

PALETTE: warm cream walls, teal blue, tomato red, sunny yellow, olive green, soft dusk purple.

SETTING: A different, bright suburban house. First a sunny kitchen with white cabinets, an olive-green wall and a window full of daylight; then the house's wooden front porch with three steps, a potted plant and a street lamp at dusk. All surfaces are blank, with no writing anywhere.

CAST:
- LUIS (plumber): stocky adult man in his forties, round white head with the continuous white jaw-to-short-neck connection entering the round neckline of his orange t-shirt. Short black curly hair with a few clearly shaped curls, visible on top of the head, and a short neat black beard along the jaw that overlaps but does not hide the white neck. Kind, gently sloped eyebrows, one short shallow curved nose line, warm smile. Two solid black vertical oval eyes. Navy-blue work overalls over the orange t-shirt, brown work boots. Thin black exposed forearms and wrists, compact solid black mitten-shaped palms continuous with the wrists, one subtle integrated thumb lobe, no individual fingers.
- THE CLIENT (homeowner): tall thin adult man in his fifties, round white head with the continuous white jaw-to-short-neck connection entering the collar of his shirt. Neat grey side-parted hair with a few shaped locks, high raised confident eyebrows, one short shallow curved nose line, a thin polite smile. Two solid black vertical oval eyes. Light-blue button-up shirt with a dark-grey suit vest, dark-grey trousers, brown loafers. Thin black exposed wrists, compact solid black mitten-shaped palms with one subtle thumb lobe, no individual fingers.

PROPS: one silver wrench owned by Luis, held in his right hand, later placed inside his toolbox; one navy-blue metal toolbox owned by Luis; one black smartphone with a dark blank screen, held by the client in his left hand.

OPENING LAYOUT: Low wide shot of the sunny kitchen. Luis lies on his back with his head and shoulders under the open sink cabinet, legs out to the right, wrench in his right hand. The toolbox sits open on the floor beside him.

[0-3s] Luis gives the pipe a final turn with the wrench, slides out from under the sink, stands, and turns on the faucet: a clean steady stream, then he turns it off and it stays dry, not a single drip. He wipes his brow with the back of his left wrist and smiles proudly, then drops the wrench into the toolbox and closes it.
[3-7s] Cut to the front door from the porch side: Luis stands on the porch holding the toolbox in his left hand and holds out his empty right palm, face up, with a hopeful smile. The client stands in the doorway, glances down at his blank phone, gives a polite smile and a small shrug, waves his right palm in a "later" gesture, steps back inside and closes the door. Luis's palm is still held out in front of the closed door.
[7-10s] Planned time cut to dusk: soft purple sky. Luis sits alone on the porch steps with the toolbox beside him, elbows on his knees, looking down at his empty right palm. The street lamp flickers on, one dry leaf blows slowly past his boots, and his shoulders drop in a long sigh. Slow pull-back to a wide shot of the small figure on the steps. End on this held pose.

AUDIO: No voiceover, no narration, no speech, no dialogue, no singing. Light comic score from the first frame: plucked pizzicato strings and a soft marimba, one consistent playful-melancholy theme. Timed SFX: wrench squeak at 0s, faucet water rush at 1.5s, toolbox latch click at 2.5s, door closing thud at 6s, street lamp buzz at 8s, a soft breeze at 9s.

NO VISIBLE TEXT, LETTERS, NUMBERS, SUBTITLES, LOGOS OR WATERMARKS (blank paper or abstract brush strokes only), NO SPEECH BUBBLES, NO BLOOD OR GORE, NO PHOTOREALISTIC FACES, NO 3D CGI, NO PAPER TEXTURE, NO EXTRA LIMBS, NO FUSED OR DUPLICATE HEADS, NO COSTUME CHANGES, NO EXTRA CHARACTERS, NO INDIVIDUAL FINGERS, NO FINGER SEPARATIONS, NO WHITE HANDS OR GLOVES, NO FLOATING HEAD, NO BACKGROUND GAP BETWEEN HEAD AND NECKLINE.
```

## 拿回來之後我會做的事

- 檢查每段：頭和脖子有沒有連著、手是不是黑色圓手掌、手腳數量對不對、畫面有沒有冒出字、道具有沒有變多或消失。
- 剪接：片段 1 取 0–8 秒，片段 2 取最好的 7 秒，在「Maria 早上垂肩」和「Luis 修水管」之間直接切，接成 15 秒。輸出 1920×1080；原檔不到 1080p 就放大。
- 配樂兩段若接不起來，交給第二步處理（換成同一首配樂或靜音）。
