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
  function isGenderTrait(trait) { return trait === 'gender-male' || trait === 'gender-female'; }

  function quotaTarget(post, trait) {
    if (trait === 'responsibility') return post.requirements.responsibilityMinCount.count;
    if (trait === 'leadership') return post.requirements.leadershipMinCount.count;
    var g = post.requirements.genderMinCount;
    if (trait === 'gender-male') return (g && g.male) || 0;
    if (trait === 'gender-female') return (g && g.female) || 0;
    return 0;
  }

  // Gender has no 1-7 "level" to relax like a rating does - it either
  // matches or it doesn't, so `level` is ignored for gender traits.
  function matchesTrait(trainee, trait, level) {
    if (trait === 'gender-male') return trainee.gender === 'm';
    if (trait === 'gender-female') return trainee.gender === 'f';
    return trainee.ratings[trait] >= level;
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

    var postById = {};
    task.posts.forEach(function (p) { postById[p.id] = p; });

    var farmersById = {};
    (pools.farmers || []).forEach(function (f) { farmersById[f.id] = f; });
    var preferredTraineeIdsByPost = {};
    task.posts.forEach(function (p) {
      var farmer = farmersById[p.farmerId];
      preferredTraineeIdsByPost[p.id] = (farmer && farmer.preferredTraineeIds) || [];
    });
    function isPreferredFor(traineeId, postId) {
      return preferredTraineeIdsByPost[postId].indexOf(traineeId) >= 0;
    }
    var PREFERENCE_BONUS = 0.5;

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
        return s.assigned && s.assigned.trainee && matchesTrait(s.assigned.trainee, trait, level);
      }).length;
    }

    var remaining = trainees.map(function (t) { return { id: t.id, trainee: t }; });

    // ---- Step 1: quota traits, interleaved by urgency, gradual relaxation ----
    var quotaTraits = ['responsibility', 'leadership', 'gender-male', 'gender-female'];
    var relaxedLevel = {};
    task.posts.forEach(function (post) {
      relaxedLevel[post.id] = {
        responsibility: post.requirements.responsibilityMinCount.level,
        leadership: post.requirements.leadershipMinCount.level,
        'gender-male': 1,
        'gender-female': 1
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

      var candidates = remaining.filter(function (c) { return matchesTrait(c.trainee, best.trait, best.level); });
      if (!candidates.length) {
        // Gender never relaxes (level stays 1, so this always falls straight
        // to unsatisfiable) - only rating-based traits step down gradually.
        if (best.level > 1) {
          relaxedLevel[best.post.id][best.trait] -= 1;
        } else {
          unsatisfiable[best.post.id + '|' + best.trait] = true;
        }
        continue;
      }
      candidates.sort(function (a, b) {
        var diff = isGenderTrait(best.trait) ? 0 : (b.trainee.ratings[best.trait] - a.trainee.ratings[best.trait]);
        if (diff !== 0) return diff;
        return (isPreferredFor(b.id, best.post.id) ? 1 : 0) - (isPreferredFor(a.id, best.post.id) ? 1 : 0);
      });
      var chosen = candidates[0];
      var slot = openSlotsFor(best.post.id)[0];
      slot.assigned = chosen;
      remaining = remaining.filter(function (c) { return c.id !== chosen.id; });
    }

    // ---- Step 2: continuous traits (strength/dexterity), global-minimum-first greedy ----
    function closenessCost(trainee, requirements, isPreferred) {
      var cost = Math.abs(trainee.ratings.strength - requirements.strength) +
        Math.abs(trainee.ratings.dexterity - requirements.dexterity);
      return isPreferred ? cost - PREFERENCE_BONUS : cost;
    }
    var allSlots = [];
    task.posts.forEach(function (post) { slotsByPost[post.id].forEach(function (s) { allSlots.push(s); }); });

    var openSlots = allSlots.filter(function (s) { return !s.assigned; });
    while (remaining.length && openSlots.length) {
      var bestPair = null;
      remaining.forEach(function (c) {
        openSlots.forEach(function (s) {
          var cost = closenessCost(c.trainee, postById[s.postId].requirements, isPreferredFor(c.id, s.postId));
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

    recomputePhoneCarriers(task, pools, postAssignments);

    return { postAssignments: postAssignments, spare: spare };
  }

  // Designates a phone carrier per post (highest responsibility among
  // assigned trainees, cohort seniority as tiebreak; guests/leaders excluded).
  // Called after runAutoAssign and again after any manual drag-swap, since a
  // swap can move the current carrier out of a post without re-running the
  // full algorithm.
  function recomputePhoneCarriers(task, pools, postAssignments) {
    var traineesById = {};
    (pools.trainees || []).forEach(function (t) { traineesById[t.id] = t; });
    task.posts.forEach(function (post) {
      var pa = postAssignments[post.id];
      if (!pa) return;
      var candidates = pa.workerIds
        .filter(function (w) { return w.t === 'ref' && w.rt === 'trainee'; })
        .map(function (w) { return traineesById[w.id]; })
        .filter(function (t) { return t && APP.util.cohortRank(t.cohort) > 0; });
      candidates.sort(function (a, b) {
        var diff = b.ratings.responsibility - a.ratings.responsibility;
        if (diff !== 0) return diff;
        return APP.util.cohortRank(b.cohort) - APP.util.cohortRank(a.cohort);
      });
      pa.phoneCarrierId = candidates.length ? candidates[0].id : null;
    });
  }

  return { runAutoAssign: runAutoAssign, recomputePhoneCarriers: recomputePhoneCarriers };
})();
