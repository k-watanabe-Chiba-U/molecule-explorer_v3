/* 分子観察鏡 | Digital Molecular Imaging System
   GitHub Pages + Jekyll catalogue, up to eight XYZ structures, no arbitrary upload. */
'use strict';

const MAX_STRUCTURES = 8;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_ATOMS = 15000;
const MAX_FRAMES = 2000;
const ATOMIC_NUMBERS = ['', 'H','He','Li','Be','B','C','N','O','F','Ne','Na','Mg','Al','Si','P','S','Cl','Ar','K','Ca','Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn','Ga','Ge','As','Se','Br','Kr','Rb','Sr','Y','Zr','Nb','Mo','Tc','Ru','Rh','Pd','Ag','Cd','In','Sn','Sb','Te','I','Xe'];
const ELEM_RE = /^[A-Z][a-z]?$/;
const $ = id => document.getElementById(id);

let viewer = null;
let currentModel = null;
let currentData = null;
let currentEntryIndex = -1;
let currentStyle = 'ballstick';
let spinning = false;
let availableEntries = [];
let playTimer = null;
let frameIndex = 0;
let selectionSerial = 0;
let frameSerial = 0;

function escapeFilename(name) {
  return String(name).replace(/\.xyz$/i, '').replace(/^\d{1,3}[\s._-]+/, '').replace(/[_-]+/g, ' ').trim() || '名称未設定';
}

function updateStatus(message = '', error = false) {
  $('system-status').textContent = message;
  $('system-status').classList.toggle('error', error);
}

function showPlaceholder(title, message) {
  $('empty-heading').textContent = title;
  $('empty-detail').textContent = message;
  $('viewport-empty').hidden = false;
}

function validUrl(raw) {
  if (typeof raw !== 'string' || !/\.xyz(?:$|[?#])/i.test(raw)) return false;
  try {
    const url = new URL(raw, document.baseURI);
    return url.origin === location.origin && /\/molecules\//.test(url.pathname) && /\.xyz$/i.test(url.pathname);
  } catch { return false; }
}

function parseXYZ(text) {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
  const frames = [];
  let cursor = 0, expectedCount = null, elements = null;
  while (cursor < lines.length) {
    while (cursor < lines.length && !lines[cursor].trim()) cursor++;
    if (cursor >= lines.length) break;
    const countText = lines[cursor++].trim();
    if (!/^\d+$/.test(countText)) throw Error(`${frames.length + 1}番目の構造は原子数の行が必要です。`);
    const count = Number(countText);
    if (count < 1 || count > MAX_ATOMS) throw Error(`原子数は1〜${MAX_ATOMS.toLocaleString('ja-JP')}個までです。`);
    if (expectedCount !== null && expectedCount !== count) throw Error('連続構造の原子数が一致しません。');
    if (cursor >= lines.length) throw Error('XYZのコメント行がありません。');
    const comment = lines[cursor++];
    const frameElements = [];
    const rows = [];
    for (let i = 0; i < count; i++) {
      if (cursor >= lines.length) throw Error('XYZの座標行が不足しています。');
      const parts = lines[cursor++].trim().split(/\s+/);
      let elem = parts[0];
      if (/^\d+$/.test(elem)) elem = ATOMIC_NUMBERS[Number(elem)];
      if (!elem || !ELEM_RE.test(elem)) throw Error(`${i + 1}番目の原子の元素記号が認識できません。`);
      const xyz = parts.slice(1, 4).map(s => Number(s.replace(/[dD]/g,'e')));
      if (xyz.length !== 3 || xyz.some(v => !Number.isFinite(v) || Math.abs(v) > 100000)) throw Error(`${i + 1}番目の原子の座標が正しくありません。`);
      frameElements.push(elem);
      rows.push(`${elem} ${xyz.join(' ')}`);
    }
    if (!elements) { elements = frameElements; expectedCount = count; }
    else if (elements.some((elem, i) => elem !== frameElements[i])) throw Error('複数フレームの原子種類または原子順が異なります。');
    frames.push(`${count}\n${comment}\n${rows.join('\n')}\n`);
    if (frames.length > MAX_FRAMES) throw Error(`構造フレームは最大${MAX_FRAMES}です。`);
  }
  if (!frames.length) throw Error('XYZファイルに原子座標がありません。');
  return { frames, count: expectedCount };
}

function renderStructureButtons() {
  const list = $('structure-list');
  list.replaceChildren();
  for (let i = 0; i < MAX_STRUCTURES; i++) {
    const entry = availableEntries[i];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'structure-item';
    button.dataset.index = String(i);
    button.disabled = !entry;
    button.setAttribute('aria-pressed', String(i === currentEntryIndex));
    if (i === currentEntryIndex) button.classList.add('selected');
    const number = document.createElement('span');
    number.className = 'structure-number';
    number.textContent = String(i + 1).padStart(2, '0');
    const details = document.createElement('span');
    details.className = 'structure-content';
    const name = document.createElement('strong');
    name.textContent = entry ? escapeFilename(entry.name) : `構造 ${String(i + 1).padStart(2, '0')}`;
    const subtitle = document.createElement('small');
    subtitle.textContent = entry ? 'XYZ STRUCTURE' : '未登録';
    details.append(name, subtitle);
    const arrow = document.createElement('span');
    arrow.className = 'structure-arrow';
    arrow.textContent = '›';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(number, details, arrow);
    if (entry) button.addEventListener('click', () => loadEntry(i));
    list.append(button);
  }
  $('library-count').textContent = `${String(availableEntries.length).padStart(2, '0')} / 08`;
}

function updateNavigation() {
  const hasModel = currentEntryIndex >= 0 && !!currentData;
  $('current-position').textContent = hasModel ? `${String(currentEntryIndex + 1).padStart(2, '0')} / 08` : '— / 08';
  $('previous-structure').disabled = !hasModel || currentEntryIndex === 0;
  $('next-structure').disabled = !hasModel || currentEntryIndex >= availableEntries.length - 1;
  $('reset-view').disabled = !hasModel;
  $('spin-button').disabled = !hasModel;
  document.querySelectorAll('.structure-item').forEach(button => {
    const active = hasModel && Number(button.dataset.index) === currentEntryIndex;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function stopPlayback() {
  if (playTimer !== null) clearInterval(playTimer);
  playTimer = null;
  $('frame-play').textContent = '▶';
  $('frame-play').setAttribute('aria-label', '連続フレームを再生');
}

function setSpin(on) {
  spinning = on;
  $('spin-button').setAttribute('aria-pressed', String(on));
  if (viewer) viewer.spin(on ? 'y' : false, 0.5);
}

function applyStyle() {
  if (!viewer || !currentModel) return;
  const styles = {
    ballstick: { stick: { radius: 0.15, colorscheme: 'Jmol' }, sphere: { scale: 0.30, colorscheme: 'Jmol' } },
    stick: { stick: { radius: 0.20, colorscheme: 'Jmol' } },
    sphere: { sphere: { scale: 0.9, colorscheme: 'Jmol' } }
  };
  viewer.setStyle({}, styles[currentStyle]);
  viewer.render();
}

async function showFrame(index) {
  if (!viewer || !currentData || currentData.frames.length < 2) return;
  frameIndex = Math.max(0, Math.min(currentData.frames.length - 1, Number(index)));
  $('frame-slider').value = String(frameIndex);
  $('frame-label').textContent = `${frameIndex + 1} / ${currentData.frames.length}`;
  const serial = ++frameSerial;
  try {
    await viewer.setFrame(frameIndex);
    if (frameSerial !== serial) return;
    viewer.render();
  } catch (error) { console.warn(error); stopPlayback(); updateStatus('構造フレームを切り替えられませんでした。', true); }
}

async function loadEntry(index) {
  const entry = availableEntries[index];
  if (!entry) return;
  const serial = ++selectionSerial;
  stopPlayback();
  setSpin(false);
  showPlaceholder('構造を読み込んでいます', escapeFilename(entry.name));
  updateStatus('');
  try {
    if (!viewer) throw Error('3D表示エンジンが利用できません。インターネット接続またはブラウザをご確認ください。');
    const response = await fetch(entry.url, { cache: 'no-store' });
    if (!response.ok) throw Error(`XYZファイルを取得できません（HTTP ${response.status}）。`);
    const size = Number(response.headers.get('content-length') || '0');
    if (size > MAX_FILE_BYTES) throw Error('XYZファイルは20 MB以内にしてください。');
    const raw = await response.text();
    if (new Blob([raw]).size > MAX_FILE_BYTES) throw Error('XYZファイルは20 MB以内にしてください。');
    const parsed = parseXYZ(raw);
    if (serial !== selectionSerial) return;
    viewer.removeAllLabels();
    viewer.removeAllModels();
    currentModel = parsed.frames.length === 1
      ? viewer.addModel(parsed.frames[0], 'xyz')
      : viewer.addModelsAsFrames(parsed.frames.join(''), 'xyz');
    currentData = parsed;
    currentEntryIndex = index;
    frameIndex = 0;
    frameSerial++;
    currentStyle = 'ballstick';
    document.querySelectorAll('[data-style]').forEach(button => {
      const active = button.dataset.style === currentStyle;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    applyStyle();
    viewer.zoomTo();
    viewer.zoom(0.84);
    viewer.render();
    $('current-name').textContent = escapeFilename(entry.name);
    $('structure-meta').textContent = `${parsed.count.toLocaleString('ja-JP')} 原子`;
    $('frame-controls').hidden = parsed.frames.length < 2;
    $('frame-slider').max = String(parsed.frames.length - 1);
    $('frame-slider').value = '0';
    $('frame-label').textContent = `1 / ${parsed.frames.length}`;
    $('viewport-empty').hidden = true;
    updateNavigation();
    updateStatus(parsed.frames.length > 1 ? `${parsed.frames.length}フレームの構造を切り替えられます。` : '');
  } catch (error) {
    if (serial !== selectionSerial) return;
    console.warn('Failed to load molecular structure:', error);
    showPlaceholder('構造を表示できませんでした', error.message || 'XYZファイルを確認してください。');
    updateStatus(`${escapeFilename(entry.name)}: ${error.message}`, true);
  }
}

async function loadCatalogue() {
  try {
    const response = await fetch(`./molecule-catalog.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw Error(`分子一覧の取得に失敗しました（HTTP ${response.status}）。`);
    const entries = await response.json();
    if (!Array.isArray(entries)) throw Error('分子一覧が正しいJSON形式ではありません。');
    availableEntries = entries.filter(e => e && typeof e.name === 'string' && validUrl(e.url))
      .sort((a,b) => a.name.localeCompare(b.name, 'ja', {numeric:true})).slice(0, MAX_STRUCTURES);
    renderStructureButtons();
    if (!availableEntries.length) {
      showPlaceholder('XYZ構造がまだ登録されていません', 'GitHubの molecules フォルダに、番号を付けた8個の.xyzファイルをアップロードしてください。');
      $('sidebar-message').textContent = 'XYZファイルは未登録です。';
      updateStatus('molecules フォルダにXYZを登録すると、ここに自動表示されます。');
      return;
    }
    $('sidebar-message').textContent = availableEntries.length === MAX_STRUCTURES
      ? '8つの構造を順番に切り替えられます。'
      : `${availableEntries.length}件が登録されています。8件まで表示できます。`;
    await loadEntry(0);
  } catch (error) {
    renderStructureButtons();
    showPlaceholder('構造一覧を取得できませんでした', 'GitHub Pagesで公開設定と molecule-catalog.json を確認してください。');
    updateStatus(error.message, true);
  }
}

function initialize() {
  renderStructureButtons();
  if (window.$3Dmol && typeof window.$3Dmol.createViewer === 'function') {
    try {
      viewer = $3Dmol.createViewer($('molecule-viewer'), { backgroundColor: '#0d2335', antialias: true });
    } catch (error) {
      console.warn('3Dmol initialization failed:', error);
      updateStatus('3D表示機能を利用できません。WebGL対応ブラウザをご確認ください。', true);
    }
  } else {
    updateStatus('3D表示ライブラリを読み込めません。インターネット接続をご確認ください。', true);
  }
  document.querySelectorAll('[data-style]').forEach(button => button.addEventListener('click', () => {
    currentStyle = button.dataset.style;
    document.querySelectorAll('[data-style]').forEach(other => {
      const active = other === button;
      other.classList.toggle('selected', active);
      other.setAttribute('aria-pressed', String(active));
    });
    applyStyle();
  }));
  $('spin-button').addEventListener('click', () => setSpin(!spinning));
  $('reset-view').addEventListener('click', () => {
    if (!viewer) return;
    setSpin(false); viewer.zoomTo(); viewer.zoom(0.84); viewer.render();
  });
  $('previous-structure').addEventListener('click', () => loadEntry(currentEntryIndex - 1));
  $('next-structure').addEventListener('click', () => loadEntry(currentEntryIndex + 1));
  $('frame-slider').addEventListener('input', event => showFrame(event.target.value));
  $('frame-play').addEventListener('click', () => {
    if (playTimer !== null) { stopPlayback(); return; }
    if (!currentData || currentData.frames.length < 2) return;
    $('frame-play').textContent = 'Ⅱ';
    $('frame-play').setAttribute('aria-label', '再生を停止');
    playTimer = window.setInterval(() => showFrame((frameIndex + 1) % currentData.frames.length), 550);
  });
  if ('ResizeObserver' in window && viewer) {
    new ResizeObserver(() => { viewer.resize(); viewer.render(); }).observe($('viewport'));
  } else if (viewer) window.addEventListener('resize', () => { viewer.resize(); viewer.render(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlayback(); });
  loadCatalogue();
}

window.addEventListener('DOMContentLoaded', initialize);
