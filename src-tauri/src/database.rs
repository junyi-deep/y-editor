//! SQLite is the sole durable metadata store. JSON is only a SQL value encoding.
use crate::error::AppResult;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Serialize};
use std::path::Path;
fn connect(dir: &Path) -> AppResult<Connection> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join("data.db");
    #[cfg(unix)]
    {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .mode(0o600)
            .open(&path)?;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    }
    let db = Connection::open(path)?;
    db.busy_timeout(std::time::Duration::from_secs(5))?;
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version=1;")?;
    Ok(db)
}
pub fn get<T: DeserializeOwned>(dir: &Path, key: &str) -> AppResult<Option<T>> {
    let value: Option<String> = connect(dir)?
        .query_row("SELECT value FROM records WHERE key=?1", [key], |r| {
            r.get(0)
        })
        .optional()?;
    value
        .map(|s| serde_json::from_str(&s).map_err(Into::into))
        .transpose()
}
pub fn put<T: Serialize + ?Sized>(dir: &Path, key: &str, value: &T) -> AppResult<()> {
    connect(dir)?.execute("INSERT INTO records(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, serde_json::to_string(value)?])?;
    Ok(())
}
pub fn remove(dir: &Path, key: &str) -> AppResult<()> {
    connect(dir)?.execute("DELETE FROM records WHERE key=?1", [key])?;
    Ok(())
}
pub fn list<T: DeserializeOwned>(dir: &Path, prefix: &str) -> AppResult<Vec<T>> {
    let db = connect(dir)?;
    let mut statement =
        db.prepare("SELECT value FROM records WHERE substr(key,1,length(?1))=?1 ORDER BY key")?;
    let rows = statement.query_map([prefix], |r| r.get::<_, String>(0))?;
    rows.map(|r| Ok(serde_json::from_str(&r?)?)).collect()
}
pub fn keys(dir: &Path, prefix: &str) -> AppResult<Vec<String>> {
    let db = connect(dir)?;
    let mut statement =
        db.prepare("SELECT key FROM records WHERE substr(key,1,length(?1))=?1 ORDER BY key")?;
    let rows = statement.query_map([prefix], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn isolated_records_roundtrip_and_delete() {
        let dir = tempfile::tempdir().unwrap();
        put(dir.path(), "session:a", &vec!["中文", "hello"]).unwrap();
        put(dir.path(), "secret:provider:x", &"private").unwrap();
        assert_eq!(
            list::<Vec<String>>(dir.path(), "session:").unwrap().len(),
            1
        );
        put(dir.path(), "session:a", &vec!["updated"]).unwrap();
        assert_eq!(
            get::<Vec<String>>(dir.path(), "session:a")
                .unwrap()
                .unwrap(),
            ["updated"]
        );
        remove(dir.path(), "session:a").unwrap();
        assert!(get::<Vec<String>>(dir.path(), "session:a")
            .unwrap()
            .is_none());
        assert!(dir.path().join("data.db").exists());
        assert!(!dir.path().join("settings.json").exists());
    }
}
