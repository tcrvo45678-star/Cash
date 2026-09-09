window.APP = window.APP || {};

// Optional, opt-in backup to a Google Sheet via a user-deployed Apps
// Script Web App (see /google-apps-script in the repo). The site has no
// server of its own, so this can only run while someone has the page open -
// it fires automatically a few seconds after any save (debounced, so a
// burst of rapid changes collapses into one request), or immediately via
// the "גבה עכשיו" button. If no URL is configured, this is a silent no-op.
APP.backup = (function () {
  function getUrl() {
    var d = APP.state.get();
    return (d && d.backupUrl) || '';
  }

  function setUrl(url) {
    var d = APP.state.get();
    d.backupUrl = url || '';
    APP.state.save();
  }

  function buildPayload() {
    var d = APP.state.get();
    var traineesById = {};
    (d.pools.trainees || []).forEach(function (t) { traineesById[t.id] = t; });
    var trainees = [['id', 'name', 'cohort', 'gender', 'strength', 'dexterity', 'fineMotor', 'responsibility', 'leadership', 'active']]
      .concat((d.pools.trainees || []).map(function (t) {
        return [t.id, t.name, t.cohort, t.gender, t.ratings.strength, t.ratings.dexterity,
          t.ratings.fineMotor, t.ratings.responsibility, t.ratings.leadership, t.active !== false];
      }));
    var leaders = [['id', 'name', 'active']]
      .concat((d.pools.leaders || []).map(function (l) { return [l.id, l.name, l.active !== false]; }));
    var farmers = [['id', 'name', 'phone', 'location', 'jobType', 'preferredTraineeIds', 'preferredTraineeNames', 'active']]
      .concat((d.pools.farmers || []).map(function (f) {
        var prefIds = f.preferredTraineeIds || [];
        var prefNames = prefIds.map(function (id) { var t = traineesById[id]; return t ? t.name : null; }).filter(Boolean).join(', ');
        return [f.id, f.name, f.phone || '', f.location || '', f.jobType || '', prefIds.join(';'), prefNames, f.active !== false];
      }));

    var taskLog = [['date', 'farmer', 'leader', 'transportMethod', 'workerName', 'workerType']];
    (d.tasks || []).forEach(function (task) {
      (task.posts || []).forEach(function (post) {
        var farmer = APP.state.findById(d.pools.farmers, post.farmerId);
        var leaderName = APP.state.cellDisplay(post.leader, task);
        var pa = task.assignment && task.assignment.postAssignments[post.id];
        var workers = pa ? pa.workerIds.filter(function (w) { return w.t === 'ref'; }) : [];
        if (!workers.length) {
          taskLog.push([task.date, farmer ? farmer.name : '', leaderName, post.transportMethod || '', '', '']);
        } else {
          workers.forEach(function (w) {
            taskLog.push([task.date, farmer ? farmer.name : '', leaderName, post.transportMethod || '',
              APP.state.cellDisplay(w, task), w.rt]);
          });
        }
      });
    });

    return { trainees: trainees, leaders: leaders, farmers: farmers, taskLog: taskLog };
  }

  function sendBackup() {
    var url = getUrl();
    if (!url) return;
    fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(buildPayload())
    }).catch(function () { /* best-effort background backup - ignore network errors */ });
  }

  var debouncedSend = APP.util.debounce(sendBackup, 3000);

  function onSave() {
    if (getUrl()) debouncedSend();
  }

  function sendNow() {
    sendBackup();
  }

  function testConnection(url, cb) {
    if (!url) { cb(false); return; }
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    fetch(url + sep + 'test=1')
      .then(function (r) { return r.json(); })
      .then(function (j) { cb(!!(j && j.status === 'ok')); })
      .catch(function () { cb(false); });
  }

  // Sheet rows come back as [header, ...dataRows] arrays-of-arrays - turn
  // each data row into an object keyed by the header's column names.
  function rowsToObjects(rows) {
    if (!rows || !rows.length) return [];
    var header = rows[0];
    return rows.slice(1)
      .filter(function (row) { return row[0] !== '' && row[0] != null; })
      .map(function (row) {
        var obj = {};
        header.forEach(function (key, i) { obj[key] = row[i]; });
        return obj;
      });
  }

  // Pull direction: fetches the trainees/leaders/farmers pool tabs back
  // from the sheet and replaces this device's pools with them, the same
  // "full snapshot" model as the push - lets qualities/preferences entered
  // on one device show up on another after both have backed up/pulled at
  // least once. Tasks/assignments are never touched by this.
  function pullFromBackup(cb) {
    var url = getUrl();
    if (!url) { cb(new Error('no backup url configured')); return; }
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    fetch(url + sep + 'pull=1')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var d = APP.state.get();
        d.pools.trainees = rowsToObjects(json.trainees).map(function (row) {
          return {
            id: String(row.id), name: String(row.name || ''),
            cohort: String(row.cohort || 'e'), gender: String(row.gender || 'm'),
            ratings: {
              strength: Number(row.strength) || 4, dexterity: Number(row.dexterity) || 4,
              fineMotor: Number(row.fineMotor) || 4, responsibility: Number(row.responsibility) || 4,
              leadership: Number(row.leadership) || 4
            },
            active: row.active !== false
          };
        });
        d.pools.leaders = rowsToObjects(json.leaders).map(function (row) {
          return { id: String(row.id), name: String(row.name || ''), active: row.active !== false };
        });
        d.pools.farmers = rowsToObjects(json.farmers).map(function (row) {
          return {
            id: String(row.id), name: String(row.name || ''),
            phone: String(row.phone || ''), location: String(row.location || ''), jobType: String(row.jobType || ''),
            preferredTraineeIds: row.preferredTraineeIds ? String(row.preferredTraineeIds).split(';').filter(Boolean) : [],
            active: row.active !== false
          };
        });
        APP.storage.migrate(d);
        APP.state.save();
        cb(null);
      })
      .catch(function (err) { cb(err); });
  }

  return {
    getUrl: getUrl, setUrl: setUrl, buildPayload: buildPayload, onSave: onSave, sendNow: sendNow,
    testConnection: testConnection, pullFromBackup: pullFromBackup
  };
})();
