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

  // One password-gate "shape" (unlock flag + hash check), parameterized
  // by which auth field it hashes into and which sessionStorage key holds
  // its unlock flag - used for both the main site password and the
  // second, independent gate on the "חניכים" tab.
  function makeGate(hashField, sessionKey) {
    function isUnlockedThisSession() {
      try { return sessionStorage.getItem(sessionKey) === '1'; } catch (e) { return false; }
    }
    function markUnlocked() {
      try { sessionStorage.setItem(sessionKey, '1'); } catch (e) {}
    }
    function lock() {
      try { sessionStorage.removeItem(sessionKey); } catch (e) {}
    }
    function hasPassword() {
      var d = APP.state.get();
      return !!(d.auth && d.auth[hashField]);
    }
    function setPassword(newPassword) {
      var d = APP.state.get();
      d.auth = d.auth || {};
      d.auth[hashField] = simpleHash(newPassword);
      APP.state.save();
    }
    function checkPassword(candidate) {
      var d = APP.state.get();
      if (!d.auth || !d.auth[hashField]) return false;
      return simpleHash(candidate) === d.auth[hashField];
    }
    return {
      isUnlockedThisSession: isUnlockedThisSession,
      markUnlocked: markUnlocked,
      lock: lock,
      hasPassword: hasPassword,
      setPassword: setPassword,
      checkPassword: checkPassword
    };
  }

  var mainGate = makeGate('passwordHash', SESSION_KEY);
  // Second, independent gate for the "חניכים" tab specifically - same
  // lightweight client-side model as the main password (see note above),
  // just scoped narrower so day-to-day screens (the grid, print, etc.)
  // stay visible without it.
  var traineesGate = makeGate('traineesPasswordHash', TRAINEES_SESSION_KEY);

  return {
    isUnlockedThisSession: mainGate.isUnlockedThisSession,
    markUnlocked: mainGate.markUnlocked,
    lock: mainGate.lock,
    hasPassword: mainGate.hasPassword,
    setPassword: mainGate.setPassword,
    checkPassword: mainGate.checkPassword,
    hasTraineesPassword: traineesGate.hasPassword,
    setTraineesPassword: traineesGate.setPassword,
    checkTraineesPassword: traineesGate.checkPassword,
    isTraineesUnlockedThisSession: traineesGate.isUnlockedThisSession,
    markTraineesUnlocked: traineesGate.markUnlocked
  };
})();
