use crate::error::{error, AppResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
};

pub fn hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
pub fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let parent = path.parent().ok_or_else(|| error("文件路径缺少父目录"))?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    if let Ok(metadata) = fs::metadata(path) {
        temp.as_file().set_permissions(metadata.permissions())?;
    }
    temp.write_all(bytes)?;
    temp.as_file().sync_all()?;
    temp.persist(path).map_err(|e| error(e.error.to_string()))?;
    #[cfg(unix)]
    fs::File::open(parent)?.sync_all()?;
    Ok(())
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub path: String,
    pub content: String,
    pub disk_hash: String,
    pub line_ending: String,
    pub bom: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub name: String,
    pub relative: String,
    pub directory: bool,
}
#[derive(Default)]
pub struct Workspace {
    pub root: Option<PathBuf>,
    pub files: HashSet<PathBuf>,
}
impl Workspace {
    pub fn set_root(&mut self, path: &Path) -> AppResult<String> {
        let path = fs::canonicalize(path)?;
        if !path.is_dir() {
            return Err(error("不是文件夹"));
        }
        self.root = Some(path.clone());
        Ok(path.to_string_lossy().into_owned())
    }
    pub fn grant(&mut self, path: &Path) -> AppResult<PathBuf> {
        let path = fs::canonicalize(path)?;
        self.files.insert(path.clone());
        Ok(path)
    }
    pub fn authorize(&self, path: &Path) -> AppResult<PathBuf> {
        let canonical = fs::canonicalize(path)?;
        if self.files.contains(&canonical)
            || self
                .root
                .as_ref()
                .is_some_and(|root| canonical.starts_with(root))
        {
            Ok(canonical)
        } else {
            Err(error("路径超出已授权工作目录"))
        }
    }
    pub fn destination(&self, path: &Path) -> AppResult<PathBuf> {
        if path.exists() {
            return self.authorize(path);
        }
        let parent = fs::canonicalize(path.parent().ok_or_else(|| error("路径无效"))?)?;
        if !self
            .root
            .as_ref()
            .is_some_and(|root| parent.starts_with(root))
        {
            return Err(error("目标路径超出工作目录"));
        }
        let name = path.file_name().ok_or_else(|| error("文件名无效"))?;
        Ok(parent.join(name))
    }
    pub fn read(&self, path: &Path) -> AppResult<Document> {
        let path = self.authorize(path)?;
        if fs::metadata(&path)?.len() > 25 * 1024 * 1024 {
            return Err(error("文件超过 25 MB，无法安全载入当前编辑器"));
        }
        let bytes = fs::read(&path)?;
        let bom = bytes.starts_with(&[239, 187, 191]);
        let content = String::from_utf8(bytes[if bom { 3 } else { 0 }..].to_vec())
            .map_err(|_| error("目前只支持 UTF-8 文本，请转换编码后重试"))?;
        let line_ending = if content.contains("\r\n") {
            "CRLF"
        } else {
            "LF"
        }
        .to_string();
        Ok(Document {
            path: path.to_string_lossy().into_owned(),
            content: content.replace("\r\n", "\n"),
            disk_hash: hash(&bytes),
            line_ending,
            bom,
        })
    }
    pub fn save(&self, doc: &Document, expected: &str) -> AppResult<Document> {
        let path = self.authorize(Path::new(&doc.path))?;
        if hash(&fs::read(&path)?) != expected {
            return Err(error("CONFLICT: 文件已被外部程序修改，请先比较或重新载入"));
        }
        let normalized = doc.content.replace("\r\n", "\n");
        let text = if doc.line_ending == "CRLF" {
            normalized.replace('\n', "\r\n")
        } else {
            normalized
        };
        let mut bytes = if doc.bom { vec![239, 187, 191] } else { vec![] };
        bytes.extend_from_slice(text.as_bytes());
        atomic_write(&path, &bytes)?;
        self.read(&path)
    }
    pub fn entries(&self, hidden: bool, all_files: bool) -> AppResult<Vec<Entry>> {
        let root = self.root.as_ref().ok_or_else(|| error("请先打开文件夹"))?;
        let mut result = Vec::new();
        for entry in ignore::WalkBuilder::new(root)
            .hidden(!hidden)
            .follow_links(false)
            .max_depth(Some(64))
            .build()
        {
            let Ok(entry) = entry else { continue };
            if entry.path() == root || entry.file_type().is_some_and(|t| t.is_symlink()) {
                continue;
            }
            let directory = entry.file_type().is_some_and(|t| t.is_dir());
            if !directory && !all_files && !is_markdown(entry.path()) {
                continue;
            }
            result.push(Entry {
                path: entry.path().to_string_lossy().into_owned(),
                name: entry.file_name().to_string_lossy().into_owned(),
                relative: entry
                    .path()
                    .strip_prefix(root)
                    .map_err(|e| error(e.to_string()))?
                    .to_string_lossy()
                    .replace('\\', "/"),
                directory,
            });
            if result.len() >= 100_000 {
                break;
            }
        }
        result.sort_by(|a, b| {
            b.directory
                .cmp(&a.directory)
                .then(a.relative.to_lowercase().cmp(&b.relative.to_lowercase()))
        });
        Ok(result)
    }
    pub fn mutate(&mut self, operation: &str, path: &Path, target: Option<&Path>) -> AppResult<()> {
        match operation {
            "newFile" | "newFolder" => {
                let destination = self.destination(path)?;
                if destination.exists() {
                    return Err(error("目标已存在"));
                }
                if operation == "newFolder" {
                    fs::create_dir(destination)?;
                } else {
                    fs::OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(&destination)?;
                    self.files.insert(destination);
                }
            }
            "rename" | "duplicate" => {
                let source = self.authorize(path)?;
                if self.root.as_ref() == Some(&source) {
                    return Err(error("不能移动工作目录本身"));
                }
                let target = self.destination(target.ok_or_else(|| error("缺少目标路径"))?)?;
                if target.exists() {
                    return Err(error("目标已存在"));
                }
                if operation == "rename" {
                    fs::rename(source, target)?;
                } else {
                    let mut output = fs::OpenOptions::new()
                        .create_new(true)
                        .write(true)
                        .open(target)?;
                    let mut input = fs::File::open(source)?;
                    std::io::copy(&mut input, &mut output)?;
                    output.sync_all()?;
                }
            }
            "trash" => {
                let path = self.authorize(path)?;
                if self.root.as_ref() == Some(&path) {
                    return Err(error("不能删除工作目录本身"));
                }
                trash::delete(path).map_err(|e| error(e.to_string()))?;
            }
            _ => return Err(error("未知文件操作")),
        }
        Ok(())
    }
}
pub fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .is_some_and(|ext| {
            ["md", "markdown", "mdown", "txt"].contains(&ext.to_lowercase().as_str())
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn atomic_save_preserves_format_and_rejects_stale_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.md");
        fs::write(&path, b"\xef\xbb\xbf# A\r\n").unwrap();
        let mut ws = Workspace::default();
        ws.set_root(dir.path()).unwrap();
        let mut doc = ws.read(&path).unwrap();
        let base = doc.disk_hash.clone();
        doc.content = "# B\n".into();
        ws.save(&doc, &base).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"\xef\xbb\xbf# B\r\n");
        assert!(ws.save(&doc, &base).is_err());
    }
    #[test]
    fn rejects_parent_traversal_and_symlink_escape() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("private.md"), "secret").unwrap();
        let mut ws = Workspace::default();
        ws.set_root(root.path()).unwrap();
        assert!(ws.read(&outside.path().join("private.md")).is_err());
        assert!(ws.destination(&root.path().join("../escape.md")).is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(outside.path(), root.path().join("link")).unwrap();
            assert!(ws.read(&root.path().join("link/private.md")).is_err());
            assert!(ws.destination(&root.path().join("link/new.md")).is_err());
        }
    }
}
