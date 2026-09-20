use crate::error::{error, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Settings {
    #[serde(deserialize_with = "deserialize_pixels")]
    pub palette_search_limit: u32,
    pub palette_regex: bool,
    pub opacity: f64,
    pub attachment_folder: String,
    pub paste_prompt: bool,
    pub allow_attachments: bool,
    pub render_large_diagrams: bool,
    pub outline_numbering: bool,
    pub theme_preset: String,
    pub background_image: String,
    pub shortcuts: std::collections::HashMap<String, String>,
    pub wide_editor: bool,
    pub recent_entries: Vec<RecentEntry>,
    pub schema_version: u32,
    pub appearance: String,
    pub font_family: String,
    pub font_size: u32,
    pub line_height: f64,
    pub content_width: u32,
    pub autosave: bool,
    pub autosave_delay: u32,
    pub spellcheck: bool,
    pub sidebar: bool,
    #[serde(deserialize_with = "deserialize_pixels")]
    pub sidebar_width: u32,
    #[serde(deserialize_with = "deserialize_pixels")]
    pub ai_width: u32,
    pub recent_files: Vec<String>,
    pub last_folder: Option<String>,
    pub custom_css: String,
    pub ai: Provider,
    pub provider_profiles: Vec<ProviderProfile>,
}
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Provider {
    pub enabled: bool,
    pub protocol: String,
    pub base_url: String,
    pub model: String,
    pub api_key_ref: String,
}
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderProfile {
    pub name: String,
    pub provider: Provider,
}
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecentEntry {
    pub path: String,
    pub kind: String,
}
impl Default for Provider {
    fn default() -> Self {
        Self {
            enabled: false,
            protocol: "openai-compatible".into(),
            base_url: "https://api.openai.com/v1".into(),
            model: String::new(),
            api_key_ref: "provider:default".into(),
        }
    }
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: 6,
            palette_search_limit: 70,
            palette_regex: true,
            opacity: 1.0,
            attachment_folder: "assets".into(),
            paste_prompt: true,
            allow_attachments: true,
            render_large_diagrams: true,
            outline_numbering: true,
            theme_preset: "typora".into(),
            background_image: String::new(),
            shortcuts: Default::default(),
            wide_editor: false,
            recent_entries: vec![],
            appearance: "light".into(),
            font_family: "sans-serif".into(),
            font_size: 16,
            line_height: 1.6,
            content_width: 800,
            autosave: true,
            autosave_delay: 1200,
            spellcheck: true,
            sidebar: false,
            sidebar_width: 240,
            ai_width: 340,
            recent_files: vec![],
            last_folder: None,
            custom_css: String::new(),
            ai: Provider::default(),
            provider_profiles: vec![],
        }
    }
}
pub fn migrate(mut value: serde_json::Value) -> AppResult<Settings> {
    let version = value
        .get("schemaVersion")
        .and_then(|v| v.as_u64())
        .unwrap_or(1);
    if version > 6 {
        return Err(error("配置版本高于当前应用，请升级应用"));
    }
    if version == 1 {
        let mut settings = Settings::default();
        if let Some(size) = value.pointer("/editor/fontSize").and_then(|v| v.as_u64()) {
            if settings.attachment_folder.is_empty()
                || Path::new(&settings.attachment_folder)
                    .components()
                    .any(|c| !matches!(c, std::path::Component::Normal(_)))
            {
                return Err(error("附件目录必须是文档内的相对目录"));
            }
            settings.opacity = settings.opacity.clamp(0.3, 1.0);
            settings.font_size = size as u32;
        }
        if let Some(theme) = value.pointer("/appearance/theme").and_then(|v| v.as_str()) {
            settings.appearance = theme.into();
        }
        value = serde_json::to_value(settings)?;
    }
    if version == 2 {
        value["schemaVersion"] = serde_json::json!(3);
        value["providerProfiles"] = serde_json::json!([]);
    }
    if version == 2 || version == 3 {
        value["schemaVersion"] = serde_json::json!(4);
        let mut entries = Vec::new();
        if let Some(files) = value["recentFiles"].as_array() {
            for file in files {
                if let Some(path) = file.as_str() {
                    entries.push(serde_json::json!({"kind":"file","path":path}));
                }
            }
        }
        if let Some(folder) = value["lastFolder"].as_str() {
            entries.insert(0, serde_json::json!({"kind":"folder","path":folder}));
        }
        entries.truncate(8);
        value["recentEntries"] = serde_json::json!(entries);
    }
    value["schemaVersion"] = serde_json::json!(6);
    let mut settings: Settings = serde_json::from_value(value)?;
    settings.palette_search_limit = settings.palette_search_limit.clamp(1, 1000);
    if settings.provider_profiles.len() > 30 {
        return Err(error("模型预设上限为 30 个"));
    }
    for provider in
        std::iter::once(&settings.ai).chain(settings.provider_profiles.iter().map(|p| &p.provider))
    {
        validate_key_ref(&provider.api_key_ref)?;
    }
    if settings.attachment_folder.is_empty()
        || Path::new(&settings.attachment_folder)
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err(error("附件目录必须是文档内的相对目录"));
    }
    settings.opacity = settings.opacity.clamp(0.3, 1.0);
    settings.font_size = settings.font_size.clamp(10, 40);
    settings.line_height = settings.line_height.clamp(1.2, 2.5);
    settings.content_width = settings.content_width.clamp(480, 1400);
    settings.autosave_delay = settings.autosave_delay.clamp(500, 30000);
    settings.sidebar_width = settings.sidebar_width.clamp(180, 480);
    settings.ai_width = settings.ai_width.clamp(260, 640);
    settings.recent_files.truncate(8);
    settings.recent_entries.truncate(8);
    if settings.shortcuts.len() > 100
        || settings
            .shortcuts
            .iter()
            .any(|(k, v)| k.len() > 100 || v.len() > 60)
    {
        return Err(error("快捷键配置过大"));
    }
    if !settings.background_image.is_empty()
        && !settings.background_image.starts_with("background-")
    {
        return Err(error("背景图片引用无效"));
    }
    if !["light", "dark", "system"].contains(&settings.appearance.as_str()) {
        settings.appearance = "light".into();
    }
    if settings.custom_css.len() > 100_000 {
        return Err(error("自定义 CSS 过大"));
    }
    Ok(settings)
}
/// Merge the keys a window reports as changed into the record the process holds.
/// Each window keeps its own snapshot, so writing the whole record would roll
/// back edits another window already saved.
pub fn merge_patch(
    current: &Settings,
    patch: serde_json::Map<String, serde_json::Value>,
) -> AppResult<Settings> {
    let mut merged = serde_json::to_value(current)?;
    if let Some(object) = merged.as_object_mut() {
        for (key, value) in patch {
            object.insert(key, value);
        }
    }
    let mut settings: Settings =
        serde_json::from_value(merged).map_err(|e| error(e.to_string()))?;
    // Recent history is owned by the database, never by a window snapshot.
    settings.recent_files = current.recent_files.clone();
    settings.last_folder = current.last_folder.clone();
    settings.recent_entries = current.recent_entries.clone();
    Ok(settings)
}
pub fn load(dir: &Path) -> AppResult<Settings> {
    match crate::database::get(dir, "settings")? {
        Some(value) => migrate(value),
        None => Ok(Settings::default()),
    }
}
pub fn save(dir: &Path, settings: Settings) -> AppResult<Settings> {
    let settings = migrate(serde_json::to_value(settings)?)?;
    crate::database::put(dir, "settings", &settings)?;
    Ok(settings)
}

pub fn validate_key_ref(reference: &str) -> AppResult<()> {
    if !reference.starts_with("provider:")
        || reference.len() > 100
        || !reference[9..]
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
        || reference.len() == 9
    {
        return Err(error("无效密钥引用"));
    }
    Ok(())
}

fn deserialize_pixels<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<u32, D::Error> {
    let value = f64::deserialize(deserializer)?;
    if !value.is_finite() || value < 0.0 || value > u32::MAX as f64 {
        return Err(serde::de::Error::custom("面板宽度无效"));
    }
    Ok(value.round() as u32)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn v3_migrates_preferences_and_limits_recent_entries() {
        let files: Vec<String> = (0..12).map(|i| format!("/file-{i}.md")).collect();
        let settings = migrate(serde_json::json!({"schemaVersion":3,"appearance":"dark","fontSize":20,"recentFiles":files,"lastFolder":"/workspace"})).unwrap();
        assert_eq!(settings.schema_version, 6);
        assert!(settings.outline_numbering);
        assert_eq!(settings.appearance, "dark");
        assert_eq!(settings.font_size, 20);
        assert_eq!(settings.recent_entries.len(), 8);
        assert_eq!(settings.recent_files.len(), 8);
        assert_eq!(settings.recent_entries[0].kind, "folder");
        assert!(settings.shortcuts.is_empty());
    }
    #[test]
    fn v4_defaults_and_fractional_panel_widths() {
        let settings = migrate(serde_json::json!({"schemaVersion":4,"sidebarWidth":248.890625,"aiWidth":340.25,"paletteSearchLimit":2000.5})).unwrap();
        assert_eq!(settings.schema_version, 6);
        assert_eq!(settings.sidebar_width, 249);
        assert_eq!(settings.ai_width, 340);
        assert_eq!(settings.palette_search_limit, 1000);
        assert!(settings.palette_regex && settings.render_large_diagrams);
        let fresh = migrate(serde_json::json!({"schemaVersion":4})).unwrap();
        assert_eq!(fresh.palette_search_limit, 70);
    }
    #[test]
    fn a_window_patch_only_touches_the_keys_it_names() {
        let current = Settings {
            font_size: 20,
            appearance: "dark".into(),
            recent_files: vec!["/a.md".into()],
            recent_entries: vec![RecentEntry {
                path: "/ws".into(),
                kind: "folder".into(),
            }],
            ..Default::default()
        };
        // Window B changes one setting and cannot know about window A's theme.
        let patch = serde_json::json!({"spellcheck": false})
            .as_object()
            .unwrap()
            .clone();
        let merged = merge_patch(&current, patch).unwrap();
        assert!(!merged.spellcheck);
        assert_eq!(merged.font_size, 20);
        assert_eq!(merged.appearance, "dark");
        // History comes back from the held record, not from the patch.
        assert_eq!(merged.recent_files, vec!["/a.md".to_string()]);
        assert_eq!(merged.recent_entries.len(), 1);
        let history = serde_json::json!({"recentFiles": [], "lastFolder": "/other"})
            .as_object()
            .unwrap()
            .clone();
        let merged = merge_patch(&current, history).unwrap();
        assert_eq!(merged.recent_files, vec!["/a.md".to_string()]);
        assert_eq!(merged.last_folder, None);
    }
    #[test]
    fn migration_and_secret_boundary() {
        let settings =
            migrate(serde_json::json!({"schemaVersion":1,"editor":{"fontSize":22}})).unwrap();
        assert_eq!(settings.font_size, 22);
        assert_eq!(settings.schema_version, 6);
        assert!(migrate(serde_json::json!({"schemaVersion":99})).is_err());
        assert!(migrate(serde_json::json!({"schemaVersion":2,"apiKey":"secret"})).is_err());
    }
}
