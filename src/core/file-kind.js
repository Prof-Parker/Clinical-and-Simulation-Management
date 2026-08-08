/**
 * File kind guards — discriminate program/playground/registry/library JSON files.
 * Accident prevention only; OneDrive ACLs remain authoritative.
 */

import {
  detectFileKind,
  inferFileKind,
  inferFromFilenameOnly
} from './file-kind-detect.js';

export var FILE_KINDS = {
  PROGRAM_SEMESTER: 'program_semester',
  PLAYGROUND: 'playground',
  USERS_REGISTRY: 'users_registry',
  USER_CREDENTIAL: 'user_credential',
  CLINICAL_SITES_LIBRARY: 'clinical_sites_library',
  THEORY_CONTENT_LIBRARY: 'theory_content_library'
};

export var KIND_LABELS = {
  program_semester: 'program semester',
  playground: 'playground',
  users_registry: 'users registry',
  user_credential: 'user credential',
  clinical_sites_library: 'clinical sites library',
  theory_content_library: 'theory content library'
};

export var ERROR_CODES = {
  KIND_MISMATCH: 'KIND_MISMATCH',
  KIND_PLAYGROUND_TO_PROGRAM: 'KIND_PLAYGROUND_TO_PROGRAM',
  KIND_PROGRAM_TO_PLAYGROUND: 'KIND_PROGRAM_TO_PLAYGROUND',
  KIND_INVALID_JSON: 'KIND_INVALID_JSON',
  KIND_AMBIGUOUS: 'KIND_AMBIGUOUS'
};

var SEMESTER_SHAPE = [FILE_KINDS.PROGRAM_SEMESTER, FILE_KINDS.PLAYGROUND];

function baseName(fileName) {
  return String(fileName || '').split(/[/\\]/).pop() || '';
}

export function kindLabel(kind) {
  return KIND_LABELS[kind] || kind || 'unknown';
}

export function stampFileKind(root, kind) {
  if (!root || typeof root !== 'object') return root;
  if (kind === FILE_KINDS.USER_CREDENTIAL) {
    root.fileKind = FILE_KINDS.USER_CREDENTIAL;
    return root;
  }
  if (!root.meta || typeof root.meta !== 'object') root.meta = {};
  root.meta.fileKind = kind;
  return root;
}

export { detectFileKind, inferFileKind };

export function filenameMatchesKind(name, kind) {
  var n = baseName(name);
  if (!n || !kind) return true;
  switch (kind) {
    case FILE_KINDS.PLAYGROUND:
      return /^user_.+_playground\.json$/i.test(n);
    case FILE_KINDS.PROGRAM_SEMESTER:
      return (/^[FS]20\d{2}_.+\.json$/i.test(n) || /_program\.json$/i.test(n)) &&
        !/_playground/i.test(n);
    case FILE_KINDS.USERS_REGISTRY:
      return /^users-registry\.json$/i.test(n);
    case FILE_KINDS.USER_CREDENTIAL:
      return /\.user\.json$/i.test(n);
    case FILE_KINDS.CLINICAL_SITES_LIBRARY:
      return /^clinical-sites-library\.json$/i.test(n);
    case FILE_KINDS.THEORY_CONTENT_LIBRARY:
      return /^theory-content-library_.+\.json$/i.test(n);
    default:
      return true;
  }
}

/** True when filename strongly conflicts with expected kind (layer 3 reject/warn). */
export function filenameConflictsWithKind(name, kind) {
  var n = baseName(name);
  if (!n || !kind) return false;
  switch (kind) {
    case FILE_KINDS.PLAYGROUND:
      return /^[FS]20\d{2}_.*REGN.*\.json$/i.test(n) && !/_playground/i.test(n);
    case FILE_KINDS.PROGRAM_SEMESTER:
      return /_playground\.json$/i.test(n) ||
        /\.user\.json$/i.test(n) ||
        /^users-registry\.json$/i.test(n) ||
        /^clinical-sites-library\.json$/i.test(n) ||
        /^theory-content-library_/i.test(n);
    case FILE_KINDS.USERS_REGISTRY:
      return !/^users-registry\.json$/i.test(n);
    case FILE_KINDS.USER_CREDENTIAL:
      return /^users-registry\.json$/i.test(n) ||
        /^[FS]20\d{2}_/i.test(n) ||
        /_playground\.json$/i.test(n) ||
        /^clinical-sites-library\.json$/i.test(n) ||
        /^theory-content-library_/i.test(n);
    case FILE_KINDS.CLINICAL_SITES_LIBRARY:
      return /^[FS]20\d{2}_/i.test(n) || /_playground\.json$/i.test(n) ||
        /\.user\.json$/i.test(n) || /^users-registry\.json$/i.test(n);
    case FILE_KINDS.THEORY_CONTENT_LIBRARY:
      return /^[FS]20\d{2}_/i.test(n) || /_playground\.json$/i.test(n) ||
        /\.user\.json$/i.test(n) || /^users-registry\.json$/i.test(n);
    default:
      return false;
  }
}

export function isHighRiskMismatch(expectedKind, detectedKind) {
  if (!expectedKind || !detectedKind || expectedKind === detectedKind) return false;
  if (expectedKind === FILE_KINDS.PLAYGROUND && detectedKind === FILE_KINDS.PROGRAM_SEMESTER) {
    return true;
  }
  if (expectedKind === FILE_KINDS.PROGRAM_SEMESTER && detectedKind === FILE_KINDS.PLAYGROUND) {
    return true;
  }
  if (expectedKind === FILE_KINDS.PROGRAM_SEMESTER && detectedKind === FILE_KINDS.USERS_REGISTRY) {
    return true;
  }
  if (expectedKind === FILE_KINDS.USERS_REGISTRY && SEMESTER_SHAPE.indexOf(detectedKind) >= 0) {
    return true;
  }
  if (expectedKind === FILE_KINDS.USER_CREDENTIAL && detectedKind !== FILE_KINDS.USER_CREDENTIAL) {
    return true;
  }
  if (expectedKind === FILE_KINDS.CLINICAL_SITES_LIBRARY && SEMESTER_SHAPE.indexOf(detectedKind) >= 0) {
    return true;
  }
  if (expectedKind === FILE_KINDS.THEORY_CONTENT_LIBRARY && SEMESTER_SHAPE.indexOf(detectedKind) >= 0) {
    return true;
  }
  if (SEMESTER_SHAPE.indexOf(expectedKind) >= 0 &&
      (detectedKind === FILE_KINDS.USERS_REGISTRY ||
       detectedKind === FILE_KINDS.USER_CREDENTIAL ||
       detectedKind === FILE_KINDS.CLINICAL_SITES_LIBRARY ||
       detectedKind === FILE_KINDS.THEORY_CONTENT_LIBRARY)) {
    return true;
  }
  return false;
}

export function formatKindError(code, vars) {
  vars = vars || {};
  var name = vars.name || 'the selected file';
  var expected = kindLabel(vars.expected);
  var detected = kindLabel(vars.detected);
  switch (code) {
    case ERROR_CODES.KIND_PLAYGROUND_TO_PROGRAM:
      return 'Cannot save playground data over the program semester file ' + name + '.';
    case ERROR_CODES.KIND_PROGRAM_TO_PLAYGROUND:
      return 'This is a playground file. Use Connect OneDrive file for the live semester, or open it from the Playground tab.';
    case ERROR_CODES.KIND_INVALID_JSON:
      return 'The selected file is not valid JSON for this app.';
    case ERROR_CODES.KIND_AMBIGUOUS:
      return 'Could not determine file type. Rename to match ' +
        (vars.suggestedName || 'the expected naming convention') +
        ' or contact program engineer.';
    case ERROR_CODES.KIND_MISMATCH:
    default:
      return 'This file is a ' + detected + ' file, not a ' + expected + ' file.';
  }
}

function mismatchCode(expectedKind, detectedKind) {
  if (expectedKind === FILE_KINDS.PLAYGROUND && detectedKind === FILE_KINDS.PROGRAM_SEMESTER) {
    return ERROR_CODES.KIND_PLAYGROUND_TO_PROGRAM;
  }
  if (expectedKind === FILE_KINDS.PROGRAM_SEMESTER && detectedKind === FILE_KINDS.PLAYGROUND) {
    return ERROR_CODES.KIND_PROGRAM_TO_PLAYGROUND;
  }
  return ERROR_CODES.KIND_MISMATCH;
}

/**
 * Validate parsed JSON against expected kind.
 * @returns {{ ok: boolean, hardBlock?: boolean, code?: string, message?: string,
 *   detected?: string|null, expected?: string, warnFilename?: boolean, fileName?: string }}
 */
export function assertFileKind(raw, expectedKind, options) {
  options = options || {};
  var fileName = baseName(options.fileName || '');
  var detected = detectFileKind(raw, fileName);

  if (!detected) {
    return {
      ok: false,
      hardBlock: true,
      code: ERROR_CODES.KIND_AMBIGUOUS,
      message: formatKindError(ERROR_CODES.KIND_AMBIGUOUS, {
        suggestedName: options.suggestedName
      }),
      detected: null,
      expected: expectedKind,
      fileName: fileName
    };
  }

  if (detected !== expectedKind) {
    var code = mismatchCode(expectedKind, detected);
    var hard = isHighRiskMismatch(expectedKind, detected);
    return {
      ok: false,
      hardBlock: hard,
      code: code,
      message: formatKindError(code, {
        name: fileName || 'the selected file',
        expected: expectedKind,
        detected: detected
      }),
      detected: detected,
      expected: expectedKind,
      fileName: fileName
    };
  }

  var warnFilename = !!(fileName && filenameConflictsWithKind(fileName, expectedKind));
  return {
    ok: true,
    detected: detected,
    expected: expectedKind,
    warnFilename: warnFilename,
    fileName: fileName,
    message: warnFilename
      ? 'The filename "' + fileName + '" does not match the usual pattern for ' +
        kindLabel(expectedKind) + ' files.'
      : ''
  };
}

/**
 * When content kind matches expected but filename implies a different high-risk kind,
 * hard-block (polluted-file defense). Otherwise soft-confirm unusual names.
 */
function filenameHighRiskHardBlock(fileName, expectedKind, options) {
  var fromName = inferFromFilenameOnly(baseName(fileName));
  if (!fromName || fromName === expectedKind || !isHighRiskMismatch(expectedKind, fromName)) {
    return null;
  }
  var code = mismatchCode(expectedKind, fromName);
  var check = {
    code: code,
    message: formatKindError(code, {
      name: fileName || 'the selected file',
      expected: expectedKind,
      detected: fromName
    }),
    detected: fromName,
    expected: expectedKind,
    fileName: fileName
  };
  return {
    proceed: false,
    hardBlock: true,
    needsConfirm: false,
    code: code,
    title: 'Wrong file type',
    message: buildHardBlockBody(check, expectedKind, options || {}),
    detected: fromName,
    expected: expectedKind,
    fileName: fileName
  };
}

/**
 * Evaluate an existing on-disk payload before overwrite.
 * @returns {{ proceed: boolean, hardBlock?: boolean, needsConfirm?: boolean,
 *   code?: string, message?: string, detected?: string|null, expected?: string,
 *   fileName?: string, title?: string }}
 */
export function evaluateGuard(existing, fileName, expectedKind, options) {
  options = options || {};
  var check = assertFileKind(existing, expectedKind, {
    fileName: fileName,
    suggestedName: options.suggestedName
  });

  if (check.ok && !check.warnFilename) {
    return { proceed: true, detected: check.detected, expected: expectedKind, fileName: fileName };
  }

  if (check.ok && check.warnFilename) {
    var highRiskName = filenameHighRiskHardBlock(fileName, expectedKind, options);
    if (highRiskName) return highRiskName;
    return {
      proceed: false,
      needsConfirm: true,
      hardBlock: false,
      code: ERROR_CODES.KIND_MISMATCH,
      title: 'Unusual filename',
      message: check.message + '\n\nSaving here may make the file harder to find later.',
      detected: check.detected,
      expected: expectedKind,
      fileName: fileName
    };
  }

  if (check.hardBlock) {
    return {
      proceed: false,
      hardBlock: true,
      needsConfirm: false,
      code: check.code,
      title: 'Wrong file type',
      message: buildHardBlockBody(check, expectedKind, options),
      detected: check.detected,
      expected: expectedKind,
      fileName: fileName
    };
  }

  return {
    proceed: false,
    hardBlock: false,
    needsConfirm: true,
    code: check.code,
    title: 'Wrong file type',
    message: check.message + '\n\nDo you want to overwrite this file anyway?',
    detected: check.detected,
    expected: expectedKind,
    fileName: fileName
  };
}

var WIPE_RESTORE_HINT =
  '\n\nConfirming Replace in the system save dialog may have already cleared this file. ' +
  'Restore it from OneDrive version history, a known-good copy, or re-seed mock OneDrive ' +
  '(npm run seed:mock-onedrive). Do not save this data under that name.';

function buildHardBlockBody(check, expectedKind, options) {
  options = options || {};
  var name = check.fileName || 'the selected file';
  var detected = kindLabel(check.detected);
  var body = check.message;
  if (expectedKind === FILE_KINDS.PLAYGROUND && check.detected === FILE_KINDS.PROGRAM_SEMESTER) {
    body = 'You selected ' + name + ', which is a ' + detected +
      ' file (team master data).\n\n' +
      'Playground files must be saved as ' +
      (options.suggestedName || 'user_{term}_{courseId}_playground.json') +
      ' in the playgrounds/ folder.\n\n' +
      'Saving here would replace live semester data with your sandbox. ' +
      'This cannot be undone from the app.';
  } else if (expectedKind === FILE_KINDS.PROGRAM_SEMESTER &&
      check.detected === FILE_KINDS.PLAYGROUND) {
    body = check.message + '\n\nOpen Playground tab instead to work with sandbox files.';
  }
  if (options.emptyTarget) {
    body += WIPE_RESTORE_HINT;
  }
  return body;
}

/**
 * Filename-only guard when target is empty or unreadable (no JSON content).
 */
function evaluateEmptyTarget(name, expectedKind, options) {
  options = options || {};
  var fromName = inferFromFilenameOnly(baseName(name));
  var nameConflict = !!(name && filenameConflictsWithKind(name, expectedKind));
  if (fromName && fromName !== expectedKind) {
    var hardEmpty = isHighRiskMismatch(expectedKind, fromName);
    var codeEmpty = mismatchCode(expectedKind, fromName);
    var emptyCheck = {
      code: codeEmpty,
      message: formatKindError(codeEmpty, {
        name: name || 'the selected file',
        expected: expectedKind,
        detected: fromName
      }),
      detected: fromName,
      expected: expectedKind,
      fileName: name
    };
    return {
      proceed: false,
      hardBlock: hardEmpty,
      needsConfirm: !hardEmpty,
      code: codeEmpty,
      title: 'Wrong file type',
      message: hardEmpty
        ? buildHardBlockBody(emptyCheck, expectedKind, Object.assign({}, options, { emptyTarget: true }))
        : emptyCheck.message + '\n\nDo you want to overwrite this file anyway?',
      detected: fromName,
      expected: expectedKind,
      fileName: name,
      empty: true
    };
  }
  if (nameConflict) {
    var highRiskName = filenameHighRiskHardBlock(name, expectedKind, Object.assign({}, options, {
      emptyTarget: true
    }));
    if (highRiskName) {
      highRiskName.empty = true;
      return highRiskName;
    }
    return {
      proceed: false,
      needsConfirm: true,
      hardBlock: false,
      code: ERROR_CODES.KIND_MISMATCH,
      title: 'Unusual filename',
      message: 'The filename "' + name + '" does not match the usual pattern for ' +
        kindLabel(expectedKind) + ' files.\n\nSaving here may make the file harder to find later.',
      detected: expectedKind,
      expected: expectedKind,
      fileName: name,
      empty: true
    };
  }
  return { proceed: true, empty: true };
}

export function readAndParseHandle(handle) {
  if (!handle || typeof handle.getFile !== 'function') {
    return Promise.resolve(null);
  }
  return handle.getFile().then(function (file) {
    if (!file || file.size === 0) return null;
    return file.text().then(function (text) {
      var trimmed = String(text || '').trim();
      if (!trimmed) return null;
      try {
        return JSON.parse(trimmed);
      } catch (e) {
        var err = new Error(formatKindError(ERROR_CODES.KIND_INVALID_JSON));
        err.code = ERROR_CODES.KIND_INVALID_JSON;
        throw err;
      }
    });
  });
}

/**
 * Pre-write guard. Does not show UI — caller prompts from the returned result.
 */
export function guardBeforeWrite(handle, expectedKind, options) {
  options = options || {};
  return readAndParseHandle(handle).then(function (existing) {
    var name = handle && handle.name;
    if (!existing) {
      return evaluateEmptyTarget(name, expectedKind, options);
    }
    return evaluateGuard(existing, name, expectedKind, options);
  }).catch(function (err) {
    // Unreadable target (e.g. NotAllowedError): still apply filename hard blocks.
    if (err && err.code === ERROR_CODES.KIND_INVALID_JSON) throw err;
    return evaluateEmptyTarget(handle && handle.name, expectedKind, options);
  });
}
