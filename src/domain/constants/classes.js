const CLASSES = Object.freeze([
  Object.freeze({ name: "Toái Mộng", emoji: "<:1suimeng:1478375213585662014>", order: 1 }),
  Object.freeze({ name: "Thiết Y", emoji: "<:1tieyi:1478375371245355019>", order: 2 }),
  Object.freeze({ name: "Huyết Hà", emoji: "<:1xuehe:1478375513147052092>", order: 3 }),
  Object.freeze({ name: "Tố Vấn", emoji: "<:1suwen:1478375305369489520>", order: 4 }),
  Object.freeze({ name: "Long Ngâm", emoji: "<:1longyin:1478375160431247464>", order: 5 }),
  Object.freeze({ name: "Cửu Linh", emoji: "<:1jiuling:1478375041224937604>", order: 6 }),
  Object.freeze({ name: "Thần Tương", emoji: "<:1shenxiang:1478375101098496000>", order: 7 }),
  Object.freeze({ name: "Huyền Cơ", emoji: "<:1xuanji:1478375428472438785>", order: 8 })
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
