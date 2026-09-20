use crate::{
    error::{error, AppResult},
    settings::Settings,
    workspace::Workspace,
};
use std::{
    path::PathBuf,
    sync::{atomic::AtomicU64, Arc, Mutex},
};
pub struct AppState {
    pub resource_lock: Arc<Mutex<()>>,
    pub label: String,
    pub workspace: Mutex<Workspace>,
    pub settings: Arc<Mutex<Settings>>,
    pub directory: PathBuf,
    pub watcher: Mutex<Option<notify::RecommendedWatcher>>,
    pub search_sequence: Arc<AtomicU64>,
    pub ai: tokio::sync::Mutex<crate::ai::PiManager>,
}
impl AppState {
    pub fn new(_app: &tauri::AppHandle) -> AppResult<Self> {
        let executable = std::env::current_exe()?;
        let parent = executable.parent().ok_or_else(|| error("应用目录不存在"))?;
        let directory = parent.join(".yeditor");
        let settings = crate::settings::load(&directory)?;
        let mut workspace = Workspace::default();
        for path in &settings.recent_files {
            let _ = workspace.grant(std::path::Path::new(path));
        }
        if let Some(root) = &settings.last_folder {
            let _ = workspace.set_root(std::path::Path::new(root));
        }
        crate::resources::workspace_flags(
            &directory,
            workspace
                .root
                .as_ref()
                .map(|p| p.to_string_lossy().into_owned())
                .as_deref()
                .unwrap_or_default(),
        )?;
        Ok(Self {
            resource_lock: Arc::new(Mutex::new(())),
            label: "main".into(),
            workspace: Mutex::new(workspace),
            settings: Arc::new(Mutex::new(settings)),
            directory,
            watcher: Mutex::new(None),
            search_sequence: Arc::new(AtomicU64::new(0)),
            ai: tokio::sync::Mutex::new(crate::ai::PiManager::default()),
        })
    }
    pub fn for_window(
        shared: &Self,
        label: &str,
        folder: Option<&std::path::Path>,
    ) -> AppResult<Self> {
        let mut workspace = Workspace::default();
        if let Some(folder) = folder {
            workspace.set_root(folder)?;
        }
        for path in &shared
            .settings
            .lock()
            .map_err(|_| error("配置锁错误"))?
            .recent_files
        {
            let _ = workspace.grant(std::path::Path::new(path));
        }
        Ok(Self {
            resource_lock: shared.resource_lock.clone(),
            label: label.into(),
            workspace: Mutex::new(workspace),
            settings: shared.settings.clone(),
            directory: shared.directory.clone(),
            watcher: Mutex::new(None),
            search_sequence: Arc::new(AtomicU64::new(0)),
            ai: tokio::sync::Mutex::new(crate::ai::PiManager::default()),
        })
    }
    pub fn recovery_key(&self) -> String {
        format!("recovery:{}", self.label)
    }
    pub fn remember(&self, path: String) -> AppResult<()> {
        let mut settings = self.settings.lock().map_err(|_| error("配置锁错误"))?;
        settings.recent_files.retain(|item| item != &path);
        settings.recent_files.insert(0, path.clone());
        settings.recent_entries.retain(|entry| entry.path != path);
        settings.recent_entries.insert(
            0,
            crate::settings::RecentEntry {
                path,
                kind: "file".into(),
            },
        );
        settings.recent_entries.truncate(8);
        settings.recent_files.truncate(8);
        crate::settings::save(&self.directory, settings.clone())?;
        Ok(())
    }
}
pub fn watch(app: &crate::windows::WindowApp) -> AppResult<()> {
    use notify::Watcher;
    use tauri::Emitter;
    let state = app.context();
    let root = state
        .workspace
        .lock()
        .map_err(|_| error("工作目录锁错误"))?
        .root
        .clone();
    crate::resources::workspace_flags(
        &state.directory,
        root.as_ref()
            .map(|p| p.to_string_lossy().into_owned())
            .as_deref()
            .unwrap_or_default(),
    )?;
    let emitter = app.app.clone();
    let label = app.label.clone();
    let mut watcher =
        notify::recommended_watcher(move |result: Result<notify::Event, notify::Error>| {
            if let Ok(event) = result {
                if !matches!(event.kind, notify::EventKind::Access(_)) {
                    let _ = emitter.emit_to(
                        label.as_str(),
                        "workspace-changed",
                        event
                            .paths
                            .iter()
                            .map(|p| p.to_string_lossy().into_owned())
                            .collect::<Vec<_>>(),
                    );
                }
            }
        })
        .map_err(|e| error(e.to_string()))?;
    if let Some(root) = root {
        watcher
            .watch(&root, notify::RecursiveMode::Recursive)
            .map_err(|e| error(e.to_string()))?;
    }
    *state.watcher.lock().map_err(|_| error("监听器锁错误"))? = Some(watcher);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn windows_isolate_workspaces_search_and_drafts_but_share_preferences() {
        let dir = tempfile::tempdir().unwrap();
        let first = dir.path().join("first");
        let second = dir.path().join("second");
        std::fs::create_dir_all(&first).unwrap();
        std::fs::create_dir_all(&second).unwrap();
        let shared = AppState {
            resource_lock: Arc::new(Mutex::new(())),
            label: "main".into(),
            workspace: Mutex::new(Workspace::default()),
            settings: Arc::new(Mutex::new(crate::settings::load(dir.path()).unwrap())),
            directory: dir.path().to_path_buf(),
            watcher: Mutex::new(None),
            search_sequence: Arc::new(AtomicU64::new(0)),
            ai: tokio::sync::Mutex::new(crate::ai::PiManager::default()),
        };
        let a = Arc::new(AppState::for_window(&shared, "editor-a", Some(&first)).unwrap());
        let b = Arc::new(AppState::for_window(&shared, "editor-b", Some(&second)).unwrap());
        assert_eq!(
            a.workspace.lock().unwrap().root.as_ref().unwrap(),
            &first.canonicalize().unwrap()
        );
        assert_eq!(
            b.workspace.lock().unwrap().root.as_ref().unwrap(),
            &second.canonicalize().unwrap()
        );
        assert!(Arc::ptr_eq(&a.settings, &b.settings));
        assert!(Arc::ptr_eq(&a.resource_lock, &b.resource_lock));
        assert!(!Arc::ptr_eq(&a.search_sequence, &b.search_sequence));
        a.search_sequence
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        assert_eq!(
            b.search_sequence.load(std::sync::atomic::Ordering::SeqCst),
            0
        );
        let draft = |content: &str| crate::commands::Recovery {
            path: None,
            content: content.into(),
            disk_hash: String::new(),
            line_ending: "LF".into(),
            bom: false,
            saved_at: 1,
        };
        crate::commands::recovery_save(crate::windows::WindowState(a.clone()), Some(draft("A")))
            .unwrap();
        crate::commands::recovery_save(crate::windows::WindowState(b.clone()), Some(draft("B")))
            .unwrap();
        crate::commands::recovery_save(crate::windows::WindowState(a.clone()), None).unwrap();
        assert!(
            crate::database::get::<crate::commands::Recovery>(dir.path(), &a.recovery_key())
                .unwrap()
                .is_none()
        );
        assert_eq!(
            crate::database::get::<crate::commands::Recovery>(dir.path(), &b.recovery_key())
                .unwrap()
                .unwrap()
                .content,
            "B"
        );
        assert_eq!(
            crate::database::keys(dir.path(), "recovery:editor-").unwrap(),
            vec!["recovery:editor-b"]
        );
        assert_eq!(
            crate::database::get::<String>(dir.path(), "recovery-workspace:editor-b")
                .unwrap()
                .unwrap(),
            second.canonicalize().unwrap().to_str().unwrap()
        );
    }
}
