(() => {
  'use strict';

  const STORAGE_INVENTORY_KEY = 'plamo-inventory-v1';
  const STORAGE_SETTINGS_KEY = 'plamo-settings-v1';
  const STORAGE_GITHUB_SHA_KEY = 'plamo-github-sha-v1';

  const KIND_LABELS = {
    kit: 'ガンプラ',
    paint: '塗料',
    decal: 'デカール',
    other: 'その他'
  };

  const KINDS = ['kit', 'paint', 'decal', 'other'];

  const BUILD_STATUS_LABELS = {
    reserved: '予約中',
    unbuilt: '未組立',
    building: '製作中',
    built: '完成'
  };

  // 販路（ガンプラのみ）。札の右上の印は TAG_MARKS
  const CHANNEL_LABELS = {
    general: '一般販売',
    pbandai: 'プレバン',
    limited: '限定品'
  };
  const TAG_MARKS = { pbandai: 'P', limited: '限' };

  const STATUS_LABELS = {
    ok: '在庫あり',
    low: '残りわずか',
    out: '不足',
    none: '在庫なし'
  };

  const DEFAULT_SETTINGS = {
    githubOwner: '',
    githubRepo: '',
    githubBranch: 'main',
    githubPath: 'inventory.json',
    githubToken: '',
    proxyUrl: '',
    cameraDeviceId: ''
  };

  // アプリケーション状態
  let inventory = loadInventory();
  let settings = loadSettings();
  let githubSha = localStorage.getItem(STORAGE_GITHUB_SHA_KEY) || '';
  let filterKind = 'all';
  let filterStatus = 'all';
  let filterBuild = 'all';
  let filterChannel = 'all';
  let localMatchId = '';
  let formReturnTab = '';
  let searchQuery = '';

  // スキャナ制御用状態
  let zxingReader = null;
  let detectorStream = null;
  let detectorRafId = null;
  let scanWatchdogId = null;
  let decodeWatchdogId = null;
  let scanRestartUsed = false;
  let decodeAttempts = 0;
  let lastDecodeError = '';
  let scanStatusIntervalId = null;
  let currentCameraLabel = '';
  let parallelDetectorOn = false;
  let backCameras = [];
  let currentCameraId = '';
  let isScanning = false;

  // DOM 要素参照
  const el = {
    syncBadge: document.getElementById('sync-status-badge'),
    toastContainer: document.getElementById('toast-container'),
    navBtns: document.querySelectorAll('.nav-btn'),
    tabViews: document.querySelectorAll('.tab-view'),
    navShoppingBadge: document.getElementById('nav-shopping-badge'),

    // 在庫一覧
    searchInput: document.getElementById('search-input'),
    kindChips: document.querySelectorAll('[data-filter-kind]'),
    statusChips: document.querySelectorAll('[data-filter-status]'),
    buildChips: document.querySelectorAll('[data-filter-build]'),
    buildChipRow: document.getElementById('build-chip-row'),
    channelChips: document.querySelectorAll('[data-filter-channel]'),
    channelChipRow: document.getElementById('channel-chip-row'),
    inventoryCountText: document.getElementById('inventory-count-text'),
    inventoryList: document.getElementById('inventory-list'),
    btnOpenNewManual: document.getElementById('btn-open-new-manual'),

    // 買い物リスト
    shoppingCountText: document.getElementById('shopping-count-text'),
    shoppingList: document.getElementById('shopping-list'),

    // JAN登録・スキャナ
    btnStartScan: document.getElementById('btn-start-scan'),
    btnStopScan: document.getElementById('btn-stop-scan'),
    btnSwitchCamera: document.getElementById('btn-switch-camera'),
    scannerHint: document.getElementById('scanner-hint'),
    scannerViewportWrap: document.getElementById('scanner-viewport-wrap'),
    scannerVideo: document.getElementById('scanner-video'),
    janLookupForm: document.getElementById('jan-lookup-form'),
    janManualInput: document.getElementById('jan-manual-input'),
    lookupLogPanel: document.getElementById('lookup-log-panel'),
    lookupLogList: document.getElementById('lookup-log-list'),
    localMatchPanel: document.getElementById('local-match-panel'),
    localMatchCard: document.getElementById('local-match-card'),
    webSearchPanel: document.getElementById('web-search-panel'),
    webSearchLinks: document.getElementById('web-search-links'),

    // アイテムフォーム
    itemFormPanel: document.getElementById('item-form-panel'),
    itemFormTitle: document.getElementById('item-form-title'),
    itemForm: document.getElementById('item-form'),
    btnCancelForm: document.getElementById('btn-cancel-form'),
    btnDeleteItem: document.getElementById('btn-delete-item'),
    fieldId: document.getElementById('field-id'),
    fieldSource: document.getElementById('field-source'),
    fieldJan: document.getElementById('field-jan'),
    fieldName: document.getElementById('field-name'),
    fieldKind: document.getElementById('field-kind'),
    fieldBrand: document.getElementById('field-brand'),
    fieldCode: document.getElementById('field-code'),
    fieldColorPicker: document.getElementById('field-colorPicker'),
    fieldColorHex: document.getElementById('field-colorHex'),
    fieldQty: document.getElementById('field-qty'),
    fieldDesired: document.getElementById('field-desired'),
    fieldKitGroup: document.getElementById('kit-fields'),
    fieldGrade: document.getElementById('field-grade'),
    fieldBuildStatus: document.getElementById('field-buildStatus'),
    fieldChannel: document.getElementById('field-channel'),
    fieldShipMonth: document.getElementById('field-shipMonth'),
    fieldShipMonthRow: document.getElementById('ship-month-row'),
    fieldScale: document.getElementById('field-scale'),
    fieldSubject: document.getElementById('field-subject'),
    fieldLocation: document.getElementById('field-location'),
    fieldMemo: document.getElementById('field-memo'),
    fieldImageUrl: document.getElementById('field-imageUrl'),
    fieldSourceUrl: document.getElementById('field-sourceUrl'),

    // 設定・GitHub同期
    btnGithubPull: document.getElementById('btn-github-pull'),
    btnGithubPush: document.getElementById('btn-github-push'),
    githubConflictBox: document.getElementById('github-conflict-box'),
    githubConflictMsg: document.getElementById('github-conflict-msg'),
    btnGithubForcePush: document.getElementById('btn-github-force-push'),
    githubSyncMeta: document.getElementById('github-sync-meta'),
    settingsForm: document.getElementById('settings-form'),
    setGithubOwner: document.getElementById('set-github-owner'),
    setGithubRepo: document.getElementById('set-github-repo'),
    setGithubBranch: document.getElementById('set-github-branch'),
    setGithubPath: document.getElementById('set-github-path'),
    setGithubToken: document.getElementById('set-github-token'),
    setProxyUrl: document.getElementById('set-proxy-url'),
    btnExportJson: document.getElementById('btn-export-json'),
    inputImportJson: document.getElementById('input-import-json')
  };

  // --- 初期化 ---
  function init() {
    registerServiceWorker();
    bindEvents();
    fillSettingsForm();
    updateSyncMetaText();
    renderAll();
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // オフラインやローカルfile://等では失敗しても動作を継続
      });
    }
  }

  // --- ストレージ管理 ---
  function createEmptyInventory() {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      items: []
    };
  }

  function normalizeItem(raw) {
    const now = new Date().toISOString();
    const kind = KINDS.includes(raw.kind) ? raw.kind : 'other';
    const buildStatus =
      kind === 'kit'
        ? Object.prototype.hasOwnProperty.call(BUILD_STATUS_LABELS, raw.buildStatus)
          ? raw.buildStatus
          : 'unbuilt'
        : '';
    return {
      id: String(raw.id || generateId()),
      jan: String(raw.jan || '').trim(),
      name: String(raw.name || '').trim(),
      brand: String(raw.brand || '').trim(),
      code: String(raw.code || '').trim(),
      kind,
      colorHex: normalizeHex(raw.colorHex),
      grade: kind === 'kit' ? String(raw.grade || '').trim() : '',
      buildStatus,
      channel:
        kind === 'kit' && Object.prototype.hasOwnProperty.call(CHANNEL_LABELS, raw.channel) ? raw.channel : kind === 'kit' ? 'general' : '',
      shipMonth: kind === 'kit' && /^\d{4}-\d{2}$/.test(String(raw.shipMonth || '')) ? raw.shipMonth : '',
      scale: String(raw.scale || '').trim(),
      subject: String(raw.subject || '').trim(),
      qty: Math.max(0, parseInt(raw.qty, 10) || 0),
      desired: Math.max(0, parseInt(raw.desired, 10) || 0),
      location: String(raw.location || '').trim(),
      memo: String(raw.memo || '').trim(),
      imageUrl: String(raw.imageUrl || '').trim(),
      sourceUrl: String(raw.sourceUrl || '').trim(),
      source: String(raw.source || 'manual').trim(),
      createdAt: raw.createdAt || now,
      updatedAt: raw.updatedAt || now
    };
  }

  function normalizeInventoryPayload(data) {
    if (!data || !Array.isArray(data.items)) {
      throw new Error('JSONに items 配列が含まれていません');
    }
    return {
      version: Number(data.version) || 1,
      updatedAt: data.updatedAt || new Date().toISOString(),
      items: data.items.map(normalizeItem)
    };
  }

  function loadInventory() {
    try {
      const raw = localStorage.getItem(STORAGE_INVENTORY_KEY);
      if (!raw) return createEmptyInventory();
      return normalizeInventoryPayload(JSON.parse(raw));
    } catch {
      return createEmptyInventory();
    }
  }

  function saveInventory() {
    inventory.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_INVENTORY_KEY, JSON.stringify(inventory));
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(nextSettings) {
    settings = { ...DEFAULT_SETTINGS, ...nextSettings };
    localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
  }

  function setGithubSha(sha) {
    githubSha = sha || '';
    if (githubSha) {
      localStorage.setItem(STORAGE_GITHUB_SHA_KEY, githubSha);
    } else {
      localStorage.removeItem(STORAGE_GITHUB_SHA_KEY);
    }
    updateSyncMetaText();
  }

  // --- ユーティリティ ---
  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function normalizeHex(val) {
    const s = String(val || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(s)) return '#' + s.toLowerCase();
    return '';
  }

  // 買い物リスト（qty < desired）と同じ基準で判定する
  function getItemStatus(item) {
    if (item.qty < item.desired) return item.qty === 0 ? 'out' : 'low';
    if (item.qty === 0) return 'none';
    return 'ok';
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, isError = false) {
    const div = document.createElement('div');
    div.className = isError ? 'toast toast-error' : 'toast';
    div.textContent = message;
    el.toastContainer.appendChild(div);
    setTimeout(() => {
      div.remove();
    }, 3200);
  }

  // UTF-8 対応 Base64 エンコード / デコード
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToUtf8(b64) {
    const clean = b64.replace(/\s+/g, '');
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  }

  function setPressed(group, target) {
    group.forEach((c) => {
      const on = c === target;
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // --- イベント登録 ---
  function bindEvents() {
    el.navBtns.forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    el.searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderInventoryList();
    });

    el.kindChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        filterKind = chip.dataset.filterKind;
        setPressed(el.kindChips, chip);
        renderInventoryList();
      });
    });

    el.statusChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        filterStatus = chip.dataset.filterStatus;
        setPressed(el.statusChips, chip);
        renderInventoryList();
      });
    });

    el.buildChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        filterBuild = chip.dataset.filterBuild;
        setPressed(el.buildChips, chip);
        renderInventoryList();
      });
    });

    el.channelChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        filterChannel = chip.dataset.filterChannel;
        setPressed(el.channelChips, chip);
        renderInventoryList();
      });
    });

    el.fieldBuildStatus.addEventListener('change', updateKitFieldsVisibility);

    el.fieldKind.addEventListener('change', updateKitFieldsVisibility);

    el.btnOpenNewManual.addEventListener('click', () => {
      switchTab('register');
      openItemForm({ source: 'manual' }, false);
      formReturnTab = 'inventory';
      el.itemFormPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // スキャナ・JAN検索
    el.btnStartScan.addEventListener('click', () => {
      scanRestartUsed = false;
      startCameraScan();
    });
    el.btnStopScan.addEventListener('click', stopCameraScan);
    el.btnSwitchCamera.addEventListener('click', switchCamera);

    el.janLookupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const jan = el.janManualInput.value.replace(/\s+/g, '');
      if (!jan) {
        showToast('JANコードを入力してください', true);
        return;
      }
      runJanLookupChain(jan);
    });

    // アイテムフォーム
    el.fieldColorPicker.addEventListener('input', () => {
      el.fieldColorHex.value = el.fieldColorPicker.value;
    });

    el.fieldColorHex.addEventListener('input', () => {
      const hex = normalizeHex(el.fieldColorHex.value);
      if (hex) el.fieldColorPicker.value = hex;
    });

    el.itemForm.addEventListener('submit', handleSaveItemForm);
    el.btnCancelForm.addEventListener('click', () => {
      const back = formReturnTab;
      closeItemForm();
      if (back) switchTab(back);
    });
    el.btnDeleteItem.addEventListener('click', () => {
      const id = el.fieldId.value.trim();
      if (id && deleteItem(id)) {
        closeItemForm();
        switchTab('inventory');
      }
    });

    // 設定・同期
    el.settingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveSettings({
        githubOwner: el.setGithubOwner.value.trim(),
        githubRepo: el.setGithubRepo.value.trim(),
        githubBranch: el.setGithubBranch.value.trim() || 'main',
        githubPath: el.setGithubPath.value.trim() || 'inventory.json',
        githubToken: el.setGithubToken.value.trim(),
        proxyUrl: el.setProxyUrl.value.trim()
      });
      showToast('設定を保存しました');
      updateSyncMetaText();
    });

    el.btnGithubPull.addEventListener('click', pullFromGithub);
    el.btnGithubPush.addEventListener('click', () => pushToGithub(false));
    el.btnGithubForcePush.addEventListener('click', () => pushToGithub(true));

    el.btnExportJson.addEventListener('click', exportInventoryJson);
    el.inputImportJson.addEventListener('change', importInventoryJson);
  }

  function switchTab(tabName) {
    if (tabName !== 'register' && isScanning) {
      stopCameraScan();
    }
    el.navBtns.forEach((btn) => {
      const on = btn.dataset.tab === tabName;
      btn.classList.toggle('active', on);
      if (on) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    el.tabViews.forEach((view) => {
      const isTarget = view.id === `view-${tabName}`;
      view.hidden = !isTarget;
      view.classList.toggle('active', isTarget);
    });
  }

  // --- 描画 ---
  function renderAll() {
    renderInventoryList();
    renderShoppingList();
    renderLocalMatch();
  }

  function renderLocalMatch() {
    if (!localMatchId || el.localMatchPanel.hidden) return;
    const item = inventory.items.find((it) => it.id === localMatchId);
    el.localMatchCard.innerHTML = '';
    if (!item) {
      el.localMatchPanel.hidden = true;
      localMatchId = '';
      return;
    }
    el.localMatchCard.appendChild(createItemCard(item, { shoppingMode: false }));
  }

  function renderInventoryList() {
    // 製作状況フィルタはガンプラ表示時のみ意味を持つ
    const showBuildFilter = filterKind === 'all' || filterKind === 'kit';
    el.buildChipRow.hidden = !showBuildFilter;
    el.channelChipRow.hidden = !showBuildFilter;
    if (!showBuildFilter && filterChannel !== 'all') {
      filterChannel = 'all';
      setPressed(el.channelChips, [...el.channelChips].find((c) => c.dataset.filterChannel === 'all'));
    }
    if (!showBuildFilter && filterBuild !== 'all') {
      filterBuild = 'all';
      setPressed(el.buildChips, [...el.buildChips].find((c) => c.dataset.filterBuild === 'all'));
    }

    const filtered = inventory.items.filter((item) => {
      if (filterKind !== 'all' && item.kind !== filterKind) return false;
      if (filterStatus !== 'all' && getItemStatus(item) !== filterStatus) return false;
      if (filterBuild !== 'all' && item.buildStatus !== filterBuild) return false;
      if (filterChannel !== 'all' && item.channel !== filterChannel) return false;
      if (searchQuery) {
        const hay = [
          item.name,
          item.jan,
          item.brand,
          item.code,
          item.location,
          item.subject,
          item.grade,
          BUILD_STATUS_LABELS[item.buildStatus] || '',
          { pbandai: 'プレバン プレミアムバンダイ', limited: '限定品 イベント限定 店舗限定' }[item.channel] || '',
          item.memo
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(searchQuery)) return false;
      }
      return true;
    });

    el.inventoryCountText.textContent = `${filtered.length}件 / 全${inventory.items.length}件`;

    if (filtered.length === 0) {
      el.inventoryList.innerHTML =
        '<div class="empty-state"><span class="empty-barcode" aria-hidden="true"></span>該当する品目はありません。<span class="nobr">「JAN登録」</span>か<span class="nobr">「＋ 新規登録」</span>から<span class="nobr">追加</span>できます。</div>';
      return;
    }

    el.inventoryList.innerHTML = '';
    filtered.forEach((item) => {
      el.inventoryList.appendChild(createItemCard(item, { shoppingMode: false }));
    });
  }

  function renderShoppingList() {
    const shortageItems = inventory.items.filter((item) => item.qty < item.desired);
    el.shoppingCountText.textContent = `${shortageItems.length}件`;

    if (shortageItems.length > 0) {
      el.navShoppingBadge.hidden = false;
      el.navShoppingBadge.textContent = String(shortageItems.length);
    } else {
      el.navShoppingBadge.hidden = true;
    }

    if (shortageItems.length === 0) {
      el.shoppingList.innerHTML =
        '<div class="empty-state">不足している品目はありません。</div>';
      return;
    }

    el.shoppingList.innerHTML = '';
    shortageItems.forEach((item) => {
      el.shoppingList.appendChild(createItemCard(item, { shoppingMode: true }));
    });
  }

  function formatShipMonth(ym) {
    const [y, m] = ym.split('-');
    return `${y}年${parseInt(m, 10)}月`;
  }

  function getTagCode(item) {
    if (item.kind === 'kit') return item.grade || 'KIT';
    if (item.code) return item.code;
    return { paint: '塗', decal: 'デ', other: '他' }[item.kind] || '他';
  }

  // 型式番号やスケール（RX-78-2, 1/144, Ver.2.0）を途中で折り返さない
  function formatItemName(name) {
    return String(name).replace(/[A-Za-z0-9][A-Za-z0-9.\-/]*|[^A-Za-z0-9]+/g, (m) =>
      /^[A-Za-z0-9]/.test(m) && m.length >= 3 && m.length <= 16
        ? `<span class="nobr">${escapeHtml(m)}</span>`
        : escapeHtml(m)
    );
  }

  function createItemCard(item, { shoppingMode }) {
    const status = getItemStatus(item);
    const row = document.createElement('article');
    row.className = `item-row status-${status}`;

    const tagCode = getTagCode(item);
    const tagLabel = item.kind === 'kit' ? BUILD_STATUS_LABELS[item.buildStatus] : KIND_LABELS[item.kind];
    const buildClass = item.kind === 'kit' ? ` build-${item.buildStatus}` : '';
    const swatch = item.colorHex
      ? `<span class="tag-swatch" style="background-color:${escapeHtml(item.colorHex)}" title="${escapeHtml(item.colorHex)}"></span>`
      : '';

    const metaParts = [];
    if (item.channel && item.channel !== 'general') metaParts.push(CHANNEL_LABELS[item.channel]);
    if (item.buildStatus === 'reserved' && item.shipMonth) metaParts.push(`発送予定 ${formatShipMonth(item.shipMonth)}`);
    if (item.brand) metaParts.push(item.brand);
    if (item.scale) metaParts.push(item.scale);
    if (item.kind !== 'kit' && item.code && item.code !== tagCode) metaParts.push(`品番 ${item.code}`);
    if (item.location) metaParts.push(`置き場: ${item.location}`);
    if (item.jan && shoppingMode) metaParts.push(`JAN ${item.jan}`);

    const shortage = Math.max(0, item.desired - item.qty);
    const needText = status === 'ok' ? '' : `${STATUS_LABELS[status]}・あと${shortage}`;
    const qtySub = item.desired > 0 ? `目標${item.desired}` : '所持';

    row.innerHTML = `
      <div class="item-tag${buildClass}">
        <b class="tag-code${tagCode.length > 4 ? ' is-long' : ''}">${escapeHtml(tagCode)}${TAG_MARKS[item.channel] ? `<i class="tag-mark" title="${escapeHtml(CHANNEL_LABELS[item.channel])}">${TAG_MARKS[item.channel]}</i>` : ''}</b>
        ${swatch}
        <span class="tag-label">${escapeHtml(tagLabel)}</span>
      </div>
      <div class="item-body" role="button" tabindex="0" data-action="edit" aria-label="「${escapeHtml(item.name)}」を編集">
        <h3 class="item-name">${formatItemName(item.name)}</h3>
        ${metaParts.length ? `<div class="item-meta">${metaParts.map((m) => `<span>${escapeHtml(m)}</span>`).join('')}</div>` : ''}
        ${needText && shortage > 0 ? `<div class="item-need">${escapeHtml(needText)}</div>` : ''}
        ${item.memo && !shoppingMode ? `<p class="item-memo">${escapeHtml(item.memo)}</p>` : ''}
      </div>
      <div class="qty-controls">
        <button type="button" class="qty-btn" data-action="dec" aria-label="所持数を1減らす">−</button>
        <span class="qty-display" aria-live="polite"><strong>${item.qty}</strong><small>${escapeHtml(qtySub)}</small></span>
        <button type="button" class="qty-btn" data-action="inc" aria-label="所持数を1増やす">＋</button>
      </div>
    `;

    row.querySelector('[data-action="dec"]').addEventListener('click', () => adjustQty(item.id, -1));
    row.querySelector('[data-action="inc"]').addEventListener('click', () => adjustQty(item.id, 1));
    const body = row.querySelector('[data-action="edit"]');
    const openEdit = () => {
      const from = document.querySelector('.tab-view.active');
      const back = from ? from.id.replace('view-', '') : '';
      switchTab('register');
      openItemForm(item, true);
      formReturnTab = back === 'register' ? '' : back;
      el.itemFormPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    body.addEventListener('click', openEdit);
    body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openEdit();
      }
    });

    return row;
  }

  function adjustQty(id, delta) {
    const target = inventory.items.find((it) => it.id === id);
    if (!target) return;
    target.qty = Math.max(0, target.qty + delta);
    target.updatedAt = new Date().toISOString();
    saveInventory();
    renderAll();
  }

  function deleteItem(id) {
    const target = inventory.items.find((it) => it.id === id);
    if (!target) return false;
    if (!window.confirm(`「${target.name}」を削除しますか？`)) return false;
    inventory.items = inventory.items.filter((it) => it.id !== id);
    saveInventory();
    renderAll();
    showToast('削除しました');
    return true;
  }

  // --- フォーム操作 ---
  function openItemForm(prefill = {}, isEdit = false) {
    formReturnTab = '';
    el.itemForm.reset();
    el.itemFormPanel.hidden = false;
    el.itemFormTitle.textContent = isEdit ? '編集' : '新規登録';
    el.btnDeleteItem.hidden = !isEdit;

    el.fieldId.value = isEdit ? prefill.id || '' : '';
    el.fieldSource.value = prefill.source || 'manual';
    el.fieldJan.value = prefill.jan || '';
    el.fieldName.value = prefill.name || '';
    el.fieldKind.value = KINDS.includes(prefill.kind) ? prefill.kind : 'paint';
    el.fieldGrade.value = prefill.grade || '';
    el.fieldBuildStatus.value = BUILD_STATUS_LABELS[prefill.buildStatus] ? prefill.buildStatus : 'unbuilt';
    el.fieldChannel.value = CHANNEL_LABELS[prefill.channel] ? prefill.channel : 'general';
    el.fieldShipMonth.value = prefill.shipMonth || '';
    updateKitFieldsVisibility();
    el.fieldBrand.value = prefill.brand || '';
    el.fieldCode.value = prefill.code || '';
    const hex = normalizeHex(prefill.colorHex);
    el.fieldColorHex.value = hex;
    el.fieldColorPicker.value = hex || '#dfe0dc';
    el.fieldQty.value = prefill.qty !== undefined ? prefill.qty : 1;
    el.fieldDesired.value = prefill.desired !== undefined ? prefill.desired : 1;
    el.fieldScale.value = prefill.scale || '';
    el.fieldSubject.value = prefill.subject || '';
    el.fieldLocation.value = prefill.location || '';
    el.fieldMemo.value = prefill.memo || '';
    el.fieldImageUrl.value = prefill.imageUrl || '';
    el.fieldSourceUrl.value = prefill.sourceUrl || '';
  }

  function closeItemForm() {
    formReturnTab = '';
    el.itemFormPanel.hidden = true;
    el.itemForm.reset();
    el.fieldId.value = '';
    el.btnDeleteItem.hidden = true;
    updateKitFieldsVisibility();
  }

  function updateKitFieldsVisibility() {
    el.fieldKitGroup.hidden = el.fieldKind.value !== 'kit';
    el.fieldShipMonthRow.hidden = el.fieldBuildStatus.value !== 'reserved';
  }

  function handleSaveItemForm(e) {
    e.preventDefault();
    const id = el.fieldId.value.trim();
    const now = new Date().toISOString();
    const payload = {
      jan: el.fieldJan.value.trim(),
      name: el.fieldName.value.trim(),
      kind: el.fieldKind.value,
      brand: el.fieldBrand.value.trim(),
      code: el.fieldCode.value.trim(),
      colorHex: normalizeHex(el.fieldColorHex.value),
      grade: el.fieldGrade.value.trim(),
      buildStatus: el.fieldBuildStatus.value,
      channel: el.fieldChannel.value,
      shipMonth: el.fieldBuildStatus.value === 'reserved' ? el.fieldShipMonth.value : '',
      qty: Math.max(0, parseInt(el.fieldQty.value, 10) || 0),
      desired: Math.max(0, parseInt(el.fieldDesired.value, 10) || 0),
      scale: el.fieldScale.value.trim(),
      subject: el.fieldSubject.value.trim(),
      location: el.fieldLocation.value.trim(),
      memo: el.fieldMemo.value.trim(),
      imageUrl: el.fieldImageUrl.value.trim(),
      sourceUrl: el.fieldSourceUrl.value.trim(),
      source: el.fieldSource.value.trim() || 'manual'
    };

    if (!payload.name) {
      showToast('商品名を入力してください', true);
      return;
    }

    if (id) {
      const idx = inventory.items.findIndex((it) => it.id === id);
      if (idx !== -1) {
        inventory.items[idx] = normalizeItem({
          ...inventory.items[idx],
          ...payload,
          updatedAt: now
        });
        showToast('更新しました');
      }
    } else {
      inventory.items.unshift(
        normalizeItem({
          ...payload,
          id: generateId(),
          createdAt: now,
          updatedAt: now
        })
      );
      showToast('登録しました');
    }

    saveInventory();
    renderAll();
    closeItemForm();
    switchTab('inventory');
  }

  // --- カメラ読み取り (ZXing 第一、BarcodeDetector フォールバック) ---
  async function startCameraScan() {
    if (isScanning) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      el.scannerHint.textContent =
        'この環境ではカメラAPIを利用できません（HTTPS接続が必要です）。下のJAN手入力欄をご利用ください。';
      return;
    }

    // 1. ZXing (iPhone Safari 含む最優先)
    if (window.ZXing && window.ZXing.BrowserMultiFormatReader) {
      try {
        isScanning = true;
        toggleScannerUi(true);
        el.scannerHint.textContent = 'バーコードを探しています…';

        // JAN系フォーマットに絞り、TRY_HARDERで読み取り率を上げる
        const hints = new Map();
        if (window.ZXing.DecodeHintType && window.ZXing.BarcodeFormat) {
          const BF = window.ZXing.BarcodeFormat;
          hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, [
            BF.EAN_13, BF.EAN_8, BF.UPC_A, BF.UPC_E, BF.CODE_128
          ]);
          hints.set(window.ZXing.DecodeHintType.TRY_HARDER, true);
        }
        zxingReader = new window.ZXing.BrowserMultiFormatReader(hints);
        decodeAttempts = 0;
        lastDecodeError = '';
        const onResult = (result, err) => {
          decodeAttempts++;
          if (result) {
            const code = result.getText().trim();
            // JANは13桁または8桁のみ採用する（誤読・部分読みで止めない）
            if (/^\d{13}$/.test(code) || /^\d{8}$/.test(code)) {
              handleDecodedJan(code);
            }
          } else if (err && !(err instanceof window.ZXing.NotFoundException)) {
            // NotFound以外のエラーはループが止まる原因になるため画面に出す（診断用）
            lastDecodeError = `${err.name || 'Error'}: ${err.message || err}`;
            updateScanStatus();
          }
        };

        // iOS では facingMode 任せだと映像が来ないことがあるため、
        // 先に許可を取って背面カメラを deviceId で明示する。
        // 近距離に強いレンズは機種で違うので、背面レンズは切替可能にし選択を保存する。
        let deviceId;
        try {
          const probe = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
          });
          probe.getTracks().forEach((t) => t.stop());
          const devices = (await navigator.mediaDevices.enumerateDevices())
            .filter((d) => d.kind === 'videoinput');
          backCameras = devices.filter((d) => !/front|前面/i.test(d.label));
          if (!backCameras.length) backCameras = devices;
          const saved = backCameras.find((d) => d.deviceId === settings.cameraDeviceId);
          const main = backCameras.find((d) => /背面カメラ|back camera/i.test(d.label));
          const picked = saved || main || backCameras[backCameras.length - 1];
          if (picked) {
            deviceId = picked.deviceId;
            currentCameraId = picked.deviceId;
            currentCameraLabel = picked.label || '';
            el.btnSwitchCamera.hidden = backCameras.length < 2;
          }
        } catch {
          // デバイス列挙に失敗したら constraints 方式にフォールバック
          deviceId = undefined;
        }

        // 解像度は起動時の制約で要求する（後付けの applyConstraints はしない）。
        // 制約なしだと iOS が 480×640 を返し、バーが潰れて読めない実測があった。
        const videoConstraints = {
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        };
        if (deviceId) {
          videoConstraints.deviceId = { exact: deviceId };
        } else {
          videoConstraints.facingMode = { ideal: 'environment' };
        }
        await zxingReader.decodeFromConstraints(
          { video: videoConstraints },
          el.scannerVideo,
          onResult
        );
        if (el.scannerVideo.play) {
          el.scannerVideo.play().catch(() => {});
        }

        // 注意: 起動後の applyConstraints（解像度・フォーカス変更）は行わない。
        // フォーカスはレンズ切替とOS標準のAFに任せる。
        // 診断表示（試行回数・映像解像度・非NotFoundエラー）を2秒ごとに更新し、
        // 端末標準の BarcodeDetector があれば同じ映像で並行検出する。
        updateScanStatus();
        scanStatusIntervalId = setInterval(updateScanStatus, 2000);
        startParallelDetector();

        // 映像が届いていない場合の見守り（真っ黒なまま無言にしない）
        scanWatchdogId = setTimeout(() => {
          if (isScanning && (!el.scannerVideo.videoWidth || el.scannerVideo.readyState < 2)) {
            el.scannerHint.textContent =
              'カメラ映像が届いていません。Safari本体で開いているか、設定アプリ→Safari→カメラの許可を確認してください。アプリ内ブラウザではカメラが使えないことがあります。';
          }
        }, 3500);
        return;
      } catch (err) {
        stopCameraScan();
        el.scannerHint.textContent = `カメラを起動できませんでした (${err.name || ''} ${err.message || err})。別の読み取り方式を試します…`;
      }
    }

    // 2. BarcodeDetector フォールバック
    if ('BarcodeDetector' in window) {
      try {
        isScanning = true;
        toggleScannerUi(true);
        el.scannerHint.textContent = 'バーコードを探しています…';

        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']
        });
        detectorStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
        el.scannerVideo.srcObject = detectorStream;
        await el.scannerVideo.play();

        const scanLoop = async () => {
          if (!isScanning) return;
          try {
            if (el.scannerVideo.readyState >= 2) {
              const codes = await detector.detect(el.scannerVideo);
              if (codes && codes.length > 0 && codes[0].rawValue) {
                const code = codes[0].rawValue.trim();
                if (!/^\d{13}$/.test(code) && !/^\d{8}$/.test(code)) {
                  // JANの桁数でない読み取りは採用せず探し続ける
                } else {
                  stopCameraScan();
                  el.janManualInput.value = code;
                  runJanLookupChain(code);
                  return;
                }
              }
            }
          } catch {
            // フレーム検出エラーは無視して次フレームへ
          }
          detectorRafId = requestAnimationFrame(scanLoop);
        };
        detectorRafId = requestAnimationFrame(scanLoop);
        return;
      } catch (err) {
        stopCameraScan();
        el.scannerHint.textContent = `カメラ読み取りを開始できませんでした (${err.message || err})。下のJAN手入力欄をご利用ください。`;
        return;
      }
    }

    // 3. どちらも利用不可
    el.scannerHint.textContent =
      'このブラウザではカメラでのバーコード読み取りが使えません。下の欄にJANを入力してください。';
  }

  function stopCameraScan() {
    isScanning = false;
    if (scanWatchdogId) {
      clearTimeout(scanWatchdogId);
      clearTimeout(decodeWatchdogId);
      clearInterval(scanStatusIntervalId);
      parallelDetectorOn = false;
      scanWatchdogId = null;
    }
    if (zxingReader) {
      try {
        zxingReader.reset();
      } catch {
        // ignore
      }
      zxingReader = null;
    }
    if (detectorRafId) {
      cancelAnimationFrame(detectorRafId);
      detectorRafId = null;
    }
    if (detectorStream) {
      detectorStream.getTracks().forEach((t) => t.stop());
      detectorStream = null;
    }
    if (el.scannerVideo.srcObject) {
      try {
        el.scannerVideo.srcObject.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      el.scannerVideo.srcObject = null;
    }
    toggleScannerUi(false);
  }

  function toggleScannerUi(active) {
    el.btnStartScan.hidden = active;
    el.btnStopScan.hidden = !active;
    el.scannerViewportWrap.hidden = !active;
    if (!active) el.btnSwitchCamera.hidden = true;
  }

  // 読み取り成功時の共通処理
  function handleDecodedJan(code) {
    stopCameraScan();
    el.janManualInput.value = code;
    runJanLookupChain(code);
  }

  // スキャン中の診断表示: 試行回数・映像解像度・直近のエラーを出す
  function updateScanStatus() {
    if (!isScanning) return;
    const vw = el.scannerVideo.videoWidth || 0;
    const vh = el.scannerVideo.videoHeight || 0;
    let text = 'バーコードを探しています…';
    if (currentCameraLabel) text += `（${currentCameraLabel}）`;
    text += ` 試行${decodeAttempts}回・映像${vw}×${vh}`;
    if (lastDecodeError) text += `・エラー: ${lastDecodeError}`;
    el.scannerHint.textContent = text;
  }

  // 端末標準 BarcodeDetector があれば、ZXingと同じ映像で並行検出する
  function startParallelDetector() {
    if (!('BarcodeDetector' in window) || parallelDetectorOn) return;
    let detector;
    try {
      detector = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']
      });
    } catch {
      return;
    }
    parallelDetectorOn = true;
    let lastTry = 0;
    const loop = async (ts) => {
      if (!parallelDetectorOn || !isScanning) return;
      if (ts - lastTry >= 250) {
        lastTry = ts;
        try {
          const codes = await detector.detect(el.scannerVideo);
          for (const c of codes) {
            const raw = (c.rawValue || '').trim();
            if (/^\d{13}$/.test(raw) || /^\d{8}$/.test(raw)) {
              handleDecodedJan(raw);
              return;
            }
          }
        } catch {
          // 映像未準備などの一時エラーは無視して続ける
        }
      }
      detectorRafId = requestAnimationFrame(loop);
    };
    detectorRafId = requestAnimationFrame(loop);
  }

  // 背面レンズを順に切り替える（マクロに強いレンズは機種で違うため）。選択は保存する
  function switchCamera() {
    if (!isScanning || backCameras.length < 2) return;
    const idx = backCameras.findIndex((d) => d.deviceId === currentCameraId);
    const next = backCameras[(idx + 1) % backCameras.length];
    saveSettings({ ...settings, cameraDeviceId: next.deviceId });
    stopCameraScan();
    startCameraScan();
  }

  // --- JAN照合チェーン ---
  function addLookupLog(text, level = 'info') {
    const li = document.createElement('li');
    li.textContent = text;
    if (level === 'ok') li.className = 'log-ok';
    if (level === 'warn') li.className = 'log-warn';
    if (level === 'err') li.className = 'log-err';
    el.lookupLogList.appendChild(li);
  }

  function renderWebSearchLinks(jan) {
    const encoded = encodeURIComponent(jan);
    const sites = [
      { label: 'ホビーサーチで検索', url: `https://www.1999.co.jp/search?searchkey=${encoded}` },
      { label: 'プレミアムバンダイで検索', url: `https://p-bandai.jp/search/?keyword=${encoded}` },
      { label: 'Amazonで検索', url: `https://www.amazon.co.jp/s?k=${encoded}` },
      { label: '楽天市場で検索', url: `https://search.rakuten.co.jp/search/mall/${encoded}/` },
      { label: '駿河屋で検索', url: `https://www.suruga-ya.jp/search?jan=${encoded}` }
    ];
    el.webSearchLinks.innerHTML = sites
      .map(
        (s) =>
          `<a class="btn btn-secondary btn-sm" href="${s.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)}</a>`
      )
      .join('');
    el.webSearchPanel.hidden = false;
  }

  // 照合で得た候補に、名前とJANから分かる項目（グレード/スケール/メーカー/種別）を補完する
  function enrichCandidate(candidate) {
    const c = { ...candidate };
    if (c.name) {
      // ホビーサーチのタイトル末尾の分類表記は商品名から外す
      c.name = c.name.replace(/\s*[（(](塗料|デカール|工具・塗料)[）)]\s*$/, '').trim();
    }
    const name = c.name || '';

    if (!c.grade && name) {
      const g = name.match(/(?:^|[\s　])(MGEX|HGUC|HGCE|HGAC|HGBF|HGBD|HG|RG|MG|PG|EG|SD|FM)(?:[\s　]|$)/);
      if (g) c.grade = g[1];
    }
    if (!c.scale && name) {
      const s = name.match(/(1\/\d{2,3})/);
      if (s) c.scale = s[1];
    }
    if (!c.kind && name) {
      if (/デカール/.test(name)) c.kind = 'decal';
      else if (/[（(]塗料[）)]/.test(candidate.name || '') || /塗料$/.test(name)) c.kind = 'paint';
      else if (c.grade || c.scale) c.kind = 'kit';
    }
    if (!c.brand && c.jan && /^\d{13}$/.test(c.jan)) {
      // JAN先頭7桁はGS1事業者コード。主なホビーメーカーのみ推定する
      const BRAND_BY_JAN_PREFIX = {
        '4573102': 'BANDAI SPIRITS',
        '4543112': 'BANDAI SPIRITS',
        '4973028': 'GSIクレオス',
        '4950344': 'タミヤ',
        '4934054': 'コトブキヤ',
        '4582182': 'ガイアノーツ'
      };
      const brand = BRAND_BY_JAN_PREFIX[c.jan.slice(0, 7)];
      if (brand) c.brand = brand;
    }
    return c;
  }

  async function runJanLookupChain(jan) {
    el.lookupLogPanel.hidden = false;
    el.lookupLogList.innerHTML = '';
    el.localMatchPanel.hidden = true;
    el.localMatchCard.innerHTML = '';
    localMatchId = '';
    el.localMatchPanel.querySelectorAll(':scope > .btn').forEach((b) => b.remove());
    el.webSearchPanel.hidden = true;

    addLookupLog(`JAN「${jan}」の照合を開始します。`);

    // 1. ローカル在庫チェック
    const localHit = inventory.items.find((it) => it.jan === jan);
    if (localHit) {
      addLookupLog(`1. 自分の在庫: ヒット（「${localHit.name}」、所持数 ${localHit.qty}）`, 'ok');
      showLocalMatch(localHit, jan);
      renderWebSearchLinks(jan);
      return;
    }
    addLookupLog('1. 自分の在庫: 一致なし。外部照合へ進みます。');

    // 2. UPCitemdb トライアルAPI
    const upcCandidate = await tryUpcItemDb(jan);
    if (upcCandidate) {
      openItemForm(enrichCandidate(upcCandidate), false);
      renderWebSearchLinks(jan);
      el.itemFormPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // 3. ホビーサーチ用プロキシ
    const proxyCandidate = await tryHobbySearchProxy(jan);
    if (proxyCandidate) {
      openItemForm(enrichCandidate(proxyCandidate), false);
      renderWebSearchLinks(jan);
      el.itemFormPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // 4. すべてヒットせず -> 手動登録フォーム + Web検索リンク
    addLookupLog('4. 自動照合では候補が見つかりませんでした。手動登録フォームを開きます。', 'warn');
    openItemForm({ jan, source: 'manual' }, false);
    renderWebSearchLinks(jan);
    el.itemFormPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showLocalMatch(item, jan) {
    localMatchId = item.id;
    el.localMatchPanel.hidden = false;
    renderLocalMatch();

    const extraBtn = document.createElement('button');
    extraBtn.type = 'button';
    extraBtn.className = 'btn btn-secondary btn-sm';
    extraBtn.textContent = '別の品目として新規登録';
    extraBtn.addEventListener('click', () => {
      openItemForm({ jan, source: 'manual' }, false);
      el.itemFormPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    el.localMatchPanel.appendChild(extraBtn);
  }

  // 外部照会が固まっても登録フォームまで必ず進めるよう、fetchに上限時間を付ける
  async function fetchWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { method: 'GET', signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function tryUpcItemDb(jan) {
    const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(jan)}`;
    try {
      const res = await fetchWithTimeout(url, 6000);
      if (!res.ok) {
        addLookupLog(`2. UPCitemdb: HTTP ${res.status} で取得失敗（レート制限等の可能性）。次へ進みます。`, 'warn');
        return null;
      }
      const data = await res.json();
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        const hit = data.items[0];
        addLookupLog(`2. UPCitemdb: ヒット（「${hit.title || '名称不明'}」）`, 'ok');
        return {
          jan,
          name: hit.title || '',
          brand: hit.brand || '',
          code: hit.model || '',
          imageUrl: Array.isArray(hit.images) && hit.images[0] ? hit.images[0] : '',
          sourceUrl: '',
          source: 'upcitemdb'
        };
      }
      addLookupLog('2. UPCitemdb: 該当データなし。次へ進みます。');
      return null;
    } catch (err) {
      addLookupLog(
        `2. UPCitemdb: 通信エラーまたはCORS制限で失敗 (${err.message || err})。次へ進みます。`,
        'warn'
      );
      return null;
    }
  }

  async function tryHobbySearchProxy(jan) {
    const base = (settings.proxyUrl || '').trim();
    if (!base) {
      addLookupLog('3. ホビーサーチ用プロキシ: 設定タブでプロキシ URL が未設定のためスキップ。');
      return null;
    }

    const sep = base.includes('?') ? '&' : '?';
    const url = `${base}${sep}jan=${encodeURIComponent(jan)}`;

    try {
      const res = await fetchWithTimeout(url, 12000);
      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (!res.ok) {
        const reason = data && data.error ? data.error : `HTTP ${res.status}`;
        addLookupLog(`3. ホビーサーチ用プロキシ: 取得失敗 (${reason})。`, 'warn');
        return null;
      }

      if (data && data.name) {
        addLookupLog(`3. ホビーサーチ用プロキシ: ヒット（「${data.name}」）`, 'ok');
        return {
          jan: data.jan || jan,
          name: data.name || '',
          brand: data.brand || '',
          code: data.code || '',
          imageUrl: data.imageUrl || '',
          sourceUrl: data.sourceUrl || '',
          source: 'hobbysearch'
        };
      }

      addLookupLog('3. ホビーサーチ用プロキシ: 候補データが空でした。');
      return null;
    } catch (err) {
      addLookupLog(`3. ホビーサーチ用プロキシ: 通信エラー (${err.message || err})。`, 'err');
      return null;
    }
  }

  // --- GitHub 同期 & JSONインポート/エクスポート ---
  function fillSettingsForm() {
    el.setGithubOwner.value = settings.githubOwner;
    el.setGithubRepo.value = settings.githubRepo;
    el.setGithubBranch.value = settings.githubBranch || 'main';
    el.setGithubPath.value = settings.githubPath || 'inventory.json';
    el.setGithubToken.value = settings.githubToken;
    el.setProxyUrl.value = settings.proxyUrl;
  }

  function updateSyncMetaText() {
    const shaInfo = githubSha ? `保持SHA: ${githubSha.slice(0, 7)}...` : '保持SHA: なし';
    const repoInfo =
      settings.githubOwner && settings.githubRepo
        ? `${settings.githubOwner}/${settings.githubRepo}@${settings.githubBranch || 'main'}:${settings.githubPath || 'inventory.json'}`
        : 'リポジトリ未設定';
    el.githubSyncMeta.textContent = `対象: ${repoInfo} / ${shaInfo}`;
    el.syncBadge.textContent = settings.githubOwner && settings.githubRepo ? 'GitHub設定済' : 'ローカル';
  }

  function validateGithubSettings(requireToken) {
    if (!settings.githubOwner || !settings.githubRepo || !settings.githubPath) {
      showToast('GitHubの Owner / Repo / Path を設定してください', true);
      return false;
    }
    if (requireToken && !settings.githubToken) {
      showToast('書き込みには Personal Access Token が必要です', true);
      return false;
    }
    return true;
  }

  function buildGithubContentsUrl(includeRef = false) {
    const owner = encodeURIComponent(settings.githubOwner);
    const repo = encodeURIComponent(settings.githubRepo);
    const path = settings.githubPath
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    const base = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    return includeRef ? `${base}?ref=${encodeURIComponent(settings.githubBranch || 'main')}` : base;
  }

  function buildGithubHeaders() {
    const headers = {
      Accept: 'application/vnd.github+json'
    };
    if (settings.githubToken) {
      headers.Authorization = `Bearer ${settings.githubToken}`;
    }
    return headers;
  }

  async function pullFromGithub() {
    if (!validateGithubSettings(false)) return;
    el.githubConflictBox.hidden = true;

    try {
      const res = await fetch(buildGithubContentsUrl(true), {
        method: 'GET',
        headers: buildGithubHeaders()
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.content) {
        throw new Error('ファイル内容が取得できませんでした');
      }

      const decoded = base64ToUtf8(data.content);
      const parsed = normalizeInventoryPayload(JSON.parse(decoded));

      inventory = parsed;
      saveInventory();
      setGithubSha(data.sha || '');
      renderAll();
      showToast(`GitHubから読み込みました（${inventory.items.length}件）`);
    } catch (err) {
      showToast(`読み込み失敗: ${err.message}`, true);
    }
  }

  async function pushToGithub(forceOverwrite = false) {
    if (!validateGithubSettings(true)) return;
    el.githubConflictBox.hidden = true;

    try {
      let shaToUse = githubSha;

      if (forceOverwrite) {
        // 最新のSHAを取得し直す
        const getRes = await fetch(buildGithubContentsUrl(true), {
          method: 'GET',
          headers: buildGithubHeaders()
        });
        if (getRes.ok) {
          const latest = await getRes.json();
          shaToUse = latest.sha || '';
        } else if (getRes.status === 404) {
          shaToUse = '';
        } else {
          const errData = await getRes.json().catch(() => ({}));
          throw new Error(`最新SHA取得失敗: ${errData.message || getRes.status}`);
        }
      }

      const jsonText = JSON.stringify(inventory, null, 2);
      const body = {
        message: `Update inventory (${new Date().toISOString()})`,
        content: utf8ToBase64(jsonText),
        branch: settings.githubBranch || 'main'
      };
      if (shaToUse) {
        body.sha = shaToUse;
      }

      const putRes = await fetch(buildGithubContentsUrl(false), {
        method: 'PUT',
        headers: {
          ...buildGithubHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (putRes.status === 409 || putRes.status === 422) {
        const errData = await putRes.json().catch(() => ({}));
        el.githubConflictMsg.textContent =
          `競合エラー (HTTP ${putRes.status}: ${errData.message || 'SHA不一致'})。先に「GitHubから読み込む」を実行してください。`;
        el.githubConflictBox.hidden = false;
        showToast('競合が発生しました。先に読み込み直してください', true);
        return;
      }

      if (!putRes.ok) {
        const errData = await putRes.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${putRes.status}`);
      }

      const result = await putRes.json();
      if (result.content && result.content.sha) {
        setGithubSha(result.content.sha);
      }
      showToast('GitHubへ保存しました');
    } catch (err) {
      showToast(`保存失敗: ${err.message}`, true);
    }
  }

  function exportInventoryJson() {
    // トークンや設定は絶対に含めない（inventory のみ）
    const cleanPayload = {
      version: inventory.version || 1,
      updatedAt: inventory.updatedAt || new Date().toISOString(),
      items: inventory.items
    };
    const blob = new Blob([JSON.stringify(cleanPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `plamo-inventory-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('JSONをエクスポートしました');
  }

  function importInventoryJson(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = normalizeInventoryPayload(JSON.parse(String(reader.result || '')));
        inventory = parsed;
        saveInventory();
        renderAll();
        showToast(`JSONを読み込みました（${inventory.items.length}件）`);
      } catch (err) {
        showToast(`JSON形式が不正です: ${err.message}`, true);
      } finally {
        el.inputImportJson.value = '';
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
