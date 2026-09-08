window.APP = window.APP || {};

// Pure, DOM-free auto-assignment algorithm.
// runAutoAssign(task, pools) -> { postAssignments, spare, shortfalls }
//
// See /root/.claude/plans (or the project README) for the full design
// writeup. Summary:
//   1. Candidate pool = non-absent trainees + this task's ad-hoc guests
//      + surplus team leaders (leaders not already chosen as a post's
//      primary leader today).
//   2. Quota traits (responsibility/leadership/gender "at least N at
//      level >= L") are satisfied first, in interleaved rounds across
//      all posts at once (highest deficit-urgency wins each round),
//      relaxing the level gradually when not enough candidates qualify.
//   3. Remaining candidates are filled by repeatedly picking the single
//      globally-cheapest (candidate, post) pair by closeness to the
//      post's strength/dexterity targets - this global-minimum-first
//      approach is what keeps the result balanced across posts instead
//      of dumping leftovers on the last one. Cost is evaluated per POST
//      (not per open slot) since every open slot in the same post has
//      identical cost - a post with workerCount == null ("flexible")
//      has unlimited capacity and simply never drops out of contention.
//   4. Surplus leaders (untraited) fill any posts still open, in simple
//      pool order.
//   5. Anyone left over goes to "spare" - always shown, never dropped.
//   6. Any post that couldn't reach its configured headcount or a hard
//      quota is reported in `shortfalls` - assignment still happens for
//      everyone who could be placed, nothing blocks on a shortage.
APP.assign = (function () {
  function isGenderTrait(trait) { return trait === 'gender-male' || trait === 'gender-female'; }

  // Defensive against posts saved before a requirement field existed (an
  // older export/import, or one carried forward from before this session's
  // changes) - without this, a single malformed post throws and blocks
  // runAutoAssign for the whole task, which used to also block the modal
  // that triggered it from ever closing.
  function quotaTarget(post, trait) {
    if (trait === 'responsibility') return (post.requirements.responsibilityMinCount && post.requirements.responsibilityMinCount.count) || 0;
    if (trait === 'leadership') return (post.requirements.leadershipMinCount && post.requirements.leadershipMinCount.count) || 0;
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

  function capacityFor(post) { return post.workerCount != null ? post.workerCount : Infinity; }

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

    // assignedByPost[postId] grows as candidates are placed - no more
    // pre-built slot objects, so cost/capacity work off the post itself.
    var assignedByPost = {};
    task.posts.forEach(function (post) { assignedByPost[post.id] = []; });

    function openCapacity(post) { return capacityFor(post) - assignedByPost[post.id].length; }
    function hasOpenCapacity(post) { return openCapacity(post) > 0; }
    function quotaMetCount(postId, trait, level) {
      return assignedByPost[postId].filter(function (c) {
        return c.trainee && matchesTrait(c.trainee, trait, level);
      }).length;
    }

    var remaining = trainees.map(function (t) { return { id: t.id, trainee: t, kind: 'trainee' }; })
      .concat((task.extraGuests || []).map(function (g) { return { id: g.id, trainee: g, kind: 'guest' }; }));

    // ---- Phase 1: quota traits, interleaved by urgency, gradual relaxation ----
    var quotaTraits = ['responsibility', 'leadership', 'gender-male', 'gender-female'];
    var relaxedLevel = {};
    task.posts.forEach(function (post) {
      relaxedLevel[post.id] = {
        responsibility: (post.requirements.responsibilityMinCount && post.requirements.responsibilityMinCount.level) || 5,
        leadership: (post.requirements.leadershipMinCount && post.requirements.leadershipMinCount.level) || 5,
        'gender-male': 1,
        'gender-female': 1
      };
    });
    var unsatisfiable = {};

    while (remaining.length) {
      var best = null;
      task.posts.forEach(function (post) {
        var open = openCapacity(post);
        if (open <= 0) return;
        quotaTraits.forEach(function (trait) {
          var key = post.id + '|' + trait;
          if (unsatisfiable[key]) return;
          var target = quotaTarget(post, trait);
          if (target <= 0) return;
          var level = relaxedLevel[post.id][trait];
          var have = quotaMetCount(post.id, trait, level);
          var deficit = target - have;
          if (deficit <= 0) return;
          // A flexible post's open capacity is Infinity - Math.min caps
          // urgency at the post's own target so it stays on the same
          // scale as a fixed-size post instead of being diluted to 0.
          var urgency = deficit / Math.min(open, target);
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
      assignedByPost[best.post.id].push(chosen);
      remaining = remaining.filter(function (c) { return c.id !== chosen.id; });
    }

    // ---- Phase 2: continuous traits (strength/dexterity), global-minimum-first greedy ----
    // Cost only depends on the POST's requirements, so every open slot in
    // the same post is identical - evaluate per post, not per slot. This
    // is what keeps a flexible post's unlimited capacity cheap: the loop
    // scales with the number of POSTS, not the number of slots.
    function closenessCost(trainee, requirements, isPreferred) {
      var cost = Math.abs(trainee.ratings.strength - requirements.strength) +
        Math.abs(trainee.ratings.dexterity - requirements.dexterity);
      return isPreferred ? cost - PREFERENCE_BONUS : cost;
    }
    var openPosts = task.posts.filter(hasOpenCapacity);
    while (remaining.length && openPosts.length) {
      var bestPair = null;
      remaining.forEach(function (c) {
        openPosts.forEach(function (post) {
          var cost = closenessCost(c.trainee, post.requirements, isPreferredFor(c.id, post.id));
          if (!bestPair || cost < bestPair.cost) bestPair = { candidate: c, post: post, cost: cost };
        });
      });
      assignedByPost[bestPair.post.id].push(bestPair.candidate);
      remaining = remaining.filter(function (c) { return c.id !== bestPair.candidate.id; });
      openPosts = task.posts.filter(hasOpenCapacity);
    }

    // ---- Phase 3: surplus leaders fill whatever is left, simple pool order ----
    var leaderQueue = surplusLeaders.slice();
    while (leaderQueue.length) {
      var openPost = task.posts.filter(hasOpenCapacity)[0];
      if (!openPost) break;
      assignedByPost[openPost.id].push({ id: leaderQueue[0].id, leader: leaderQueue[0] });
      leaderQueue.shift();
    }

    // ---- build output ----
    var postAssignments = {};
    var shortfalls = [];
    task.posts.forEach(function (post) {
      var assigned = assignedByPost[post.id];
      var workerIds = assigned.map(function (c) {
        if (c.trainee) return APP.state.refVal(c.kind || 'trainee', c.id);
        if (c.leader) return APP.state.refVal('leader', c.id);
        return APP.state.emptyVal();
      });
      // Fixed-size posts still show an empty row for each unfilled slot;
      // flexible posts show exactly what was assigned, nothing padded.
      if (post.workerCount != null) {
        while (workerIds.length < post.workerCount) workerIds.push(APP.state.emptyVal());
        if (assigned.length < post.workerCount) {
          shortfalls.push({ postId: post.id, type: 'headcount', missing: post.workerCount - assigned.length });
        }
      }
      postAssignments[post.id] = { workerIds: workerIds };
    });
    Object.keys(unsatisfiable).forEach(function (key) {
      var parts = key.split('|');
      shortfalls.push({ postId: parts[0], type: 'quota', trait: parts[1] });
    });

    var spare = remaining.map(function (c) { return APP.state.refVal(c.kind || 'trainee', c.id); })
      .concat(leaderQueue.map(function (l) { return APP.state.refVal('leader', l.id); }));

    recomputePhoneCarriers(task, pools, postAssignments);

    return { postAssignments: postAssignments, spare: spare, shortfalls: shortfalls };
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
