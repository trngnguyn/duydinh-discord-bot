const CLASSES = Object.freeze([
  Object.freeze({ name: "Toái Mộng", emoji: "<:to_van:1564176950321225861>", order: 1 }),
  Object.freeze({ name: "Thiết Y", emoji: "<:than_tuong:1564176961583063130>", order: 2 }),
  Object.freeze({ name: "Huyết Hà", emoji: "<:cuu_linh:1564176957954859048>", order: 3 }),
  Object.freeze({ name: "Tố Vấn", emoji: "<:long_ngam:1564176953534320642>", order: 4 }),
  Object.freeze({ name: "Long Ngâm", emoji: "<:thiet_y:1564176942683525150>", order: 5 }),
  Object.freeze({ name: "Cửu Linh", emoji: "<:toai_mong:1564176938921361529>", order: 6 }),
  Object.freeze({ name: "Thần Tương", emoji: "<:huyet_ha:1564176946823172137>", order: 7 })
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
