mod ai;
mod commands;
mod database;
mod error;
mod ipc;
mod mcp;
mod resources;
mod search;
mod settings;
mod state;
mod windows;
mod workspace;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                let _ = webview.window().show();
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let main = std::sync::Arc::new(state::AppState::new(app.handle())?);
            app.manage(windows::Windows(std::sync::Mutex::new(
                std::collections::HashMap::from([("main".into(), main)]),
            )));
            state::watch(&windows::WindowApp::resolve(app.handle(), "main")?)?;
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
            let item = |id: &str, title: &str, shortcut: Option<&str>| {
                MenuItem::with_id(app, id, title, true, shortcut)
            };
            let new = item("file.new", "新建", Some("CmdOrCtrl+N"))?;
            let new_window = item("file.newWindow", "新建窗口", Some("CmdOrCtrl+Shift+N"))?;
            let open = item("file.open", "打开…", Some("CmdOrCtrl+O"))?;
            let folder = item("file.folder", "打开文件夹…", None)?;
            let save = item("file.save", "保存", Some("CmdOrCtrl+S"))?;
            let save_as = item("file.saveAs", "另存为…", Some("CmdOrCtrl+Shift+S"))?;
            let quick = item("file.quickOpen", "快速打开…", Some("CmdOrCtrl+P"))?;
            let export = item("file.export", "导出 HTML…", None)?;
            let print = item("file.print", "打印 / 导出 PDF…", None)?;
            let prefs = item("settings.open", "偏好设置…", Some("CmdOrCtrl+,"))?;
            let quit = item("app.quit", "退出 y-editor", Some("CmdOrCtrl+Q"))?;
            let application = Submenu::with_items(app, "y-editor", true, &[&prefs, &quit])?;
            let file = Submenu::with_items(
                app,
                "文件",
                true,
                &[
                    &new,
                    &new_window,
                    &open,
                    &folder,
                    &quick,
                    &save,
                    &save_as,
                    &export,
                    &print,
                ],
            )?;
            let undo = item("editor.undo", "撤销", Some("CmdOrCtrl+Z"))?;
            let redo = item("editor.redo", "重做", Some("CmdOrCtrl+Shift+Z"))?;
            let cut = PredefinedMenuItem::cut(app, None)?;
            let copy = PredefinedMenuItem::copy(app, None)?;
            let paste = PredefinedMenuItem::paste(app, None)?;
            let select = PredefinedMenuItem::select_all(app, None)?;
            let find = item("editor.find", "查找 / 替换…", Some("CmdOrCtrl+F"))?;
            let search = item("workspace.search", "搜索文件夹…", Some("CmdOrCtrl+Shift+F"))?;
            let edit = Submenu::with_items(
                app,
                "编辑",
                true,
                &[&undo, &redo, &cut, &copy, &paste, &select, &find, &search],
            )?;
            let bold = item("editor.bold", "加粗", Some("CmdOrCtrl+B"))?;
            let italic = item("editor.italic", "斜体", Some("CmdOrCtrl+I"))?;
            let link = item("editor.link", "链接", Some("CmdOrCtrl+K"))?;
            let format = Submenu::with_items(app, "格式", true, &[&bold, &italic, &link])?;
            let sidebar = item("view.sidebar", "侧边栏", Some("CmdOrCtrl+Shift+L"))?;
            let source = item("editor.source", "源代码模式", Some("CmdOrCtrl+/"))?;
            let focus = item("editor.focus", "专注模式", None)?;
            let typewriter = item("editor.typewriter", "打字机模式", None)?;
            let ai = item("view.ai", "AI 助手", None)?;
            let view = Submenu::with_items(
                app,
                "视图",
                true,
                &[&sidebar, &source, &focus, &typewriter, &ai],
            )?;
            let light = item("theme.light", "浅色", None)?;
            let dark = item("theme.dark", "深色", None)?;
            let theme = Submenu::with_items(app, "主题", true, &[&light, &dark])?;
            let menu =
                Menu::with_items(app, &[&application, &file, &edit, &format, &view, &theme])?;
            app.set_menu(menu)?;
            let window_app = windows::WindowApp::resolve(app.handle(), "main")?;
            tauri::async_runtime::spawn_blocking(move || {
                if let Err(error) = windows::restore_drafts(&window_app) {
                    eprintln!("无法恢复窗口：{error}");
                }
            });
            Ok(())
        })
        .on_menu_event(|app, event| {
            if let Some(window) = app
                .webview_windows()
                .values()
                .find(|w| w.is_focused().unwrap_or(false))
            {
                let _ = app.emit_to(window.label(), "menu-command", event.id().as_ref());
            }
        })
        .invoke_handler(tauri::generate_handler![
            windows::new_window,
            windows::request_quit,
            resources::resource_list,
            resources::resource_content,
            resources::prompt_save,
            resources::prompt_load,
            resources::workspace_resources,
            resources::workspace_resource_set,
            resources::resource_add,
            resources::resource_update,
            resources::resource_scan,
            resources::resource_import,
            resources::knowledge_index,
            resources::knowledge_search,
            mcp::mcp_list,
            mcp::mcp_save,
            mcp::mcp_tools,
            mcp::mcp_call,
            commands::theme_import,
            commands::open_recent_folder,
            commands::background_import,
            commands::background_read,
            commands::sync_shortcuts,
            commands::app_info,
            commands::print_document,
            commands::quit_app,
            commands::bootstrap,
            commands::pick_file,
            commands::pick_folder,
            commands::read_document,
            commands::save_document,
            commands::save_as,
            commands::list_files,
            commands::file_operation,
            commands::search_workspace,
            commands::cancel_search,
            commands::save_settings,
            commands::recovery_save,
            commands::reveal_file,
            commands::open_system_file,
            commands::open_link,
            commands::export_file,
            commands::secret_set,
            commands::image_save,
            commands::image_read,
            ai::history::ai_history_save,
            ai::history::ai_history_list,
            ai::history::ai_history_load,
            ai::history::ai_history_delete,
            ai::ai_start,
            ai::ai_models,
            ai::ai_compact,
            ai::ai_send,
            ai::ai_abort,
            ai::ai_stop,
            ai::apply_file_patch
        ])
        .build(tauri::generate_context!())
        .expect("error while building y-editor")
        .run(|app, event| {
            if let tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::Destroyed,
                ..
            } = event
            {
                if let Ok(mut windows) = app.state::<windows::Windows>().0.lock() {
                    if let Some(state) = windows.remove(&label) {
                        tauri::async_runtime::spawn(async move {
                            state.ai.lock().await.stop().await;
                        });
                    }
                }
            }
        });
}
