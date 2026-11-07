import numpy as np
x=np.fromfile('bgm.raw',dtype=np.float32); sr=22050
hop=256; n=2048
frames=np.lib.stride_tricks.sliding_window_view(x,n)[::hop]
spec=np.abs(np.fft.rfft(frames*np.hanning(n),axis=1))
low=spec[:, :int(150*n/sr)].sum(1)  # kick band
flux=np.maximum(0,np.diff(np.log1p(spec),axis=0)).sum(1)
fps=sr/hop
best=None
for bpm in np.arange(120,126,0.02):
    p=60/bpm*fps
    # comb score over phases
    for ph in np.linspace(0,p,24,endpoint=False):
        idx=(ph+np.arange(0,len(flux)/p-1)*p).astype(int)
        s=flux[idx].mean()
        if best is None or s>best[0]: best=(s,bpm,ph/fps)
print('bpm %.2f phase %.3f s'%(best[1],best[2]))
bpm,ph=best[1],best[2]; beat=60/bpm; bar=4*beat
# energy per bar
c=np.concatenate([[0],np.cumsum(x.astype(np.float64)**2)]); rmsat=lambda a,b: np.sqrt((c[int(b*sr)]-c[int(a*sr)])/max(1,int(b*sr)-int(a*sr)))
t=ph; i=0
while t<len(x)/sr:
    print('bar %3d t=%7.3f rms=%.3f'%(i,t,rmsat(t,min(t+bar,len(x)/sr-0.01))))
    t+=bar; i+=1
