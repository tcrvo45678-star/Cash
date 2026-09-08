window.APP = window.APP || {};

// Generic Pointer-Events based drag/swap engine.
// Any element with class "cell" and a data-cell-id can be dragged onto any
// other such element within the same container to swap their two values.
// The engine itself knows nothing about tasks/trainees/posts - the caller
// supplies onSwap(cellIdA, cellIdB) and is responsible for actually
// swapping the underlying data and re-rendering.
APP.dragswap = (function () {
  var THRESHOLD = 9;
  var HOLD_MS = 450;

  function attach(container, onSwap) {
    var drag = null;
    var ghost = document.getElementById('drag-ghost');
    var pickedEl = null;
    var pickedCellId = null;

    function clearPicked() {
      if (pickedEl) pickedEl.classList.remove('cell-picked');
      pickedEl = null;
      pickedCellId = null;
    }

    // ---- keyboard path: focus a cell, Enter/Space to pick it up, Tab to
    // another cell, Enter/Space again to swap. Escape cancels. ----
    container.addEventListener('keydown', function (e) {
      var cellEl = e.target.closest('.cell');
      if (!cellEl) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        var cellId = cellEl.dataset.cellId;
        if (!pickedEl) {
          pickedEl = cellEl;
          pickedCellId = cellId;
          cellEl.classList.add('cell-picked');
        } else if (pickedEl === cellEl) {
          clearPicked();
        } else {
          var sourceCellId = pickedCellId;
          clearPicked();
          onSwap(sourceCellId, cellId);
        }
      } else if (e.key === 'Escape' && pickedEl) {
        clearPicked();
      }
    });

    container.addEventListener('pointerdown', function (e) {
      var cellEl = e.target.closest('.cell');
      if (!cellEl) return;
      var pending = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        sourceEl: cellEl,
        sourceCellId: cellEl.dataset.cellId,
        armed: false,
        dragging: false,
        targetEl: null,
        targetCellId: null,
        timer: null
      };
      pending.timer = setTimeout(function () {
        if (drag !== pending) return;
        pending.armed = true;
        pending.sourceEl.classList.add('cell-armed');
      }, HOLD_MS);
      drag = pending;
    });

    container.addEventListener('pointermove', function (e) {
      if (!drag || drag.pointerId !== e.pointerId) return;
      var dx = e.clientX - drag.startX;
      var dy = e.clientY - drag.startY;
      if (!drag.armed) {
        // Moved before the hold completed - this is a scroll/tap, not a
        // drag intent, so cancel the pending hold entirely.
        if (Math.abs(dx) >= THRESHOLD || Math.abs(dy) >= THRESHOLD) {
          clearTimeout(drag.timer);
          drag = null;
        }
        return;
      }
      if (!drag.dragging) startDragging(e);
      moveGhost(e.clientX, e.clientY);
      updateDropTarget(e.clientX, e.clientY);
      e.preventDefault();
    });

    container.addEventListener('pointerup', finish);
    container.addEventListener('pointercancel', finish);

    function startDragging(e) {
      drag.dragging = true;
      drag.sourceEl.classList.add('cell-dragging');
      var inp = drag.sourceEl.querySelector('input');
      if (inp) inp.blur();
      try { drag.sourceEl.setPointerCapture(e.pointerId); } catch (err) {}
      ghost.textContent = drag.sourceEl.textContent.trim();
      ghost.hidden = false;
      moveGhost(e.clientX, e.clientY);
    }

    function moveGhost(x, y) {
      ghost.style.left = x + 'px';
      ghost.style.top = y + 'px';
    }

    function updateDropTarget(x, y) {
      ghost.hidden = true;
      var under = document.elementFromPoint(x, y);
      ghost.hidden = false;
      var cellEl = under && under.closest ? under.closest('.cell') : null;
      if (cellEl === drag.sourceEl) cellEl = null;
      if (drag.targetEl && drag.targetEl !== cellEl) {
        drag.targetEl.classList.remove('drop-target');
      }
      if (cellEl) {
        cellEl.classList.add('drop-target');
        drag.targetEl = cellEl;
        drag.targetCellId = cellEl.dataset.cellId;
      } else {
        drag.targetEl = null;
        drag.targetCellId = null;
      }
    }

    function cleanup() {
      ghost.hidden = true;
      if (drag.sourceEl) drag.sourceEl.classList.remove('cell-dragging', 'cell-armed');
      if (drag.targetEl) drag.targetEl.classList.remove('drop-target');
    }

    function finish(e) {
      if (!drag || drag.pointerId !== e.pointerId) return;
      clearTimeout(drag.timer);
      if (drag.dragging) {
        var targetCellId = drag.targetCellId;
        cleanup();
        try { drag.sourceEl.releasePointerCapture(drag.pointerId); } catch (err) {}
        if (targetCellId && targetCellId !== drag.sourceCellId) {
          onSwap(drag.sourceCellId, targetCellId);
        }
      } else if (drag.sourceEl) {
        drag.sourceEl.classList.remove('cell-armed');
      }
      drag = null;
    }
  }

  return { attach: attach };
})();
