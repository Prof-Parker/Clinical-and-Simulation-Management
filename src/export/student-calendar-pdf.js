/**
 * Convert student calendar HTML to PDF blobs (client-side).
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

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
    windowWidth: 800
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
  htmlToPdfBlob,
  ensureHost
};
