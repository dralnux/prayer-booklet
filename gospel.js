// Daily Gospel data. Add only text you have permission/licensing to publish.
const gospelReadings={
 "2026-08-22":{reference:"Today's Gospel",text:"Add today's Gospel reading here or connect a properly licensed daily-reading API."}
};
const key=new Date().toISOString().slice(0,10),r=gospelReadings[key];
if(r){document.getElementById("gospelRef").textContent=r.reference;document.getElementById("gospelText").textContent=r.text;}