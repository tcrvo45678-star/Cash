window.APP = window.APP || {};

// NOTE: this is a deliberately lightweight, client-side-only gate.
// The app is 100% static (GitHub Pages) - there is no server to keep a
// real secret on. Anyone with browser devtools can read this file or the
// underlying data. Treat this as a soft deterrent only, never as real
// access control for sensitive information.
APP.auth = (function () {
  var SESSION_KEY = 'shibutz_unlocked';

  function simpleHash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return 'h' + (h >>> 0).toString(36) + '_' + str.length;
  }

  function isUnlockedThisSession() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  }
  function markUnlocked() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
  }
  function lock() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  function hasPassword() {
    var d = APP.state.get();
    return !!(d.auth && d.auth.passwordHash);
  }

  function setPassword(newPassword) {
    var d = APP.state.get();
    d.auth = { passwordHash: simpleHash(newPassword) };
    APP.state.save();
  }

  function checkPassword(candidate) {
    var d = APP.state.get();
    if (!d.auth || !d.auth.passwordHash) return false;
    return simpleHash(candidate) === d.auth.passwordHash;
  }

  return {
    isUnlockedThisSession: isUnlockedThisSession,
    markUnlocked: markUnlocked,
    lock: lock,
    hasPassword: hasPassword,
    setPassword: setPassword,
    checkPassword: checkPassword
  };
})();
