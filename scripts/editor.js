
'use strict';
import { FILTERS, FILTER_ICONS, analyseImage, computeHistogram, drawHistogram } from './filters.js';

/* State */
const state = {
  loaded:       false,
  width:        0,
  height:       0,
  origData:     null,
  resultData:   null,
  filterId:     null,
  params:       {},
  toggles:      {},
  viewMode:     'result',
  splitX:       0.5,
  isDragging:   false,
  editorInited: false,
};

FILTERS.forEach(f => {
  state.params[f.id]  = {};
  state.toggles[f.id] = {};
  (f.params  || []).forEach(p => { state.params[f.id][p.id]  = p.default; });
  (f.toggles || []).forEach(t => { state.toggles[f.id][t.id] = t.default; });
});

/* worker pool */
let worker        = null;
let workerPending = null;
let workerJobId   = 0;
let pendingParams = null;

const WORKER_FILTERS = new Set(['median', 'gaussian']);

function getWorker() {
  if (!worker) {
    worker = new Worker('scripts/worker.js');
    worker.addEventListener('message', e => {
      const { id, result, error } = e.data;
      if (!workerPending) return;
      const { resolve, reject, jobId } = workerPending;
      workerPending = null;
      if (id !== jobId) {
        if (pendingParams) { const pp=pendingParams; pendingParams=null; _dispatchWorker(pp); }
        return;
      }
      if (error) { reject(new Error(error)); return; }
      resolve(new Uint8ClampedArray(result));
      if (pendingParams) { const pp=pendingParams; pendingParams=null; _dispatchWorker(pp); }
    });
    worker.addEventListener('error', e => {
      if (workerPending) { workerPending.reject(new Error(e.message)); workerPending = null; }
    });
  }
  return worker;
}

function runInWorker(filterId, params) {
  return new Promise((resolve, reject) => {
    if (workerPending) { pendingParams = { filterId, params, resolve, reject }; return; }
    _dispatchWorker({ filterId, params, resolve, reject });
  });
}

function _dispatchWorker({ filterId, params, resolve, reject }) {
  const jobId = ++workerJobId;
  workerPending = { resolve, reject, jobId };
  const copy = state.origData.data.buffer.slice(0);
  getWorker().postMessage(
    { id:jobId, type:filterId, pixels:copy, width:state.width, height:state.height, params },
    [copy]
  );
}

/* Editor Initialization */
let dom = {};

export function initEditor() {
  if (state.editorInited) return;
  state.editorInited = true;

  dom = {
    uploadPlaceholder: document.getElementById('uploadPlaceholder'),
    changeImgBtn:      document.getElementById('changeImgBtn'),
    fileInput:         document.getElementById('fileInput'),
    imgWrapper:        document.getElementById('imgWrapper'),
    mainCanvas:        document.getElementById('mainCanvas'),
    splitOverlay:      document.getElementById('splitOverlay'),
    splitHandle:       document.getElementById('splitHandle'),
    processOverlay:    document.getElementById('processOverlay'),
    filterList:        document.getElementById('filterList'),
    controlsPanel:     document.getElementById('controlsPanel'),
    histWrap:          document.getElementById('histWrap'),
    histBefore:        document.getElementById('histBefore'),
    histAfter:         document.getElementById('histAfter'),
    viewTabs:          document.querySelectorAll('.view-tab'),
    procTime:          document.getElementById('procTime'),
    dimChip:           document.getElementById('dimChip'),
    sizeChip:          document.getElementById('sizeChip'),
    zoomChip:          document.getElementById('zoomChip'),
    btnReset:          document.getElementById('btnReset'),
    btnExport:         document.getElementById('btnExport'),
    btnAutoAdj:        document.getElementById('btnAutoAdj'),
    btnResetPanel:     document.getElementById('btnResetPanel'),
    btnExportPanel:    document.getElementById('btnExportPanel'),
    // bottom toolbar buttons
    toolbarExport:     document.getElementById('toolbarExport'),
  };

  buildFilterList();
  buildControls(null);
  bindUpload();
  bindChangeImage();
  bindViewTabs();
  bindSplitDrag();
  bindButtons();
  getWorker(); // pre-warm
  updateViewTabsState();
}

/* filter list */
function buildFilterList() {
  if (!dom.filterList) return;
  dom.filterList.innerHTML = '';
  FILTERS.forEach(f => {
    const el = document.createElement('div');
    el.className = 'filter-item' + (f.id === state.filterId ? ' active' : '');
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', f.name);
    const iconSvg = FILTER_ICONS[f.id] || '';
    el.innerHTML = `
      <span class="filter-icon-wrap">${iconSvg}</span>
      <div class="filter-item-text">
        <div class="filter-item-name">${f.name}</div>
        <div class="filter-item-desc">${f.desc}</div>
      </div>`;
    el.addEventListener('click', () => selectFilter(f.id));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectFilter(f.id); }
    });
    dom.filterList.appendChild(el);
  });
}

function selectFilter(id) {
  state.filterId = id;
  dom.filterList.querySelectorAll('.filter-item').forEach((el, i) => {
    el.classList.toggle('active', FILTERS[i].id === id);
  });
  buildControls(id);
  updateViewTabsState();
  if (state.loaded) scheduleProcess();
}

/* Controls */
function buildControls(filterId) {
  if (!dom.controlsPanel) return;
  if (!filterId) {
    dom.controlsPanel.innerHTML =
      `<p class="no-params-msg">Select an effect from the list to begin.</p>`;
    return;
  }
  const f = FILTERS.find(x => x.id === filterId);
  dom.controlsPanel.innerHTML = '';

  if (!(f.params?.length) && !(f.toggles?.length)) {
    dom.controlsPanel.innerHTML =
      `<p class="no-params-msg">No adjustments needed — effect applied automatically.</p>`;
    return;
  }

  (f.params || []).forEach(p => {
    const val = state.params[filterId][p.id];
    const row = document.createElement('div');
    row.className = 'control-row';
    row.innerHTML = `
      <div class="control-label-row">
        <span class="control-label">${p.label}</span>
        <span class="control-value" id="cv-${filterId}-${p.id}">${p.fmt(val)}</span>
      </div>
      <input type="range" min="${p.min}" max="${p.max}" step="${p.step}"
             value="${val}" aria-label="${p.label}">`;
    const input = row.querySelector('input');
    const valEl = row.querySelector('.control-value');
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      state.params[filterId][p.id] = v;
      valEl.textContent = p.fmt(v);
      scheduleProcess();
    });
    dom.controlsPanel.appendChild(row);
  });

  (f.toggles || []).forEach(t => {
    const cur = state.toggles[filterId][t.id];
    const row = document.createElement('div');
    row.className = 'control-row';
    row.innerHTML = `
      <div class="control-label-row"><span class="control-label">${t.label}</span></div>
      <div class="toggle-row"></div>`;
    const trow = row.querySelector('.toggle-row');
    t.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'toggle-opt' + (opt.v === cur ? ' active' : '');
      btn.textContent = opt.l;
      btn.addEventListener('click', () => {
        state.toggles[filterId][t.id] = opt.v;
        trow.querySelectorAll('.toggle-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        scheduleProcess();
      });
      trow.appendChild(btn);
    });
    dom.controlsPanel.appendChild(row);
  });
}

/* upload */
function bindUpload() {
  if (!dom.fileInput) return;
  dom.fileInput.addEventListener('change', e => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
    e.target.value = '';
  });
  const zone = dom.uploadPlaceholder;
  if (!zone) return;
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });
}

function bindChangeImage() {
  if (!dom.changeImgBtn) return;
  dom.changeImgBtn.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type   = 'file';
    inp.accept = 'image/jpeg,image/png,image/webp,image/gif,image/bmp';
    inp.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
    inp.click();
  });
}

function loadFile(file) {
  if (!file.type.startsWith('image/')) { showToast('Please upload an image file.'); return; }
  if (file.size > 30 * 1024 * 1024)    { showToast('File too large — max 30 MB.'); return; }

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      state.width  = img.naturalWidth;
      state.height = img.naturalHeight;
      const tmp = document.createElement('canvas');
      tmp.width = state.width; tmp.height = state.height;
      const ctx = tmp.getContext('2d');
      ctx.drawImage(img, 0, 0);
      state.origData   = ctx.getImageData(0, 0, state.width, state.height);
      state.resultData = null;
      state.loaded     = true;
      origOffscreen    = null;

      if (dom.dimChip)  dom.dimChip.textContent  = `${state.width} × ${state.height}`;
      if (dom.sizeChip) dom.sizeChip.textContent  = fmtBytes(file.size);
      if (dom.zoomChip) dom.zoomChip.textContent  = 'Fit';

      if (dom.uploadPlaceholder) dom.uploadPlaceholder.classList.add('hidden');
      if (dom.imgWrapper)        dom.imgWrapper.style.display = 'inline-flex';
      if (dom.changeImgBtn)      dom.changeImgBtn.style.display = 'flex';

      state.splitX = 0.5;

      // Show original image 
      renderOriginalOnly();
      updateViewTabsState();

    };
    img.onerror = () => showToast('Could not load image — file may be corrupted.');
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* processing */
let debounceTimer  = null;
let processingLock = false;

function scheduleProcess() {
  if (!state.filterId) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(processImage, WORKER_FILTERS.has(state.filterId) ? 180 : 80);
}

async function processImage() {
  if (!state.loaded || !state.origData) return;
  if (!state.filterId) return;
  if (processingLock && !WORKER_FILTERS.has(state.filterId)) return;
  processingLock = true;
  showProcessing(true);

  const t0     = performance.now();
  const filter = FILTERS.find(f => f.id === state.filterId);
  const params = { ...state.params[filter.id], ...state.toggles[filter.id] };

  let resultPixels;
  try {
    if (WORKER_FILTERS.has(filter.id)) {
      resultPixels = await runInWorker(filter.id, params);
    } else {
      await new Promise(r => requestAnimationFrame(r));
      resultPixels = filter.fn(state.origData, params, state.width, state.height);
    }
  } catch (err) {
    processingLock = false;
    showProcessing(false);
    if (pendingParams) return;
    showToast('Processing error: ' + err.message);
    return;
  }

  state.resultData = new ImageData(resultPixels, state.width, state.height);
  if (dom.procTime) dom.procTime.textContent = `${(performance.now()-t0).toFixed(0)} ms`;

  renderCanvas();
  updateHistogram(filter);
  processingLock = false;
  showProcessing(false);
}

/* Canvas render */
let origOffscreen = null;

function ensureOrigOffscreen() {
  if (!state.origData) return null;
  if (!origOffscreen || origOffscreen.width !== state.width || origOffscreen.height !== state.height) {
    origOffscreen = document.createElement('canvas');
    origOffscreen.width  = state.width;
    origOffscreen.height = state.height;
    origOffscreen.getContext('2d').putImageData(state.origData, 0, 0);
  }
  return origOffscreen;
}

function renderCanvas() {
  if (!state.origData) return;
  const canvas = dom.mainCanvas;
  if (!canvas) return;
  if (canvas.width !== state.width)  canvas.width  = state.width;
  if (canvas.height !== state.height) canvas.height = state.height;
  const ctx = canvas.getContext('2d');

  if (state.viewMode === 'original') {
    ctx.putImageData(state.origData, 0, 0);
    hideSplitOverlay();
  } else if (state.viewMode === 'result') {
    ctx.putImageData(state.resultData || state.origData, 0, 0);
    hideSplitOverlay();
  } else {
    ctx.putImageData(state.resultData || state.origData, 0, 0);
    const splitPx = Math.round(state.splitX * state.width);
    if (splitPx > 0) {
      const orig = ensureOrigOffscreen();
      if (orig) ctx.drawImage(orig, 0, 0, splitPx, state.height, 0, 0, splitPx, state.height);
    }
    showSplitOverlay();
  }
}

/* render only the original image  when no filter applied*/
function renderOriginalOnly() {
  if (!state.origData) return;
  const canvas = dom.mainCanvas;
  if (!canvas) return;
  if (canvas.width  !== state.width)  canvas.width  = state.width;
  if (canvas.height !== state.height) canvas.height = state.height;
  canvas.getContext('2d').putImageData(state.origData, 0, 0);
  hideSplitOverlay();
  if (dom.histWrap) dom.histWrap.classList.add('hidden');
  if (dom.procTime) dom.procTime.textContent = '';
}

/* gray out Result and compare tabs when no filter is selected */
function updateViewTabsState() {
  const hasFilter = !!state.filterId;
  dom.viewTabs?.forEach(tab => {
    const view = tab.dataset.view;
    if (view === 'result' || view === 'split') {
      tab.disabled = !hasFilter;
      tab.style.opacity = hasFilter ? '' : '0.35';
      tab.style.pointerEvents = hasFilter ? '' : 'none';
      tab.title = hasFilter ? '' : 'Apply an effect first';

      if (!hasFilter && tab.classList.contains('active')) {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
        const origTab = Array.from(dom.viewTabs).find(t => t.dataset.view === 'original');
        if (origTab) {
          origTab.classList.add('active');
          origTab.setAttribute('aria-selected', 'true');
        }
        state.viewMode = 'original';
      }
    } else {
      tab.disabled = false;
      tab.style.opacity = '';
      tab.style.pointerEvents = '';
      tab.title = '';
    }
  });
}

function showSplitOverlay() {
  if (!dom.splitOverlay) return;
  dom.splitOverlay.classList.add('visible');
  if (dom.splitHandle) dom.splitHandle.style.left = (state.splitX * 100).toFixed(1) + '%';
}
function hideSplitOverlay() { dom.splitOverlay?.classList.remove('visible'); }

/* split drag */
function bindSplitDrag() {
  if (!dom.splitHandle) return;
  function onMove(clientX) {
    if (!state.isDragging || !dom.imgWrapper) return;
    const rect = dom.imgWrapper.getBoundingClientRect();
    state.splitX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    if (dom.splitHandle) dom.splitHandle.style.left = (state.splitX * 100).toFixed(1) + '%';
    renderCanvas();
  }
  dom.splitHandle.addEventListener('mousedown',  e => { state.isDragging = true;  e.preventDefault(); });
  dom.splitHandle.addEventListener('touchstart', e => { state.isDragging = true;  e.preventDefault(); }, { passive: false });
  document.addEventListener('mouseup',   ()  => { state.isDragging = false; });
  document.addEventListener('touchend',  ()  => { state.isDragging = false; });
  document.addEventListener('mousemove', e   => onMove(e.clientX));
  document.addEventListener('touchmove', e   => { if (e.touches[0]) onMove(e.touches[0].clientX); }, { passive: true });
}

/* vew tabs */
function bindViewTabs() {
  dom.viewTabs?.forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.disabled) return;
      dom.viewTabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      tab.classList.add('active'); tab.setAttribute('aria-selected','true');
      state.viewMode = tab.dataset.view;
      renderCanvas();
    });
  });
}

/* buttons*/
function bindButtons() {
  dom.btnReset?.addEventListener('click',      resetAll);
  dom.btnExport?.addEventListener('click',     downloadImage);
  dom.btnResetPanel?.addEventListener('click', resetAll);
  dom.btnExportPanel?.addEventListener('click',downloadImage);
  dom.toolbarExport?.addEventListener('click', downloadImage);
  // Smart auto-adjust
  dom.btnAutoAdj?.addEventListener('click',    smartAutoAdjust);
}

function resetAll() {
  origOffscreen = null;
  FILTERS.forEach(f => {
    state.params[f.id]  = {};
    state.toggles[f.id] = {};
    (f.params  || []).forEach(p => { state.params[f.id][p.id]  = p.default; });
    (f.toggles || []).forEach(t => { state.toggles[f.id][t.id] = t.default; });
  });
  // Deselect all filters
  state.filterId    = null;
  state.resultData  = null;
  dom.filterList?.querySelectorAll('.filter-item').forEach(el => el.classList.remove('active'));
  buildControls(null);
  // Restore original image view
  if (state.loaded) renderOriginalOnly();
  updateViewTabsState();
  showToast('Reset — select an effect to begin.');
}
// smart auto-adjust
function smartAutoAdjust() {
  if (!state.loaded || !state.origData) {
    showToast('Upload an image first.');
    return;
  }
  const result = analyseImage(state.origData);

  if (!result.filterId) {
    showToast('✦ ' + result.label);
    return;
  }

  // Apply detected params to the chosen filter
  if (result.params) {
    Object.entries(result.params).forEach(([k, v]) => {
      state.params[result.filterId][k] = v;
    });
  }

  // Switch to the chosen filter and rebuild controls
  selectFilter(result.filterId);
  showToast('✦ ' + result.label, 5000);
}

function downloadImage() {
  if (!state.resultData) { showToast('Apply an effect first, then export.'); return; }
  const tmp = document.createElement('canvas');
  tmp.width  = state.width;
  tmp.height = state.height;
  tmp.getContext('2d').putImageData(state.resultData, 0, 0);
  const a = document.createElement('a');
  a.download = `luminary-${state.filterId}-${Date.now()}.png`;
  a.href = tmp.toDataURL('image/png');
  a.click();
  showToast('Image exported successfully.');
}

/* histogram */
function updateHistogram(filter) {
  if (!dom.histWrap) return;
  if (filter.showHistogram && state.origData && state.resultData) {
    dom.histWrap.classList.remove('hidden');
    const dark  = document.documentElement.getAttribute('data-theme') === 'dark';
    const color = dark ? '#f0efe9' : '#1a1916';
    drawHistogram(dom.histBefore, computeHistogram(state.origData.data),   color);
    drawHistogram(dom.histAfter,  computeHistogram(state.resultData.data), color);
  } else {
    dom.histWrap.classList.add('hidden');
  }
}

/* processing overlay */
function showProcessing(on) { dom.processOverlay?.classList.toggle('visible', on); }

/* utilities */
function fmtBytes(b) {
  if (b < 1024)    return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}

let _toastTimer;
export function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}
