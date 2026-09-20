use tokio::io::{AsyncBufRead, AsyncBufReadExt};
pub async fn read_line<R: AsyncBufRead + Unpin>(
    reader: &mut R,
    limit: usize,
) -> std::io::Result<Option<String>> {
    let mut bytes = Vec::new();
    loop {
        let buffer = reader.fill_buf().await?;
        if buffer.is_empty() {
            if bytes.is_empty() {
                return Ok(None);
            }
            break;
        }
        let end = buffer.iter().position(|b| *b == b'\n');
        let count = end.map_or(buffer.len(), |i| i + 1);
        if bytes.len() + count > limit {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "IPC line exceeded size limit",
            ));
        }
        bytes.extend_from_slice(&buffer[..count]);
        reader.consume(count);
        if end.is_some() {
            break;
        }
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn rejects_unterminated_oversized_frame() {
        let data = b"abcdefghij";
        let mut reader = tokio::io::BufReader::new(&data[..]);
        assert!(read_line(&mut reader, 5).await.is_err());
    }
    #[tokio::test]
    async fn handles_split_utf8_and_eof() {
        let data = "中文\nnext".as_bytes();
        let mut reader = tokio::io::BufReader::with_capacity(1, data);
        assert_eq!(
            read_line(&mut reader, 20).await.unwrap(),
            Some("中文\n".into())
        );
        assert_eq!(
            read_line(&mut reader, 20).await.unwrap(),
            Some("next".into())
        );
        assert!(read_line(&mut reader, 20).await.unwrap().is_none());
    }
}
