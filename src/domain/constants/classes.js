const CLASSES = Object.freeze([
  Object.freeze({ name: "Toái Mộng", emoji: "<:toaimong:1569183910129303723>", order: 1 }),
  Object.freeze({ name: "Thiết Y", emoji: "<:thiety:1569183999979692102>", order: 2 }),
  Object.freeze({ name: "Huyết Hà", emoji: "<:huyetha:1569184205295067166>", order: 3 }),
  Object.freeze({ name: "Tố Vấn", emoji: "<:tovan:1569183950746812456>", order: 4 }),
  Object.freeze({ name: "Long Ngâm", emoji: "<:longngam:1569183827555786842>", order: 5 }),
  Object.freeze({ name: "Cửu Linh", emoji: "<:cuulinh:1569183767623639152>", order: 6 }),
  Object.freeze({ name: "Thần Tương", emoji: "<:thantuong:1569183873424826450>", order: 7 }),
  Object.freeze({ name: "Huyền Cơ", emoji: "<:huyenco:1569184072113061888>", order: 8 })
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
