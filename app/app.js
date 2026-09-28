(function(){'use strict';
var ANILIST="https://graphql.anilist.co";
var ANIVEXA="https://anivexa-api.vercel.app";
var PROXY="https://corsproxy.io/?url=";
var statusEl=document.getElementById("status"),screens=document.querySelectorAll(".screen"),currentAnime=null,currentScreen="home",previousScreen="home",focusedEl=null,currentLang="sub";

function status(s){statusEl.textContent=s}
function focusEl(el){
  if(!el||el.disabled)return;
  if(focusedEl&&focusedEl!==el)focusedEl.classList.remove("remote-focus");
  focusedEl=el;
  try{el.focus({preventScroll:false})}catch(e){try{el.focus()}catch(ignore){}}
  el.classList.add("remote-focus");
  try{el.scrollIntoView({block:"nearest",inline:"nearest"})}catch(e){}
}
function focusFirst(id){var el=document.querySelector("#"+id+" .focusable");if(el)focusEl(el);else focusedEl=null}
function show(id){
  if(id!==currentScreen){previousScreen=currentScreen;currentScreen=id}
  for(var i=0;i<screens.length;i++)screens[i].classList.remove("active");
  var screen=document.getElementById(id);if(screen)screen.classList.add("active");
  setTimeout(function(){focusFirst(id)},0)
}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function first(o,keys,def){for(var i=0;i<keys.length;i++){var k=keys[i];if(o&&o[k]!=null&&o[k]!=="")return o[k]}return def}
function fetchJson(url,opts){
  return fetch(url,opts||{headers:{"Accept":"application/json"}}).then(function(r){if(!r.ok)throw Error("HTTP "+r.status);return r.json()}).catch(function(){
    return fetch(PROXY+encodeURIComponent(url),opts||{headers:{"Accept":"application/json"}}).then(function(r){if(!r.ok)throw Error("HTTP "+r.status);return r.json()})
  })
}
function anilist(query,vars){
  return fetchJson(ANILIST,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({query:query,variables:vars||{}})})
}
function image(a){return a&&a.coverImage&&(a.coverImage.extraLarge||a.coverImage.large||a.coverImage.medium)||""}
function title(a){return a&&a.title&&first(a.title,["english","romaji","userPreferred","native"],"Unknown")}
function cards(items,target){
  var el=document.getElementById(target);el.innerHTML="";
  if(!items.length){el.innerHTML='<div class="player-message">No results found.</div>';return}
  items.slice(0,30).forEach(function(a){
    var b=document.createElement("button");b.className="card focusable";
    b.innerHTML='<img src="'+esc(image(a)||"https://via.placeholder.com/300x420?text=Anime")+'"><div class="name">'+esc(title(a))+'</div><div class="meta">'+esc(first(a,["format","status"],""))+(a.episodes?" • "+a.episodes+" eps":"")+"</div>";
    b.onclick=function(){openAnime(a)};el.appendChild(b)
  });
  if(document.getElementById(currentScreen)===document.getElementById(target).parentElement)focusFirst(currentScreen)
}
function search(q){
  status("Searching…");
  var query="query($search:String){Page(page:1,perPage:30){media(search:$search,type:ANIME,sort:[SEARCH_MATCH,POPULARITY_DESC]){id title{romaji english native userPreferred}coverImage{extraLarge large medium}episodes format status description}}}";
  anilist(query,{search:q}).then(function(d){cards(d.data&&d.data.Page?d.data.Page.media:[],"results");status("Ready")}).catch(function(e){status("Search error");document.getElementById("results").innerHTML='<div class="player-message">Search failed: '+esc(e.message)+"</div>"})
}
function loadHome(mode){
  mode=mode||"popular";
  status("Loading "+mode+"…");
  var sort=mode==="recent"?"UPDATED_AT_DESC":"POPULARITY_DESC";
  var query="query($sort:MediaSort){Page(page:1,perPage:25){media(type:ANIME,sort:[$sort]){id title{romaji english native userPreferred}coverImage{extraLarge large medium}episodes format status updatedAt popularity}}}";
  anilist(query,{sort:sort}).then(function(d){
    cards(d.data&&d.data.Page?d.data.Page.media:[],"homeGrid");
    status(mode==="recent"?"Recent":"Popular");
  }).catch(function(){
    status("Home unavailable");
    document.getElementById("homeGrid").innerHTML='<div class="player-message">Could not load '+mode+' anime.</div>';
  })
}
function renderDetails(a){
  document.getElementById("detailsBox").innerHTML='<div class="title">'+esc(title(a))+'</div><div class="desc">'+esc(a.description||"")+'</div><div class="row lang-row"><button id="subBtn" data-lang="sub" class="focusable primary">English SUB</button><button id="dubBtn" data-lang="dub" class="focusable">English DUB</button></div>';
  var bs=document.querySelectorAll("[data-lang]");for(var i=0;i<bs.length;i++)bs[i].onclick=function(){currentLang=this.getAttribute("data-lang");updateLangButtons();loadEpisodes(a)};
}
function updateLangButtons(){
  var s=document.getElementById("subBtn"),d=document.getElementById("dubBtn");
  if(s)s.className="focusable"+(currentLang==="sub"?" primary":"");
  if(d)d.className="focusable"+(currentLang==="dub"?" primary":"");
}
function collectEpisodeArrays(obj,lang,out,depth){
  if(depth>7||obj==null)return;
  if(Array.isArray(obj)){for(var i=0;i<obj.length;i++)collectEpisodeArrays(obj[i],lang,out,depth+1);return}
  if(typeof obj!=="object")return;
  if(obj[lang]&&Array.isArray(obj[lang])){out.push(obj[lang]);}
  for(var k in obj)if(Object.prototype.hasOwnProperty.call(obj,k))collectEpisodeArrays(obj[k],lang,out,depth+1)
}
function normalizeEpisodes(d,lang){
  var arrays=[];collectEpisodeArrays(d,lang,arrays,0);
  var out=[],seen={};
  arrays.forEach(function(arr){arr.forEach(function(ep){
    var n=first(ep,["number","episodeNumber","episode","ep"],null);
    var eid=first(ep,["id","episodeId"],"");
    if(n==null&&eid){var m=String(eid).match(/-(\d+)(?:\D*)$/);if(m)n=Number(m[1])}
    if(n==null)return;
    var key=String(n);if(seen[key])return;seen[key]=1;
    out.push({number:n,title:first(ep,["title","name"],"Episode "+n),id:eid})
  })});
  out.sort(function(a,b){return Number(a.number)-Number(b.number)});
  return out
}
function loadEpisodes(a){
  var box=document.getElementById("episodes");box.innerHTML='<div class="player-message">Loading '+currentLang.toUpperCase()+' episodes…</div>';
  status("Loading episodes…");
  fetchJson(ANIVEXA+"/episodes/anikoto/"+encodeURIComponent(a.id)).then(function(d){
    var eps=normalizeEpisodes(d,currentLang);
    // Some Anivexa deployments can return the watch endpoint while the episode-list
    // endpoint is temporarily empty. Fall back to the AniList episode count so the
    // confirmed watch route can be tried directly.
    if(!eps.length && a.episodes){
      var total=Number(a.episodes)||0;
      for(var n=1;n<=total;n++)eps.push({number:n,title:"Episode "+n,id:""});
    }
    box.innerHTML="";
    if(!eps.length){box.innerHTML='<div class="player-message">No '+currentLang.toUpperCase()+' episodes were returned for this title.</div>';status("No "+currentLang.toUpperCase()+" episodes");return}
    eps.forEach(function(ep){
      var b=document.createElement("button");b.className="ep focusable";b.textContent="Episode "+ep.number+(ep.title?" — "+ep.title:"");b.onclick=function(){playEpisode(a,ep)};box.appendChild(b)
    });
    status(eps.length+" "+currentLang.toUpperCase()+" episodes");setTimeout(function(){focusFirst("details")},0)
  }).catch(function(e){box.innerHTML='<div class="player-message">Episode lookup failed: '+esc(e.message)+"</div>";status("Episode error")})
}
function openAnime(a){
  currentAnime=a;currentLang="sub";show("details");renderDetails(a);loadEpisodes(a)
}
function findLangBlock(d,lang){
  if(d&&d[lang])return d[lang];
  if(d&&d["s"+lang])return d["s"+lang];
  if(d&&d["sd"+lang])return d["sd"+lang];
  return d
}
function playEpisode(a,ep){
  show("player");
  var m=document.getElementById("playerMessage"),v=document.getElementById("video"),frame=document.getElementById("playerFrame");
  m.style.display="block";v.style.display="none";frame.style.display="none";m.textContent="Loading "+currentLang.toUpperCase()+" stream…";
  var watchId="anikoto-"+ep.number;
  fetchJson(ANIVEXA+"/watch/anikoto/"+encodeURIComponent(a.id)+"/"+currentLang+"/"+watchId).then(function(d){
    var block=findLangBlock(d,currentLang),streams=block&&block.streams||[];
    if(!streams.length){m.textContent="No "+currentLang.toUpperCase()+" stream was returned.";return}
    var u=first(streams[0],["url","file","src"],"");if(!u){m.textContent="Stream URL missing.";return}
    var isDirect=/\.(m3u8|mp4|webm)(\?|$)/i.test(u);
    document.getElementById("playerTitle").textContent=title(a)+" — "+currentLang.toUpperCase()+" E"+ep.number;
    if(isDirect){
      v.src=u;v.style.display="block";m.style.display="none";
      try{
        var subs=block.subtitles||[];
        for(var i=v.querySelectorAll("track").length-1;i>=0;i--)v.removeChild(v.querySelectorAll("track")[i]);
        subs.forEach(function(t){var tr=document.createElement("track");tr.kind="captions";tr.label=t.label||"English";tr.srclang=t.language||"en";tr.src=t.file||"";if(t.default)tr.default=true;v.appendChild(tr)});
        v.play()
      }catch(e){}
    }else{
      frame.src=u;frame.style.display="block";m.style.display="none";
    }
  }).catch(function(e){m.textContent="Playback request failed: "+esc(e.message)})
}
function focusables(){return Array.prototype.slice.call(document.querySelectorAll("#"+currentScreen+" .focusable")).filter(function(el){return el.offsetParent!==null&&!el.disabled})}
function moveFocus(dx,dy){
  var els=focusables();if(!els.length)return;
  var cur=document.activeElement;if(!cur||els.indexOf(cur)<0)cur=focusedEl;
  if(!cur||els.indexOf(cur)<0){focusEl(els[0]);return}

  var r=cur.getBoundingClientRect();
  var cx=r.left+r.width/2,cy=r.top+r.height/2;
  var candidates=[];

  els.forEach(function(el){
    if(el===cur)return;
    var q=el.getBoundingClientRect();
    var ex=q.left+q.width/2,ey=q.top+q.height/2;
    var tx=ex-cx,ty=ey-cy;
    var primary=dx?tx*dx:ty*dy;
    if(primary<=4)return;

    // Horizontal navigation must stay in the same visual row.
    // This prevents RIGHT from jumping from a card grid to the
    // Recent/Popular buttons above when the current row ends.
    if(dx){
      var verticalOverlap=(q.top<r.bottom && q.bottom>r.top);
      if(!verticalOverlap)return;
      var secondary=Math.abs(ey-cy);
      candidates.push({el:el,score:primary*100+secondary*3});
      return;
    }

    // Vertical navigation prefers elements whose columns overlap.
    var horizontalOverlap=(q.left<r.right && q.right>r.left);
    if(!horizontalOverlap)return;
    var secondary=Math.abs(ex-cx);
    candidates.push({el:el,score:primary*100+secondary*3});
  });

  candidates.sort(function(a,b){return a.score-b.score});
  if(candidates.length)focusEl(candidates[0].el);
}
document.addEventListener("keydown",function(e){
  var k=e.keyCode||e.which,key=e.key,left=k===37||key==="ArrowLeft",up=k===38||key==="ArrowUp",right=k===39||key==="ArrowRight",down=k===40||key==="ArrowDown",ok=k===13||k===32||key==="Enter"||key===" ",back=k===10009||k===461||key==="Backspace";
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
  if(x==="recent")loadHome("recent");
  if(x==="popular")loadHome("popular");
  if(x==="do-search"){var q=document.getElementById("query").value.trim();if(q)search(q)}
});
window.addEventListener("load",function(){show("home");loadHome()});
})();