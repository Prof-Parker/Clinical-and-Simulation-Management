/**
 * App release version (semver major.minor.patch).
 * Single source of truth for the header badge and audit exports.
 * Bump on every commit — see .cursor/rules/app-version-bump.mdc
 */
export var APP_VERSION = '2.3.0';

export function formatAppVersionLabel(version) {
  var v = version || APP_VERSION;
  return v.charAt(0) === 'v' ? v : 'v' + v;
}
