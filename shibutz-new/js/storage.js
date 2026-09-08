window.APP = window.APP || {};

APP.storage = (function () {
  var KEY = 'shibutz.v1';

  function emptyData() {
    return {
      schemaVersion: 1,
      auth: { passwordHash: null },
      pools: {
        trainees: [],
        leaders: [],
        farmers: [],
        postTemplates: []
      },
      tasks: [],
      currentTaskId: null
    };
  }

  function migrate(data) {
    if (!data || typeof data !== 'object') return emptyData();
    data.schemaVersion = data.schemaVersion || 1;
    data.auth = data.auth || { passwordHash: null };
    data.pools = data.pools || {};
    data.pools.trainees = data.pools.trainees || [];
    data.pools.trainees.forEach(function (t) {
      if (!t.cohort) t.cohort = 'e';
      if (!t.gender) t.gender = 'm';
    });
    data.pools.leaders = data.pools.leaders || [];
    data.pools.farmers = data.pools.farmers || [];
    data.pools.farmers.forEach(function (f) {
      if (typeof f.phone !== 'string') f.phone = '';
      if (typeof f.location !== 'string') f.location = '';
      if (typeof f.jobType !== 'string') f.jobType = '';
      if (!Array.isArray(f.preferredTraineeIds)) f.preferredTraineeIds = [];
    });
    data.pools.postTemplates = data.pools.postTemplates || [];
    data.tasks = data.tasks || [];
    if (typeof data.currentTaskId === 'undefined') data.currentTaskId = null;
    return data;
  }

  function load() {
    var raw;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      return emptyData();
    }
    if (!raw) return emptyData();
    try {
      return migrate(JSON.parse(raw));
    } catch (e) {
      console.error('שגיאה בטעינת הנתונים, מתחילים ממאגר ריק', e);
      return emptyData();
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('שגיאה בשמירת הנתונים', e);
      alert('שגיאה בשמירת הנתונים - יתכן שאין מקום פנוי באחסון הדפדפן');
      return false;
    }
  }

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function exportJSON(data) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'shibutz-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importJSON(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        cb(null, migrate(JSON.parse(reader.result)));
      } catch (e) {
        cb(e);
      }
    };
    reader.onerror = function () { cb(reader.error); };
    reader.readAsText(file);
  }

  return { load: load, save: save, uid: uid, emptyData: emptyData, exportJSON: exportJSON, importJSON: importJSON };
})();
