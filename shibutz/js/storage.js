window.APP = window.APP || {};

APP.storage = (function () {
  var KEY = 'shibutz.v1';

  function emptyData() {
    return {
      schemaVersion: 1, // reserved for future step-gated migrations; migrate() currently re-applies all defaults unconditionally regardless of value
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
      if (typeof t.ratings.fineMotor !== 'number') t.ratings.fineMotor = 4;
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
    data.pools.postTemplates.forEach(function (tpl) {
      if (tpl.defaultRequirements && typeof tpl.defaultRequirements.fineMotor !== 'number') {
        tpl.defaultRequirements.fineMotor = 4;
      }
    });
    data.tasks = data.tasks || [];
    data.tasks.forEach(function (task) {
      (task.posts || []).forEach(function (post) {
        post.requirements = post.requirements || {};
        var r = post.requirements;
        if (typeof r.strength !== 'number') r.strength = 4;
        if (typeof r.dexterity !== 'number') r.dexterity = 4;
        if (typeof r.fineMotor !== 'number') r.fineMotor = 4;
        if (!r.responsibilityMinCount) r.responsibilityMinCount = { level: 5, count: 1 };
        if (!r.leadershipMinCount) r.leadershipMinCount = { level: 5, count: 1 };
        if (!r.genderMinCount) r.genderMinCount = { male: 0, female: 0 };
      });
    });
    if (typeof data.currentTaskId === 'undefined') data.currentTaskId = null;
    if (typeof data.backupUrl !== 'string') data.backupUrl = '';
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
      if (window.APP && APP.backup) APP.backup.onSave();
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

  return { load: load, save: save, uid: uid, exportJSON: exportJSON, importJSON: importJSON, migrate: migrate };
})();
