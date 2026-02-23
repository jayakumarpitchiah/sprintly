import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "./supabase.js";

const STORAGE_KEY = "sprintly_v2";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  bg0: "#ffffff", bg1: "#f8f9fa", bg2: "#f1f3f5", bg3: "#e9ecef",
  b0: "#f1f3f5", b1: "#e4e6ea", b2: "#ced4da",
  t0: "#1a1c1e", t1: "#4b5057", t2: "#868e96", t3: "#adb5bd",
  acc: "#4a6fa5", accL: "#3a5f95",
  p1: "#b85c5c", p1bg: "#fff0f0",
  p2: "#9a7c35", p2bg: "#fffbf0",
  hol: "#0d9488", holBg: "#f0fdf4",
  p3: "#4a7a5a", p3bg: "#f0fff4",
  sDo:  { bg:"#f8f9fa", text:"#868e96", border:"#e4e6ea" },
  sPlan:{ bg:"#f0f4ff", text:"#5a6fa5", border:"#c0cce8" },
  sDev: { bg:"#fffbf0", text:"#9a7c35", border:"#f0e0a0" },
  sQA:  { bg:"#f0fff4", text:"#4a7a5a", border:"#a8d8b8" },
  sRel: { bg:"#f0f6ff", text:"#4a6fa5", border:"#b0cce8" },
  sBlk: { bg:"#fff0f0", text:"#b85c5c", border:"#f0b8b8" },
};

const PRIORITY_ORDER = { P1: 0, P2: 1, P3: 2 };
const PRIORITY_COLOR = {
  P1: { bg: T.p1, bgCard: T.p1bg },
  P2: { bg: T.p2, bgCard: T.p2bg },
  P3: { bg: T.p3, bgCard: T.p3bg },
};
const STATUSES = ["Planned","To Do","In Dev","In QA","Released","Blocked","Descoped"];
const STATUS_COLOR = {
  "Planned": T.sPlan,
  "To Do":   T.sDo,
  "In Dev":  T.sDev,
  "In QA":   T.sQA,
  "Released":T.sRel,
  "Blocked": T.sBlk,
  "Descoped": { bg:"#f4f4f4", text:"#adb5bd", border:"#dee2e6" },
};

const TEAM = {
  Hari:     { bar:"#4a6fa5", lane:"#f5f8fc" },
  Sam:      { bar:"#8a6a3a", lane:"#fdf9f5" },
  Kevin:    { bar:"#4a7a5a", lane:"#f5fbf7" },
  Ruby:     { bar:"#7a5a8a", lane:"#f9f5fc" },
  Karan:    { bar:"#7a7040", lane:"#fbfaf5" },
  Kishore:  { bar:"#8a4a5a", lane:"#fcf5f7" },
  Prakash:  { bar:"#3a7a7a", lane:"#f5fbfb" },
  Raj:      { bar:"#6a5a8a", lane:"#f7f5fb" },
  Tamil:    { bar:"#8a4a70", lane:"#fcf5f9" },
  Adithya:  { bar:"#3a7a6a", lane:"#f5fbf9" },
  Gengu:    { bar:"#5a4a8a", lane:"#f7f5fb" },
  Shahid:   { bar:"#6a4a8a", lane:"#f8f5fb" },
  Abhishek: { bar:"#7a5a9a", lane:"#f9f5fc" },
};
const TEAM_NAMES = Object.keys(TEAM);

// Tracks: ios=Hari lane, and=Sam/Kevin lane, be=backend, qa=QA
// Each task now has: owners = { ios:"Hari", and:"Sam", be:"Ruby", wc:"", qa:"Gengu" }
// and effort = { ios:2, and:3, be:5, wc:0, qa:2 }
// dependsOn: [taskId, ...]
// plannedStart, actualStart, plannedEnd (computed), actualEnd

// Holidays are org-specific — add via Team Calendar, no defaults
// L2_DAYS / KISHORE_L2 moved into config.calendarEvents

// ─── MIGRATE OLD TASK FORMAT → NEW ────────────────────────────────────────────
function migrateTask(t) {
  const base = t.owners
    ? t
    : {
        ...t,
        owners: { ios: t.devOwner||"", and: t.andOwner||"", be: t.beOwner||"", wc: "", qa: t.qaOwner||"" },
        effort: { ios: Number(t.ios||0), and: Number(t.and||0), be: Number(t.be||0), wc: 0, qa: Number(t.qa||0) },
        dependsOn: t.dependsOn || [],
        plannedStart: t.plannedStart || "",
        actualStart:  t.actualStart  || "",
        actualEnd:    t.actualEnd    || "",
      };
  // laneStarts: per-lane overrides for plannedStart, actualStart, actualEnd
  // { ios: { plannedStart:"", actualStart:"", actualEnd:"" }, ... }
  if (!base.laneStarts) base.laneStarts = {};
  return base;
}

const DEFAULT_TASKS = [
  { id:1,  name:"Location Role Support in Issues",    owners:{ios:"Hari",and:"Sam",be:"Ruby",wc:"",qa:"Abhishek"}, effort:{ios:2,and:2,be:7,wc:0,qa:3},  dependsOn:[],      priority:"P1", status:"To Do",  notes:"" },
  { id:2,  name:"Smart Clockout",                     owners:{ios:"Hari",and:"Sam",be:"Prakash",wc:"",qa:""},      effort:{ios:4,and:4,be:1,wc:0,qa:0},  dependsOn:[],      priority:"P1", status:"To Do",  notes:"" },
  { id:3,  name:"Overtime Request",                   owners:{ios:"Hari",and:"Sam",be:"",wc:"",qa:"Abhishek"},     effort:{ios:3,and:3,be:0,wc:0,qa:3},  dependsOn:[],      priority:"P1", status:"To Do",  notes:"" },
  { id:4,  name:"Attendance Edit Request",            owners:{ios:"Hari",and:"Sam",be:"Prakash",wc:"",qa:"Abhishek"}, effort:{ios:3,and:3,be:5,wc:0,qa:3}, dependsOn:[],   priority:"P1", status:"To Do",  notes:"" },
  { id:5,  name:"Custom Report for Watsons",          owners:{ios:"",and:"",be:"Prakash",wc:"",qa:""},             effort:{ios:0,and:0,be:0,wc:0,qa:0},  dependsOn:[],      priority:"P2", status:"To Do",  notes:"Effort TBC" },
  { id:6,  name:"Standardise Date Format",            owners:{ios:"",and:"",be:"",wc:"",qa:"Shahid"},              effort:{ios:0,and:0,be:0.25,wc:0,qa:0.5}, dependsOn:[],  priority:"P2", status:"To Do",  notes:"" },
  { id:7,  name:"LMS Analytics Fix",                  owners:{ios:"Hari",and:"Kevin",be:"",wc:"",qa:"Gengu"},      effort:{ios:2,and:2,be:0,wc:0,qa:2},  dependsOn:[],      priority:"P1", status:"In Dev", notes:"Started 18-Feb" },
  { id:8,  name:"Read/Unread – Social Feed",          owners:{ios:"Hari",and:"Sam",be:"",wc:"",qa:"Shahid"},       effort:{ios:1,and:1,be:1,wc:0,qa:0.5},dependsOn:[],      priority:"P2", status:"To Do",  notes:"" },
  { id:9,  name:"Buffer & Dev-QA Cycle (1–8)",        owners:{ios:"Hari",and:"Sam",be:"",wc:"",qa:""},             effort:{ios:4,and:4,be:3,wc:0,qa:3},  dependsOn:[],      priority:"P1", status:"To Do",  notes:"Shared buffer" },
  { id:10, name:"OR SDK – E2E",                       owners:{ios:"",and:"Kevin",be:"",wc:"",qa:"Gengu"},          effort:{ios:0,and:2,be:0,wc:0,qa:0},  dependsOn:[],      priority:"P1", status:"In Dev", notes:"" },
  { id:11, name:"OR SDK – Description in Banner",     owners:{ios:"",and:"Kevin",be:"",wc:"",qa:"Abhishek"},       effort:{ios:0,and:1,be:0.5,wc:0,qa:2},dependsOn:[10],    priority:"P1", status:"In Dev", notes:"" },
  { id:12, name:"KNOW SDK – Instamart Practice",      owners:{ios:"",and:"Kevin",be:"",wc:"",qa:""},               effort:{ios:0,and:12,be:0,wc:0,qa:0}, dependsOn:[],      priority:"P2", status:"To Do",  notes:"" },
  { id:13, name:"KNOW SDK – Shift Support",           owners:{ios:"",and:"Kevin",be:"",wc:"",qa:"Abhishek"},       effort:{ios:0,and:1,be:0,wc:0,qa:3},  dependsOn:[],      priority:"P2", status:"To Do",  notes:"" },
  { id:14, name:"OR SDK – IM Separate",               owners:{ios:"",and:"Kevin",be:"",wc:"",qa:"Abhishek"},       effort:{ios:0,and:1,be:0,wc:0,qa:3},  dependsOn:[11],    priority:"P2", status:"To Do",  notes:"" },
  { id:15, name:"Cloudflare Upload – Dashboard",      owners:{ios:"",and:"",be:"Ruby",wc:"",qa:"Shahid"},          effort:{ios:0,and:0,be:2,wc:0,qa:2},  dependsOn:[],      priority:"P1", status:"To Do",  notes:"" },
  { id:16, name:"Cloudflare Upload – Mobile",         owners:{ios:"Hari",and:"Sam",be:"",wc:"",qa:"Abhishek"},     effort:{ios:2,and:2,be:0,wc:0,qa:2},  dependsOn:[15],    priority:"P1", status:"To Do",  notes:"" },
  { id:17, name:"Enhancement Dashboard Release",      owners:{ios:"",and:"",be:"Kishore",wc:"",qa:"Gengu"},        effort:{ios:0,and:0,be:1,wc:0,qa:7},  dependsOn:[],      priority:"P1", status:"To Do",  notes:"" },
  { id:18, name:"Location Reminder",                  owners:{ios:"",and:"",be:"Karan",wc:"",qa:""},               effort:{ios:0,and:0,be:0,wc:0,qa:9},  dependsOn:[],      priority:"P3", status:"To Do",  notes:"Karan ETA TBC" },
  { id:19, name:"Asset Dashboard Support",            owners:{ios:"",and:"",be:"",wc:"",qa:""},                    effort:{ios:0,and:0,be:0,wc:0,qa:0},  dependsOn:[],      priority:"P3", status:"To Do",  notes:"Effort TBC" },
  { id:20, name:"WPH Migration",                      owners:{ios:"",and:"",be:"Kishore",wc:"",qa:"Gengu"},        effort:{ios:0,and:0,be:10,wc:0,qa:2}, dependsOn:[],      priority:"P1", status:"To Do",  notes:"⚡ Mar 5 deadline" },
  { id:21, name:"Admin Chatbot",                      owners:{ios:"",and:"",be:"Kishore",wc:"",qa:""},             effort:{ios:0,and:0,be:2,wc:0,qa:0},  dependsOn:[20],    priority:"P2", status:"To Do",  notes:"" },
  { id:22, name:"Link to Generate PDF in Superset",   owners:{ios:"",and:"",be:"",wc:"",qa:""},                    effort:{ios:0,and:0,be:2,wc:0,qa:0},  dependsOn:[],      priority:"P3", status:"To Do",  notes:"Owner TBC" },
  { id:23, name:"User Sync with Nexas",               owners:{ios:"",and:"",be:"",wc:"",qa:""},                    effort:{ios:0,and:0,be:0,wc:0,qa:0},  dependsOn:[],      priority:"P3", status:"To Do",  notes:"Effort TBC" },
  { id:24, name:"Form Image Verification",            owners:{ios:"",and:"",be:"",wc:"",qa:""},                    effort:{ios:0,and:0,be:0,wc:0,qa:0},  dependsOn:[],      priority:"P3", status:"To Do",  notes:"Effort TBC" },
  { id:25, name:"Course Reminder Push",               owners:{ios:"",and:"",be:"Raj",wc:"",qa:""},                 effort:{ios:0,and:0,be:2,wc:0,qa:0},  dependsOn:[],      priority:"P2", status:"To Do",  notes:"" },
  { id:26, name:"Audit Question as Optional",         owners:{ios:"",and:"",be:"Raj",wc:"",qa:""},                 effort:{ios:0,and:0,be:0,wc:0,qa:0},  dependsOn:[],      priority:"P3", status:"To Do",  notes:"Raj – effort TBC" },
  { id:27, name:"Image as Optional Ref of Forms",     owners:{ios:"",and:"",be:"Tamil",wc:"",qa:""},               effort:{ios:0,and:0,be:0,wc:0,qa:0},  dependsOn:[],      priority:"P3", status:"To Do",  notes:"Tamil – effort TBC" },
].map(t => ({ ...t, plannedStart:"", actualStart:"", actualEnd:"" }));

function parseDate(s) {
  if (!s) return null;
  const [y,m,d] = s.split("-").map(Number);
  return new Date(y, m-1, d);
}
function fmtDate(d) {
  if (!d) return "";
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function isWeekend(d) { return d.getDay()===0||d.getDay()===6; }

const DEFAULT_CONFIG = {
  sprintStart: "2026-02-23",
  sprintEnd: "2026-03-31",
  holidays: [],
  // calendarEvents: { person, date (YYYY-MM-DD), type: "l2"|"planned"|"unplanned", reason? }
  // replaces hardcoded L2_DAYS and timeOff arrays
  calendarEvents: [
    // L2 rota — weekly recurring converted to explicit dates for sprint window
    // Hari: Thu (day 4), Sam: Mon (day 1), Kevin: Tue (day 2),
    // Ruby: Wed (day 3), Karan: Fri (day 5), Kishore: specific dates
    ...generateL2Dates("Hari",   4, "2026-02-23", "2026-03-31"),
    ...generateL2Dates("Sam",    1, "2026-02-23", "2026-03-31"),
    ...generateL2Dates("Kevin",  2, "2026-02-23", "2026-03-31"),
    ...generateL2Dates("Ruby",   3, "2026-02-23", "2026-03-31"),
    ...generateL2Dates("Karan",  5, "2026-02-23", "2026-03-31"),
    { person:"Kishore", date:"2026-02-25", type:"l2" },
    { person:"Kishore", date:"2026-03-18", type:"l2" },
    { person:"Kishore", date:"2026-03-27", type:"l2" },
    // Planned leave
    { person:"Abhishek", date:"2026-02-23", type:"planned", reason:"Pre-approved leave" },
    { person:"Abhishek", date:"2026-02-24", type:"planned", reason:"Pre-approved leave" },
    { person:"Abhishek", date:"2026-02-25", type:"planned", reason:"Pre-approved leave" },
    { person:"Abhishek", date:"2026-02-26", type:"planned", reason:"Pre-approved leave" },
    { person:"Abhishek", date:"2026-02-27", type:"planned", reason:"Pre-approved leave" },
    { person:"Abhishek", date:"2026-03-02", type:"planned", reason:"Pre-approved leave" },
  ],
  // taskDelays: { taskId, effortDelta (days added), reason, date }
  taskDelays: [],
};

// Helper: generate L2 dates for a weekday (1=Mon..5=Fri) in a date range
function generateL2Dates(person, isoWeekday, from, to) {
  const result = [];
  let cur = parseDate(from);
  const end = parseDate(to);
  while (cur <= end) {
    const day = cur.getDay() === 0 ? 7 : cur.getDay();
    if (day === isoWeekday) result.push({ person, date: fmtDate(cur), type:"l2" });
    cur = addDays(cur, 1);
  }
  return result;
}

// ─── DATE UTILS ───────────────────────────────────────────────────────────────
function buildHolidaySet(config) { return new Set(config.holidays||[]); }
function buildL2Set(person, config) {
  const set = new Set();
  (config.calendarEvents||[]).filter(e=>e.person===person&&e.type==="l2").forEach(e=>set.add(e.date));
  return set;
}
function buildLeaveSet(person, config) {
  const set = new Set();
  (config.calendarEvents||[])
    .filter(e=>e.person===person&&(e.type==="planned"||e.type==="unplanned"))
    .forEach(e=>set.add(e.date));
  return set;
}
function buildBlocked(person, config) {
  const h = buildHolidaySet(config);
  const l2 = buildL2Set(person, config);
  const lv = buildLeaveSet(person, config);
  return new Set([...h,...l2,...lv]);
}

// Advance n working days from a date (inclusive if n=0 means same day if working)
function workday(fromDate, n, blocked) {
  let cur = new Date(fromDate);
  let count = 0;
  while (count < n) {
    cur = addDays(cur, 1);
    if (!isWeekend(cur) && !blocked.has(fmtDate(cur))) count++;
  }
  return cur;
}

// ─── PREDICTION ENGINE ────────────────────────────────────────────────────────
// For each task and each lane (ios/and/be/wc/qa), compute predicted end date
// Respects: plannedStart if set, dependsOn (latest predicted end of dependencies),
// per-person working calendar, sequential scheduling within each person's lane

function computePredictions(tasks, config) {
  // Map: taskId → { lane → { start, end } }
  const pred = {}; // pred[taskId][lane] = { start: Date, end: Date }
  tasks.forEach(t => { pred[t.id] = {}; });

  const lanes = ["ios","and","be","wc","qa"];
  // owner key per lane
  const ownerKey = { ios:"ios", and:"and", be:"be", wc:"wc", qa:"qa" };

  // Per-person scheduling pointer
  const personPtr = {}; // person → Date (last scheduled end)

  // Sort tasks for scheduling:
  // 1. Tasks with actualStart first (they are already running — pin to their real date)
  // 2. Tasks with plannedStart next (anchored to a specific date)
  // 3. Remaining floating tasks by priority
  // Within each group, earlier date wins, then priority.
  const scheduleSorted = topoSort(tasks).sort((a, b) => {
    const aPin = a.actualStart ? 0 : a.plannedStart ? 1 : 2;
    const bPin = b.actualStart ? 0 : b.plannedStart ? 1 : 2;
    if (aPin !== bPin) return aPin - bPin;
    // Within pinned group: earlier start wins
    if (aPin < 2) {
      const aDate = a.actualStart || a.plannedStart;
      const bDate = b.actualStart || b.plannedStart;
      if (aDate !== bDate) return aDate < bDate ? -1 : 1;
    }
    // Floating: priority order
    return (PRIORITY_ORDER[a.priority]??3) - (PRIORITY_ORDER[b.priority]??3);
  });

  scheduleSorted.forEach(t => {
    if (t.status === "Descoped") return; // excluded from predictions
    lanes.forEach(lane => {
      const person = t.owners?.[lane];
      // Base effort + any logged delays for this task+lane (or "all" lanes)
      const baseEff = Number(t.effort?.[lane]||0);
      const delayDays = (config.taskDelays||[])
        .filter(d=>d.taskId===t.id && (!d.lane || d.lane==="all" || d.lane===lane))
        .reduce((sum,d)=>sum+Number(d.effortDelta||0),0);
      // Keep fractional precision — only round for workday() integer steps
      const eff = Math.round((baseEff + delayDays) * 2) / 2; // round to 0.5 precision
      if (!person || eff===0) { pred[t.id][lane] = { start:null, end:null }; return; }

      const blocked = buildBlocked(person, config);

      // Per-lane start overrides take priority, fall back to task-level dates
      const ls = t.laneStarts?.[lane] || {};
      const laneActualStart  = ls.actualStart  || t.actualStart  || "";
      const lanePlannedStart = ls.plannedStart || t.plannedStart || "";

      let earliest;
      if (laneActualStart) {
        earliest = parseDate(laneActualStart);
      } else if (lanePlannedStart) {
        earliest = parseDate(lanePlannedStart);
      } else {
        earliest = parseDate(config.sprintStart);
        if (personPtr[person] && personPtr[person] > earliest) {
          earliest = new Date(personPtr[person]);
        }
      }

      // Dependency constraint: always wait for deps regardless of anchor type
      (t.dependsOn||[]).forEach(depId => {
        const depPred = pred[depId];
        if (!depPred) return;
        Object.values(depPred).forEach(sc => {
          if (sc?.end && sc.end > earliest) earliest = new Date(sc.end);
        });
      });

      // Find actual first working day >= earliest
      let startDay = new Date(earliest);
      while (isWeekend(startDay)||blocked.has(fmtDate(startDay))) startDay=addDays(startDay,1);

      const laneActualEnd = ls.actualEnd || t.actualEnd || "";
      // If task already actualEnd'd, use that as the end
      if (laneActualEnd && (t.status==="Released"||t.status==="In QA")) {
        const ae = parseDate(laneActualEnd);
        pred[t.id][lane] = { start:startDay, end:ae };
        if (!personPtr[person]||ae>personPtr[person]) personPtr[person]=new Date(ae);
        return;
      }

      const endDay = workday(new Date(startDay), eff-1, blocked);
      pred[t.id][lane] = { start:startDay, end:endDay };

      // personPtr advancement rules:
      // - actualStart (in-flight): ALWAYS advance ptr — task is consuming this person's time right now
      // - plannedStart but not started: advance ptr — it's a committed future slot
      // - floating: advance ptr — queued sequentially
      // In all cases advance; the key difference is that pinned tasks use their own start date,
      // not the ptr, as their schedule anchor (handled above in earliest= logic).
      if (!personPtr[person] || endDay > personPtr[person]) personPtr[person] = new Date(endDay);
    });
  });

  return pred;
}

// Returns task's overall predicted end = max end across all lanes
function taskPredictedEnd(taskId, pred) {
  if (!pred[taskId]) return null;
  let max = null;
  Object.values(pred[taskId]).forEach(sc => {
    if (sc?.end && (!max||sc.end>max)) max=new Date(sc.end);
  });
  return max;
}

function topoSort(tasks) {
  const idMap = {}; tasks.forEach(t=>{idMap[t.id]=t;});
  const visited = new Set(), inStack = new Set(), result = [];
  function visit(t) {
    if (visited.has(t.id)) return;
    if (inStack.has(t.id)) return; // cycle detected — skip to avoid infinite recursion
    inStack.add(t.id);
    (t.dependsOn||[]).forEach(d=>{ if(idMap[d]) visit(idMap[d]); });
    inStack.delete(t.id);
    visited.add(t.id);
    result.push(t);
  }
  tasks.forEach(visit);
  return result;
}

// Detect circular dependencies — returns array of task IDs in cycles
function findCycles(tasks) {
  const idMap = {}; tasks.forEach(t=>{idMap[t.id]=t;});
  const cycles = new Set();
  const visited = new Set(), inStack = new Set();
  function visit(t) {
    if (visited.has(t.id)) return;
    if (inStack.has(t.id)) { cycles.add(t.id); return; }
    inStack.add(t.id);
    (t.dependsOn||[]).forEach(d=>{ if(idMap[d]) visit(idMap[d]); });
    inStack.delete(t.id);
    visited.add(t.id);
  }
  tasks.forEach(visit);
  return [...cycles];
}

// ─── VELOCITY WARNINGS ────────────────────────────────────────────────────────
function computeVelocity(tasks) {
  // Per-person slip ratio from tasks with both plannedEnd and actualEnd
  const slips = {}; // person → [slipDays]
  tasks.forEach(t => {
    if (!t.plannedEnd || !t.actualEnd) return;
    const plan = parseDate(t.plannedEnd), actual = parseDate(t.actualEnd);
    const slip = Math.round((actual-plan)/86400000);
    const persons = Object.values(t.owners||{}).filter(Boolean);
    persons.forEach(p => {
      if (!slips[p]) slips[p]=[];
      slips[p].push(slip);
    });
  });
  const result = {};
  Object.entries(slips).forEach(([p,arr])=>{
    const avg = Math.round(arr.reduce((a,b)=>a+b,0)/arr.length);
    result[p] = { avgSlip:avg, count:arr.length };
  });
  return result;
}

// ─── APP ──────────────────────────────────────────────────────────────────────
// ─── CONFIG MIGRATION ─────────────────────────────────────────────────────────
function migrateConfig(cfg) {
  if (cfg.calendarEvents) return { ...cfg, sprintEnd: cfg.sprintEnd||"2026-03-31", taskDelays: cfg.taskDelays||[] }; // already new
  // Old format had timeOff array of { person, from, to }
  const events = [...(DEFAULT_CONFIG.calendarEvents)]; // start with L2 rota defaults
  (cfg.timeOff||[]).forEach(({person, from, to}) => {
    let cur = parseDate(from); const end = parseDate(to);
    while (cur<=end) {
      if (!isWeekend(cur)) events.push({ person, date:fmtDate(cur), type:"planned" });
      cur = addDays(cur,1);
    }
  });
  return { ...cfg, calendarEvents: events, taskDelays: [] };
}

// ─── TEAM CALENDAR PANEL ──────────────────────────────────────────────────────
function TeamCalendarPanel({ config, updateConfig, tasks, onClose }) {
  const [activeTab, setActiveTab] = useState("calendar"); // "calendar" | "delays"
  const [selectedPerson, setSelectedPerson] = useState(TEAM_NAMES[0]);
  const [newEvent, setNewEvent] = useState({ date:"", type:"l2", reason:"" });
  const [newDelay, setNewDelay] = useState({ taskId:"", lane:"all", effortDelta:1, reason:"", date:fmtDate(new Date()) });

  const personEvents = (config.calendarEvents||[])
    .filter(e=>e.person===selectedPerson)
    .sort((a,b)=>a.date.localeCompare(b.date));

  const l2Events      = personEvents.filter(e=>e.type==="l2");
  const plannedEvents = personEvents.filter(e=>e.type==="planned");
  const unplannedEvents = personEvents.filter(e=>e.type==="unplanned");

  const addEvent = () => {
    if (!newEvent.date) return;
    updateConfig(c=>{
      // Prevent duplicate: same person + date + type
      const exists = (c.calendarEvents||[]).some(
        e=>e.person===selectedPerson && e.date===newEvent.date && e.type===newEvent.type
      );
      if (exists) return c;
      return { ...c, calendarEvents:[...(c.calendarEvents||[]),{ person:selectedPerson, ...newEvent }] };
    });
    setNewEvent({ date:"", type:"l2", reason:"" });
  };

  const removeEvent = (idx) => {
    const personIdxs = (config.calendarEvents||[])
      .map((e,i)=>e.person===selectedPerson?i:-1).filter(i=>i!==-1);
    const globalIdx = personIdxs[idx];
    updateConfig(c=>({
      ...c,
      calendarEvents:c.calendarEvents.filter((_,i)=>i!==globalIdx)
    }));
  };

  const addDelay = () => {
    if (!newDelay.taskId||!newDelay.effortDelta) return;
    updateConfig(c=>({
      ...c,
      taskDelays:[...(c.taskDelays||[]),{
        taskId:Number(newDelay.taskId),
        lane:newDelay.lane||"all",
        effortDelta:Number(newDelay.effortDelta),
        reason:newDelay.reason,
        date:newDelay.date,
      }]
    }));
    setNewDelay({ taskId:"", lane:"all", effortDelta:1, reason:"", date:fmtDate(new Date()) });
  };

  const removeDelay = (i) => updateConfig(c=>({...c,taskDelays:c.taskDelays.filter((_,j)=>j!==i)}));

  const inp = {background:T.bg2,color:T.t0,border:`1px solid ${T.b2}`,borderRadius:5,padding:"6px 9px",fontSize:12,fontFamily:"inherit"};
  const sel = {...inp,cursor:"pointer"};

  const TYPE_COLOR = {
    l2:        { bg:"#f0f4ff", text:"#5a6fa5", border:"#c0cce8", label:"L2" },
    planned:   { bg:T.p3bg,   text:T.p3,      border:T.sQA.border, label:"Planned leave" },
    unplanned: { bg:T.p1bg,   text:T.p1,      border:T.sBlk.border, label:"Unplanned / sick" },
  };

  const EventGroup = ({ title, events, startIdx, color }) => (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:10,color:color.text,fontWeight:600,textTransform:"uppercase",letterSpacing:0.6,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
        <span style={{background:color.bg,border:`1px solid ${color.border}`,borderRadius:3,padding:"1px 6px"}}>{title}</span>
        <span style={{color:T.t3,fontWeight:400}}>{events.length} day{events.length!==1?"s":""}</span>
      </div>
      {events.length===0
        ? <div style={{fontSize:11,color:T.t3,fontStyle:"italic",paddingLeft:4}}>None</div>
        : <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {events.map((e,i)=>(
              <div key={`${e.date}-${e.type}-${i}`} style={{display:"flex",alignItems:"center",gap:4,background:color.bg,border:`1px solid ${color.border}`,borderRadius:5,padding:"3px 8px"}}>
                <span style={{fontSize:11,fontFamily:"'JetBrains Mono',monospace",color:color.text}}>{e.date.slice(5)}</span>
                {e.reason&&<span style={{fontSize:10,color:T.t2}}>· {e.reason.slice(0,20)}</span>}
                <button className="btn" onClick={()=>removeEvent(startIdx+i)} style={{background:"transparent",color:T.t3,border:"none",fontSize:12,padding:"0 2px",lineHeight:1}} title="Remove">×</button>
              </div>
            ))}
          </div>
      }
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,zIndex:300,display:"flex"}}>
      <div style={{flex:1,background:"#00000030"}} onClick={onClose}/>
      <div style={{width:480,background:T.bg0,borderLeft:`1px solid ${T.b1}`,display:"flex",flexDirection:"column",height:"100%"}}>
        {/* Header */}
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.b1}`,background:T.bg1,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:T.t0}}>Team Calendar</div>
              <div style={{fontSize:10,color:T.t2,marginTop:2}}>L2 rota · leave · delays — all update timeline predictions automatically</div>
            </div>
            <button className="btn" onClick={onClose} style={{background:"transparent",color:T.t2,fontSize:18,padding:"2px 8px",border:`1px solid ${T.b1}`,borderRadius:4}}>×</button>
          </div>
          {/* Tabs */}
          <div style={{display:"flex",gap:2}}>
            {[["calendar","📅 Person Calendar"],["delays","⚠ Task Delays"]].map(([id,label])=>(
              <button key={id} className="btn" onClick={()=>setActiveTab(id)} style={{padding:"5px 14px",borderRadius:5,fontSize:11,fontWeight:activeTab===id?500:400,background:activeTab===id?T.bg3:"transparent",color:activeTab===id?T.t0:T.t2,border:`1px solid ${activeTab===id?T.b2:"transparent"}`}}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:20}}>
          {activeTab==="calendar" && (
            <>
              {/* Person selector */}
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:18}}>
                {TEAM_NAMES.map(p=>{
                  const isSel=p===selectedPerson;
                  const color=TEAM[p]?.bar||T.acc;
                  const evCount=(config.calendarEvents||[]).filter(e=>e.person===p).length;
                  return (
                    <button key={p} className="btn" onClick={()=>setSelectedPerson(p)} style={{padding:"4px 10px",borderRadius:10,fontSize:11,fontWeight:isSel?500:400,background:isSel?`${color}18`:"transparent",color:isSel?color:T.t2,border:`1px solid ${isSel?`${color}60`:T.b1}`,display:"flex",alignItems:"center",gap:5}}>
                      {p}
                      {evCount>0&&<span style={{fontSize:9,background:isSel?`${color}30`:T.bg2,color:isSel?color:T.t3,borderRadius:8,padding:"0 4px",fontFamily:"'JetBrains Mono',monospace"}}>{evCount}</span>}
                    </button>
                  );
                })}
              </div>

              {/* Event groups */}
              <EventGroup title="L2 Support" events={l2Events} startIdx={0} color={TYPE_COLOR.l2}/>
              <EventGroup title="Planned Leave" events={plannedEvents} startIdx={l2Events.length} color={TYPE_COLOR.planned}/>
              <EventGroup title="Unplanned / Sick" events={unplannedEvents} startIdx={l2Events.length+plannedEvents.length} color={TYPE_COLOR.unplanned}/>

              {/* Unified bulk event adder */}
              <BulkEventAdder person={selectedPerson} config={config} updateConfig={updateConfig}/>
            </>
          )}

          {activeTab==="delays" && (
            <>
              <div style={{fontSize:11,color:T.t2,marginBottom:14,lineHeight:1.5}}>
                Log a task delay to add extra effort days to the prediction engine. The timeline recalculates automatically and the delay is recorded for retro.
              </div>

              {/* Existing delays */}
              {(config.taskDelays||[]).length===0
                ? <div style={{fontSize:12,color:T.t3,fontStyle:"italic",marginBottom:16}}>No delays logged yet</div>
                : (config.taskDelays||[]).map((d,i)=>{
                    const task=tasks.find(t=>t.id===d.taskId);
                    return (
                      <div key={i} style={{background:T.p1bg,border:`1px solid ${T.sBlk.border}`,borderRadius:6,padding:"10px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                            <span style={{fontSize:10,color:T.t3,fontFamily:"'JetBrains Mono',monospace"}}>#{d.taskId}</span>
                            <span style={{fontSize:12,fontWeight:500,color:T.t0}}>{task?.name||"Unknown task"}</span>
                            <span style={{fontSize:11,fontWeight:600,color:T.p1,fontFamily:"'JetBrains Mono',monospace",background:T.p1bg,border:`1px solid ${T.sBlk.border}`,borderRadius:3,padding:"1px 6px"}}>+{d.effortDelta}d</span>
                          </div>
                          <div style={{fontSize:11,color:T.t2}}>{d.date}{d.lane&&d.lane!=="all"?` · ${d.lane.toUpperCase()} lane`:""} · {d.reason||"No reason logged"}</div>
                        </div>
                        <button className="btn" onClick={()=>removeDelay(i)} style={{background:"transparent",color:T.t3,border:`1px solid ${T.b1}`,borderRadius:3,padding:"2px 8px",fontSize:11}}>Remove</button>
                      </div>
                    );
                  })
              }

              {/* Add delay form */}
              <div style={{background:T.bg1,border:`1px solid ${T.b1}`,borderRadius:8,padding:14,marginTop:8}}>
                <div style={{fontSize:10,color:T.t2,fontWeight:500,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Log new delay</div>
                <div style={{marginBottom:8}}>
                  <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:4}}>Task</label>
                  <select value={newDelay.taskId} onChange={e=>setNewDelay(n=>({...n,taskId:e.target.value}))} style={{...sel,width:"100%"}}>
                    <option value="">— select task —</option>
                    {tasks.filter(t=>t.status!=="Released"&&t.status!=="Descoped").map(t=>(
                      <option key={t.id} value={t.id}>#{t.id} {t.name.slice(0,40)}</option>
                    ))}
                  </select>
                </div>
                <div style={{marginBottom:8}}>
                  <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:4}}>Affected lane</label>
                  <select value={newDelay.lane||"all"} onChange={e=>setNewDelay(n=>({...n,lane:e.target.value}))} style={{...sel,width:"100%"}}>
                    <option value="all">All lanes (entire task delayed)</option>
                    <option value="ios">iOS</option>
                    <option value="and">Android</option>
                    <option value="be">Backend</option>
                    <option value="wc">Web Client</option>
                    <option value="qa">QA</option>
                  </select>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  <div>
                    <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:4}}>Extra days needed</label>
                    <input type="number" min={0.5} step={0.5} value={newDelay.effortDelta} onChange={e=>setNewDelay(n=>({...n,effortDelta:e.target.value}))} style={{...inp,width:"100%"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:4}}>Date logged</label>
                    <input type="date" value={newDelay.date} onChange={e=>setNewDelay(n=>({...n,date:e.target.value}))} style={{...inp,width:"100%"}}/>
                  </div>
                </div>
                <div style={{marginBottom:10}}>
                  <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:4}}>Reason (for retro)</label>
                  <input type="text" value={newDelay.reason} onChange={e=>setNewDelay(n=>({...n,reason:e.target.value}))} placeholder="e.g. API contract changed, dependency blocked, scope crept…" style={{...inp,width:"100%"}}/>
                </div>
                <button className="btn" onClick={addDelay} disabled={!newDelay.taskId||!newDelay.effortDelta} style={{padding:"7px 16px",borderRadius:5,background:newDelay.taskId&&newDelay.effortDelta?T.p1:"#ccc",color:"#fff",border:"none",fontSize:12,fontWeight:500}}>Log delay</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── BULK EVENT ADDER ────────────────────────────────────────────────────────
// Unified bulk adder for L2, planned leave, and unplanned leave.
// Supports: single date, multiple hand-picked dates, date range, recurring weekday.
function BulkEventAdder({ person, config, updateConfig }) {
  const [mode, setMode] = useState("single");       // "single" | "multi" | "range" | "weekday"
  const [evType, setEvType] = useState("l2");        // "l2" | "planned" | "unplanned"
  const [reason, setReason] = useState("");

  // single
  const [singleDate, setSingleDate] = useState("");

  // multi — comma/space separated input + parsed chips
  const [multiInput, setMultiInput] = useState("");

  // range
  const [rangeFrom, setRangeFrom] = useState(config.sprintStart || "2026-02-23");
  const [rangeTo,   setRangeTo]   = useState(config.sprintEnd   || "2026-03-31");
  const [skipWeekends, setSkipWeekends] = useState(true);

  // weekday
  const [weekday,  setWeekday]  = useState("1");   // 1=Mon…5=Fri
  const [wdFrom,   setWdFrom]   = useState(config.sprintStart || "2026-02-23");
  const [wdTo,     setWdTo]     = useState(config.sprintEnd   || "2026-03-31");

  const TYPE_COLOR = {
    l2:        { bg:"#f0f4ff", text:"#5a6fa5", border:"#c0cce8", label:"L2 Support" },
    planned:   { bg:T.p3bg,   text:T.p3,      border:T.sQA.border, label:"Planned Leave" },
    unplanned: { bg:T.p1bg,   text:T.p1,      border:T.sBlk.border, label:"Unplanned / Sick" },
  };
  const tc = TYPE_COLOR[evType];
  const DAYS = ["","Mon","Tue","Wed","Thu","Fri"];
  const inp = {background:T.bg2,color:T.t0,border:`1px solid ${T.b2}`,borderRadius:5,padding:"5px 8px",fontSize:11,fontFamily:"inherit"};
  const sel = {...inp,cursor:"pointer"};

  // Compute preview dates based on mode
  const previewDates = useMemo(() => {
    if (mode === "single") {
      return singleDate ? [singleDate] : [];
    }
    if (mode === "multi") {
      // parse space/comma/newline separated dates; accept YYYY-MM-DD or MM-DD or MM/DD
      return multiInput
        .split(/[\s,;\n]+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
          // MM-DD or MM/DD → assume sprint year
          const yr = (config.sprintStart || "2026-02-23").slice(0,4);
          if (/^\d{1,2}[-/]\d{1,2}$/.test(s)) {
            const [m,d] = s.split(/[-/]/);
            return `${yr}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
          }
          return null;
        })
        .filter(Boolean)
        .sort();
    }
    if (mode === "range") {
      const dates = [];
      let cur = parseDate(rangeFrom);
      const end = parseDate(rangeTo);
      if (!cur || !end) return [];
      while (cur <= end) {
        if (!skipWeekends || !isWeekend(cur)) dates.push(fmtDate(cur));
        cur = addDays(cur, 1);
      }
      return dates;
    }
    if (mode === "weekday") {
      const dates = [];
      let cur = parseDate(wdFrom);
      const end = parseDate(wdTo);
      if (!cur || !end) return [];
      while (cur <= end) {
        const iso = cur.getDay() === 0 ? 7 : cur.getDay();
        if (iso === Number(weekday)) dates.push(fmtDate(cur));
        cur = addDays(cur, 1);
      }
      return dates;
    }
    return [];
  }, [mode, singleDate, multiInput, rangeFrom, rangeTo, skipWeekends, weekday, wdFrom, wdTo, config.sprintStart, config.sprintEnd]);

  // Filter out already-existing dates for this person+type
  const existingDates = new Set(
    (config.calendarEvents||[])
      .filter(e => e.person === person && e.type === evType)
      .map(e => e.date)
  );
  const newDates  = previewDates.filter(d => !existingDates.has(d));
  const skipDates = previewDates.filter(d =>  existingDates.has(d));

  const apply = () => {
    if (newDates.length === 0) return;
    const toAdd = newDates.map(d => ({ person, date: d, type: evType, reason: reason || undefined }));
    updateConfig(c => ({ ...c, calendarEvents: [...(c.calendarEvents||[]), ...toAdd] }));
    // reset
    setSingleDate(""); setMultiInput(""); setReason("");
  };

  const modeBtn = (id, label) => (
    <button key={id} className="btn" onClick={() => setMode(id)} style={{
      padding:"4px 10px", borderRadius:4, fontSize:11,
      background: mode===id ? T.bg3 : "transparent",
      color: mode===id ? T.t0 : T.t2,
      border: `1px solid ${mode===id ? T.b2 : "transparent"}`,
      fontWeight: mode===id ? 500 : 400,
    }}>{label}</button>
  );

  return (
    <div style={{background:T.bg1,border:`1px solid ${T.b1}`,borderRadius:8,padding:14,marginTop:10}}>
      {/* Header row — type selector */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{fontSize:10,color:T.t2,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Add dates for {person}</span>
        <div style={{display:"flex",gap:4}}>
          {Object.entries(TYPE_COLOR).map(([k,v])=>(
            <button key={k} className="btn" onClick={()=>setEvType(k)} style={{
              padding:"3px 9px",borderRadius:10,fontSize:10,fontWeight:500,
              background: evType===k ? v.bg : "transparent",
              color: evType===k ? v.text : T.t2,
              border: `1px solid ${evType===k ? v.border : T.b1}`,
            }}>{v.label}</button>
          ))}
        </div>
      </div>

      {/* Mode tabs */}
      <div style={{display:"flex",gap:2,marginBottom:12,background:T.bg0,borderRadius:5,padding:3,border:`1px solid ${T.b1}`}}>
        {modeBtn("single","Single date")}
        {modeBtn("multi","Multiple dates")}
        {modeBtn("range","Date range")}
        {modeBtn("weekday","Recurring weekday")}
      </div>

      {/* Mode-specific inputs */}
      {mode==="single" && (
        <div style={{marginBottom:10}}>
          <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:4}}>Date</label>
          <input type="date" value={singleDate} onChange={e=>setSingleDate(e.target.value)} style={{...inp,width:"100%"}}/>
        </div>
      )}

      {mode==="multi" && (
        <div style={{marginBottom:10}}>
          <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:4}}>
            Dates <span style={{color:T.t3,fontWeight:400}}>— comma, space, or newline separated · YYYY-MM-DD or MM-DD</span>
          </label>
          <textarea
            value={multiInput}
            onChange={e=>setMultiInput(e.target.value)}
            placeholder={"2026-03-03, 2026-03-10\n03-17, 03-24"}
            rows={3}
            style={{...inp,width:"100%",resize:"vertical",lineHeight:1.6}}
          />
        </div>
      )}

      {mode==="range" && (
        <div style={{marginBottom:10}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div>
              <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:4}}>From</label>
              <input type="date" value={rangeFrom} onChange={e=>setRangeFrom(e.target.value)} style={{...inp,width:"100%"}}/>
            </div>
            <div>
              <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:4}}>To</label>
              <input type="date" value={rangeTo} onChange={e=>setRangeTo(e.target.value)} style={{...inp,width:"100%"}}/>
            </div>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:T.t1,cursor:"pointer"}}>
            <input type="checkbox" checked={skipWeekends} onChange={e=>setSkipWeekends(e.target.checked)} style={{accentColor:T.acc}}/>
            Skip weekends
          </label>
        </div>
      )}

      {mode==="weekday" && (
        <div style={{marginBottom:10}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            <div>
              <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:4}}>Weekday</label>
              <select value={weekday} onChange={e=>setWeekday(e.target.value)} style={{...sel,width:"100%"}}>
                {[1,2,3,4,5].map(d=><option key={d} value={d}>{DAYS[d]}</option>)}
              </select>
            </div>
            <div>
              <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:4}}>From</label>
              <input type="date" value={wdFrom} onChange={e=>setWdFrom(e.target.value)} style={{...inp,width:"100%"}}/>
            </div>
            <div>
              <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:4}}>To</label>
              <input type="date" value={wdTo} onChange={e=>setWdTo(e.target.value)} style={{...inp,width:"100%"}}/>
            </div>
          </div>
        </div>
      )}

      {/* Reason */}
      <div style={{marginBottom:12}}>
        <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:4}}>Reason <span style={{color:T.t3,fontWeight:400}}>(optional)</span></label>
        <input type="text" value={reason} onChange={e=>setReason(e.target.value)}
          placeholder={evType==="l2"?"e.g. Weekly L2 rota":evType==="planned"?"e.g. Annual leave, conference":"e.g. Sick, family emergency"}
          style={{...inp,width:"100%"}}/>
      </div>

      {/* Preview */}
      {previewDates.length > 0 && (
        <div style={{marginBottom:12,padding:"8px 10px",background:T.bg0,borderRadius:6,border:`1px solid ${T.b1}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:10,color:T.t2,fontWeight:500,textTransform:"uppercase",letterSpacing:0.4}}>Preview</span>
            <div style={{display:"flex",gap:10,fontSize:10}}>
              {newDates.length>0 && <span style={{color:tc.text,fontWeight:600}}>+{newDates.length} new</span>}
              {skipDates.length>0 && <span style={{color:T.t3}}>{skipDates.length} already exist (will skip)</span>}
            </div>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,maxHeight:80,overflowY:"auto"}}>
            {previewDates.map(d=>{
              const isNew = !existingDates.has(d);
              return (
                <span key={d} style={{
                  fontSize:10,fontFamily:"'JetBrains Mono',monospace",padding:"2px 6px",borderRadius:3,
                  background: isNew ? tc.bg : T.bg2,
                  color: isNew ? tc.text : T.t3,
                  border: `1px solid ${isNew ? tc.border : T.b1}`,
                  textDecoration: isNew ? "none" : "line-through",
                }}>{d.slice(5)}</span>
              );
            })}
          </div>
        </div>
      )}

      {/* Action */}
      <button
        className="btn"
        onClick={apply}
        disabled={newDates.length===0}
        style={{
          width:"100%",padding:"8px 0",borderRadius:5,fontSize:12,fontWeight:500,
          background: newDates.length>0 ? tc.text : "#ccc",
          color:"#fff",border:"none",
        }}
      >
        {newDates.length > 0
          ? `Add ${newDates.length} ${tc.label} date${newDates.length>1?"s":""} for ${person}`
          : previewDates.length > 0 ? "All dates already exist" : "Select dates above"}
      </button>
    </div>
  );
}


// ─── AUTH GATE ────────────────────────────────────────────────────────────────
const AUTH_KEY = "sprintly_auth";

async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function AuthGate({ children }) {
  const [mode, setMode] = useState(null);       // null=loading, "set"|"login"|"unlocked"
  const [input, setInput] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_KEY);
    setMode(stored ? "login" : "set");
  }, []);

  const handleSet = async () => {
    if (input.length < 4) { setError("Password must be at least 4 characters"); return; }
    if (input !== confirm) { setError("Passwords don't match"); return; }
    setLoading(true);
    const hash = await hashPassword(input);
    localStorage.setItem(AUTH_KEY, hash);
    setMode("unlocked");
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!input) { setError("Enter your password"); return; }
    setLoading(true);
    const hash = await hashPassword(input);
    const stored = localStorage.getItem(AUTH_KEY);
    if (hash === stored) {
      setMode("unlocked");
      setError("");
    } else {
      setError("Incorrect password");
    }
    setLoading(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter") mode === "set" ? handleSet() : handleLogin();
  };

  if (mode === null) return null;
  if (mode === "unlocked") return children;

  const isSet = mode === "set";

  return (
    <div style={{
      minHeight: "100vh", background: "#0f1117",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter','SF Pro Text',system-ui,sans-serif",
    }}>
      <div style={{
        width: 360, background: "#1a1d27",
        border: "1px solid #2a2d3a", borderRadius: 14,
        padding: "36px 32px", boxShadow: "0 24px 48px #00000060",
      }}>
        {/* Logo */}
        <div style={{textAlign: "center", marginBottom: 28}}>
          <div style={{
            width: 44, height: 44, background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            borderRadius: 12, display: "inline-flex", alignItems: "center",
            justifyContent: "center", fontSize: 22, marginBottom: 12,
          }}>S</div>
          <div style={{fontSize: 20, fontWeight: 700, color: "#f0f0f0", letterSpacing: -0.5}}>Sprintly</div>
          <div style={{fontSize: 12, color: "#666", marginTop: 4}}>
            {isSet ? "Set a password to protect your sprint data" : "Enter your password to continue"}
          </div>
        </div>

        {/* Fields */}
        <div style={{marginBottom: 12}}>
          <label style={{fontSize: 11, color: "#888", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5}}>Password</label>
          <input
            type="password"
            value={input}
            onChange={e => { setInput(e.target.value); setError(""); }}
            onKeyDown={handleKey}
            placeholder={isSet ? "Choose a password (min 4 chars)" : "Your password"}
            autoFocus
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 7,
              background: "#0f1117", border: "1px solid #2a2d3a",
              color: "#f0f0f0", fontSize: 14, outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
          />
        </div>

        {isSet && (
          <div style={{marginBottom: 12}}>
            <label style={{fontSize: 11, color: "#888", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5}}>Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(""); }}
              onKeyDown={handleKey}
              placeholder="Repeat password"
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 7,
                background: "#0f1117", border: "1px solid #2a2d3a",
                color: "#f0f0f0", fontSize: 14, outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {error && (
          <div style={{fontSize: 12, color: "#f87171", marginBottom: 12, padding: "8px 10px", background: "#f8717115", borderRadius: 5, border: "1px solid #f8717130"}}>
            {error}
          </div>
        )}

        <button
          onClick={isSet ? handleSet : handleLogin}
          disabled={loading}
          style={{
            width: "100%", padding: "11px 0", borderRadius: 7,
            background: loading ? "#3a3d4a" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
            color: "#fff", border: "none", fontSize: 14, fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            marginTop: 4,
          }}
        >
          {loading ? "..." : isSet ? "Set Password & Enter" : "Unlock Sprintly"}
        </button>

        {!isSet && (
          <div style={{textAlign: "center", marginTop: 16}}>
            <button
              onClick={() => {
                if (window.confirm("This will clear your password. You'll need to set a new one. Continue?")) {
                  localStorage.removeItem(AUTH_KEY);
                  setMode("set");
                  setInput(""); setConfirm(""); setError("");
                }
              }}
              style={{background: "none", border: "none", color: "#555", fontSize: 11, cursor: "pointer", textDecoration: "underline"}}
            >
              Forgot password? Reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App({ projectId, projectName, orgName, user, onBackToProjects, onInvite, onSignOut }) {
  const [tasks, setTasks] = useState(DEFAULT_TASKS);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [editMode, setEditMode] = useState(false);
  const [view, setView] = useState("dashboard");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    async function load() {
      try {
        // Load config from project row
        const { data: proj } = await supabase.from("projects")
          .select("config").eq("id", projectId).single();
        if (proj?.config) setConfig(migrateConfig({...DEFAULT_CONFIG, ...proj.config}));

        // Load tasks
        const { data: rows } = await supabase.from("tasks")
          .select("*").eq("project_id", projectId).order("task_number");
        if (rows?.length) {
          setTasks(rows.map(r => migrateTask({
            id: r.task_number, name: r.name, priority: r.priority,
            status: r.status,
            effort: (({_laneStarts, ...rest}) => rest)(r.effort||{}),
            owners: r.owners||{},
            laneStarts: r.effort?._laneStarts||{},
            dependsOn: r.depends_on, plannedStart: r.planned_start,
            actualStart: r.actual_start, actualEnd: r.actual_end,
            notes: r.notes, _dbId: r.id,
          })));
        }

        // Load calendar events
        const { data: evs } = await supabase.from("calendar_events")
          .select("*").eq("project_id", projectId);
        if (evs?.length) {
          setConfig(c => ({...c, calendarEvents: evs.map(e=>({
            person: e.person, date: e.date, type: e.type,
            taskId: e.task_id, extraDays: e.extra_days, reason: e.reason,
          }))}));
        }
      } catch(e) { console.error("Load error", e); }
      setLoaded(true);
    }
    load();

    // Real-time sync for tasks
    const taskSub = supabase.channel(`tasks:${projectId}`)
      .on("postgres_changes", {event:"*", schema:"public", table:"tasks",
        filter:`project_id=eq.${projectId}`}, () => load())
      .subscribe();
    return () => supabase.removeChannel(taskSub);
  }, [projectId]);

  const tasksRef = useRef(tasks);
  const configRef = useRef(config);
  useEffect(()=>{tasksRef.current=tasks;},[tasks]);
  useEffect(()=>{configRef.current=config;},[config]);

  const save = useCallback(async (nt, nc) => {
    if (!projectId) return;
    setSaving(true);
    try {
      // Save config to project
      await supabase.from("projects")
        .update({ config: nc, updated_at: new Date().toISOString() })
        .eq("id", projectId);

      // Upsert tasks
      const taskRows = nt.map(t => ({
        project_id: projectId,
        task_number: t.id,
        name: t.name,
        priority: t.priority,
        status: t.status,
        effort: t.effort||{},
        owners: t.owners||{},
        depends_on: t.dependsOn||null,
        planned_start: t.plannedStart||null,
        actual_start: t.actualStart||null,
        actual_end: t.actualEnd||null,
        notes: t.notes||null,
        effort: {...(t.effort||{}), _laneStarts: t.laneStarts||{} },
      }));
      await supabase.from("tasks").upsert(taskRows,
        { onConflict:"project_id,task_number", ignoreDuplicates:false });

      // Save calendar events (replace all)
      await supabase.from("calendar_events").delete().eq("project_id", projectId);
      if (nc.calendarEvents?.length) {
        await supabase.from("calendar_events").insert(
          nc.calendarEvents.map(e=>({
            project_id: projectId,
            person: e.person, date: e.date, type: e.type,
            task_id: e.taskId||null, extra_days: e.extraDays||null, reason: e.reason||null,
          }))
        );
      }
    } catch(e) { console.error("Save error", e); }
    setTimeout(()=>setSaving(false), 600);
  },[projectId]);

  // Stamp plannedEnd on tasks that have full effort but no plannedEnd yet.
  // plannedEnd = the first prediction when a task is "ready" — freezes on first lock.
  // Slip = actualEnd - plannedEnd is meaningful only if plannedEnd is stable.
  const stampPlannedEnds = useCallback((nextTasks, nextConfig) => {
    const pred = computePredictions(nextTasks, nextConfig);
    return nextTasks.map(t => {
      if (t.plannedEnd) return t; // already locked — never overwrite
      const hasOwners = Object.values(t.owners||{}).some(Boolean);
      const hasEffort = Object.values(t.effort||{}).some(v=>Number(v)>0);
      if (!hasOwners || !hasEffort) return t;
      const pe = taskPredictedEnd(t.id, pred);
      if (!pe) return t;
      return { ...t, plannedEnd: fmtDate(pe) };
    });
  }, []);

  const updateTasks = useCallback((fn) => {
    setTasks(prev => {
      const next = stampPlannedEnds(fn(prev), configRef.current);
      save(next, configRef.current);
      return next;
    });
  },[save, stampPlannedEnds]);

  const updateConfig = useCallback((fn) => {
    setConfig(prev => {
      const next = fn(prev);
      save(tasksRef.current, next);
      return next;
    });
  },[save]);

  const predictions = useMemo(()=>computePredictions(tasks,config),[tasks,config]);
  const velocity = useMemo(()=>computeVelocity(tasks),[tasks]);
  const cycles = useMemo(()=>findCycles(tasks),[tasks]);

  if (!loaded) return (
    <div style={{background:T.bg0,height:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:T.t2,fontSize:12,fontFamily:"'JetBrains Mono',monospace",letterSpacing:3}}>loading…</div>
    </div>
  );

  return (
    <AuthGate>
    <div style={{background:T.bg0,minHeight:"100vh",fontFamily:"'Inter','SF Pro Text',system-ui,sans-serif",color:T.t0}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:${T.bg1};}
        ::-webkit-scrollbar-thumb{background:${T.b2};border-radius:3px;}
        input,select,textarea{outline:none;font-family:inherit;}
        .btn{cursor:pointer;border:none;font-family:inherit;transition:all 0.12s ease;}
        .tag{display:inline-flex;align-items:center;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:500;letter-spacing:0.3px;}
        .fade-in{animation:fadeIn 0.2s ease;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(3px);}to{opacity:1;transform:none;}}
        select option{background:${T.bg0};color:${T.t0};}
        .frozen-col{position:sticky;left:0;z-index:5;background:inherit;}
        .frozen-header{position:sticky;top:52px;z-index:20;}
      `}</style>
      <Header editMode={editMode} setEditMode={setEditMode} view={view} setView={setView} saving={saving} onCalendar={()=>setCalendarOpen(o=>!o)} calendarOpen={calendarOpen} config={config} projectName={projectName} orgName={orgName} onBackToProjects={onBackToProjects} onInvite={onInvite} onSignOut={onSignOut}/>
      <div style={{paddingTop:52}}>
        {view==="dashboard"&&<Dashboard tasks={tasks} config={config} predictions={predictions}/>}
        {view==="gantt"    &&<GanttView tasks={tasks} config={config} predictions={predictions}/>}
        {view==="table"    &&<TableView tasks={tasks} config={config} editMode={editMode} updateTasks={updateTasks} updateConfig={updateConfig} predictions={predictions} velocity={velocity} cycles={cycles}/>}
        {view==="capacity" &&<CapacityView tasks={tasks} config={config} predictions={predictions}/>}
        {view==="insights" &&<InsightsView tasks={tasks} config={config} predictions={predictions} velocity={velocity}/>}
      </div>
      {calendarOpen&&<TeamCalendarPanel config={config} updateConfig={updateConfig} tasks={tasks} onClose={()=>setCalendarOpen(false)}/>}
    </div>
    </AuthGate>
  );
}

// ─── HEADER ───────────────────────────────────────────────────────────────────
function Header({editMode,setEditMode,view,setView,saving,onCalendar,calendarOpen,config,projectName,orgName,onBackToProjects,onInvite,onSignOut}) {
  const tabs = [
    {id:"dashboard",label:"Overview"},
    {id:"gantt",    label:"Timeline"},
    {id:"table",    label:"Tasks"},
    {id:"capacity", label:"Capacity"},
    {id:"insights", label:"Insights"},
  ];
  return (
    <div style={{position:"fixed",top:0,left:0,right:0,height:52,background:T.bg1,borderBottom:`1px solid ${T.b1}`,display:"flex",alignItems:"center",padding:"0 20px",zIndex:100}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginRight:20}}>
        {onBackToProjects&&<button className="btn" onClick={onBackToProjects} title="Back to projects"
          style={{background:"transparent",border:`1px solid ${T.b1}`,borderRadius:5,
          padding:"3px 8px",color:T.t2,fontSize:11,cursor:"pointer"}}>← Projects</button>}
        <div style={{width:24,height:24,background:T.acc,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,color:"#fff"}}>S</div>
        <div>
          <div style={{fontSize:12,fontWeight:600,color:T.t0,letterSpacing:-0.2}}>{projectName||"Sprintly"}</div>
          <div style={{fontSize:10,color:T.t2}}>{orgName?`${orgName} · `:""}{config.sprintStart?.slice(5)} – {config.sprintEnd?.slice(5)}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:1,flex:1}}>
        {tabs.map(t=>(
          <button key={t.id} className="btn" onClick={()=>setView(t.id)} style={{
            padding:"5px 14px",borderRadius:5,background:view===t.id?T.bg3:"transparent",
            color:view===t.id?T.t0:T.t2,fontSize:12,fontWeight:view===t.id?500:400,border:"none"
          }}>{t.label}</button>
        ))}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        {saving&&<span style={{fontSize:10,color:T.t2,fontFamily:"'JetBrains Mono',monospace"}}>saving…</span>}
        <button className="btn" onClick={onCalendar} style={{
          padding:"5px 12px",borderRadius:5,fontSize:11,fontWeight:500,
          background:calendarOpen?T.bg3:"transparent",color:calendarOpen?T.acc:T.t2,
          border:`1px solid ${calendarOpen?T.b2:T.b1}`
        }}>📅 Team Calendar</button>
        <button className="btn" onClick={()=>setEditMode(e=>!e)} style={{
          padding:"5px 12px",borderRadius:5,fontSize:11,fontWeight:500,
          background:editMode?T.bg3:"transparent",color:editMode?T.acc:T.t2,
          border:`1px solid ${editMode?T.b2:T.b1}`
        }}>{editMode?"✎ Editing":"View only"}</button>
        {onInvite&&<button className="btn" onClick={onInvite} style={{
          padding:"5px 12px",borderRadius:5,fontSize:11,
          background:"transparent",color:T.t2,border:`1px solid ${T.b1}`
        }}>👥 Invite</button>}
        {onSignOut&&<button className="btn" onClick={onSignOut} style={{
          padding:"5px 10px",borderRadius:5,fontSize:11,
          background:"transparent",color:T.t3,border:`1px solid ${T.b1}`
        }}>↪ Out</button>}
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({tasks, config, predictions}) {
  const today = new Date();
  const end = parseDate(config.sprintEnd||"2026-03-31");
  const start = parseDate(config.sprintStart);
  const daysLeft = Math.max(0, Math.ceil((end-today)/86400000));
  const totalDays = Math.ceil((end-start)/86400000);
  const pct = Math.round(((totalDays-daysLeft)/totalDays)*100);

  const byStatus = tasks.reduce((a,t)=>{a[t.status]=(a[t.status]||0)+1;return a;},{});
  const byPriority = tasks.reduce((a,t)=>{a[t.priority]=(a[t.priority]||0)+1;return a;},{});
  const blockers = tasks.filter(t=>t.status==="Blocked");
  const tbc = tasks.filter(t=>t.notes?.includes("TBC"));
  const released = tasks.filter(t=>t.status==="Released").length;
  const inDev = tasks.filter(t=>t.status==="In Dev").length;
  const p1tasks = tasks.filter(t=>t.priority==="P1");
  const p1done = p1tasks.filter(t=>t.status==="Released").length;

  // At risk: predicted end > sprint end
  const sprintEndStr = config.sprintEnd||"2026-03-31";
  const isBufferTask=t=>t.name?.toLowerCase().includes("buffer");
  const atRisk = tasks.filter(t=>{
    if (t.status==="Released"||t.status==="Descoped") return false;
    if (isBufferTask(t)) return false;
    const pe = taskPredictedEnd(t.id, predictions);
    return pe && fmtDate(pe) > sprintEndStr;
  });

  const StatCard = ({label,value,sub,color})=>(
    <div style={{background:T.bg1,border:`1px solid ${T.b1}`,borderRadius:8,padding:"14px 16px"}} className="fade-in">
      <div style={{fontSize:10,color:T.t2,fontWeight:500,textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>{label}</div>
      <div style={{fontSize:24,fontWeight:600,color:color||T.t0,fontFamily:"'JetBrains Mono',monospace",lineHeight:1,marginBottom:4}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:T.t2}}>{sub}</div>}
    </div>
  );

  return (
    <div style={{padding:"20px 24px",maxWidth:1100,margin:"0 auto"}} className="fade-in">
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
          <span style={{fontSize:10,color:T.t2,textTransform:"uppercase",letterSpacing:0.8,fontWeight:500}}>Sprint progress</span>
          <span style={{fontSize:10,color:T.t1,fontFamily:"'JetBrains Mono',monospace"}}>{pct}% · {daysLeft}d left</span>
        </div>
        <div style={{height:3,background:T.b1,borderRadius:2}}>
          <div style={{height:"100%",width:`${pct}%`,background:T.acc,borderRadius:2,opacity:0.8}}/>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
        <StatCard label="Days left" value={daysLeft} sub={`of ${totalDays} sprint days`} color={T.t1}/>
        <StatCard label="P1 done" value={`${p1done}/${p1tasks.length}`} sub="critical tasks" color={T.p1}/>
        <StatCard label="In dev" value={inDev} sub="tasks active" color={T.p2}/>
        <StatCard label="Released" value={released} sub={`of ${tasks.length} tasks`} color={T.p3}/>
        <StatCard label="At risk" value={atRisk.length} sub="past sprint end" color={atRisk.length>0?T.p1:T.p3}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div style={{background:T.bg1,border:`1px solid ${T.b1}`,borderRadius:8,padding:16}}>
          <div style={{fontSize:10,color:T.t2,fontWeight:500,textTransform:"uppercase",letterSpacing:0.8,marginBottom:12}}>By priority</div>
          {["P1","P2","P3"].map(p=>{
            const count=byPriority[p]||0, pc=PRIORITY_COLOR[p], pctBar=tasks.length?Math.round((count/tasks.length)*100):0;
            return (
              <div key={p} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span className="tag" style={{background:pc.bgCard,color:pc.bg,border:`1px solid ${pc.bg}30`}}>{p}</span>
                    <span style={{fontSize:11,color:T.t2}}>{count}</span>
                  </div>
                  <span style={{fontSize:10,color:T.t3,fontFamily:"'JetBrains Mono',monospace"}}>{pctBar}%</span>
                </div>
                <div style={{height:2,background:T.b1,borderRadius:1}}>
                  <div style={{height:"100%",width:`${pctBar}%`,background:pc.bg,borderRadius:1,opacity:0.7}}/>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{background:T.bg1,border:`1px solid ${T.b1}`,borderRadius:8,padding:16}}>
          <div style={{fontSize:10,color:T.t2,fontWeight:500,textTransform:"uppercase",letterSpacing:0.8,marginBottom:12}}>By status</div>
          {Object.entries(byStatus).map(([status,count])=>{
            const sc=STATUS_COLOR[status]||T.sDo, pctBar=tasks.length?Math.round((count/tasks.length)*100):0;
            return (
              <div key={status} style={{marginBottom:9}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span className="tag" style={{background:sc.bg,color:sc.text,border:`1px solid ${sc.border}`}}>{status}</span>
                    <span style={{fontSize:11,color:T.t2}}>{count}</span>
                  </div>
                  <span style={{fontSize:10,color:T.t3,fontFamily:"'JetBrains Mono',monospace"}}>{pctBar}%</span>
                </div>
                <div style={{height:2,background:T.b1,borderRadius:1}}>
                  <div style={{height:"100%",width:`${pctBar}%`,background:sc.text,borderRadius:1,opacity:0.5}}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        {/* At risk */}
        <div style={{background:T.bg1,border:`1px solid ${atRisk.length>0?T.sBlk.border:T.b1}`,borderRadius:8,padding:16}}>
          <div style={{fontSize:10,color:T.p1,fontWeight:500,textTransform:"uppercase",letterSpacing:0.8,marginBottom:10}}>At risk · {atRisk.length}</div>
          {atRisk.length===0
            ?<div style={{fontSize:12,color:T.t3,fontStyle:"italic"}}>All within sprint — clear</div>
            :atRisk.slice(0,5).map(t=>{
              const pe=taskPredictedEnd(t.id,predictions);
              return (
                <div key={t.id} style={{padding:"6px 0",borderBottom:`1px solid ${T.b0}`,display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:11,color:T.t1}}><span style={{color:T.t3,fontFamily:"'JetBrains Mono',monospace",fontSize:10}}>#{t.id}</span> {t.name.slice(0,28)}{t.name.length>28?"…":""}</span>
                  <span style={{fontSize:10,color:T.p1,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{pe?fmtDate(pe).slice(5):""}</span>
                </div>
              );
            })
          }
        </div>
        {/* Blockers */}
        <div style={{background:T.bg1,border:`1px solid ${T.sBlk.border}`,borderRadius:8,padding:16}}>
          <div style={{fontSize:10,color:T.p1,fontWeight:500,textTransform:"uppercase",letterSpacing:0.8,marginBottom:10}}>Blockers · {blockers.length}</div>
          {blockers.length===0
            ?<div style={{fontSize:12,color:T.t3,fontStyle:"italic"}}>None — all clear</div>
            :blockers.map(t=>(
              <div key={t.id} style={{padding:"6px 0",borderBottom:`1px solid ${T.b0}`,fontSize:12,color:T.p1}}>
                <span style={{color:T.t3,marginRight:6,fontFamily:"'JetBrains Mono',monospace",fontSize:10}}>#{t.id}</span>{t.name.slice(0,30)}
              </div>
            ))
          }
        </div>
        {/* Needs attention */}
        <div style={{background:T.bg1,border:`1px solid ${T.sDev.border}`,borderRadius:8,padding:16}}>
          <div style={{fontSize:10,color:T.p2,fontWeight:500,textTransform:"uppercase",letterSpacing:0.8,marginBottom:10}}>Needs attention · {tbc.length}</div>
          {tbc.length===0
            ?<div style={{fontSize:12,color:T.t3,fontStyle:"italic"}}>Nothing pending</div>
            :tbc.slice(0,5).map(t=>(
              <div key={t.id} style={{padding:"6px 0",borderBottom:`1px solid ${T.b0}`,display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:11,color:T.t1}}><span style={{color:T.t3,fontFamily:"'JetBrains Mono',monospace",fontSize:10}}>#{t.id}</span> {t.name.slice(0,26)}{t.name.length>26?"…":""}</span>
                <span style={{fontSize:10,color:T.p2}}>{t.notes?.slice(0,14)}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// ─── GANTT VIEW ───────────────────────────────────────────────────────────────
function GanttView({tasks, config, predictions}) {
  const today = fmtDate(new Date());
  const [ganttMode, setGanttMode] = useState("person");   // "person" | "project"
  const [hideReleased, setHideReleased] = useState(true);

  // Apply hide-released filter
  const visibleTasks = useMemo(()=>
    hideReleased ? tasks.filter(t=>t.status!=="Released") : tasks
  ,[tasks, hideReleased]);
  const releasedCount = tasks.filter(t=>t.status==="Released").length;

  // chartDays: earliest actualStart week → latest of (sprintEnd, latest predicted end) + 3 buffer days
  const chartDays = useMemo(()=>{
    // --- left boundary: Monday of earliest actualStart (or sprintStart if none earlier) ---
    const allStarts = [config.sprintStart, ...visibleTasks.map(t=>t.actualStart).filter(Boolean)];
    const earliestDate = allStarts.reduce((a,b) => a < b ? a : b);
    const ed = parseDate(earliestDate);
    const edDay = ed.getDay();
    const chartStart = addDays(ed, edDay === 0 ? -6 : -(edDay - 1)); // back to Monday

    // --- right boundary: Friday of the week containing the furthest of sprintEnd / latest prediction ---
    const latestPred = Object.values(predictions).reduce((max, p) => {
      const ends = Object.values(p).map(v => v?.end ? fmtDate(v.end) : null).filter(Boolean);
      const taskMax = ends.length ? ends.reduce((a,b)=>a>b?a:b) : null;
      return taskMax && taskMax > max ? taskMax : max;
    }, config.sprintEnd || "2026-03-31");
    const furthest = parseDate(latestPred > (config.sprintEnd||"") ? latestPred : (config.sprintEnd||latestPred));
    // snap to Friday of that week, + 3 buffer working days
    const fDay = furthest.getDay();
    const daysToFri = fDay === 0 ? 5 : (fDay === 6 ? 6 : 5 - fDay);
    const chartEnd = addDays(furthest, daysToFri + 1);

    const days = [];
    let cur = new Date(chartStart);
    while (cur <= chartEnd) {
      if (!isWeekend(cur)) days.push(fmtDate(cur));
      cur = addDays(cur, 1);
    }
    return days;
  }, [tasks, config, predictions]);

  const sprint = parseDate(config.sprintStart);

  // Build per-person lanes from predictions
  const lanes = useMemo(()=>{
    const devPersons=[...new Set(visibleTasks.flatMap(t=>["ios","and","be","wc"].map(l=>t.owners?.[l]).filter(Boolean)))];
    const qaPersons=[...new Set(visibleTasks.map(t=>t.owners?.qa).filter(Boolean))];
    const mkLane=(person,type)=>({
      key:`${type}_${person}`,person,type,
      color:TEAM[person]?.bar||T.acc,
      lane:TEAM[person]?.lane||T.bg1,
      tasks:visibleTasks.filter(t=>{
        if(type==="qa") return t.owners?.qa===person&&(t.effort?.qa||0)>0;
        return ["ios","and","be","wc"].some(l=>t.owners?.[l]===person&&(t.effort?.[l]||0)>0);
      }).sort((a,b)=>{
        const aPin=a.actualStart?0:a.plannedStart?1:2;
        const bPin=b.actualStart?0:b.plannedStart?1:2;
        if(aPin!==bPin) return aPin-bPin;
        if(aPin<2){const ad=a.actualStart||a.plannedStart,bd=b.actualStart||b.plannedStart;if(ad!==bd) return ad<bd?-1:1;}
        return (PRIORITY_ORDER[a.priority]??3)-(PRIORITY_ORDER[b.priority]??3);
      })
    });
    return [...devPersons.map(p=>mkLane(p,"dev")),...qaPersons.map(p=>mkLane(p,"qa"))];
  },[visibleTasks]);

  const COL_W=28, LABEL_W=260, ROW_H=28;

  const weekGroups = useMemo(()=>{
    const groups=[]; let wk=null, wkStart=0;
    chartDays.forEach((d,i)=>{
      const dt=parseDate(d);
      const mon=fmtDate(new Date(dt.getFullYear(),dt.getMonth(),dt.getDate()-(dt.getDay()||7)+1));
      if(mon!==wk){if(wk) groups.push({label:wk,start:wkStart,end:i-1}); wk=mon;wkStart=i;}
    });
    if(wk) groups.push({label:wk,start:wkStart,end:chartDays.length-1});
    return groups;
  },[chartDays]);

  const getLanePred=(lane,taskId)=>{
    const t=tasks.find(x=>x.id===taskId);
    if(!t) return null;
    if(lane.type==="qa") return predictions[taskId]?.qa;
    // find which sub-lane this person is in
    const sublane=["ios","and","be","wc"].find(l=>t.owners?.[l]===lane.person);
    return sublane?predictions[taskId]?.[sublane]:null;
  };

  // ── Project view: one row per task, segmented bar per lane ──────────────────
  const LANE_COLORS = {ios:"#6366f1",and:"#8b5cf6",be:"#06b6d4",wc:"#10b981",qa:"#f59e0b"};
  const LANE_LABELS = {ios:"iOS",and:"AND",be:"BE",wc:"WC",qa:"QA"};

  const projectRows = useMemo(()=>{
    return visibleTasks.map(task=>{
      const segments = ["ios","and","be","wc","qa"]
        .filter(l => task.owners?.[l] && (task.effort?.[l]||0)>0)
        .map(l=>{
          const pred = predictions[task.id]?.[l];
          return pred ? {lane:l, start:fmtDate(pred.start), end:fmtDate(pred.end), color:LANE_COLORS[l], label:LANE_LABELS[l], person:task.owners[l]} : null;
        }).filter(Boolean);
      return {task, segments};
    });
  },[visibleTasks, predictions]);

  return (
    <div style={{padding:"12px 0"}} className="fade-in">
      {/* ── Toolbar ── */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"0 0 10px 0",borderBottom:`1px solid ${T.b1}`,marginBottom:4}}>
        {/* View toggle */}
        <div style={{display:"flex",background:T.bg1,borderRadius:6,border:`1px solid ${T.b1}`,overflow:"hidden"}}>
          {[{id:"person",label:"👤 By Person"},{id:"project",label:"📋 By Feature"}].map(v=>(
            <button key={v.id} onClick={()=>setGanttMode(v.id)} style={{
              padding:"5px 14px",fontSize:11,fontWeight:500,border:"none",cursor:"pointer",
              background:ganttMode===v.id?T.acc:"transparent",
              color:ganttMode===v.id?"#fff":T.t2,
              transition:"all 0.15s",
            }}>{v.label}</button>
          ))}
        </div>
        {/* Hide released toggle */}
        <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:11,color:T.t2,userSelect:"none"}}>
          <div onClick={()=>setHideReleased(h=>!h)} style={{
            width:28,height:16,borderRadius:8,background:hideReleased?T.p3:T.b1,
            position:"relative",transition:"background 0.2s",cursor:"pointer",border:`1px solid ${hideReleased?T.p3:T.b2}`,
          }}>
            <div style={{
              position:"absolute",top:2,left:hideReleased?13:2,width:10,height:10,
              borderRadius:"50%",background:"#fff",transition:"left 0.2s",
            }}/>
          </div>
          Hide released
          {releasedCount>0&&<span style={{color:T.t3}}>({releasedCount})</span>}
        </label>
      </div>
      <div style={{overflowX:"auto"}}>
        <div style={{minWidth:LABEL_W+chartDays.length*COL_W}}>
          {/* Week header */}
          <div style={{display:"flex",marginLeft:LABEL_W,borderBottom:`1px solid ${T.b0}`}}>
            {weekGroups.map((wg,wi)=>{
              const monDt=parseDate(wg.label);
              const friDt=addDays(monDt,4);
              const monLabel=monDt.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
              const friLabel=friDt.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
              const dayCount=wg.end-wg.start+1;
              const isPreSprint=wg.label<config.sprintStart;
              const isPostSprint=config.sprintEnd&&wg.label>config.sprintEnd;
              return (
                <div key={wi} style={{width:dayCount*COL_W,padding:"3px 0",textAlign:"center",fontSize:9,
                  color:(isPreSprint||isPostSprint)?T.t3:T.t2,fontWeight:500,
                  borderRight:`1px solid ${T.b0}`,
                  background:(isPreSprint||isPostSprint)?T.bg2:wi%2===0?T.bg0:T.bg1,
                  overflow:"hidden",whiteSpace:"nowrap",
                  fontStyle:(isPreSprint||isPostSprint)?"italic":"normal",
                  borderBottom:(isPreSprint||isPostSprint)?`2px dashed ${T.b2}`:"none",
                }}>
                  {isPreSprint?"Pre · ":isPostSprint?"Post · ":"W"+(wi+1)+" · "}{monLabel}{dayCount>=4?` – ${friLabel}`:""}
                </div>
              );
            })}
          </div>
          {/* Day header — sticky */}
          <div style={{display:"flex",marginLeft:LABEL_W,borderBottom:`1px solid ${T.b1}`,position:"sticky",top:52,zIndex:10,background:T.bg0}}>
            {chartDays.map(d=>{
              const dt=parseDate(d);
              const isToday=d===today, isHol=config.holidays.includes(d), isPreSprint=d<config.sprintStart, isPostSprint=config.sprintEnd&&d>config.sprintEnd, isSprintEndDay=config.sprintEnd&&d===config.sprintEnd;
              return (
                <div key={d} style={{width:COL_W,minWidth:COL_W,textAlign:"center",padding:"3px 0",fontSize:9,
                  color:isHol?T.hol:isToday?T.acc:(isPreSprint||isPostSprint)?T.t3:T.t2,
                  fontWeight:isHol||isToday?600:400,
                  background:isHol?T.holBg:isToday?`${T.acc}10`:(isPreSprint||isPostSprint)?T.bg2:"transparent",
                  borderRight:isSprintEndDay?`3px solid ${T.p1}`:`1px solid ${T.b0}`,
                  fontFamily:"'JetBrains Mono',monospace",
                  borderBottom:isToday?`2px solid ${T.acc}`:isHol?`2px solid ${T.hol}`:isPostSprint?`1px dashed ${T.b2}`:"none",
                  opacity:(isPreSprint||isPostSprint)?0.6:1,
                  position:"relative",
                }}>
                {isSprintEndDay&&<div style={{position:"absolute",top:-14,right:-1,fontSize:8,color:T.p1,fontWeight:600,whiteSpace:"nowrap",background:T.bg0,padding:"1px 3px",borderRadius:2,border:`1px solid ${T.p1}`,zIndex:5,lineHeight:1.2}}>Sprint end</div>}
                  {dt.getDate()}<br/><span style={{fontSize:7,opacity:0.6}}>{dt.toLocaleDateString("en-GB",{month:"short"}).slice(0,3)}</span>
                </div>
              );
            })}
          </div>
          {/* ── Person view ── */}
          {ganttMode==="person" && lanes.map(lane=>(
            <div key={lane.key}>
              <div style={{display:"flex",alignItems:"center",background:lane.lane,borderTop:`1px solid ${lane.color}20`,borderBottom:`1px solid ${T.b0}`}}>
                <div style={{width:LABEL_W,minWidth:LABEL_W,padding:"5px 14px",display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:2,height:12,background:lane.color,borderRadius:1,opacity:0.7}}/>
                  <span style={{fontSize:10,fontWeight:500,color:lane.color,textTransform:"uppercase",letterSpacing:0.8}}>{lane.person}</span>
                  <span style={{fontSize:9,color:T.t3}}>{lane.type==="qa"?"QA":"Dev"}</span>
                </div>
                <div style={{flex:1,height:20}}/>
              </div>
              {lane.tasks.map((t,ti)=>{
                const sc=getLanePred(lane,t.id);
                const startIdx=sc?.start?chartDays.indexOf(fmtDate(sc.start)):-1;
                const endIdx=sc?.end?chartDays.indexOf(fmtDate(sc.end)):-1;
                const pc=PRIORITY_COLOR[t.priority]||PRIORITY_COLOR["P3"];
                const stc=STATUS_COLOR[t.status]||T.sDo;
                const isRel=t.status==="Released";
                const hasActualEnd=!!t.actualEnd;
                const pe=taskPredictedEnd(t.id,predictions);
                const isAtRisk=pe&&fmtDate(pe)>(config.sprintEnd||"2026-03-31")&&!isRel;

                return (
                  <div key={t.id} style={{display:"flex",alignItems:"center",borderBottom:`1px solid ${T.b0}`,background:isAtRisk?`${T.p1}05`:ti%2===0?T.bg1:T.bg0}}>
                    <div style={{width:LABEL_W,minWidth:LABEL_W,padding:"0 14px",display:"flex",alignItems:"center",gap:5,height:ROW_H}}>
                      <span className="tag" style={{background:pc.bgCard,color:pc.bg,fontSize:9,padding:"1px 5px",border:`1px solid ${pc.bg}25`}}>{t.priority}</span>
                      <span style={{fontSize:11,color:isAtRisk?T.p1:T.t1,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</span>
                      <span className="tag" style={{background:stc.bg,color:stc.text,fontSize:9,padding:"1px 5px",border:`1px solid ${stc.border}`}}>{t.status.slice(0,3)}</span>
                    </div>
                    {chartDays.map((d,di)=>{
                      const inBar=startIdx!==-1&&di>=startIdx&&di<=endIdx;
                      const isStart=di===startIdx, isEnd=di===endIdx;
                      const isHol=config.holidays.includes(d);
                      const isOff=(config.calendarEvents||[]).some(e=>e.person===lane.person&&(e.type==="planned"||e.type==="unplanned")&&e.date===d);
                      const isL2=(config.calendarEvents||[]).some(e=>e.person===lane.person&&e.type==="l2"&&e.date===d);
                      const isTodayCol=d===today;
                      const isPreSprint=d<config.sprintStart;
                      const isPostSprint=(config.sprintEnd&&d>config.sprintEnd);
                      let barBg="transparent";
                      if(inBar) barBg=isRel?`${T.p3}50`:hasActualEnd?`${T.acc}40`:`${lane.color}55`;
                      const holStripe=`repeating-linear-gradient(45deg,${T.hol}18,${T.hol}18 3px,${T.holBg} 3px,${T.holBg} 8px)`;
                      const cellBase=isPreSprint&&!inBar?T.bg2:isPostSprint&&!inBar?T.bg2:inBar?barBg:isHol?holStripe:isOff?T.p1bg:isL2?`${T.p2}20`:isTodayCol?`${T.acc}08`:"transparent";
                      return (
                        <div key={d} style={{width:COL_W,minWidth:COL_W,height:ROW_H,background:cellBase,opacity:(isPreSprint||isPostSprint)&&!inBar?0.6:1,borderLeft:isStart&&inBar?`2px solid ${lane.color}80`:"none",borderRight:(config.sprintEnd&&d===config.sprintEnd)?`3px solid ${T.p1}`:isEnd&&inBar?`2px solid ${lane.color}80`:isTodayCol?`1px solid ${T.acc}30`:`1px solid ${T.b0}`,position:"relative"}}>
                          {isOff&&inBar&&<div style={{position:"absolute",inset:0,background:`${T.p1}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:T.p1}}>off</div>}
                          {isHol&&<div style={{position:"absolute",inset:0,background:`${T.hol}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:T.hol,fontWeight:700}}>🎉</div>}
                          {isL2&&!isPostSprint&&<div title={`${lane.person} on L2 support — no dev capacity`} style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:700,color:T.p2,opacity:inBar?0.8:0.6,letterSpacing:0.2,pointerEvents:"none"}}>L2</div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}

          {/* ── Project / Feature view ── */}
          {ganttMode==="project" && projectRows.map(({task,segments})=>{
            const sc=STATUS_COLOR[task.status]||T.sDo;
            const isReleased=task.status==="Released";
            // find bar extents: min start, max end across segments
            const segStarts=segments.map(s=>s.start).filter(Boolean);
            const segEnds=segments.map(s=>s.end).filter(Boolean);
            const barStart=segStarts.length?segStarts.reduce((a,b)=>a<b?a:b):null;
            const barEnd=segEnds.length?segEnds.reduce((a,b)=>a>b?a:b):null;
            const startIdx=barStart?chartDays.indexOf(barStart):-1;
            const endIdx=barEnd?chartDays.indexOf(barEnd):-1;
            return (
              <div key={task.id} style={{display:"flex",alignItems:"center",borderBottom:`1px solid ${T.b0}`,background:isReleased?T.bg1:T.bg0,opacity:isReleased?0.6:1}}>
                {/* Label */}
                <div style={{width:LABEL_W,minWidth:LABEL_W,padding:"4px 14px",display:"flex",alignItems:"center",gap:7,overflow:"hidden"}}>
                  <span className="tag" style={{background:sc.bg,color:sc.text,border:`1px solid ${sc.border}`,flexShrink:0,fontSize:9}}>#{task.id}</span>
                  <span style={{fontSize:11,color:isReleased?T.t3:T.t0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontWeight:isReleased?400:500}}>
                    {isReleased?"✓ ":""}{task.name}
                  </span>
                </div>
                {/* Bar cells */}
                <div style={{display:"flex",position:"relative",height:ROW_H}}>
                  {chartDays.map((d,di)=>{
                    const isHol=config.holidays?.includes(d);
                    const isTodayCol=d===today;
                    const isPreSprint=d<config.sprintStart;
                    const isPastEnd=(config.sprintEnd&&d>config.sprintEnd);
                    // Check if this day is inside any segment
                    const activeSeg=segments.find(s=>s.start<=d&&s.end>=d);
                    const holStripeProj=`repeating-linear-gradient(45deg,${T.hol}18,${T.hol}18 3px,${T.holBg} 3px,${T.holBg} 8px)`;
                    const cellBg=activeSeg?activeSeg.color+(isReleased?"33":"55"):isHol?holStripeProj:isTodayCol?`${T.acc}08`:isPreSprint?T.bg2:"transparent";
                    return (
                      <div key={d} title={activeSeg?`${activeSeg.label}: ${activeSeg.person}`:""}
                        style={{width:COL_W,minWidth:COL_W,height:ROW_H,
                          background:cellBg,
                          borderRight:di===startIdx-1||di===endIdx?`1px solid ${activeSeg?.color||T.b0}60`:`1px solid ${T.b0}`,
                          opacity:isPreSprint&&!activeSeg?0.5:1,
                          position:"relative",
                        }}>
                        {/* Lane label on first cell of each segment */}
                        {activeSeg&&(di===0||!segments.find(s=>s.start<=chartDays[di-1]&&s.end>=chartDays[di-1]&&s.lane===activeSeg.lane))&&(
                          <span style={{position:"absolute",top:"50%",left:2,transform:"translateY(-50%)",fontSize:8,color:"#fff",fontWeight:700,pointerEvents:"none",opacity:0.9,letterSpacing:0.3}}>
                            {activeSeg.label}
                          </span>
                        )}
                        {isTodayCol&&<div style={{position:"absolute",top:0,left:"50%",width:1,height:"100%",background:T.acc,opacity:0.6}}/>}
                        {isPastEnd&&!activeSeg&&<div style={{position:"absolute",inset:0,background:`${T.p1}08`}}/>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{padding:"10px 20px",display:"flex",gap:14,flexWrap:"wrap",borderTop:`1px solid ${T.b1}`,marginTop:8}}>
        {[[`${T.acc}55`,"Predicted bar"],[`${T.p3}50`,"Released"],[`${T.acc}40`,"Actual end set"],[T.hol,"Holiday ↗"],[`${T.p2}20`,"L2 support"],[T.p1bg,"Leave"],[T.acc,"Today"]].map(([c,l])=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:T.t2}}>
            <div style={{width:12,height:6,background:c,borderRadius:1,opacity:0.8}}/>{l}
          </div>
        ))}
        <div style={{fontSize:10,color:T.t3,marginLeft:"auto"}}>Bars = predicted schedule · Red tint = overruns sprint</div>
      </div>
    </div>
  );
}

// ─── TABLE VIEW ───────────────────────────────────────────────────────────────
function TableView({tasks, config, editMode, updateTasks, updateConfig, predictions, velocity, cycles=[]}) {
  const [sortBy,setSortBy] = useState("priority");
  const [filterStatus,setFilterStatus] = useState("All");
  const [filterPersons,setFilterPersons] = useState(new Set());
  const [filterPriority,setFilterPriority] = useState("All");
  const [selected,setSelected] = useState(new Set());
  const [bulkStatus,setBulkStatus] = useState("");
  const [confirmDelete,setConfirmDelete] = useState(null);
  const [drawerOpen,setDrawerOpen] = useState(false);
  const [configOpen,setConfigOpen] = useState(false);

  const togglePerson = p=>setFilterPersons(s=>{const n=new Set(s);n.has(p)?n.delete(p):n.add(p);return n;});

  const sorted = useMemo(()=>{
    let t=[...tasks];
    if(filterStatus!=="All") t=t.filter(x=>x.status===filterStatus);
    if(filterPriority!=="All") t=t.filter(x=>x.priority===filterPriority);
    if(filterPersons.size>0) t=t.filter(x=>
      ["ios","and","be","wc","qa"].some(l=>filterPersons.has(x.owners?.[l]))
    );
    if(sortBy==="priority") t.sort((a,b)=>(PRIORITY_ORDER[a.priority]??3)-(PRIORITY_ORDER[b.priority]??3));
    else if(sortBy==="status") t.sort((a,b)=>a.status.localeCompare(b.status));
    else if(sortBy==="id") t.sort((a,b)=>a.id-b.id);
    else if(sortBy==="name") t.sort((a,b)=>a.name.localeCompare(b.name));
    else if(["plannedStart","predictedEnd","actualStart","actualEnd"].includes(sortBy)){
      t.sort((a,b)=>{
        const av = sortBy==="predictedEnd" ? (predictions[a.id]? Object.values(predictions[a.id]).map(p=>p?.end?fmtDate(p.end):"").filter(Boolean).reduce((x,y)=>x>y?x:y,"") : "") : (a[sortBy]||"");
        const bv = sortBy==="predictedEnd" ? (predictions[b.id]? Object.values(predictions[b.id]).map(p=>p?.end?fmtDate(p.end):"").filter(Boolean).reduce((x,y)=>x>y?x:y,"") : "") : (b[sortBy]||"");
        if(!av&&!bv) return 0; if(!av) return 1; if(!bv) return -1;
        return av<bv?-1:av>bv?1:0;
      });
    }
    return t;
  },[tasks,sortBy,filterStatus,filterPersons,filterPriority]);

  const update=(id,path,val)=>{
    updateTasks(prev=>prev.map(t=>{
      if(t.id!==id) return t;
      if(path.includes(".")) {
        const [k,sk]=path.split(".");
        return {...t,[k]:{...(t[k]||{}),[sk]:["ios","and","be","wc","qa"].includes(sk)?Number(val)||0:val}};
      }
      return {...t,[path]:val};
    }));
  };

  const deleteTask=id=>{updateTasks(prev=>prev.filter(t=>t.id!==id));setSelected(s=>{const n=new Set(s);n.delete(id);return n;});setConfirmDelete(null);};
  const deleteBulk=()=>{updateTasks(prev=>prev.filter(t=>!selected.has(t.id)));setSelected(new Set());setConfirmDelete(null);};
  const applyBulk=(field,val)=>{if(!val) return;updateTasks(prev=>prev.map(t=>selected.has(t.id)?{...t,[field]:val}:t));setBulkStatus("");};
  const toggleSelect=id=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll=()=>selected.size===sorted.length?setSelected(new Set()):setSelected(new Set(sorted.map(t=>t.id)));

  const today=fmtDate(new Date());
  const sprintEnd=config.sprintEnd||"2026-03-31";

  const th=(label,key,frozen=false)=>(
    <th onClick={()=>setSortBy(key)} style={{
      padding:"8px 10px",fontSize:10,color:sortBy===key?T.acc:T.t2,fontWeight:600,
      textTransform:"uppercase",letterSpacing:1,cursor:"pointer",background:T.bg1,
      whiteSpace:"nowrap",textAlign:"left",borderBottom:`1px solid ${T.b1}`,
      ...(frozen?{position:"sticky",left:0,zIndex:15}:{})
    }}>{label}{sortBy===key?" ↑":""}</th>
  );

  return (
    <div style={{height:"calc(100vh - 52px)",display:"flex",flexDirection:"column",overflow:"hidden"}} className="fade-in">
      {/* Drawer */}
      {drawerOpen&&<AddTaskDrawer tasks={tasks} updateTasks={updateTasks} onClose={()=>setDrawerOpen(false)} config={config} predictions={predictions}/>}

      {/* Confirm delete */}
      {confirmDelete&&(
        <div style={{position:"fixed",inset:0,background:"#00000040",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:T.bg1,border:`1px solid ${T.sBlk.border}`,borderRadius:8,padding:22,maxWidth:340,width:"90%"}}>
            <div style={{fontSize:13,fontWeight:600,color:T.p1,marginBottom:6}}>Confirm delete</div>
            <div style={{fontSize:12,color:T.t1,marginBottom:18}}>
              {confirmDelete==="bulk"?`Remove ${selected.size} selected task${selected.size>1?"s":""}? Cannot be undone.`:"Remove this task? Cannot be undone."}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button className="btn" onClick={()=>setConfirmDelete(null)} style={{padding:"6px 14px",borderRadius:5,background:T.bg2,color:T.t1,border:`1px solid ${T.b2}`,fontSize:12}}>Cancel</button>
              <button className="btn" onClick={confirmDelete==="bulk"?deleteBulk:()=>deleteTask(confirmDelete)} style={{padding:"6px 14px",borderRadius:5,background:T.sBlk.bg,color:T.p1,border:`1px solid ${T.sBlk.border}`,fontSize:12,fontWeight:500}}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Cycle warning */}
      {cycles.length>0&&(
        <div style={{background:T.p1bg,borderBottom:`1px solid ${T.sBlk.border}`,padding:"8px 16px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <span style={{fontSize:12}}>⚠️</span>
          <span style={{fontSize:11,color:T.p1,fontWeight:500}}>Circular dependency detected</span>
          <span style={{fontSize:11,color:T.t1}}>Tasks {cycles.map(id=>`#${id}`).join(", ")} are in a dependency loop — predictions for these tasks may be incorrect. Fix in the Depends on column.</span>
        </div>
      )}
      {/* Toolbar */}
      <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.b1}`,background:T.bg0,flexShrink:0}}>
        <div style={{display:"flex",gap:8,marginBottom:6,alignItems:"center",flexWrap:"wrap"}}>
          {/* Status dropdown */}
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
            style={{padding:"4px 8px",borderRadius:5,fontSize:11,background:T.bg2,color:filterStatus!=="All"?T.acc:T.t1,border:`1px solid ${filterStatus!=="All"?T.acc:T.b1}`,cursor:"pointer",outline:"none",fontWeight:filterStatus!=="All"?500:400}}>
            <option value="All">All Statuses</option>
            {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          {/* Priority dropdown */}
          <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)}
            style={{padding:"4px 8px",borderRadius:5,fontSize:11,background:T.bg2,color:filterPriority!=="All"?(filterPriority==="P1"?T.p1:filterPriority==="P2"?T.p2:T.p3):T.t1,border:`1px solid ${filterPriority!=="All"?(filterPriority==="P1"?T.p1:filterPriority==="P2"?T.p2:T.p3):T.b1}`,cursor:"pointer",outline:"none",fontWeight:filterPriority!=="All"?500:400}}>
            <option value="All">All Priorities</option>
            {["P1","P2","P3"].map(p=><option key={p} value={p}>{p}</option>)}
          </select>
          {(filterStatus!=="All"||filterPriority!=="All")&&(
            <button className="btn" onClick={()=>{setFilterStatus("All");setFilterPriority("All");}}
              style={{padding:"3px 8px",borderRadius:5,fontSize:10,background:"transparent",color:T.t3,border:`1px solid ${T.b1}`}}>✕ clear</button>
          )}
          <div style={{flex:1}}/>
          {editMode&&(
            <>
              <button className="btn" onClick={()=>setDrawerOpen(true)} style={{padding:"5px 12px",borderRadius:5,fontSize:11,fontWeight:500,background:T.acc,color:"#fff",border:"none",display:"flex",alignItems:"center",gap:4}}>+ Add Task</button>
              <button className="btn" onClick={()=>setConfigOpen(o=>!o)} style={{padding:"5px 11px",borderRadius:5,fontSize:11,background:T.bg2,color:T.t2,border:`1px solid ${T.b1}`}}>⚙</button>
            </>
          )}
          <span style={{fontSize:10,color:T.t3,fontFamily:"'JetBrains Mono',monospace"}}>{sorted.length}/{tasks.length}</span>
        </div>
        {/* Person filter row */}
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {TEAM_NAMES.map(p=>{
            const sel=filterPersons.has(p);
            const color=TEAM[p]?.bar||T.acc;
            return (
              <button key={p} className="btn" onClick={()=>togglePerson(p)} style={{padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:sel?500:400,background:sel?`${color}18`:"transparent",color:sel?color:T.t2,border:`1px solid ${sel?`${color}60`:T.b1}`}}>{p}</button>
            );
          })}
          {filterPersons.size>0&&<button className="btn" onClick={()=>setFilterPersons(new Set())} style={{padding:"2px 7px",borderRadius:10,fontSize:10,background:"transparent",color:T.t3,border:`1px solid ${T.b1}`}}>✕ clear</button>}
        </div>
        {/* Bulk actions */}
        {editMode&&selected.size>0&&(
          <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8,padding:"7px 12px",background:T.bg2,borderRadius:6,border:`1px solid ${T.b2}`,flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:T.acc,fontWeight:500}}>{selected.size} selected</span>
            <select value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)} style={{background:T.bg1,color:T.t0,border:`1px solid ${T.b2}`,borderRadius:4,padding:"3px 7px",fontSize:11}}>
              <option value="">— status —</option>
              {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn" onClick={()=>applyBulk("status",bulkStatus)} disabled={!bulkStatus} style={{padding:"3px 9px",borderRadius:4,background:bulkStatus?T.bg3:T.bg1,color:bulkStatus?T.acc:T.t3,border:`1px solid ${T.b2}`,fontSize:11}}>Apply</button>
            <button className="btn" onClick={()=>setConfirmDelete("bulk")} style={{padding:"3px 10px",borderRadius:4,background:T.sBlk.bg,color:T.p1,border:`1px solid ${T.sBlk.border}`,fontSize:11}}>Delete {selected.size}</button>
            <button className="btn" onClick={()=>setSelected(new Set())} style={{padding:"3px 8px",borderRadius:4,background:"transparent",color:T.t2,border:`1px solid ${T.b1}`,fontSize:11}}>✕</button>
          </div>
        )}
        {configOpen&&editMode&&<ConfigPanel config={config} updateConfig={updateConfig} onClose={()=>setConfigOpen(false)}/>}
      </div>

      {/* Scrollable table */}
      <div style={{flex:1,overflow:"auto",position:"relative"}}>
        <table style={{borderCollapse:"collapse",width:"100%",minWidth:1400}}>
          <thead>
            <tr style={{position:"sticky",top:0,zIndex:20}}>
              {editMode&&<th style={{padding:"8px 8px",background:T.bg1,borderBottom:`1px solid ${T.b1}`,width:32,position:"sticky",top:0}}><input type="checkbox" checked={selected.size===sorted.length&&sorted.length>0} onChange={toggleAll} style={{cursor:"pointer",accentColor:T.acc}}/></th>}
              {[["#","id"],["Pri","priority"],["Task","name"]].map(([l,k],i)=>
                <th key={k} onClick={()=>setSortBy(k===sortBy?"priority":k)} style={{padding:"8px 10px",fontSize:10,color:sortBy===k?T.acc:T.t2,fontWeight:600,textTransform:"uppercase",letterSpacing:1,cursor:"pointer",background:sortBy===k?`${T.acc}12`:T.bg1,whiteSpace:"nowrap",textAlign:"left",borderBottom:`1px solid ${T.b1}`,position:"sticky",top:0,left:i===2?0:undefined,zIndex:i===2?16:undefined}}>{l}{sortBy===k?" ↑":""}</th>
              )}
              {[["iOS","#5b8af0"],["And","#7c6af0"],["BE","#5ba8a0"],["WC","#4a8a5a"],["QA","#c8972c"]].map(([h,c])=>(
                <th key={h+"h"} style={{padding:"8px 8px",fontSize:10,fontWeight:600,textTransform:"uppercase",
                  letterSpacing:1,background:T.bg1,borderBottom:`1px solid ${T.b1}`,whiteSpace:"nowrap",
                  textAlign:"center",position:"sticky",top:0,minWidth:110,
                  borderLeft:`1px solid ${T.b0}`,color:c}}>
                  {h}
                  <div style={{fontSize:8,color:T.t3,fontWeight:400,marginTop:1}}>effort · owner · dates</div>
                </th>
              ))}
              <th style={{padding:"8px 10px",fontSize:10,color:T.t2,fontWeight:600,textTransform:"uppercase",letterSpacing:1,background:T.bg1,borderBottom:`1px solid ${T.b1}`,whiteSpace:"nowrap",position:"sticky",top:0}}>Depends on</th>
              {th("Status","status")}
              {[["Plan Start","plannedStart"],["Pred End","predictedEnd"],["Act Start","actualStart"],["Act End","actualEnd"]].map(([h,k])=>(
                <th key={h} onClick={()=>setSortBy(k===sortBy?"priority":k)} style={{padding:"8px 8px",fontSize:10,color:sortBy===k?T.acc:T.t2,fontWeight:600,textTransform:"uppercase",letterSpacing:1,background:sortBy===k?`${T.acc}12`:T.bg2,borderBottom:`1px solid ${T.b1}`,whiteSpace:"nowrap",borderLeft:`1px solid ${T.b1}`,position:"sticky",top:0,cursor:"pointer",userSelect:"none"}}>{h}{sortBy===k?" ↑":""}</th>
              ))}
              <th style={{padding:"8px 8px",fontSize:10,color:T.p2,fontWeight:600,textTransform:"uppercase",letterSpacing:1,background:`${T.p2bg}`,borderBottom:`1px solid ${T.b1}`,whiteSpace:"nowrap",position:"sticky",top:0}}>Slip</th>
              <th style={{padding:"8px 10px",fontSize:10,color:T.t2,fontWeight:600,textTransform:"uppercase",letterSpacing:1,background:T.bg1,borderBottom:`1px solid ${T.b1}`,position:"sticky",top:0}}>Notes</th>
              {editMode&&<th style={{background:T.bg1,borderBottom:`1px solid ${T.b1}`,position:"sticky",top:0,width:36}}/>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t,ti)=>{
              const pc=PRIORITY_COLOR[t.priority]||PRIORITY_COLOR["P3"];
              const sc=STATUS_COLOR[t.status]||T.sDo;
              const isSel=selected.has(t.id);
              const bg=isSel?T.bg3:ti%2===0?T.bg1:T.bg0;

              // Predicted end
              const pe=taskPredictedEnd(t.id,predictions);
              const peStr=pe?fmtDate(pe):"";
              const isAtRisk=peStr&&peStr>sprintEnd&&t.status!=="Released";

              // Slip
              const slipDays=t.actualEnd&&t.plannedEnd?Math.round((parseDate(t.actualEnd)-parseDate(t.plannedEnd))/86400000):null;

              // Velocity warnings on owners
              const ownerWarnings={};
              ["ios","and","be","wc","qa"].forEach(l=>{
                const p=t.owners?.[l];
                if(p&&velocity[p]&&velocity[p].count>=2&&velocity[p].avgSlip>2) ownerWarnings[l]=velocity[p].avgSlip;
              });

              const depNames=(t.dependsOn||[]).map(id=>tasks.find(x=>x.id===id)).filter(Boolean).map(x=>`#${x.id}`).join(", ");

              return (
                <tr key={t.id} style={{background:bg,borderBottom:`1px solid ${T.b0}`}}>
                  {editMode&&<td style={{padding:"5px 8px",textAlign:"center"}}><input type="checkbox" checked={isSel} onChange={()=>toggleSelect(t.id)} style={{cursor:"pointer",accentColor:T.acc}}/></td>}
                  {/* ID */}
                  <td style={{padding:"5px 8px",fontSize:11,color:T.t2,fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>{t.id}</td>
                  {/* Priority */}
                  <td style={{padding:"5px 8px"}}>
                    {editMode
                      ?<select value={t.priority} onChange={e=>update(t.id,"priority",e.target.value)} style={{background:T.bg2,color:T.t0,border:`1px solid ${T.b2}`,borderRadius:4,padding:"2px 4px",fontSize:11}}>
                        {["P1","P2","P3"].map(p=><option key={p} value={p}>{p}</option>)}
                      </select>
                      :<span className="tag" style={{background:pc.bgCard,color:pc.bg,border:`1px solid ${pc.bg}30`}}>{t.priority}</span>
                    }
                  </td>
                  {/* Task name — frozen */}
                  <td style={{padding:"5px 10px",maxWidth:220,minWidth:160,position:"sticky",left:0,background:bg,zIndex:4,boxShadow:"2px 0 4px rgba(0,0,0,0.04)"}}>
                    {editMode
                      ?<input type="text" value={t.name} onChange={e=>update(t.id,"name",e.target.value)} style={{background:"transparent",color:T.t0,border:"none",borderBottom:`1px solid ${T.b2}`,padding:"1px 0",fontSize:12,width:"100%",outline:"none"}}/>
                      :<span style={{fontSize:12,color:isAtRisk?T.p1:T.t0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"block",maxWidth:200}} title={t.name}>{isAtRisk?"⚠ ":""}{t.name}</span>
                    }
                  </td>
                  {/* Combined lane cells: effort + owner + per-lane dates */}
                  {["ios","and","be","wc","qa"].map(l=>{
                    const owner = t.owners?.[l]||"";
                    const eff   = t.effort?.[l]||0;
                    const ls    = t.laneStarts?.[l]||{};
                    const lColor = TEAM[owner]?.bar||T.acc;
                    const hasWarn = ownerWarnings[l];
                    const hasLaneDates = ls.plannedStart||ls.actualStart||ls.actualEnd;
                    const pred_lane = predictions[t.id]?.[l];
                    const laneEnd = pred_lane?.end ? fmtDate(pred_lane.end).slice(5) : null;

                    const updateLaneStart = (field, val) => updateTasks(prev => prev.map(x =>
                      x.id !== t.id ? x : {
                        ...x,
                        laneStarts: {
                          ...(x.laneStarts||{}),
                          [l]: { ...(x.laneStarts?.[l]||{}), [field]: val }
                        }
                      }
                    ));

                    return (
                      <td key={l+"lane"} style={{padding:"4px 6px",minWidth:110,verticalAlign:"top",
                        borderLeft:`1px solid ${T.b0}`,
                        background: hasLaneDates ? `${lColor}08` : "transparent"
                      }}>
                        {/* Row 1: effort input + owner select */}
                        <div style={{display:"flex",alignItems:"center",gap:3,marginBottom:editMode?3:0}}>
                          {editMode
                            ? <>
                                <input type="number" min={0} step={0.5} value={eff||""} onChange={e=>update(t.id,`effort.${l}`,e.target.value)}
                                  style={{background:T.bg2,color:T.acc,border:`1px solid ${T.b2}`,borderRadius:3,padding:"1px 3px",fontSize:10,width:32,textAlign:"center",fontFamily:"'JetBrains Mono',monospace"}}/>
                                <select value={owner} onChange={e=>update(t.id,`owners.${l}`,e.target.value)}
                                  style={{background:T.bg2,color:T.t0,border:`1px solid ${T.b2}`,borderRadius:3,padding:"1px 3px",fontSize:10,flex:1,minWidth:0}}>
                                  <option value="">—</option>
                                  {TEAM_NAMES.map(p=><option key={p} value={p}>{p}</option>)}
                                </select>
                              </>
                            : <>
                                <span style={{fontSize:10,color:eff?T.acc:T.t3,fontFamily:"'JetBrains Mono',monospace",minWidth:14}}>{eff||"—"}</span>
                                {owner && <span style={{fontSize:10,color:lColor,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{owner}{hasWarn&&<span title={`Avg +${hasWarn}d slip`} style={{fontSize:8,color:T.p2,marginLeft:2}}>⚠</span>}</span>}
                                {!owner && <span style={{fontSize:10,color:T.t3}}>—</span>}
                              </>
                          }
                        </div>
                        {/* Row 2: per-lane date overrides (shown when owner+effort exist) */}
                        {owner && eff > 0 && editMode && (
                          <div style={{display:"flex",flexDirection:"column",gap:2,paddingTop:2,borderTop:`1px dashed ${T.b1}`}}>
                            <input type="date" value={ls.plannedStart||""} onChange={e=>updateLaneStart("plannedStart",e.target.value)}
                              title="Lane planned start (overrides task start)"
                              style={{background:"transparent",color:T.t2,border:`1px solid ${T.b1}`,borderRadius:3,padding:"1px 2px",fontSize:9,width:"100%",fontFamily:"'JetBrains Mono',monospace",cursor:"pointer"}}/>
                            <input type="date" value={ls.actualStart||""} onChange={e=>updateLaneStart("actualStart",e.target.value)}
                              title="Lane actual start"
                              style={{background:"transparent",color:T.p3,border:`1px solid ${T.sQA.border}`,borderRadius:3,padding:"1px 2px",fontSize:9,width:"100%",fontFamily:"'JetBrains Mono',monospace",cursor:"pointer"}}/>
                            <input type="date" value={ls.actualEnd||""} onChange={e=>updateLaneStart("actualEnd",e.target.value)}
                              title="Lane actual end"
                              style={{background:ls.actualEnd&&t.plannedEnd&&ls.actualEnd>t.plannedEnd?T.p1bg:"transparent",color:ls.actualEnd?T.p3:T.t3,border:`1px solid ${ls.actualEnd?T.sQA.border:T.b1}`,borderRadius:3,padding:"1px 2px",fontSize:9,width:"100%",fontFamily:"'JetBrains Mono',monospace",cursor:"pointer"}}/>
                          </div>
                        )}
                        {/* Row 2 view mode: show dates if set */}
                        {owner && eff > 0 && !editMode && (ls.plannedStart||ls.actualStart||laneEnd) && (
                          <div style={{fontSize:9,color:T.t3,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.6,marginTop:2}}>
                            {ls.plannedStart && <div title="Planned start">▶ {ls.plannedStart.slice(5)}</div>}
                            {ls.actualStart  && <div title="Actual start" style={{color:T.p3}}>✓ {ls.actualStart.slice(5)}</div>}
                            {laneEnd         && <div title="Predicted end" style={{color:T.acc}}>⟶ {laneEnd}</div>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  {/* Depends on */}
                  <td style={{padding:"5px 8px",minWidth:90}}>
                    {editMode
                      ?<input type="text" value={(t.dependsOn||[]).join(",")} placeholder="e.g. 5,12" onChange={e=>updateTasks(prev=>prev.map(x=>x.id===t.id?{...x,dependsOn:e.target.value.split(",").map(v=>parseInt(v.trim())).filter(n=>!isNaN(n)&&n!==t.id)}:x))} style={{background:T.bg2,color:T.t0,border:`1px solid ${T.b2}`,borderRadius:4,padding:"2px 5px",fontSize:11,width:"100%"}}/>
                      :<span style={{fontSize:11,color:T.t2,fontFamily:"'JetBrains Mono',monospace"}}>{depNames||"—"}</span>
                    }
                  </td>
                  {/* Status */}
                  <td style={{padding:"5px 8px",minWidth:100}}>
                    {editMode
                      ?<select value={t.status} onChange={e=>update(t.id,"status",e.target.value)} style={{background:T.bg2,color:T.t0,border:`1px solid ${T.b2}`,borderRadius:4,padding:"2px 5px",fontSize:11,width:"100%"}}>
                        {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                      :<span className="tag" style={{background:sc.bg,color:sc.text,border:`1px solid ${sc.border}`}}>{t.status}</span>
                    }
                  </td>
                  {/* Date columns */}
                  {/* Plan Start */}
                  <td style={{padding:"4px 6px",minWidth:106,borderLeft:`1px solid ${T.b1}`,background:`${T.bg1}`}}>
                    <input type="date" value={t.plannedStart||""} onChange={e=>update(t.id,"plannedStart",e.target.value)} style={{background:"transparent",color:T.t1,border:`1px solid ${T.b1}`,borderRadius:4,padding:"2px 4px",fontSize:11,width:"100%",cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"}}/>
                  </td>
                  {/* Predicted end — read-only computed */}
                  <td style={{padding:"4px 8px",minWidth:90,borderLeft:`1px solid ${T.b1}`,background:`${T.bg1}`}}>
                    <span style={{fontSize:11,fontFamily:"'JetBrains Mono',monospace",color:isAtRisk?T.p1:peStr?T.p3:T.t3,fontWeight:isAtRisk?600:400}}>
                      {peStr?peStr.slice(5):"—"}
                      {isAtRisk&&<span style={{fontSize:9,marginLeft:3}}>⚠</span>}
                    </span>
                  </td>
                  {/* Act Start */}
                  <td style={{padding:"4px 6px",minWidth:106,borderLeft:`1px solid ${T.b1}`,background:`${T.p3bg}20`}}>
                    <input type="date" value={t.actualStart||""} onChange={e=>update(t.id,"actualStart",e.target.value)} style={{background:"transparent",color:T.p3,border:`1px solid ${T.sQA.border}`,borderRadius:4,padding:"2px 4px",fontSize:11,width:"100%",cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"}}/>
                  </td>
                  {/* Act End */}
                  <td style={{padding:"4px 6px",minWidth:106,background:`${T.p3bg}20`}}>
                    {(()=>{
                      const isLate=t.actualEnd&&t.plannedEnd&&t.actualEnd>t.plannedEnd;
                      return <input type="date" value={t.actualEnd||""} onChange={e=>update(t.id,"actualEnd",e.target.value)} style={{background:isLate?T.p1bg:"transparent",color:isLate?T.p1:T.p3,border:`1px solid ${isLate?T.sBlk.border:T.sQA.border}`,borderRadius:4,padding:"2px 4px",fontSize:11,width:"100%",cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"}}/>;
                    })()}
                  </td>
                  {/* Slip */}
                  <td style={{padding:"5px 8px",background:`${T.p2bg}`,minWidth:60,textAlign:"center"}}>
                    {slipDays!==null
                      ?<span style={{fontSize:11,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",color:slipDays>0?T.p1:slipDays<0?"#3a8a5a":T.t3}}>{slipDays>0?"+":""}{slipDays}d</span>
                      :<span style={{fontSize:11,color:T.t3}}>—</span>
                    }
                  </td>
                  {/* Notes */}
                  <td style={{padding:"5px 10px",minWidth:120}}>
                    {editMode
                      ?<input type="text" value={t.notes||""} onChange={e=>update(t.id,"notes",e.target.value)} style={{background:"transparent",color:T.t1,border:"none",borderBottom:`1px solid ${T.b1}`,padding:"1px 0",fontSize:11,width:"100%",outline:"none"}}/>
                      :<span style={{fontSize:11,color:T.t2}}>{t.notes||<span style={{color:T.b2}}>—</span>}</span>
                    }
                  </td>
                  {editMode&&(
                    <td style={{padding:"5px 8px",textAlign:"center"}}>
                      <button className="btn" onClick={()=>setConfirmDelete(t.id)} style={{padding:"2px 7px",borderRadius:4,background:"transparent",color:T.t3,border:"none",fontSize:13,lineHeight:1}}
                        onMouseEnter={e=>{e.target.style.color=T.p1;}}
                        onMouseLeave={e=>{e.target.style.color=T.t3;}}>🗑</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ADD TASK DRAWER ──────────────────────────────────────────────────────────
function AddTaskDrawer({tasks, updateTasks, onClose, config, predictions}) {
  const maxId=tasks.reduce((m,t)=>Math.max(m,t.id),0);
  const [form,setForm]=useState({
    id:maxId+1, name:"", priority:"P2", status:"Planned", notes:"",
    owners:{ios:"",and:"",be:"",wc:"",qa:""},
    effort:{ios:0,and:0,be:0,wc:0,qa:0},
    dependsOn:[], plannedStart:"", actualStart:"", actualEnd:""
  });

  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const setO=(l,v)=>setForm(f=>({...f,owners:{...f.owners,[l]:v}}));
  const setE=(l,v)=>setForm(f=>({...f,effort:{...f.effort,[l]:Number(v)||0}}));

  // Live predicted end
  const livePred=useMemo(()=>{
    const tempTasks=[...tasks,form];
    const p=computePredictions(tempTasks,config);
    const pe=taskPredictedEnd(form.id,p);
    return pe?fmtDate(pe):null;
  },[form,tasks,config]);

  const isAtRisk=livePred&&livePred>(config.sprintEnd||"2026-03-31");

  const save=()=>{
    if(!form.name.trim()) return;
    updateTasks(prev=>[...prev,{...form,id:Math.max(0,...prev.map(t=>t.id))+1}]);
    onClose();
  };

  const laneLabels={ios:"iOS",and:"Android",be:"Backend",wc:"Web Client",qa:"QA"};
  const inp={background:T.bg2,color:T.t0,border:`1px solid ${T.b2}`,borderRadius:5,padding:"6px 9px",fontSize:12,width:"100%",fontFamily:"inherit"};
  const sel={...inp,cursor:"pointer"};

  return (
    <div style={{position:"fixed",inset:0,zIndex:300,display:"flex"}}>
      <div style={{flex:1,background:"#00000030"}} onClick={onClose}/>
      <div style={{width:400,background:T.bg0,borderLeft:`1px solid ${T.b1}`,display:"flex",flexDirection:"column",height:"100%",overflow:"auto"}}>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.b1}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:T.bg1,flexShrink:0}}>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:T.t0}}>Add Task</div>
            <div style={{fontSize:10,color:T.t2,marginTop:2}}>Predicted end updates live as you fill in owners + effort</div>
          </div>
          <button className="btn" onClick={onClose} style={{background:"transparent",color:T.t2,fontSize:18,padding:"2px 8px",border:`1px solid ${T.b1}`,borderRadius:4}}>×</button>
        </div>

        <div style={{padding:20,flex:1,overflowY:"auto"}}>
          {/* Task description */}
          <div style={{marginBottom:16}}>
            <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Task description *</label>
            <textarea value={form.name} onChange={e=>set("name",e.target.value)} placeholder="What needs to be built?" rows={3} style={{...inp,resize:"vertical",lineHeight:1.5}}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            <div>
              <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Priority</label>
              <select value={form.priority} onChange={e=>set("priority",e.target.value)} style={sel}>
                {["P1","P2","P3"].map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Status</label>
              <select value={form.status} onChange={e=>set("status",e.target.value)} style={sel}>
                {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Plan start */}
          <div style={{marginBottom:16}}>
            <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Planned start date</label>
            <input type="date" value={form.plannedStart} onChange={e=>set("plannedStart",e.target.value)} style={inp}/>
          </div>

          {/* Team + effort */}
          <div style={{marginBottom:16}}>
            <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:0.5}}>Team & effort (days)</label>
            {Object.entries(laneLabels).map(([l,label])=>(
              <div key={l} style={{display:"grid",gridTemplateColumns:"80px 1fr 80px",gap:8,alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:11,color:T.t1,fontWeight:500}}>{label}</span>
                <select value={form.owners[l]||""} onChange={e=>setO(l,e.target.value)} style={{...sel,padding:"5px 8px",fontSize:11}}>
                  <option value="">— nobody —</option>
                  {TEAM_NAMES.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
                <div style={{position:"relative"}}>
                  <input type="number" min={0} step={0.5} value={form.effort[l]||""} onChange={e=>setE(l,e.target.value)} placeholder="0" style={{...inp,padding:"5px 28px 5px 8px",fontSize:11,textAlign:"center",fontFamily:"'JetBrains Mono',monospace"}} disabled={!form.owners[l]}/>
                  <span style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",fontSize:9,color:T.t3,pointerEvents:"none"}}>d</span>
                </div>
              </div>
            ))}
          </div>

          {/* Dependencies */}
          <div style={{marginBottom:16}}>
            <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Depends on (task IDs, comma-separated)</label>
            <input type="text" value={(form.dependsOn||[]).join(",")} placeholder="e.g. 5, 12" onChange={e=>set("dependsOn",e.target.value.split(",").map(v=>parseInt(v.trim())).filter(n=>!isNaN(n)))} style={inp}/>
            {(form.dependsOn||[]).length>0&&(
              <div style={{marginTop:5,fontSize:10,color:T.t2}}>
                Blocking: {form.dependsOn.map(id=>{const t=tasks.find(x=>x.id===id);return t?`#${id} ${t.name.slice(0,20)}`:null;}).filter(Boolean).join(", ")}
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={{marginBottom:20}}>
            <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Notes</label>
            <input type="text" value={form.notes||""} onChange={e=>set("notes",e.target.value)} placeholder="Any context, links, TBCs…" style={inp}/>
          </div>

          {/* Prediction panel */}
          <div style={{background:isAtRisk?T.p1bg:T.p3bg,border:`1px solid ${isAtRisk?T.sBlk.border:T.sQA.border}`,borderRadius:8,padding:14,marginBottom:20}}>
            <div style={{fontSize:10,color:T.t2,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Predicted completion</div>
            <div style={{fontSize:22,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",color:isAtRisk?T.p1:T.p3}}>
              {livePred?livePred:"Fill in effort →"}
            </div>
            {isAtRisk&&<div style={{fontSize:11,color:T.p1,marginTop:4}}>⚠ Overruns sprint end ({config.sprintEnd?.slice(5)||"Mar 31"})</div>}
            {livePred&&!isAtRisk&&<div style={{fontSize:11,color:T.p3,marginTop:4}}>Within sprint — good</div>}
            <div style={{fontSize:10,color:T.t3,marginTop:6}}>Based on each person's working calendar, L2 rota, leaves & holidays</div>
          </div>
        </div>

        <div style={{padding:"14px 20px",borderTop:`1px solid ${T.b1}`,display:"flex",gap:8,flexShrink:0,background:T.bg1}}>
          <button className="btn" onClick={save} disabled={!form.name.trim()} style={{flex:1,padding:"9px 0",borderRadius:6,background:form.name.trim()?T.acc:"#c0c0c0",color:"#fff",fontSize:13,fontWeight:500,border:"none"}}>Add to sprint</button>
          <button className="btn" onClick={onClose} style={{padding:"9px 16px",borderRadius:6,background:T.bg2,color:T.t1,border:`1px solid ${T.b2}`,fontSize:13}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── CONFIG PANEL ─────────────────────────────────────────────────────────────
function ConfigPanel({config, updateConfig, onClose}) {
  const [bulkInput, setBulkInput] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkPreview, setBulkPreview] = useState([]);
  const inp={background:T.bg2,color:T.t0,border:`1px solid ${T.b2}`,borderRadius:5,padding:"5px 9px",fontSize:12,width:"100%"};

  // Parse free-form date input: single, comma-separated, or newline-separated
  const parseDates = (raw) => {
    const tokens = raw.split(/[,\n]+/).map(s=>s.trim()).filter(Boolean);
    const valid=[], invalid=[];
    tokens.forEach(tok=>{
      // Accept: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD MM YYYY
      let d = null;
      if(/^\d{4}-\d{2}-\d{2}$/.test(tok)) d=tok;
      else if(/^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(tok)){
        const [dd,mm,yyyy]=tok.split(/[\/-]/); d=`${yyyy}-${mm}-${dd}`;
      } else if(/^\d{1,2}\s+\w+\s+\d{4}$/i.test(tok)){
        const dt=new Date(tok); if(!isNaN(dt)) d=fmtDate(dt);
      }
      if(d && !isNaN(new Date(d))) valid.push(d);
      else invalid.push(tok);
    });
    return {valid, invalid};
  };

  const handlePreview = () => {
    if(!bulkInput.trim()){setBulkError("Enter at least one date");return;}
    const {valid,invalid}=parseDates(bulkInput);
    if(invalid.length) setBulkError(`Could not parse: ${invalid.join(", ")}`);
    else setBulkError("");
    const existing=new Set(config.holidays||[]);
    const fresh=valid.filter(d=>!existing.has(d));
    const dupes=valid.filter(d=>existing.has(d));
    setBulkPreview(valid.map(d=>({date:d, isDupe:dupes.includes(d)})));
  };

  const handleAdd = () => {
    const toAdd = bulkPreview.filter(p=>!p.isDupe).map(p=>p.date);
    if(!toAdd.length) return;
    updateConfig(c=>({...c, holidays:[...(c.holidays||[]),...toAdd].sort()}));
    setBulkInput(""); setBulkPreview([]); setBulkError("");
  };

  return (
    <div style={{background:T.bg1,border:`1px solid ${T.b2}`,borderRadius:8,padding:16,marginTop:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{fontSize:11,fontWeight:500,color:T.t1}}>Sprint Config</span>
        <button className="btn" onClick={onClose} style={{background:"transparent",color:T.t2,fontSize:14,padding:"1px 6px",border:`1px solid ${T.b1}`,borderRadius:4}}>×</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <div>
          <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Sprint Start</label>
          <input type="date" value={config.sprintStart} onChange={e=>updateConfig(c=>({...c,sprintStart:e.target.value}))} style={inp}/>
        </div>
        <div>
          <label style={{fontSize:10,color:T.t2,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Sprint End</label>
          <input type="date" value={config.sprintEnd||"2026-03-31"} onChange={e=>updateConfig(c=>({...c,sprintEnd:e.target.value}))} style={inp}/>
        </div>
      </div>

      {/* ── Holidays ── */}
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <label style={{fontSize:10,color:T.t2,textTransform:"uppercase",letterSpacing:0.5}}>Company Holidays</label>
          {(config.holidays||[]).length>0&&(
            <button className="btn" onClick={()=>{if(window.confirm("Clear all holidays?")) updateConfig(c=>({...c,holidays:[]}));}}
              style={{fontSize:10,color:T.p1,background:"transparent",border:"none",cursor:"pointer",padding:"0 4px"}}>Clear all</button>
          )}
        </div>

        {/* Existing holidays */}
        {(config.holidays||[]).length>0&&(
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10,padding:8,background:T.bg0,borderRadius:6,border:`1px solid ${T.b1}`}}>
            {(config.holidays||[]).map((h,i)=>{
              const dt=parseDate(h); const label=dt.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
              return (
                <div key={h} style={{display:"flex",alignItems:"center",gap:4,background:T.holBg,border:`1px solid ${T.hol}40`,borderRadius:5,padding:"3px 8px"}}>
                  <span style={{fontSize:11,color:T.hol,fontWeight:500}}>🎉 {label}</span>
                  <button className="btn" onClick={()=>updateConfig(c=>({...c,holidays:c.holidays.filter((_,j)=>j!==i)}))}
                    style={{background:"transparent",color:T.t3,border:"none",fontSize:11,padding:"0 2px",cursor:"pointer",lineHeight:1}}>×</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Bulk input */}
        <div style={{background:T.bg0,borderRadius:6,border:`1px solid ${T.b1}`,padding:10}}>
          <div style={{fontSize:10,color:T.t3,marginBottom:6}}>Enter one or multiple dates — comma or newline separated</div>
          <textarea
            value={bulkInput}
            onChange={e=>{setBulkInput(e.target.value);setBulkPreview([]);setBulkError("");}}
            placeholder={"2026-03-25\n2026-04-14, 2026-04-15\n25/03/2026"}
            rows={3}
            style={{...inp,resize:"vertical",fontFamily:"'JetBrains Mono',monospace",fontSize:11,lineHeight:1.6}}
          />
          {bulkError&&<div style={{fontSize:11,color:T.p1,marginTop:4}}>{bulkError}</div>}

          {/* Preview */}
          {bulkPreview.length>0&&(
            <div style={{marginTop:8,padding:"8px 10px",background:T.bg1,borderRadius:5,border:`1px solid ${T.b2}`}}>
              <div style={{fontSize:10,color:T.t3,marginBottom:5}}>Preview — {bulkPreview.filter(p=>!p.isDupe).length} new, {bulkPreview.filter(p=>p.isDupe).length} already added</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {bulkPreview.map(({date,isDupe})=>{
                  const dt=parseDate(date); const label=dt.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
                  return (
                    <span key={date} style={{fontSize:11,padding:"2px 7px",borderRadius:4,
                      background:isDupe?T.bg2:T.holBg,
                      color:isDupe?T.t3:T.hol,
                      border:`1px solid ${isDupe?T.b1:T.hol+"40"}`,
                      textDecoration:isDupe?"line-through":"none",
                    }}>🎉 {label}{isDupe?" (exists)":""}</span>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{display:"flex",gap:6,marginTop:8}}>
            <button className="btn" onClick={handlePreview}
              style={{padding:"5px 14px",borderRadius:5,background:T.bg3,color:T.t1,border:`1px solid ${T.b2}`,fontSize:11,fontWeight:500}}>
              Preview
            </button>
            {bulkPreview.filter(p=>!p.isDupe).length>0&&(
              <button className="btn" onClick={handleAdd}
                style={{padding:"5px 14px",borderRadius:5,background:T.hol,color:"#fff",border:"none",fontSize:11,fontWeight:600}}>
                Add {bulkPreview.filter(p=>!p.isDupe).length} holiday{bulkPreview.filter(p=>!p.isDupe).length>1?"s":""}
              </button>
            )}
          </div>
        </div>
        <div style={{fontSize:10,color:T.t3,marginTop:6}}>Leave and L2 rota are managed via 📅 Team Calendar in the header</div>
      </div>
    </div>
  );
}

// ─── CAPACITY VIEW ────────────────────────────────────────────────────────────
function CapacityView({tasks, config, predictions}) {
  const sprintStart=config.sprintStart;
  const sprintEndStr=config.sprintEnd||"2026-03-31";
  const sprint=parseDate(sprintStart), sprintEnd=parseDate(sprintEndStr);
  let totalWorkDays=0;
  let cur=new Date(sprint);
  while(cur<=sprintEnd){if(!isWeekend(cur)&&!config.holidays.includes(fmtDate(cur)))totalWorkDays++;cur=addDays(cur,1);}

  const allPersons=[...new Set(tasks.flatMap(t=>Object.values(t.owners||{}).filter(Boolean)))];

  const personData=allPersons.map(person=>{
    const l2=buildL2Set(person,config), leave=buildLeaveSet(person,config);
    const l2Days=[...l2].filter(d=>d>=sprintStart&&d<=sprintEndStr).length;
    const leaveDays=[...leave].length;
    const available=totalWorkDays-l2Days-leaveDays;
    const effort=tasks.reduce((sum,t)=>{
      if(t.status==="Descoped"||t.status==="Released") return sum;
      const lanes=["ios","and","be","wc","qa"];
      return sum+lanes.reduce((s,l)=>t.owners?.[l]===person?s+Number(t.effort?.[l]||0):s,0);
    },0);
    const overloaded=effort>available;
    const pct=available>0?Math.round((effort/available)*100):0;
    // Predicted free date
    const myTaskEnds=tasks.filter(t=>Object.values(t.owners||{}).includes(person)&&t.status!=="Released").map(t=>taskPredictedEnd(t.id,predictions)).filter(Boolean);
    const freeDate=myTaskEnds.length>0?fmtDate(new Date(Math.max(...myTaskEnds.map(d=>d.getTime())))):null;
    return {person,effort,available,l2Days,leaveDays,overloaded,pct,freeDate};
  }).sort((a,b)=>b.pct-a.pct);

  return (
    <div style={{padding:"20px 24px"}} className="fade-in">
      <div style={{marginBottom:16,fontSize:10,color:T.t2,textTransform:"uppercase",letterSpacing:0.8,fontWeight:500}}>Team Capacity · {sprintStart} – {sprintEndStr} · {totalWorkDays} working days</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
        {personData.map(p=>{
          const color=TEAM[p.person]?.bar||T.acc;
          const utilColor=p.overloaded?T.p1:p.pct>80?T.p2:T.p3;
          return (
            <div key={p.person} style={{background:T.bg1,border:`1px solid ${p.overloaded?T.sBlk.border:T.b1}`,borderRadius:8,padding:16,position:"relative"}}>
              {p.overloaded&&<div style={{position:"absolute",top:0,right:0,background:T.sBlk.bg,color:T.p1,fontSize:9,fontWeight:500,padding:"3px 8px",borderRadius:"0 8px 0 5px",border:`1px solid ${T.sBlk.border}`,borderTop:"none",borderRight:"none"}}>overloaded</div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <div style={{width:7,height:7,background:color,borderRadius:"50%",opacity:0.8}}/>
                  <span style={{fontSize:12,fontWeight:500,color:T.t0}}>{p.person}</span>
                </div>
                <span style={{fontSize:18,fontWeight:600,color:utilColor,fontFamily:"'JetBrains Mono',monospace"}}>{p.pct}%</span>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{height:3,background:T.b1,borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.min(p.pct,100)}%`,background:utilColor,borderRadius:2,opacity:0.6}}/>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5}}>
                {[["Effort",`${p.effort}d`,T.t1],["Available",`${p.available}d`,T.t1],["L2/Leave",`${p.l2Days+p.leaveDays}d`,T.p2]].map(([l,v,c])=>(
                  <div key={l} style={{background:T.bg0,borderRadius:4,padding:"5px 7px"}}>
                    <div style={{fontSize:9,color:T.t3,marginBottom:2,textTransform:"uppercase",letterSpacing:0.4}}>{l}</div>
                    <div style={{fontSize:12,color:c,fontWeight:500,fontFamily:"'JetBrains Mono',monospace"}}>{v}</div>
                  </div>
                ))}
              </div>
              {p.freeDate&&(
                <div style={{marginTop:8,fontSize:10,color:T.t2}}>
                  Est. free: <span style={{fontFamily:"'JetBrains Mono',monospace",color:p.freeDate>sprintEndStr?T.p1:T.p3,fontWeight:500}}>{p.freeDate}</span>
                  {p.freeDate>sprintEndStr&&<span style={{color:T.p1}}> ⚠ overrun</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── INSIGHTS VIEW ────────────────────────────────────────────────────────────
function InsightsView({tasks, config, predictions, velocity}) {
  const today=fmtDate(new Date());
  const sprintEnd=config.sprintEnd||"2026-03-31";

  const ghostTasks=tasks.filter(t=>t.plannedStart&&t.plannedStart<today&&!t.actualStart&&t.status!=="Released"&&t.status!=="In Dev");
  const delayedTasks=tasks.filter(t=>t.plannedEnd&&t.actualEnd&&t.actualEnd>t.plannedEnd).map(t=>({...t,slipDays:Math.round((parseDate(t.actualEnd)-parseDate(t.plannedEnd))/86400000)})).sort((a,b)=>b.slipDays-a.slipDays);
  const isBufferTask=t=>t.name?.toLowerCase().includes("buffer");
  const atRisk=tasks.filter(t=>{
    if(t.status==="Released"||t.status==="Descoped") return false;
    if(isBufferTask(t)) return false; // buffer tasks don't count as at-risk
    const pe=taskPredictedEnd(t.id,predictions);
    return pe&&fmtDate(pe)>sprintEnd;
  }).map(t=>({...t,predictedEnd:taskPredictedEnd(t.id,predictions)}));
  const blocked=tasks.filter(t=>t.status==="Blocked");
  const released=tasks.filter(t=>t.status==="Released").length;
  const deliveryRate=tasks.length?Math.round((released/tasks.length)*100):0;
  const avgSlip=delayedTasks.length?Math.round(delayedTasks.reduce((s,t)=>s+t.slipDays,0)/delayedTasks.length):0;

  // Velocity table
  const velPersons=Object.entries(velocity).filter(([,v])=>v.count>=1);
  const taskDelays = config.taskDelays||[];

  // Cascade: tasks whose predicted start shifted because of dependency delay
  // Tasks at risk due to dependency chain (not their own delay)
  const cascadedTasks=tasks.filter(t=>{
    if(!(t.dependsOn?.length>0)) return false;
    if(t.status==="Released"||t.status==="Descoped") return false;
    const pe=taskPredictedEnd(t.id,predictions);
    if(!pe||fmtDate(pe)<=sprintEnd) return false;
    // Only include if the dependency itself is also late
    return t.dependsOn.some(depId=>{
      const depPe=taskPredictedEnd(depId,predictions);
      return depPe&&fmtDate(depPe)>sprintEnd;
    });
  });

  const Section=({title,count,color,children})=>(
    <div style={{background:T.bg1,border:`1px solid ${T.b1}`,borderRadius:8,padding:16,marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <div style={{fontSize:10,color:color||T.t2,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8}}>{title}</div>
        {count!==undefined&&<span style={{fontSize:11,fontWeight:600,color:count>0?color:T.t3,background:count>0?`${color}18`:T.bg2,padding:"1px 7px",borderRadius:10,border:`1px solid ${count>0?`${color}40`:T.b1}`}}>{count}</span>}
      </div>
      {children}
    </div>
  );

  const TaskRow=({t,extra})=>{
    const pc=PRIORITY_COLOR[t.priority]||PRIORITY_COLOR["P3"];
    return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.b0}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
          <span style={{fontSize:10,color:T.t3,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>#{t.id}</span>
          <span style={{fontSize:12,color:T.t0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</span>
          <span className="tag" style={{background:pc.bgCard,color:pc.bg,border:`1px solid ${pc.bg}30`,flexShrink:0}}>{t.priority}</span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0,marginLeft:8}}>{extra}</div>
      </div>
    );
  };

  return (
    <div style={{padding:"20px 24px",maxWidth:1100,margin:"0 auto"}} className="fade-in">
      {/* Summary */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:18}}>
        {[
          {label:"Delivery Rate",val:`${deliveryRate}%`,color:deliveryRate>60?T.p3:deliveryRate>30?T.p2:T.p1},
          {label:"At Risk",val:atRisk.length,color:atRisk.length>0?T.p1:T.p3},
          {label:"Delayed Items",val:delayedTasks.length,color:delayedTasks.length>0?T.p1:T.p3},
          {label:"Avg Slip",val:`${avgSlip}d`,color:avgSlip>3?T.p1:avgSlip>0?T.p2:T.p3},
          {label:"Blocked Now",val:blocked.length,color:blocked.length>0?T.p1:T.p3},
        ].map(s=>(
          <div key={s.label} style={{background:T.bg1,border:`1px solid ${T.b1}`,borderRadius:8,padding:"12px 14px"}}>
            <div style={{fontSize:9,color:T.t2,textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>{s.label}</div>
            <div style={{fontSize:22,fontWeight:600,color:s.color,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div>
          <Section title="At risk — predicted past Mar 31" count={atRisk.length} color={T.p1}>
            {atRisk.length===0
              ?<div style={{fontSize:12,color:T.t3,fontStyle:"italic"}}>All within sprint</div>
              :atRisk.map(t=>(
                <TaskRow key={t.id} t={t} extra={[
                  <span key="pe" style={{fontSize:10,color:T.p1,fontFamily:"'JetBrains Mono',monospace"}}>{fmtDate(t.predictedEnd).slice(5)}</span>,
                  <span key="st" className="tag" style={{background:STATUS_COLOR[t.status]?.bg,color:STATUS_COLOR[t.status]?.text,border:`1px solid ${STATUS_COLOR[t.status]?.border}`}}>{t.status}</span>
                ]}/>
              ))
            }
          </Section>
          {cascadedTasks.length>0&&(
            <Section title="Cascade risk — blocked by late dependency" count={cascadedTasks.length} color={T.p1}>
              {cascadedTasks.map(t=>{
                const pe=taskPredictedEnd(t.id,predictions);
                const blockingIds=t.dependsOn.filter(depId=>{const dpe=taskPredictedEnd(depId,predictions);return dpe&&fmtDate(dpe)>sprintEnd;});
                const blockingNames=blockingIds.map(id=>{const bt=tasks.find(x=>x.id===id);return bt?`#${id} ${bt.name.slice(0,18)}`:null;}).filter(Boolean).join(", ");
                return (
                  <TaskRow key={t.id} t={t} extra={[
                    <span key="pe" style={{fontSize:10,color:T.p1,fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>{pe?fmtDate(pe).slice(5):""}</span>,
                    <span key="bl" style={{fontSize:10,color:T.t2,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={`Blocked by: ${blockingNames}`}>← {blockingNames.slice(0,22)}</span>
                  ]}/>
                );
              })}
            </Section>
          )}
          <Section title="Ghost tasks — planned start passed, not started" count={ghostTasks.length} color={T.p2}>
            {ghostTasks.length===0
              ?<div style={{fontSize:12,color:T.t3,fontStyle:"italic"}}>All on track</div>
              :ghostTasks.map(t=>(
                <TaskRow key={t.id} t={t} extra={[
                  <span key="ps" style={{fontSize:10,color:T.p2,fontFamily:"'JetBrains Mono',monospace"}}>planned {t.plannedStart?.slice(5)}</span>
                ]}/>
              ))
            }
          </Section>
        </div>
        <div>
          <Section title="Delay patterns — for post-mortem" count={delayedTasks.length} color={T.p1}>
            {delayedTasks.length===0
              ?<div style={{fontSize:12,color:T.t3,fontStyle:"italic"}}>No delays recorded yet — fill in actual dates</div>
              :delayedTasks.map(t=>(
                <TaskRow key={t.id} t={t} extra={[
                  <span key="slip" style={{fontSize:11,fontWeight:600,color:T.p1,background:T.p1bg,padding:"2px 7px",borderRadius:4,fontFamily:"'JetBrains Mono',monospace"}}>+{t.slipDays}d</span>,
                  <div key="dates" style={{fontSize:10,color:T.t2,textAlign:"right",lineHeight:1.4}}>
                    <div>plan {t.plannedEnd?.slice(5)}</div>
                    <div style={{color:T.p1}}>actual {t.actualEnd?.slice(5)}</div>
                  </div>
                ]}/>
              ))
            }
          </Section>
          <Section title="Currently blocked" count={blocked.length} color={T.p1}>
            {blocked.length===0
              ?<div style={{fontSize:12,color:T.t3,fontStyle:"italic"}}>No blockers</div>
              :blocked.map(t=>(
                <TaskRow key={t.id} t={t} extra={[
                  <span key="own" style={{fontSize:10,color:T.t2}}>{Object.values(t.owners||{}).filter(Boolean).join(", ")}</span>
                ]}/>
              ))
            }
          </Section>
        </div>
      </div>

      {/* Velocity table */}
      {/* Task delay log */}
      {taskDelays.length>0&&(
        <Section title="Logged delays — sprint interference log" count={taskDelays.length} color={T.p1}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr>
                {["Date","Task","Extra days","Reason"].map(h=>(
                  <th key={h} style={{padding:"6px 10px",fontSize:9,color:T.t2,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,textAlign:"left",borderBottom:`1px solid ${T.b1}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {taskDelays.map((d,i)=>{
                const task=tasks.find(t=>t.id===d.taskId);
                return (
                  <tr key={i} style={{background:i%2===0?T.bg0:T.bg1}}>
                    <td style={{padding:"7px 10px",fontSize:11,color:T.t2,fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>{d.date?.slice(5)}</td>
                    <td style={{padding:"7px 10px"}}>
                      <span style={{fontSize:10,color:T.t3,fontFamily:"'JetBrains Mono',monospace",marginRight:5}}>#{d.taskId}</span>
                      <span style={{fontSize:12,color:T.t0}}>{task?.name?.slice(0,36)||"Unknown"}</span>
                    </td>
                    <td style={{padding:"7px 10px"}}>
                      <span style={{fontSize:12,fontWeight:600,color:T.p1,fontFamily:"'JetBrains Mono',monospace"}}>+{d.effortDelta}d</span>
                    </td>
                    <td style={{padding:"7px 10px",fontSize:11,color:T.t2}}>{d.reason||<span style={{color:T.t3,fontStyle:"italic"}}>No reason</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {velPersons.length>0&&(
        <Section title="Velocity — per-person historical slip (for post-mortem)" color={T.p2}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr>
                {["Person","Tasks with data","Avg slip (days)","Signal"].map(h=>(
                  <th key={h} style={{padding:"6px 10px",fontSize:9,color:T.t2,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,textAlign:"left",borderBottom:`1px solid ${T.b1}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {velPersons.sort((a,b)=>b[1].avgSlip-a[1].avgSlip).map(([p,v],i)=>{
                const color=TEAM[p]?.bar||T.acc;
                const signalColor=v.avgSlip>5?T.p1:v.avgSlip>2?T.p2:T.p3;
                const signal=v.avgSlip>5?"Consistently late":v.avgSlip>2?"Some slippage":v.avgSlip>0?"Minor drift":"On time";
                return (
                  <tr key={p} style={{background:i%2===0?T.bg0:T.bg1}}>
                    <td style={{padding:"8px 10px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:color,opacity:0.8}}/>
                        <span style={{fontSize:12,color:T.t0,fontWeight:500}}>{p}</span>
                      </div>
                    </td>
                    <td style={{padding:"8px 10px",fontSize:12,color:T.t1,fontFamily:"'JetBrains Mono',monospace"}}>{v.count}</td>
                    <td style={{padding:"8px 10px"}}>
                      <span style={{fontSize:12,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",color:signalColor}}>{v.avgSlip>0?"+":""}{v.avgSlip}d</span>
                    </td>
                    <td style={{padding:"8px 10px"}}>
                      <span className="tag" style={{background:`${signalColor}15`,color:signalColor,border:`1px solid ${signalColor}40`}}>{signal}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{marginTop:10,fontSize:10,color:T.t3}}>Velocity data builds automatically as you fill in planned + actual end dates in Tasks tab. Warnings (⚠) appear next to owner names when avg slip ≥ 3 days across ≥ 2 tasks.</div>
        </Section>
      )}
    </div>
  );
}
