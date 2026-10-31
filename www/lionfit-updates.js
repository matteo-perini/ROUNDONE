
/*
 * LION FIT - Controllo aggiornamenti Android (Beta 0.28.8)
 * Nessuna installazione automatica: l'utente autorizza download e installazione.
 * Source: release pubbliche GitHub (non bozze / non prerelease).
 * @capacitor/app e @capacitor/browser v8 necessari nell'APK.
 */
(function () {
  'use strict';
  if (window.__LIONFIT_UPDATES_STARTED__) return;
  window.__LIONFIT_UPDATES_STARTED__ = true;

  const API = 'https://api.github.com/repos/matteo-perini/ROUNDONE/releases/latest';
  const ASSET_NAME = 'LionFit.apk';
  const CHECK_INTERVAL = 8 * 60 * 60 * 1000;
  const SNOOZE_INTERVAL = 24 * 60 * 60 * 1000;
  const LAST_KEY = 'lf_android_update_checked_at_v1';
  const SNOOZE_PREFIX = 'lf_android_update_snoozed_v1_';
  let checking = false;

  function nativeAndroid() {
    const cap = window.Capacitor;
    if (!cap) return false;
    try {
      return cap.getPlatform?.() === 'android' && cap.isNativePlatform?.() === true;
    } catch (_) { return false; }
  }

  function components(version) {
    const cleaned = String(version || '').trim().replace(/^v/i, '');
    if (!/^\d+(?:\.\d+){0,3}$/.test(cleaned)) return null;
    return cleaned.split('.').map(n => Number(n));
  }

  function isNewer(remote, installed) {
    const a = components(remote), b = components(installed);
    if (!a || !b) return false;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const delta = (a[i] || 0) - (b[i] || 0);
      if (delta) return delta > 0;
    }
    return false;
  }

  function validApkUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && u.hostname === 'github.com' &&
        /^\/matteo-perini\/ROUNDONE\/releases\/download\/[^/]+\/LionFit\.apk$/.test(u.pathname);
    } catch (_) { return false; }
  }

  function readStorage(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }

  function writeStorage(key, value) {
    try { window.localStorage.setItem(key, String(value)); } catch (_) {}
  }

  function showNotice(tag, currentVersion, url) {
    const key = SNOOZE_PREFIX + tag;
    if (Date.now() - Number(readStorage(key) || 0) < SNOOZE_INTERVAL) return;
    if (document.getElementById('lf-android-update-notice')) return;

    const style = document.createElement('style');
    style.textContent = `
      #lf-android-update-notice{position:fixed;bottom:calc(86px + env(safe-area-inset-bottom, 0px));left:12px;right:12px;max-width:480px;margin:0 auto;z-index:2147483000;box-sizing:border-box;background:#172437;color:#f6fff9;border:1px solid #56b786;border-radius:17px;box-shadow:0 14px 48px #0008;padding:16px;font:14px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif}
      #lf-android-update-notice .lf-title{font-size:17px;line-height:1.25;font-weight:800;margin:0 0 6px}
      #lf-android-update-notice .lf-copy{font-size:13px;opacity:.92;margin:0 0 12px}
      #lf-android-update-notice .lf-actions{display:flex;gap:8px;flex-wrap:wrap}
      #lf-android-update-notice button{border-radius:9px;border:1px solid #5acb90;font:700 13px system-ui;padding:10px 12px;cursor:pointer}
      #lf-android-update-notice .lf-install{background:#18a55e;color:white;flex:1}
      #lf-android-update-notice .lf-later{background:transparent;color:white}
      #lf-android-update-notice .lf-note{font-size:11px;opacity:.78;margin-top:10px}
    `;
    document.head.appendChild(style);

    const notice = document.createElement('section');
    notice.id = 'lf-android-update-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-label', 'Aggiornamento Lion Fit disponibile');
    notice.innerHTML =
      '<div class="lf-title">🦁 Nuova versione di Lion Fit</div>' +
      '<p class="lf-copy"></p>' +
      '<div class="lf-actions"><button type="button" class="lf-install">Scarica aggiornamento</button>' +
      '<button type="button" class="lf-later">Più tardi</button></div>' +
      '<div class="lf-note">Android chiederà la conferma per installare la nuova APK.</div>';

    notice.querySelector('.lf-copy').textContent =
      'È disponibile la versione ' + tag.replace(/^v/i, '') +
      ' (installata: ' + currentVersion + '). Puoi aggiornare senza cercare vecchie email.';

    notice.querySelector('.lf-later').addEventListener('click', function () {
      writeStorage(key, Date.now());
      notice.remove();
    });

    notice.querySelector('.lf-install').addEventListener('click', async function () {
      try {
        const Browser = window.Capacitor?.Plugins?.Browser;
        if (Browser && typeof Browser.open === 'function') {
          await Browser.open({url: url});
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      } catch (error) {
        console.warn('[Lion Fit] Apertura download non riuscita', error);
        notice.querySelector('.lf-copy').textContent =
          'Impossibile aprire il download da qui. Copia il collegamento con il tasto qui sotto.';
        const button = notice.querySelector('.lf-install');
        button.textContent = 'Copia link APK';
        button.onclick = () => {
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(url).catch(() => {});
          }
        };
      }
    });

    document.body.appendChild(notice);
  }

  async function check(force) {
    if (checking || !nativeAndroid()) return;

    const plugin = window.Capacitor?.Plugins?.App;
    if (!plugin || typeof plugin.getInfo !== 'function') {
      console.info('[Lion Fit] @capacitor/app non disponibile, controllo aggiornamenti sospeso.');
      return;
    }

    const last = Number(readStorage(LAST_KEY) || 0);
    if (!force && Date.now() - last < CHECK_INTERVAL) return;

    checking = true;
    try {
      const info = await plugin.getInfo();
      const installed = String(info.version || '');
      if (!components(installed)) return;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      let response;

      try {
        response = await fetch(API, {
          headers: {'Accept':'application/vnd.github+json'},
          cache: 'no-store',
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) return;
      const release = await response.json();

      if (!release || release.draft || release.prerelease || !isNewer(release.tag_name, installed)) {
        writeStorage(LAST_KEY, Date.now());
        return;
      }

      const asset = Array.isArray(release.assets)
        ? release.assets.find(a =>
            a.name === ASSET_NAME &&
            validApkUrl(a.browser_download_url) &&
            a.state === 'uploaded'
          )
        : null;

      if (!asset) return;

      writeStorage(LAST_KEY, Date.now());
      showNotice(release.tag_name, installed, asset.browser_download_url);

    } catch (error) {
      console.info('[Lion Fit] Controllo aggiornamenti non riuscito', error);
    } finally {
      checking = false;
    }
  }

  window.LionFitUpdates = Object.freeze({check});

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => check(false), {once:true});
  } else {
    check(false);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check(false);
  });
})();
