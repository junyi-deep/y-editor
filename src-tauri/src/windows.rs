use crate::{
    error::{error, AppResult},
    state::AppState,
};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{
    ipc::{CommandArg, CommandItem, InvokeError},
    Emitter, Manager,
};

pub struct Windows(pub Mutex<HashMap<String, Arc<AppState>>>);

/// The caller identity comes from Tauri's webview, never from IPC arguments.
#[derive(Clone)]
pub struct WindowApp {
    pub app: tauri::AppHandle,
    pub label: String,
    pub context: Arc<AppState>,
}
impl std::ops::Deref for WindowApp {
    type Target = tauri::AppHandle;
    fn deref(&self) -> &Self::Target {
        &self.app
    }
}
impl WindowApp {
    pub fn context(&self) -> Arc<AppState> {
        self.context.clone()
    }
    pub fn emit<S: serde::Serialize + Clone>(&self, event: &str, payload: S) -> tauri::Result<()> {
        self.app.emit_to(self.label.as_str(), event, payload)
    }
    pub fn resolve(app: &tauri::AppHandle, label: &str) -> AppResult<Self> {
        let context = app
            .state::<Windows>()
            .0
            .lock()
            .map_err(|_| error("窗口锁错误"))?
            .get(label)
            .cloned()
            .ok_or_else(|| error("窗口已关闭"))?;
        Ok(Self {
            app: app.clone(),
            label: label.into(),
            context,
        })
    }
}
impl<'de> CommandArg<'de, tauri::Wry> for WindowApp {
    fn from_command(command: CommandItem<'de, tauri::Wry>) -> Result<Self, InvokeError> {
        let view = command.message.webview();
        Self::resolve(view.app_handle(), view.window().label()).map_err(InvokeError::from)
    }
}
pub struct WindowState(pub Arc<AppState>);
impl std::ops::Deref for WindowState {
    type Target = AppState;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl<'de> CommandArg<'de, tauri::Wry> for WindowState {
    fn from_command(command: CommandItem<'de, tauri::Wry>) -> Result<Self, InvokeError> {
        Ok(Self(WindowApp::from_command(command)?.context))
    }
}

pub fn create(app: &WindowApp, folder: Option<&std::path::Path>) -> AppResult<String> {
    static SEQUENCE: AtomicU64 = AtomicU64::new(1);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| error(e.to_string()))?
        .as_millis();
    let label = format!(
        "editor-{}-{}",
        now,
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    );
    create_named(app, folder, label)
}

fn create_named(
    app: &WindowApp,
    folder: Option<&std::path::Path>,
    label: String,
) -> AppResult<String> {
    let context = Arc::new(AppState::for_window(&app.context, &label, folder)?);
    app.state::<Windows>()
        .0
        .lock()
        .map_err(|_| error("窗口锁错误"))?
        .insert(label.clone(), context);
    let builder = tauri::WebviewWindowBuilder::new(
        &app.app,
        &label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("y-editor")
    .inner_size(1050.0, 780.0)
    .min_inner_size(760.0, 560.0)
    .decorations(true)
    .transparent(true)
    .visible(false);
    // Native macOS traffic lights over a transparent window, matching the
    // main-window configuration in tauri.conf.json. These three builder methods
    // are `#[cfg(target_os = "macos")]` in tauri itself, so the chain is split
    // rather than written inline — the Windows build rejects them outright.
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        // A new window does not inherit the config's traffic-light placement,
        // and the titlebar layout assumes this inset.
        .traffic_light_position(tauri::LogicalPosition::new(20.0, 18.0));
    let result = builder.build();
    if let Err(e) = result {
        app.state::<Windows>()
            .0
            .lock()
            .map_err(|_| error("窗口锁错误"))?
            .remove(&label);
        return Err(error(e.to_string()));
    }
    crate::state::watch(&WindowApp::resolve(&app.app, &label)?)?;
    Ok(label)
}

/// Reopen each crash draft in its own window; a later new window must never claim it.
pub fn restore_drafts(app: &WindowApp) -> AppResult<()> {
    for key in crate::database::keys(&app.context.directory, "recovery:editor-")? {
        let label = key.trim_start_matches("recovery:");
        let folder: Option<Option<String>> = crate::database::get(
            &app.context.directory,
            &format!("recovery-workspace:{label}"),
        )?;
        let folder = folder.flatten();
        let folder = folder
            .as_deref()
            .map(std::path::Path::new)
            .filter(|p| p.is_dir());
        create_named(app, folder, label.to_owned())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn new_window(app: WindowApp) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || create(&app, None))
        .await
        .map_err(|e| error(e.to_string()))?
}

#[tauri::command]
pub fn request_quit(app: tauri::AppHandle) -> AppResult<()> {
    app.emit("request-exit", ())
        .map_err(|e| error(e.to_string()))
}
