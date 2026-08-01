/**
 * Virtual File System Access handles backed by Vite mock-onedrive middleware.
 * DEV-only — used by quick-start so folder picking is not required.
 */

var API = '/__dev__/mock-onedrive';

function joinPath(base, name) {
  var b = String(base || '').replace(/^\/+|\/+$/g, '');
  var n = String(name || '').replace(/^\/+|\/+$/g, '');
  if (!b) return n;
  if (!n) return b;
  return b + '/' + n;
}

function apiUrl(route, relPath) {
  return API + route + '?path=' + encodeURIComponent(relPath || '');
}

function fetchJson(url, options) {
  return fetch(url, options).then(function (res) {
    return res.json().then(function (body) {
      if (!res.ok) {
        throw new Error((body && body.error) || ('HTTP ' + res.status));
      }
      return body;
    });
  });
}

function notFound(name) {
  var err = new Error('Could not find "' + name + '"');
  err.name = 'NotFoundError';
  return err;
}

function createWritable(relPath) {
  var chunks = [];
  var size = 0;
  return {
    write: function (data) {
      return Promise.resolve().then(function () {
        if (data == null) return;
        if (typeof data === 'string') {
          chunks.push(data);
          size += data.length;
          return;
        }
        if (data instanceof Blob) {
          return data.text().then(function (t) {
            chunks.push(t);
            size += t.length;
          });
        }
        if (data.buffer) {
          var s = new TextDecoder().decode(data);
          chunks.push(s);
          size += s.length;
          return;
        }
        var asStr = String(data);
        chunks.push(asStr);
        size += asStr.length;
      });
    },
    truncate: function (newSize) {
      return Promise.resolve().then(function () {
        var text = chunks.join('');
        chunks = [text.slice(0, newSize)];
        size = Math.min(size, newSize);
      });
    },
    close: function () {
      var text = chunks.join('').slice(0, size);
      return fetch(apiUrl('/file', relPath), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: text
      }).then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            throw new Error((body && body.error) || 'Write failed');
          });
        }
      });
    },
    abort: function () {
      chunks = [];
      size = 0;
      return Promise.resolve();
    }
  };
}

function createFileHandle(relPath, name) {
  return {
    kind: 'file',
    name: name,
    __devMockFs: true,
    __devPath: relPath,
    queryPermission: function () { return Promise.resolve('granted'); },
    requestPermission: function () { return Promise.resolve('granted'); },
    getFile: function () {
      return fetch(apiUrl('/file', relPath)).then(function (res) {
        if (!res.ok) throw notFound(name);
        return res.text().then(function (text) {
          return new File([text], name, { type: 'application/json' });
        });
      });
    },
    createWritable: function () {
      return Promise.resolve(createWritable(relPath));
    }
  };
}

function createDirHandle(relPath, name) {
  var handle = {
    kind: 'directory',
    name: name || 'mock-onedrive',
    __devMockFs: true,
    __devPath: relPath || '',
    queryPermission: function () { return Promise.resolve('granted'); },
    requestPermission: function () { return Promise.resolve('granted'); },
    getDirectoryHandle: function (childName, opts) {
      var next = joinPath(relPath, childName);
      return fetchJson(apiUrl('/exists', next)).then(function (info) {
        if (info.exists && info.kind === 'directory') {
          return createDirHandle(next, childName);
        }
        if (opts && opts.create) {
          return createDirHandle(next, childName);
        }
        throw notFound(childName);
      });
    },
    getFileHandle: function (childName, opts) {
      var next = joinPath(relPath, childName);
      return fetchJson(apiUrl('/exists', next)).then(function (info) {
        if (info.exists && info.kind === 'file') {
          return createFileHandle(next, childName);
        }
        if (opts && opts.create) {
          return createFileHandle(next, childName);
        }
        throw notFound(childName);
      });
    },
    values: function () {
      var entries = null;
      var index = 0;
      return {
        next: function () {
          var load = entries
            ? Promise.resolve(entries)
            : fetchJson(apiUrl('/list', relPath)).then(function (body) {
              entries = (body.entries || []).map(function (e) {
                var childPath = joinPath(relPath, e.name);
                return e.kind === 'directory'
                  ? createDirHandle(childPath, e.name)
                  : createFileHandle(childPath, e.name);
              });
              return entries;
            });
          return load.then(function (list) {
            if (index >= list.length) return { done: true, value: undefined };
            return { done: false, value: list[index++] };
          });
        }
      };
    }
  };
  return handle;
}

/**
 * Probe the Vite mock-onedrive middleware and return a root directory handle.
 */
export function createMockProgramDataRoot() {
  return fetchJson(API + '/health').then(function (health) {
    if (!health || !health.ok) {
      throw new Error('mock-onedrive middleware is not available');
    }
    if (!health.rootExists) {
      throw new Error('mock-onedrive/ is missing. Run npm run seed:mock-onedrive');
    }
    return createDirHandle('', 'mock-onedrive');
  });
}

export function isDevMockHandle(handle) {
  return !!(handle && handle.__devMockFs);
}
