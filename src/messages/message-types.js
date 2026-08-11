/**
 * Stable in-app message type ids (notification banner UI deferred).
 */

var MESSAGE_TYPES = {
  SUB_NEEDED: 'sub_needed',
  SELF_SCHEDULING_OPEN: 'self_scheduling_open',
  SELF_SCHEDULE_UPDATE: 'self_schedule_update',
  STUDENT_PERFORMANCE: 'student_performance',
  SUB_REQUEST_UPDATE: 'sub_request_update',
  ROLE_UPDATE: 'role_update',
  COURSE_SETUP_UPDATE: 'course_setup_update',
  COURSE_PROPOSAL_UPDATE: 'course_proposal_update',
  ROLE_ASSIGNED: 'role_assigned',
  AUDIT_STATUS: 'audit_status',
  NEW_SELF_SCHEDULE_REQUESTS: 'new_self_schedule_requests',
  SUBSTITUTE_REQUEST: 'substitute_request',
  SUBSTITUTE_CLAIM: 'substitute_claim',
  COURSE_PROPOSAL: 'course_proposal',
  AUDIT_STATUS_UPDATE: 'audit_status_update',
  USER_ROLE_UPDATE_REQUEST: 'user_role_update_request'
};

var DEFAULT_TITLES = {};
DEFAULT_TITLES[MESSAGE_TYPES.SUB_NEEDED] = 'Substitute needed';
DEFAULT_TITLES[MESSAGE_TYPES.SELF_SCHEDULING_OPEN] = 'Self scheduling open';
DEFAULT_TITLES[MESSAGE_TYPES.SELF_SCHEDULE_UPDATE] = 'Self schedule update';
DEFAULT_TITLES[MESSAGE_TYPES.STUDENT_PERFORMANCE] = 'Student performance';
DEFAULT_TITLES[MESSAGE_TYPES.SUB_REQUEST_UPDATE] = 'Substitute request update';
DEFAULT_TITLES[MESSAGE_TYPES.ROLE_UPDATE] = 'Role update';
DEFAULT_TITLES[MESSAGE_TYPES.COURSE_SETUP_UPDATE] = 'Course setup update';
DEFAULT_TITLES[MESSAGE_TYPES.COURSE_PROPOSAL_UPDATE] = 'Course proposal update';
DEFAULT_TITLES[MESSAGE_TYPES.ROLE_ASSIGNED] = 'Role assigned';
DEFAULT_TITLES[MESSAGE_TYPES.AUDIT_STATUS] = 'Audit status';
DEFAULT_TITLES[MESSAGE_TYPES.NEW_SELF_SCHEDULE_REQUESTS] = 'New self schedule requests';
DEFAULT_TITLES[MESSAGE_TYPES.SUBSTITUTE_REQUEST] = 'Substitute request';
DEFAULT_TITLES[MESSAGE_TYPES.SUBSTITUTE_CLAIM] = 'Substitute claim';
DEFAULT_TITLES[MESSAGE_TYPES.COURSE_PROPOSAL] = 'Course proposal';
DEFAULT_TITLES[MESSAGE_TYPES.AUDIT_STATUS_UPDATE] = 'Audit status update';
DEFAULT_TITLES[MESSAGE_TYPES.USER_ROLE_UPDATE_REQUEST] = 'User role update request';

function isKnownType(type) {
  var t = String(type || '');
  return Object.keys(MESSAGE_TYPES).some(function (k) {
    return MESSAGE_TYPES[k] === t;
  });
}

function defaultTitle(type) {
  return DEFAULT_TITLES[type] || 'Notification';
}

export {
  MESSAGE_TYPES,
  DEFAULT_TITLES,
  isKnownType,
  defaultTitle
};
