import { describe, it, expect } from 'vitest';
import { ProposalFormat } from './_harness.js';

describe('proposal-format.test.js', () => {
  it('runs assertions', () => {
    let failed = 0;

    function assert(cond, msg) {
      if (cond) return;
      failed++;
      console.error('FAIL: ' + msg);
    }

    function makeSem() {
      return {
        students: [
          { id: 'stu1', name: 'Student 1', clinicalGroup: 'C1', simGroup: 'SG1', section: 'F6011', facilityId: 'fac1' },
          { id: 'stu_blank', name: '', clinicalGroup: 'C1', simGroup: 'SG1', section: '', facilityId: '' }
        ],
        faculty: [
          { id: 'fac_id1', name: '', clinicalGroup: 'C1' },
          { id: 'fac_id2', name: 'Dr. Smith', clinicalGroup: 'C2' }
        ],
        sections: [{ id: 'sec1', name: 'F6011' }],
        facilities: [{ id: 'fac1', name: 'Memorial', shortName: 'Memorial — Med-Surg' }],
        meta: { leadFaculty: { name: '', email: '' } }
      };
    }

    var sem = makeSem();

    assert(ProposalFormat.formatLabel('config.clinicalDaysRequired', sem) === 'Required clinical days',
      'config scalar label');
    var cfgChange = ProposalFormat.formatChange('config.clinicalDaysRequired', 10, 12, sem);
    assert(cfgChange.before === '10' && cfgChange.after === '12', 'config scalar values');

    assert(ProposalFormat.formatLabel('config.simGroupDays.SG1', sem) === 'SG1 simulation weekday',
      'sim group days label');
    var dayChange = ProposalFormat.formatChange('config.simGroupDays.SG1', 'Mon', 'Tue', sem);
    assert(dayChange.before === 'Mon' && dayChange.after === 'Tue', 'weekday values');

    var leadChange = ProposalFormat.formatChange('meta.leadFaculty',
      { name: '', email: '' },
      { name: 'Jane Doe', email: 'j@example.edu' },
      sem);
    assert(leadChange.before.indexOf('{') < 0, 'lead faculty before has no JSON');
    assert(leadChange.after.indexOf('Jane Doe') >= 0 && leadChange.after.indexOf('j@example.edu') >= 0,
      'lead faculty after shows name and email');

    var legacyFaculty = ProposalFormat.formatChange('faculty',
      [{ id: 'fac_id1', name: '', clinicalGroup: 'C1' }],
      [{ id: 'fac_id1', name: 'Jane Doe', clinicalGroup: 'C1' }],
      sem);
    assert(legacyFaculty.before.indexOf('[{"id"') < 0, 'legacy faculty has no JSON array');
    assert(legacyFaculty.before.indexOf('Clinical Faculty 1') >= 0, 'legacy faculty before uses fallback name');
    assert(legacyFaculty.after.indexOf('Jane Doe') >= 0, 'legacy faculty after shows new name');

    var facNameChange = ProposalFormat.formatChange('faculty.fac_id1.name', '', 'Jane Doe', sem);
    assert(facNameChange.before.indexOf('Clinical Faculty 1') >= 0, 'faculty name path uses fallback');
    assert(facNameChange.after === 'Jane Doe', 'faculty name after is plain name');

    assert(ProposalFormat.formatLabel('students.stu_blank.name', sem) === 'Student 2 — name',
      'blank student label uses Student n');
    assert(ProposalFormat.formatLabel('students.stu1.section', sem) === 'Student 1 — registrar section',
      'student field human label');

    var secAdd = ProposalFormat.formatChange('sections.sec_new', undefined, { id: 'sec_new', name: 'F6099' }, sem);
    assert(secAdd.before === '(none)' && secAdd.after === 'F6099', 'section add formatting');

    var rosterChange = ProposalFormat.formatChange('students',
      sem.students.slice(0, 1),
      sem.students,
      sem);
    assert(rosterChange.before.indexOf('1 student') >= 0, 'roster before count');
    assert(rosterChange.after.indexOf('2 student') >= 0, 'roster after count');

    expect(failed).toBe(0);
  });
});
