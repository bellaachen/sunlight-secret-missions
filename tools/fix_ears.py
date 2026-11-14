import sys
from PIL import Image
import numpy as np
path=sys.argv[1]
s=np.array(Image.open(path).convert('RGBA')).astype(np.int32)
CW,CH=112,96
def cell(i): return s[0:CH,(4+i)*CW:(5+i)*CW]   # walk_down_0..3 在第一列第 4~7 格
def best_offset(dst,src,rows=(18,50)):
    best=None
    for dy in range(-10,11):
        for dx in range(-12,13):
            sh=np.roll(np.roll(src,dy,0),dx,1)
            r0,r1=rows
            m=(dst[r0:r1,:,3]>200)&(sh[r0:r1,:,3]>200)
            if m.sum()<300: continue
            e=np.abs(dst[r0:r1,:,:3]-sh[r0:r1,:,:3]).sum(2)[m].mean()
            if best is None or e<best[0]: best=(e,dx,dy)
    return best
def patch(dst_i,src_i,side):
    dst=cell(dst_i); src=cell(src_i)
    e,dx,dy=best_offset(dst,src)
    sh=np.roll(np.roll(src,dy,0),dx,1)
    # 只補耳朵所在的上方區域，且只填 dst 透明的地方
    ys=np.where(dst[:,:,3].any(1))[0]; top=ys.min()
    xs=np.where((dst[:,:,3]>0).any(0))[0]; cx=(xs.min()+xs.max())//2
    region=np.zeros(dst.shape[:2],bool)
    yl=top-16; yh=top+22
    region[max(0,yl):yh, (cx if side=='R' else 0):(CW if side=='R' else cx)]=True
    rgb=dst[:,:,:3]; light=(rgb.min(2)>170)|(dst[:,:,3]<200)   # 切口白邊 / 半透明殘邊
    near=np.zeros_like(light)
    # 只處理缺耳那側、靠近切口的帶狀區
    near[:]=region
    fill=near&(light)&(sh[:,:,3]>120)
    dst[fill]=sh[fill]
    print(f'frame {dst_i} <- {src_i} side {side} offset ({dx},{dy}) err {e:.1f} filled {fill.sum()}px')
patch(1,0,'R')   # 第 1 格缺右耳（畫面右側）
patch(3,2,'L')   # 第 3 格缺左耳
Image.fromarray(s.astype(np.uint8)).save(path)
