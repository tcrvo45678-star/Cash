window.APP = window.APP || {};

APP.history = (function () {
  var U = APP.util;

  function render() {
    var el = document.getElementById('tab-history');
    if (!el) return;
    var tasks = APP.state.sortedTasksDesc();
    if (!tasks.length) {
      el.innerHTML = '<div class="card"><p class="muted">אין עדיין היסטוריית משימות.</p></div>';
      return;
    }
    el.innerHTML = '<div class="card"><h2>היסטוריית משימות</h2>' +
      '<div class="table-scroll"><table class="history-table">' +
      '<thead><tr><th>תאריך</th><th>מס\' עמדות</th><th>נעדרים</th><th></th></tr></thead><tbody>' +
      tasks.map(function (t) {
        return '<tr>' +
          '<td>' + t.date + '</td>' +
          '<td>' + t.posts.length + '</td>' +
          '<td>' + t.absentTraineeIds.length + '</td>' +
          '<td>' +
          '<button class="btn-small" data-action="open-task" data-task-id="' + t.id + '">פתח</button> ' +
          '<button class="btn-small btn-danger" data-action="delete-task" data-task-id="' + t.id + '">מחק</button>' +
          '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div></div>';
  }

  return { render: render };
})();
