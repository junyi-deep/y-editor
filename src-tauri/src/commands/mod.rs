use crate::{
    error::{error, AppResult},
    settings::Settings,
    workspace::{atomic_write, Document, Entry},
};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
#[derive(Serialize)]
pub struct AppInfo {
    name: &'static str,
    version: &'static str,
    platform: &'static str,
}
#[tauri::command]
pub fn app_info() -> AppInfo {
    AppInfo {
        name: "y-editor",
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    settings: Settings,
    root: Option<String>,
    config_dir: String,
    recovery: Option<Recovery>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recovery {
    pub path: Option<String>,
    pub content: String,
    pub disk_hash: String,
    pub line_ending: String,
    pub bom: bool,
    pub saved_at: u64,
}
#[tauri::command]
pub fn bootstrap(state: crate::windows::WindowState) -> AppResult<Bootstrap> {
    let mut recovery: Option<Recovery> =
        crate::database::get(&state.directory, &state.recovery_key())?;
    if state.label == "main" && recovery.is_none() {
        recovery = crate::database::get(&state.directory, "recovery")?;
        if let Some(ref draft) = recovery {
            crate::database::put(&state.directory, &state.recovery_key(), draft)?;
            crate::database::remove(&state.directory, "recovery")?;
        }
    }
    if let Some(path) = recovery.as_ref().and_then(|draft| draft.path.as_ref()) {
        let _ = state
            .workspace
            .lock()
            .map_err(|_| error("工作目录锁错误"))?
            .grant(Path::new(path));
    }
    crate::resources::workspace_flags(&state.directory, &crate::resources::workspace_id(&state)?)?;
    Ok(Bootstrap {
        settings: state
            .settings
            .lock()
            .map_err(|_| error("配置锁错误"))?
            .clone(),
        root: state
            .workspace
            .lock()
            .map_err(|_| error("工作目录锁错误"))?
            .root
            .as_ref()
            .map(|p| p.to_string_lossy().into_owned()),
        config_dir: state.directory.to_string_lossy().into_owned(),
        recovery,
    })
}
#[tauri::command]
pub async fn pick_file(app: crate::windows::WindowApp) -> AppResult<Option<Document>> {
    app.context().ai.lock().await.stop().await;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = app
            .dialog()
            .file()
            .add_filter("Markdown", &["md", "markdown", "mdown", "txt"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = path.into_path().map_err(|e| error(e.to_string()))?;
        let state = app.context();
        let doc = {
            let mut ws = state
                .workspace
                .lock()
                .map_err(|_| error("工作目录锁错误"))?;
            ws.grant(&path)?;
            if let Some(parent) = path.parent() {
                ws.set_root(parent)?;
            }
            ws.read(&path)?
        };
        state.remember(doc.path.clone())?;
        crate::state::watch(&app)?;
        Ok(Some(doc))
    })
    .await
    .map_err(|e| error(e.to_string()))?
}
#[tauri::command]
pub async fn pick_folder(app: crate::windows::WindowApp) -> AppResult<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = app.dialog().file().blocking_pick_folder() else {
            return Ok(None);
        };
        let path = path.into_path().map_err(|e| error(e.to_string()))?;
        let state = app.context();
        let root = std::fs::canonicalize(&path)?.to_string_lossy().into_owned();
        crate::windows::create(&app, Some(Path::new(&root)))?;
        {
            let mut settings = state.settings.lock().map_err(|_| error("配置锁错误"))?;
            settings.last_folder = Some(root.clone());
            settings.recent_entries.retain(|e| e.path != root);
            settings.recent_entries.insert(
                0,
                crate::settings::RecentEntry {
                    path: root.clone(),
                    kind: "folder".into(),
                },
            );
            settings.recent_entries.truncate(8);
            crate::settings::save(&state.directory, settings.clone())?;
        }
        Ok(Some(root))
    })
    .await
    .map_err(|e| error(e.to_string()))?
}
#[tauri::command]
pub async fn read_document(
    app: crate::windows::WindowApp,
    path: String,
    remember: Option<bool>,
) -> AppResult<Document> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.context();
        let doc = {
            let mut ws = state
                .workspace
                .lock()
                .map_err(|_| error("工作目录锁错误"))?;
            let authorized = ws.authorize(Path::new(&path))?;
            ws.grant(&authorized)?;
            ws.read(&authorized)?
        };
        if remember.unwrap_or(true) {
            state.remember(doc.path.clone())?;
        }
        Ok(doc)
    })
    .await
    .map_err(|e| error(e.to_string()))?
}
#[tauri::command]
pub async fn save_document(
    app: crate::windows::WindowApp,
    document: Document,
    expected: String,
) -> AppResult<Document> {
    tauri::async_runtime::spawn_blocking(move || {
        app.context()
            .workspace
            .lock()
            .map_err(|_| error("工作目录锁错误"))?
            .save(&document, &expected)
    })
    .await
    .map_err(|e| error(e.to_string()))?
}
#[tauri::command]
pub async fn save_as(
    app: crate::windows::WindowApp,
    content: String,
    suggested: String,
) -> AppResult<Option<Document>> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = app
            .dialog()
            .file()
            .set_file_name(&suggested)
            .add_filter("Markdown", &["md"])
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = path.into_path().map_err(|e| error(e.to_string()))?;
        atomic_write(&path, content.as_bytes())?;
        let state = app.context();
        let doc = {
            let mut ws = state
                .workspace
                .lock()
                .map_err(|_| error("工作目录锁错误"))?;
            ws.grant(&path)?;
            ws.read(&path)?
        };
        state.remember(doc.path.clone())?;
        Ok(Some(doc))
    })
    .await
    .map_err(|e| error(e.to_string()))?
}
#[tauri::command]
pub async fn list_files(
    app: crate::windows::WindowApp,
    hidden: bool,
    all_files: bool,
) -> AppResult<Vec<Entry>> {
    tauri::async_runtime::spawn_blocking(move || {
        app.context()
            .workspace
            .lock()
            .map_err(|_| error("工作目录锁错误"))?
            .entries(hidden, all_files)
    })
    .await
    .map_err(|e| error(e.to_string()))?
}
#[tauri::command]
pub async fn file_operation(
    app: crate::windows::WindowApp,
    operation: String,
    path: String,
    target: Option<String>,
) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.context();
        state
            .workspace
            .lock()
            .map_err(|_| error("工作目录锁错误"))?
            .mutate(
                &operation,
                Path::new(&path),
                target.as_deref().map(Path::new),
            )?;
        if operation == "trash" {
            let mut settings = state.settings.lock().map_err(|_| error("配置锁错误"))?;
            settings.recent_files.retain(|p| p != &path);
            settings.recent_entries.retain(|e| e.path != path);
            crate::settings::save(&state.directory, settings.clone())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| error(e.to_string()))?
}
#[tauri::command]
pub async fn search_workspace(
    state: crate::windows::WindowState,
    mut query: crate::search::SearchQuery,
) -> AppResult<Vec<crate::search::SearchResult>> {
    let root = state
        .workspace
        .lock()
        .map_err(|_| error("工作目录锁错误"))?
        .root
        .clone()
        .ok_or_else(|| error("请先打开文件夹"))?;
    {
        let settings = state.settings.lock().map_err(|_| error("配置锁错误"))?;
        query.limit = Some(
            query
                .limit
                .unwrap_or(settings.palette_search_limit as usize)
                .clamp(1, 1000),
        );
    }
    crate::search::search(root, query, state.search_sequence.clone()).await
}
#[tauri::command]
pub fn cancel_search(state: crate::windows::WindowState) {
    state
        .search_sequence
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
}
#[tauri::command]
pub async fn save_settings(
    state: crate::windows::WindowState,
    patch: serde_json::Map<String, serde_json::Value>,
) -> AppResult<Settings> {
    let (saved, changed) = {
        let mut current = state.settings.lock().map_err(|_| error("配置锁错误"))?;
        let settings = crate::settings::merge_patch(&current, patch)?;
        let changed = current.ai != settings.ai;
        *current = crate::settings::save(&state.directory, settings)?;
        (current.clone(), changed)
    };
    if changed {
        state.ai.lock().await.stop().await;
    }
    Ok(saved)
}
#[tauri::command]
pub fn recovery_save(
    state: crate::windows::WindowState,
    snapshot: Option<Recovery>,
) -> AppResult<()> {
    let workspace_key = format!("recovery-workspace:{}", state.label);
    if let Some(snapshot) = snapshot {
        let root = state
            .workspace
            .lock()
            .map_err(|_| error("工作目录锁错误"))?
            .root
            .clone();
        crate::database::put(&state.directory, &workspace_key, &root)?;
        crate::database::put(&state.directory, &state.recovery_key(), &snapshot)?;
    } else {
        crate::database::remove(&state.directory, &state.recovery_key())?;
        crate::database::remove(&state.directory, &workspace_key)?;
    }
    Ok(())
}

#[tauri::command]
pub fn reveal_file(app: crate::windows::WindowApp, path: String) -> AppResult<()> {
    let path = app
        .context()
        .workspace
        .lock()
        .map_err(|_| error("工作目录锁错误"))?
        .authorize(Path::new(&path))?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| error(e.to_string()))
}
#[tauri::command]
pub fn open_link(app: crate::windows::WindowApp, url: String) -> AppResult<()> {
    if !url.starts_with("https://") && !url.starts_with("http://") && !url.starts_with("mailto:") {
        return Err(error("链接协议不受支持"));
    }
    app.opener()
        .open_url(url, None::<String>)
        .map_err(|e| error(e.to_string()))
}
#[tauri::command]
pub async fn export_file(
    app: crate::windows::WindowApp,
    content: String,
    format: String,
) -> AppResult<bool> {
    if !["html", "md", "svg", "css", "png", "docx"].contains(&format.as_str()) {
        return Err(error("导出格式不受支持"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = app
            .dialog()
            .file()
            .set_file_name(format!("Untitled.{format}"))
            .add_filter(&format, &[&format])
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let bytes = if format == "png" || format == "docx" {
            base64::engine::general_purpose::STANDARD
                .decode(&content)
                .map_err(|e| error(e.to_string()))?
        } else {
            content.into_bytes()
        };
        atomic_write(&path.into_path().map_err(|e| error(e.to_string()))?, &bytes)?;
        Ok(true)
    })
    .await
    .map_err(|e| error(e.to_string()))?
}
#[tauri::command]
pub async fn secret_set(
    state: crate::windows::WindowState,
    key: String,
    reference: String,
) -> AppResult<()> {
    crate::settings::validate_key_ref(&reference)?;
    let name = format!("secret:{reference}");
    if key.is_empty() {
        crate::database::remove(&state.directory, &name)
    } else {
        crate::database::put(&state.directory, &name, &key)
    }
}

#[tauri::command]
pub async fn image_save(
    state: crate::windows::WindowState,
    document_path: String,
    data: String,
    mime: String,
    filename: Option<String>,
) -> AppResult<String> {
    use base64::Engine;
    if data.len() > 28_000_000 {
        return Err(error("图片超过 20 MB"));
    }
    let extension = match mime.as_str() {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "bin",
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| error(e.to_string()))?;
    let ws = state
        .workspace
        .lock()
        .map_err(|_| error("工作目录锁错误"))?;
    let document = ws.authorize(Path::new(&document_path))?;
    let parent = document.parent().ok_or_else(|| error("文档目录无效"))?;
    let settings = state.settings.lock().map_err(|_| error("配置锁错误"))?;
    if extension == "bin" && !settings.allow_attachments {
        return Err(error("已关闭其他附件导入"));
    }
    let folder = &settings.attachment_folder;
    let mut assets = parent.to_path_buf();
    for part in Path::new(folder).components() {
        let std::path::Component::Normal(part) = part else {
            return Err(error("附件目录无效"));
        };
        assets.push(part);
        if !assets.exists() {
            std::fs::create_dir(&assets)?;
        }
        if !std::fs::canonicalize(&assets)?.starts_with(parent) {
            return Err(error("附件目录超出边界"));
        }
    }
    if !std::fs::canonicalize(&assets)?.starts_with(parent) {
        return Err(error("图片目录超出边界"));
    }
    let filename = filename
        .unwrap_or_else(|| format!("{}.{}", &crate::workspace::hash(&bytes)[..20], extension));
    if filename.is_empty()
        || filename.len() > 200
        || filename.contains(['/', '\\', ':', '\0'])
        || filename == "."
        || filename == ".."
    {
        return Err(error("附件文件名无效"));
    }
    let mut target = assets.join(&filename);
    if target.exists() {
        let stem = Path::new(&filename)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy();
        let ext = Path::new(&filename)
            .extension()
            .unwrap_or_default()
            .to_string_lossy();
        let mut suffix = 1;
        while target.exists() {
            target = assets.join(format!("{stem}-{suffix}.{ext}"));
            suffix += 1;
        }
    }
    atomic_write(&target, &bytes)?;
    Ok(format!(
        "./{}/{}",
        folder.replace('\\', "/"),
        target.file_name().unwrap().to_string_lossy()
    ))
}
#[tauri::command]
pub fn image_read(
    state: crate::windows::WindowState,
    document_path: String,
    source: String,
) -> AppResult<String> {
    use base64::Engine;
    let ws = state
        .workspace
        .lock()
        .map_err(|_| error("工作目录锁错误"))?;
    let doc = ws.authorize(Path::new(&document_path))?;
    let source = PathBuf::from(source);
    let path = if source.is_absolute() {
        source
    } else {
        doc.parent()
            .ok_or_else(|| error("文档目录无效"))?
            .join(source)
    };
    let canonical = std::fs::canonicalize(&path)?;
    let parent = doc.parent().ok_or_else(|| error("文档目录无效"))?;
    let path = if canonical.starts_with(parent) {
        canonical
    } else {
        ws.authorize(&path)?
    };
    let mime = match path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => return Err(error("图片格式不支持")),
    };
    if std::fs::metadata(&path)?.len() > 20_000_000 {
        return Err(error("图片过大"));
    }
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(std::fs::read(path)?)
    ))
}

#[tauri::command]
pub fn print_document(app: crate::windows::WindowApp) -> AppResult<()> {
    app.get_webview_window(&app.label)
        .ok_or_else(|| error("窗口不存在"))?
        .print()
        .map_err(|e| error(e.to_string()))
}
#[tauri::command]
pub async fn quit_app(app: crate::windows::WindowApp) -> AppResult<()> {
    let state = app.context();
    state.ai.lock().await.stop().await;
    app.get_webview_window(&app.label)
        .ok_or_else(|| error("窗口不存在"))?
        .destroy()
        .map_err(|e| error(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn theme_import(app: crate::windows::WindowApp) -> AppResult<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("CSS", &["css"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|e| error(e.to_string()))?;
        if std::fs::metadata(&path)?.len() > 100_000 {
            return Err(error("CSS 文件超过 100 KB"));
        }
        Ok(Some(std::fs::read_to_string(path)?))
    })
    .await
    .map_err(|e| error(e.to_string()))?
}

#[tauri::command]
pub async fn open_recent_folder(app: crate::windows::WindowApp, path: String) -> AppResult<String> {
    let state = app.context();
    {
        let settings = state.settings.lock().map_err(|_| error("配置锁错误"))?;
        if !settings
            .recent_entries
            .iter()
            .any(|r| r.path == path && r.kind == "folder")
        {
            return Err(error("此文件夹不在最近记录中，请通过对话框打开"));
        }
    }
    let root = std::fs::canonicalize(&path)?.to_string_lossy().into_owned();
    crate::windows::create(&app, Some(Path::new(&root)))?;
    {
        let mut settings = state.settings.lock().map_err(|_| error("配置锁错误"))?;
        settings.last_folder = Some(root.clone());
        settings.recent_entries.retain(|r| r.path != path);
        settings.recent_entries.insert(
            0,
            crate::settings::RecentEntry {
                path: root.clone(),
                kind: "folder".into(),
            },
        );
        settings.recent_entries.truncate(8);
        crate::settings::save(&state.directory, settings.clone())?;
    }
    Ok(root)
}
#[tauri::command]
pub async fn background_import(app: crate::windows::WindowApp) -> AppResult<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("图片", &["png", "jpg", "jpeg", "webp"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|e| error(e.to_string()))?;
        if std::fs::metadata(&path)?.len() > 15_000_000 {
            return Err(error("背景图片不能超过 15 MB"));
        }
        let bytes = std::fs::read(&path)?;
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png")
            .to_lowercase();
        if !["png", "jpg", "jpeg", "webp"].contains(&ext.as_str()) {
            return Err(error("图片格式无效"));
        }
        let name = format!(
            "background-{}.{}",
            &crate::workspace::hash(&bytes)[..16],
            ext
        );
        let dir = app.context().directory.join("res/background");
        std::fs::create_dir_all(&dir)?;
        atomic_write(&dir.join(&name), &bytes)?;
        Ok(Some(name))
    })
    .await
    .map_err(|e| error(e.to_string()))?
}
#[tauri::command]
pub fn background_read(state: crate::windows::WindowState, name: String) -> AppResult<String> {
    if !name.starts_with("background-") || name.contains(['/', '\\']) {
        return Err(error("背景图片引用无效"));
    }
    let bytes = std::fs::read(state.directory.join("res/background").join(&name))?;
    let mime = if name.ends_with(".png") {
        "image/png"
    } else if name.ends_with(".webp") {
        "image/webp"
    } else {
        "image/jpeg"
    };
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
pub fn sync_shortcuts(
    app: crate::windows::WindowApp,
    shortcuts: std::collections::HashMap<String, String>,
) -> AppResult<()> {
    if shortcuts.len() > 100 {
        return Err(error("快捷键过多"));
    }
    fn collect(
        items: Vec<tauri::menu::MenuItemKind<tauri::Wry>>,
        out: &mut Vec<tauri::menu::MenuItem<tauri::Wry>>,
    ) -> AppResult<()> {
        for item in items {
            match item {
                tauri::menu::MenuItemKind::MenuItem(item) => out.push(item),
                tauri::menu::MenuItemKind::Submenu(menu) => {
                    collect(menu.items().map_err(|e| error(e.to_string()))?, out)?
                }
                _ => {}
            }
        }
        Ok(())
    }
    if let Some(menu) = app.menu() {
        let mut items = vec![];
        collect(menu.items().map_err(|e| error(e.to_string()))?, &mut items)?;
        for item in &items {
            if shortcuts.contains_key(item.id().as_ref()) {
                item.set_accelerator(None::<&str>)
                    .map_err(|e| error(e.to_string()))?;
            }
        }
        for item in items {
            if let Some(value) = shortcuts.get(item.id().as_ref()) {
                if !value.is_empty() {
                    item.set_accelerator(Some(value.replace("Mod", "CmdOrCtrl")))
                        .map_err(|e| error(e.to_string()))?;
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn open_system_file(app: crate::windows::WindowApp, path: String) -> AppResult<()> {
    let path = app
        .context()
        .workspace
        .lock()
        .map_err(|_| error("工作目录锁错误"))?
        .authorize(Path::new(&path))?;
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<String>)
        .map_err(|e| error(e.to_string()))
}
