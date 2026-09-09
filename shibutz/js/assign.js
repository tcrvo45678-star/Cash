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
//   3. Remaining candidates are filled one at a time: each round, the
//      least-served post (lowest filled/target ratio) picks its
//      cheapest-fit candidate by closeness to its strength/dexterity
//      targets. This keeps the result balanced by how well each post's
//      own requirement is met, regardless of the order posts were
//      created in - a post defined last still gets a fair turn instead
//      of whatever's left after earlier posts took the best matches.
//      Fixed-size posts are balanced against each other first; flexible
//      (workerCount == null) posts only start receiving people once
//      every fixed post has reached its target, then are balanced
//      against each other by raw headcount.
//   4. Surplus leaders (untraited) fill any posts still open, one at a
//      time to whichever open post is currently least-served - not
//      simply the first post in the list.
//   5. Anyone left over goes to "spare" - always shown, never dropped.
//   6. Any post that couldn't reach its configured headcount or a hard
//      quota is reported in `shortfalls` - assignment still happens for
//      everyone who could be placed, nothing blocks on a shortage.
APP.assign = (function () {
  function isGenderTrait(trait) { return trait === 'gender-male' || trait === 'gender-female'; }

  // The full requirements shape (strength/dexterity/responsibilityMinCount/
  // leadershipMinCount/genderMinCount) is guaranteed by storage.js's
  // migrate() on every load and JSON import, so no defensive guard is
  // needed here.
  function quotaTarget(post, trait) {
    var r = post.requirements;
    if (trait === 'responsibility') return r.responsibilityMinCount.count;
    if (trait === 'leadership') return r.leadershipMinCount.count;
    if (trait === 'gender-male') return r.genderMinCount.male;
    if (trait === 'gender-female') return r.genderMinCount.female;
    return 0;
  }

  // Gender has no 1-7 "level" to relax like a rating does - it either
  // matches or it doesn't, so `level` is ignored for gender traits.
  function matchesTrait(trainee, trait, level) {
    if (trait === 'gender-male') return trainee.gender === 'm';
    if (trait === 'gender-female') return trainee.gender === 'f';
    return trainee.ratings[trait] >= level;
  }

  // A post's leader works the post too - everyone works together - so a
  // post configured for N people is N total INCLUDING its leader, not N
  // plus the leader on top. A post with workerCount 5 and a leader only
  // has 4 more slots to fill from the trainee/guest/surplus-leader pool.
  function hasLeader(post) {
    return !!(post.leader && post.leader.t === 'ref' && post.leader.rt === 'leader' && post.leader.id);
  }
  function postCapacity(post) {
    if (post.workerCount == null) return null;
    return Math.max(0, post.workerCount - (hasLeader(post) ? 1 : 0));
  }
  function capacityFor(post) {
    var cap = postCapacity(post);
    return cap == null ? Infinity : cap;
  }

  // Purely cosmetic ordering for the final row layout: same-cohort trainees
  // (same grid color) end up adjacent instead of scattered in whatever
  // order the algorithm happened to place them, guests come after all
  // trainees, and surplus leaders (no cohort color of their own) come last.
  function colorClusterKey(c) {
    if (c.leader) return 1000;
    if (c.kind === 'guest') return 500;
    var cohort = (c.trainee && c.trainee.cohort) || 'e';
    return 100 - APP.util.cohortRank(cohort);
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
    // How "served" a post is so far, for balancing across posts regardless
    // of which order they were created in. A fixed-size post is measured
    // against its own target (0 = empty, 1 = full); a flexible post has no
    // target to be a fraction of, so it's measured by raw headcount instead
    // - only ever compared against other flexible posts (see phase 2/3),
    // never mixed with a fixed post's ratio.
    function fillMetric(post) {
      var cap = capacityFor(post);
      if (cap === Infinity) return assignedByPost[post.id].length;
      return assignedByPost[post.id].length / cap;
    }

    var remaining = trainees.map(function (t) { return { id: t.id, trainee: t, kind: 'trainee' }; })
      .concat((task.extraGuests || []).map(function (g) { return { id: g.id, trainee: g, kind: 'guest' }; }));

    // unsatisfiable[postId|trait] feeds the shortfalls list built at the end -
    // shared by every phase below (specialists, quota traits) that reports
    // "couldn't meet this requirement" the same way, so declared once here.
    var unsatisfiable = {};

    // Cost only depends on the POST's requirements, so every open slot in
    // the same post is identical - evaluate per post, not per slot. Used
    // below by both Phase 0 (ranking competing squad members for one post)
    // and Phase 2 (picking who fills a post's remaining open slots).
    function closenessCost(trainee, requirements, isPreferred) {
      var cost = Math.abs(trainee.ratings.strength - requirements.strength) +
        Math.abs(trainee.ratings.dexterity - requirements.dexterity) +
        Math.abs(trainee.ratings.fineMotor - requirements.fineMotor);
      return isPreferred ? cost - PREFERENCE_BONUS : cost;
    }

    // ---- Phase 0: specialist "squad" quota, dominant over every other trait ----
    // A post can require that some % of its (non-leader) capacity come from
    // a job template's "squad" (postTemplates[].specialistTraineeIds) - this
    // runs before anything else so those seats are locked in first. Squad
    // membership is binary (no 1-7 "level" to relax like a rating), so a
    // shortage degrades the same way gender quotas do below: report it via
    // the shared `unsatisfiable` map and move on, rather than inventing a
    // new relaxation mechanism. Flexible posts (workerCount == null) have no
    // fixed capacity to take a % of, so the requirement isn't enforced on
    // them - a squad member can still land there via the normal phases.
    var postsById = {};
    task.posts.forEach(function (post) { postsById[post.id] = post; });
    var postTemplatesById = {};
    (pools.postTemplates || []).forEach(function (tpl) { postTemplatesById[tpl.id] = tpl; });
    var specialistTargets = {};
    task.posts.forEach(function (post) {
      if (typeof post.specialistPercent !== 'number' || !post.templateId) return;
      var tpl = postTemplatesById[post.templateId];
      var squadIds = tpl ? (tpl.specialistTraineeIds || []) : [];
      var cap = capacityFor(post);
      if (cap === Infinity || !squadIds.length) return;
      var count = Math.ceil((post.specialistPercent / 100) * cap);
      if (count > 0) specialistTargets[post.id] = { count: count, squadIds: squadIds };
    });

    function specialistHave(postId) {
      var squadIds = specialistTargets[postId].squadIds;
      return assignedByPost[postId].filter(function (c) { return c.kind === 'trainee' && squadIds.indexOf(c.id) >= 0; }).length;
    }
    function specialistAvailableCount(postId) {
      var squadIds = specialistTargets[postId].squadIds;
      return remaining.filter(function (c) { return c.kind === 'trainee' && squadIds.indexOf(c.id) >= 0; }).length;
    }

    var pendingSpecialistPosts = Object.keys(specialistTargets);
    while (pendingSpecialistPosts.length) {
      pendingSpecialistPosts = pendingSpecialistPosts.filter(function (postId) {
        return specialistHave(postId) < specialistTargets[postId].count && openCapacity(postsById[postId]) > 0;
      });
      if (!pendingSpecialistPosts.length) break;
      // Scarcity-based priority: the post whose own squad has the fewest
      // people still available goes first each round, recomputed every
      // time since placing someone shrinks availability for whoever else
      // is competing over the same specialists.
      pendingSpecialistPosts.sort(function (a, b) { return specialistAvailableCount(a) - specialistAvailableCount(b); });
      var specialistPostId = pendingSpecialistPosts[0];
      var specialistPost = postsById[specialistPostId];
      var squadIds = specialistTargets[specialistPostId].squadIds;
      var squadCandidates = remaining.filter(function (c) { return c.kind === 'trainee' && squadIds.indexOf(c.id) >= 0; });
      if (!squadCandidates.length) {
        pendingSpecialistPosts = pendingSpecialistPosts.filter(function (id) { return id !== specialistPostId; });
        continue;
      }
      // Among several specialists competing for this one post, still rank
      // by the regular fit criteria (closeness to the post's own
      // strength/dexterity/fineMotor requirements) - the dominance is about
      // WHETHER a squad member fills the seat, not about ignoring fit once
      // several are available.
      squadCandidates.sort(function (a, b) {
        return closenessCost(a.trainee, specialistPost.requirements, isPreferredFor(a.id, specialistPostId)) -
          closenessCost(b.trainee, specialistPost.requirements, isPreferredFor(b.id, specialistPostId));
      });
      var chosenSpecialist = squadCandidates[0];
      assignedByPost[specialistPostId].push(chosenSpecialist);
      remaining = remaining.filter(function (c) { return c.id !== chosenSpecialist.id; });
    }
    Object.keys(specialistTargets).forEach(function (postId) {
      if (specialistHave(postId) < specialistTargets[postId].count) {
        unsatisfiable[postId + '|specialist'] = true;
      }
    });

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
          // Tie-break by which post is least-served so far, not by which
          // post happens to come first in the array - otherwise the
          // earliest-created post wins every tied round and ends up
          // consistently better-served than posts defined later.
          if (!best || urgency > best.urgency || (urgency === best.urgency && fillMetric(post) < fillMetric(best.post))) {
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

    // ---- Phase 2: continuous traits (strength/dexterity), least-served-post-first ----
    // Cost only depends on the POST's requirements, so every open slot in
    // the same post is identical - evaluate per post, not per slot. Posts
    // with a fixed headcount are balanced against each other by how much of
    // their own target is filled so far (a post defined last still gets its
    // fair turn instead of getting whatever's left after earlier posts ate
    // the best matches); flexible (unlimited) posts only start receiving
    // people once every fixed post has reached its target, and are then
    // balanced against each other the same way, by raw headcount so far.
    // (closenessCost itself is defined up in Phase 0, since that phase needs
    // it too.)
    var openPosts = task.posts.filter(hasOpenCapacity);
    while (remaining.length && openPosts.length) {
      var fixedOpen = openPosts.filter(function (p) { return capacityFor(p) !== Infinity; });
      var pool = fixedOpen.length ? fixedOpen : openPosts;
      var targetPost = pool.reduce(function (least, p) {
        return (!least || fillMetric(p) < fillMetric(least)) ? p : least;
      }, null);
      var bestCandidate = null;
      remaining.forEach(function (c) {
        var cost = closenessCost(c.trainee, targetPost.requirements, isPreferredFor(c.id, targetPost.id));
        if (!bestCandidate || cost < bestCandidate.cost) bestCandidate = { candidate: c, cost: cost };
      });
      assignedByPost[targetPost.id].push(bestCandidate.candidate);
      remaining = remaining.filter(function (c) { return c.id !== bestCandidate.candidate.id; });
      openPosts = task.posts.filter(hasOpenCapacity);
    }

    // ---- Phase 3: surplus leaders fill whatever is left, least-served-post-first ----
    var leaderQueue = surplusLeaders.slice();
    while (leaderQueue.length) {
      var openPostsForLeaders = task.posts.filter(hasOpenCapacity);
      if (!openPostsForLeaders.length) break;
      var leastServedPost = openPostsForLeaders.reduce(function (least, p) {
        return (!least || fillMetric(p) < fillMetric(least)) ? p : least;
      }, null);
      assignedByPost[leastServedPost.id].push({ id: leaderQueue[0].id, leader: leaderQueue[0] });
      leaderQueue.shift();
    }

    // ---- build output ----
    var postAssignments = {};
    var shortfalls = [];
    task.posts.forEach(function (post) {
      var assigned = assignedByPost[post.id];
      // Cluster by color before laying out the rows: same-cohort trainees
      // sit together, then guests, then surplus leaders - so the printed/
      // on-screen table reads as clean color blocks instead of a scatter
      // in whatever order the algorithm happened to pick people.
      assigned = assigned.slice().sort(function (a, b) { return colorClusterKey(a) - colorClusterKey(b); });
      var workerIds = assigned.map(function (c) {
        if (c.trainee) return APP.state.refVal(c.kind || 'trainee', c.id);
        if (c.leader) return APP.state.refVal('leader', c.id);
        return APP.state.emptyVal();
      });
      // Fixed-size posts still show an empty row for each unfilled slot
      // (up to the post's real capacity, i.e. excluding the leader's own
      // slot); flexible posts show exactly what was assigned, nothing
      // padded.
      var cap = postCapacity(post);
      if (cap != null) {
        while (workerIds.length < cap) workerIds.push(APP.state.emptyVal());
        if (assigned.length < cap) {
          shortfalls.push({ postId: post.id, type: 'headcount', missing: cap - assigned.length });
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

    recomputeResponsibleRoles(task, pools, postAssignments);

    return { postAssignments: postAssignments, spare: spare, shortfalls: shortfalls };
  }

  // Designates the three per-post responsible roles (phone, study, water) -
  // same selection method for all three (highest responsibility among
  // assigned trainees, cohort seniority as tiebreak; guests/leaders
  // excluded), each role taking the next-best candidate so the three are
  // always distinct people rather than the same trainee three times over.
  // Called after runAutoAssign and again after any manual drag-swap, since a
  // swap can move a current holder out of a post without re-running the
  // full algorithm.
  function recomputeResponsibleRoles(task, pools, postAssignments) {
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
      pa.phoneCarrierId = candidates[0] ? candidates[0].id : null;
      pa.studyResponsibleId = candidates[1] ? candidates[1].id : null;
      pa.waterResponsibleId = candidates[2] ? candidates[2].id : null;
    });
  }

  return { runAutoAssign: runAutoAssign, recomputeResponsibleRoles: recomputeResponsibleRoles, postCapacity: postCapacity };
})();
