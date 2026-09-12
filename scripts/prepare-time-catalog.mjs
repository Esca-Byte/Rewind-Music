import { mkdir, writeFile } from 'node:fs/promises';
import { Innertube, YTNodes } from 'youtubei.js';

// Artwork metadata only. Playback uses complete YouTube recordings, never store previews.
const seeds = [
  [2015, 'Tame Impala', 'The Less I Know The Better', 'Currents', 'Psychedelic pop'],
  [2015, 'The Weeknd', "Can't Feel My Face", 'Beauty Behind the Madness', 'Alternative R&B'],
  [2015, 'Kendrick Lamar', 'Alright', 'To Pimp a Butterfly', 'Hip-hop'],
  [2015, 'Beach House', 'Space Song', 'Depression Cherry', 'Dream pop'],
  [2013, 'Arctic Monkeys', 'Do I Wanna Know?', 'AM', 'Indie rock'],
  [2016, 'Frank Ocean', 'Pink + White', 'Blonde', 'Alternative R&B'],
  [1977, 'Fleetwood Mac', 'Dreams', 'Rumours', 'Soft rock'],
  [1973, 'Pink Floyd', 'Time', 'The Dark Side of the Moon', 'Progressive rock'],
  [1976, 'ABBA', 'Dancing Queen', 'Arrival', 'Disco'],
  [1977, 'David Bowie', 'Heroes', 'Heroes', 'Art rock'],
  [1982, 'Michael Jackson', 'Billie Jean', 'Thriller', 'Pop'],
  [1985, 'Tears for Fears', 'Everybody Wants To Rule The World', 'Songs from the Big Chair', 'New wave'],
  [1984, 'Prince', 'Purple Rain', 'Purple Rain', 'Pop rock'],
  [1985, 'Kate Bush', 'Running Up That Hill', 'Hounds of Love', 'Art pop'],
  [1991, 'Nirvana', 'Come As You Are', 'Nevermind', 'Grunge'],
  [1997, 'Radiohead', 'No Surprises', 'OK Computer', 'Alternative rock'],
  [1997, 'Daft Punk', 'Around the World', 'Homework', 'French house'],
  [1993, 'The Cranberries', 'Linger', 'Everybody Else Is Doing It, So Why Can’t We?', 'Alternative rock'],
  [2001, 'Daft Punk', 'One More Time', 'Discovery', 'French house'],
  [2000, 'Coldplay', 'Yellow', 'Parachutes', 'Alternative rock'],
  [2006, 'Amy Winehouse', 'Rehab', 'Back to Black', 'Soul'],
  [2005, 'Gorillaz', 'Feel Good Inc.', 'Demon Days', 'Alternative hip-hop'],
  [2020, 'Dua Lipa', 'Levitating', 'Future Nostalgia', 'Disco pop'],
  [2020, 'The Weeknd', 'Blinding Lights', 'After Hours', 'Synth-pop'],
  [2022, 'Harry Styles', 'As It Was', "Harry's House", 'Pop'],
  [2024, 'Billie Eilish', 'Birds of a Feather', 'HIT ME HARD AND SOFT', 'Alternative pop'],
];
const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
await mkdir('public/time', { recursive:true });
await mkdir('src/lib/time', { recursive:true });
const yt = await Innertube.create({ retrieve_player:false, generate_session_locally:true, lang:'en', location:'US' });
const catalog=[];
for(const [year,artist,title,album,genre] of seeds){
  const start=Date.now();
  const slug=`${artist}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'');
  const search=await yt.search(`${artist} ${title} official audio`,{type:'video'});
  const videos=search.videos.filter(v=>v instanceof YTNodes.Video && !v.is_live && v.duration.seconds>60 && v.duration.seconds<1500 && !/preview|teaser|trailer|shorts|snippet/i.test(v.title.text));
  const video=videos.find(v=>clean(v.author.name).includes(clean(artist)) && /audio/i.test(v.title.text)) || videos.find(v=>clean(v.author.name).includes(clean(artist))) || videos[0];
  if(!video) throw Error('No full recording for '+title);
  let art=video.best_thumbnail?.url || `https://i.ytimg.com/vi/${video.video_id}/hqdefault.jpg`;
  let artSource='YouTube';
  try {
    const res=await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist+' '+title)}&entity=song&limit=15&country=US`,{signal:AbortSignal.timeout(15000)});
    const data=await res.json();
    const candidates=(data.results||[]).filter(r=>clean(r.artistName||'')===clean(artist));
    const item=candidates.find(r=>clean(r.collectionName||'')===clean(album)) || candidates.find(r=>clean(r.trackName||'')===clean(title)) || candidates[0];
    if(item?.artworkUrl100){ art=item.artworkUrl100.replace('100x100bb','600x600bb'); artSource=item.collectionName; }
  }catch{}
  const image=await fetch(art,{signal:AbortSignal.timeout(15000)});
  if(!image.ok) throw Error('Artwork unavailable for '+title);
  await writeFile(`public/time/${slug}.jpg`, Buffer.from(await image.arrayBuffer()));
  catalog.push({id:slug,videoId:video.video_id,title,artist,album,year,genre,duration:video.duration.seconds,cover:`/time/${slug}.jpg`,source:'youtube'});
  await writeFile('src/lib/time/catalog.json',JSON.stringify(catalog,null,2)+'\n');
  console.log(`${year} | ${title} | ${video.video_id} | ${video.duration.seconds}s | art: ${artSource}`);
  await new Promise(r=>setTimeout(r,Math.max(0,3300-(Date.now()-start))));
}
await writeFile('src/lib/time/catalog.json',JSON.stringify(catalog,null,2)+'\n');
console.log(`Saved ${catalog.length} full-length recordings and local cover assets.`);
