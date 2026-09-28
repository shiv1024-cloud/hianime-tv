(function(){'use strict';
var BACKEND="https://mitenime.org/api";
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
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function first(o,keys,def){
  for(var i=0;i<keys.length;i++){var k=keys[i];if(o&&o[k]!=null&&o[k]!=="")return o[k]}
  return def;
}
function api(path){
  var u=BACKEND.replace(/\/$/,"")+path;
  return fetch(u,{headers:{"Accept":"application/json"}}).then(function(r){
    if(!r.ok)throw Error("HTTP "+r.status);
    return r.json();
  }).catch(function(){
    return fetch(PROXY+encodeURIComponent(u),{headers:{"Accept":"application/json"}}).then(function(r){
      if(!r.ok)throw Error("HTTP "+r.status);
      return r.json();
    });
  });
}
function payload(d){return d&&d.data!=null?d.data:d}
function title(a){
  var t=first(a,["title","name"],"Unknown");
  if(typeof t==="string")return t;
  return first(t,["english","romaji","userPreferred","native"],"Unknown");
}
function image(a){return first(a,["thumbnail","image","cover","poster","banner"],"")}
function slug(a){return first(a,["slug","series_slug","episode_slug"],"")}
function id(a){return first(a,["id","episode_id","series_id"],"")}
function list(d){
  var p=payload(d);
  if(Array.isArray(p))return p;
  return (p&&(p.results||p.animes||p.items||p.episodes||p.series))||[];
}
function cards(items,target){
  var el=document.getElementById(target);el.innerHTML="";
  if(!items.length){el.innerHTML='<div class="player-message">No results found.</div>';return}
  items.slice(0,30).forEach(function(a){
    var b=document.createElement("button");
    b.className="card focusable";
    b.innerHTML='<img src="'+esc(image(a)||"https://via.placeholder.com/300x420?text=Anime")+'"><div class="name">'+esc(title(a))+'</div><div class="meta">'+esc(first(a,["type","status","released_at","releaseDate"],""))+'</div>';
    b.onclick=function(){openAnime(a)};
    el.appendChild(b);
  });
  if(document.getElementById(currentScreen)===document.getElementById(target).parentElement)focusFirst(currentScreen);
}
function search(q){
  status("Searching…");
  api("/search?q="+encodeURIComponent(q)).then(function(d){
    cards(list(d),"results");status("Ready");
  }).catch(function(e){
    status("Search error");
    document.getElementById("results").innerHTML='<div class="player-message">Search failed: '+esc(e.message)+"</div>";
  });
}
function openAnime(a){
  currentAnime=a;show("details");
  var s=slug(a);
  document.getElementById("detailsBox").innerHTML='<div class="title">'+esc(title(a))+'</div><div class="desc">Loading information…</div>';
  document.getElementById("episodes").innerHTML='<div class="player-message">Loading episodes…</div>';
  if(!s){document.getElementById("episodes").innerHTML='<div class="player-message">This result has no series slug.</div>';return}
  api("/series/"+encodeURIComponent(s)).then(function(d){
    var x=payload(d);currentAnime=x||a;
    document.getElementById("detailsBox").innerHTML='<div class="title">'+esc(title(x||a))+'</div><div class="desc">'+esc(first(x||a,["synopsis","description"],""))+"</div>";
    return api("/series/"+encodeURIComponent(s)+"/episodes?page=1&per_page=100");
  }).then(function(d){
    var eps=list(d),box=document.getElementById("episodes");box.innerHTML="";
    eps.forEach(function(ep,i){
      var b=document.createElement("button");b.className="ep focusable";
      b.textContent="Episode "+first(ep,["number","episode_number","episodeNumber"],i+1);
      b.onclick=function(){playEpisode(ep)};
      box.appendChild(b);
    });
    if(!eps.length)box.innerHTML='<div class="player-message">No episodes returned.</div>';
    setTimeout(function(){focusFirst("details")},0);
  }).catch(function(e){
    document.getElementById("episodes").innerHTML='<div class="player-message">Anime info failed: '+esc(e.message)+"</div>";
  });
}
function findPlayable(o,depth){
  if(depth>6||o==null)return null;
  if(typeof o==="string"){
    if(/^https?:\/\//i.test(o) && (o.indexOf(".m3u8")>=0||o.indexOf(".mp4")>=0||o.indexOf(".webm")>=0||o.indexOf("stream")>=0||o.indexOf("video")>=0))return o;
    return null;
  }
  if(Array.isArray(o)){
    for(var i=0;i<o.length;i++){var r=findPlayable(o[i],depth+1);if(r)return r}
    return null;
  }
  if(typeof o==="object"){
    var keys=["url","file","src","stream_url","streamUrl","play_url","playUrl","hls","m3u8","video_url","videoUrl"];
    for(var j=0;j<keys.length;j++){var v=o[keys[j]];if(typeof v==="string"&&/^https?:\/\//i.test(v))return v}
    for(var k in o){if(Object.prototype.hasOwnProperty.call(o,k)){var z=findPlayable(o[k],depth+1);if(z)return z}}
  }
  return null;
}
function playEpisode(ep){
  show("player");
  var m=document.getElementById("playerMessage"),v=document.getElementById("video");
  m.style.display="block";v.style.display="none";m.textContent="Loading episode…";
  var s=slug(ep);
  if(!s){
    var apiUrl=first(ep,["api_url","url"],"");
    if(apiUrl){s=apiUrl.split("/").pop()}
  }
  if(!s){m.textContent="This episode has no usable slug.";return}
  api("/episodes/"+encodeURIComponent(s)).then(function(d){
    var u=findPlayable(d,0);
    if(!u){m.textContent="Episode data loaded, but no direct playable stream was returned.";return}
    v.src=u;v.style.display="block";m.style.display="none";
    v.onerror=function(){m.style.display="block";m.textContent="The TV player could not play this stream.";v.style.display="none"};
    try{v.play()}catch(e){}
  }).catch(function(e){m.textContent="Playback request failed: "+esc(e.message)});
}
function loadHome(){
  status("Loading…");
  api("/home").then(function(d){
    var p=payload(d),items=[];
    if(Array.isArray(p))items=p;
    else{
      var groups=["recommendations","recommended","popular","popular_series","series_popular","series","latest","latest_series"];
      for(var i=0;i<groups.length;i++){if(Array.isArray(p&&p[groups[i]])){items=items.concat(p[groups[i]])}}
      if(!items.length)items=list(d);
    }
    cards(items,"homeGrid");status("Ready");
  }).catch(function(){
    status("Backend unavailable");
    document.getElementById("homeGrid").innerHTML='<div class="player-message">Could not reach MiteNime API.</div>';
  });
}
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
  if(ok){var el=document.activeElement;if(el&&el.classList.contains("focusable")){e.preventDefault();el.click()}return}
  if(back){e.preventDefault();if(currentScreen!=="home")show(currentScreen==="player"?"details":"home");return}
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
  if(x==="popular")loadHome();
  if(x==="do-search"){var q=document.getElementById("query").value.trim();if(q)search(q)}
});
window.addEventListener("load",function(){show("home");loadHome()});
})();