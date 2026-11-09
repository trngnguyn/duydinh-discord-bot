const CLASSES = Object.freeze([
  Object.freeze({ name: "Toái Mộng", emoji: "<:toai_mong:1478375213585662014>", order: 1 }),
  Object.freeze({ name: "Thiết Y", emoji: "<:thiet_y:1478375371245355019>", order: 2 }),
  Object.freeze({ name: "Huyết Hà", emoji: "<:huyet_ha:1478375513147052092>", order: 3 }),
  Object.freeze({ name: "Tố Vấn", emoji: "<:to_van:1478375305369489520>", order: 4 }),
  Object.freeze({ name: "Long Ngâm", emoji: "<:long_ngam:1478375160431247464>", order: 5 }),
  Object.freeze({ name: "Cửu Linh", emoji: "<:cuu_linh:1478375041224937604>", order: 6 }),
  Object.freeze({ name: "Thần Tương", emoji: "<:than_tuong:1478375101098496000>", order: 7 }),
  Object.freeze({ name: "Huyền Cơ", emoji: "<:huyen_co:1478375428472438785>", order: 8 })
]);

class ClassRegistry {
  /** Returns the canonical list in display order. */
  list() {
    return [...CLASSES];
  }

  /** Finds a configured class by its exact displayed name. */
  find(name) {
    return CLASSES.find(item => item.name === name) || null;
  }

  /** Returns whether a name belongs to the canonical class list. */
  has(name) {
    return this.find(name) !== null;
  }
}

module.exports = { CLASSES, ClassRegistry };
