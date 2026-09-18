(function () {
  'use strict';

  function createSocket() {
    var handlers = {};
    var ws = null;
    var backoff = 500;
    var closedByUs = false;
    var api = { connected: false };

    function fire(event, data) {
      var list = handlers[event];
      if (!list) return;
      for (var i = 0; i < list.length; i++) list[i](data);
    }

    function url() {
      var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
      return proto + location.host + '/ws';
    }

    function connect() {
      ws = new WebSocket(url());
      ws.addEventListener('open', function () {
        backoff = 500;
        api.connected = true;
        fire('connect');
      });
      ws.addEventListener('message', function (event) {
        var message;
        try {
          message = JSON.parse(event.data);
        } catch (err) {
          return;
        }
        if (!message || typeof message !== 'object') return;
        fire(message.e, message.d);
      });
      ws.addEventListener('close', function () {
        api.connected = false;
        fire('disconnect');
        if (closedByUs) return;
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 10000);
      });
      ws.addEventListener('error', function (event) {
        fire('connect_error', event);
      });
    }

    api.on = function (event, handler) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
      return api;
    };

    api.emit = function (event, data) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ e: event, d: data }));
    };

    connect();
    return api;
  }

  window.io = function () {
    return createSocket();
  };
})();
