use std::fs;
use std::path::PathBuf;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const EMBEDDED_YT_DLP: &[u8] = include_bytes!("../binaries/yt-dlp-x86_64-pc-windows-msvc.exe");

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
    let yt_dlp_path = ensure_yt_dlp()?;
    let mut cmd = std::process::Command::new(yt_dlp_path);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let watch_url = format!("https://www.youtube.com/watch?v={video_id}");
    cmd.args([
        "-f",
        "ba[ext=m4a]/ba/b",
        "-g",
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
        Err("No playable audio stream URL returned".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("yt-dlp stream extraction error: {stderr}"))
    }
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
}

#[tauri::command]
fn scan_downloads_folder() -> Result<Vec<DownloadedTrack>, String> {
    let folder_str = get_downloads_folder()?;
    let folder = PathBuf::from(&folder_str);
    if !folder.exists() {
        return Ok(Vec::new());
    }

    let mut metadata = load_metadata(&folder);
    let mut tracks = Vec::new();
    let mut found_filenames = std::collections::HashSet::new();

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
                }
            }
        }
    }

    // Prune entries for deleted files
    metadata.retain(|filename, _| found_filenames.contains(filename));
    save_metadata(&folder, &metadata);

    // Sort newest first
    tracks.sort_by(|a, b| b.downloaded_at.cmp(&a.downloaded_at));

    Ok(tracks)
}

#[tauri::command]
#[allow(non_snake_case)]
fn delete_downloaded_track(filePath: String) -> Result<bool, String> {
    let folder_str = get_downloads_folder()?;
    let folder = PathBuf::from(&folder_str);
    let target = PathBuf::from(&filePath);

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
fn get_downloads_folder() -> Result<String, String> {
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
fn open_downloads_folder() -> Result<(), String> {
    let folder = get_downloads_folder()?;
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
}

#[tauri::command]
fn app_minimize_window(window: tauri::Window) -> Result<(), String> {
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
            app_minimize_window,
            app_toggle_maximize_window,
            app_close_window,
            app_is_maximized,
            import_youtube_playlist,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
