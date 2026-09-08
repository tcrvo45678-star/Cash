window.APP = window.APP || {};

// Pure, DOM-free auto-assignment algorithm.
// runAutoAssign(task, pools) -> { postAssignments, spare }
//
// See /root/.claude/plans (or the project README) for the full design
// writeup. Summary:
//   1. Candidate pool = non-absent trainees + surplus team leaders
//      (leaders not already chosen as a post's primary leader today).
//   2. Posts are expanded into worker-slots.
//   3. Quota traits (responsibility/leadership "at least N at level >= L")
//      are satisfied first, in interleaved rounds across all posts at once
//      (highest deficit-urgency wins each round), relaxing the level
//      gradually when not enough candidates qualify.
//   4. Remaining open slots are filled by repeatedly picking the single
//      globally-cheapest (candidate, slot) pair by closeness to the post's
//      strength/dexterity targets - this global-minimum-first approach is
//      what keeps the result balanced across posts instead of dumping
//      leftovers on the last one.
//   5. Surplus leaders (untraited) fill any slots still open, in simple
//      pool order.
//   6. Anyone left over goes to "spare" - always shown, never dropped.
APP.assign = (function () {
  function quotaTarget(post, trait) {
    return trait === 'responsibility'
      ? post.requirements.responsibilityMinCount.count
      : post.requirements.leadershipMinCount.count;
  }

  function runAutoAssign(task, pools) {
    var trainees = APP.state.activeOnly(pools.trainees).filter(function (t) {
      return task.absentTraineeIds.indexOf(t.id) === -1;
    });

    var leadersUsedAsPrimary = {};
    task.posts.forEach(function (p) {
      if (p.leader && p.leader.t === 'ref' && p.leader.rt === 'leader' && p.leader.id) {
        leadersUsedAsPrimary[p.leader.id] = true;
      }
    });
    var surplusLeaders = APP.state.activeOnly(pools.leaders).filter(function (l) {
      return !leadersUsedAsPrimary[l.id];
    });

    // build slots, grouped by post
    var slotsByPost = {};
    task.posts.forEach(function (post) {
      var arr = [];
      for (var i = 0; i < post.workerCount; i++) {
        arr.push({ postId: post.id, index: i, assigned: null });
      }
      slotsByPost[post.id] = arr;
    });

    function openSlotsFor(postId) {
      return slotsByPost[postId].filter(function (s) { return !s.assigned; });
    }
    function quotaMetCount(postId, trait, level) {
      return slotsByPost[postId].filter(function (s) {
        return s.assigned && s.assigned.trainee && s.assigned.trainee.ratings[trait] >= level;
      }).length;
    }

    var remaining = trainees.map(function (t) { return { id: t.id, trainee: t }; });

    // ---- Step 1: quota traits, interleaved by urgency, gradual relaxation ----
    var quotaTraits = ['responsibility', 'leadership'];
    var relaxedLevel = {};
    task.posts.forEach(function (post) {
      relaxedLevel[post.id] = {
        responsibility: post.requirements.responsibilityMinCount.level,
        leadership: post.requirements.leadershipMinCount.level
      };
    });
    var unsatisfiable = {};

    while (remaining.length) {
      var best = null;
      task.posts.forEach(function (post) {
        var open = openSlotsFor(post.id).length;
        if (!open) return;
        quotaTraits.forEach(function (trait) {
          var key = post.id + '|' + trait;
          if (unsatisfiable[key]) return;
          var target = quotaTarget(post, trait);
          if (target <= 0) return;
          var level = relaxedLevel[post.id][trait];
          var have = quotaMetCount(post.id, trait, level);
          var deficit = target - have;
          if (deficit <= 0) return;
          var urgency = deficit / open;
          if (!best || urgency > best.urgency) {
            best = { post: post, trait: trait, level: level, urgency: urgency };
          }
        });
      });
      if (!best) break;

      var candidates = remaining.filter(function (c) { return c.trainee.ratings[best.trait] >= best.level; });
      if (!candidates.length) {
        if (best.level > 1) {
          relaxedLevel[best.post.id][best.trait] -= 1;
        } else {
          unsatisfiable[best.post.id + '|' + best.trait] = true;
        }
        continue;
      }
      candidates.sort(function (a, b) { return b.trainee.ratings[best.trait] - a.trainee.ratings[best.trait]; });
      var chosen = candidates[0];
      var slot = openSlotsFor(best.post.id)[0];
      slot.assigned = chosen;
      remaining = remaining.filter(function (c) { return c.id !== chosen.id; });
    }

    // ---- Step 2: continuous traits (strength/dexterity), global-minimum-first greedy ----
    function closenessCost(trainee, requirements) {
      return Math.abs(trainee.ratings.strength - requirements.strength) +
        Math.abs(trainee.ratings.dexterity - requirements.dexterity);
    }
    var allSlots = [];
    task.posts.forEach(function (post) { slotsByPost[post.id].forEach(function (s) { allSlots.push(s); }); });
    var postById = {};
    task.posts.forEach(function (p) { postById[p.id] = p; });

    var openSlots = allSlots.filter(function (s) { return !s.assigned; });
    while (remaining.length && openSlots.length) {
      var bestPair = null;
      remaining.forEach(function (c) {
        openSlots.forEach(function (s) {
          var cost = closenessCost(c.trainee, postById[s.postId].requirements);
          if (!bestPair || cost < bestPair.cost) bestPair = { candidate: c, slot: s, cost: cost };
        });
      });
      bestPair.slot.assigned = bestPair.candidate;
      remaining = remaining.filter(function (c) { return c.id !== bestPair.candidate.id; });
      openSlots = openSlots.filter(function (s) { return s !== bestPair.slot; });
    }

    // ---- Step 3: surplus leaders fill whatever is left, simple pool order ----
    openSlots = allSlots.filter(function (s) { return !s.assigned; });
    var leaderQueue = surplusLeaders.slice();
    openSlots.forEach(function (s) {
      if (!leaderQueue.length) return;
      var l = leaderQueue.shift();
      s.assigned = { id: l.id, leader: l };
    });

    // ---- build output ----
    var postAssignments = {};
    task.posts.forEach(function (post) {
      postAssignments[post.id] = {
        workerIds: slotsByPost[post.id].map(function (s) {
          if (!s.assigned) return APP.state.emptyVal();
          if (s.assigned.trainee) return APP.state.refVal('trainee', s.assigned.id);
          if (s.assigned.leader) return APP.state.refVal('leader', s.assigned.id);
          return APP.state.emptyVal();
        })
      };
    });

    var spare = remaining.map(function (c) { return APP.state.refVal('trainee', c.id); })
      .concat(leaderQueue.map(function (l) { return APP.state.refVal('leader', l.id); }));

    return { postAssignments: postAssignments, spare: spare };
  }

  return { runAutoAssign: runAutoAssign };
})();
