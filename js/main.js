/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.buildSemesterLabelHtml = function (parts) {
  var draftTip = 'Information for this semester hasn\'t been finalized yet, proceed with caution';
  var html = '<span class="semester-label-inner">';
  if (parts.season) {
    var seasonLabel = parts.season === 'fall' ? 'Fall' : 'Spring';
    html += '<span class="season-name season-' + parts.season + '">' + seasonLabel + '</span>';
    html += '<span class="season-year">' + parts.year + '</span>';
  } else {
    html += '<span class="season-year">' + (parts.name || 'Semester') + '</span>';
  }
  if (!parts.finalized) {
    html += '<span class="semester-draft" title="' + draftTip + '">*</span>';
  }
  html += '</span>';
  return html;
};

App.UI.closeSemesterPicker = function () {
  var menu = document.getElementById('semesterPickerMenu');
  var btn = document.getElementById('semesterPickerBtn');
  if (menu) menu.classList.add('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'false');
};

App.UI.updateSemesterDisplay = function () {
  var wrap = document.getElementById('semesterDisplay');
  var label = document.getElementById('semesterPickerLabel');
  var menu = document.getElementById('semesterPickerMenu');
  var fileRoot = App.getFileRoot();
  if (!wrap || !label || !menu || !fileRoot) return;

  var activeId = fileRoot.meta.activeSemesterId;
  menu.innerHTML = '';
  fileRoot.semesters.forEach(function (sem) {
    var parts = App.DataModel.parseSemesterDisplay(sem);
    var li = document.createElement('li');
    li.className = 'semester-picker-option';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', sem.id === activeId ? 'true' : 'false');
    li.dataset.semesterId = sem.id;
    li.innerHTML = App.UI.buildSemesterLabelHtml(parts);
    menu.appendChild(li);
  });

  var active = App.getData();
  if (active) {
    var display = App.DataModel.parseSemesterDisplay(active);
    wrap.className = 'semester-display season-' + (display.season || 'default');
    label.innerHTML = App.UI.buildSemesterLabelHtml(display);
  }
};

App.UI.initSemesterSwitcher = function () {
  var btn = document.getElementById('semesterPickerBtn');
  var menu = document.getElementById('semesterPickerMenu');

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = menu.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
  });

  menu.addEventListener('click', function (e) {
    var opt = e.target.closest('.semester-picker-option');
    if (!opt) return;
    if (opt.dataset.semesterId !== App.getFileRoot().meta.activeSemesterId) {
      App.switchSemester(opt.dataset.semesterId);
    }
    App.UI.closeSemesterPicker();
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('#semesterPicker')) App.UI.closeSemesterPicker();
  });

  document.getElementById('addSemesterBtn').addEventListener('click', function () {
    App.UI.closeSemesterPicker();
    App.UI.ConfigModal.openForNewSemester();
  });
};

App.UI.closeMenu = function () {
  var dropdown = document.getElementById('menuDropdown');
  var toggle = document.getElementById('menuToggle');
  if (dropdown) dropdown.classList.add('hidden');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
};

App.UI.toggleMenu = function () {
  var dropdown = document.getElementById('menuDropdown');
  var toggle = document.getElementById('menuToggle');
  if (!dropdown || !toggle) return;
  var open = dropdown.classList.toggle('hidden');
  toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
};

App.UI.refresh = function () {
  var data = App.getData();
  if (!data) return;
  App.Storage.updateStatusUI();
  App.UI.updateSemesterDisplay();
  App.UI.Dashboard.populateFilters(data);
  var tab = App.state.currentTab;
  if (tab === 'dashboard') App.UI.Dashboard.render(data);
  if (tab === 'student') App.UI.StudentView.render(data);
  if (tab === 'roles') App.UI.SimRoles.render(data);
  if (tab === 'makeup') App.UI.MakeupFinder.render(data);
  if (tab === 'setup') App.UI.Setup.render(data);
};

App.UI.switchTab = function (tabId) {
  if (tabId !== 'dashboard' && App.UI.Dashboard && App.UI.Dashboard.setScheduleFullscreen) {
    App.UI.Dashboard.setScheduleFullscreen(false);
  }
  App.state.currentTab = tabId;
  document.querySelectorAll('.view-panel').forEach(function (el) {
    el.classList.toggle('active', el.id === 'view-' + tabId);
  });
  document.querySelectorAll('.nav-tab').forEach(function (el) {
    el.classList.toggle('active', el.dataset.tab === tabId);
  });
  App.UI.refresh();
};

App.UI.showDialog = function (title, bodyHtml, onSave) {
  document.getElementById('dialogTitle').textContent = title;
  document.getElementById('dialogBody').innerHTML = bodyHtml;
  document.getElementById('dialogModal').classList.add('open');
  var saveBtn = document.getElementById('dialogSave');
  var newSave = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSave, saveBtn);
  newSave.addEventListener('click', function () {
    document.getElementById('dialogModal').classList.remove('open');
    if (onSave) onSave();
  });
};

App.UI.toggleDarkMode = function () {
  var fileRoot = App.getFileRoot();
  if (!fileRoot) return;
  fileRoot.meta.darkMode = !fileRoot.meta.darkMode;
  document.documentElement.classList.toggle('dark', fileRoot.meta.darkMode);
  App.notifyChange();
};

App.UI.init = function () {
  if (App.Storage.configureImportInput) App.Storage.configureImportInput();
  App.UI.Dashboard.init();
  App.UI.MasterCalendar.init();
  App.UI.StudentView.init();
  App.UI.SimRoles.init();
  App.UI.MakeupFinder.init();
  App.UI.SetupConfig.init();
  App.UI.Setup.init();
  App.UI.ConfigModal.init();
  App.UI.initSemesterSwitcher();
  if (App.getData() && App.UI.DateInputs) {
    App.UI.DateInputs.init(document.getElementById('view-setup'), App.getData());
  }

  document.getElementById('dialogCancel').addEventListener('click', function () {
    document.getElementById('dialogModal').classList.remove('open');
  });

  document.querySelectorAll('.nav-tab').forEach(function (btn) {
    btn.addEventListener('click', function () { App.UI.switchTab(btn.dataset.tab); });
  });

  document.getElementById('menuToggle').addEventListener('click', function (e) {
    e.stopPropagation();
    App.UI.toggleMenu();
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.menu-wrap')) App.UI.closeMenu();
  });

  document.getElementById('darkModeToggle').addEventListener('click', function () {
    App.UI.toggleDarkMode();
    App.UI.closeMenu();
  });

  document.getElementById('importBtn').addEventListener('click', function () {
    document.getElementById('importFileInput').click();
    App.UI.closeMenu();
  });

  document.getElementById('importSimFacultyBtn').addEventListener('click', function () {
    document.getElementById('importSimFacultyInput').click();
    App.UI.closeMenu();
  });

  document.getElementById('importSimFacultyInput').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    App.SimFacultyStorage.importFromFile(file).then(function () {
      App.UI.refresh();
    }).catch(function () { alert('Invalid sim faculty file.'); });
    e.target.value = '';
  });

  document.getElementById('exportSimFacultyBtn').addEventListener('click', function () {
    if (!App.SimFacultyStorage.isReady()) {
      alert('Connect or create a sim faculty file first.');
      App.UI.closeMenu();
      return;
    }
    App.SimFacultyStorage.exportDownload();
    App.UI.closeMenu();
  });

  document.getElementById('importFileInput').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    App.Storage.importFromFile(file).then(function (fileRoot) {
      var sem = fileRoot.semesters.find(function (s) {
        return s.id === fileRoot.meta.activeSemesterId;
      }) || fileRoot.semesters[0];
      App.CalendarEngine.rebuildWeeks(sem);
      App.setFileRoot(fileRoot);
      App.state.fileName = file.name;
      App.state.fileHandle = null;
      App.markClean();
      App.Storage.cacheData(fileRoot);
      App.UI.Dashboard.populateFilters(sem);
      App.UI.refresh();
    }).catch(function () { alert('Invalid semester file.'); });
    e.target.value = '';
  });

  document.getElementById('exportBtn').addEventListener('click', function () {
    App.Storage.exportDownload();
    App.UI.closeMenu();
  });

  document.getElementById('clearStorageBtn').addEventListener('click', function () {
    App.UI.closeMenu();
    var msg = 'This will erase all semester data saved on this device and restore the default roster and settings. ' +
      'Any connected OneDrive file will be disconnected. This cannot be undone.\n\nContinue?';
    if (!confirm(msg)) return;
    App.Storage.clearAndRestoreDefaults().then(function () {
      App.UI.Dashboard.populateFilters(App.getData());
      App.UI.refresh();
    });
  });

  document.getElementById('saveBtn').addEventListener('click', function () {
    Promise.all([
      App.Storage.saveCurrent(),
      App.SimFacultyStorage.isReady() ? App.SimFacultyStorage.saveCurrent() : Promise.resolve()
    ]).then(function () {
      if (App.Storage.supportsFS()) {
        alert('Saved to connected file(s).');
      } else {
        alert('Saved on this device. Export backup to OneDrive when finished.');
      }
    });
    App.UI.closeMenu();
  });

  if (App.Storage.supportsFS()) {
    document.getElementById('openFileBtn').addEventListener('click', function () {
      App.Storage.openFilePicker().then(function (fileRoot) {
        App.setFileRoot(fileRoot);
        App.UI.Dashboard.populateFilters(App.getData());
        App.UI.refresh();
      }).catch(function () {});
      App.UI.closeMenu();
    });
    document.getElementById('newFileBtn').addEventListener('click', function () {
      App.Storage.createFilePicker().then(function (fileRoot) {
        var sem = App.getData();
        if (sem) App.Scheduler.regenerateAll(sem);
        App.setFileRoot(fileRoot);
        App.UI.Dashboard.populateFilters(sem);
        App.UI.refresh();
      }).catch(function () {});
      App.UI.closeMenu();
    });
    document.getElementById('openSimFacultyBtn').addEventListener('click', function () {
      App.SimFacultyStorage.openFilePicker().then(function () {
        App.UI.refresh();
      }).catch(function () {});
      App.UI.closeMenu();
    });
    document.getElementById('newSimFacultyBtn').addEventListener('click', function () {
      App.SimFacultyStorage.createFilePicker().then(function () {
        App.UI.refresh();
      }).catch(function () {});
      App.UI.closeMenu();
    });
  } else {
    document.getElementById('openFileBtn').classList.add('hidden');
    document.getElementById('newFileBtn').classList.add('hidden');
    document.getElementById('openSimFacultyBtn').classList.add('hidden');
    document.getElementById('newSimFacultyBtn').classList.add('hidden');
  }

  App.onStateChange(function () { App.Storage.updateStatusUI(); });
};

App.main = function () {
  App.Storage.init().then(function (fileRoot) {
    return App.SimFacultyStorage.init(fileRoot).then(function () {
      return fileRoot;
    });
  }).then(function (fileRoot) {
    if (fileRoot.meta.darkMode) document.documentElement.classList.add('dark');
    App.UI.Dashboard.populateFilters(App.getData());
    App.UI.init();
    App.UI.switchTab('dashboard');
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.main);
} else {
  App.main();
}
