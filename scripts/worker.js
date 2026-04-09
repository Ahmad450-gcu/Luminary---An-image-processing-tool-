/*Web Worker for heavy image processing filters handles: Median filter and Gaussian blur */

'use strict';

const clamp = v => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const luma  = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function insertionSort(arr, len) {
  for (let i = 1; i < len; i++) {
    const key = arr[i];
    let j = i - 1;
    while (j >= 0 && arr[j] > key) { arr[j + 1] = arr[j]; j--; }
    arr[j + 1] = key;
  }
}

/* for median  */
function applyMedian(src, width, height, radius) {
  const r   = Math.min(3, Math.max(1, Math.round(radius)));
  const ksz = (2*r+1)*(2*r+1);
  const mid = Math.floor(ksz/2);
  const out = new Uint8ClampedArray(src.length);
  const rB  = new Uint8Array(ksz);
  const gB  = new Uint8Array(ksz);
  const bB  = new Uint8Array(ksz);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let n = 0;
      for (let ky = -r; ky <= r; ky++) {
        const ny = y+ky < 0 ? 0 : y+ky >= height ? height-1 : y+ky;
        const rowOff = ny * width;
        for (let kx = -r; kx <= r; kx++) {
          const nx  = x+kx < 0 ? 0 : x+kx >= width ? width-1 : x+kx;
          const idx = (rowOff + nx) * 4;
          rB[n]=src[idx]; gB[n]=src[idx+1]; bB[n]=src[idx+2]; n++;
        }
      }
      insertionSort(rB, n); insertionSort(gB, n); insertionSort(bB, n);
      const oi = (y*width+x)*4;
      out[oi]=rB[mid]; out[oi+1]=gB[mid]; out[oi+2]=bB[mid]; out[oi+3]=src[oi+3];
    }
  }
  return out;
}

/* for gaussian blur  */
function applyGaussian(src, width, height, sigma) {
  const s      = Math.max(0.3, Math.min(4, sigma));
  const radius = Math.ceil(3 * s);
  const size   = 2 * radius + 1;
  const kernel = new Float32Array(size);
  let ksum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x*x)/(2*s*s));
    ksum += kernel[i];
  }
  for (let i = 0; i < size; i++) kernel[i] /= ksum;

  const rB = new Float32Array(width*height);
  const gB = new Float32Array(width*height);
  const bB = new Float32Array(width*height);
  for (let i = 0; i < width*height; i++) {
    rB[i]=src[i*4]; gB[i]=src[i*4+1]; bB[i]=src[i*4+2];
  }

  function blurChannel(buf) {
    const tmp = new Float32Array(width*height);
    for (let y = 0; y < height; y++) {
      const rb = y*width;
      for (let x = 0; x < width; x++) {
        let acc = 0;
        for (let k = 0; k < size; k++) {
          const nx = x+k-radius;
          acc += buf[rb + (nx<0?0:nx>=width?width-1:nx)] * kernel[k];
        }
        tmp[rb+x] = acc;
      }
    }
    const res = new Float32Array(width*height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let acc = 0;
        for (let k = 0; k < size; k++) {
          const ny = y+k-radius;
          acc += tmp[(ny<0?0:ny>=height?height-1:ny)*width+x] * kernel[k];
        }
        res[y*width+x] = acc;
      }
    }
    return res;
  }

  const rO=blurChannel(rB), gO=blurChannel(gB), bO=blurChannel(bB);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < width*height; i++) {
    out[i*4]=clamp(rO[i]); out[i*4+1]=clamp(gO[i]); out[i*4+2]=clamp(bO[i]); out[i*4+3]=src[i*4+3];
  }
  return out;
}

/*message handler */
self.addEventListener('message', e => {
  const { id, type, pixels, width, height, params } = e.data;
  let result;
  try {
    if (type === 'median') {
      result = applyMedian(new Uint8ClampedArray(pixels), width, height, params.radius);
    } else if (type === 'gaussian') {
      result = applyGaussian(new Uint8ClampedArray(pixels), width, height, params.sigma);
    } else {
      throw new Error('Unknown filter type: ' + type);
    }
    
    self.postMessage({ id, result: result.buffer }, [result.buffer]);
  } catch(err) {
    self.postMessage({ id, error: err.message });
  }
});
