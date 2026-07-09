/**
 * Extract plain text runs from docx document.xml.
 */

import fs from 'fs';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export function extractTextFromXml(xml) {
  var parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
  var doc = parser.parse(xml);
  var parts = [];
  function walk(n) {
    if (!n) return;
    if (typeof n === 'string') return;
    if (n.t !== undefined) {
      var t = n.t;
      if (typeof t === 'string') parts.push(t);
      else if (Array.isArray(t)) parts.push(t.join(''));
      else if (t && t['#text']) parts.push(t['#text']);
      return;
    }
    Object.keys(n).forEach(function (k) {
      var v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else walk(v);
    });
  }
  walk(doc);
  return parts.map(function (p) { return String(p).replace(/\s+/g, ' ').trim(); }).filter(Boolean);
}

export async function loadDocxText(docxPath) {
  var buf = fs.readFileSync(docxPath);
  var zip = await JSZip.loadAsync(buf);
  var xml = await zip.file('word/document.xml').async('string');
  return extractTextFromXml(xml);
}

export function extractTableRows(xml) {
  var parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
  var doc = parser.parse(xml);
  var rows = [];
  function cellText(tc) {
    var parts = [];
    function walk(n) {
      if (!n) return;
      if (typeof n === 'string') return;
      if (n.t !== undefined) {
        var t = n.t;
        if (typeof t === 'string') parts.push(t);
        else if (Array.isArray(t)) parts.push(t.join(''));
        else if (t && t['#text']) parts.push(t['#text']);
        return;
      }
      Object.keys(n).forEach(function (k) {
        var v = n[k];
        if (Array.isArray(v)) v.forEach(walk);
        else walk(v);
      });
    }
    walk(tc);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }
  function walkTables(n) {
    if (!n) return;
    if (typeof n === 'string') return;
    if (n.tr) {
      var trList = Array.isArray(n.tr) ? n.tr : [n.tr];
      trList.forEach(function (tr) {
        var cells = [];
        var tcList = tr.tc ? (Array.isArray(tr.tc) ? tr.tc : [tr.tc]) : [];
        tcList.forEach(function (tc) { cells.push(cellText(tc)); });
        if (cells.some(Boolean)) rows.push(cells);
      });
    }
    Object.keys(n).forEach(function (k) {
      var v = n[k];
      if (Array.isArray(v)) v.forEach(walkTables);
      else walkTables(v);
    });
  }
  walkTables(doc);
  return rows;
}

export async function loadDocxTables(docxPath) {
  var buf = fs.readFileSync(docxPath);
  var zip = await JSZip.loadAsync(buf);
  var xml = await zip.file('word/document.xml').async('string');
  return extractTableRows(xml);
}
