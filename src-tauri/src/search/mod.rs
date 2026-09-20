use crate::error::{error, AppResult};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};
use tokio::io::{AsyncBufReadExt, BufReader};
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub text: String,
    pub regex: bool,
    #[serde(default)]
    pub limit: Option<usize>,
    pub case_sensitive: bool,
    pub whole_word: bool,
    pub hidden: bool,
    pub include: String,
    pub exclude: String,
}
#[derive(Clone, Serialize)]
pub struct SearchResult {
    pub path: String,
    pub line: u64,
    pub column: u64,
    pub text: String,
}
pub fn sidecar(name: &str) -> AppResult<PathBuf> {
    let ext = if cfg!(windows) { ".exe" } else { "" };
    let executable = std::env::current_exe()?;
    let packaged = executable
        .parent()
        .ok_or_else(|| error("应用目录无效"))?
        .join(format!("{name}{ext}"));
    if packaged.is_file() {
        return Ok(packaged);
    }
    let target = if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(windows) {
        "x86_64-pc-windows-msvc"
    } else {
        return Err(error("不支持当前 sidecar 架构"));
    };
    let development = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(format!("{name}-{target}{ext}"));
    if development.is_file() {
        Ok(development)
    } else {
        Err(error(format!("缺少 {name}，请运行 pnpm sidecars")))
    }
}
pub fn parse(line: &str) -> Option<SearchResult> {
    let value: serde_json::Value = serde_json::from_str(line).ok()?;
    if value["type"] != "match" {
        return None;
    }
    let data = &value["data"];
    Some(SearchResult {
        path: data["path"]["text"].as_str()?.into(),
        line: data["line_number"].as_u64()?,
        column: data["submatches"][0]["start"].as_u64()? + 1,
        text: data["lines"]["text"].as_str()?.trim_end().into(),
    })
}
pub async fn search(
    root: PathBuf,
    query: SearchQuery,
    sequence: Arc<AtomicU64>,
) -> AppResult<Vec<SearchResult>> {
    let id = sequence.fetch_add(1, Ordering::SeqCst) + 1;
    if query.text.is_empty() {
        return Ok(vec![]);
    }
    let limit = query.limit.unwrap_or(70).clamp(1, 1000);
    let mut command = tokio::process::Command::new(sidecar("rg")?);
    command.args(["--json", "--max-filesize", "2M"]);
    if !query.regex {
        command.arg("--fixed-strings");
    }
    if !query.case_sensitive {
        command.arg("--ignore-case");
    }
    if query.whole_word {
        command.arg("--word-regexp");
    }
    if query.hidden {
        command.arg("--hidden");
    }
    if !query.include.is_empty() {
        command.arg("--glob").arg(query.include);
    }
    if !query.exclude.is_empty() {
        command.arg("--glob").arg(format!("!{}", query.exclude));
    }
    command
        .arg("--")
        .arg(query.text)
        .arg(root)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    let mut child = command.spawn()?;
    let mut lines = BufReader::new(
        child
            .stdout
            .take()
            .ok_or_else(|| error("无法读取搜索输出"))?,
    )
    .lines();
    let mut results = Vec::new();
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(20);
    loop {
        if sequence.load(Ordering::SeqCst) != id {
            let _ = child.kill().await;
            return Ok(vec![]);
        }
        tokio::select! {
            line=lines.next_line()=>{match line?{Some(line)=>{if let Some(result)=parse(&line){results.push(result);if results.len()>=limit{let _=child.kill().await;return Ok(results)}}},None=>break}},
            _=tokio::time::sleep_until(deadline)=>{let _=child.kill().await;return Err(error("搜索超时，请缩小范围"))},
            _=tokio::time::sleep(std::time::Duration::from_millis(100))=>{}
        }
    }
    let status = child.wait().await?;
    if status.code().unwrap_or(2) > 1 {
        return Err(error("搜索失败，请检查正则表达式或目录权限"));
    }
    Ok(results)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn caps_content_search_at_seventy_lines_in_one_file() {
        let dir = std::env::temp_dir().join(format!(
            "y-search-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("fixture.txt"), "needle\n".repeat(100)).unwrap();
        let hits = search(
            dir.clone(),
            SearchQuery {
                text: "needle".into(),
                regex: false,
                limit: None,
                case_sensitive: false,
                whole_word: false,
                hidden: false,
                include: String::new(),
                exclude: String::new(),
            },
            Arc::new(AtomicU64::new(0)),
        )
        .await;
        std::fs::remove_dir_all(dir).unwrap();
        let hits = hits.unwrap();
        assert_eq!(hits.len(), 70);
        assert_eq!(hits[69].line, 70);
    }
    #[test]
    fn parses_utf8_match() {
        let hit=parse(r#"{"type":"match","data":{"path":{"text":"/a.md"},"line_number":3,"lines":{"text":"你好 test\n"},"submatches":[{"start":7}]}}"#).unwrap();
        assert_eq!(hit.line, 3);
        assert_eq!(hit.column, 8);
        assert!(parse("invalid").is_none());
    }
}
