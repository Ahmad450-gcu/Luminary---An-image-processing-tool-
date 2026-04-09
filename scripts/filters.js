
'use strict';

/*utilities */
export const clamp = v => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
export const luma  = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function insertionSort(arr, len) {
  for (let i = 1; i < len; i++) {
    const key = arr[i]; let j = i - 1;
    while (j >= 0 && arr[j] > key) { arr[j+1] = arr[j]; j--; }
    arr[j+1] = key;
  }
}

/*  auto adjust*/
export function analyseImage(imgData) {
  const src = imgData.data;
  const n   = src.length / 4;

  let lumaSum = 0, lumaMin = 255, lumaMax = 0;
  const hist = new Uint32Array(256);

  for (let i = 0; i < src.length; i += 4) {
    const l = Math.round(luma(src[i], src[i+1], src[i+2]));
    lumaSum += l;
    if (l < lumaMin) lumaMin = l;
    if (l > lumaMax) lumaMax = l;
    hist[l]++;
  }

  const mean = lumaSum / n;

  let variance = 0;
  for (let i = 0; i < src.length; i += 4) {
    const diff = luma(src[i], src[i+1], src[i+2]) - mean;
    variance += diff * diff;
  }
  const stdDev = Math.sqrt(variance / n);
  const dynamicRange = lumaMax - lumaMin;

  let darkCount = 0;
  for (let k = 0; k < 64; k++) darkCount += hist[k];
  const darkFrac = darkCount / n;

  let brightCount = 0;
  for (let k = 192; k < 256; k++) brightCount += hist[k];
  const brightFrac = brightCount / n;

  if (mean < 80) {
    const gamma = Math.max(0.25, Math.min(0.65, mean / 160));
    return {
      filterId: 'gamma',
      params:   { gamma },
      label:    `Image is underexposed (avg brightness ${Math.round(mean)}). Applied brightness lift.`,
    };
  }

  if (mean > 200) {
    const gamma = Math.min(2.2, Math.max(1.4, (mean - 128) / 60));
    return {
      filterId: 'gamma',
      params:   { gamma },
      label:    `Image is overexposed (avg brightness ${Math.round(mean)}). Applied darkening correction.`,
    };
  }

  if (dynamicRange < 100) {
    return {
      filterId: 'contrast',
      params:   {},
      label:    `Low contrast detected (range ${dynamicRange}/255). Applied contrast stretch.`,
    };
  }

  if (stdDev < 45) {
    return {
      filterId: 'histeq',
      params:   {},
      label:    `Muddy tones detected (σ=${Math.round(stdDev)}). Applied auto balance.`,
    };
  }

  if (darkFrac > 0.4) {
    return {
      filterId: 'log',
      params:   { c: 3 },
      label:    `Heavy shadows detected (${Math.round(darkFrac*100)}% dark pixels). Applied shadow reveal.`,
    };
  }

  return {
    filterId: null,
    params:   {},
    label:    `Image looks well-exposed (avg ${Math.round(mean)}, σ=${Math.round(stdDev)}). No correction needed.`,
  };
}

/*image Negative */
export function applyNegative(imgData, _p) {
  const src = imgData.data, out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i]=255-src[i]; out[i+1]=255-src[i+1]; out[i+2]=255-src[i+2]; out[i+3]=src[i+3];
  }
  return out;
}

/* Log */
export function applyLog(imgData, { c = 2 }) {
  const src = imgData.data, out = new Uint8ClampedArray(src.length);
  const g = 1 / Math.max(0.1, parseFloat(c));
  for (let i = 0; i < src.length; i += 4) {
    out[i]  =clamp(Math.pow(src[i]  /255,g)*255);
    out[i+1]=clamp(Math.pow(src[i+1]/255,g)*255);
    out[i+2]=clamp(Math.pow(src[i+2]/255,g)*255);
    out[i+3]=src[i+3];
  }
  return out;
}

/* Power law gamma  */
export function applyGamma(imgData, { gamma = 0.5 }) {
  const src = imgData.data, out = new Uint8ClampedArray(src.length);
  const g = Math.max(0.01, parseFloat(gamma));
  for (let i = 0; i < src.length; i += 4) {
    out[i]  =clamp(Math.pow(src[i]  /255,g)*255);
    out[i+1]=clamp(Math.pow(src[i+1]/255,g)*255);
    out[i+2]=clamp(Math.pow(src[i+2]/255,g)*255);
    out[i+3]=src[i+3];
  }
  return out;
}

/* Contrast Stretching */
export function applyContrastStretch(imgData, _p) {
  const src = imgData.data, out = new Uint8ClampedArray(src.length);
  let rMin=255,gMin=255,bMin=255,rMax=0,gMax=0,bMax=0;
  for (let i=0;i<src.length;i+=4) {
    if(src[i]  <rMin)rMin=src[i];   if(src[i]  >rMax)rMax=src[i];
    if(src[i+1]<gMin)gMin=src[i+1]; if(src[i+1]>gMax)gMax=src[i+1];
    if(src[i+2]<bMin)bMin=src[i+2]; if(src[i+2]>bMax)bMax=src[i+2];
  }
  const rR=rMax-rMin||1, gR=gMax-gMin||1, bR=bMax-bMin||1;
  for (let i=0;i<src.length;i+=4) {
    out[i]  =clamp(((src[i]  -rMin)/rR)*255);
    out[i+1]=clamp(((src[i+1]-gMin)/gR)*255);
    out[i+2]=clamp(((src[i+2]-bMin)/bR)*255);
    out[i+3]=src[i+3];
  }
  return out;
}

/* Thresholding */
export function applyThreshold(imgData, { T=128 }) {
  const src = imgData.data, out = new Uint8ClampedArray(src.length);
  const thresh = parseFloat(T);
  for (let i=0;i<src.length;i+=4) {
    const v = luma(src[i],src[i+1],src[i+2])>thresh?255:0;
    out[i]=out[i+1]=out[i+2]=v; out[i+3]=src[i+3];
  }
  return out;
}

/*  Intensity Level Slicing */
export function applySlice(imgData, { lo=100, hi=200, mode='with' }) {
  const src = imgData.data, out = new Uint8ClampedArray(src.length);
  const loN=Math.round(lo), hiN=Math.round(hi), keep=mode==='with';
  for (let i=0;i<src.length;i+=4) {
    const l=luma(src[i],src[i+1],src[i+2]);
    if(l>=loN&&l<=hiN){out[i]=out[i+1]=out[i+2]=255;}
    else if(keep){out[i]=src[i];out[i+1]=src[i+1];out[i+2]=src[i+2];}
    else{out[i]=out[i+1]=out[i+2]=0;}
    out[i+3]=src[i+3];
  }
  return out;
}

/* Histogram Equalization  */
export function applyHistEq(imgData, _p) {
  const src=imgData.data, n=src.length/4, L=256;
  const hist=new Float64Array(L);
  for(let i=0;i<src.length;i+=4) hist[Math.round(luma(src[i],src[i+1],src[i+2]))]++;
  for(let k=0;k<L;k++) hist[k]/=n;
  const lut=new Uint8Array(L); let cdf=0;
  for(let k=0;k<L;k++){cdf+=hist[k];lut[k]=clamp(Math.round((L-1)*cdf));}
  const out=new Uint8ClampedArray(src.length);
  for(let i=0;i<src.length;i+=4){
    const Y=luma(src[i],src[i+1],src[i+2]), Yn=lut[Math.round(Y)];
    const ratio=Y>0?Yn/Y:0;
    out[i]=clamp(src[i]*ratio); out[i+1]=clamp(src[i+1]*ratio); out[i+2]=clamp(src[i+2]*ratio);
    out[i+3]=src[i+3];
  }
  return out;
}

/*Median Filter */
export function applyMedian(imgData, { radius=1 }, width, height) {
  const src=imgData.data, out=new Uint8ClampedArray(src.length);
  const r=Math.min(3,Math.max(1,Math.round(radius))), ksz=(2*r+1)*(2*r+1), mid=Math.floor(ksz/2);
  const rB=new Uint8Array(ksz), gB=new Uint8Array(ksz), bB=new Uint8Array(ksz);
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      let n=0;
      for(let ky=-r;ky<=r;ky++){
        const ny=y+ky<0?0:y+ky>=height?height-1:y+ky, rowOff=ny*width;
        for(let kx=-r;kx<=r;kx++){
          const nx=x+kx<0?0:x+kx>=width?width-1:x+kx, idx=(rowOff+nx)*4;
          rB[n]=src[idx]; gB[n]=src[idx+1]; bB[n]=src[idx+2]; n++;
        }
      }
      insertionSort(rB,n); insertionSort(gB,n); insertionSort(bB,n);
      const oi=(y*width+x)*4;
      out[oi]=rB[mid]; out[oi+1]=gB[mid]; out[oi+2]=bB[mid]; out[oi+3]=src[oi+3];
    }
  }
  return out;
}

/*  Gaussian Blur  */
export function applyGaussian(imgData, { sigma=2 }, width, height) {
  const src=imgData.data;
  const s=Math.max(0.3,Math.min(4,parseFloat(sigma))), radius=Math.ceil(3*s), size=2*radius+1;
  const kernel=new Float32Array(size); let ksum=0;
  for(let i=0;i<size;i++){const x=i-radius; kernel[i]=Math.exp(-(x*x)/(2*s*s)); ksum+=kernel[i];}
  for(let i=0;i<size;i++) kernel[i]/=ksum;
  const rB=new Float32Array(width*height), gB=new Float32Array(width*height), bB=new Float32Array(width*height);
  for(let i=0;i<width*height;i++){rB[i]=src[i*4]; gB[i]=src[i*4+1]; bB[i]=src[i*4+2];}
  function blur(buf){
    const tmp=new Float32Array(width*height);
    for(let y=0;y<height;y++){const rb=y*width; for(let x=0;x<width;x++){let a=0; for(let k=0;k<size;k++){const nx=x+k-radius; a+=buf[rb+(nx<0?0:nx>=width?width-1:nx)]*kernel[k];} tmp[rb+x]=a;}}
    const res=new Float32Array(width*height);
    for(let y=0;y<height;y++){for(let x=0;x<width;x++){let a=0; for(let k=0;k<size;k++){const ny=y+k-radius; a+=tmp[(ny<0?0:ny>=height?height-1:ny)*width+x]*kernel[k];} res[y*width+x]=a;}}
    return res;
  }
  const rO=blur(rB),gO=blur(gB),bO=blur(bB);
  const out=new Uint8ClampedArray(src.length);
  for(let i=0;i<width*height;i++){out[i*4]=clamp(rO[i]); out[i*4+1]=clamp(gO[i]); out[i*4+2]=clamp(bO[i]); out[i*4+3]=src[i*4+3];}
  return out;
}

/* Sobel Edge Detection */
export function applySobel(imgData, { threshold=30 }, width, height) {
  const src=imgData.data, gray=new Float32Array(width*height);
  for(let i=0;i<width*height;i++) gray[i]=luma(src[i*4],src[i*4+1],src[i*4+2]);
  const out=new Uint8ClampedArray(src.length), th=parseFloat(threshold);
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const oi=(y*width+x)*4;
      if(x===0||x===width-1||y===0||y===height-1){out[oi+3]=255;continue;}
      const tl=gray[(y-1)*width+(x-1)],tc=gray[(y-1)*width+x],tr=gray[(y-1)*width+(x+1)];
      const ml=gray[y*width+(x-1)],mr=gray[y*width+(x+1)];
      const bl=gray[(y+1)*width+(x-1)],bc=gray[(y+1)*width+x],br=gray[(y+1)*width+(x+1)];
      const px=-tl+tr-2*ml+2*mr-bl+br, py=-tl-2*tc-tr+bl+2*bc+br;
      const v=Math.sqrt(px*px+py*py)>th?clamp(Math.sqrt(px*px+py*py)):0;
      out[oi]=out[oi+1]=out[oi+2]=v; out[oi+3]=255;
    }
  }
  return out;
}

/*  Grayscale */

export function applyGrayscale(imgData, { amount=100 }) {
  const src=imgData.data, out=new Uint8ClampedArray(src.length);
  const t=Math.max(0,Math.min(100,parseFloat(amount)))/100;
  for(let i=0;i<src.length;i+=4){
    const l=luma(src[i],src[i+1],src[i+2]);
    out[i]  =clamp(src[i]  +(l-src[i]  )*t);
    out[i+1]=clamp(src[i+1]+(l-src[i+1])*t);
    out[i+2]=clamp(src[i+2]+(l-src[i+2])*t);
    out[i+3]=src[i+3];
  }
  return out;
}

/* histograma   */
export function computeHistogram(data) {
  const hist=new Uint32Array(256);
  for(let i=0;i<data.length;i+=4) hist[Math.round(luma(data[i],data[i+1],data[i+2]))]++;
  return hist;
}
export function drawHistogram(canvas, hist, color='#1a1916') {
  const W=canvas.clientWidth||200, H=canvas.clientHeight||60;
  canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,W,H);
  let max=0; for(let i=0;i<256;i++) if(hist[i]>max) max=hist[i];
  if(!max) return;
  const bw=W/256; ctx.fillStyle=color;
  for(let i=0;i<256;i++){const bh=(hist[i]/max)*H; ctx.fillRect(i*bw,H-bh,Math.max(1,bw-0.3),bh);}
}

/*  Filter Icons */
export const FILTER_ICONS = {
  negative:  `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M12 3v18M3 12h18"/></svg>`,
  log:       `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1M4.22 4.22l.707.707m13.86 13.86.707.707M3 12h1m16 0h1m-3.22-7.78-.707.707M6.927 17.073l-.707.707"/><circle cx="12" cy="12" r="4"/></svg>`,
  gamma:     `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3a9 9 0 100 18A9 9 0 0012 3z"/><path stroke-linecap="round" d="M12 7v5l3 3"/></svg>`,
  contrast:  `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 010 18V3z" fill="currentColor" stroke="none"/></svg>`,
  threshold: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12h18M3 6h18M3 18h18"/></svg>`,
  slice:     `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8h16M4 16h16"/><rect x="7" y="9" width="10" height="6" rx="1"/></svg>`,
  histeq:    `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 18v-6h3v6H3zm5-9h3v9H8V9zm5-4h3v13h-3V5zm5 7h3v6h-3v-6z"/></svg>`,
  median:    `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6l9 12L21 6"/></svg>`,
  gaussian:  `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" d="M3 12c2-6 5-6 6-2s2 8 6 2"/></svg>`,
  sobel:     `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>`,
  grayscale: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 010 18V3z" fill="currentColor" stroke="none" opacity=".35"/></svg>`,
};

/* Filter Registry  */
export const FILTERS = [
  { id:'negative',  name:'Reverse Colors',             desc:'Flip light and dark — like a film negative',       params:[],                                                                                                                                fn:applyNegative },
  { id:'log',       name:'Reveal Dark Details',         desc:'Lift shadows while keeping highlights intact',      params:[{id:'c',        label:'Reveal strength',                min:0.5,max:8,  step:0.1, default:2,   fmt:v=>v.toFixed(1)}],           fn:applyLog      },
  { id:'gamma',     name:'Brightness Control',          desc:'Slide left to brighten · right to darken',         params:[{id:'gamma',    label:'Brightness (< 1 = brighter)',    min:0.1,max:3,  step:0.05,default:0.5, fmt:v=>v.toFixed(2)}],           fn:applyGamma    },
  { id:'contrast',  name:'Boost Contrast',              desc:'Pull darks and lights apart automatically',        params:[],                                                                                                                                fn:applyContrastStretch },
  { id:'threshold', name:'Bold Black & White',          desc:'Convert to pure two-tone using a cutoff',         params:[{id:'T',        label:'Brightness cutoff',              min:0,  max:255, step:1,   default:128, fmt:v=>Math.round(v)}],           fn:applyThreshold },
  {
    id:'slice', name:'Highlight a Brightness Range', desc:'Isolate and emphasise a specific tonal band',
    params:[
      {id:'lo', label:'Range: low end',  min:0, max:255, step:1, default:100, fmt:v=>Math.round(v)},
      {id:'hi', label:'Range: high end', min:0, max:255, step:1, default:200, fmt:v=>Math.round(v)},
    ],
    toggles:[{id:'mode',label:'Background',options:[{v:'with',l:'Keep'},{v:'without',l:'Remove'}],default:'with'}],
    fn:applySlice,
  },
  { id:'histeq',    name:'Auto Balance',               desc:'Redistribute brightness for even contrast',        params:[],showHistogram:true,                                                                                                             fn:applyHistEq   },
  { id:'median',    name:'Remove Noise & Specks',       desc:'Clean grain while preserving edges',              params:[{id:'radius',   label:'Cleanup amount',                 min:1,  max:3,   step:1,   default:1,   fmt:v=>Math.round(v)}],           fn:applyMedian   },
  { id:'gaussian',  name:'Soften & Blur',               desc:'Gently smooth texture and reduce detail',         params:[{id:'sigma',    label:'Blur amount',                    min:0.5,max:4,   step:0.5, default:2,   fmt:v=>v.toFixed(1)}],            fn:applyGaussian },
  { id:'sobel',     name:'Find Edges & Outlines',       desc:'Detect and draw object boundaries',               params:[{id:'threshold',label:'Edge sensitivity',               min:0,  max:200, step:5,   default:30,  fmt:v=>Math.round(v)}],           fn:applySobel    },
  { id:'grayscale', name:'Grayscale Blend',             desc:'Fade colour into grayscale — slide to control',   params:[{id:'amount',   label:'Grayscale amount',               min:0,  max:100, step:1,   default:100, fmt:v=>Math.round(v)+'%'}],       fn:applyGrayscale},
];
