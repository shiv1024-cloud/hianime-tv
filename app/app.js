(function(){'use strict';
var BACKEND=localStorage.getItem("miruroBackend")||"https://public-miruro-consumet-api.vercel.app";
var USE_PROXY=true;
var PROXY="https://corsproxy.io/?url=";
var statusEl=document.getElementById("status"),screens=document.querySelectorAll(".screen"),currentAnime=null,currentScreen="home",previousScreen="home",focusedEl=null;

function status(s){statusEl.textContent=s}
function focusEl(el){
  if(!el||el.disabled)return;
  if(focusedEl&&focusedEl!==el)focusedEl.classList.remove("remote-focus");
  focusedEl=el;
  try{el.focus({preventScroll:false})}catch(e){try{el.focus()}catch(ignore){}}
  el.classList.add("remote-focus");
  try{el.scrollIntoView({block:"nearest",inline:"nearest"})}catch(e){}
}
function focusFirst(id){
  var el=document.querySelector("#"+id+" .focusable");
  if(el)focusEl(el); else focusedEl=null;
}
function show(id){
  if(id!==currentScreen){previousScreen=currentScreen;currentScreen=id}
  for(var i=0;i<screens.length;i++)screens[i].classList.remove("active");
  var screen=document.getElementById(id);
  if(screen)screen.classList.add("active");
  setTimeout(function(){focusFirst(id)},0);
}
function esc(s){return String(s||"").replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function api(path){var u=BACKEND.replace(/\/$/,"")+path;var target=USE_PROXY?PROXY+encodeURIComponent(u):u;return fetch(target,{headers:{"Accept":"application/json"}}).then(function(r){if(!r.ok)throw Error("HTTP "+r.status);return r.json()})}
function id(a){return a.id||""}
function title(a){var t=a.title;if(typeof t==="string")return t;return t&&(t.english||t.romaji||t.userPreferred||t.native)||a.name||"Unknown"}
function image(a){return a.image||a.cover||a.poster||a.thumbnail||(a.coverImage&&(a.coverImage.extraLarge||a.coverImage.large||a.coverImage.medium))}
function list(d){return Array.isArray(d)?d:(d.results||d.data||d.animes||d.items||[])}
function cards(items,target){
  var el=document.getElementById(target);el.innerHTML="";
  if(!items.length){el.innerHTML='<div class="player-message">No results found.</div>';return}
  items.slice(0,30).forEach(function(a){
    var b=document.createElement("button");
    b.className="card focusable";
    b.innerHTML='<img src="'+esc(image(a)||"https://via.placeholder.com/300x420?text=Anime")+'"><div class="name">'+esc(title(a))+'</div><div class="meta">'+esc((a.releaseDate||"")+" "+(a.subOrDub||""))+"</div>";
    b.onclick=function(){openAnime(a)};
    el.appendChild(b)
  });
  if(document.getElementById(currentScreen)===document.getElementById(target).parentElement)focusFirst(currentScreen);
}
function search(q){status("Searching…");api("/anime/gogoanime/"+encodeURIComponent(q)+"?page=1").then(function(d){cards(list(d),"results");status("Ready")}).catch(function(e){status("Search error");document.getElementById("results").innerHTML='<div class="player-message">Search failed: '+esc(e.message)+"</div>"})}
function openAnime(a){
  currentAnime=a;show("details");
  document.getElementById("detailsBox").innerHTML='<div class="title">'+esc(title(a))+'</div><div class="desc">Loading information…</div>';
  document.getElementById("episodes").innerHTML='<div class="player-message">Loading episodes…</div>';
  api("/anime/gogoanime/info/"+encodeURIComponent(id(a))).then(function(d){
    currentAnime=d;
    document.getElementById("detailsBox").innerHTML='<div class="title">'+esc(title(d))+'</div><div class="desc">'+esc(d.description||d.synopsis||"")+"</div>";
    var eps=d.episodes||d.episodeList||[],box=document.getElementById("episodes");box.innerHTML="";
    eps.forEach(function(ep,i){
      var b=document.createElement("button");b.className="ep focusable";b.textContent="Episode "+(ep.number||ep.episodeNumber||i+1);b.onclick=function(){playEpisode(ep)};box.appendChild(b)
    });
    if(!eps.length)box.innerHTML='<div class="player-message">No episodes returned.</div>';
    setTimeout(function(){focusFirst("details")},0)
  }).catch(function(e){document.getElementById("episodes").innerHTML='<div class="player-message">Anime info failed: '+esc(e.message)+"</div>"})
}
function playEpisode(ep){
  show("player");
  var m=document.getElementById("playerMessage"),v=document.getElementById("video");m.style.display="block";v.style.display="none";m.textContent="Loading episode…";
  var eid=ep.id||ep.episodeId;if(!eid){m.textContent="This episode has no usable ID.";return}
  api("/anime/gogoanime/watch/"+encodeURIComponent(eid)).then(function(d){
    var s=d.sources&&d.sources[0];if(!s){m.textContent="The backend did not return a playable source.";return}
    var u=s.url||s.file;if(!u){m.textContent="No playable URL returned.";return}
    v.src=u;v.style.display="block";m.style.display="none";try{v.play()}catch(e){}
  }).catch(function(e){m.textContent="Playback request failed: "+e.message})
}
function loadHome(){status("Loading…");api("/anime/gogoanime/recent-episodes?page=1").then(function(d){cards(list(d),"homeGrid");status("Ready")}).catch(function(e){status("Backend unavailable");document.getElementById("homeGrid").innerHTML='<div class="player-message">Could not reach the configured backend. Search can still be tested from the Search screen.</div>'})}
function focusables(){
  return Array.prototype.slice.call(document.querySelectorAll("#"+currentScreen+" .focusable")).filter(function(el){return el.offsetParent!==null&&!el.disabled})
}
function moveFocus(dx,dy){
  var els=focusables();if(!els.length)return;
  var cur=document.activeElement;
  if(!cur||els.indexOf(cur)<0)cur=focusedEl;
  if(!cur||els.indexOf(cur)<0){focusEl(els[0]);return}
  var r=cur.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,best=null,bestScore=Infinity;
  els.forEach(function(el){
    if(el===cur)return;
    var q=el.getBoundingClientRect(),ex=q.left+q.width/2,ey=q.top+q.height/2,tx=ex-cx,ty=ey-cy;
    var primary=dx?tx*dx:ty*dy,secondary=dx?Math.abs(ty):Math.abs(tx);
    if(primary<=4)return;
    var score=primary*100+secondary*3;
    if(score<bestScore){bestScore=score;best=el}
  });
  if(best)focusEl(best);
}
document.addEventListener("keydown",function(e){
  var k=e.keyCode||e.which,key=e.key;
  var left=k===37||key==="ArrowLeft",up=k===38||key==="ArrowUp",right=k===39||key==="ArrowRight",down=k===40||key==="ArrowDown";
  var ok=k===13||k===32||key==="Enter"||key===" ";
  var back=k===10009||k===461||key==="Backspace";
  if(left||up||right||down){e.preventDefault();moveFocus(left?-1:right?1:0,up?-1:down?1:0);return}
  if(ok){
    var el=document.activeElement;
    if(el&&el.classList.contains("focusable")){e.preventDefault();el.click()}
    return
  }
  if(back){
    e.preventDefault();
    if(currentScreen!=="home")show(currentScreen==="player"?"details":"home");
    return
  }
  if(k===415){var v=document.getElementById("video");if(v){e.preventDefault();if(v.paused)v.play();else v.pause()}}
  if(k===412){var v=document.getElementById("video");if(v){e.preventDefault();v.currentTime=Math.max(0,v.currentTime-10)}}
  if(k===417){var v=document.getElementById("video");if(v){e.preventDefault();v.currentTime+=10}}
});
document.addEventListener("focusin",function(e){if(e.target.classList&&e.target.classList.contains("focusable")){focusedEl=e.target;e.target.classList.add("remote-focus")}});
document.addEventListener("click",function(e){
  var a=e.target.closest&&e.target.closest("[data-action]");if(!a)return;
  var x=a.getAttribute("data-action");
  if(x==="search")show("search");
  if(x==="recent")loadHome();
  if(x==="popular"){status("Loading…");api("/anime/gogoanime/top-airing?page=1").then(function(d){cards(list(d),"homeGrid");status("Ready")}).catch(function(){status("Popular unavailable")})}
  if(x==="do-search"){var q=document.getElementById("query").value.trim();if(q)search(q)}
});
window.addEventListener("load",function(){show("home");loadHome()});
})();