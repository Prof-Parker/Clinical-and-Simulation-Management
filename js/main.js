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

App.UI.updateCourseStatusLine = function () {
  var el = document.getElementById('courseStatusLine');
  var data = App.getData();
  if (!el) return;
  if (!data || !data.meta) {
    el.textContent = 'No semester file connected';
    return;
  }
  var parts = App.DataModel.parseSemesterDisplay(data);
  var seasonLabel = parts.season === 'fall' ? 'Fall' : (parts.season === 'spring' ? 'Spring' : '');
  var courseId = data.meta.courseId || '—';
  var phase = App.Audit ? App.Audit.getPhase(data) : 'setup';
  el.textContent = (seasonLabel ? seasonLabel + ' ' : '') + (parts.year || '') +
    ' · ' + courseId + ' · ' + phase.replace(/_/g, ' ');
};

App.UI.updateUserStatusLine = function () {
  var el = document.getElementById('userStatusLine');
  if (!el || !App.UserSession) return;
  var session = App.UserSession.getSession();
  if (!session) {
    el.textContent = '';
    return;
  }
  el.textContent = session.name + ' (' + App.UserTemplate.roleDisplayName(session.role) + ')';
};

App.UI.updateSemesterDisplay = function () {
  App.UI.updateCourseStatusLine();
};

App.UI.initSemesterMenu = function () {
  var menu = document.getElementById('semesterSwitchMenu');
  if (!menu) return;
  menu.addEventListener('click', function (e) {
    var opt = e.target.closest('[data-semester-id]');
    if (!opt || !App.getFileRoot()) return;
    if (opt.dataset.semesterId !== App.getFileRoot().meta.activeSemesterId) {
      App.switchSemester(opt.dataset.semesterId);
    }
    App.UI.closeMenu();
  });
};

App.UI.refreshSemesterSwitchMenu = function () {
  var menu = document.getElementById('semesterSwitchMenu');
  var fileRoot = App.getFileRoot();
  if (!menu || !fileRoot) return;
  if (!App.Permissions.canAction('semester.switch') || fileRoot.semesters.length < 2) {
    menu.innerHTML = '';
    return;
  }
  var activeId = fileRoot.meta.activeSemesterId;
  menu.innerHTML = fileRoot.semesters.map(function (sem) {
    var parts = App.DataModel.parseSemesterDisplay(sem);
    var label = App.UI.buildSemesterLabelHtml(parts);
    return '<button type="button" class="menu-item menu-item-nested" role="menuitem" data-semester-id="' +
      sem.id + '"' + (sem.id === activeId ? ' aria-current="true"' : '') + '>' + label + '</button>';
  }).join('');
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
  if (!open) {
    App.UI.refreshSemesterSwitchMenu();
    if (App.Permissions && App.Permissions.applyMenuGating) App.Permissions.applyMenuGating();
  }
};

App.UI.refresh = function () {
  var data = App.getData();
  App.Storage.updateStatusUI();
  App.UI.updateSemesterDisplay();
  App.UI.updateUserStatusLine();
  if (!data) return;
  App.UI.Dashboard.populateFilters(data);
  var tab = App.state.currentTab;
  if (tab === 'dashboard') App.UI.Dashboard.render(data);
  if (tab === 'student') App.UI.StudentView.render(data);
  if (tab === 'roles') App.UI.SimRoles.render(data);
  if (tab === 'makeup') App.UI.MakeupFinder.render(data);
  if (tab === 'audit') App.UI.AuditCloseout.render(data);
  if (tab === 'setup') App.UI.Setup.render(data);
  if (tab === 'playground' && App.UI.Playground) App.UI.Playground.render();
  if (tab === 'users' && App.UI.UsersAdmin) App.UI.UsersAdmin.render();
  if (tab === 'clinical-sites' && App.UI.ClinicalSitesTab) App.UI.ClinicalSitesTab.render();
  if (tab === 'theory' && App.UI.TheoryStub) App.UI.TheoryStub.render();
  App.UI.updateCloseoutBanner(data);
  if (App.Permissions) App.Permissions.apply();
};

App.UI.guardEditable = function (action) {
  if (App.Permissions && App.UserSession && App.UserSession.isValidated()) {
    if (action === 'masterCell' && App.Permissions.isDashboardReadOnly()) return false;
    if (action === 'setup') {
      if (!App.Permissions.canAction('setup.edit') &&
          !App.Permissions.canAction('setup.saveDraft') &&
          !App.Permissions.canAction('proposals.submit')) return false;
    }
    if (action === 'regenerate' && !App.Permissions.canAction('setup.edit')) return false;
    if (action === 'makeup' &&
        !App.Permissions.canAction('setup.edit') &&
        !App.Permissions.canAction('makeup.edit')) return false;
  }
  var data = App.getData();
  if (!data || !App.Audit || App.Audit.canEdit(data, action)) return true;
  App.UI.showAlert('Semester in closeout',
    'Semester in closeout — editing disabled. Reopen from the Audit tab if corrections are needed.');
  return false;
};

App.UI.updateCloseoutBanner = function (data) {
  var banner = document.getElementById('closeoutBanner');
  if (!banner) return;
  var readOnly = !!(data && App.Audit && App.Audit.isReadOnly(data));
  banner.classList.toggle('hidden', !readOnly);
  if (readOnly) {
    banner.textContent = App.Audit.isLocked(data)
      ? 'Semester locked — editing disabled. Dashboard, Student View, print, and Excel export remain available.'
      : 'Audit exported — editing disabled pending signatures. Reopen for corrections from the Audit tab if changes are needed.';
  }
};

App.UI.switchTab = function (tabId) {
  if (App.Permissions && !App.Permissions.canTab(tabId)) {
    App.UI.showAlert('Not permitted', 'Your role cannot access this tab.');
    return;
  }
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

App.UI.escapeHtml = function (text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

App.UI.dialogMessageHtml = function (text) {
  var escaped = App.UI.escapeHtml(text);
  var parts = escaped.split(/\n\n/);
  return parts.map(function (p) {
    return '<p class="dialog-message">' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
};

App.UI._dialogDefaults = {
  saveLabel: 'Save',
  cancelLabel: 'Cancel'
};

App.UI.closeDialog = function () {
  var modal = document.getElementById('dialogModal');
  var saveBtn = document.getElementById('dialogSave');
  var cancelBtn = document.getElementById('dialogCancel');
  if (modal) modal.classList.remove('open');
  if (saveBtn) {
    saveBtn.textContent = App.UI._dialogDefaults.saveLabel;
    saveBtn.className = 'btn btn-primary';
    saveBtn.style.display = '';
  }
  if (cancelBtn) {
    cancelBtn.textContent = App.UI._dialogDefaults.cancelLabel;
    cancelBtn.style.display = '';
  }
};

App.UI._bindDialogPrimary = function (onPrimary) {
  var saveBtn = document.getElementById('dialogSave');
  var newSave = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSave, saveBtn);
  newSave.addEventListener('click', function () {
    App.UI.closeDialog();
    if (onPrimary) onPrimary();
  });
  return newSave;
};

App.UI.showConfirm = function (title, message, onConfirm, options) {
  options = options || {};
  document.getElementById('dialogTitle').textContent = title;
  document.getElementById('dialogBody').innerHTML = App.UI.dialogMessageHtml(message);
  var cancelBtn = document.getElementById('dialogCancel');
  cancelBtn.style.display = '';
  var saveBtn = App.UI._bindDialogPrimary(onConfirm);
  saveBtn.textContent = options.confirmLabel || 'OK';
  document.getElementById('dialogModal').classList.add('open');
};

App.UI.showAlert = function (title, message, onOk) {
  document.getElementById('dialogTitle').textContent = title;
  document.getElementById('dialogBody').innerHTML = App.UI.dialogMessageHtml(message);
  document.getElementById('dialogCancel').style.display = 'none';
  var saveBtn = App.UI._bindDialogPrimary(onOk);
  saveBtn.textContent = 'OK';
  document.getElementById('dialogModal').classList.add('open');
};

App.UI.showDialog = function (title, bodyHtml, onSave) {
  document.getElementById('dialogTitle').textContent = title;
  document.getElementById('dialogBody').innerHTML = bodyHtml;
  document.getElementById('dialogCancel').style.display = '';
  App.UI._bindDialogPrimary(onSave);
  document.getElementById('dialogModal').classList.add('open');
};

App.UI.toggleDarkMode = function () {
  if (App.Theme) App.Theme.toggle();
};

App.UI.init = function () {
  if (App.Storage.configureImportInput) App.Storage.configureImportInput();
  App.UI.Dashboard.init();
  App.UI.MasterCalendar.init();
  App.UI.StudentView.init();
  App.UI.SimRoles.init();
  App.UI.MakeupFinder.init();
  App.UI.AuditCloseout.init();
  App.UI.SetupConfig.init();
  App.UI.Setup.init();
  App.UI.ConfigModal.init();
  if (App.UI.SetupProposals) App.UI.SetupProposals.init();
  if (App.UI.Playground) App.UI.Playground.init();
  if (App.UI.NewSemesterBatch) App.UI.NewSemesterBatch.init();
  if (App.UI.UsersAdmin) App.UI.UsersAdmin.init();
  if (App.UI.ClinicalSitesTab) App.UI.ClinicalSitesTab.init();
  if (App.UI.PlaygroundImport) App.UI.PlaygroundImport.init();
  if (App.UI.TheoryStub) App.UI.TheoryStub.init();
  App.UI.initSemesterMenu();
  if (App.UserSession) App.UserSession.initGateUI();
  if (App.getData() && App.UI.DateInputs) {
    App.UI.DateInputs.init(document.getElementById('view-setup'), App.getData());
  }

  document.getElementById('dialogCancel').addEventListener('click', function () {
    App.UI.closeDialog();
  });

  document.getElementById('dialogModal').addEventListener('click', function (e) {
    if (e.target.id === 'dialogModal') App.UI.closeDialog();
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

  var loadUserMenuBtn = document.getElementById('loadUserFileMenuBtn');
  if (loadUserMenuBtn) {
    loadUserMenuBtn.addEventListener('click', function () {
      App.UserStorage.openFilePicker().then(function () {
        return App.UserSession.validateAndSetSession();
      }).then(function (r) {
        if (r.ok) {
          App.Permissions.apply();
          App.UI.updateUserStatusLine();
        }
      }).catch(function () {});
      App.UI.closeMenu();
    });
  }

  var loadRegistryMenuBtn = document.getElementById('loadRegistryMenuBtn');
  if (loadRegistryMenuBtn) {
    loadRegistryMenuBtn.addEventListener('click', function () {
      App.UsersRegistryStorage.openFilePicker().then(function () {
        return App.UserSession.validateAndSetSession();
      }).then(function (r) {
        if (r.ok) {
          App.Permissions.apply();
          App.UI.refresh();
        } else if (App.UsersRegistryStorage.isReady()) {
          App.UI.refresh();
        }
      }).catch(function () {});
      App.UI.closeMenu();
    });
  }

  var logoutUserMenuBtn = document.getElementById('logoutUserMenuBtn');
  if (logoutUserMenuBtn) {
    logoutUserMenuBtn.addEventListener('click', function () {
      App.UI.closeMenu();
      App.UserSession.logout();
    });
  }

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
    }).catch(function () { App.UI.showAlert('Invalid file', 'Invalid sim faculty file.'); });
    e.target.value = '';
  });

  document.getElementById('exportSimFacultyBtn').addEventListener('click', function () {
    if (!App.SimFacultyStorage.isReady()) {
      App.UI.showAlert('Sim faculty', 'Connect or create a sim faculty file first.');
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
    }).catch(function () { App.UI.showAlert('Invalid file', 'Invalid semester file.'); });
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
    App.UI.showConfirm('Clear local data?', msg, function () {
      App.Storage.clearAndRestoreDefaults().then(function () {
        App.UI.Dashboard.populateFilters(App.getData());
        App.UI.refresh();
      });
    }, { confirmLabel: 'Continue' });
  });

  document.getElementById('saveBtn').addEventListener('click', function () {
    Promise.all([
      App.Storage.saveCurrent(),
      App.SimFacultyStorage.isReady() ? App.SimFacultyStorage.saveCurrent() : Promise.resolve(),
      App.ClinicalSitesLibraryStorage && App.ClinicalSitesLibraryStorage.isReady()
        ? App.ClinicalSitesLibraryStorage.saveCurrent() : Promise.resolve()
    ]).then(function () {
      if (App.Storage.supportsFS()) {
        App.UI.showAlert('Saved', 'Saved to connected file(s).');
      } else {
        App.UI.showAlert('Saved', 'Saved on this device. Export backup to OneDrive when finished.');
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
      if (!App.Permissions.guard('semester.batchCreate') && !App.Permissions.canAction('*')) {
        App.UI.closeMenu();
        return;
      }
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
    ['openFileBtn', 'newFileBtn', 'openSimFacultyBtn', 'newSimFacultyBtn'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }

  App.onStateChange(function () { App.Storage.updateStatusUI(); });
  if (App.Permissions) App.Permissions.apply();
};

App.main = function () {
  App.UserSession.init().then(function (sessionResult) {
    if (sessionResult.needsGate) {
      App.UserSession.showGateModal(sessionResult.error);
    }
    return App.Storage.init();
  }).then(function (fileRoot) {
    return App.ClinicalSitesLibraryStorage.init().then(function () {
      if (fileRoot && App.ClinicalSitesLibraryStorage.migrateFromSemesterOverlay(fileRoot)) {
        App.ClinicalSitesLibraryStorage.saveCurrent();
      }
      return App.SimFacultyStorage.init(fileRoot).then(function () {
        return fileRoot;
      });
    });
  }).then(function (fileRoot) {
    if (App.Theme) App.Theme.init(fileRoot);
    App.UI.Dashboard.populateFilters(App.getData());
    App.UI.init();
    if (App.UserSession.isValidated()) {
      App.UserSession.hideGateModal();
      App.UI.switchTab('dashboard');
    }
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.main);
} else {
  App.main();
}
