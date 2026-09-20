use crate::error::{error, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{path::Path, process::Stdio};
use tokio::io::{AsyncWriteExt, BufReader};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Server {
    pub id: String,
    pub name: String,
    pub transport: String,
    pub command: String,
    pub args: Vec<String>,
    pub url: String,
    pub cwd: String,
    pub enabled: bool,
}
pub fn load(dir: &Path) -> AppResult<Vec<Server>> {
    Ok(crate::database::get(dir, "mcp")?.unwrap_or_default())
}
#[tauri::command]
pub fn mcp_list(state: crate::windows::WindowState) -> AppResult<Vec<Server>> {
    load(&state.directory)
}
#[tauri::command]
pub async fn mcp_save(
    app: crate::windows::WindowApp,
    server: Server,
    remove: bool,
) -> AppResult<()> {
    if server.id.is_empty() || server.name.is_empty() {
        return Err(error("MCP 名称不能为空"));
    }
    if !["stdio", "http"].contains(&server.transport.as_str()) {
        return Err(error("MCP transport 不支持"));
    }
    let state = app.context();
    {
        let _lock = state
            .resource_lock
            .lock()
            .map_err(|_| error("资源锁错误"))?;
        let mut items = load(&state.directory)?;
        items.retain(|s| s.id != server.id);
        if !remove {
            let directory = state.directory.join("res/mcp");
            std::fs::create_dir_all(&directory)?;
            let filename = crate::workspace::hash(server.id.as_bytes());
            crate::workspace::atomic_write(
                &directory.join(format!("{filename}.json")),
                &serde_json::to_vec_pretty(&server)?,
            )?;
            items.push(server)
        }
        crate::database::put(&state.directory, "mcp", &items)?;
    }
    state.ai.lock().await.stop().await;
    Ok(())
}
fn rpc(id: u64, method: &str, params: Value) -> Value {
    json!({"jsonrpc":"2.0","id":id,"method":method,"params":params})
}
fn initialization() -> Value {
    rpc(
        1,
        "initialize",
        json!({"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"y-editor","version":"0.1.0"}}),
    )
}
async fn stdio(server: &Server, method: &str, params: Value) -> AppResult<Value> {
    if server.command.is_empty() {
        return Err(error("MCP command 为空"));
    }
    let mut command = tokio::process::Command::new(&server.command);
    command.args(&server.args).env_clear();
    for name in ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "TEMP", "TMP"] {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    if !server.cwd.is_empty() {
        command.current_dir(&server.cwd);
    }
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| error("MCP stdin 不可用"))?;
    let mut stdout = BufReader::new(
        child
            .stdout
            .take()
            .ok_or_else(|| error("MCP stdout 不可用"))?,
    );
    async fn send(stdin: &mut tokio::process::ChildStdin, value: &Value) -> AppResult<()> {
        stdin
            .write_all(format!("{}\n", serde_json::to_string(value)?).as_bytes())
            .await?;
        stdin.flush().await?;
        Ok(())
    }
    send(&mut stdin, &initialization()).await?;
    let mut initialized = false;
    let result = loop {
        let line = crate::ipc::read_line(&mut stdout, 8_000_000)
            .await?
            .ok_or_else(|| error("MCP 进程提前退出"))?;
        if line.len() > 8_000_000 {
            return Err(error("MCP 响应过大"));
        }
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if value["id"] == 1 && !initialized {
            if value.get("error").is_some() {
                break Err(error(value["error"].to_string()));
            }
            initialized = true;
            send(
                &mut stdin,
                &json!({"jsonrpc":"2.0","method":"notifications/initialized"}),
            )
            .await?;
            send(&mut stdin, &rpc(2, method, params.clone())).await?;
        } else if value["id"] == 2 {
            break if value.get("error").is_some() {
                Err(error(value["error"].to_string()))
            } else {
                Ok(value["result"].clone())
            };
        }
    };
    let _ = child.kill().await;
    let _ = child.wait().await;
    result
}
async fn http(server: &Server, method: &str, params: Value) -> AppResult<Value> {
    let url = reqwest::Url::parse(&server.url).map_err(|_| error("MCP URL 无效"))?;
    if url.scheme() != "https"
        && !(url.scheme() == "http"
            && [Some("localhost"), Some("127.0.0.1"), Some("::1")].contains(&url.host_str()))
    {
        return Err(error("远程 MCP 必须使用 HTTPS"));
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| error(e.to_string()))?;
    let initial = client
        .post(url.clone())
        .header("Accept", "application/json, text/event-stream")
        .json(&initialization())
        .send()
        .await
        .map_err(|e| error(e.to_string()))?
        .error_for_status()
        .map_err(|e| error(e.to_string()))?;
    let session = initial.headers().get("mcp-session-id").cloned();
    let initialized = read_response(initial, 1).await?;
    if initialized.get("error").is_some() {
        return Err(error(initialized["error"].to_string()));
    }
    let request = |value: &Value| {
        let mut req = client
            .post(url.clone())
            .header("Accept", "application/json, text/event-stream")
            .header("MCP-Protocol-Version", "2025-03-26")
            .json(value);
        if let Some(session) = &session {
            req = req.header("Mcp-Session-Id", session);
        }
        req
    };
    let _ = request(&json!({"jsonrpc":"2.0","method":"notifications/initialized"}))
        .send()
        .await
        .map_err(|e| error(e.to_string()))?;
    let response = request(&rpc(2, method, params))
        .send()
        .await
        .map_err(|e| error(e.to_string()))?
        .error_for_status()
        .map_err(|e| error(e.to_string()))?;
    let value = read_response(response, 2).await?;
    if value.get("error").is_some() {
        return Err(error(value["error"].to_string()));
    }
    Ok(value["result"].clone())
}
pub async fn request(dir: &Path, id: &str, method: &str, params: Value) -> AppResult<Value> {
    scoped_request(dir, id, method, params, None).await
}
pub async fn scoped_request(
    dir: &Path,
    id: &str,
    method: &str,
    params: Value,
    workspace: Option<&str>,
) -> AppResult<Value> {
    let flags = workspace
        .map(|w| crate::resources::workspace_flags(dir, w))
        .transpose()?;
    let server = load(dir)?
        .into_iter()
        .find(|s| {
            s.id == id
                && flags
                    .as_ref()
                    .map(|f| f.get(&format!("mcp:{}", s.id)).copied().unwrap_or(false))
                    .unwrap_or(s.enabled)
        })
        .ok_or_else(|| error("MCP 未启用"))?;
    let result = tokio::time::timeout(std::time::Duration::from_secs(35), async {
        if server.transport == "stdio" {
            stdio(&server, method, params).await
        } else {
            http(&server, method, params).await
        }
    })
    .await
    .map_err(|_| error("MCP 请求超时"))?;
    result
}
#[tauri::command]
pub async fn mcp_tools(state: crate::windows::WindowState, id: String) -> AppResult<Value> {
    request(&state.directory, &id, "tools/list", json!({})).await
}
#[tauri::command]
pub async fn mcp_call(
    state: crate::windows::WindowState,
    id: String,
    tool: String,
    arguments: Value,
) -> AppResult<Value> {
    request(
        &state.directory,
        &id,
        "tools/call",
        json!({"name":tool,"arguments":arguments}),
    )
    .await
}

async fn read_response(mut response: reqwest::Response, id: u64) -> AppResult<Value> {
    let streaming = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("text/event-stream"));
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| error(e.to_string()))? {
        bytes.extend_from_slice(&chunk);
        if bytes.len() > 8_000_000 {
            return Err(error("MCP 响应过大"));
        }
        if streaming {
            let text = String::from_utf8_lossy(&bytes);
            for block in text.split("\n\n").chain(text.split("\r\n\r\n")) {
                let data = block
                    .lines()
                    .filter_map(|l| l.strip_prefix("data:").map(str::trim_start))
                    .collect::<Vec<_>>()
                    .join("\n");
                if let Ok(value) = serde_json::from_str::<Value>(&data) {
                    if value["id"] == id {
                        return Ok(value);
                    }
                }
            }
        }
    }
    let value: Value = serde_json::from_slice(&bytes)?;
    if value["id"] != id {
        return Err(error("MCP 响应 ID 不匹配"));
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn server(transport: &str) -> Server {
        Server {
            id: "fixture".into(),
            name: "Fixture".into(),
            transport: transport.into(),
            command: String::new(),
            args: vec![],
            url: String::new(),
            cwd: String::new(),
            enabled: true,
        }
    }
    #[tokio::test]
    async fn stdio_negotiates_and_calls_tool() {
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("server.cjs");
        std::fs::write(&script,r#"require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(!r.id)return;const result=r.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}:{content:[{type:'text',text:r.params.arguments.text}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\n');});"#).unwrap();
        let mut config = server("stdio");
        config.command = "node".into();
        config.args = vec![script.to_string_lossy().into_owned()];
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            stdio(
                &config,
                "tools/call",
                json!({"name":"echo","arguments":{"text":"round trip"}}),
            ),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(result["content"][0]["text"], "round trip");
    }
    #[tokio::test]
    async fn http_supports_sse_and_session_headers() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = std::thread::spawn(move || {
            for index in 0..3 {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                    .unwrap();
                let mut bytes = vec![];
                let mut buffer = [0; 1024];
                loop {
                    let size = socket.read(&mut buffer).unwrap();
                    assert_ne!(size, 0);
                    bytes.extend_from_slice(&buffer[..size]);
                    let text = String::from_utf8_lossy(&bytes);
                    if let Some(end) = text.find("\r\n\r\n") {
                        let length = text[..end]
                            .lines()
                            .find_map(|line| {
                                line.to_lowercase()
                                    .strip_prefix("content-length:")
                                    .map(|s| s.trim().parse::<usize>().unwrap())
                            })
                            .unwrap_or(0);
                        if bytes.len() >= end + 4 + length {
                            break;
                        }
                    }
                }
                let text = String::from_utf8_lossy(&bytes);
                if index > 0 {
                    assert!(text.to_lowercase().contains("mcp-session-id: fixture"));
                }
                let body=match index{0=>"data: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"protocolVersion\":\"2025-03-26\",\"capabilities\":{}}}\n\n",1=>"",_=>"data: {\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"tools\":[{\"name\":\"echo\"}]}}\n\n"};
                write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nMcp-Session-Id: fixture\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
            }
        });
        let mut config = server("http");
        config.url = format!("http://{address}/mcp");
        let result = http(&config, "tools/list", json!({})).await.unwrap();
        assert_eq!(result["tools"][0]["name"], "echo");
        worker.join().unwrap();
    }
    #[tokio::test]
    async fn disabled_server_never_runs() {
        let dir = tempfile::tempdir().unwrap();
        let mut config = server("stdio");
        config.enabled = false;
        crate::database::put(dir.path(), "mcp", &vec![config]).unwrap();
        assert!(request(dir.path(), "fixture", "tools/list", json!({}))
            .await
            .is_err());
    }
}
