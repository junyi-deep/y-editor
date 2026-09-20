use crate::error::{error, AppResult};
use serde::{Deserialize, Serialize};
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub workspace: String,
    pub updated_at: u64,
    pub messages: Vec<Message>,
    pub patches: Vec<Patch>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Message {
    pub role: String,
    pub text: String,
    #[serde(default)]
    pub reasoning: String,
    #[serde(default)]
    pub images: Vec<serde_json::Value>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Patch {
    pub id: u64,
    pub path: String,
    pub original: String,
    pub proposed: String,
    pub reason: String,
    pub status: String,
}
fn valid(id: &str) -> AppResult<()> {
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err(error("无效会话 ID"));
    }
    Ok(())
}
#[tauri::command]
pub fn ai_history_save(
    state: crate::windows::WindowState,
    mut conversation: Conversation,
) -> AppResult<()> {
    valid(&conversation.id)?;
    if let Some(existing) = crate::database::get::<Conversation>(
        &state.directory,
        &format!("conversation:{}", conversation.id),
    )? {
        if existing.workspace != conversation.workspace {
            return Err(error("请派生会话后再保存到其他工作空间"));
        }
    }
    if conversation
        .messages
        .iter()
        .any(|m| !["user", "assistant"].contains(&m.role.as_str()))
    {
        return Err(error("无效消息角色"));
    }
    let bytes = serde_json::to_vec(&conversation)?;
    if bytes.len() > 120_000_000 {
        return Err(error("会话超过 120 MB 存储上限"));
    }
    for message in &mut conversation.messages {
        if message.images.len() > 8 {
            return Err(error("单条消息最多 8 张图片"));
        }
        for image in &mut message.images {
            use base64::Engine;
            let mime = image["mimeType"].as_str().unwrap_or_default().to_owned();
            if !["image/png", "image/jpeg", "image/webp", "image/gif"].contains(&mime.as_str()) {
                return Err(error("图片格式不支持"));
            }
            let data = image["data"]
                .as_str()
                .ok_or_else(|| error("图片数据缺失"))?;
            if data.len() > 14_000_000 {
                return Err(error("图片过大"));
            }
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(data)
                .map_err(|_| error("图片数据无效"))?;
            let id = crate::workspace::hash(&bytes);
            let dir = state.directory.join("res/chat-images");
            std::fs::create_dir_all(&dir)?;
            let path = dir.join(&id);
            if !path.exists() {
                crate::workspace::atomic_write(&path, &bytes)?;
            }
            *image = serde_json::json!({"type":"image","imageId":id,"mimeType":mime});
        }
    }
    crate::database::put(
        &state.directory,
        &format!("conversation:{}", conversation.id),
        &conversation,
    )
}
#[tauri::command]
pub fn ai_history_list(state: crate::windows::WindowState) -> AppResult<Vec<serde_json::Value>> {
    let conversations: Vec<Conversation> =
        crate::database::list(&state.directory, "conversation:")?;
    let mut items: Vec<_> = conversations.into_iter().map(|c| serde_json::json!({"id":c.id,"title":c.title,"updatedAt":c.updated_at,"workspace":c.workspace})).collect();
    items.sort_by_key(|v| std::cmp::Reverse(v["updatedAt"].as_u64().unwrap_or_default()));
    Ok(items)
}
#[tauri::command]
pub fn ai_history_load(state: crate::windows::WindowState, id: String) -> AppResult<Conversation> {
    valid(&id)?;
    let mut conversation: Conversation =
        crate::database::get(&state.directory, &format!("conversation:{id}"))?
            .ok_or_else(|| error("会话不存在"))?;
    for message in &mut conversation.messages {
        for image in &mut message.images {
            use base64::Engine;
            if let Some(id) = image["imageId"].as_str() {
                if id.len() != 64 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
                    return Err(error("图片引用无效"));
                }
                let bytes = std::fs::read(state.directory.join("res/chat-images").join(id))?;
                *image = serde_json::json!({"type":"image","mimeType":image["mimeType"],"data":base64::engine::general_purpose::STANDARD.encode(bytes)});
            }
        }
    }
    Ok(conversation)
}
#[tauri::command]
pub fn ai_history_delete(state: crate::windows::WindowState, id: String) -> AppResult<()> {
    valid(&id)?;
    crate::database::remove(&state.directory, &format!("conversation:{id}"))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ids_cannot_escape_storage() {
        for id in ["../secret", "/a", "a/b", "a\\b", ""] {
            assert!(valid(id).is_err());
        }
        assert!(valid("00ab-cd34").is_ok());
    }
}
