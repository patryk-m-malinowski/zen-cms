qx.Class.define("zx.test.util.LruCache", {
  extend: qx.dev.unit.TestCase,

  members: {
    testLruCache() {
      let cache = new zx.utils.LruCache(3);
      this.assertTrue(cache.get("a") === null);
      this.assertTrue(cache.get("b") === null);
      this.assertTrue(cache.get("c") === null);

      cache.put("a", 1);
      cache.put("b", 2);
      cache.put("c", 3);

      this.assertEquals(1, cache.get("a"));
      this.assertEquals(2, cache.get("b"));
      this.assertEquals(3, cache.get("c"));

      cache.put("d", 4); // should evict "a"

      this.assertEquals(null, cache.get("a"));
      this.assertEquals(2, cache.get("b"));
      this.assertEquals(3, cache.get("c"));
      this.assertEquals(4, cache.get("d"));

      cache.get("b"); // access "b" to make it most recently used
      cache.put("e", 5); // should evict "c"

      this.assertEquals(null, cache.get("c"));
      this.assertEquals(2, cache.get("b"));
      this.assertEquals(4, cache.get("d"));
      this.assertEquals(5, cache.get("e"));
    }
  }
});
