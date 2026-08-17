import { firebaseConfig, appName, enableIpLogging } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp,
  onSnapshot, increment, updateDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);
let currentRoom = null;
let currentRoomCode = null;
let currentUser = null;
let currentQuestionId = null;
let unsubscribeRoom = null;

document.title = `${appName} — Student`;

async function ensureAuth(){
  if (auth.currentUser) return auth.currentUser;
  await signInAnonymously(auth);
  return new Promise(resolve => {
    const off = onAuthStateChanged(auth, u => { if(u){ off(); resolve(u); } });
  });
}

function normalizeCode(v){ return v.trim().toUpperCase().replace(/[^A-Z0-9]/g,""); }

function isActive(room){
  const exp = room.expiresAt?.toDate?.();
  return room.active === true && exp && exp.getTime() > Date.now();
}

function setMsg(el, text, type=""){
  el.className = type ? type : "";
  el.textContent = text;
}

async function joinRoom(){
  const code = normalizeCode($("roomCode").value);
  if(!code) return setMsg($("joinMsg"),"Enter a room code.","error");
  $("joinBtn").disabled = true;
  setMsg($("joinMsg"),"Joining…","muted");
  try{
    currentUser = await ensureAuth();
    const ref = doc(db,"rooms",code);
    const snap = await getDoc(ref);
    if(!snap.exists()) throw new Error("Room not found.");
    const room = snap.data();
    if(!isActive(room)) throw new Error("This room is closed or expired.");

    currentRoomCode = code;
    currentRoom = room;
    $("joinCard").classList.add("hidden");
    $("roomView").classList.remove("hidden");
    $("roomCodeView").textContent = code;
    $("roomTitle").textContent = room.title || "Class room";
    $("roomExpiry").textContent = `Expires ${room.expiresAt.toDate().toLocaleString()}`;
    $("privacyNotice").classList.toggle("hidden", !(room.attendanceEnabled && room.ipLoggingEnabled));
    $("checkinCard").classList.toggle("hidden", !room.attendanceEnabled);
    watchRoom(ref);
  }catch(e){
    setMsg($("joinMsg"),e.message || "Unable to join.","error");
  }finally{
    $("joinBtn").disabled = false;
  }
}

function watchRoom(ref){
  if(unsubscribeRoom) unsubscribeRoom();
  unsubscribeRoom = onSnapshot(ref, snap => {
    if(!snap.exists()) return closeRoom("Room was removed.");
    currentRoom = snap.data();
    if(!isActive(currentRoom)) return closeRoom("This room has closed or expired.");
    currentQuestionId = currentRoom.currentQuestionId || null;
    $("questionText").textContent = currentRoom.currentQuestion || "Waiting for question…";
    $("roomExpiry").textContent = `Expires ${currentRoom.expiresAt.toDate().toLocaleString()}`;
  }, () => closeRoom("Connection to the room was lost."));
}

function closeRoom(msg){
  $("roomStatus").textContent = "CLOSED";
  $("roomStatus").className = "pill closed";
  $("submitBtn").disabled = true;
  $("checkinBtn").disabled = true;
  setMsg($("submitMsg"),msg,"notice");
}

async function getPublicIp(){
  if(!enableIpLogging || !currentRoom?.ipLoggingEnabled) return null;
  try{
    const controller = new AbortController();
    const t = setTimeout(()=>controller.abort(),3500);
    const r = await fetch("https://api.ipify.org?format=json",{signal:controller.signal});
    clearTimeout(t);
    if(!r.ok) return null;
    const data = await r.json();
    return data.ip || null;
  }catch(_){ return null; }
}

async function checkIn(){
  const name = $("studentName").value.trim();
  const id4 = $("studentId4").value.trim();
  if(!name) return setMsg($("checkinMsg"),"Enter your name.","error");
  if(id4 && !/^\d{4}$/.test(id4)) return setMsg($("checkinMsg"),"Use exactly 4 digits or leave it blank.","error");
  if(!currentRoom || !isActive(currentRoom)) return setMsg($("checkinMsg"),"Room is closed.","error");

  $("checkinBtn").disabled = true;
  setMsg($("checkinMsg"),"Checking in…","muted");
  try{
    currentUser = await ensureAuth();
    const attendanceRef = doc(db,"rooms",currentRoomCode,"attendance",currentUser.uid);
    const existing = await getDoc(attendanceRef);
    if(existing.exists()){
      setMsg($("checkinMsg"),"You are already checked in on this device.","success");
      return;
    }
    const ip = await getPublicIp();
    await setDoc(attendanceRef,{
      uid: currentUser.uid,
      displayName: name,
      studentIdLast4: id4 || "",
      publicIp: ip,
      checkedInAt: serverTimestamp(),
      userAgent: navigator.userAgent.slice(0,300),
      responseCount: 0
    });
    localStorage.setItem(`cp_name_${currentRoomCode}`, name);
    localStorage.setItem(`cp_id4_${currentRoomCode}`, id4);
    setMsg($("checkinMsg"), ip ? `Checked in. IP logged: ${ip}` : "Checked in. IP lookup unavailable.","success");
  }catch(e){
    setMsg($("checkinMsg"),e.message || "Check-in failed.","error");
  }finally{
    $("checkinBtn").disabled = false;
  }
}

async function submitResponse(){
  const text = $("responseText").value.trim();
  if(!text) return setMsg($("submitMsg"),"Type a response first.","error");
  if(!currentQuestionId) return setMsg($("submitMsg"),"There is no active question yet.","error");
  if(!currentRoom || !isActive(currentRoom)) return setMsg($("submitMsg"),"Room is closed.","error");

  $("submitBtn").disabled = true;
  setMsg($("submitMsg"),"Submitting…","muted");
  try{
    currentUser = await ensureAuth();

    // If attendance is enabled, require an existing check-in.
    if(currentRoom.attendanceEnabled){
      const aRef = doc(db,"rooms",currentRoomCode,"attendance",currentUser.uid);
      const aSnap = await getDoc(aRef);
      if(!aSnap.exists()) throw new Error("Please check in before submitting.");
    }

    await addDoc(collection(db,"rooms",currentRoomCode,"responses"),{
      uid: currentUser.uid,
      questionId: currentQuestionId,
      question: currentRoom.currentQuestion || "",
      text,
      createdAt: serverTimestamp()
    });

    if(currentRoom.attendanceEnabled){
      await updateDoc(doc(db,"rooms",currentRoomCode,"attendance",currentUser.uid),{
        responseCount: increment(1)
      });
    }

    $("responseText").value = "";
    $("charCount").textContent = "0 / 1500";
    setMsg($("submitMsg"),"Response submitted.","success");
  }catch(e){
    setMsg($("submitMsg"),e.message || "Submission failed.","error");
  }finally{
    $("submitBtn").disabled = false;
  }
}

$("joinBtn").addEventListener("click", joinRoom);
$("roomCode").addEventListener("keydown", e => { if(e.key==="Enter") joinRoom(); });
$("checkinBtn").addEventListener("click", checkIn);
$("submitBtn").addEventListener("click", submitResponse);
$("responseText").addEventListener("input", e => $("charCount").textContent = `${e.target.value.length} / 1500`);

const params = new URLSearchParams(location.search);
const codeParam = normalizeCode(params.get("room") || "");
if(codeParam){
  $("roomCode").value = codeParam;
  joinRoom();
}
