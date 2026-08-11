/**
 * Per-user inbox stored on users-registry entries.
 */

import { defaultTitle, isKnownType } from './message-types.js';

function uid() {
  return 'msg_' + Math.random().toString(36).slice(2, 10);
}

function ensureMessages(entry) {
  if (!entry || typeof entry !== 'object') return [];
  if (!Array.isArray(entry.messages)) entry.messages = [];
  return entry.messages;
}

/**
 * Create a message object (does not persist).
 * @param {{ type: string, title?: string, body?: string, meta?: object, relatedRef?: object, audienceRole?: string }} opts
 */
function createMessage(opts) {
  opts = opts || {};
  var type = String(opts.type || '');
  if (!isKnownType(type)) {
    throw new Error('Unknown message type: ' + type);
  }
  return {
    id: opts.id || uid(),
    type: type,
    title: String(opts.title != null ? opts.title : defaultTitle(type)),
    body: String(opts.body || ''),
    createdAt: opts.createdAt || new Date().toISOString(),
    readAt: opts.readAt != null ? opts.readAt : null,
    audienceRole: opts.audienceRole ? String(opts.audienceRole) : '',
    meta: opts.meta && typeof opts.meta === 'object' ? opts.meta : {},
    relatedRef: opts.relatedRef && typeof opts.relatedRef === 'object' ? opts.relatedRef : null
  };
}

function appendMessage(entry, message) {
  var list = ensureMessages(entry);
  list.unshift(message);
  return message;
}

function listMessages(entry, opts) {
  opts = opts || {};
  var list = ensureMessages(entry).slice();
  if (opts.unreadOnly) {
    list = list.filter(function (m) { return !m.readAt; });
  }
  if (opts.type) {
    list = list.filter(function (m) { return m.type === opts.type; });
  }
  return list;
}

function unreadCount(entry) {
  return ensureMessages(entry).filter(function (m) { return !m.readAt; }).length;
}

function markRead(entry, messageId, when) {
  var list = ensureMessages(entry);
  var msg = list.find(function (m) { return m.id === messageId; });
  if (!msg) return false;
  if (!msg.readAt) msg.readAt = when || new Date().toISOString();
  return true;
}

function markAllRead(entry, when) {
  var ts = when || new Date().toISOString();
  var n = 0;
  ensureMessages(entry).forEach(function (m) {
    if (!m.readAt) {
      m.readAt = ts;
      n++;
    }
  });
  return n;
}

function findMessage(entry, messageId) {
  return ensureMessages(entry).find(function (m) { return m.id === messageId; }) || null;
}

export {
  uid,
  ensureMessages,
  createMessage,
  appendMessage,
  listMessages,
  unreadCount,
  markRead,
  markAllRead,
  findMessage
};
