// Playback is loaded only after a visitor explicitly starts it.
export function setupMusic(){
 const trigger=document.getElementById('music'),dialog=document.createElement('dialog');dialog.id='music-dialog';dialog.innerHTML=`<button class="close" aria-label="关闭音乐设置">×</button><span class="eyebrow">A SONG FOR THIS MOMENT</span><h2>该相逢的人会再相逢</h2><p>刘宇宁 · 现场演唱</p><p class="music-note">现场原声来自微博回放，建议在 Wi-Fi 下播放。<br>也可以选择手机中的音频，更省流量。</p><button id="play-live" class="primary">播放现场原声 <span>♪</span></button><label class="audio-file">选择本机音频<input id="audio-file" type="file" accept="audio/*,.mp3,.m4a,.aac,.wav"></label><p id="music-status" role="status"></p><a class="source-link" href="https://weibo.com/l/wblive/p/show/1022:2321325332684670370133" target="_blank" rel="noopener">查看原现场 ↗</a>`;document.body.append(dialog);
 const audio=document.createElement('video');audio.id='bgm-player';audio.setAttribute('aria-hidden','true');audio.tabIndex=-1;audio.playsInline=true;audio.setAttribute('playsinline','');audio.setAttribute('webkit-playsinline','');audio.preload='none';audio.volume=.48;audio.style.cssText='position:fixed;width:1px;height:1px;left:-10px;top:-10px;pointer-events:none';document.body.append(audio);
 const url='https://live.video.weibocdn.com/5332684667626135_index.m3u8',startTime=8455,endTime=8734;let hls=null,source=null,localUrl=null,loading=false;const status=dialog.querySelector('#music-status');
 const label=trigger.querySelector('.music-label');
 function sync(){
  const on=!audio.paused;
  trigger.classList.toggle('music-on',on);
  label.textContent=on?'暂停':'唱歌';
  const action=on?'暂停背景音乐':'播放背景音乐';
  trigger.setAttribute('aria-label',action);
  trigger.title=action;
 }
 audio.addEventListener('play',sync);audio.addEventListener('pause',sync);audio.addEventListener('playing',()=>{status.textContent='正在播放';dialog.close()});audio.addEventListener('error',()=>{status.textContent='现场音源暂时无法连接。可以选择本机音频或查看原现场。';source=null;loading=false});
 audio.addEventListener('timeupdate',()=>{if(source==='live'&&audio.currentTime>=endTime){audio.currentTime=startTime;audio.play().catch(()=>{})}});
 dialog.querySelector('.close').onclick=()=>dialog.close();
 trigger.onclick=()=>{if(source){if(audio.paused){hls?.startLoad();audio.play().catch(()=>dialog.showModal())}else{audio.pause();hls?.stopLoad()}}else dialog.showModal()};
 async function playLive(){if(loading)return;loading=true;status.textContent='正在连接现场原声…';source='live';audio.loop=false;
  if(audio.canPlayType('application/vnd.apple.mpegurl')){audio.src=url;audio.addEventListener('loadedmetadata',()=>{audio.currentTime=startTime},{once:true});audio.play().catch(()=>{status.textContent='请再次点播放';loading=false});}
  else {try{if(!window.Hls){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/hls.min.js';script.onload=resolve;script.onerror=reject;document.head.append(script)})}if(!window.Hls.isSupported())throw new Error('unsupported');hls?.destroy();hls=new window.Hls({startPosition:startTime,maxBufferLength:10,maxMaxBufferLength:20,backBufferLength:0});hls.loadSource(url);hls.attachMedia(audio);hls.on(window.Hls.Events.MANIFEST_PARSED,()=>audio.play().catch(()=>{status.textContent='音源已连接，请再次点击音乐按钮';loading=false}));hls.on(window.Hls.Events.ERROR,(_,data)=>{if(data.fatal){status.textContent='暂时无法连接现场。可选择本机音频。';source=null;loading=false;hls.destroy()}})}catch{source=null;status.textContent='此浏览器无法播放现场音源，请选择本机音频。';loading=false}}
 }
 dialog.querySelector('#play-live').onclick=playLive;
 dialog.querySelector('#audio-file').onchange=e=>{const file=e.target.files[0];if(!file)return;hls?.destroy();hls=null;if(localUrl)URL.revokeObjectURL(localUrl);localUrl=URL.createObjectURL(file);source='local';audio.src=localUrl;audio.loop=true;audio.play().catch(()=>status.textContent='请点击右上角音乐按钮播放');};
 return {
  start() { if (source && audio.paused) audio.play().catch(() => {}); },
  muteForCelebration() {
    const wasMuted = audio.muted;
    audio.muted = true;
    return () => { audio.muted = wasMuted; };
  },
 };
}
