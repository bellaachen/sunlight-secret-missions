import sys, json
from PIL import Image
import numpy as np
src = sys.argv[1]; out = sys.argv[2]
IDLE_SCALE = 0.72   # idle 立繪比走路大約 1.38x（以頭寬量測），統一等比縮放
CW, CH = 112, 96    # 每格大小；腳底 = 格子底邊
def crop(name, x0, x1, flip=False, scale=1.0):
    im = Image.open(f"{src}/{name}.png").convert("RGBA")
    c = im.crop((max(0,x0-2), 0, x1+3, 128))
    a = np.array(c)
    a[a[:,:,3] < 24] = 0                       # 清掉去背殘留的淡邊
    c = Image.fromarray(a); c = c.crop(c.getbbox())
    if flip: c = c.transpose(Image.FLIP_LEFT_RIGHT)
    if scale != 1.0:
        c = c.resize((round(c.width*scale), round(c.height*scale)), Image.LANCZOS)
    al = np.array(c)[:,:,3] > 60
    # 水平對齊點：腳的區域（最下方 12px）的質心，避免尾巴把重心拉偏
    feet = al[-12:]; xs = np.where(feet.any(0))[0]
    fx = (xs.min()+xs.max())/2 if len(xs) else c.width/2
    return c, fx
plan = {
 "idle":       [("idle",x0,x1,False,IDLE_SCALE) for x0,x1 in [(148,235),(275,363),(404,490),(532,619)]],
 "walk_down":  [("walk_down",x0,x1,False,1) for x0,x1 in [(71,112),(173,210),(684,723),(812,850)]],
 "walk_up":    [("walk_up",x0,x1,False,1) for x0,x1 in [(75,113),(684,723),(812,850)]],
 "walk_left":  [("walk_left",659,747,False,1),("walk_right",530,620,True,1),("walk_right",658,750,True,1)],
 "walk_right": [("walk_right",530,620,False,1),("walk_left",659,747,True,1),("walk_right",658,750,False,1)],
}
cells=[]; frames={}; anims={}
for anim, items in plan.items():
    anims[anim]=[]
    for i,(n,x0,x1,fl,sc) in enumerate(items):
        img,fx = crop(n,x0,x1,fl,sc)
        cell = Image.new("RGBA",(CW,CH),(0,0,0,0))
        px = round(CW/2 - fx); py = CH - img.height
        cell.alpha_composite(img,(max(0,min(CW-img.width,px)),py))
        key=f"{anim}_{i}"; cells.append((key,cell)); anims[anim].append(key)
cols=8; rows=(len(cells)+cols-1)//cols
sheet=Image.new("RGBA",(cols*CW,rows*CH),(0,0,0,0))
for k,(key,cell) in enumerate(cells):
    x=(k%cols)*CW; y=(k//cols)*CH; sheet.alpha_composite(cell,(x,y))
    frames[key]={"frame":{"x":x,"y":y,"w":CW,"h":CH},"rotated":False,"trimmed":False,
                 "spriteSourceSize":{"x":0,"y":0,"w":CW,"h":CH},"sourceSize":{"w":CW,"h":CH}}
sheet.save(f"{out}/sunlight_atlas.png", optimize=True)
json.dump({"frames":frames,"meta":{"image":"sunlight_atlas.png","size":{"w":sheet.width,"h":sheet.height},"scale":"1",
  "note":"Re-sliced from Sun Light Phaser Sprite Pack. Feet at bottom edge -> origin (0.5,1)."}},open(f"{out}/sunlight_atlas.json","w"),indent=1)
json.dump({"idle":{"frames":anims["idle"]+anims["idle"][2:0:-1],"frameRate":5,"repeat":-1},
 **{k:{"frames":anims[k],"frameRate":8 if k!="walk_up" else 7,"repeat":-1} for k in anims if k!="idle"}},
 open(f"{out}/sunlight_anims.json","w"),indent=1)
print(sheet.size, {k:len(v) for k,v in anims.items()})
