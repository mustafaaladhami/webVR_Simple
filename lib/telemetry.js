/* global Raven */
(function (window) {
'use strict';

/*
 * The main requirements when dealing with Do-Not-Track (DNT) are:
 *
 *  1. Prevent explicit collection, storage and sending data if DNT is enabled.
 *
 *  2. GA and Telemetry APIs should not throw or error if DNT is enabled,
 *     although they must ensure requirement #1.
 *
 *  3. If DNT is enabled in the middle of the gameplay, the API must ensure
 *     requirements #1 and #2. If DNT is disabled in the middle of the gameplay,
 *     resuming data collection is not mandatory.
 *
 * FOR MAINTAINERS: Some collection can happen implicitly when loading 3rd party
 * libraries. Try to prevent loading external libraries if DNT is enabled and
 * this does not conflict with requirement #2.
 */

var CURRENT_VERSION = '1.1.0';
var MOZILLA_RESEARCH_TRACKER = 'UA-77033033-6';

if (!('MozillaResearch' in window)) {
  window.MozillaResearch = {};
}

if (!('telemetry' in window.MozillaResearch)) {
  window.MozillaResearch.telemetry = {};
}

var navigator = window.navigator;
var telemetry = window.MozillaResearch.telemetry;

var NO_OP = function () {};

Object.defineProperty(telemetry, '_gtag', {
  get: function () {
    return window.gtag || NO_OP;
  }
});

telemetry.performance = {
  mark: NO_OP,
  measure: NO_OP
};

telemetry.start = onlyOnce(function (config) {
  config = config || {};
  if (config.errorLogging) {
    setupErrorLogging();
  }
  if (config.analytics) {
    var researchAnalytics = startAnalytics();
    if (config.performance) {
      setupPerformanceAPI(researchAnalytics);
    }
  }
});

setupAnalytics();

function setupAnalytics() {
  if (doNotTrack()) { return; }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { dataLayer.push(arguments); };
  window.gtag('js', new Date());

  injectScript('https://www.googletagmanager.com/gtag/js?id=' + MOZILLA_RESEARCH_TRACKER, function (err) {
    if (err) {
      console.warn('Could not load Analytics.js script:', err);
      return;
    }
  });
}

function setupErrorLogging() {
  if (doNotTrack()) { return; }

  injectScript('https://cdn.ravenjs.com/3.22.3/console/raven.min.js', function (err) {
    if (err) {
      console.warn('Could not load Raven.js script:', err);
      return;
    }
    if (!('Raven' in window)) {
      console.warn('Could not find `window.Raven` global');
      return;
    }
    startRaven();
  });

  function startRaven () {
    Raven.config('https://e359be9fb9324addb0dc97b664cf5ee6@sentry.io/294878')
         .install();
  }
};

function startAnalytics() {
  var tracker = configureBoundTracker(MOZILLA_RESEARCH_TRACKER, {
    'groups': 'MozillaResearch',
    'custom_map': {
      'dimension1': 'version'
    }
  });
  tracker('event', 'using_webvr_template', { version: CURRENT_VERSION });
  return tracker;
}

function setupPerformanceAPI(tracker) {
  telemetry.performance = {
    mark: function (name) {
      if (doNotTrack()) { return; }

      performance.mark(name);
    },

    measure: function (name, start, end) {
      if (doNotTrack()) { return; }

      performance.measure(name, start, end);
      var performanceEntry = performance.getEntriesByName(name)[0];
      var duration = performanceEntry.duration;
      tracker('event', name, {
        'event_category': 'Performance',
        'value': Math.round(duration)
      });
    }
  };
}

/**
 * The function configures Google Analytics sending a `config` command [1] but
 * also returns a function to use instead of `gtag` that respects `Do-Not-Track`
 * and it's bound to the `groups` property of the `options` parameter to avoid
 * adding the `send_to` key [2] to each command.
 *
 * [1] https://developers.google.com/analytics/devguides/collection/gtagjs/pages
 * [2] https://developers.google.com/analytics/devguides/collection/gtagjs/sending-data#groups-and-properties
 *
 * @param {string} trackingId see `'config'` command signature [1]
 * @param {object} options see `'config'` command signature [1]
 * @returns {function} A tracker function to replace invocation of `gtag` that
 * honours Do-Not-Track and automatically adds the `send_to` key to the
 * commands [2].
 */
function configureBoundTracker(trackingId, options) {
  if (doNotTrack()) { return NO_OP; }

  options = options || {};
  var groups = options.groups;
  telemetry._gtag('config', trackingId, options);
  return trackingFunction;

  function trackingFunction(command, label, options) {
    if (doNotTrack()) { return; }

    options = options || {};
    if (groups) {
      options.send_to = groups;
    }
    telemetry._gtag(command, label, options);
  };
}

function injectScript(src, callback) {
  var script = document.createElement('script');
  script.src = src;
  script.crossorigin = 'anonymous';
  script.addEventListener('load', function () {
    if (callback) {
      callback(null, true);
    }
  });
  script.addEventListener('error', function (err) {
    if (callback) {
      callback(err);
    }
  });
  document.head.appendChild(script);
  return script;
}

// IE9/IE10 uses a prefixed version while MS Edge sets the property in
// `window` instead of `navigator`:
// https://developer.mozilla.org/en-US/docs/Web/API/Navigator/doNotTrack#Browser_compatibility
function doNotTrack() {
  return navigator.doNotTrack === '1' ||
         navigator.msDoNotTrack === '1' ||
         window.doNotTrack === '1';
}

function onlyOnce(fn) {
  var called = false;
  return function () {
    if (called) { return; }
    var returnValue = fn.apply(this, arguments);
    called = true;
    return returnValue;
  };
}

})(window);
