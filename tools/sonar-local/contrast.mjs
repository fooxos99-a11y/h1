import fs from 'node:fs';import postcss from 'postcss';
const edits={
 'src/components/games/categories/categoriesGame.css': {
 '.categories-choice.is-selected .categories-choice-mark':{background:'#f1edf9',color:'#31204f'},
 '.categories-choice.is-selected .categories-choice-meta':{background:'#f1edf9',color:'#31204f'},
 },
 'src/components/games/letter-hive/letterHive.css':{'.letter-hive-bank-tabs button.is-active':{background:'linear-gradient(135deg, #6d28d9 0%, #5b21b6 100%)'}},
 'src/components/portal/home/student-home.css':{
 '.student-home .student-home-level,.student-home .student-home-store':{background:'linear-gradient(145deg,#087780,#09626f)'},
 '.student-home-section-head h1 svg':{color:'#0b6873'},
 '.student-home-rankings>h2 svg':{color:'#805b17'},
 '.student-home-rank-medal':{color:'#526b75'},
 "[data-rank='1']>.student-home-rank-medal":{color:'#795512'},
 "[data-rank='2']>.student-home-rank-medal":{color:'#4b6579'},
 "[data-rank='3']>.student-home-rank-medal":{color:'#795533'},
 '.student-bottom-navigation>button[aria-current=page]':{color:'#086b76'},
 '.student-home-header-actions>button:not(.student-home-store)':{color:'#086b76'},
 },
 'src/components/portal/student-plan.css':{
 ".student-plan-feedback [data-tone='mistake']":{background:'#fff1f2'},
 ".student-plan-feedback [data-tone='warning']":{background:'#fff7e6'},
 },
 'src/components/portal/studentDailyChallenge.css':{
 '.daily-challenge-primary':{color:'#18343e'},
 '.daily-challenge-points':{background:'#123f49'},
 '.daily-challenge-timer':{background:'#123f49'},
 '.daily-challenge-selection b':{color:'#18343e'},
 '.daily-challenge-equation':{background:'#154553'},
 '.daily-challenge-options button':{background:'#154553'},
 },
 'src/components/summit/SummitJourneyMap.css':{'.qassim-road-scene':{color:'#18343e'}},
 'src/components/summit/summitMiniGames.css':{'.summit-game-action':{color:'#18343e'}},
};
for(const [file,selectors] of Object.entries(edits)){
 const root=postcss.parse(fs.readFileSync(file,'utf8'));root.walkRules(rule=>{const change=selectors[rule.selector];if(!change)return;rule.walkDecls(decl=>{if(change[decl.prop])decl.value=change[decl.prop];});});fs.writeFileSync(file,root.toString());
}
