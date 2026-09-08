window.APP = window.APP || {};

// One-time import of historical team data (from a 2.7.2023 schedule sheet).
// Runs at most once ever (guarded by a dedicated localStorage flag, kept
// separate from the main app data blob so it doesn't interact with
// storage.js's schema/migration logic).
APP.seedData = (function () {
  var SEED_FLAG_KEY = 'shibutz.seed.20230702';

  var SEED_LEADERS = ['אלה', 'נדב', 'מעיין', 'נטע', 'יעל'];

  var SEED_FARMERS = ['אהרון קורקוס'];

  var SEED_TRAINEES = [
    'רותם', 'טוביה', 'מנחם', 'אור', 'שלהם', 'עידו', 'נחום', 'אלינור',
    'דורון', 'ינון', 'שחר', 'שחקו', 'גליה', 'מתן', 'אלאור',
    'זוהר', 'רני', 'זיו', 'נעמה', 'גילי', 'אביה', 'כפיר', 'אופיר',
    'נדס', 'פצע', 'ליאל',
    'עומר', 'עדי רנה', 'קרינקין', 'לוגסי', 'אורילה', 'יהונתן', 'דוידוב',
    'יעלה', 'פריאל', 'ארד', 'גיל', 'יואב', 'טליה', 'מאיה', 'אוהד',
    'נעמי', 'שיר', 'הגר', "זוהר ר'", 'גלי', 'רעות', 'ניצן',
    'נועה', 'נחלה', 'נועלה'
  ];

  var DEFAULT_RATINGS = { strength: 4, dexterity: 4, responsibility: 4, leadership: 4 };

  function hasFlag() {
    try { return localStorage.getItem(SEED_FLAG_KEY) === '1'; } catch (e) { return true; }
  }
  function setFlag() {
    try { localStorage.setItem(SEED_FLAG_KEY, '1'); } catch (e) {}
  }

  function existsByName(list, name) {
    var norm = name.trim().toLowerCase();
    return list.some(function (x) { return x.name.trim().toLowerCase() === norm; });
  }

  function seedInitialTeamIfNeeded() {
    // Always check if data is actually present, regardless of flag
    // (in case localStorage was cleared or data is missing)
    var d = APP.state.get();
    var leadersMissing = SEED_LEADERS.some(function (name) { return !existsByName(d.pools.leaders, name); });
    var traineesMissing = SEED_TRAINEES.some(function (name) { return !existsByName(d.pools.trainees, name); });
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

    SEED_TRAINEES.forEach(function (name) {
      if (!existsByName(d.pools.trainees, name)) {
        APP.state.addTrainee(name, {
          strength: DEFAULT_RATINGS.strength,
          dexterity: DEFAULT_RATINGS.dexterity,
          responsibility: DEFAULT_RATINGS.responsibility,
          leadership: DEFAULT_RATINGS.leadership
        });
        addedTrainees++;
      }
    });

    if (addedLeaders || addedTrainees || addedFarmers) {
      setFlag();
      alert(
        'נטענו ' + addedLeaders + ' אנשי צוות, ' + addedTrainees + ' חניכים' +
        (addedFarmers ? ' וחקלאי אחד' : '') +
        ' מהייבוא הראשוני.\nמומלץ לעבור על הרשימות בלשוניות "חניכים" ו"אנשי צוות" ולתקן שמות/דירוגים במידת הצורך.'
      );
    }
  }

  return { seedInitialTeamIfNeeded: seedInitialTeamIfNeeded };
})();
