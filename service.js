/*
 * HiAnime TV - TizenBrew service v1.1.0
 * Metadata layer: search + anime/episode information.
 * Source-specific fetching is kept outside the TV UI.
 */
const http = require("http");
const https = require("https");
const { URL } = require("url");

const HOST = "127.0.0.1";
const PORT = 8787;
const SOURCE_BASE = "https://hianime.vc";

function requestText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Tizen; SamsungTV) AppleWebKit/537.36 Chrome/63 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.8"
      }
    }, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", c => body += c);
      res.on("end", () => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(requestText(new URL(res.headers.location, url).toString()));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error("Source HTTP " + res.statusCode));
          return;
        }
        resolve(body);
      });
    });
    req.setTimeout(15000, () => req.destroy(new Error("Source timeout")));
    req.on("error", reject);
  });
}

function decodeHtml(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function stripTags(s) {
  return decodeHtml(String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}
function attr(tag, name) {
  const re = new RegExp(name + '\\s*=\\s*["\\']([^"\\']+)["\\']', "i");
  const m = tag.match(re);
  return m ? decodeHtml(m[1]) : "";
}

function parseSearch(html) {
  const results = [];
  const blocks = html.match(/<div[^>]*class=["'][^"']*flw-item[^"']*["'][\s\S]*?<\/div>\s*<\/div>/gi) || [];
  const sourceBlocks = blocks.length ? blocks :
    html.split(/(?=<div[^>]*class=["'][^"']*flw-item)/i).slice(1);

  sourceBlocks.forEach(block => {
    const hm = block.match(/href=["'](?:https?:\/\/[^"']+)?\/watch\/([^"'?#]+)[^"']*["']/i);
    if (!hm) return;
    const slug = hm[1];
    const tm = block.match(/class=["'][^"']*film-name[^"']*["'][\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    const title = stripTags(tm ? tm[1] : slug.replace(/-/g, " "));
    const im = block.match(/<img[^>]+>/i);
    const poster = im ? (attr(im[0],"data-src") || attr(im[0],"data-lazy-src") || attr(im[0],"src")) : "";
    results.push({id:slug, slug:slug, title:title, poster:poster});
  });

  const seen = {};
  return results.filter(x => {
    if (seen[x.slug]) return false;
    seen[x.slug] = true;
    return true;
  }).slice(0, 30);
}

function parseAnime(html, slug) {
  let title = slug.replace(/-/g, " ");
  let poster = "";
  let description = "";
  const episodes = [];

  let m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i);
  if (m) title = decodeHtml(m[1]);
  m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i);
  if (m) poster = decodeHtml(m[1]);
  m = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i);
  if (m) description = decodeHtml(m[1]);

  const epRe = /<a[^>]*data-number=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let e;
  while ((e = epRe.exec(html))) {
    const n = Number(e[1]);
    if (!isFinite(n)) continue;
    const tag = e[0];
    episodes.push({
      number:n,
      title:stripTags(e[2]) || ("Episode " + n),
      id:attr(tag,"data-id") || attr(tag,"data-episode-id") || "",
      href:attr(tag,"href")
    });
  }

  const unique = {};
  const cleanEpisodes = episodes.filter(ep => {
    const k = String(ep.number);
    if (unique[k]) return false;
    unique[k] = true;
    return true;
  }).sort((a,b) => a.number-b.number);

  return {
    id:slug,
    title:stripTags(title),
    poster:poster,
    description:stripTags(description).slice(0,1200),
    episodes:cleanEpisodes
  };
}

function json(res,status,payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status,{
    "Content-Type":"application/json; charset=utf-8",
    "Access-Control-Allow-Origin":"*",
    "Cache-Control":"no-store"
  });
  res.end(body);
}

const server = http.createServer(async (req,res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204,{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,OPTIONS"});
    res.end();
    return;
  }
  try {
    const u = new URL(req.url,"http://"+HOST+":"+PORT);
    if (u.pathname === "/api/health")
      return json(res,200,{ok:true,version:"1.1.0"});
    if (u.pathname === "/api/search") {
      const q=(u.searchParams.get("q")||"").trim();
      if (!q) return json(res,400,{error:"Missing q"});
      const html=await requestText(SOURCE_BASE+"/search?keyword="+encodeURIComponent(q));
      return json(res,200,{results:parseSearch(html)});
    }
    if (u.pathname === "/api/anime") {
      const slug=(u.searchParams.get("slug")||"").trim();
      if (!slug || !/^[a-zA-Z0-9._~-]+$/.test(slug))
        return json(res,400,{error:"Invalid slug"});
      const html=await requestText(SOURCE_BASE+"/watch/"+encodeURIComponent(slug));
      return json(res,200,parseAnime(html,slug));
    }
    return json(res,404,{error:"Not found"});
  } catch(e) {
    return json(res,502,{error:String(e && e.message ? e.message : e)});
  }
});
server.listen(PORT,HOST,()=>console.log("[HiAnime TV] service on http://"+HOST+":"+PORT));
