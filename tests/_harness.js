'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

global.App = {};

function load(relativePath) {
  var file = path.join(__dirname, '..', relativePath);
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}

function loadCore() {
  load('js/data-model.js');
  load('js/roster-balance.js');
  load('js/calendar-engine.js');
  load('js/scheduler.js');
  load('js/validator.js');
  load('js/feasibility.js');
}

module.exports = { load, loadCore, App: global.App };
