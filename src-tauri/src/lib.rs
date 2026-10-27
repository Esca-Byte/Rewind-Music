use std::fs;
use std::path::PathBuf;

use tauri::{Manager, PhysicalPosition, PhysicalSize, Position};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const EMBEDDED_YT_DLP: &[u8] = include_bytes!("../binaries/yt-dlp-x86_64-pc-windows-msvc.exe");

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const MINI_PLAYER_POSITION_FILE: &str = "mini-player-position.json";
const MINI_PLAYER_DEFAULT_WIDTH: u32 = 340;
const MINI_PLAYER_DEFAULT_HEIGHT: u32 = 400;
const MINI_PLAYER_MARGIN: i64 = 24;
static MINI_PLAYER_POSITION_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(serde::Deserialize, serde::Serialize, Clone, Copy)]
struct MiniPlayerPosition {
    x: i32,
    y: i32,
}

fn mini_player_position_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(MINI_PLAYER_POSITION_FILE))
}

fn load_mini_player_position(app: &tauri::AppHandle) -> Option<MiniPlayerPosition> {
    let _guard = MINI_PLAYER_POSITION_LOCK.lock().ok()?;
    let path = mini_player_position_path(app)?;
    let data = fs::read_to_string(path).ok()?;
    serde_json::from_str::<MiniPlayerPosition>(&data).ok()
}

fn save_mini_player_position(app: &tauri::AppHandle, position: MiniPlayerPosition) {
    let Ok(_guard) = MINI_PLAYER_POSITION_LOCK.lock() else {
        return;
    };
    let Some(path) = mini_player_position_path(app) else {
        return;
    };

    let Some(parent) = path.parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }

    let Ok(data) = serde_json::to_string(&position) else {
        return;
    };
    // Replace the complete JSON file so an interrupted write cannot truncate the
    // last known position. Serialize native move events and command-side writes.
    let temp_path = path.with_extension("json.tmp");
    if fs::write(&temp_path, data).is_ok() {
        if fs::rename(&temp_path, &path).is_err() {
            // Windows does not replace an existing file during rename. Remove
            // the old snapshot and retry so later moves continue to persist.
            let _ = fs::remove_file(&path);
            if let Err(error) = fs::rename(&temp_path, &path) {
                log::warn!("Could not persist mini-player position: {error}");
                let _ = fs::remove_file(temp_path);
            }
        }
    }
}

fn mini_player_size(window: &tauri::WebviewWindow) -> PhysicalSize<u32> {
    window.outer_size().unwrap_or_else(|_| {
        PhysicalSize::new(MINI_PLAYER_DEFAULT_WIDTH, MINI_PLAYER_DEFAULT_HEIGHT)
    })
}

fn position_fits_work_area(
    position: MiniPlayerPosition,
    size: PhysicalSize<u32>,
    work_area_position: PhysicalPosition<i32>,
    work_area_size: PhysicalSize<u32>,
) -> bool {
    let x = i64::from(position.x);
    let y = i64::from(position.y);
    let width = i64::from(size.width);
    let height = i64::from(size.height);
    let area_x = i64::from(work_area_position.x);
    let area_y = i64::from(work_area_position.y);
    let area_right = area_x + i64::from(work_area_size.width);
    let area_bottom = area_y + i64::from(work_area_size.height);

    x >= area_x && y >= area_y && x + width <= area_right && y + height <= area_bottom
}

fn saved_position_is_visible(
    window: &tauri::WebviewWindow,
    position: MiniPlayerPosition,
    size: PhysicalSize<u32>,
) -> bool {
    window
        .available_monitors()
        .ok()
        .map(|monitors| {
            monitors.iter().any(|monitor| {
                let work_area = monitor.work_area();
                position_fits_work_area(position, size, work_area.position, work_area.size)
            })
        })
        .unwrap_or(false)
}

fn default_mini_player_position(
    window: &tauri::WebviewWindow,
    size: PhysicalSize<u32>,
) -> MiniPlayerPosition {
    let monitor = window
        .app_handle()
        .get_webview_window("main")
        .and_then(|main| main.current_monitor().ok().flatten())
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());

    let Some(monitor) = monitor else {
        return MiniPlayerPosition { x: 24, y: 24 };
    };

    let work_area = monitor.work_area();
    bottom_right_position(size, work_area.position, work_area.size)
}

fn bottom_right_position(
    size: PhysicalSize<u32>,
    work_area_position: PhysicalPosition<i32>,
    work_area_size: PhysicalSize<u32>,
) -> MiniPlayerPosition {
    let area_x = i64::from(work_area_position.x);
    let area_y = i64::from(work_area_position.y);
    let area_right = area_x + i64::from(work_area_size.width);
    let area_bottom = area_y + i64::from(work_area_size.height);
    let max_x = area_right - i64::from(size.width) - MINI_PLAYER_MARGIN;
    let max_y = area_bottom - i64::from(size.height) - MINI_PLAYER_MARGIN;

    MiniPlayerPosition {
        x: max_x.max(area_x).min(i64::from(i32::MAX)) as i32,
        y: max_y.max(area_y).min(i64::from(i32::MAX)) as i32,
    }
}

fn apply_mini_player_position(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    let size = mini_player_size(window);
    let position = load_mini_player_position(app)
        .filter(|position| saved_position_is_visible(window, *position, size))
        .unwrap_or_else(|| default_mini_player_position(window, size));

    if window
        .set_position(Position::Physical(PhysicalPosition::new(
            position.x, position.y,
        )))
        .is_ok()
    {
        save_mini_player_position(app, position);
    }
}

#[cfg(test)]
mod mini_player_position_tests {
    use super::*;

    #[test]
    fn default_uses_bottom_right_of_work_area() {
        // A secondary monitor left of the primary, with a taskbar reserved below.
        let origin = PhysicalPosition::new(-1920, 0);
        let area = PhysicalSize::new(1920, 1040);
        let size = PhysicalSize::new(340, 400);
        let position = bottom_right_position(size, origin, area);
        assert_eq!((position.x, position.y), (-364, 616));
        assert!(position_fits_work_area(position, size, origin, area));
    }

    #[test]
    fn rejects_disconnected_display_and_partially_hidden_positions() {
        let origin = PhysicalPosition::new(0, 40);
        let area = PhysicalSize::new(1920, 1040);
        let size = PhysicalSize::new(340, 400);
        for position in [
            MiniPlayerPosition { x: -800, y: 100 },
            MiniPlayerPosition { x: 1800, y: 100 },
            MiniPlayerPosition { x: 100, y: 0 },
            MiniPlayerPosition {
                x: i32::MAX,
                y: i32::MIN,
            },
        ] {
            assert!(!position_fits_work_area(position, size, origin, area));
        }
    }

    #[test]
    fn small_work_area_keeps_top_left_controls_reachable() {
        let position = bottom_right_position(
            PhysicalSize::new(340, 400),
            PhysicalPosition::new(0, 40),
            PhysicalSize::new(300, 300),
        );
        assert_eq!((position.x, position.y), (0, 40));
    }

    #[test]
    fn saved_coordinates_round_trip_and_invalid_json_is_rejected() {
        let position = MiniPlayerPosition { x: -364, y: 616 };
        let json = serde_json::to_string(&position).unwrap();
        let restored: MiniPlayerPosition = serde_json::from_str(&json).unwrap();
        assert_eq!((restored.x, restored.y), (position.x, position.y));
        for invalid in ["{", r#"{"x":null,"y":0}"#, r#"{"x":1e100,"y":0}"#] {
            assert!(serde_json::from_str::<MiniPlayerPosition>(invalid).is_err());
        }
    }
}

fn ensure_yt_dlp() -> Result<PathBuf, String> {
    // 1. Check if yt-dlp.exe is right next to the running executable
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            let adjacent = parent.join("yt-dlp.exe");
            if adjacent.exists() {
                return Ok(adjacent);
            }
        }
    }

    // 2. Check or extract to %LOCALAPPDATA%\RewindMusicPlayer\yt-dlp.exe
    let cache_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("RewindMusicPlayer");

    let target = cache_dir.join("yt-dlp.exe");

    if target.exists() {
        if let Ok(meta) = fs::metadata(&target) {
            if meta.len() == EMBEDDED_YT_DLP.len() as u64 {
                return Ok(target);
            }
        }
    }

    if let Err(_) = fs::create_dir_all(&cache_dir) {
        let temp_dir = std::env::temp_dir().join("RewindMusicPlayer");
        let _ = fs::create_dir_all(&temp_dir);
        let temp_target = temp_dir.join("yt-dlp.exe");
        fs::write(&temp_target, EMBEDDED_YT_DLP)
            .map_err(|e| format!("Failed to extract yt-dlp to temp: {e}"))?;
        return Ok(temp_target);
    }

    fs::write(&target, EMBEDDED_YT_DLP)
        .map_err(|e| format!("Failed to extract embedded yt-dlp: {e}"))?;

    Ok(target)
}

#[tauri::command]
async fn resolve_stream_url(video_id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let yt_dlp_path = ensure_yt_dlp()?;
        let mut cmd = std::process::Command::new(&yt_dlp_path);

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let watch_url = format!("https://www.youtube.com/watch?v={video_id}");

        // Primary attempt: Android/Web client with ba/b and force-ipv4 for unthrottled ratebypass streams
        cmd.args([
            "-f",
            "ba/b",
            "-g",
            "--force-ipv4",
            "--socket-timeout",
            "8",
            "--retries",
            "1",
            "--extractor-retries",
            "1",
            "--extractor-args",
            "youtube:player_client=android,web",
            "--no-warnings",
            "--no-playlist",
            &watch_url,
        ]);

        let output = cmd
            .output()
            .map_err(|e| format!("Failed to run yt-dlp: {e}"))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines().rev() {
                let line = line.trim();
                if line.starts_with("http") {
                    return Ok(line.to_string());
                }
            }
        }

        // Secondary attempt: standard ba[ext=m4a]/ba/b without client override if video is restricted on android
        let mut fallback_cmd = std::process::Command::new(&yt_dlp_path);
        #[cfg(windows)]
        fallback_cmd.creation_flags(CREATE_NO_WINDOW);

        fallback_cmd.args([
            "-f",
            "ba[ext=m4a]/ba/b",
            "-g",
            "--force-ipv4",
            "--socket-timeout",
            "8",
            "--retries",
            "1",
            "--extractor-retries",
            "1",
            "--no-warnings",
            "--no-playlist",
            &watch_url,
        ]);

        if let Ok(fb_out) = fallback_cmd.output() {
            if fb_out.status.success() {
                let stdout = String::from_utf8_lossy(&fb_out.stdout);
                for line in stdout.lines().rev() {
                    let line = line.trim();
                    if line.starts_with("http") {
                        return Ok(line.to_string());
                    }
                }
            }
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("No playable audio stream URL returned: {stderr}"))
    })
    .await
    .map_err(|e| format!("Stream resolve task error: {e}"))?
}

#[derive(serde::Serialize)]
struct SearchTrackResult {
    id: String,
    #[serde(rename = "videoId")]
    video_id: String,
    title: String,
    artist: String,
    album: String,
    genre: String,
    year: Option<u32>,
    duration: u64,
    cover: String,
    source: String,
}

#[tauri::command]
async fn search_tracks_native(query: String) -> Result<Vec<SearchTrackResult>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let yt_dlp_path = ensure_yt_dlp()?;
        let mut cmd = std::process::Command::new(yt_dlp_path);

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let search_arg = format!("ytsearch12:{query}");
        cmd.args([
            &search_arg,
            "--flat-playlist",
            "--print",
            "%(id)s\t%(title)s\t%(uploader)s\t%(duration)s",
            "--no-warnings",
        ]);

        let output = cmd
            .output()
            .map_err(|e| format!("Failed to execute search: {e}"))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut results = Vec::new();
            for line in stdout.lines() {
                let parts: Vec<&str> = line.trim().split('\t').collect();
                if parts.len() >= 2 {
                    let video_id = parts[0].trim().to_string();
                    let title = parts[1].trim().to_string();
                    let artist = if parts.len() > 2 && !parts[2].trim().is_empty() {
                        parts[2].trim().to_string()
                    } else {
                        "YouTube Artist".to_string()
                    };
                    let duration: u64 = if parts.len() > 3 {
                        parts[3].trim().parse().unwrap_or(180)
                    } else {
                        180
                    };
                    if !video_id.is_empty() && !video_id.starts_with("http") {
                        results.push(SearchTrackResult {
                            id: format!("yt-{video_id}"),
                            cover: format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"),
                            video_id,
                            title,
                            artist,
                            album: "YouTube Music".to_string(),
                            genre: "Search Discovery".to_string(),
                            year: None,
                            duration,
                            source: "youtube".to_string(),
                        });
                    }
                }
            }
            Ok(results)
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("yt-dlp search error: {stderr}"))
        }
    })
    .await
    .map_err(|e| format!("Search task error: {e}"))?
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct YouTubePlaylistTrack {
    pub id: String,
    #[serde(rename = "videoId")]
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub genre: String,
    pub year: Option<u32>,
    pub duration: u64,
    pub cover: String,
    pub source: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct YouTubePlaylistResult {
    pub id: String,
    #[serde(rename = "youtubeId")]
    pub youtube_id: String,
    pub title: String,
    pub description: String,
    pub cover: String,
    #[serde(rename = "trackCount")]
    pub track_count: usize,
    #[serde(rename = "totalDuration")]
    pub total_duration: u64,
    pub tracks: Vec<YouTubePlaylistTrack>,
}

#[tauri::command]
async fn import_youtube_playlist(url_or_id: String) -> Result<YouTubePlaylistResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let raw = url_or_id.trim();
        if raw.is_empty() {
            return Err("Playlist URL or ID cannot be empty".to_string());
        }

        let url = if raw.starts_with("http://") || raw.starts_with("https://") {
            raw.to_string()
        } else {
            format!("https://www.youtube.com/playlist?list={raw}")
        };

        let yt_dlp_path = ensure_yt_dlp()?;
        let mut cmd = std::process::Command::new(yt_dlp_path);

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        cmd.args([
            "-J",
            "--flat-playlist",
            "--no-warnings",
            &url,
        ]);

        let output = cmd
            .output()
            .map_err(|e| format!("Failed to execute playlist extraction: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to load playlist from YouTube: {stderr}"));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let json: serde_json::Value = serde_json::from_str(&stdout)
            .map_err(|e| format!("Failed to parse playlist data: {e}"))?;

        let pl_id = json["id"].as_str().unwrap_or("").to_string();
        let pl_title = json["title"].as_str().unwrap_or("YouTube Playlist").to_string();
        let pl_desc = json["description"].as_str().unwrap_or("").to_string();

        let mut pl_cover = String::new();
        if let Some(thumbs) = json["thumbnails"].as_array() {
            if let Some(last) = thumbs.last() {
                if let Some(u) = last["url"].as_str() {
                    pl_cover = u.to_string();
                }
            }
        }

        let mut tracks = Vec::new();
        let mut total_duration = 0u64;

        if let Some(entries) = json["entries"].as_array() {
            for (idx, entry) in entries.iter().enumerate() {
                let vid = match entry["id"].as_str() {
                    Some(v) if !v.is_empty() => v,
                    _ => continue,
                };

                let raw_title = entry["title"].as_str().unwrap_or("Untitled Track");
                let mut title = raw_title.to_string();
                let mut artist = entry["uploader"]
                    .as_str()
                    .or_else(|| entry["channel"].as_str())
                    .unwrap_or("Various Artists")
                    .to_string();

                // Clean common MV/Audio noise
                for pattern in &[" [Official MV]", " (Official MV)", " [Official Video]", " (Official Video)", " [Official Music Video]", " (Official Music Video)", " [Audio]", " (Audio)", " [Lyric Video]", " (Lyric Video)"] {
                    title = title.replace(pattern, "");
                }

                if title.contains(" - ") {
                    let parts: Vec<&str> = title.splitn(2, " - ").collect();
                    if parts.len() == 2 && !parts[0].trim().is_empty() {
                        artist = parts[0].trim().to_string();
                        title = parts[1].trim().to_string();
                    }
                }

                let dur = entry["duration"].as_u64().unwrap_or(180);
                total_duration += dur;

                let mut track_cover = format!("https://i.ytimg.com/vi/{vid}/hqdefault.jpg");
                if let Some(t_array) = entry["thumbnails"].as_array() {
                    if let Some(t_last) = t_array.last() {
                        if let Some(u) = t_last["url"].as_str() {
                            track_cover = u.to_string();
                        }
                    }
                }

                if pl_cover.is_empty() && idx == 0 {
                    pl_cover = track_cover.clone();
                }

                tracks.push(YouTubePlaylistTrack {
                    id: format!("pl-{vid}"),
                    video_id: vid.to_string(),
                    title,
                    artist,
                    album: pl_title.clone(),
                    genre: "YouTube Playlist".to_string(),
                    year: Some(2026),
                    duration: dur,
                    cover: track_cover,
                    source: "youtube".to_string(),
                });
            }
        }

        if pl_cover.is_empty() {
            pl_cover = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80".to_string();
        }

        let track_count = tracks.len();

        Ok(YouTubePlaylistResult {
            id: format!("yt-pl-{}", if pl_id.is_empty() { format!("{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()) } else { pl_id.clone() }),
            youtube_id: pl_id,
            title: pl_title,
            description: pl_desc,
            cover: pl_cover,
            track_count,
            total_duration,
            tracks,
        })
    })
    .await
    .map_err(|e| format!("Playlist import task error: {e}"))?
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SpotifyTrackItem {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub duration: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SpotifyPlaylistResult {
    pub id: String,
    #[serde(rename = "spotifyId")]
    pub spotify_id: String,
    pub title: String,
    pub description: String,
    pub cover: String,
    #[serde(rename = "trackCount")]
    pub track_count: usize,
    #[serde(rename = "totalDuration")]
    pub total_duration: u64,
    pub tracks: Vec<SpotifyTrackItem>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct MatchedYouTubeTrack {
    #[serde(rename = "videoId")]
    pub video_id: String,
    pub title: String,
    pub duration: u64,
    pub cover: String,
}

fn extract_spotify_playlist_id(input: &str) -> Option<String> {
    let raw = input.trim();
    if raw.is_empty() {
        return None;
    }

    if let Some(rest) = raw.strip_prefix("spotify:playlist:") {
        let id = rest.split(['?', '&', ':']).next().unwrap_or("").trim();
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }

    if raw.contains("spotify.com") {
        if let Some(idx) = raw.find("/playlist/") {
            let after = &raw[idx + "/playlist/".len()..];
            let id = after.split(['?', '&', '/', '#']).next().unwrap_or("").trim();
            if !id.is_empty() {
                return Some(id.to_string());
            }
        }
    }

    let clean = raw.split(['?', '&', '/', ':']).next().unwrap_or("").trim();
    if clean.len() >= 15 && clean.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Some(clean.to_string());
    }

    None
}

fn fetch_spotify_playlist_sync(url_or_id: String) -> Result<SpotifyPlaylistResult, String> {
    let playlist_id = extract_spotify_playlist_id(&url_or_id).ok_or_else(|| {
        "Invalid Spotify playlist URL or ID. Please paste a link like https://open.spotify.com/playlist/...".to_string()
    })?;

    let embed_url = format!("https://open.spotify.com/embed/playlist/{playlist_id}");
    let response = ureq::get(&embed_url)
        .set(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .set("Accept-Language", "en-US,en;q=0.9")
        .timeout(std::time::Duration::from_secs(12))
        .call()
        .map_err(|e| format!("Failed to reach Spotify: {e}"))?;

    let html = response
        .into_string()
        .map_err(|e| format!("Failed to read Spotify response: {e}"))?;

    let marker_start = "<script id=\"__NEXT_DATA__\" type=\"application/json\">";
    let start_idx = html.find(marker_start).ok_or_else(|| {
        "Could not find Spotify playlist data. Ensure the playlist is public.".to_string()
    })?;
    let json_start = start_idx + marker_start.len();
    let json_end = html[json_start..]
        .find("</script>")
        .ok_or_else(|| "Malformed Spotify playlist page data.".to_string())?;
    let json_str = &html[json_start..json_start + json_end];

    let v: serde_json::Value =
        serde_json::from_str(json_str).map_err(|e| format!("Failed to parse Spotify JSON: {e}"))?;

    let entity = v
        .pointer("/props/pageProps/state/data/entity")
        .ok_or_else(|| "Spotify playlist entity not found. Ensure the playlist is public.".to_string())?;

    let title = entity["name"]
        .as_str()
        .or_else(|| entity["title"].as_str())
        .unwrap_or("Spotify Playlist")
        .to_string();

    let subtitle = entity["subtitle"].as_str().unwrap_or("Spotify").to_string();
    let mut description = format!("Imported from Spotify by {subtitle}");
    if let Some(attrs) = entity["attributes"].as_array() {
        for attr in attrs {
            if attr["key"].as_str() == Some("episode_description") {
                if let Some(desc) = attr["value"].as_str() {
                    if !desc.trim().is_empty() {
                        description = desc.trim().to_string();
                        break;
                    }
                }
            }
        }
    }

    let mut cover = String::new();
    if let Some(sources) = entity.pointer("/coverArt/sources").and_then(|s| s.as_array()) {
        if let Some(first) = sources.first() {
            if let Some(u) = first["url"].as_str() {
                cover = u.to_string();
            }
        }
    }
    if cover.is_empty() {
        cover = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80".to_string();
    }

    let mut tracks = Vec::new();
    let mut total_duration = 0u64;

    if let Some(raw_tracks) = entity["trackList"].as_array() {
        for (i, t) in raw_tracks.iter().enumerate() {
            let t_title = t["title"].as_str().unwrap_or("Untitled").trim().to_string();
            let t_artist = t["subtitle"].as_str().unwrap_or("Various Artists").trim().to_string();
            let dur_ms = t["duration"].as_u64().unwrap_or(180_000);
            let dur_secs = (dur_ms / 1000).max(1);
            total_duration += dur_secs;

            let track_id = t["uri"]
                .as_str()
                .map(|u| u.replace("spotify:track:", ""))
                .filter(|id| !id.is_empty())
                .unwrap_or_else(|| format!("sp-{playlist_id}-{i}"));

            tracks.push(SpotifyTrackItem {
                id: track_id,
                title: t_title,
                artist: t_artist,
                duration: dur_secs,
            });
        }
    }

    let track_count = tracks.len();

    Ok(SpotifyPlaylistResult {
        id: format!("sp-pl-{playlist_id}"),
        spotify_id: playlist_id,
        title,
        description,
        cover,
        track_count,
        total_duration,
        tracks,
    })
}

#[tauri::command]
async fn fetch_spotify_playlist(url_or_id: String) -> Result<SpotifyPlaylistResult, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_spotify_playlist_sync(url_or_id))
        .await
        .map_err(|e| format!("Spotify fetch task error: {e}"))?
}

fn parse_duration_string(s: &str) -> u64 {
    let parts: Vec<&str> = s.split(':').collect();
    match parts.len() {
        2 => {
            let m: u64 = parts[0].trim().parse().unwrap_or(3);
            let sec: u64 = parts[1].trim().parse().unwrap_or(0);
            m * 60 + sec
        }
        3 => {
            let h: u64 = parts[0].trim().parse().unwrap_or(0);
            let m: u64 = parts[1].trim().parse().unwrap_or(0);
            let sec: u64 = parts[2].trim().parse().unwrap_or(0);
            h * 3600 + m * 60 + sec
        }
        _ => 180,
    }
}

fn search_youtube_html_extract(query: &str) -> Option<(String, String, u64)> {
    let mut encoded = String::new();
    for b in query.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            encoded.push(b as char);
        } else if b == b' ' {
            encoded.push('+');
        } else {
            encoded.push_str(&format!("%{:02X}", b));
        }
    }

    let search_url = format!("https://www.youtube.com/results?search_query={encoded}");

    let resp = ureq::get(&search_url)
        .set(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .set("Accept-Language", "en-US,en;q=0.9")
        .timeout(std::time::Duration::from_secs(6))
        .call()
        .ok()?;

    let html = resp.into_string().ok()?;

    if let Some(data_idx) = html.find("ytInitialData = ") {
        let slice = &html[data_idx + "ytInitialData = ".len()..];
        if let Some(end_idx) = slice.find(";</script>") {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&slice[..end_idx]) {
                if let Some(sections) = v
                    .pointer("/contents/twoColumnSearchResultsRenderer/primaryContents/sectionListRenderer/contents")
                    .and_then(|c| c.as_array())
                {
                    for section in sections {
                        if let Some(items) = section
                            .pointer("/itemSectionRenderer/contents")
                            .and_then(|i| i.as_array())
                        {
                            for item in items {
                                if let Some(video) = item.get("videoRenderer") {
                                    if let Some(vid) = video["videoId"].as_str() {
                                        if !vid.is_empty() {
                                            let title = video
                                                .pointer("/title/runs/0/text")
                                                .and_then(|t| t.as_str())
                                                .unwrap_or(query)
                                                .to_string();
                                            let dur_sec = parse_duration_string(
                                                video
                                                    .pointer("/lengthText/simpleText")
                                                    .and_then(|s| s.as_str())
                                                    .unwrap_or("3:00"),
                                            );
                                            return Some((vid.to_string(), title, dur_sec));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(idx) = html.find("\"videoId\":\"") {
        let after = &html[idx + "\"videoId\":\"".len()..];
        if after.len() >= 11 {
            let vid = &after[..11];
            if vid
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
            {
                return Some((vid.to_string(), query.to_string(), 180));
            }
        }
    }

    None
}

fn match_track_to_youtube_sync(artist: String, title: String) -> Result<MatchedYouTubeTrack, String> {
    let clean_title = title
        .replace(&['(', ')', '[', ']'][..], " ")
        .trim()
        .to_string();
    let query = format!("{artist} - {clean_title} audio");

    if let Some((vid, yt_title, dur)) = search_youtube_html_extract(&query) {
        return Ok(MatchedYouTubeTrack {
            video_id: vid.clone(),
            title: yt_title,
            duration: dur,
            cover: format!("https://i.ytimg.com/vi/{vid}/hqdefault.jpg"),
        });
    }

    let yt_dlp_path = ensure_yt_dlp()?;
    let mut cmd = std::process::Command::new(yt_dlp_path);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let search_arg = format!("ytsearch1:{query}");
    cmd.args([
        &search_arg,
        "--flat-playlist",
        "--print",
        "%(id)s\t%(title)s\t%(duration)s",
        "--no-warnings",
    ]);

    let output = cmd.output().map_err(|e| format!("Failed to search with yt-dlp: {e}"))?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(line) = stdout.lines().next() {
            let parts: Vec<&str> = line.trim().split('\t').collect();
            if !parts.is_empty() && !parts[0].trim().is_empty() {
                let vid = parts[0].trim().to_string();
                let yt_title = if parts.len() > 1 && !parts[1].trim().is_empty() {
                    parts[1].trim().to_string()
                } else {
                    format!("{artist} - {title}")
                };
                let dur: u64 = if parts.len() > 2 {
                    parts[2].trim().parse().unwrap_or(180)
                } else {
                    180
                };
                return Ok(MatchedYouTubeTrack {
                    cover: format!("https://i.ytimg.com/vi/{vid}/hqdefault.jpg"),
                    video_id: vid,
                    title: yt_title,
                    duration: dur,
                });
            }
        }
    }

    Err(format!("Could not find YouTube track for {artist} - {title}"))
}

#[tauri::command]
async fn match_track_to_youtube(
    artist: String,
    title: String,
) -> Result<MatchedYouTubeTrack, String> {
    tauri::async_runtime::spawn_blocking(move || match_track_to_youtube_sync(artist, title))
        .await
        .map_err(|e| format!("YouTube match task error: {e}"))?
}

#[tauri::command]
async fn match_spotify_tracks_batch(
    tracks: Vec<SpotifyTrackItem>,
) -> Result<Vec<Option<MatchedYouTubeTrack>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut results = Vec::with_capacity(tracks.len());
        let mut remaining = tracks.into_iter();
        loop {
            let batch: Vec<SpotifyTrackItem> = remaining.by_ref().take(6).collect();
            if batch.is_empty() {
                break;
            }
            let batch_results = std::thread::scope(|scope| {
                let handles = batch.into_iter().map(|track| {
                    scope.spawn(move || match_track_to_youtube_sync(track.artist, track.title).ok())
                }).collect::<Vec<_>>();
                handles.into_iter().map(|handle| handle.join().unwrap_or(None)).collect::<Vec<_>>()
            });
            results.extend(batch_results);
        }
        Ok(results)
    })
    .await
    .map_err(|e| format!("Batch match task error: {e}"))?
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DownloadedTrack {
    pub id: String,
    #[serde(rename = "videoId")]
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub duration: Option<u64>,
    pub cover: Option<String>,
    #[serde(rename = "downloadedAt")]
    pub downloaded_at: u64,
    #[serde(rename = "filePath")]
    pub file_path: String,
    #[serde(rename = "fileName")]
    pub file_name: String,
    #[serde(rename = "fileSize")]
    pub file_size: u64,
}

fn is_audio_file(path: &std::path::Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        matches!(
            ext.to_lowercase().as_str(),
            "m4a" | "mp3" | "wav" | "ogg" | "flac" | "aac" | "opus" | "webm" | "wma"
        )
    } else {
        false
    }
}

fn load_metadata(folder: &std::path::Path) -> std::collections::HashMap<String, DownloadedTrack> {
    let meta_file = folder.join(".rewind-metadata.json");
    if meta_file.exists() {
        if let Ok(data) = fs::read_to_string(&meta_file) {
            if let Ok(map) = serde_json::from_str::<std::collections::HashMap<String, DownloadedTrack>>(&data) {
                return map;
            }
        }
    }
    std::collections::HashMap::new()
}

fn save_metadata(folder: &std::path::Path, map: &std::collections::HashMap<String, DownloadedTrack>) {
    let meta_file = folder.join(".rewind-metadata.json");
    if let Ok(data) = serde_json::to_string_pretty(map) {
        let _ = fs::write(meta_file, data);
    }
}

fn parse_filename_metadata(stem: &str) -> (String, String) {
    if let Some((artist, title)) = stem.split_once(" - ") {
        (artist.trim().to_string(), title.trim().to_string())
    } else {
        ("Local Artist".to_string(), stem.trim().to_string())
    }
}

#[tauri::command]
#[allow(non_snake_case)]
async fn download_track_native(
    videoId: String,
    title: String,
    artist: Option<String>,
    album: Option<String>,
    year: Option<u32>,
    genre: Option<String>,
    duration: Option<u64>,
    cover: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let yt_dlp_path = ensure_yt_dlp()?;

        let music_dir = dirs::audio_dir().unwrap_or_else(|| {
            dirs::home_dir()
                .map(|h| h.join("Music"))
                .unwrap_or_else(|| PathBuf::from("."))
        });
        let download_folder = music_dir.join("Rewind Downloads");
        if !download_folder.exists() {
            std::fs::create_dir_all(&download_folder)
                .map_err(|e| format!("Failed to create download folder: {e}"))?;
        }

        let clean_title = title.replace(&['\\', '/', ':', '*', '?', '"', '<', '>', '|'][..], "_");
        let filename = if let Some(ref a) = artist {
            let clean_artist = a.replace(&['\\', '/', ':', '*', '?', '"', '<', '>', '|'][..], "_");
            format!("{clean_artist} - {clean_title}.m4a")
        } else {
            format!("{clean_title}.m4a")
        };

        let target_file = download_folder.join(&filename);

        let mut cmd = std::process::Command::new(yt_dlp_path);
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let watch_url = format!("https://www.youtube.com/watch?v={videoId}");
        cmd.args([
            "-f",
            "ba[ext=m4a]/ba/b",
            "-o",
            target_file.to_str().ok_or("Invalid download path")?,
            "--no-warnings",
            "--no-playlist",
            &watch_url,
        ]);

        let output = cmd
            .output()
            .map_err(|e| format!("Failed to run download: {e}"))?;

        if output.status.success() {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;

            let file_size = fs::metadata(&target_file).map(|m| m.len()).unwrap_or(0);

            let mut metadata = load_metadata(&download_folder);
            let track = DownloadedTrack {
                id: format!("local-{}", videoId),
                video_id: videoId.clone(),
                title: title.clone(),
                artist: artist.clone().unwrap_or_else(|| "YouTube Artist".to_string()),
                album: album.or_else(|| Some("Single".to_string())),
                year,
                genre,
                duration,
                cover: cover.or_else(|| Some(format!("https://i.ytimg.com/vi/{videoId}/hqdefault.jpg"))),
                downloaded_at: now,
                file_path: target_file.to_string_lossy().to_string(),
                file_name: filename.clone(),
                file_size,
            };
            metadata.insert(filename, track);
            save_metadata(&download_folder, &metadata);

            Ok(target_file.to_string_lossy().to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("yt-dlp download error: {stderr}"))
        }
    })
    .await
    .map_err(|e| format!("Download task error: {e}"))?
}

fn get_downloads_folder_sync() -> Result<String, String> {
    let music_dir = dirs::audio_dir().unwrap_or_else(|| {
        dirs::home_dir()
            .map(|h| h.join("Music"))
            .unwrap_or_else(|| PathBuf::from("."))
    });
    let download_folder = music_dir.join("Rewind Downloads");
    if !download_folder.exists() {
        let _ = std::fs::create_dir_all(&download_folder);
    }
    Ok(download_folder.to_string_lossy().to_string())
}

#[tauri::command]
async fn get_downloads_folder() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(get_downloads_folder_sync)
        .await
        .map_err(|e| format!("Folder path task error: {e}"))?
}

fn scan_downloads_folder_sync() -> Result<Vec<DownloadedTrack>, String> {
    let folder_str = get_downloads_folder_sync()?;
    let folder = PathBuf::from(&folder_str);
    if !folder.exists() {
        return Ok(Vec::new());
    }

    let mut metadata = load_metadata(&folder);
    let mut tracks = Vec::new();
    let mut found_filenames = std::collections::HashSet::new();
    let mut dirty = false;

    let entries = fs::read_dir(&folder).map_err(|e| format!("Failed to read folder: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && is_audio_file(&path) {
            if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                let filename_str = filename.to_string();
                found_filenames.insert(filename_str.clone());

                let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                let modified_at = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or_else(|| {
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64
                    });

                if let Some(mut existing) = metadata.get(&filename_str).cloned() {
                    existing.file_path = path.to_string_lossy().to_string();
                    existing.file_name = filename_str;
                    existing.file_size = file_size;
                    if existing.id.is_empty() {
                        existing.id = format!("local-{}", existing.video_id);
                    }
                    tracks.push(existing);
                } else {
                    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(&filename_str);
                    let (artist, title) = parse_filename_metadata(stem);
                    let clean_id = format!("local-{}", filename_str.replace(' ', "_"));
                    let track = DownloadedTrack {
                        id: clean_id.clone(),
                        video_id: clean_id,
                        title,
                        artist,
                        album: Some("Rewind Downloads".to_string()),
                        year: None,
                        genre: Some("Local Audio".to_string()),
                        duration: Some(180),
                        cover: None,
                        downloaded_at: modified_at,
                        file_path: path.to_string_lossy().to_string(),
                        file_name: filename_str.clone(),
                        file_size,
                    };
                    metadata.insert(filename_str, track.clone());
                    tracks.push(track);
                    dirty = true;
                }
            }
        }
    }

    // Prune entries for deleted files
    let initial_count = metadata.len();
    metadata.retain(|filename, _| found_filenames.contains(filename));
    if metadata.len() != initial_count {
        dirty = true;
    }

    if dirty {
        save_metadata(&folder, &metadata);
    }

    // Sort newest first
    tracks.sort_by(|a, b| b.downloaded_at.cmp(&a.downloaded_at));

    Ok(tracks)
}

#[tauri::command]
async fn scan_downloads_folder() -> Result<Vec<DownloadedTrack>, String> {
    tauri::async_runtime::spawn_blocking(scan_downloads_folder_sync)
        .await
        .map_err(|e| format!("Folder scan task error: {e}"))?
}

fn delete_downloaded_track_sync(file_path: String) -> Result<bool, String> {
    let folder_str = get_downloads_folder_sync()?;
    let folder = PathBuf::from(&folder_str);
    let target = PathBuf::from(&file_path);

    if target.exists() {
        if target.starts_with(&folder) {
            fs::remove_file(&target).map_err(|e| format!("Failed to delete file: {e}"))?;

            if let Some(filename) = target.file_name().and_then(|f| f.to_str()) {
                let mut metadata = load_metadata(&folder);
                metadata.remove(filename);
                save_metadata(&folder, &metadata);
            }
            Ok(true)
        } else {
            Err("Target file is outside of Rewind Downloads directory".to_string())
        }
    } else {
        // If file is already deleted externally, prune metadata
        if let Some(filename) = target.file_name().and_then(|f| f.to_str()) {
            let mut metadata = load_metadata(&folder);
            metadata.remove(filename);
            save_metadata(&folder, &metadata);
        }
        Ok(true)
    }
}

#[tauri::command]
#[allow(non_snake_case)]
async fn delete_downloaded_track(filePath: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || delete_downloaded_track_sync(filePath))
        .await
        .map_err(|e| format!("Delete track task error: {e}"))?
}

#[tauri::command]
async fn open_downloads_folder() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        let folder = get_downloads_folder_sync()?;
        #[cfg(windows)]
        {
            let mut cmd = std::process::Command::new("explorer.exe");
            cmd.arg(&folder);
            cmd.spawn()
                .map_err(|e| format!("Failed to launch explorer: {e}"))?;
        }
        #[cfg(not(windows))]
        {
            open::that(&folder).map_err(|e| format!("Failed to open folder: {e}"))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Open folder task error: {e}"))?
}

#[tauri::command]
fn app_show_mini_player(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(mini) = app.get_webview_window("mini") {
        apply_mini_player_position(&app, &mini);
        mini.unminimize().map_err(|e| e.to_string())?;
        mini.show().map_err(|e| e.to_string())?;
        mini.set_always_on_top(true).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn app_minimize_window(window: tauri::Window, app: tauri::AppHandle) -> Result<(), String> {
    // Show the companion before minimizing the main WebView. On Windows the
    // minimized WebView may be suspended immediately, which can otherwise
    // prevent the follow-up JavaScript show call from running.
    app_show_mini_player(app)?;
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn app_toggle_maximize_window(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn app_close_window(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn app_is_maximized(window: tauri::Window) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            resolve_stream_url,
            search_tracks_native,
            download_track_native,
            scan_downloads_folder,
            delete_downloaded_track,
            get_downloads_folder,
            open_downloads_folder,
            app_show_mini_player,
            app_minimize_window,
            app_toggle_maximize_window,
            app_close_window,
            app_is_maximized,
            import_youtube_playlist,
            fetch_spotify_playlist,
            match_track_to_youtube,
            match_spotify_tracks_batch,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            if let Some(mini) = app.get_webview_window("mini") {
                apply_mini_player_position(app.handle(), &mini);

                let app_handle = app.handle().clone();
                mini.on_window_event(move |event| {
                    if let tauri::WindowEvent::Moved(position) = event {
                        if let Some(mini) = app_handle.get_webview_window("mini") {
                            let position = MiniPlayerPosition {
                                x: position.x,
                                y: position.y,
                            };
                            if mini.is_visible().unwrap_or(false)
                                && !mini.is_minimized().unwrap_or(true)
                                && saved_position_is_visible(
                                    &mini,
                                    position,
                                    mini_player_size(&mini),
                                )
                            {
                                save_mini_player_position(&app_handle, position);
                            }
                        }
                    }
                });
            }

            if let Some(main) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                main.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::Focused(true)) {
                        if let Some(mini) = app_handle.get_webview_window("mini") {
                            let _ = mini.hide();
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
