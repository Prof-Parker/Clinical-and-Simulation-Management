/**
 * Convert student calendar HTML to PDF blobs (client-side).
 *
 * html2canvas captures screen styles, so a live html.dark theme would grey the
 * PDF. Light tokens are applied on the off-screen host and again on the canvas
 * clone — the visible app theme is never toggled.
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

var LIGHT_THEME_VARS = {
  '--bg': '#f8fafc',
  '--bg-card': '#ffffff',
  '--text': '#1e293b',
  '--text-muted': '#64748b',
  '--border': '#e2e8f0',
  '--primary': '#2563eb',
  '--primary-light': '#dbeafe',
  '--danger': '#b91c1c',
  '--danger-bg': '#fef2f2',
  '--danger-border': '#fecaca',
  '--sticky-bg': '#ffffff',
  '--surface-alt': '#f1f5f9'
};

function applyLightThemeVars(el) {
  if (!el || !el.style) return;
  el.style.colorScheme = 'light';
  el.style.backgroundColor = '#ffffff';
  el.style.color = '#1e293b';
  Object.keys(LIGHT_THEME_VARS).forEach(function (key) {
    el.style.setProperty(key, LIGHT_THEME_VARS[key]);
  });
}

function forceLightThemeOnDocument(doc) {
  if (!doc || !doc.documentElement) return;
  doc.documentElement.classList.remove('dark');
  applyLightThemeVars(doc.documentElement);
  if (doc.body) applyLightThemeVars(doc.body);
}

function ensureHost() {
  var host = document.getElementById('studentCalendarPdfHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'studentCalendarPdfHost';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'position:fixed;left:-10000px;top:0;width:800px;background:#fff;color:#111;z-index:-1;';
    document.body.appendChild(host);
  }
  applyLightThemeVars(host);
  return host;
}

/**
 * Render HTML string to a PDF Blob (US Letter).
 */
function htmlToPdfBlob(html) {
  var host = ensureHost();
  host.innerHTML = html;
  var el = host.firstElementChild || host;
  return html2canvas(el, {
    scale: 1.5,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: 800,
    onclone: function (clonedDoc, clonedEl) {
      forceLightThemeOnDocument(clonedDoc);
      var clonedHost = clonedDoc.getElementById('studentCalendarPdfHost');
      if (clonedHost) applyLightThemeVars(clonedHost);
      if (clonedEl) applyLightThemeVars(clonedEl);
    }
  }).then(function (canvas) {
    var pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    var pageWidth = pdf.internal.pageSize.getWidth();
    var pageHeight = pdf.internal.pageSize.getHeight();
    var margin = 28;
    var usableWidth = pageWidth - margin * 2;
    var imgWidth = usableWidth;
    var imgHeight = (canvas.height * imgWidth) / canvas.width;
    var imgData = canvas.toDataURL('image/jpeg', 0.92);
    var heightLeft = imgHeight;
    var y = margin;

    pdf.addImage(imgData, 'JPEG', margin, y, imgWidth, imgHeight);
    heightLeft -= (pageHeight - margin * 2);

    while (heightLeft > 0) {
      y = margin - (imgHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', margin, y, imgWidth, imgHeight);
      heightLeft -= (pageHeight - margin * 2);
    }

    host.innerHTML = '';
    return pdf.output('blob');
  }).catch(function (err) {
    host.innerHTML = '';
    throw err;
  });
}

export {
  LIGHT_THEME_VARS,
  applyLightThemeVars,
  forceLightThemeOnDocument,
  htmlToPdfBlob,
  ensureHost
};
