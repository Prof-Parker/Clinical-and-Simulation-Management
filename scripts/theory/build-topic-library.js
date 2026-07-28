/**
 * Build TheoryTopic[] from lecture rows and events.
 * Skills lab strings from source rows are returned separately — they belong in
 * the skills bank, not on topics.
 */

function emptyCurriculumMeta() {
  return {
    version: 1,
    corRefs: [],
    acenStandards: [],
    programOutcomes: [],
    courseOutcomes: [],
    notes: ''
  };
}

export function buildTopicLibrary(lectureRows, eventsByDate) {
  var topics = [];
  var skillTitles = [];
  var seen = {};
  lectureRows.forEach(function (row) {
    var title = (row.topic || '').split(';')[0].trim();
    if (!title || seen[title]) return;
    seen[title] = true;
    var id = 'topic_' + title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
    topics.push({
      id: id,
      title: title,
      shortLabel: title.length > 32 ? title.slice(0, 32) + '…' : title,
      description: '',
      defaultLectureHours: 2.83,
      defaultTopics: title.split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean),
      tags: ['MS'],
      curriculumMeta: emptyCurriculumMeta(),
      courseId: 'REGN15'
    });
    (row.skillsLab || '').split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean)
      .forEach(function (skillTitle) {
        var key = 'skill:' + skillTitle.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        skillTitles.push(skillTitle);
      });
  });
  return { topics: topics, skillTitles: skillTitles };
}

export function attachModuleRefs(theoryDays, topics) {
  theoryDays.forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      if (ev.track !== 'theory' || !ev.title) return;
      var base = ev.title.replace(/^Module \d+[A-D] — /, '').split(';')[0].trim();
      var topic = topics.find(function (t) {
        return t.title === base || t.title.indexOf(base) === 0 || base.indexOf(t.title) === 0;
      });
      if (topic) ev.moduleRef = topic.id;
    });
  });
}
