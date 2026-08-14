function boolToHe(v) {
  return v ? 'כן' : 'לא';
}
function heToBool(v) {
  return v === 'כן' || v === true;
}

module.exports = { boolToHe, heToBool };
