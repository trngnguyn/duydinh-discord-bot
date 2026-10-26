const AFFILIATIONS = Object.freeze([
  Object.freeze({ code: "guild", name: "Cửu Vĩ Thần Cung" }),
  Object.freeze({ code: "guest", name: "Khách Scrim" })
]);

const DEFAULT_AFFILIATION = "guild";

/** Reads a stored affiliation, treating older records as guild members. */
function affiliationOf(record) {
  const code = record?.affiliation;
  return AFFILIATIONS.some(item => item.code === code) ? code : DEFAULT_AFFILIATION;
}

/** Returns the label shown to players. */
function affiliationName(code) {
  return AFFILIATIONS.find(item => item.code === affiliationOf({ affiliation: code })).name;
}

module.exports = { AFFILIATIONS, DEFAULT_AFFILIATION, affiliationOf, affiliationName };
