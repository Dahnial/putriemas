
// ════════════════════════════════════════════════════════
// STATE GLOBAL
// ════════════════════════════════════════════════════════
const AppState = {
  token: null,
  user: null,          // {id, nama, username, role, fotoUrl}
  currentPage: 'dashboard',
  loginRole: 'KARYAWAN',
  gps: null,
  stream: null,
  lastPhotoBase64: null,
  trxBuktiBase64: null,
  trxBuktiFileName: null,
  dashboardData: null,
  listCache: {},
  approvalTab: 'pengajuan',
  trxFilter: 'ALL',
  stokFilter: 'ALL',
  lastTrx: null,
  configCache: null
};
const chartInstances = {};

// safeGet/safeSet/safeRemove dan callApi() sudah didefinisikan di js/api.js
// (dimuat sebelum file ini) — tidak didefinisikan ulang di sini.

// Jaring pengaman terakhir: apa pun error-nya, JANGAN biarkan layar
// loading tersangkut selamanya.
window.addEventListener('error', function (e) {
  hideLoadingOverlay();
  if (document.getElementById('appShell').style.display === 'none' &&
      document.getElementById('loginScreen').style.display !== 'flex') {
    document.getElementById('loginScreen').style.display = 'flex';
  }
  console.error('Permata POS error:', e.message, 'at', e.filename + ':' + e.lineno);
});

// ════════════════════════════════════════════════════════
// MENU DEFINISI (role-aware)
// ════════════════════════════════════════════════════════
const MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard Utama', icon: 'bi-grid-fill', roles: ['OWNER','KARYAWAN'] },
  { key: 'kasir', label: 'Kasir Transaksi POS', icon: 'bi-cart3', roles: ['OWNER','KARYAWAN'] },
  { key: 'stok', label: 'Stok & Etalase', icon: 'bi-box-seam', roles: ['OWNER','KARYAWAN'] },
  { key: 'kas', label: 'Kas Laci Kasir', icon: 'bi-wallet2', roles: ['OWNER','KARYAWAN'] },
  { key: 'brankas', label: 'Saldo Brankas', icon: 'bi-safe', roles: ['OWNER'], tag: 'OWNER' },
  { key: 'bank', label: 'Rekening Bank & QRIS', icon: 'bi-bank', roles: ['OWNER'], tag: 'OWNER' },
  { key: 'absen', label: 'Absensi & Izin', icon: 'bi-fingerprint', roles: ['OWNER','KARYAWAN'] },
  { key: 'piutang', label: 'Piutang & Hutang', icon: 'bi-journal-text', roles: ['OWNER'], tag: 'OWNER' },
  { key: 'pinjaman', label: 'Pinjaman Uang/Emas', icon: 'bi-coin', roles: ['OWNER'], tag: 'OWNER' },
  { key: 'laporan', label: 'Laporan & Rekap', icon: 'bi-bar-chart-line', roles: ['OWNER','KARYAWAN'] },
  { key: 'karyawan', label: 'Kelola Karyawan', icon: 'bi-people', roles: ['OWNER'], tag: 'OWNER' },
  { key: 'approval', label: 'Persetujuan & Notifikasi', icon: 'bi-bell', roles: ['OWNER','KARYAWAN'] },
  { key: 'pengaturan', label: 'Pengaturan Toko', icon: 'bi-gear', roles: ['OWNER'], tag: 'OWNER' }
];

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
// Jaring pengaman kedua: kalau karena sebab apa pun (CDN lambat, dsb)
// overlay masih tampil setelah 8 detik, paksa tampilkan layar login.
setTimeout(() => {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay && !overlay.classList.contains('hidden')) {
    hideLoadingOverlay();
    if (document.getElementById('appShell').style.display !== 'flex') {
      document.getElementById('loginScreen').style.display = 'flex';
    }
  }
}, 8000);

document.addEventListener('DOMContentLoaded', () => {
  try {
    const savedTheme = safeGet('permata_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedToken = safeGet('permata_token');
    const savedUserRaw = safeGet('permata_user');

    try { detectLocationForLogin(); } catch (e) { /* lokasi opsional saat login, jangan sampai macetkan app */ }

    if (savedToken && savedUserRaw) {
      try {
        AppState.token = savedToken;
        AppState.user = JSON.parse(savedUserRaw);
        bootApp();
      } catch (e) {
        // sesi tersimpan rusak/tidak valid -> paksa ke layar login
        safeRemove('permata_token'); safeRemove('permata_user');
        hideLoadingOverlay();
        document.getElementById('loginScreen').style.display = 'flex';
      }
    } else {
      hideLoadingOverlay();
      document.getElementById('loginScreen').style.display = 'flex';
    }
  } catch (err) {
    // Jaring pengaman utama: apa pun yang gagal di atas, tetap tampilkan login
    hideLoadingOverlay();
    document.getElementById('loginScreen').style.display = 'flex';
    console.error('Init error:', err);
  }
});

function hideLoadingOverlay() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

function detectLocationForLogin() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    AppState.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    document.getElementById('locTitle').textContent = 'Lokasi Terverifikasi';
    document.getElementById('locSub').textContent = `Akurasi ±${Math.round(pos.coords.accuracy)}m`;
  }, () => {
    document.getElementById('locTitle').textContent = 'Lokasi tidak terdeteksi';
    document.getElementById('locSub').textContent = 'Absensi tetap memerlukan izin lokasi nanti';
  });
}

// ════════════════════════════════════════════════════════
// LOGIN / LOGOUT
// ════════════════════════════════════════════════════════
function switchLoginTab(role) {
  AppState.loginRole = role;
  document.getElementById('tabKaryawan').classList.toggle('active', role === 'KARYAWAN');
  document.getElementById('tabOwner').classList.toggle('active', role === 'OWNER');
}

function toggleEye(el) {
  const input = el.parentElement.querySelector('input');
  input.type = input.type === 'password' ? 'text' : 'password';
  el.classList.toggle('bi-eye');
  el.classList.toggle('bi-eye-slash');
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('btnLogin');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-inline"></span> Memverifikasi...';

  const res = await callApi('login', { username, password });

  btn.disabled = false;
  btn.innerHTML = 'Masuk Sekarang <i class="bi bi-arrow-right"></i>';
  if (res.success) {
    AppState.token = res.data.token;
    AppState.user = res.data.user;
    safeSet('permata_token', AppState.token);
    safeSet('permata_user', JSON.stringify(AppState.user));
    document.getElementById('loginScreen').style.display = 'none';
    bootApp();
  } else {
    showToast('Login Gagal', res.message, 'danger');
  }
}

function handleLogout() {
  callApi('logout', { token: AppState.token });
  safeRemove('permata_token');
  safeRemove('permata_user');
  stopCamera();
  location.reload();
}

// Dipanggil setiap kali panggilan API gagal karena sesi habis
function handleAuthError(message) {
  if (message === 'SESSION_EXPIRED') {
    showToast('Sesi Berakhir', 'Silakan login kembali.', 'warning');
    setTimeout(handleLogout, 1200);
    return true;
  }
  return false;
}

// Dipakai di setiap loader data: kalau sesi habis -> arahkan ke login;
// kalau gagal karena sebab lain -> tampilkan alasannya (jangan diam saja).
function handleLoadError(message) {
  if (!handleAuthError(message)) {
    showToast('Gagal Memuat Data', message || 'Terjadi kesalahan tak terduga.', 'danger');
  }
}

// ════════════════════════════════════════════════════════
// BOOT APP SETELAH LOGIN
// ════════════════════════════════════════════════════════
function bootApp() {
  document.getElementById('appShell').style.display = 'flex';
  renderSidebar();
  renderUserBlocks();
  pasangSemuaFormatterRupiah();
  hideLoadingOverlay();
  navigateTo('dashboard');
  loadNotifBadge();
  muatConfigCacheUntukStruk();
  setInterval(loadNotifBadge, 30000); // polling ringan tiap 30 detik
}

// Nama/alamat toko dipakai di struk cetak & WA -- dimuat sekali di awal
// supaya Karyawan (tanpa akses menu Pengaturan) tetap dapat struk yang benar.
async function muatConfigCacheUntukStruk() {
  const res = await callApi('getAllConfig', { token: AppState.token });
  if (res.success) AppState.configCache = res.data;
}

function renderSidebar() {
  const role = AppState.user.role;
  const items = MENU_ITEMS.filter(m => m.roles.includes(role));
  const html = items.map(m => {
    const tagHtml = m.tag ? ('<span class="fw-chip" style="margin-left:auto;font-size:9px;padding:2px 7px;">' + m.tag + '</span>') : '';
    return '<li><a href="javascript:void(0)" class="nav-link" data-section="' + m.key + '" onclick="navigateTo(\'' + m.key + '\')">'
      + '<i class="bi ' + m.icon + '"></i> <span>' + m.label + '</span>' + tagHtml + '</a></li>';
  }).join('');
  document.getElementById('sidebarNav').innerHTML = html;
  document.getElementById('mobileMenuNav').innerHTML = items.map(m => `
    <li style="margin-bottom:4px;"><a href="javascript:void(0)" class="nav-link" onclick="navigateTo('${m.key}');closeModal('modalMobileMenu')">
      <i class="bi ${m.icon}"></i> <span>${m.label}</span>
    </a></li>
  `).join('') + `<li style="margin-top:10px;border-top:1px solid var(--gold-border);padding-top:10px;">
      <a href="javascript:void(0)" class="nav-link" style="color:var(--status-danger);" onclick="handleLogout()">
        <i class="bi bi-box-arrow-left"></i> <span>Keluar</span></a></li>`;
}

function renderUserBlocks() {
  const u = AppState.user;
  const initials = u.nama.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const avatarHtml = u.fotoUrl
    ? `<img src="${u.fotoUrl}" class="avatar">`
    : `<div class="avatar-fallback">${initials}</div>`;
  document.getElementById('avatarM').innerHTML = avatarHtml;
  document.getElementById('userBlockD').innerHTML = `
    ${avatarHtml}
    <div>
      <div style="font-weight:700;font-size:13px;">${u.nama}</div>
      <div style="font-size:11px;color:var(--text-secondary);">${u.role === 'OWNER' ? 'Owner / Administrator' : 'Karyawan'}</div>
    </div>`;
}

// ════════════════════════════════════════════════════════
// NAVIGASI SPA (tanpa URL berubah — aman untuk iframe)
// ════════════════════════════════════════════════════════
const PAGE_TITLES = {
  dashboard: 'Dashboard Operasional', kasir: 'Kasir Transaksi', stok: 'Persediaan Etalase',
  kas: 'Kas Laci Kasir', brankas: 'Saldo Brankas', bank: 'Rekening Bank & QRIS',
  absen: 'Absensi & Izin', piutang: 'Piutang & Hutang', pinjaman: 'Pinjaman Uang/Emas',
  laporan: 'Laporan & Rekap', karyawan: 'Kelola Karyawan', approval: 'Persetujuan & Notifikasi',
  pengaturan: 'Pengaturan Toko'
};

function navigateTo(page) {
  const allowed = MENU_ITEMS.find(m => m.key === page);
  if (allowed && !allowed.roles.includes(AppState.user.role)) {
    showToast('Akses Ditolak', 'Menu ini khusus Owner.', 'danger');
    return;
  }
  AppState.currentPage = page;
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById('section-' + page);
  if (sec) sec.classList.add('active');

  document.querySelectorAll('.nav-link[data-section]').forEach(a => a.classList.toggle('active', a.dataset.section === page));
  document.querySelectorAll('.bnav-item[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === page));

  document.getElementById('mTitle').textContent = PAGE_TITLES[page] || page;
  document.getElementById('dTitle').textContent = PAGE_TITLES[page] || page;

  if (page === 'absen') startCamera(); else stopCamera();

  const loaders = {
    dashboard: loadDashboard, kasir: loadKasir, stok: loadStok, kas: loadKas,
    brankas: loadBrankas, bank: loadBank, absen: loadAbsen, piutang: loadPiutang,
    pinjaman: loadPinjaman, karyawan: loadKaryawan, approval: loadApproval, pengaturan: loadPengaturan
  };
  if (loaders[page]) loaders[page]();
}

function openMobileMenu() { openModal('modalMobileMenu'); }

// ════════════════════════════════════════════════════════
// MODAL HELPERS
// ════════════════════════════════════════════════════════
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
document.addEventListener('click', e => {
  if (e.target.classList && e.target.classList.contains('modal-overlay')) e.target.classList.remove('show');
});

// ════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════
function showToast(title, body, type) {
  const icons = { success: 'bi-check-circle-fill', danger: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill' };
  const el = document.createElement('div');
  el.className = 'toast-item ' + (type || 'success');
  el.innerHTML = `<i class="bi ${icons[type] || icons.success}"></i>
    <div><div class="toast-title">${title}</div><div class="toast-body">${body || ''}</div></div>`;
  document.getElementById('toastWrap').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3800);
}

function formatRp(n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }
function formatTgl(s) { return s ? String(s).slice(0, 16).replace('T', ' ') : '-'; }

// ════════════════════════════════════════════════════════
// AUTO-FORMAT RUPIAH — dipasang ke semua input nominal supaya
// saat mengetik "20000000" otomatis tampil "20.000.000".
// Nilai mentah untuk dikirim ke server diambil lewat getRawNumber().
// ════════════════════════════════════════════════════════
function formatRibuan(angka) {
  const digitSaja = String(angka).replace(/\D/g, '');
  return digitSaja.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function attachRupiahFormatter(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    const digitSaja = el.value.replace(/\D/g, '');
    el.value = digitSaja ? formatRibuan(digitSaja) : '';
    if (el.id === 'trxNominal') updateApprovalHint();
  });
}
function getRawNumber(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  return Number(String(el.value).replace(/\D/g, '')) || 0;
}
const RUPIAH_INPUT_IDS = [
  'trxNominal', 'stokHargaModal', 'stokHargaJual', 'tutupKasFisik',
  'setorBrankasNominal', 'tarikBrankasNominal', 'setorBankNominal', 'tarikBankNominal', 'recTotal'
];
function pasangSemuaFormatterRupiah() {
  RUPIAH_INPUT_IDS.forEach(attachRupiahFormatter);
}

function toggleDarkMode() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  safeSet('permata_theme', next);
}

// ════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════
async function loadDashboard() {
  const res = await callApi('getDashboardData', { token: AppState.token });
  if (!res.success) { if (!handleAuthError(res.message)) showToast('Error', res.message, 'danger'); return; }
  AppState.dashboardData = res.data;
  renderDashboard(res.data);
}

function renderDashboard(d) {
  document.getElementById('kpiOmzet').textContent = formatRp(d.omzetHariIni);
  const kemarin = d.tren[d.tren.length - 2] ? d.tren[d.tren.length - 2].total : 0;
  const pct = kemarin > 0 ? (((d.omzetHariIni - kemarin) / kemarin) * 100).toFixed(1) : 0;
  const trendEl = document.getElementById('kpiTrend');
  trendEl.innerHTML = `<i class="bi bi-graph-up-arrow"></i> ${pct >= 0 ? '+' : ''}${pct}%`;
  trendEl.className = 'badge-pill ' + (pct >= 0 ? 'badge-success' : 'badge-danger');

  let kpis = `
    <div class="card">
      <div class="card-row"><div class="card-icon"><i class="bi bi-wallet2 text-gold"></i></div></div>
      <div class="kpi-label">Kas Laci</div><div class="kpi-value">${formatRp(d.kasLaci)}</div>
    </div>
    <div class="card">
      <div class="card-row"><div class="card-icon"><i class="bi bi-gem text-gold"></i></div></div>
      <div class="kpi-label">Berat Terjual</div><div class="kpi-value">${d.beratTerjual.toFixed(2)} gr</div>
    </div>
    <div class="card">
      <div class="card-row"><div class="card-icon"><i class="bi bi-arrow-repeat text-gold"></i></div></div>
      <div class="kpi-label">Buyback</div><div class="kpi-value">${d.beratBuyback.toFixed(2)} gr</div>
      <div class="kpi-sub">Dana keluar ${formatRp(d.danaBuyback)}</div>
    </div>`;
  if (AppState.user.role === 'OWNER') {
    kpis += `
    <div class="card">
      <div class="card-row"><div class="card-icon"><i class="bi bi-safe text-gold"></i></div></div>
      <div class="kpi-label">Saldo Brankas</div><div class="kpi-value">${formatRp(d.brankas)}</div>
    </div>
    <div class="card">
      <div class="card-row"><div class="card-icon"><i class="bi bi-bank text-gold"></i></div></div>
      <div class="kpi-label">Saldo Bank</div><div class="kpi-value">${formatRp(d.bank)}</div>
    </div>
    <div class="card">
      <div class="card-row"><div class="card-icon"><i class="bi bi-receipt text-gold"></i></div></div>
      <div class="kpi-label">Biaya Operasional</div><div class="kpi-value">${formatRp(d.biayaOps)}</div>
    </div>`;
  } else {
    kpis += `
    <div class="card">
      <div class="card-row"><div class="card-icon"><i class="bi bi-people text-gold"></i></div></div>
      <div class="kpi-label">Staf Hadir</div><div class="kpi-value">${d.hadirHariIni}/${d.totalKaryawan}</div>
    </div>`;
  }
  document.getElementById('dashKpiGrid').innerHTML = kpis;

  const pendingTotal = (d.pendingApproval || 0) + (d.pendingIzin || 0);
  document.getElementById('cardOtorisasi').style.display = (AppState.user.role === 'OWNER' && pendingTotal > 0) ? 'block' : 'none';
  document.getElementById('pendingCount').textContent = pendingTotal + ' Permintaan';

  renderTrenChart(d.tren);
  renderKomposisiChart(d.komposisi);
}

function renderTrenChart(tren) {
  const ctx = document.getElementById('chartTren');
  if (chartInstances.tren) chartInstances.tren.destroy();
  chartInstances.tren = new Chart(ctx, {
    type: 'line',
    data: {
      labels: tren.map(t => t.tanggal.slice(5)),
      datasets: [{ data: tren.map(t => t.total), borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.15)',
        fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#D4AF37' }]
    },
    options: { plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: '#94A3B8' }, grid: { display: false } },
        y: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } } } }
  });
}

function renderKomposisiChart(komp) {
  const ctx = document.getElementById('chartKomposisi');
  if (chartInstances.komposisi) chartInstances.komposisi.destroy();
  const labels = Object.keys(komp).filter(k => komp[k] > 0);
  const values = labels.map(k => komp[k]);
  chartInstances.komposisi = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values.length ? values : [1], backgroundColor: ['#D4AF37', '#94A3B8', '#48E5D0'], borderWidth: 0 }] },
    options: { plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8', padding: 10 } } } }
  });
}

// ════════════════════════════════════════════════════════
// KASIR — TRANSAKSI
// ════════════════════════════════════════════════════════
async function loadKasir() {
  const resTrx = await callApi('getAllData', { token: AppState.token, sheetName: 'Transactions' });
  if (resTrx.success) { AppState.listCache.trx = resTrx.data.reverse(); renderTrxList(); }
  else handleLoadError(resTrx.message);

  const resInv = await callApi('getAllData', { token: AppState.token, sheetName: 'Inventory' });
  if (resInv.success) {
    const stokTersedia = resInv.data.filter(i => i.Status === 'STOK');
    AppState.listCache.inventoryStok = stokTersedia;
    document.getElementById('trxItemId').innerHTML = stokTersedia.map(i =>
      `<option value="${i.ID}">${i.Jenis} ${i.Logam} ${i.Kadar} - ${i.Berat}gr (${formatRp(i.HargaJual)})</option>`
    ).join('') || '<option value="">Tidak ada stok</option>';
  } else handleLoadError(resInv.message);
}

function filterTrx(f, el) {
  AppState.trxFilter = f;
  document.querySelectorAll('#section-kasir .pill-filter').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  renderTrxList();
}

function renderTrxList() {
  let list = AppState.listCache.trx || [];
  if (AppState.trxFilter !== 'ALL') list = list.filter(t => t.Jenis === AppState.trxFilter);
  if (!list.length) { document.getElementById('listTransaksi').innerHTML = emptyState('bi-receipt', 'Belum ada transaksi.'); return; }

  document.getElementById('listTransaksi').innerHTML = list.slice(0, 60).map(t => {
    const isMasuk = (t.Jenis === 'PENJUALAN' || t.Jenis === 'JASA');
    const badge = t.Status === 'SUKSES'
      ? '<span class="badge-pill badge-success"><span class="badge-dot"></span> Sukses</span>'
      : '<span class="badge-pill badge-danger"><span class="badge-dot"></span> Dibatalkan</span>';
    const batalBtn = t.Status === 'SUKSES'
      ? '<div style="margin-top:8px;"><button class="btn btn-ghost btn-sm" onclick="openBatalModal(\'' + t.ID + '\')"><i class="bi bi-x-circle"></i> Batalkan/Edit</button></div>'
      : '';
    return `
    <div class="card" style="margin-bottom:10px;">
      <div class="flex-between">
        <div>
          <div style="font-weight:700;font-size:14px;">${t.Kategori || t.Jenis} ${t.Berat ? t.Berat + 'gr' : ''}</div>
          <div class="kpi-sub">${formatTgl(t.Waktu)} &bull; ${t.MetodeBayar} &bull; ${t.Operator}</div>
        </div>
        <div style="text-align:right;">
          <div class="mono" style="font-weight:700;color:${isMasuk ? 'var(--status-success)' : 'var(--status-danger)'};">
            ${isMasuk ? '+' : '-'}${formatRp(t.Nominal)}</div>
          ${badge}
        </div>
      </div>
      ${batalBtn}
    </div>`;
  }).join('');
}

function emptyState(icon, text) { return `<div class="empty-state"><i class="bi ${icon}"></i>${text}</div>`; }

function onTrxJenisChange() {
  const jenis = document.getElementById('trxJenis').value;
  document.getElementById('trxItemWrap').style.display = (jenis === 'PENJUALAN' || jenis === 'BUYBACK') ? 'block' : 'none';
  perbaruiTampilanBuktiFoto();
  updateApprovalHint();
}
function onTrxMetodeChange() {
  perbaruiTampilanBuktiFoto();
}

// Buyback WAJIB foto (nota/KTP pembeli/foto perhiasan) apa pun metode
// bayarnya; Transfer/QRIS/EDC juga wajib foto bukti seperti sebelumnya.
function perbaruiTampilanBuktiFoto() {
  const jenis = document.getElementById('trxJenis').value;
  const metode = document.getElementById('trxMetode').value;
  const wajibFoto = (metode === 'TRANSFER' || jenis === 'BUYBACK');
  document.getElementById('trxTransferFields').style.display = wajibFoto ? 'block' : 'none';
  // Rekening tujuan hanya relevan untuk pembayaran transfer, bukan buyback tunai
  document.getElementById('trxRekeningWrap').style.display = (metode === 'TRANSFER') ? 'block' : 'none';
  document.getElementById('trxBuktiLabel').textContent = jenis === 'BUYBACK'
    ? 'Foto Nota / KTP Pembeli / Perhiasan (wajib)'
    : 'Bukti Transfer (wajib)';
  document.getElementById('trxBuktiHelpText').textContent = jenis === 'BUYBACK'
    ? 'Ketuk untuk unggah foto nota, KTP pembeli, atau foto perhiasan'
    : 'Ketuk untuk unggah foto bukti transfer';
}

// Hint real-time: pengeluaran operasional >= Rp20.000.000 akan ditahan
// untuk persetujuan Owner (hanya relevan untuk peran Karyawan).
function updateApprovalHint() {
  const jenis = document.getElementById('trxJenis').value;
  const nominal = getRawNumber('trxNominal');
  const perluApproval = jenis === 'PENGELUARAN_OPS' && AppState.user.role !== 'OWNER' && nominal >= 20000000;
  document.getElementById('trxApprovalHint').style.display = perluApproval ? 'block' : 'none';
}

function previewBukti(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    AppState.trxBuktiBase64 = reader.result.split(',')[1];
    AppState.trxBuktiFileName = 'bukti_' + Date.now() + '.jpg';
    document.getElementById('trxBuktiPreviewWrap').innerHTML = `<img src="${reader.result}" style="max-height:100px;border-radius:8px;margin-top:8px;">`;
  };
  reader.readAsDataURL(file);
}

async function simpanTransaksi() {
  const jenis = document.getElementById('trxJenis').value;
  const metode = document.getElementById('trxMetode').value;
  const btn = document.getElementById('btnSimpanTrx');
  const wajibFoto = (metode === 'TRANSFER' || jenis === 'BUYBACK');

  const doSubmit = async (buktiUrl) => {
    const trxSnapshot = {
      jenis, logam: document.getElementById('trxLogam').value,
      kategori: document.getElementById('trxKategori').value,
      berat: document.getElementById('trxBerat').value,
      nominal: getRawNumber('trxNominal'),
      metodeBayar: metode, rekening: document.getElementById('trxRekening').value,
      buktiTransferURL: buktiUrl || '', itemId: document.getElementById('trxItemId').value,
      catatan: document.getElementById('trxCatatan').value
    };
    btn.disabled = true; btn.innerHTML = '<span class="spinner-inline"></span> Menyimpan...';
    const res = await callApi('recordTransaction', { token: AppState.token, trx: trxSnapshot });
    btn.disabled = false; btn.innerHTML = 'Simpan Transaksi';
    if (res.success) {
      showToast('Berhasil', res.message, 'success');
      closeModal('modalTransaksi');
      document.getElementById('formTransaksi').reset();
      AppState.trxBuktiBase64 = null;
      document.getElementById('trxBuktiPreviewWrap').innerHTML = '';
      document.getElementById('trxApprovalHint').style.display = 'none';
      loadKasir(); loadDashboard();
      if (!res.data || !res.data.pendingApproval) {
        tampilkanStrukBerhasil(trxSnapshot);
      }
    } else { showToast('Gagal', res.message, 'danger'); }
  };

  if (wajibFoto) {
    if (!AppState.trxBuktiBase64) {
      const pesan = jenis === 'BUYBACK'
        ? 'Foto nota/KTP pembeli/foto perhiasan wajib diunggah untuk Buyback.'
        : 'Foto bukti transfer wajib diunggah.';
      showToast('Peringatan', pesan, 'warning'); return;
    }
    btn.disabled = true; btn.innerHTML = '<span class="spinner-inline"></span> Mengunggah bukti...';
    const resUpload = await callApi('uploadBuktiTransfer', { token: AppState.token, fileData: AppState.trxBuktiBase64, fileName: AppState.trxBuktiFileName });
    if (resUpload.success) {
      await doSubmit(resUpload.data.fileUrl);
    } else {
      btn.disabled = false; btn.innerHTML = 'Simpan Transaksi';
      showToast('Gagal Unggah', resUpload.message, 'danger');
    }
  } else {
    await doSubmit('');
  }
}

// ════════════════════════════════════════════════════════
// STRUK — tampilan ringkasan + cetak thermal + kirim WhatsApp
// ════════════════════════════════════════════════════════
function tampilkanStrukBerhasil(trx) {
  AppState.lastTrx = trx;
  const waktu = new Date().toLocaleString('id-ID');
  const baratRow = trx.berat ? ('<tr><td>Berat</td><td style="text-align:right;">' + trx.berat + ' gr</td></tr>') : '';
  document.getElementById('strukRingkasanBody').innerHTML = `
    <table>
      <tr><td>Jenis</td><td style="text-align:right;">${trx.jenis}</td></tr>
      <tr><td>Keterangan</td><td style="text-align:right;">${trx.kategori || '-'}</td></tr>
      ${baratRow}
      <tr><td>Metode</td><td style="text-align:right;">${trx.metodeBayar}</td></tr>
      <tr><td><b>Total</b></td><td style="text-align:right;"><b>${formatRp(trx.nominal)}</b></td></tr>
      <tr><td colspan="2" class="kpi-sub">${waktu}</td></tr>
    </table>`;
  openModal('modalStrukBerhasil');
}

function cetakStruk() {
  const trx = AppState.lastTrx;
  if (!trx) return;
  const waktu = new Date().toLocaleString('id-ID');
  const namaToko = (AppState.configCache && AppState.configCache.namaToko) || 'Toko Emas & Perak Permata';
  const alamatToko = (AppState.configCache && AppState.configCache.alamatToko) || 'Nabire';
  const baratRow = trx.berat ? ('<tr><td>Berat: ' + trx.berat + ' gr</td></tr>') : '';
  document.getElementById('strukPrintArea').innerHTML = `
    <div class="struk-center"><b>${namaToko}</b><br>${alamatToko}</div>
    <div class="struk-line"></div>
    <table>
      <tr><td>${waktu}</td></tr>
      <tr><td>Kasir: ${AppState.user.nama}</td></tr>
    </table>
    <div class="struk-line"></div>
    <table>
      <tr><td>${trx.jenis}${trx.kategori ? ' - ' + trx.kategori : ''}</td></tr>
      ${baratRow}
      <tr><td>Metode: ${trx.metodeBayar}</td></tr>
    </table>
    <div class="struk-line"></div>
    <table><tr><td class="struk-total">TOTAL</td><td class="struk-total" style="text-align:right;">${formatRp(trx.nominal)}</td></tr></table>
    <div class="struk-line"></div>
    <div class="struk-center">Terima kasih atas kepercayaan Anda</div>`;

  // Pasang ukuran kertas thermal 80mm hanya untuk sesi print ini,
  // lalu lepas lagi supaya tidak mengganggu cetak Laporan biasa.
  const pageStyle = document.createElement('style');
  pageStyle.id = 'strukPageStyle';
  pageStyle.textContent = '@page { size: 80mm auto; margin: 2mm; }';
  document.head.appendChild(pageStyle);
  document.body.classList.add('printing-struk');

  const bersihkan = () => {
    document.body.classList.remove('printing-struk');
    const el = document.getElementById('strukPageStyle');
    if (el) el.remove();
    window.removeEventListener('afterprint', bersihkan);
  };
  window.addEventListener('afterprint', bersihkan);
  setTimeout(() => { window.print(); }, 50);
}

function kirimStrukWA() {
  const trx = AppState.lastTrx;
  if (!trx) return;
  const namaToko = (AppState.configCache && AppState.configCache.namaToko) || 'Toko Emas & Perak Permata';
  const teks = `*${namaToko}*\n` +
    `${trx.jenis}${trx.kategori ? ' - ' + trx.kategori : ''}\n` +
    (trx.berat ? `Berat: ${trx.berat} gr\n` : '') +
    `Metode: ${trx.metodeBayar}\n` +
    `*Total: ${formatRp(trx.nominal)}*\n\n` +
    `Terima kasih atas kepercayaan Anda.`;
  window.open('https://wa.me/?text=' + encodeURIComponent(teks), '_blank');
}

function openBatalModal(id) {
  document.getElementById('batalTrxId').value = id;
  document.getElementById('batalAlasan').value = '';
  openModal('modalBatalTrx');
}

async function kirimPembatalan() {
  const id = document.getElementById('batalTrxId').value;
  const alasan = document.getElementById('batalAlasan').value;
  if (!alasan) { showToast('Peringatan', 'Alasan wajib diisi.', 'warning'); return; }
  const res = await callApi('ajukanPembatalan', { token: AppState.token, transaksiId: id, alasan, jenisPengajuan: 'BATAL', dataBaru: null });
  if (res.success) { showToast('Berhasil', res.message, 'success'); closeModal('modalBatalTrx'); loadKasir(); loadDashboard(); }
  else showToast('Gagal', res.message, 'danger');
}

// ════════════════════════════════════════════════════════
// STOK ETALASE
// ════════════════════════════════════════════════════════
async function loadStok() {
  const res = await callApi('getAllData', { token: AppState.token, sheetName: 'Inventory' });
  if (res.success) { AppState.listCache.stok = res.data.reverse(); renderStokTable(); }
  else handleLoadError(res.message);
  document.getElementById('stokModalWrap').style.display = AppState.user.role === 'OWNER' ? 'block' : 'none';
}

function filterStok(f, el) {
  AppState.stokFilter = f;
  document.querySelectorAll('#section-stok .pill-filter').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  renderStokTable();
}

function renderStokTable() {
  let list = AppState.listCache.stok || [];
  if (['EMAS', 'PERAK'].includes(AppState.stokFilter)) list = list.filter(i => i.Logam === AppState.stokFilter);
  if (['STOK', 'TERJUAL'].includes(AppState.stokFilter)) list = list.filter(i => i.Status === AppState.stokFilter);
  const isOwner = AppState.user.role === 'OWNER';
  const rows = list.map(i => `
    <tr>
      <td>${i.Jenis}</td><td>${i.Logam} ${i.Kadar}</td><td class="mono">${Number(i.Berat).toFixed(2)} gr</td>
      <td class="mono">${isOwner ? formatRp(i.HargaModal) : '•••'}</td><td class="mono">${formatRp(i.HargaJual)}</td>
      <td>${i.Status === 'STOK' ? '<span class="badge-pill badge-success">Stok</span>' : '<span class="badge-pill badge-danger">Terjual</span>'}</td>
    </tr>`).join('');
  document.querySelector('#tableStok tbody').innerHTML = rows || `<tr><td colspan="6">${emptyState('bi-box', 'Belum ada stok.')}</td></tr>`;
}

async function simpanStok() {
  const item = {
    logam: document.getElementById('stokLogam').value, jenis: document.getElementById('stokJenis').value,
    kadar: document.getElementById('stokKadar').value, berat: document.getElementById('stokBerat').value,
    hargaModal: getRawNumber('stokHargaModal'), hargaJual: getRawNumber('stokHargaJual'),
    dibayarDari: document.getElementById('stokDibayarDari').value, rekening: document.getElementById('stokRekening').value
  };
  const res = await callApi('tambahStok', { token: AppState.token, item });
  if (res.success) { showToast('Berhasil', res.message, 'success'); closeModal('modalStok'); loadStok(); }
  else showToast('Gagal', res.message, 'danger');
}

// ════════════════════════════════════════════════════════
// KAS LACI
// ════════════════════════════════════════════════════════
async function loadKas() {
  const resSaldo = await callApi('getSaldoRingkasan', { token: AppState.token });
  if (resSaldo.success) document.getElementById('kasLaciValue').textContent = formatRp(resSaldo.data.kasLaci);

  const res = await callApi('getAllData', { token: AppState.token, sheetName: 'CashLedger' });
  if (!res.success) { handleLoadError(res.message); return; }
  const rows = res.data.reverse().slice(0, 60).map(r => `
      <tr><td>${formatTgl(r.Waktu)}</td>
        <td><span class="badge-pill ${r.Arah === 'MASUK' ? 'badge-success' : 'badge-danger'}">${r.Arah}</span></td>
        <td class="mono">${formatRp(r.Nominal)}</td><td>${r.Sumber}</td><td class="mono">${formatRp(r.Saldo)}</td></tr>`).join('');
  document.querySelector('#tableKas tbody').innerHTML = rows || `<tr><td colspan="5">${emptyState('bi-wallet2', 'Belum ada mutasi kas.')}</td></tr>`;
}

function hitungSelisihKas() {
  const sistem = Number((document.getElementById('tutupKasSistemValue').textContent || '0').replace(/\D/g, ''));
  const fisik = getRawNumber('tutupKasFisik');
  const selisih = fisik - sistem;
  const wrap = document.getElementById('selisihKasWrap');
  wrap.style.display = 'block';
  const status = selisih === 0 ? 'SESUAI' : (selisih > 0 ? 'LEBIH' : 'KURANG');
  const cls = selisih === 0 ? 'badge-success' : (selisih > 0 ? 'badge-warning' : 'badge-danger');
  wrap.innerHTML = `<span class="badge-pill ${cls}">${status}: ${formatRp(Math.abs(selisih))}</span>`;
}

async function simpanTutupKas() {
  const fisik = getRawNumber('tutupKasFisik');
  const catatan = document.getElementById('tutupKasCatatan').value;
  const res = await callApi('tutupKas', { token: AppState.token, uangFisik: fisik, catatan });
  if (res.success) { showToast('Tutup Kas Tersimpan', res.message, 'success'); closeModal('modalTutupKas'); loadKas(); }
  else showToast('Gagal', res.message, 'danger');
}
// isi nilai sistem saat modal dibuka
document.addEventListener('click', e => {
  if (e.target.closest('[onclick="openModal(\'modalTutupKas\')"]')) {
    const v = document.getElementById('kasLaciValue').textContent;
    document.getElementById('tutupKasSistemValue').textContent = v;
  }
});

// ════════════════════════════════════════════════════════
// BRANKAS (OWNER)
// ════════════════════════════════════════════════════════
async function loadBrankas() {
  const resSaldo = await callApi('getSaldoRingkasan', { token: AppState.token });
  if (resSaldo.success) {
    document.getElementById('vaultKasValue').textContent = formatRp(resSaldo.data.kasLaci);
    document.getElementById('vaultBrankasValue').textContent = formatRp(resSaldo.data.brankas);
  }

  const res = await callApi('getAllData', { token: AppState.token, sheetName: 'VaultTransactions' });
  if (!res.success) { handleLoadError(res.message); return; }
  const rows = res.data.reverse().slice(0, 60).map(r => `
      <tr><td>${formatTgl(r.Waktu)}</td>
        <td><span class="badge-pill ${r.Arah === 'SETOR_KE_BRANKAS' ? 'badge-warning' : 'badge-success'}">${r.Arah.replace(/_/g, ' ')}</span></td>
        <td class="mono">${formatRp(r.Nominal)}</td><td>${r.Catatan || '-'}</td><td>${r.Oleh}</td></tr>`).join('');
  document.querySelector('#tableBrankas tbody').innerHTML = rows || `<tr><td colspan="5">${emptyState('bi-safe', 'Belum ada mutasi brankas.')}</td></tr>`;
}

async function prosesSetorBrankas() {
  const nominal = getRawNumber('setorBrankasNominal');
  const catatan = document.getElementById('setorBrankasCatatan').value;
  const res = await callApi('setorKeBrankas', { token: AppState.token, nominal, catatan });
  if (res.success) { showToast('Berhasil', res.message, 'success'); closeModal('modalSetorBrankas'); loadBrankas(); loadDashboard(); }
  else showToast('Gagal', res.message, 'danger');
}
async function prosesTarikBrankas() {
  const nominal = getRawNumber('tarikBrankasNominal');
  const catatan = document.getElementById('tarikBrankasCatatan').value;
  const res = await callApi('tarikKeLaci', { token: AppState.token, nominal, catatan });
  if (res.success) { showToast('Berhasil', res.message, 'success'); closeModal('modalTarikBrankas'); loadBrankas(); loadDashboard(); }
  else showToast('Gagal', res.message, 'danger');
}

// ════════════════════════════════════════════════════════
// BANK (OWNER)
// ════════════════════════════════════════════════════════
async function loadBank() {
  const resSaldo = await callApi('getSaldoRingkasan', { token: AppState.token });
  if (resSaldo.success) document.getElementById('bankSaldoValue').textContent = formatRp(resSaldo.data.bank);

  const res = await callApi('getAllData', { token: AppState.token, sheetName: 'BankTransactions' });
  if (!res.success) { handleLoadError(res.message); return; }
  const rows = res.data.reverse().slice(0, 60).map(r => `
      <tr><td>${formatTgl(r.Waktu)}</td><td>${r.Rekening}</td>
        <td><span class="badge-pill ${r.Arah === 'MASUK' ? 'badge-success' : 'badge-danger'}">${r.Arah}</span></td>
        <td class="mono">${formatRp(r.Nominal)}</td><td>${r.Sumber}</td><td class="mono">${formatRp(r.Saldo)}</td></tr>`).join('');
  document.querySelector('#tableBank tbody').innerHTML = rows || `<tr><td colspan="6">${emptyState('bi-bank', 'Belum ada mutasi bank.')}</td></tr>`;
}
async function prosesSetorBank() {
  const res = await callApi('setorKasKeBank', {
    token: AppState.token,
    nominal: getRawNumber('setorBankNominal'),
    rekening: document.getElementById('setorBankRekening').value,
    catatan: ''
  });
  if (res.success) { showToast('Berhasil', res.message, 'success'); closeModal('modalSetorBank'); loadBank(); loadDashboard(); }
  else showToast('Gagal', res.message, 'danger');
}
async function prosesTarikBank() {
  const res = await callApi('tarikBankKeKas', {
    token: AppState.token,
    nominal: getRawNumber('tarikBankNominal'),
    rekening: document.getElementById('tarikBankRekening').value,
    catatan: ''
  });
  if (res.success) { showToast('Berhasil', res.message, 'success'); closeModal('modalTarikBank'); loadBank(); loadDashboard(); }
  else showToast('Gagal', res.message, 'danger');
}

// ════════════════════════════════════════════════════════
// ABSENSI — KAMERA + GPS
// ════════════════════════════════════════════════════════
// Catatan: banyak browser MEMBLOKIR getUserMedia yang dipanggil otomatis
// tanpa klik pengguna. Karena itu startCamera() dicoba otomatis saat
// masuk halaman Absen (manual=false), TAPI juga tersedia tombol
// "Aktifkan Kamera" yang memanggil startCamera(true) dengan klik asli —
// ini yang akan berhasil di browser-browser yang ketat soal izin media.
function startCamera(manual) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (manual) showToast('Kamera Tidak Didukung', 'Browser ini tidak mendukung akses kamera. Coba Chrome/Safari terbaru.', 'danger');
    return;
  }
  if (AppState.stream) { setCameraReadyUI(true); return; }

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then(stream => {
    AppState.stream = stream;
    const video = document.getElementById('cameraVideo');
    if (video) video.srcObject = stream;
    setCameraReadyUI(true);
  }).catch(err => {
    setCameraReadyUI(false);
    if (manual) {
      const pesan = (err && err.name === 'NotAllowedError')
        ? 'Izin kamera ditolak. Buka pengaturan situs di browser lalu izinkan Kamera untuk halaman ini.'
        : 'Tidak bisa mengakses kamera: ' + (err && err.message ? err.message : 'perangkat tidak ditemukan.');
      showToast('Kamera Gagal Aktif', pesan, 'danger');
    }
  });

  updateGpsBadge();
}
function setCameraReadyUI(ready) {
  const placeholder = document.getElementById('cameraPlaceholder');
  const btn = document.getElementById('btnAktifkanKamera');
  if (placeholder) placeholder.classList.toggle('hidden', ready);
  if (btn) btn.classList.toggle('camera-ready', ready);
}
function stopCamera() {
  if (AppState.stream) { AppState.stream.getTracks().forEach(t => t.stop()); AppState.stream = null; }
  setCameraReadyUI(false);
}
function updateGpsBadge() {
  const badge = document.getElementById('gpsBadge');
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    AppState.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    badge.innerHTML = `<i class="bi bi-geo-alt-fill"></i> Lokasi terdeteksi (±${Math.round(pos.coords.accuracy)}m)`;
    badge.className = 'gps-badge in';
  }, () => { badge.innerHTML = `<i class="bi bi-geo-alt"></i> Lokasi tidak terdeteksi`; badge.className = 'gps-badge out'; });
}

function capturePhotoBase64() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  canvas.width = 320; canvas.height = 320 * (video.videoHeight / video.videoWidth || 1);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
}

async function lakukanAbsen(tipe) {
  if (!AppState.gps) { showToast('Peringatan', 'Lokasi GPS belum terdeteksi.', 'warning'); return; }
  if (!AppState.stream) { showToast('Peringatan', 'Kamera belum aktif. Tekan tombol "Aktifkan Kamera" dulu.', 'warning'); return; }
  const fotoBase64 = capturePhotoBase64();
  const action = tipe === 'masuk' ? 'absenMasuk' : 'absenPulang';
  showToast('Memproses', 'Mengirim data absensi...', 'warning');
  const res = await callApi(action, { token: AppState.token, lat: AppState.gps.lat, lng: AppState.gps.lng, fotoBase64 });
  if (res.success) { showToast('Absen Berhasil', res.message, 'success'); loadAbsen(); }
  else showToast('Gagal', res.message, 'danger');
}

async function loadAbsen() {
  const res = await callApi('getAllData', { token: AppState.token, sheetName: 'Attendance' });
  if (!res.success) { handleLoadError(res.message); return; }
  let list = res.data.reverse();
  if (AppState.user.role !== 'OWNER') list = list.filter(a => a.UserID === AppState.user.id);
  const rows = list.slice(0, 40).map(a => {
    const pulangBadge = a.StatusPulang
      ? ('<span class="badge-pill ' + (a.StatusPulang === 'DALAM_RADIUS' ? 'badge-success' : 'badge-danger') + '">' + a.StatusPulang.replace(/_/g,' ') + '</span>')
      : '-';
    return `
      <tr><td>${a.Tanggal}</td><td>${a.NamaUser}</td><td>${formatTgl(a.JamMasuk)}</td>
        <td><span class="badge-pill ${a.StatusMasuk === 'DALAM_RADIUS' ? 'badge-success' : 'badge-danger'}">${(a.StatusMasuk||'').replace(/_/g,' ')}</span></td>
        <td>${a.JamPulang ? formatTgl(a.JamPulang) : '-'}</td>
        <td>${pulangBadge}</td></tr>`;
  }).join('');
  document.querySelector('#tableAbsen tbody').innerHTML = rows || `<tr><td colspan="6">${emptyState('bi-fingerprint', 'Belum ada riwayat absensi.')}</td></tr>`;
}

async function kirimIzin() {
  const jenis = document.getElementById('izinJenis').value;
  const mulai = document.getElementById('izinMulai').value;
  const selesai = document.getElementById('izinSelesai').value;
  const alasan = document.getElementById('izinAlasan').value;
  if (!alasan) { showToast('Peringatan', 'Alasan wajib diisi.', 'warning'); return; }
  const res = await callApi('ajukanIzin', { token: AppState.token, jenis, tglMulai: mulai, tglSelesai: selesai, alasan });
  if (res.success) { showToast('Berhasil', res.message, 'success'); closeModal('modalIzin'); }
  else showToast('Gagal', res.message, 'danger');
}

// ════════════════════════════════════════════════════════
// PIUTANG / HUTANG & PINJAMAN (OWNER)
// ════════════════════════════════════════════════════════
async function loadPiutang() {
  const res = await callApi('getAllData', { token: AppState.token, sheetName: 'Receivables' });
  if (!res.success) { handleLoadError(res.message); return; }
  const rows = res.data.reverse().map(r => {
    const bayarBtn = r.Status !== 'LUNAS'
      ? ('<button class="btn btn-ghost btn-sm" onclick="bayarCicilanReceivable(\'' + r.ID + '\')">Bayar</button>')
      : '';
    return `
      <tr><td>${r.Jenis}</td><td>${r.NamaPihak}</td><td class="mono">${formatRp(r.Total)}</td>
        <td class="mono">${formatRp(r.Terbayar)}</td><td class="mono">${formatRp(r.Sisa)}</td><td>${r.JatuhTempo}</td>
        <td><span class="badge-pill ${r.Status === 'LUNAS' ? 'badge-success' : 'badge-warning'}">${r.Status}</span></td>
        <td>${bayarBtn}</td></tr>`;
  }).join('');
  document.querySelector('#tablePiutang tbody').innerHTML = rows || `<tr><td colspan="8">${emptyState('bi-journal-text', 'Belum ada data.')}</td></tr>`;
}
async function bayarCicilanReceivable(id) {
  const nominal = prompt('Masukkan nominal pembayaran (Rp):');
  if (!nominal) return;
  const res = await callApi('bayarReceivable', { token: AppState.token, id, nominal });
  if (res.success) { showToast('Berhasil', res.message, 'success'); loadPiutang(); } else showToast('Gagal', res.message, 'danger');
}
async function simpanReceivable() {
  const rec = {
    jenis: document.getElementById('recJenis').value, namaPihak: document.getElementById('recNama').value,
    total: getRawNumber('recTotal'), jatuhTempo: document.getElementById('recJatuhTempo').value,
    catatan: document.getElementById('recCatatan').value
  };
  const res = await callApi('tambahReceivable', { token: AppState.token, rec });
  if (res.success) { showToast('Berhasil', res.message, 'success'); closeModal('modalReceivable'); loadPiutang(); }
  else showToast('Gagal', res.message, 'danger');
}

async function loadPinjaman() {
  const res = await callApi('getAllData', { token: AppState.token, sheetName: 'Loans' });
  if (!res.success) { handleLoadError(res.message); return; }
  const rows = res.data.reverse().map(l => `
      <tr><td>${l.Jenis.replace('_',' ')}</td><td>${l.NamaPihak}</td>
        <td class="mono">${Number(l.Jumlah).toLocaleString('id-ID')} ${l.Satuan}</td>
        <td class="mono">${Number(l.Terbayar).toLocaleString('id-ID')}</td><td class="mono">${Number(l.Sisa).toLocaleString('id-ID')}</td>
        <td>${l.JatuhTempo}</td><td><span class="badge-pill ${l.Status === 'LUNAS' ? 'badge-success' : 'badge-warning'}">${l.Status}</span></td></tr>`).join('');
  document.querySelector('#tablePinjaman tbody').innerHTML = rows || `<tr><td colspan="7">${emptyState('bi-coin', 'Belum ada data.')}</td></tr>`;
}
async function simpanLoan() {
  const loan = {
    jenis: document.getElementById('loanJenis').value, namaPihak: document.getElementById('loanNama').value,
    jumlah: document.getElementById('loanJumlah').value, satuan: document.getElementById('loanSatuan').value,
    jatuhTempo: document.getElementById('loanJatuhTempo').value, catatan: document.getElementById('loanCatatan').value
  };
  const res = await callApi('tambahLoan', { token: AppState.token, loan });
  if (res.success) { showToast('Berhasil', res.message, 'success'); closeModal('modalLoan'); loadPinjaman(); }
  else showToast('Gagal', res.message, 'danger');
}

// ════════════════════════════════════════════════════════
// LAPORAN
// ════════════════════════════════════════════════════════
async function muatLaporan() {
  const mulai = document.getElementById('lapTglMulai').value;
  const selesai = document.getElementById('lapTglSelesai').value;
  if (!mulai || !selesai) { showToast('Peringatan', 'Pilih rentang tanggal.', 'warning'); return; }

  const res = await callApi('getLaporan', { token: AppState.token, jenis: 'PENJUALAN', tglMulai: mulai, tglSelesai: selesai });
  if (!res.success) { handleLoadError(res.message); return; }
  const rows = res.data.map(t => `
      <tr><td>${formatTgl(t.Waktu)}</td><td>${t.Jenis}</td><td>${t.Logam}</td>
        <td class="mono">${Number(t.Berat||0).toFixed(2)}</td><td class="mono">${formatRp(t.Nominal)}</td>
        <td>${t.MetodeBayar}</td><td>${t.Operator}</td></tr>`).join('');
  document.querySelector('#tableLaporan tbody').innerHTML = rows || `<tr><td colspan="7">${emptyState('bi-bar-chart', 'Tidak ada data pada rentang ini.')}</td></tr>`;

  if (AppState.user.role === 'OWNER') {
    const resLaba = await callApi('getLaporan', { token: AppState.token, jenis: 'LABA_RUGI', tglMulai: mulai, tglSelesai: selesai });
    if (!resLaba.success) { handleLoadError(resLaba.message); return; }
    document.getElementById('lapRingkasan').innerHTML = `
        <div class="card"><div class="kpi-label">Pemasukan</div><div class="kpi-value trend-up">${formatRp(resLaba.data.pemasukan)}</div></div>
        <div class="card"><div class="kpi-label">Pengeluaran</div><div class="kpi-value trend-down">${formatRp(resLaba.data.pengeluaran)}</div></div>
        <div class="card"><div class="kpi-label">Laba/Rugi</div><div class="kpi-value">${formatRp(resLaba.data.laba)}</div></div>`;
  }
}
function cetakLaporanPDF() { window.print(); }
function bagikanWhatsApp() {
  const text = encodeURIComponent('Laporan Toko Emas & Perak Permata Nabire periode ' +
    document.getElementById('lapTglMulai').value + ' s/d ' + document.getElementById('lapTglSelesai').value);
  window.open('https://wa.me/?text=' + text, '_blank');
}

// Ekspor laporan ke file Excel (.xlsx) atau PDF, disimpan otomatis ke
// folder "Laporan_Export" di Google Drive toko (khusus Owner).
async function eksporLaporan(format) {
  const mulai = document.getElementById('lapTglMulai').value;
  const selesai = document.getElementById('lapTglSelesai').value;
  if (!mulai || !selesai) { showToast('Peringatan', 'Pilih rentang tanggal dulu.', 'warning'); return; }
  const btn = document.getElementById(format === 'pdf' ? 'btnEksporPDF' : 'btnEksporExcel');
  const labelAsli = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spinner-inline"></span> Mengekspor...';
  const res = await callApi('exportLaporanKeDrive', { token: AppState.token, tglMulai: mulai, tglSelesai: selesai, format });
  btn.disabled = false; btn.innerHTML = labelAsli;
  if (res.success) {
    showToast('Berhasil', 'Laporan diekspor ke Drive.', 'success');
    window.open(res.data.fileUrl, '_blank');
  } else {
    showToast('Gagal Ekspor', res.message, 'danger');
  }
}

// ════════════════════════════════════════════════════════
// KELOLA KARYAWAN (OWNER)
// ════════════════════════════════════════════════════════
async function loadKaryawan() {
  const res = await callApi('getAllData', { token: AppState.token, sheetName: 'Users' });
  if (!res.success) { handleLoadError(res.message); return; }
  const rows = res.data.map(u => `
      <tr><td>${u.Nama}</td><td>${u.Username}</td><td><span class="fw-chip">${u.Role}</span></td><td>${u.Telepon||'-'}</td>
        <td><span class="badge-pill ${u.Status === 'AKTIF' ? 'badge-success' : 'badge-danger'}">${u.Status}</span></td>
        <td><button class="btn btn-ghost btn-sm" onclick="toggleUserStatus('${u.ID}','${u.Status}')">${u.Status === 'AKTIF' ? 'Nonaktifkan' : 'Aktifkan'}</button></td></tr>`).join('');
  document.querySelector('#tableKaryawan tbody').innerHTML = rows || `<tr><td colspan="6">${emptyState('bi-people', 'Belum ada karyawan.')}</td></tr>`;
}
async function toggleUserStatus(id, statusSaatIni) {
  const statusBaru = statusSaatIni === 'AKTIF' ? 'NONAKTIF' : 'AKTIF';
  const res = await callApi('ubahStatusUser', { token: AppState.token, userId: id, status: statusBaru });
  if (res.success) { showToast('Berhasil', res.message, 'success'); loadKaryawan(); } else showToast('Gagal', res.message, 'danger');
}
async function simpanUser() {
  const user = {
    nama: document.getElementById('userNama').value, username: document.getElementById('userUsername').value,
    password: document.getElementById('userPassword').value, role: document.getElementById('userRole').value,
    telepon: document.getElementById('userTelepon').value
  };
  const res = await callApi('tambahUser', { token: AppState.token, user });
  if (res.success) { showToast('Berhasil', res.message, 'success'); closeModal('modalUser'); loadKaryawan(); }
  else showToast('Gagal', res.message, 'danger');
}

// ════════════════════════════════════════════════════════
// APPROVAL & NOTIFIKASI
// ════════════════════════════════════════════════════════
async function loadNotifBadge() {
  const res = await callApi('getNotifikasi', { token: AppState.token });
  if (!res.success) { handleLoadError(res.message); return; }
  const n = res.data.belum;
  [document.getElementById('bellBadgeM'), document.getElementById('bellBadgeD')].forEach(el => {
    el.style.display = n > 0 ? 'flex' : 'none'; el.textContent = n;
  });
}

async function openNotifPanel() {
  const res = await callApi('getNotifikasi', { token: AppState.token });
  if (!res.success) { handleLoadError(res.message); return; }
  const list = res.data.list;
  document.getElementById('notifListBody').innerHTML = list.length ? list.map(n => `
      <div class="notif-item ${n.StatusBaca === 'BELUM' ? 'unread' : ''}" onclick="bukaNotif('${n.ID}')">
        <div class="notif-dot"></div>
        <div><div style="font-weight:700;font-size:13px;">${n.Judul}</div>
          <div class="kpi-sub">${n.Isi}</div><div class="time">${formatTgl(n.Waktu)}</div></div>
      </div>`).join('') : emptyState('bi-bell-slash', 'Tidak ada notifikasi.');
  openModal('modalNotif');
}
function bukaNotif(id) {
  callApi('tandaiNotifikasiDibaca', { token: AppState.token, notifId: id });
  closeModal('modalNotif');
  navigateTo('approval');
  loadNotifBadge();
}

function switchApprovalTab(tab, el) {
  AppState.approvalTab = tab;
  document.querySelectorAll('#section-approval .pill-filter').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  loadApproval();
}

async function loadApproval() {
  const wrap = document.getElementById('approvalListWrap');
  if (AppState.approvalTab === 'pengajuan') {
    const res = await callApi('getAllData', { token: AppState.token, sheetName: 'ApprovalRequests' });
    if (!res.success) { handleLoadError(res.message); return; }
    let list = res.data.reverse();
    if (AppState.user.role !== 'OWNER') list = list.filter(a => a.Pemohon === AppState.user.nama);
    wrap.innerHTML = list.length ? list.map(a => {
      const aksiHtml = (AppState.user.role === 'OWNER' && a.Status === 'MENUNGGU')
        ? ('<div style="display:flex;gap:8px;margin-top:10px;">'
          + '<button class="btn btn-danger btn-sm" style="flex:1;" onclick="putuskan(\'' + a.ID + '\',false)"><i class="bi bi-x"></i> Tolak</button>'
          + '<button class="btn btn-success btn-sm" style="flex:1;" onclick="putuskan(\'' + a.ID + '\',true)"><i class="bi bi-check"></i> Beri Izin</button>'
          + '</div>')
        : '';
      return `
        <div class="card" style="margin-bottom:10px;">
          <div class="flex-between">
            <div><b>${a.JenisPengajuan}</b> transaksi #${String(a.TransaksiID).slice(0,8)}<div class="kpi-sub">${a.Alasan} &bull; oleh ${a.Pemohon}</div></div>
            <span class="badge-pill ${a.Status === 'MENUNGGU' ? 'badge-warning' : (a.Status === 'DISETUJUI' ? 'badge-success' : 'badge-danger')}">${a.Status}</span>
          </div>
          ${aksiHtml}
        </div>`;
    }).join('') : emptyState('bi-inbox', 'Tidak ada pengajuan.');
  } else if (AppState.approvalTab === 'izin') {
    const res = await callApi('getAllData', { token: AppState.token, sheetName: 'LeaveRequests' });
    if (!res.success) { handleLoadError(res.message); return; }
    let list = res.data.reverse();
    if (AppState.user.role !== 'OWNER') list = list.filter(a => a.UserID === AppState.user.id);
    wrap.innerHTML = list.length ? list.map(a => {
      const aksiHtml = (AppState.user.role === 'OWNER' && a.Status === 'MENUNGGU')
        ? ('<div style="display:flex;gap:8px;margin-top:10px;">'
          + '<button class="btn btn-danger btn-sm" style="flex:1;" onclick="putuskanIzinUi(\'' + a.ID + '\',false)">Tolak</button>'
          + '<button class="btn btn-success btn-sm" style="flex:1;" onclick="putuskanIzinUi(\'' + a.ID + '\',true)">Setujui</button>'
          + '</div>')
        : '';
      return `
        <div class="card" style="margin-bottom:10px;">
          <div class="flex-between">
            <div><b>${a.Jenis}</b> — ${a.NamaUser}<div class="kpi-sub">${a.TanggalMulai} s/d ${a.TanggalSelesai}: ${a.Alasan}</div></div>
            <span class="badge-pill ${a.Status === 'MENUNGGU' ? 'badge-warning' : (a.Status === 'DISETUJUI' ? 'badge-success' : 'badge-danger')}">${a.Status}</span>
          </div>
          ${aksiHtml}
        </div>`;
    }).join('') : emptyState('bi-calendar-check', 'Tidak ada pengajuan izin.');
  } else if (AppState.approvalTab === 'tugas') {
    const res = await callApi('getAllData', { token: AppState.token, sheetName: 'Tasks' });
    if (!res.success) { handleLoadError(res.message); return; }
    let list = res.data.reverse();
    if (AppState.user.role !== 'OWNER') list = list.filter(t => t.Penerima === AppState.user.nama);
    const tugasBaruBtn = AppState.user.role === 'OWNER'
      ? '<button class="btn btn-gold btn-block" onclick="openModalTugasBaru()"><i class="bi bi-plus-lg"></i> Buat Tugas Baru</button>'
      : '';
    const listHtml = list.length ? list.map(t => {
      const selesaiBtn = (t.Status !== 'SELESAI' && t.Penerima === AppState.user.nama)
        ? ('<button class="btn btn-success btn-sm" style="margin-top:8px;" onclick="tandaiTugasSelesai(\'' + t.ID + '\')">Tandai Selesai</button>')
        : '';
      return `
        <div class="card" style="margin-bottom:10px;">
          <div class="flex-between">
            <div><b>${t.Judul}</b><div class="kpi-sub">${t.Deskripsi} &bull; untuk ${t.Penerima} &bull; tenggat ${t.Tenggat}</div></div>
            <span class="badge-pill ${t.Status === 'SELESAI' ? 'badge-success' : 'badge-warning'}">${t.Status.replace('_',' ')}</span>
          </div>
          ${selesaiBtn}
        </div>`;
    }).join('') : emptyState('bi-check2-square', 'Tidak ada tugas.');
    wrap.innerHTML = listHtml + tugasBaruBtn;
  } else {
    const res = await callApi('getNotifikasi', { token: AppState.token });
    if (!res.success) { handleLoadError(res.message); return; }
    wrap.innerHTML = res.data.list.length ? res.data.list.map(n => `
        <div class="notif-item ${n.StatusBaca === 'BELUM' ? 'unread' : ''}">
          <div class="notif-dot"></div><div><div style="font-weight:700;font-size:13px;">${n.Judul}</div>
          <div class="kpi-sub">${n.Isi}</div><div class="time">${formatTgl(n.Waktu)}</div></div>
        </div>`).join('') : emptyState('bi-info-circle', 'Tidak ada info.');
  }
}

async function putuskan(approvalId, disetujui) {
  const res = await callApi('putuskanApproval', { token: AppState.token, approvalId, disetujui, catatan: '' });
  if (res.success) { showToast('Berhasil', res.message, 'success'); loadApproval(); loadDashboard(); }
  else showToast('Gagal', res.message, 'danger');
}
async function putuskanIzinUi(izinId, disetujui) {
  const res = await callApi('putuskanIzin', { token: AppState.token, izinId, disetujui });
  if (res.success) { showToast('Berhasil', res.message, 'success'); loadApproval(); }
  else showToast('Gagal', res.message, 'danger');
}
async function tandaiTugasSelesai(id) {
  const res = await callApi('selesaikanTugas', { token: AppState.token, taskId: id });
  if (res.success) { showToast('Berhasil', 'Tugas selesai.', 'success'); loadApproval(); }
}
async function openModalTugasBaru() {
  const judul = prompt('Judul tugas:'); if (!judul) return;
  const deskripsi = prompt('Deskripsi:') || '';
  const penerima = prompt('Nama karyawan penerima (persis sesuai nama akun):'); if (!penerima) return;
  const tenggat = prompt('Tenggat (YYYY-MM-DD):') || '';
  const res = await callApi('buatTugas', { token: AppState.token, judul, deskripsi, penerima, tenggat });
  if (res.success) { showToast('Berhasil', res.message, 'success'); loadApproval(); } else showToast('Gagal', res.message, 'danger');
}

// ════════════════════════════════════════════════════════
// PENGATURAN (OWNER)
// ════════════════════════════════════════════════════════
async function loadPengaturan() {
  const res = await callApi('getAllConfig', { token: AppState.token });
  if (!res.success) { handleLoadError(res.message); return; }
  const c = res.data;
  AppState.configCache = c;
  document.getElementById('cfgNamaToko').value = c.namaToko || '';
  document.getElementById('cfgAlamatToko').value = c.alamatToko || '';
  document.getElementById('cfgTeleponToko').value = c.teleponToko || '';
  document.getElementById('cfgJamMasuk').value = c.jamMasuk || '08:00';
  document.getElementById('cfgLat').value = c.latToko || '';
  document.getElementById('cfgLng').value = c.lngToko || '';
  document.getElementById('cfgRadius').value = c.radiusMeter || 150;
  document.getElementById('cfgSaldoKas').value = c.saldoAwalKas || 0;
  document.getElementById('cfgEmailOwner').value = c.emailOwner || '';
}
async function simpanPengaturan() {
  const cfg = {
    namaToko: document.getElementById('cfgNamaToko').value, alamatToko: document.getElementById('cfgAlamatToko').value,
    teleponToko: document.getElementById('cfgTeleponToko').value, jamMasuk: document.getElementById('cfgJamMasuk').value,
    latToko: document.getElementById('cfgLat').value, lngToko: document.getElementById('cfgLng').value,
    radiusMeter: document.getElementById('cfgRadius').value, saldoAwalKas: document.getElementById('cfgSaldoKas').value,
    emailOwner: document.getElementById('cfgEmailOwner').value
  };
  const res = await callApi('saveConfig', { token: AppState.token, config: cfg });
  if (res.success) { showToast('Tersimpan', res.message, 'success'); AppState.configCache = Object.assign({}, AppState.configCache, cfg); }
  else showToast('Gagal', res.message, 'danger');
}
async function unduhBackup() {
  const res = await callApi('backupData', { token: AppState.token });
  if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
  const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'backup_permata_' + Date.now() + '.json'; a.click();
  showToast('Berhasil', 'Backup diunduh.', 'success');
}
