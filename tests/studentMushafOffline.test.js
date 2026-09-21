import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('packages the complete Hafs Mushaf for native offline reading', async () => {
  const [indexText, pageFiles, fontFiles] = await Promise.all([
    readProjectFile('public/quran/hafs/index.json'),
    readdir(new URL('../public/quran/hafs/pages/', import.meta.url)),
    readdir(new URL('../public/quran/hafs/fonts/', import.meta.url)),
  ]);
  const index = JSON.parse(indexText);

  assert.equal(index.pageCount, 604);
  assert.equal(index.chapters.length, 114);
  assert.equal(index.juzs.length, 30);
  assert.equal(pageFiles.filter((name) => /^\d+\.json$/.test(name)).length, 604);
  assert.equal(fontFiles.filter((name) => /^p\d+\.woff2$/.test(name)).length, 604);
  assert.ok(fontFiles.includes('uthmanic-hafs.woff2'));

  for (const pageNumber of [1, 575, 604]) {
    const content = await readProjectFile(`public/quran/hafs/pages/${pageNumber}.json`);
    const page = JSON.parse(content);
    assert.equal(page.page, pageNumber);
    assert.ok(page.words.length > 0);
    assert.equal(createHash('sha256').update(content).digest('hex'), index.pageHashes[pageNumber]);
  }
});

test('student-only Mushaf route uses local pages, local fonts, and cached daily memorization', async () => {
  const [portal, routes, section, indexDialog, storage, offlineService, fonts, carousel] = await Promise.all([
    readProjectFile('src/pages/AccountPortal.jsx'),
    readProjectFile('src/lib/sectionRoutes.js'),
    readProjectFile('src/components/portal/StudentMushafSection.jsx'),
    readProjectFile('src/components/portal/StudentMushafIndexDialog.jsx'),
    readProjectFile('src/lib/studentMushafStorage.js'),
    readProjectFile('src/services/offlineMushaf.js'),
    readProjectFile('src/lib/quranFonts.js'),
    readProjectFile('src/components/portal/MushafPageCarousel.jsx'),
  ]);

  assert.match(portal, /if \(session\.role === 'student'\)[\s\S]*?key: 'quranSessions', label: 'خطتي'/);
  assert.doesNotMatch(portal, /key: 'mushaf', label: 'المصحف'/);
  assert.match(portal, /settings\.hasStudentQuranExecution !== false[\s\S]*?key: 'quranExecution'/);
  assert.match(portal, /activeSection === 'mushaf'[\s\S]*?<StudentMushafSection studentId=\{session\.studentId\}/);
  assert.match(routes, /\['mushaf', 'mushaf'\]/);
  assert.match(section, /buildTodayMushafTarget\(today\)/);
  assert.match(section, /target\?\.page \|\| stored\.lastPage \|\| 1/);
  assert.match(section, /getStudentQuranToday\(studentId\)/);
  assert.match(section, /saveStudentMushafToday\(studentId, today\)/);
  assert.match(section, /StudentMushafIndexDialog/);
  assert.match(section, /saveStudentMushafBookmarks\(readerStorageId, next\)/);
  assert.match(section, /\{studentId && \(/);
  assert.match(section, /حفظ علامة الصفحة/);
  assert.match(section, /toolbarControlClass/);
  assert.match(indexDialog, /createPortal/);
  assert.match(indexDialog, /aria-labelledby="student-mushaf-index-title"/);
  assert.doesNotMatch(section, /highlightRange=/);
  assert.match(section, /<PageBackButton onClick=\{onBack\} iconOnly/);
  assert.match(section, /h-dvh min-h-0 w-full/);
  assert.doesNotMatch(section, /min-h-\[34rem\]|overflow-y-auto/);
  assert.match(portal, /if \(!isOnline\)[\s\S]*key: 'quranSessions'[\s\S]*key: 'dailyChallenge'[\s\S]*key: 'store'/);
  assert.match(portal, /!isOnline && session\.role !== 'student'/);
  assert.match(section, /if \(!initialTarget && studentId && \(typeof navigator === 'undefined' \|\| navigator\.onLine\)\)/);
  assert.match(indexDialog, /السور/);
  assert.match(indexDialog, /الأجزاء/);
  assert.match(indexDialog, /الصفحات/);
  assert.match(indexDialog, /العلامات/);
  assert.match(indexDialog, /numericQuery\.match/);
  assert.match(indexDialog, /directAyah\.page/);
  assert.match(storage, /madarij_student_mushaf_/);
  assert.match(offlineService, /quran\/hafs\/pages\/\$\{page\}\.json/);
  assert.match(offlineService, /radius = 10/);
  assert.match(section, /preloadOfflineMushafPages\(page, 10\)/);
  assert.match(section, /preloadCompleteOfflineMushaf\(\)/);
  assert.match(offlineService, /completeMushafAssets/);
  assert.match(offlineService, /quran\/hafs\/fonts\/p\$\{index \+ 1\}\.woff2/);
  assert.match(offlineService, /Promise\.all\(Array\.from\(\{ length: 4 \}, preloadAsset\)\)/);
  assert.doesNotMatch(section, /getCachedOfflineMushafPage\(boundedPage\)/);
  assert.match(section, /setPageData\(null\);\s*setFontReady\(false\);\s*setPage\(boundedPage\)/);
  assert.doesNotMatch(offlineService, /\/api\/|quran\.com|quran\.foundation/);
  assert.match(fonts, /quran\/hafs\/fonts\/p\$\{page\}\.woff2/);
  assert.doesNotMatch(fonts, /getApiBase|quran-fonts\/hafs\/v2/);
  assert.match(carousel, /pageAction \|\| \(onFinish \?/);
  assert.match(portal, /activeSection === 'mushaf'[\s\S]*?StudentMushafSection studentId=\{session\.studentId\} onBack=\{leaveMushaf\}/);
  assert.match(portal, /madarij_mushaf_return_section/);
});

test('student plan replaces separate saved navigation and shares the offline plan cache', async () => {
  const [saved, portal, server, offlineStudent] = await Promise.all([
    readProjectFile('src/components/portal/StudentPlanPanel.jsx'),
    readProjectFile('src/pages/AccountPortal.jsx'),
    readProjectFile('server/index.js'),
    readProjectFile('src/services/offlineStudentService.js'),
  ]);

  assert.doesNotMatch(portal, /label: 'الخطة والمحفوظ'/);
  assert.match(saved, /StudentPlanProgress/);
  assert.match(saved, /StudentPlanWeek/);
  assert.match(saved, /useStudentPlan/);
  assert.match(offlineStudent, /loadStudentPlan\(studentId\)/);
  assert.match(offlineStudent, /getStudentQuranToday\(studentId\)/);
  assert.match(offlineStudent, /student:quran-saved-plan-v3/);
  assert.doesNotMatch(saved, /grid-cols-5|StudentReviewHistory|getStudentQuranReviewHistory|reviewRows/);
  assert.match(server, /getStudentAvailableJuzs\(connection, studentId\)/);
  assert.match(server, /juzs\.filter\(\(juz\) => Number\(juz\.progressPercent \|\| 0\) > 0\)/);
  assert.match(server, /memorizedAyahs \/ totalAyahs/);
  assert.match(server, /todayAmounts: normalizedTasks\.filter/);
});

test('student Mushaf keeps its text neutral and animates RTL horizontal page turns', async () => {
  const [page, carousel, carouselStyles] = await Promise.all([
    readProjectFile('src/components/portal/MadaniMushafPage.jsx'),
    readProjectFile('src/components/portal/MushafPageCarousel.jsx'),
    readProjectFile('src/components/portal/MushafPageCarousel.css'),
  ]);

  assert.match(page, /data-mushaf-no-swipe=\{markingMode \? '' : undefined\}/);
  assert.match(page, /markingMode \? 'touch-none' : 'touch-pan-y'/);
  assert.match(carousel, /moveByPage\(deltaX < 0 \? -1 : 1\)/);
  assert.match(carousel, /Math\.abs\(deltaX\) >= SWIPE_DISTANCE/);
  assert.match(carousel, /data-page-turn-direction=\{turnDirection \|\| undefined\}/);
  assert.match(carouselStyles, /mushaf-page-turn--forward/);
  assert.match(carouselStyles, /mushaf-page-turn--backward/);
  assert.match(carouselStyles, /220ms/);
  assert.match(carouselStyles, /prefers-reduced-motion: reduce/);
});
