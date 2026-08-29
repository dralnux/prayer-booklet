const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const favorites=JSON.parse(localStorage.getItem("catholicFavorites")||"[]");
const prayers=[...document.querySelectorAll(".prayer-card")].map(c=>({id:c.dataset.id,title:c.dataset.title,category:c.dataset.category,text:c.querySelector("p:last-child").innerText}));

$("#date").textContent=new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});

function saveFav(){localStorage.setItem("catholicFavorites",JSON.stringify(favorites));renderFavorites();}
function renderFavorites(){
 const box=$("#favoriteList"); box.innerHTML="";
 const list=prayers.filter(p=>favorites.includes(p.id));
 box.classList.toggle("empty",!list.length);
 if(!list.length){box.innerHTML="<p>No favorites yet. Tap ♡ on a prayer to save it.</p>";return;}
 list.forEach(p=>{const a=document.createElement("article");a.className="card";a.innerHTML=`<div class="card-top"><span class="tag">${p.category}</span><button class="favorite active">♥</button></div><h3>${p.title}</h3><p>${p.text}</p>`;a.querySelector("button").onclick=()=>{favorites.splice(favorites.indexOf(p.id),1);saveFav();syncFavs()};box.appendChild(a)})
}
function syncFavs(){$$(".prayer-card").forEach(c=>{const b=c.querySelector(".favorite");b.classList.toggle("active",favorites.includes(c.dataset.id));b.textContent=favorites.includes(c.dataset.id)?"♥":"♡"})}
$$(".favorite").forEach(b=>b.onclick=e=>{const c=e.target.closest(".prayer-card"),id=c.dataset.id;const i=favorites.indexOf(id);i<0?favorites.push(id):favorites.splice(i,1);saveFav();syncFavs()});
renderFavorites();syncFavs();

const savedTheme=localStorage.getItem("catholicTheme"); if(savedTheme==="dark")document.body.classList.add("dark");
$("#themeBtn").onclick=()=>{document.body.classList.toggle("dark");localStorage.setItem("catholicTheme",document.body.classList.contains("dark")?"dark":"light");$("#themeBtn").textContent=document.body.classList.contains("dark")?"☀️":"🌙"};

$$(".category").forEach(btn=>btn.onclick=()=>{const cat=btn.dataset.category;const box=$("#categoryResults");box.innerHTML=`<div class="card"><h3>${btn.innerText}</h3><p>Category selected. Add or connect prayers tagged <b>${cat}</b> to populate this library.</p><a href="prayers.html">Browse Prayer Library →</a></div>`;box.scrollIntoView({behavior:"smooth",block:"center"})});

let reminder=JSON.parse(localStorage.getItem("catholicReminder")||"null");
function showReminder(){ $("#reminderStatus").textContent=reminder?`Reminder saved for ${reminder.time} — ${reminder.prayer}.`:"No reminder saved."; }
$("#saveReminder").onclick=async()=>{if("Notification"in window && Notification.permission==="default")await Notification.requestPermission();reminder={time:$("#reminderTime").value,prayer:$("#reminderPrayer").value};localStorage.setItem("catholicReminder",JSON.stringify(reminder));showReminder()};
$("#clearReminder").onclick=()=>{reminder=null;localStorage.removeItem("catholicReminder");showReminder()}; showReminder();
setInterval(()=>{if(!reminder)return;const now=new Date(),t=now.toTimeString().slice(0,5);const stamp=now.toISOString().slice(0,10);if(t===reminder.time&&localStorage.getItem("lastReminder")!==stamp){localStorage.setItem("lastReminder",stamp);if("Notification"in window&&Notification.permission==="granted")new Notification("Catholic Prayer Reminder",{body:"Time for "+reminder.prayer+"."});}},30000);