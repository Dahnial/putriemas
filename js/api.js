// ============================================================
// API CLIENT — satu-satunya jalur komunikasi ke backend GAS.
// Semua request (baca & tulis) lewat POST dengan Content-Type
// text/plain;charset=utf-8 — WAJIB, supaya tidak memicu CORS
// preflight (OPTIONS) yang tidak ditangani Google Apps Script.
// ============================================================

/**
 * Memanggil satu "action" di backend GAS.
 * @param {string} action - nama aksi, harus cocok dengan key di API_ACTIONS (Kode.gs)
 * @param {object} payload - data tambahan (token, dsb), digabung otomatis dengan `action`
 * @returns {Promise<{success:boolean, data:any, message:string}>}
 */
async function callApi(action, payload) {
  if (!GAS_URL || GAS_URL.indexOf('TEMPEL_URL') !== -1) {
    const msg = 'GAS_URL belum diisi di js/config.js — lihat PANDUAN_INSTALASI.';
    console.error(msg);
    return { success: false, data: null, message: msg };
  }
  try {
    const body = Object.assign({ action: action }, payload || {});
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      return { success: false, data: null, message: 'HTTP ' + res.status + ' dari server.' };
    }
    return await res.json();
  } catch (err) {
    return { success: false, data: null, message: 'Gagal terhubung ke server: ' + err.message };
  }
}

// ============================================================
// PENYIMPANAN SESI — aman dibungkus try/catch (beberapa browser
// / mode privasi bisa memblokir localStorage).
// ============================================================
function safeGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function safeSet(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* abaikan */ } }
function safeRemove(key) { try { localStorage.removeItem(key); } catch (e) { /* abaikan */ } }
