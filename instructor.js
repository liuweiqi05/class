import { firebaseConfig, appName, appCheckSiteKey } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider, getToken } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app-check.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, query,
  orderBy, onSnapshot, serverTimestamp, Timestamp, getDocs
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const app = initializeApp(firebaseConfig);

// Initialize Firebase App Check before creating Auth/Firestore clients.
// We explicitly fetch a token once so the first Firestore request is not sent
// before App Check is ready.
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(appCheckSiteKey),
  isTokenAutoRefreshEnabled: true
});

async function ensureAppCheckReady() {
  try {
    const result = await getToken(appCheck, false);
    console.info("Firebase App Check ready.", {
      tokenPresent: Boolean(result?.token)
    });
    return true;
  } catch (error) {
    console.error("Firebase App Check token request failed:", error);
    window.__classPulseAppCheckError = {
      code: error?.code || "",
      message: error?.message || String(error),
      name: error?.name || "",
      stack: error?.stack || ""
    };
    return false;
  }
}

const appCheckReady = await ensureAppCheckReady();
if (!appCheckReady) {
  console.warn("App Check did not return a valid token before Firebase clients initialized.");
}
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const $ = id => document.getElementById(id);

let user = null, roomCode = null, roomUnsub = null, attendanceUnsub = null, responsesUnsub = null;
let attendanceRows = [], responseRows = [];

document.title = `${appName} — Instructor`;

const appCheckStatus = $("appCheckStatus");
if (appCheckReady) {
  appCheckStatus.className = "success";
  appCheckStatus.textContent = "Security check active.";
  setTimeout(() => appCheckStatus.classList.add("hidden"), 1800);
} else {
  appCheckStatus.className = "error";
  const e = window.__classPulseAppCheckError || {};
  appCheckStatus.innerHTML =
    "<strong>Security check failed.</strong><br>" +
    "Code: " + (e.code || "(none)") + "<br>" +
    "Message: " + (e.message || "(no message)") + "<br>" +
    "<small>This diagnostic does not display your reCAPTCHA secret key.</small>";
}


function msg(el,text,type=""){ el.className = type; el.textContent = text; }
function randomCode(){
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map(n=>alphabet[n % alphabet.length]).join("");
}
function csvEscape(v){
  const s = String(v ?? "");
  return `"${s.replaceAll('"','""')}"`;
}
function downloadCsv(filename, rows){
  const csv = rows.map(r=>r.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function isInstructor(u){
  if(!u) return false;
  const snap = await getDoc(doc(db,"instructors",u.uid));
  return snap.exists() && snap.data().enabled === true;
}

$("signInBtn").onclick = async () => {
  try{ await signInWithPopup(auth,provider); }
  catch(e){ msg($("authMsg"),e.message,"error"); }
};
$("signOutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, async u => {
  user=u;
  if(!u){
    $("authLabel").textContent="Not signed in";
    $("signInBtn").classList.remove("hidden"); $("signOutBtn").classList.add("hidden");
    $("appArea").classList.add("hidden");
    return;
  }
  $("authLabel").textContent=u.email || u.displayName || "Signed in";
  $("signInBtn").classList.add("hidden"); $("signOutBtn").classList.remove("hidden");
  try{
    const ok=await isInstructor(u);
    if(!ok){
      $("appArea").classList.add("hidden");
      msg($("authMsg"),
        `Signed in, but this account is not authorized as an instructor. In Firebase Firestore, create instructors/${u.uid} with enabled: true.`,
        "notice");
      return;
    }
    msg($("authMsg"),"","");
    $("appArea").classList.remove("hidden");
  }catch(e){ msg($("authMsg"),e.message,"error"); }
});

async function createRoom(){
  $("createRoomBtn").disabled=true;
  try{
    if(!user || !(await isInstructor(user))) throw new Error("Instructor authorization required.");
    const title=$("roomTitleInput").value.trim() || "Class room";
    const minutes=Number($("duration").value);
    const attendanceEnabled=$("attendanceMode").value==="on";
    let code, ref, exists=true;
    for(let i=0;i<8 && exists;i++){
      code=randomCode(); ref=doc(db,"rooms",code); exists=(await getDoc(ref)).exists();
    }
    if(exists) throw new Error("Could not generate a unique room code.");
    const expiresAt=Timestamp.fromMillis(Date.now()+minutes*60_000);
    await setDoc(ref,{
      code,title,ownerUid:user.uid,active:true,
      attendanceEnabled,
      ipLoggingEnabled:attendanceEnabled,
      createdAt:serverTimestamp(),expiresAt,
      currentQuestion:"",currentQuestionId:null
    });
    openRoom(code);
    msg($("createMsg"),"Room created.","success");
  }catch(e){ msg($("createMsg"),e.message,"error"); }
  finally{$("createRoomBtn").disabled=false;}
}

function studentUrl(code){
  const base = new URL("index.html", location.href);
  base.search = "";
  base.searchParams.set("room",code);
  return base.toString();
}

function renderQr(url){
  const box=$("qrcode"); box.innerHTML="";
  // qrcodejs is loaded in instructor.html
  if(window.QRCode){
    new QRCode(box,{text:url,width:220,height:220,correctLevel:QRCode.CorrectLevel.M});
  }else{
    box.textContent="QR library did not load. Use Copy student link.";
  }
}

function openRoom(code){
  roomCode=code;
  $("roomPanel").classList.remove("hidden");
  $("codeView").textContent=code;
  renderQr(studentUrl(code));

  [roomUnsub,attendanceUnsub,responsesUnsub].forEach(fn=>{if(fn)fn();});

  roomUnsub=onSnapshot(doc(db,"rooms",code),snap=>{
    if(!snap.exists()) return;
    const r=snap.data();
    $("expiresView").textContent=`Expires: ${r.expiresAt?.toDate?.().toLocaleString() || "—"} · ${r.active ? "LIVE":"CLOSED"}`;
    if(r.currentQuestion) $("questionInput").value=r.currentQuestion;
  });

  attendanceUnsub=onSnapshot(query(collection(db,"rooms",code,"attendance"),orderBy("checkedInAt","asc")),snap=>{
    attendanceRows=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderAttendance();
  });

  responsesUnsub=onSnapshot(query(collection(db,"rooms",code,"responses"),orderBy("createdAt","desc")),snap=>{
    responseRows=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderResponses();
  });
}

function renderAttendance(){
  $("attendanceCount").textContent=attendanceRows.length;
  const ips=new Set(attendanceRows.map(x=>x.publicIp).filter(Boolean));
  $("uniqueIpCount").textContent=ips.size;
  $("attendanceBody").innerHTML=attendanceRows.map(r=>`
    <tr>
      <td>${escapeHtml(r.displayName || "")}</td>
      <td>${escapeHtml(r.studentIdLast4 || "")}</td>
      <td>${r.checkedInAt?.toDate?.().toLocaleString() || "Pending…"}</td>
      <td><code>${escapeHtml(r.publicIp || "Unavailable")}</code></td>
      <td>${Number(r.responseCount || 0)}</td>
    </tr>`).join("");
}
function renderResponses(){
  $("responseCount").textContent=responseRows.length;
  $("responsesList").innerHTML=responseRows.length ? responseRows.map(r=>`
    <div class="response">
      <div>${escapeHtml(r.text || "")}</div>
      <div class="meta">${r.createdAt?.toDate?.().toLocaleString() || "Pending…"} · ${escapeHtml(r.question || "")}</div>
    </div>`).join("") : `<p class="muted">No responses yet.</p>`;
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

async function publishQuestion(){
  const q=$("questionInput").value.trim();
  if(!q) return msg($("questionMsg"),"Enter a question.","error");
  try{
    const id=crypto.randomUUID();
    await updateDoc(doc(db,"rooms",roomCode),{
      currentQuestion:q,currentQuestionId:id,questionUpdatedAt:serverTimestamp()
    });
    msg($("questionMsg"),"Published. Student screens update automatically.","success");
  }catch(e){msg($("questionMsg"),e.message,"error");}
}

async function closeRoom(){
  if(!roomCode) return;
  if(!confirm("Close this room now? Students will no longer be able to check in or submit.")) return;
  try{
    await updateDoc(doc(db,"rooms",roomCode),{active:false,closedAt:serverTimestamp()});
  }catch(e){alert(e.message);}
}

$("createRoomBtn").onclick=createRoom;
$("publishQuestionBtn").onclick=publishQuestion;
$("closeRoomBtn").onclick=closeRoom;
$("copyLinkBtn").onclick=async()=>{await navigator.clipboard.writeText(studentUrl(roomCode)); $("copyLinkBtn").textContent="Copied"; setTimeout(()=>$("copyLinkBtn").textContent="Copy student link",1200);};

$("exportAttendanceBtn").onclick=()=>{
  downloadCsv(`attendance-${roomCode}.csv`,[
    ["Name","Student ID last 4","Check-in time","Public IP","Responses","Anonymous UID"],
    ...attendanceRows.map(r=>[
      r.displayName||"",r.studentIdLast4||"",
      r.checkedInAt?.toDate?.().toISOString()||"",
      r.publicIp||"",r.responseCount||0,r.uid||r.id
    ])
  ]);
};
$("exportResponsesBtn").onclick=()=>{
  downloadCsv(`responses-${roomCode}.csv`,[
    ["Time","Question ID","Question","Response","Anonymous UID"],
    ...responseRows.map(r=>[
      r.createdAt?.toDate?.().toISOString()||"",
      r.questionId||"",r.question||"",r.text||"",r.uid||""
    ])
  ]);
};
