/**
 * Copyright https://www.geeksforgeeks.org/javascript/lru-cache-using-javascript/
 */

/**
 * Simple LRU cache with a fixed maximum size.
 *
 * @typedef ListNode
 * @property {Object} key
 * @property {Object} value
 * @property {ListNode|null} prev
 * @property {ListNode|null} next
 */
qx.Class.define("zx.utils.LruCache", {
  extend: qx.core.Object,

  construct(maxSize) {
    super();
    this.__cache = new Map();
    this.__maxSize = maxSize;
    this.__head = this.__createNode(null, null);
    this.__tail = this.__createNode(null, null);
    this.__head.next = this.__tail;
    this.__tail.prev = this.__head;
  },

  members: {
    /** @type{Map<Object,ListNode>} cache entries */
    __cache: null,

    /** @type{Integer} maximum size of the cache */
    __maxSize: null,

    /** @type{ListNode} the node at the head of the list */
    __head: null,

    /** @type{ListNode} the node at the tail of the list */
    __tail: null,

    /**
     * Creates a new list node
     *
     * @param {*} key
     * @param {*} value
     * @returns {ListNode}
     */
    __createNode(key, value) {
      return {
        key: key,
        value: value,
        prev: null,
        next: null
      };
    },

    /**
     * Returns an array of all keys in the cache
     *
     * @returns {String[]}
     */
    keys() {
      return Array.from(this.__cache.keys());
    },

    /**
     * Gets a value from the cache
     *
     * @param {*} key
     * @returns {*}
     */
    get(key) {
      if (this.__cache.has(key)) {
        let node = this.__cache.get(key);
        this._remove(node);
        this._add(node);
        return node.value;
      }
      return null;
    },

    /**
     * Puts a value into the cache
     *
     * @param {*} key
     * @param {*} value
     */
    put(key, value) {
      if (this.__cache.has(key)) {
        let node = this.__cache.get(key);
        this._remove(node);
      }
      let newNode = this.__createNode(key, value);
      this._add(newNode);
      this.__cache.set(key, newNode);
      if (this.__cache.size > this.__maxSize) {
        let lruNode = this.__tail.prev;
        this._remove(lruNode);
        this.__cache.delete(lruNode.key);
      }
    },

    /**
     * Removes a value from the cache
     *
     * @param {*} key
     */
    remove(key) {
      if (this.__cache.has(key)) {
        let node = this.__cache.get(key);
        this._remove(node);
        this.__cache.delete(key);
      }
    },

    /**
     * Removes a node from the linked list
     *
     * @param {ListNode} node
     */
    _remove(node) {
      let prev = node.prev;
      let next = node.next;
      prev.next = next;
      next.prev = prev;
    },

    /**
     * Adds a node to the head of the linked list
     *
     * @param {ListNode} node
     */
    _add(node) {
      let next = this.__head.next;
      this.__head.next = node;
      node.prev = this.__head;
      node.next = next;
      next.prev = node;
    }
  }
});
