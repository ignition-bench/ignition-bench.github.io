"use strict";

function saveTextFile(filename, text, mime){
  const blob = new Blob([text], {type: mime || "application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(()=> URL.revokeObjectURL(a.href), 4000);
}
function saveDataUrl(filename, url){
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
}
function readTextFile(file, onText){
  const reader = new FileReader();
  reader.onload = ()=> onText(reader.result);
  reader.readAsText(file);
}
