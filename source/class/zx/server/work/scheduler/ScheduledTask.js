/* ************************************************************************
 *
 *  Zen [and the art of] CMS
 *
 *  https://zenesis.com
 *
 *  Copyright:
 *    2019-2025 Zenesis Ltd, https://www.zenesis.com
 *
 *  License:
 *    MIT (see LICENSE in project root)
 *
 *  Authors:
 *    John Spackman (john.spackman@zenesis.com, @johnspackman)
 *
 *
 * ************************************************************************ */

/**
 * @typedef DescriptionJson
 * @property {string} uuid
 * @property {string} title
 * @property {string} description
 * @property {Date?} dateStarted
 * @property {Date?} dateCompleted
 * @property {zx.server.work.IWork.WorkJson} workJson
 * @property {string} status
 */
qx.Class.define("zx.server.work.scheduler.ScheduledTask", {
  extend: zx.server.Object,
  implement: [zx.io.persistence.IObjectNotifications],

  properties: {
    /**
     * Name of the website this task is for,
     * taken from the CMS configuration
     */
    websiteName: {
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED],
      init: null,
      nullable: false,
      check: "String",
      event: "changeWebsiteName"
    },

    /** Title for the task */
    title: {
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED],
      check: "String",
      event: "changeTitle"
    },

    wellKnownId: {
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED],
      init: null,
      nullable: true,
      check: "String",
      event: "changeWellKnownId"
    },

    /** Description of the task */
    description: {
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED],
      init: null,
      nullable: true,
      check: "String",
      event: "changeDescription"
    },

    owner: {
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED],
      init: null,
      nullable: true,
      check: "String",
      event: "changeOwner"
    },

    /** Date when the task was scheduled */
    dateCreated: {
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED],
      init: null,
      nullable: true,
      check: "Date",
      event: "changeDateCreated"
    },

    /**
     * Earliest possible date/time when the task can run
     * If null, the task can run immediately
     */
    earliestStartDate: {
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED],
      init: null,
      nullable: true,
      check: "Date",
      event: "changeEarliestStartDate"
    },

    /** Date when the task was last started */
    dateStarted: {
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED],
      init: null,
      nullable: true,
      check: "Date",
      event: "changeDateStarted"
    },

    /** Date when the task was last completed */
    dateCompleted: {
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED],
      init: null,
      nullable: true,
      check: "Date",
      event: "changeDateCompleted"
    },

    /** Whether this is recurring */
    recurring: {
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED],
      init: false,
      nullable: false,
      check: "Boolean",
      event: "changeRecurring"
    },

    /** How long to keep the task in the database/on disk after it completes, if it is not recurring */
    keepForDays: {
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED],
      init: null,
      nullable: true,
      check: "Integer",
      event: "changeKeepForDays"
    },

    /** Cron expression for when to run the task */
    cronExpression: {
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED],
      init: null,
      nullable: true,
      check: "String",
      event: "changeCronExpression"
    },

    /** Whether the task is enabled */
    enabled: {
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED],
      init: true,
      nullable: false,
      check: "Boolean",
      event: "changeEnabled"
    },

    /**
     * @type {zx.server.work.IWork.WorkJson}
     * JSON object for Work
     * Title and description fields are optional.
     * If empty, they are taken from the ScheduledTask object
     */
    workJson: {
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED],
      nullable: false,
      event: "changeWorkJson"
    },

    /**
     * Number of times the task has failed since its last success
     */
    failCount: {
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED],
      init: 0,
      nullable: false,
      check: "Integer",
      event: "changeFailCount"
    }
  },

  members: {
    async receiveDataNotification(key, data) {
      await super.receiveDataNotification(key, data);
      if (key === zx.io.persistence.IObjectNotifications.BEFORE_WRITE_TO_JSON) {
        if (this.getDateCreated() == null) {
          this.setDateCreated(new Date());
        }

        if (this.getWebsiteName() === null) {
          let config = zx.server.Config.getInstance().getConfigData();
          let websiteName = config.websiteName;
          this.setWebsiteName(websiteName);
        }
      }
    }
  },

  statics: {
    /**
     * Maximum times a task can fail consecutively before it is not run
     */
    MAX_FAIL_COUNT: 5
  }
});
