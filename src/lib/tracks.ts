export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  length: string;
  cover: string;
  coverAlt: string;
  source: string;
  accent: string;
};

export const tracks: Track[] = [
  {
    id: "afterglow",
    title: "Midnight Circuit",
    artist: "The Velvet Frequencies",
    album: "Afterglow",
    year: "1983",
    length: "06:12",
    cover: "/covers/afterglow.jpg",
    coverAlt: "Blurry city lights at night",
    source: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    accent: "#f3a53f",
  },
  {
    id: "chrome-dreams",
    title: "Chrome Dreams",
    artist: "Night Arcade",
    album: "Soft Machines",
    year: "1985",
    length: "07:05",
    cover: "/covers/chrome-dreams.jpg",
    coverAlt: "Colorful geometric abstract artwork",
    source: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    accent: "#9fbd74",
  },
  {
    id: "heatwave",
    title: "Heatwave Memory",
    artist: "Cassette Coast",
    album: "Sidewalk Radio",
    year: "1981",
    length: "05:43",
    cover: "/covers/heatwave.jpg",
    coverAlt: "Orange, black and white abstract painting",
    source: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    accent: "#e46e3c",
  },
  {
    id: "slow-bloom",
    title: "Slow Bloom",
    artist: "Mara June",
    album: "Wild Signal",
    year: "1979",
    length: "06:29",
    cover: "/covers/slow-bloom.jpg",
    coverAlt: "Glowing grass and warm bokeh lights",
    source: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    accent: "#d9c578",
  },
  {
    id: "red-room",
    title: "Red Room Reprise",
    artist: "Low Fidelity Club",
    album: "Architecture of Light",
    year: "1986",
    length: "04:58",
    cover: "/covers/red-room.jpg",
    coverAlt: "Futuristic red geometric hallway",
    source: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
    accent: "#d7584e",
  },
  {
    id: "night-drive",
    title: "Receiver No. 9",
    artist: "Harbor Static",
    album: "Night Drive",
    year: "1984",
    length: "05:51",
    cover: "/covers/night-drive.jpg",
    coverAlt: "Textured abstract painting in red and blue",
    source: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
    accent: "#6e93ac",
  },
];

export function getTrack(id: string | null) {
  return tracks.find((track) => track.id === id);
}
