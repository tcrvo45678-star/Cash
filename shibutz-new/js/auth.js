window.APP = window.APP || {};

// NOTE: this is a deliberately lightweight, client-side-only gate.
// The app is 100% static (GitHub Pages) - there is no server to keep a
// real secret on. Anyone with browser devtools can read this file or the
// underlying data. Treat this as a soft deterrent only, never as real
// access control for sensitive information.
APP.auth = (function () {
  var SESSION_KEY = 'shibutz_unlocked';
  var TRAINEES_SESSION_KEY = 'shibutz_trainees_unlocked';

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
    d.auth = d.auth || {};
    d.auth.passwordHash = simpleHash(newPassword);
    APP.state.save();
  }

  function checkPassword(candidate) {
    var d = APP.state.get();
    if (!d.auth || !d.auth.passwordHash) return false;
    return simpleHash(candidate) === d.auth.passwordHash;
  }

  // Second, independent gate for the "חניכים" tab specifically - same
  // lightweight client-side model as the main password (see note above),
  // just scoped narrower so day-to-day screens (the grid, print, etc.)
  // stay visible without it.
  function hasTraineesPassword() {
    var d = APP.state.get();
    return !!(d.auth && d.auth.traineesPasswordHash);
  }

  function setTraineesPassword(newPassword) {
    var d = APP.state.get();
    d.auth = d.auth || {};
    d.auth.traineesPasswordHash = simpleHash(newPassword);
    APP.state.save();
  }

  function checkTraineesPassword(candidate) {
    var d = APP.state.get();
    if (!d.auth || !d.auth.traineesPasswordHash) return false;
    return simpleHash(candidate) === d.auth.traineesPasswordHash;
  }

  function isTraineesUnlockedThisSession() {
    try { return sessionStorage.getItem(TRAINEES_SESSION_KEY) === '1'; } catch (e) { return false; }
  }
  function markTraineesUnlocked() {
    try { sessionStorage.setItem(TRAINEES_SESSION_KEY, '1'); } catch (e) {}
  }

  return {
    isUnlockedThisSession: isUnlockedThisSession,
    markUnlocked: markUnlocked,
    lock: lock,
    hasPassword: hasPassword,
    setPassword: setPassword,
    checkPassword: checkPassword,
    hasTraineesPassword: hasTraineesPassword,
    setTraineesPassword: setTraineesPassword,
    checkTraineesPassword: checkTraineesPassword,
    isTraineesUnlockedThisSession: isTraineesUnlockedThisSession,
    markTraineesUnlocked: markTraineesUnlocked
  };
})();
