/** Peak sim load bar chart on the dashboard. */

import Chart from 'chart.js/auto';
import * as Scheduler from '../../core/scheduler/index.js';
import * as DataModel from '../../core/data-model/index.js';

var chartInstance = null;

function renderChart(data) {
    var canvas = document.getElementById('loadChart');
    if (!canvas) return;
    var caps = Scheduler.getSimCaps(data.config);
    var counts = [];
    var labels = [];
    var simWeekdays = DataModel.getSimDays(data.config);
    for (var w = 0; w < 18; w++) {
      var max = 0;
      simWeekdays.forEach(function (day) {
        max = Math.max(max, Scheduler.getDaySimAttendanceCount(data, w, day));
      });
      counts.push(max);
      labels.push('W' + (w + 1));
    }
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: 'Peak sim session load', data: counts, backgroundColor: '#059669', borderRadius: 4 }] },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: Math.max(caps.overload + 1, 10), ticks: { stepSize: 1 } } }
      }
    });
  }

export {
  renderChart
};
