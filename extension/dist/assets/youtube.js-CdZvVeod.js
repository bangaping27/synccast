import{M as l,A as a}from"./constants-C9dKYTab.js";const L=500,S=2;let t=null,b=0,v=null,x=!1;A();function A(){s("Content script loaded"),M(),_(),C()}function M(){new MutationObserver(()=>{const n=document.querySelector("video");n&&n!==t&&(t=n,g(),s("🎬 Video element found"))}).observe(document.body,{childList:!0,subtree:!0});const o=document.querySelector("video");o&&(t=o,g())}function g(){x||(x=!0,t.addEventListener("play",()=>u(a.PLAY)),t.addEventListener("pause",()=>u(a.PAUSE)),t.addEventListener("ended",()=>u("ENDED")),t.addEventListener("seeked",()=>{Math.abs(t.currentTime-b)>S&&u(a.SEEK)}),t.addEventListener("timeupdate",()=>{b=t.currentTime}))}function u(e){var o;(o=chrome.runtime)!=null&&o.id&&(clearTimeout(v),v=setTimeout(()=>{const n=p(),i=V();try{chrome.runtime.sendMessage({type:l.VIDEO_EVENT,payload:{action:e,currentTime:(t==null?void 0:t.currentTime)??0,videoId:n,isAd:i}}).catch(()=>{})}catch(d){d.message.includes("context invalidated")&&s("Extension updated, please refresh the page.")}},L))}function C(){chrome.runtime.onMessage.addListener(e=>{e.type===l.EXECUTE_ACTION?q(e.payload):e.type===l.REMOTE_CONTROL&&O(e.payload)})}function O({action:e}){t&&(e===a.PLAY&&t.paused&&t.play().catch(()=>{}),e===a.PAUSE&&!t.paused&&t.pause())}function q({action:e,currentTime:o,videoId:n}){if(!t){s("No video element – cannot execute",e);return}const i=p();if(n&&i&&n!==i){window.location.href=`https://www.youtube.com/watch?v=${n}&t=${Math.floor(o)}s`;return}Math.abs(t.currentTime-o)>S&&(t.currentTime=o),e===a.PLAY&&t.paused&&t.play().catch(()=>{}),e===a.PAUSE&&!t.paused&&t.pause(),e===a.SEEK&&(t.currentTime=o),s(`▶ Executed ${e} @ ${o.toFixed(1)}s`),I()}function V(){return!!(document.querySelector(".ad-showing")||document.querySelector(".ytp-ad-player-overlay")||document.querySelector(".ytp-ad-text"))}function p(){try{return new URLSearchParams(window.location.search).get("v")||null}catch{return null}}function _(){new MutationObserver(()=>{E()}).observe(document.body,{childList:!0,subtree:!0}),E()}function E(){const e=document.querySelector("ytd-watch-metadata #top-level-buttons-computed")||document.querySelector("ytd-watch-metadata ytd-menu-renderer");if(!e)return;const o=document.getElementById("synccast-btn");if(o){if(e.contains(o))return;o.remove()}const n=document.createElement("div");n.id="synccast-btn",n.style.cssText="display:inline-flex;align-items:center;margin-right:8px;vertical-align:middle";const i=n.attachShadow({mode:"open"});i.innerHTML=`
    <style>
      button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: 9999px;
        border: none;
        cursor: pointer;
        font-family: 'Roboto', sans-serif;
        font-size: 14px;
        font-weight: 500;
        background: linear-gradient(135deg, #7c3aed, #3b82f6);
        color: white;
        transition: opacity .15s, transform .15s;
        white-space: nowrap;
        height: 36px; /* Match YouTube menu buttons height */
      }
      button:hover  { opacity: .88; transform: scale(1.03); }
      button:active { transform: scale(.97); }
      svg { width:16px; height:16px; fill:white; flex-shrink:0; }

      .toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(124,58,237,.95);
        color:#fff;
        padding: 8px 20px;
        border-radius: 9999px;
        font-family:'Roboto',sans-serif;
        font-size:14px;
        pointer-events:none;
        opacity:0;
        transition: opacity .3s;
        z-index: 99999;
      }
      .toast.show { opacity:1; }
    </style>

    <button id="add-btn" title="Add to Stream">
      <svg viewBox="0 0 24 24"><path d="M19 11H13V5a1 1 0 0 0-2 0v6H5a1 1 0 0 0 0 2h6v6a1 1 0 0 0 2 0v-6h6a1 1 0 0 0 0-2z"/></svg>
      Add to Stream
    </button>
    <div class="toast" id="toast">Added to Stream! ✅</div>
  `,i.querySelector("#add-btn").addEventListener("click",()=>{const d=p(),f=document.querySelector("h1.ytd-watch-metadata yt-formatted-string"),T=f?f.textContent.trim():document.title.replace(" - YouTube","").trim();let m=0;const y=document.querySelector(".ytp-time-duration");if(y){const h=y.textContent.trim().split(":").reverse();for(let c=0;c<h.length;c++)m+=parseInt(h[c],10)*Math.pow(60,c)}if(!d){w(i,"⚠ Open a video first!");return}chrome.runtime.sendMessage({type:l.ADD_QUEUE,payload:{video_id:d,title:T,duration:m}}).catch(()=>{}),w(i,"Added to Stream! ✅")}),e.prepend(n)}function w(e,o){const n=e.querySelector("#toast");n&&(n.textContent=o,n.classList.add("show"),setTimeout(()=>n.classList.remove("show"),2500))}let r=null;function I(){r||(r=document.createElement("div"),r.style.cssText=`
      position:fixed;bottom:80px;right:24px;z-index:100000;
      background:linear-gradient(135deg,#7c3aed,#3b82f6);
      color:#fff;padding:6px 14px;border-radius:9999px;
      font-family:'Roboto',sans-serif;font-size:13px;font-weight:500;
      pointer-events:none;opacity:0;transition:opacity .3s;
    `,r.textContent="🔄 Synced",document.body.appendChild(r)),r.style.opacity="1",clearTimeout(r._timer),r._timer=setTimeout(()=>{r.style.opacity="0"},1500)}function s(...e){console.log("[SyncCast CS]",...e)}
