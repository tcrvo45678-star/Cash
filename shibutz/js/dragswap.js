window.APP = window.APP || {};

// Generic Pointer-Events based drag/swap engine.
// Any element with class "cell" and a data-cell-id can be dragged onto any
// other such element within the same container to swap their two values.
// The engine itself knows nothing about tasks/trainees/posts - the caller
// supplies onSwap(cellIdA, cellIdB) and is responsible for actually
// swapping the underlying data and re-rendering.
APP.dragswap = (function () {
  var THRESHOLD = 9;

  function attach(container, onSwap) {
    var drag = null;
    var ghost = document.getElementById('drag-ghost');

    container.addEventListener('pointerdown', function (e) {
      var cellEl = e.target.closest('.cell');
      if (!cellEl) return;
      drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        sourceEl: cellEl,
        sourceCellId: cellEl.dataset.cellId,
        dragging: false,
        targetEl: null,
        targetCellId: null
      };
    });

    container.addEventListener('pointermove', function (e) {
      if (!drag || drag.pointerId !== e.pointerId) return;
      var dx = e.clientX - drag.startX;
      var dy = e.clientY - drag.startY;
      if (!drag.dragging) {
        if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
        startDragging(e);
      }
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
      if (drag.sourceEl) drag.sourceEl.classList.remove('cell-dragging');
      if (drag.targetEl) drag.targetEl.classList.remove('drop-target');
    }

    function finish(e) {
      if (!drag || drag.pointerId !== e.pointerId) return;
      if (drag.dragging) {
        var targetCellId = drag.targetCellId;
        cleanup();
        try { drag.sourceEl.releasePointerCapture(drag.pointerId); } catch (err) {}
        if (targetCellId && targetCellId !== drag.sourceCellId) {
          onSwap(drag.sourceCellId, targetCellId);
        }
      }
      drag = null;
    }
  }

  return { attach: attach };
})();
