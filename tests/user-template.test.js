import { describe, it, expect } from 'vitest';
import { UserTemplate } from './_harness.js';

describe('user-template.test.js', () => {
  it('runs assertions', () => {
    let failed = 0;

    function assert(cond, msg) {
      if (cond) return;
      failed++;
      console.error('FAIL: ' + msg);
    }

    assert(UserTemplate.canTab('lead_course_faculty', 'makeup'),
      'lead course faculty can access makeup tab');
    assert(UserTemplate.canAction('lead_course_faculty', 'makeup.edit'),
      'lead course faculty can apply makeup');
    assert(!UserTemplate.canTab('adjunct_faculty', 'makeup'),
      'adjunct faculty cannot access makeup tab');
    assert(!UserTemplate.canTab('admin_staff', 'makeup'),
      'admin staff cannot access makeup tab');
    assert(UserTemplate.canAction('program_engineer', 'makeup.edit'),
      'program engineer can apply makeup via wildcard');

    expect(failed).toBe(0);
  });
});
