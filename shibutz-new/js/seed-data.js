window.APP = window.APP || {};

// One-time import of historical team data (from a 2.7.2023 schedule sheet).
// Runs at most once ever (guarded by a dedicated localStorage flag, kept
// separate from the main app data blob so it doesn't interact with
// storage.js's schema/migration logic).
APP.seedData = (function () {
  var SEED_FLAG_KEY = 'shibutz.seed.20230702';
  var BACKFILL_FLAG_KEY = 'shibutz.seed.20230702.backfilled';

  var SEED_LEADERS = ['אלה', 'נדב', 'מעיין', 'נטע', 'יעל'];

  var SEED_FARMERS = ['אהרון קורקוס'];

  // name/cohort/gender extracted from the same 2.7.2023 schedule sheet
  // (colors: b=כתום/יב, c=סגול/יא, d=כחול/י, e=ירוק בהיר/ט, guest=צהוב).
  // gender is a best-effort guess from the Hebrew name - low confidence in
  // places (flagged '?' below at the time this was written) - review and
  // correct via the "חניכים" tab as needed.
  var SEED_TRAINEES = [
    { name: 'רותם', cohort: 'c', gender: 'm' }, { name: 'טוביה', cohort: 'c', gender: 'm' },
    { name: 'מנחם', cohort: 'c', gender: 'm' }, { name: 'אור', cohort: 'c', gender: 'm' },
    { name: 'שלהם', cohort: 'c', gender: 'm' }, { name: 'עידו', cohort: 'c', gender: 'm' },
    { name: 'נחום', cohort: 'c', gender: 'm' }, { name: 'אלינור', cohort: 'c', gender: 'f' },
    { name: 'דורון', cohort: 'c', gender: 'm' }, { name: 'ינון', cohort: 'c', gender: 'm' },
    { name: 'שחר', cohort: 'c', gender: 'm' }, { name: 'שחקו', cohort: 'c', gender: 'm' },
    { name: 'גליה', cohort: 'c', gender: 'f' }, { name: 'מתן', cohort: 'c', gender: 'm' },
    { name: 'אלאור', cohort: 'c', gender: 'm' },
    { name: 'זוהר', cohort: 'd', gender: 'm' }, { name: 'רני', cohort: 'd', gender: 'm' },
    { name: 'זיו', cohort: 'd', gender: 'm' }, { name: 'נעמה', cohort: 'd', gender: 'f' },
    { name: 'גילי', cohort: 'd', gender: 'f' }, { name: 'אביה', cohort: 'd', gender: 'f' },
    { name: 'כפיר', cohort: 'd', gender: 'm' }, { name: 'אופיר', cohort: 'd', gender: 'm' },
    { name: 'נדס', cohort: 'b', gender: 'm' }, { name: 'פצע', cohort: 'b', gender: 'm' },
    { name: 'ליאל', cohort: 'b', gender: 'f' },
    { name: 'עומר', cohort: 'd', gender: 'm' }, { name: 'עדי רנה', cohort: 'b', gender: 'f' },
    { name: 'קרינקין', cohort: 'b', gender: 'm' }, { name: 'לוגסי', cohort: 'b', gender: 'm' },
    { name: 'אורילה', cohort: 'b', gender: 'f' }, { name: 'יהונתן', cohort: 'b', gender: 'm' },
    { name: 'דוידוב', cohort: 'b', gender: 'm' },
    { name: 'יעלה', cohort: 'guest', gender: 'f' }, { name: 'פריאל', cohort: 'b', gender: 'f' },
    { name: 'ארד', cohort: 'b', gender: 'm' }, { name: 'גיל', cohort: 'e', gender: 'm' },
    { name: 'יואב', cohort: 'e', gender: 'm' }, { name: 'טליה', cohort: 'e', gender: 'f' },
    { name: 'מאיה', cohort: 'e', gender: 'f' }, { name: 'אוהד', cohort: 'e', gender: 'm' },
    { name: 'נעמי', cohort: 'e', gender: 'f' }, { name: 'שיר', cohort: 'e', gender: 'f' },
    { name: 'הגר', cohort: 'e', gender: 'f' }, { name: "זוהר ר'", cohort: 'e', gender: 'm' },
    { name: 'גלי', cohort: 'e', gender: 'f' }, { name: 'רעות', cohort: 'e', gender: 'f' },
    { name: 'ניצן', cohort: 'e', gender: 'm' },
    { name: 'נועה', cohort: 'c', gender: 'f' }, { name: 'נחלה', cohort: 'c', gender: 'f' },
    { name: 'נועלה', cohort: 'c', gender: 'f' }
  ];

  var DEFAULT_RATINGS = { strength: 4, dexterity: 4, responsibility: 4, leadership: 4 };

  function hasFlag() {
    try { return localStorage.getItem(SEED_FLAG_KEY) === '1'; } catch (e) { return true; }
  }
  function setFlag() {
    try { localStorage.setItem(SEED_FLAG_KEY, '1'); } catch (e) {}
  }
  function hasBackfillFlag() {
    try { return localStorage.getItem(BACKFILL_FLAG_KEY) === '1'; } catch (e) { return true; }
  }
  function setBackfillFlag() {
    try { localStorage.setItem(BACKFILL_FLAG_KEY, '1'); } catch (e) {}
  }

  function existsByName(list, name) {
    var norm = name.trim().toLowerCase();
    return list.some(function (x) { return x.name.trim().toLowerCase() === norm; });
  }

  // Trainees already seeded in a past session (before cohort/gender existed)
  // won't get re-created by the name-based dedup above, so their cohort/
  // gender would stay stuck at storage.js's generic defaults ('e'/'m')
  // forever. This runs every load and fixes any of the 51 known names.
  function backfillCohortsAndGenders(d) {
    var byName = {};
    SEED_TRAINEES.forEach(function (t) { byName[t.name.trim().toLowerCase()] = t; });
    var changed = false;
    d.pools.trainees.forEach(function (existing) {
      var known = byName[existing.name.trim().toLowerCase()];
      if (!known) return;
      if (existing.cohort !== known.cohort) { existing.cohort = known.cohort; changed = true; }
      if (existing.gender !== known.gender) { existing.gender = known.gender; changed = true; }
    });
    if (changed) APP.state.save();
  }

  function seedInitialTeamIfNeeded() {
    // Always check if data is actually present, regardless of flag
    // (in case localStorage was cleared or data is missing)
    var d = APP.state.get();
    if (!hasBackfillFlag()) {
      backfillCohortsAndGenders(d);
      setBackfillFlag();
    }

    var leadersMissing = SEED_LEADERS.some(function (name) { return !existsByName(d.pools.leaders, name); });
    var traineesMissing = SEED_TRAINEES.some(function (t) { return !existsByName(d.pools.trainees, t.name); });
    var farmersMissing = SEED_FARMERS.some(function (name) { return !existsByName(d.pools.farmers, name); });

    // If flag is set AND all data is present, skip
    if (hasFlag() && !leadersMissing && !traineesMissing && !farmersMissing) return;

    var addedLeaders = 0, addedTrainees = 0, addedFarmers = 0;

    SEED_LEADERS.forEach(function (name) {
      if (!existsByName(d.pools.leaders, name)) {
        APP.state.addLeader(name);
        addedLeaders++;
      }
    });

    SEED_FARMERS.forEach(function (name) {
      if (!existsByName(d.pools.farmers, name)) {
        APP.state.addFarmer(name);
        addedFarmers++;
      }
    });

    SEED_TRAINEES.forEach(function (t) {
      if (!existsByName(d.pools.trainees, t.name)) {
        APP.state.addTrainee(t.name, {
          strength: DEFAULT_RATINGS.strength,
          dexterity: DEFAULT_RATINGS.dexterity,
          responsibility: DEFAULT_RATINGS.responsibility,
          leadership: DEFAULT_RATINGS.leadership
        }, t.cohort, t.gender);
        addedTrainees++;
      }
    });

    if (addedLeaders || addedTrainees || addedFarmers) {
      setFlag();
      alert(
        'נטענו ' + addedLeaders + ' אנשי צוות, ' + addedTrainees + ' חניכים' +
        (addedFarmers ? ' וחקלאי אחד' : '') +
        ' מהייבוא הראשוני.\nמומלץ לעבור על הרשימות בלשוניות "חניכים" ו"אנשי צוות" ולתקן שמות/דירוגים/מגדר/מחזור במידת הצורך (המגדר נוחש אוטומטית מהשם ועלול לטעות).'
      );
    }
  }

  return { seedInitialTeamIfNeeded: seedInitialTeamIfNeeded };
})();
